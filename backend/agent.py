"""
NeuroBuilds AI Backend — LangGraph Multi-Agent Hardware Advisor

Deterministic / Probabilistic Architecture
==========================================
Every node in the pipeline belongs to exactly one layer:

  Layer A (LLM)  — intent_node             : extract semantic BuildIntent from natural language
  Layer B (code) — budget_allocation_node  : deterministic budget math + DB component selection
  Layer C (code) — compatibility_node      : 7-tier hardware validation via validation_engine
  Layer D (LLM)  — response_node           : translate structured findings into prose (narration only)

The LLM is NEVER the source of truth for:
  • Hardware compatibility rules     → validation_engine owns those lookup tables
  • Component selection              → budget_allocation_node queries MongoDB directly
  • Price arithmetic / budget checks → selection_engine owns all arithmetic
  • Bottleneck % / tier rankings     → static tables inside validation_engine

Pipeline:
  START → search_node → rag_node → intent_node → budget_allocation_node
        → compatibility_node → [retry? → budget_allocation_node] → response_node → END

Retry loop (max 2 attempts):
  compatibility_node populates excluded_components with the names of parts that
  caused fatal issues, clears those slots from active_build, and sets compat_ok=False.
  _should_retry routes the state back to budget_allocation_node, which calls
  selection_engine.run_allocation() with the exclusion list so incompatible
  parts are never re-selected.
"""

import json
import logging
import os
import re
from typing import AsyncGenerator, Optional, TypedDict

import yaml

from dotenv import load_dotenv
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, START, StateGraph
from pymongo import MongoClient

from services.gemini_manager import gemini_manager as _gm
from services.selection_engine import AllocationResult, run_allocation
from services.validation_engine import ValidationResult, run_checks

load_dotenv()
logger = logging.getLogger(__name__)


# ─── Shared MongoClient singleton ────────────────────────────────────────────
# A module-level singleton avoids spawning a new connection pool on every
# pipeline invocation.  main.py's lifespan client is a separate instance;
# both are safe — this one serves CLI / test paths where no app state exists.

_mongo_client: Optional[MongoClient] = None


def _get_mongo_client() -> MongoClient:
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(
            os.environ["MONGODB_ATLAS_URI"],
            serverSelectionTimeoutMS=5_000,
        )
        logger.info("agent: module-level MongoClient initialised")
    return _mongo_client


# ─── State ────────────────────────────────────────────────────────────────────

class BuildIntent(TypedDict, total=False):
    """Structured user intent extracted by intent_node (Layer A — LLM)."""
    budget_usd:       Optional[int]
    use_case:         str   # gaming | workstation | budget | streaming | content_creation | general
    preferred_brands: list[str]
    perf_target:      str   # e.g. "1080p/144Hz", "video editing"
    form_factor_pref: str   # ATX | mATX | ITX | ""


class BuildState(TypedDict):
    messages:             list[dict]            # [{role, content}] from the frontend
    active_build:         dict                  # component map; filled by Layer B, read by Layer C/D
    search_context:       str                   # Tavily web search results
    rag_context:          str                   # MongoDB Atlas vector results
    build_intent:         BuildIntent           # structured intent from Layer A
    selection_report:     str                   # deterministic budget/price analysis (Layer B)
    compatibility_report: str                   # deterministic hardware validation (Layer C)
    compat_ok:            bool                  # False when compatibility_node finds fatal issues
    allocation_attempt:   int                   # retry counter (max 2)
    excluded_components:  dict[str, list[str]]  # slot → [component names to skip on retry]


# ─── Node 1 — Tavily Web Search ───────────────────────────────────────────────

async def search_node(state: BuildState) -> dict:
    """
    Searches the web for live hardware prices and availability using Tavily.
    Gracefully degrades to an informational fallback string on API failure.
    """
    last = _last_user_message(state["messages"])
    try:
        tool = TavilySearchResults(
            max_results=3,
            tavily_api_key=os.environ["TAVILY_API_KEY"],
        )
        results = await tool.ainvoke({"query": f"PC hardware specs prices {last}"})
        ctx = (
            "\n\n".join(
                f"[{r.get('url', 'unknown')}]\n{r.get('content', '')}"
                for r in results
            )
            if isinstance(results, list)
            else str(results)
        )
        logger.info("search_node: retrieved %d results", len(results) if isinstance(results, list) else 1)
    except Exception as exc:
        logger.warning("search_node: Tavily unavailable — %s", exc)
        ctx = "Web search unavailable — using training knowledge for price estimates."

    return {"search_context": ctx}


# ─── Node 2 — MongoDB Atlas RAG ───────────────────────────────────────────────

async def rag_node(state: BuildState) -> dict:
    """
    Semantic similarity search against MongoDB Atlas hardware_specs collection.
    Falls back gracefully when the collection is empty or Atlas is unreachable.
    """
    last = _last_user_message(state["messages"])
    try:
        try:
            from langchain_mongodb import MongoDBAtlasVectorSearch
        except ImportError:
            from langchain_community.vectorstores import MongoDBAtlasVectorSearch  # type: ignore

        client     = _get_mongo_client()
        collection = client[
            os.environ.get("MONGODB_DATABASE", "neurobuilds")
        ][
            os.environ.get("MONGODB_COLLECTION", "hardware_specs")
        ]
        from services.embeddings import GeminiEmbeddings
        embeddings = GeminiEmbeddings()
        store = MongoDBAtlasVectorSearch(
            collection=collection,
            embedding=embeddings,
            index_name=os.environ.get("MONGODB_VECTOR_INDEX", "vector_index"),
            text_key="content",
        )
        docs = store.similarity_search(last, k=4)
        ctx  = "\n\n".join(d.page_content for d in docs) if docs else ""
        logger.info("rag_node: retrieved %d documents", len(docs))
    except Exception as exc:
        logger.warning("rag_node: MongoDB unavailable — %s", exc)
        ctx = "Hardware database unavailable — using model knowledge for specifications."

    return {"rag_context": ctx}


# ─── Node 3 — Intent Extractor (Layer A — LLM) ───────────────────────────────
#
# Sole job: semantic parsing. Reads natural language and outputs a structured
# BuildIntent dict. Performs NO compatibility checks and NO arithmetic.

async def intent_node(state: BuildState) -> dict:
    """
    Extracts structured build parameters from the user query using a zero-
    temperature LLM call.  Output feeds the deterministic budget_allocation_node.
    The LLM result is parsed as YAML; on any parse failure the node returns
    safe defaults so the pipeline always has a valid BuildIntent.
    """
    last = _last_user_message(state["messages"])

    api_key = (
        await _gm.get_available_key()
        if _gm is not None
        else os.environ.get("GOOGLE_API_KEY", "")
    )
    llm = ChatGoogleGenerativeAI(
        model=os.environ.get("GEMINI_MODEL", "gemini-2.0-flash"),
        temperature=0,
        google_api_key=api_key,
    )

    search_snippet = (state.get("search_context") or "")[:600]

    _INTENT_SYSTEM = (
        "You are a data extraction parser. Output ONLY a YAML mapping — "
        "no prose, no markdown fences, no commentary.\n\n"
        "Schema (all fields required; use null or '' for unknown values):\n"
        "budget_usd: <integer or null>\n"
        "use_case: <gaming|workstation|budget|streaming|content_creation|general>\n"
        "preferred_brands: [<AMD|Intel|NVIDIA|Corsair|ASUS|MSI|Gigabyte|...>]\n"
        "perf_target: '<e.g. 1080p/144Hz, 4K/60Hz, video editing, 3D rendering, or empty>'\n"
        "form_factor_pref: '<ATX|mATX|ITX or empty>'"
    )

    intent: BuildIntent = {
        "budget_usd":       None,
        "use_case":         "general",
        "preferred_brands": [],
        "perf_target":      "",
        "form_factor_pref": "",
    }

    try:
        result = await llm.ainvoke([
            SystemMessage(content=_INTENT_SYSTEM),
            HumanMessage(content=f"User Query: {last}\n\nContext:\n{search_snippet}"),
        ])
        if _gm is not None:
            _gm.record_success(api_key)
        # Gemini via LangChain may return `content` as a str OR a list of parts.
        # Normalise to a single string before parsing so a list-shaped response
        # doesn't raise AttributeError and silently collapse to default intent.
        content = result.content
        if isinstance(content, str):
            raw = content.strip()
        elif isinstance(content, list):
            raw = "".join(
                part if isinstance(part, str) else str(part.get("text", part))
                for part in content
            ).strip()
        else:
            raw = str(content).strip()
        raw = re.sub(r"^```(?:yaml)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"\s*```\s*$",        "", raw, flags=re.MULTILINE)
        parsed = yaml.safe_load(raw)
        for key in ("budget_usd", "use_case", "preferred_brands", "perf_target", "form_factor_pref"):
            if key in parsed:
                intent[key] = parsed[key]  # type: ignore[literal-required]
        logger.info(
            "intent_node: use_case=%s budget=%s perf_target=%s",
            intent["use_case"], intent["budget_usd"], intent["perf_target"],
        )
    except Exception as exc:
        logger.warning("intent_node: extraction failed, using defaults — %s", exc)

    return {"build_intent": intent}


# ─── Node 4 — Budget Allocation Engine (Layer B) ─────────────────────────────
#
# Thin orchestration wrapper around services/selection_engine.run_allocation().
# All budget arithmetic and DB-backed selection logic lives in that module.
# The LLM never touches these numbers or selects component names.

def budget_allocation_node(state: BuildState) -> dict:
    """
    Calls selection_engine.run_allocation() to deterministically fill unfilled
    component slots from hardware_specs, then stores the resulting report for
    the response_node to cite verbatim.

    On retry (allocation_attempt > 0), the excluded_components dict (populated
    by compatibility_node on the previous pass) is forwarded to run_allocation()
    so incompatible parts are filtered from DB queries via a $nin clause.
    """
    intent   = state.get("build_intent") or {}
    build    = dict(state.get("active_build") or {})
    attempt  = state.get("allocation_attempt", 0)
    excluded = dict(state.get("excluded_components") or {})

    budget   = intent.get("budget_usd")
    use_case = intent.get("use_case") or "general"

    try:
        client = _get_mongo_client()
        collection = client[
            os.environ.get("MONGODB_DATABASE",  "neurobuilds")
        ][
            os.environ.get("MONGODB_COLLECTION", "hardware_specs")
        ]
    except Exception as exc:
        logger.warning("budget_allocation_node: cannot connect to MongoDB — %s", exc)
        collection = None

    if collection is not None:
        result: AllocationResult = run_allocation(
            budget=budget,
            use_case=use_case,
            build=build,
            collection=collection,
            attempt=attempt,
            excluded=excluded,
        )
        updated_build = result["build"]
        report        = result["report"]

        logger.info(
            "budget_allocation_node: attempt=%d slots_filled=%d",
            attempt,
            sum(1 for s in result["slot_log"] if s["selected"]),
        )
    else:
        # MongoDB unavailable — keep existing build, generate report from it
        from services.selection_engine import build_selection_report, ALLOCATION_WEIGHTS
        weights = ALLOCATION_WEIGHTS.get(use_case, ALLOCATION_WEIGHTS["general"])
        updated_build = build
        report = build_selection_report(build, budget or 0, use_case, weights)

    return {
        "active_build":       updated_build,
        "selection_report":   report,
        "allocation_attempt": attempt + 1,
    }


# ─── Node 5 — Compatibility Validator (Layer C) ──────────────────────────────
#
# Delegates all check logic to services/validation_engine.run_checks().
# On fatal failure, identifies which slots caused issues, records their current
# component names in excluded_components, and clears those slots so
# budget_allocation_node re-selects alternatives on the next retry.

def compatibility_node(state: BuildState) -> dict:
    """
    Runs the 9-tier deterministic compatibility matrix.

    When fatal issues are found (compat_ok=False):
      1. Each issue is mapped to the slot responsible via _ISSUE_SLOT_MAP.
      2. The current component name for that slot is appended to excluded_components.
      3. That slot is cleared from active_build so it will be re-queried.

    The conditional edge _should_retry then routes state back to
    budget_allocation_node (up to 2 times) with the updated exclusions.
    """
    build = state.get("active_build") or {}
    case  = build.get("case")   # optional — present only if user supplied case data

    result: ValidationResult = run_checks(build, case=case)

    # Build the narrative report for Layer D
    report_lines: list[str] = []
    if not result["issues"] and not result["warnings"] and not result["passed"]:
        report_lines.append(
            "No active build components to validate. "
            "Recommend components based on user requirements."
        )
    else:
        if result["issues"]:
            report_lines.append("⚠  COMPATIBILITY ISSUES:")
            report_lines.extend(f"   ✗  {i}" for i in result["issues"])
        if result["warnings"]:
            report_lines.append("⡇  ADVISORIES:")
            report_lines.extend(f"   △  {w}" for w in result["warnings"])
        if result["passed"]:
            report_lines.append("✓  CHECKS PASSED:")
            report_lines.extend(f"   ✓  {p}" for p in result["passed"])

    report = "\n".join(report_lines)

    # ── Populate exclusions from fatal issues ──────────────────────────────
    updated_build = dict(build)
    excluded      = dict(state.get("excluded_components") or {})

    if not result["ok"]:
        for issue in result["issues"]:
            slot = _identify_failing_slot(issue)
            if slot and updated_build.get(slot):
                name = (updated_build[slot] or {}).get("name", "")
                if name:
                    excluded.setdefault(slot, [])
                    if name not in excluded[slot]:
                        excluded[slot].append(name)
                        logger.info(
                            "compatibility_node: excluding '%s' from slot '%s' for retry",
                            name, slot,
                        )
                # Clear the slot so budget_allocation_node re-selects
                updated_build.pop(slot, None)

    logger.info(
        "compatibility_node: ok=%s issues=%d warnings=%d passed=%d attempt=%d",
        result["ok"], len(result["issues"]), len(result["warnings"]),
        len(result["passed"]), state.get("allocation_attempt", 0),
    )

    return {
        "compatibility_report": report,
        "compat_ok":            result["ok"],
        "excluded_components":  excluded,
        "active_build":         updated_build,
    }


# ─── Issue → slot mapping ─────────────────────────────────────────────────────
# Maps a fatal issue keyword (uppercase) to the slot that should be cleared and
# re-selected on the next retry pass.  The slot chosen is the one the allocator
# CAN substitute — we prefer to swap the board/RAM/PSU rather than the CPU/GPU
# since those are the primary user choices.

_ISSUE_SLOT_MAP: list[tuple[str, str]] = [
    ("SOCKET MISMATCH",        "motherboard"),
    ("FORM FACTOR MISMATCH",   "motherboard"),
    ("MEMORY MISMATCH",        "ram"),
    ("PSU TRANSIENT DEFICIT",  "psu"),
    ("GPU CLEARANCE FATAL",    "gpu"),
    ("COOLER CLEARANCE FATAL", "cpu"),
    ("UPGRADE PATH",           "motherboard"),  # very low upgrade-path score
]


def _identify_failing_slot(issue: str) -> Optional[str]:
    upper = issue.upper()
    for keyword, slot in _ISSUE_SLOT_MAP:
        if keyword in upper:
            return slot
    return None


# ─── Node 6 — LLM Response Synthesizer (Layer D) ─────────────────────────────
#
# Narration-only.  Receives pre-computed, structured findings from Layers B+C
# and formats them into readable prose.
# MUST NOT: suggest component names, perform hardware checks, or do price arithmetic.

async def response_node(state: BuildState) -> dict:
    """
    Narration-only Layer D.  The system prompt explicitly prohibits the LLM
    from performing hardware checks, price arithmetic, or suggesting alternative
    component names — those are owned by Layers B–C.
    """
    api_key = (
        await _gm.get_available_key()
        if _gm is not None
        else os.environ.get("GOOGLE_API_KEY", "")
    )
    llm = ChatGoogleGenerativeAI(
        model=os.environ.get("GEMINI_MODEL", "gemini-2.0-flash"),
        temperature=0.7,
        google_api_key=api_key,
    )

    lc_messages = [
        SystemMessage(content=_build_response_system_prompt()),
        AIMessage(content=_build_deterministic_context(state)),
    ]
    for msg in state["messages"]:
        role    = msg.get("role", "")
        content = msg.get("content", "")
        if role == "user":
            lc_messages.append(HumanMessage(content=content))
        elif role == "assistant" and content:
            lc_messages.append(AIMessage(content=content))

    result = await llm.ainvoke(lc_messages)
    if _gm is not None:
        _gm.record_success(api_key)
    return {"response": result.content}


# ─── Conditional edge router ──────────────────────────────────────────────────

def _should_retry(state: BuildState) -> str:
    """
    Route back to budget_allocation_node when:
      - compatibility_node found fatal issues (compat_ok=False)
      - retry budget has not been exhausted (< 2 attempts)
    Otherwise route to response_node.
    """
    compat_ok = state.get("compat_ok", True)
    attempt   = state.get("allocation_attempt", 0)

    if not compat_ok and attempt < 2:
        logger.info("_should_retry: compatibility failed — retry %d/2", attempt)
        return "retry"
    return "respond"


# ─── Graph assembly ───────────────────────────────────────────────────────────

def _build_graph():
    g = StateGraph(BuildState)

    g.add_node("search",            search_node)
    g.add_node("rag",               rag_node)
    g.add_node("intent",            intent_node)            # Layer A — LLM semantic extraction
    g.add_node("budget_allocation", budget_allocation_node) # Layer B — deterministic DB selection
    g.add_node("compatibility",     compatibility_node)     # Layer C — 9-tier validation
    g.add_node("response",          response_node)          # Layer D — LLM narration only

    g.add_edge(START,               "search")
    g.add_edge("search",            "rag")
    g.add_edge("rag",               "intent")
    g.add_edge("intent",            "budget_allocation")
    g.add_edge("budget_allocation", "compatibility")

    g.add_conditional_edges(
        "compatibility",
        _should_retry,
        {"retry": "budget_allocation", "respond": "response"},
    )

    g.add_edge("response", END)

    return g.compile()


_graph = _build_graph()


# ─── Public entry point ───────────────────────────────────────────────────────

async def run_pipeline(
    messages:     list[dict],
    active_build: dict,
) -> AsyncGenerator[str, None]:
    """
    Runs the full LangGraph pipeline and yields plain-text token chunks.
    No SSE framing — the frontend's liveStream() consumes raw bytes directly.
    """
    initial_state: BuildState = {
        "messages":             messages,
        "active_build":         active_build,
        "search_context":       "",
        "rag_context":          "",
        "build_intent": {
            "budget_usd":       None,
            "use_case":         "general",
            "preferred_brands": [],
            "perf_target":      "",
            "form_factor_pref": "",
        },
        "selection_report":     "",
        "compatibility_report": "",
        "compat_ok":            True,
        "allocation_attempt":   0,
        "excluded_components":  {},
    }

    async for event in _graph.astream_events(initial_state, version="v2"):
        if (
            event["event"] == "on_chat_model_stream"
            and event.get("metadata", {}).get("langgraph_node") == "response"
        ):
            chunk = event["data"].get("chunk")
            if chunk and hasattr(chunk, "content") and chunk.content:
                yield chunk.content


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _last_user_message(messages: list[dict]) -> str:
    for msg in reversed(messages):
        if msg.get("role") == "user":
            return msg.get("content", "")
    return ""


def _build_response_system_prompt() -> str:
    """Static persona + boundary contract for Layer D.  No runtime state needed."""
    return """\
You are Neuro, an expert AI hardware architect for the NeuroBuilds platform.
Your role in this pipeline is NARRATION ONLY (Layer D).

━━━ ARCHITECTURAL BOUNDARY — READ CAREFULLY ━━━
This system separates probabilistic AI reasoning from deterministic computation.
You are operating in Layer D — the narration layer.

WHAT YOU MUST DO:
  • Translate the pre-computed reports into clear, educational, conversational prose.
  • Explain WHY findings matter in plain English: trade-offs, real-world impact, context.
  • Use the BUDGET ANALYSIS and COMPATIBILITY ANALYSIS as your sole source of truth.
  • When citing numbers (prices, wattages, percentages, tier scores), quote verbatim.
  • Explain the components that were selected by the deterministic allocation engine.

WHAT YOU MUST NEVER DO:
  • Suggest or change specific component names or model numbers. All hardware was
    selected by the deterministic budget_allocation_node from the MongoDB database.
    Your job is to explain WHY those choices are good, not to pick alternatives.
  • Recalculate, re-derive, or approximate any figure already present in the reports.
  • Perform socket compatibility checks — the compatibility engine already did this.
  • Perform PSU power or budget arithmetic — the selection engine already did this.
  • Contradict or "correct" a figure from a deterministic report.
  • Guess at compatibility if the build is incomplete — say "more components needed".

━━━ OUTPUT FORMAT RULES ━━━
  • Describe the selected build in plain prose — explain the rationale for each
    component choice based on the budget allocation and compatibility reports.
  • Address any compatibility warnings or issues with practical advice.
  • If the allocation engine could not find components (empty slots), explain what
    budget range or category adjustments might help.
  • Keep prose concise and educational; avoid marketing language."""


def _build_deterministic_context(state: BuildState) -> str:
    """
    Assembles the Layer B+C deterministic reports into an AIMessage payload.

    Delivered as an AIMessage so the model treats these figures as already-spoken
    context it must cite verbatim, not as instructions it may reinterpret.
    """
    build_json   = json.dumps(state.get("active_build") or {}, indent=2)
    intent       = state.get("build_intent") or {}
    intent_lines = [
        f"  use_case        : {intent.get('use_case', 'general')}",
        f"  budget_usd      : {intent.get('budget_usd') or 'not specified'}",
        f"  perf_target     : {intent.get('perf_target') or 'not specified'}",
        f"  preferred_brands: {', '.join(intent.get('preferred_brands') or []) or 'none'}",
        f"  form_factor_pref: {intent.get('form_factor_pref') or 'no preference'}",
    ]

    attempt = state.get("allocation_attempt", 0)
    compat_status = (
        "ALL CHECKS PASSED" if state.get("compat_ok", True)
        else f"FATAL ISSUES DETECTED (after {attempt} allocation attempt(s))"
    )

    excluded = state.get("excluded_components") or {}
    excluded_summary = (
        "; ".join(f"{slot}: {names}" for slot, names in excluded.items() if names)
        or "none"
    )

    return f"""\
<deterministic_report>
━━━ USER INTENT (extracted by intent_node) ━━━
{chr(10).join(intent_lines)}

━━━ CURRENT BUILD STATE (selected by budget_allocation_node) ━━━
{build_json}

━━━ BUDGET ANALYSIS (computed by selection_engine — cite verbatim) ━━━
{state.get("selection_report") or "No budget data available — ask user for budget and component preferences."}

━━━ COMPATIBILITY ANALYSIS (computed by validation_engine — cite verbatim) ━━━
Status: {compat_status}
Excluded on retry: {excluded_summary}
{state.get("compatibility_report") or "No active build to analyse."}

━━━ LIVE MARKET DATA (Tavily web search — reference only, do not do arithmetic) ━━━
{state.get("search_context") or "No web search results available."}

━━━ HARDWARE DATABASE (MongoDB RAG — reference only) ━━━
{state.get("rag_context") or "No database results available."}
</deterministic_report>"""
