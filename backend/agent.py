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

import asyncio
import json
import logging
import os
import re
import time
from typing import AsyncGenerator, Optional, TypedDict

import yaml

from dotenv import load_dotenv
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field, field_validator
from pymongo import MongoClient

from services.selection_engine import AllocationResult, run_allocation
from services.validation_engine import (
    ValidationResult,
    required_ddr,
    required_socket,
    run_checks,
)

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
            connectTimeoutMS=5_000,
            # PyMongo's socketTimeoutMS defaults to None (no timeout). Without this,
            # a mid-query network stall (Atlas blip, dropped connection) hangs the
            # calling thread FOREVER instead of raising — wedging one thread of the
            # shared asyncio default executor at a time (the same pool backing
            # asyncio.to_thread and LangGraph's sync-node offload) until every
            # blocking Mongo call in the process stalls too. This is what causes the
            # backend to go unresponsive on every request until it's force-restarted.
            socketTimeoutMS=int(os.environ.get("MONGO_SOCKET_TIMEOUT_MS", "10000")),
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
    market_context:       str                   # latest weekly market-intel brief (reference only)
    build_intent:         BuildIntent           # structured intent from Layer A
    selection_report:     str                   # deterministic budget/price analysis (Layer B)
    compatibility_report: str                   # deterministic hardware validation (Layer C)
    compat_ok:            bool                  # False when compatibility_node finds fatal issues
    validation_failed:    bool                  # True when fatal issues remain AFTER the retry budget is spent
    allocation_attempt:   int                   # retry counter
    excluded_components:  dict[str, list[str]]  # slot → [component names to skip on retry]
    response:             str                   # Layer D narration (fallback text when no tokens stream)


# Maximum number of budget-allocation passes before the pipeline gives up trying
# to assemble a compatible build.  Now that selection_engine pre-filters for
# compatibility the loop converges quickly, so a small ceiling is sufficient.
_MAX_ALLOC_ATTEMPTS: int = 3


# ─── Structured build proposal schema (hybrid fill — Layer A) ────────────────
# Mirrors the frontend `BuildComponent` / `ActiveBuild` shape (src/hooks/useAIAssistant.ts)
# so the JSON block emitted back to the client populates BuildCanvasCard directly.

_BUILD_SLOTS: tuple[str, ...] = ("cpu", "gpu", "motherboard", "ram", "psu", "storage", "case")


class ProposedComponent(BaseModel):
    name:   str                 = ""
    tdp:    Optional[int]       = None   # watts — cpu / gpu
    rating: Optional[int]       = None   # watts — psu
    price:  Optional[float]     = None   # estimated USD
    specs:  dict[str, str]      = Field(default_factory=dict)

    @field_validator("specs", mode="before")
    @classmethod
    def _coerce_specs(cls, v):
        # Gemini's structured output often returns `specs` as a bare string (or
        # omits it) rather than a JSON object — normalise so validation never
        # fails and the component is still usable.
        if v is None:
            return {}
        if isinstance(v, dict):
            return {str(k): str(val) for k, val in v.items()}
        return {"summary": str(v)}

    @field_validator("tdp", "rating", mode="before")
    @classmethod
    def _coerce_int(cls, v):
        if v is None or isinstance(v, int):
            return v
        m = re.search(r"\d+", str(v))
        return int(m.group()) if m else None

    @field_validator("price", mode="before")
    @classmethod
    def _coerce_price(cls, v):
        if v is None or isinstance(v, (int, float)):
            return v
        m = re.search(r"\d+(?:\.\d+)?", str(v))
        return float(m.group()) if m else None


class BuildBlock(BaseModel):
    """Full parts list proposed in one structured call (typed dict)."""
    cpu:         Optional[ProposedComponent] = None
    gpu:         Optional[ProposedComponent] = None
    motherboard: Optional[ProposedComponent] = None
    ram:         Optional[ProposedComponent] = None
    psu:         Optional[ProposedComponent] = None
    storage:     Optional[ProposedComponent] = None   # SSD / NVMe
    case:        Optional[ProposedComponent] = None


# ─── LLM factory + resilient invocation ──────────────────────────────────────
# Provider priority: the OpenAI-compatible provider (Groq by default, via the
# FALLBACK_LLM_* env vars) is the PRIMARY chat/generation LLM; Gemini
# (GOOGLE_API_KEY) is the fallback. Both free tiers rate-limit hard and unbounded
# LangChain retries can hang a call for minutes, so every call is wall-clock
# bounded and breaker-gated: once a provider fails we skip it for a cooldown and
# go straight to the next one.
#
# NOTE: the env var names are kept as-is for backward compatibility — despite the
# `FALLBACK_LLM_*` prefix, that provider is now tried FIRST. Gemini remains the
# only embedding provider (Groq has no embeddings API), so RAG / semantic-cache
# paths still depend on GOOGLE_API_KEY regardless of this ordering.

def _make_gemini_llm(*, temperature: float, max_tokens: Optional[int] = None) -> ChatGoogleGenerativeAI:
    # NOTE: do NOT pass a low `timeout` here — google-genai forwards it as the gRPC
    # deadline and rejects small values with 400 "deadline too short", which would
    # trip the breaker on every call. Wall-clock bounding is done by asyncio.wait_for
    # (_GEMINI_HARD_TIMEOUT) in _ainvoke_resilient instead.
    return ChatGoogleGenerativeAI(
        model=os.environ.get("GEMINI_MODEL", "gemini-2.0-flash"),
        temperature=temperature,
        max_output_tokens=max_tokens,
        google_api_key=os.environ.get("GOOGLE_API_KEY", ""),
        max_retries=int(os.environ.get("GEMINI_MAX_RETRIES", "2")),
    )


def _make_groq_llm(*, temperature: float, max_tokens: Optional[int] = None):
    """Primary OpenAI-compatible provider (Groq default). None if unconfigured."""
    key = os.environ.get("FALLBACK_LLM_API_KEY", "")
    if not key:
        return None
    try:
        from langchain_openai import ChatOpenAI
    except ImportError:
        logger.warning(
            "FALLBACK_LLM_API_KEY set but langchain-openai missing — "
            "run: pip install langchain-openai"
        )
        return None
    return ChatOpenAI(
        model=os.environ.get("FALLBACK_LLM_MODEL", "llama-3.3-70b-versatile"),
        api_key=key,
        base_url=os.environ.get("FALLBACK_LLM_BASE_URL", "https://api.groq.com/openai/v1"),
        temperature=temperature,
        max_tokens=max_tokens,
        max_retries=1,
        timeout=40,
    )


# Hard wall-clock bounds on any single provider call. The google-genai SDK retries
# `503 UNAVAILABLE` at the gRPC layer, ignoring langchain max_retries / timeout —
# so a throttled call can hang ~90s. asyncio.wait_for guarantees we bail to the
# next provider within this window instead.
_GEMINI_HARD_TIMEOUT = float(os.environ.get("GEMINI_TIMEOUT_S", "12"))
_GROQ_HARD_TIMEOUT   = float(os.environ.get("FALLBACK_LLM_TIMEOUT_S", "40"))

# Circuit breakers: once a provider fails (quota/outage), stop probing it for a
# cooldown and go straight to the next — otherwise every LLM call in a request
# wastes the full timeout re-discovering that the provider is down.
_groq_cooldown_until   = 0.0
_gemini_cooldown_until = 0.0


def _groq_usable() -> bool:
    return bool(os.environ.get("FALLBACK_LLM_API_KEY", "")) and time.monotonic() >= _groq_cooldown_until


def _gemini_usable() -> bool:
    return bool(os.environ.get("GOOGLE_API_KEY", "")) and time.monotonic() >= _gemini_cooldown_until


def _trip_groq_breaker(exc: object) -> None:
    global _groq_cooldown_until
    cd = float(os.environ.get("FALLBACK_LLM_COOLDOWN_S", os.environ.get("GEMINI_COOLDOWN_S", "120")))
    _groq_cooldown_until = time.monotonic() + cd
    logger.warning("Groq (primary) circuit breaker tripped for %.0fs (%s)", cd, str(exc)[:80])


def _trip_gemini_breaker(exc: object) -> None:
    global _gemini_cooldown_until
    cd = float(os.environ.get("GEMINI_COOLDOWN_S", "120"))
    _gemini_cooldown_until = time.monotonic() + cd
    logger.warning("Gemini circuit breaker tripped for %.0fs (%s)", cd, str(exc)[:80])


async def _ainvoke_resilient(messages, *, temperature: float, max_tokens: Optional[int] = None):
    """Primary Groq (hard-bounded, breaker-gated) → Gemini fallback (breaker-gated)."""
    if _groq_usable():
        groq = _make_groq_llm(temperature=temperature, max_tokens=max_tokens)
        if groq is not None:
            try:
                return await asyncio.wait_for(
                    groq.ainvoke(messages),
                    timeout=_GROQ_HARD_TIMEOUT,
                )
            except (Exception, asyncio.TimeoutError) as exc:
                _trip_groq_breaker(exc)
                logger.warning("primary (Groq) failed/timeout (%s) — trying Gemini fallback", str(exc)[:120])
    if _gemini_usable():
        try:
            return await asyncio.wait_for(
                _make_gemini_llm(temperature=temperature, max_tokens=max_tokens).ainvoke(messages),
                timeout=_GEMINI_HARD_TIMEOUT,
            )
        except (Exception, asyncio.TimeoutError) as exc:
            _trip_gemini_breaker(exc)
            logger.warning("fallback (Gemini) failed/timeout (%s)", str(exc)[:120])
    raise RuntimeError("no LLM provider available")


_JSON_SHAPE_HINT = (
    "Respond with ONLY a JSON object (no prose, no markdown fences). Shape — include "
    "only the slots you are filling:\n"
    '{"cpu":{"name":"...","price":250,"tdp":105,"specs":{"socket":"AM5","cores":"6"}},'
    '"gpu":{"name":"...","price":550,"tdp":200,"specs":{"vram_gb":"12"}},'
    '"motherboard":{"name":"...","price":120,"specs":{"socket":"AM5","form_factor":"ATX"}},'
    '"ram":{"name":"...","price":60,"specs":{"type":"DDR5","capacity_gb":"32"}},'
    '"psu":{"name":"...","price":90,"rating":750,"specs":{"efficiency":"80+ Gold"}},'
    '"storage":{"name":"...","price":70,"specs":{"type":"NVMe SSD","capacity_gb":"1000"}},'
    '"case":{"name":"...","price":80,"specs":{"form_factor":"ATX"}}}'
)


def _extract_json_object(text: str) -> dict:
    """Pull the first balanced JSON object out of an LLM reply (fenced or raw)."""
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    raw = m.group(1) if m else text
    start = raw.find("{")
    if start == -1:
        return {}
    depth = 0
    for i in range(start, len(raw)):
        if raw[i] == "{":
            depth += 1
        elif raw[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(raw[start:i + 1])
                except (ValueError, TypeError):
                    return {}
    return {}


async def _structured_resilient(messages, *, temperature: float) -> BuildBlock:
    """
    Provider-agnostic structured build output: prompt for JSON, parse the reply,
    and validate with BuildBlock's tolerant coercion. Avoids provider-specific
    structured-output modes (Gemini `json_schema` / Groq strict `function_calling`),
    which reject open `specs` dicts and nullable nested objects.
    """
    msgs = list(messages) + [HumanMessage(content=_JSON_SHAPE_HINT)]
    result = await _ainvoke_resilient(msgs, temperature=temperature)
    content = result.content if isinstance(result.content, str) else str(result.content)
    try:
        return BuildBlock.model_validate(_extract_json_object(content))
    except Exception as exc:
        logger.warning("structured parse failed (%s) — empty proposal", exc)
        return BuildBlock()


# ─── Node 1 — Tavily Web Search ───────────────────────────────────────────────

async def search_node(state: BuildState) -> dict:
    """
    Searches the web for live hardware prices and availability using Tavily.
    Gracefully degrades to an informational fallback string on API failure.
    """
    last = _last_user_message(state["messages"])
    tavily_key = os.environ.get("TAVILY_API_KEY", "")
    if not tavily_key:
        logger.info("search_node: no TAVILY_API_KEY configured — skipping web search")
        return {"search_context": "Web search unavailable — using training knowledge for price estimates."}
    try:
        tool = TavilySearchResults(
            max_results=3,
            tavily_api_key=tavily_key,
        )
        results = await asyncio.wait_for(
            tool.ainvoke({"query": f"PC hardware specs prices {last}"}),
            timeout=float(os.environ.get("SEARCH_TIMEOUT_S", "8")),
        )
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
    if not _gemini_usable():
        # RAG similarity search embeds via Gemini — skip during cooldown so the
        # throttled embedding doesn't add latency for zero benefit.
        return {"rag_context": ""}

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
        # similarity_search is synchronous (embeds via Gemini + Mongo vector search)
        # and would block the event loop; run it in a thread with a hard timeout so
        # a throttled embedding can't stall the whole request.
        docs = await asyncio.wait_for(
            asyncio.to_thread(store.similarity_search, last, k=4),
            timeout=float(os.environ.get("RAG_TIMEOUT_S", "8")),
        )
        ctx  = "\n\n".join(d.page_content for d in docs) if docs else ""
        logger.info("rag_node: retrieved %d documents", len(docs))
    except Exception as exc:
        logger.warning("rag_node: MongoDB unavailable — %s", exc)
        ctx = "Hardware database unavailable — using model knowledge for specifications."

    return {"rag_context": ctx}


# ─── Node 2.5 — Weekly Market Intelligence (reference context) ────────────────

async def market_node(state: BuildState) -> dict:
    """
    Loads the latest weekly market-intel snapshot (hot products, price ranges,
    week-over-week price movements, stale inventory) produced by
    services/market_intel.py and stored in MongoDB. Read-only reference context
    for Layer D — the response_node is forbidden from doing arithmetic on it.
    Degrades to an empty string when no snapshot exists or Mongo is unreachable.

    read_latest() is a synchronous pymongo call. Unlike sync functions passed to
    add_node (which LangGraph auto-offloads to a thread), this runs inline inside
    an async def node, so calling it directly would block the event loop for the
    ENTIRE process on any stall — not just this request. Offload it to a thread
    with a hard timeout, same reasoning as rag_node.
    """
    try:
        from services.market_intel import format_brief, read_latest

        def _read() -> str:
            client  = _get_mongo_client()
            db_name = os.environ.get("MONGODB_DATABASE", "neurobuilds")
            return format_brief(read_latest(client, db_name))

        ctx = await asyncio.wait_for(
            asyncio.to_thread(_read),
            timeout=float(os.environ.get("MARKET_TIMEOUT_S", "6")),
        )
        logger.info("market_node: %s", "snapshot loaded" if ctx else "no snapshot available")
    except Exception as exc:
        logger.warning("market_node: market intel unavailable — %s", exc)
        ctx = ""

    return {"market_context": ctx}


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

    if not (_groq_usable() or _gemini_usable()):
        # Every provider is in cooldown (quota/outage) — skip the probe and use
        # safe defaults; hybrid_fill_node still sees the raw user message downstream.
        logger.info("intent_node: no LLM provider available — using default intent")
        return {"build_intent": intent}

    try:
        # Groq-first → Gemini fallback; timeout + breaker handled inside.
        result = await _ainvoke_resilient(
            [
                SystemMessage(content=_INTENT_SYSTEM),
                HumanMessage(content=f"User Query: {last}\n\nContext:\n{search_snippet}"),
            ],
            temperature=0,
        )
        # An LLM via LangChain may return `content` as a str OR a list of parts.
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
    except (Exception, asyncio.TimeoutError) as exc:
        # Provider breakers are tripped inside _ainvoke_resilient; here we only
        # fall back to the default intent (e.g. a YAML parse failure).
        logger.warning("intent_node: extraction failed, using defaults — %s", str(exc)[:120])

    return {"build_intent": intent}


# ─── Node 3.5 — Explicit Parts Extraction (Layer A — LLM semantic parse) ──────
#
# When the user pastes a concrete, already-chosen parts list ("build me these:
# CPU: Ryzen 5 3500X, Motherboard: A320M, …") the downstream budget/DB nodes
# would ignore it — allocation needs a budget and hybrid_fill would re-invent a
# list instead. This node makes ONE structured call to extract ONLY the parts the
# user explicitly named (by concrete brand+model) and seeds them into EMPTY slots.
# Deterministic DB picks / prior build parts still win; empty slots the user left
# unspecified fall through to budget_allocation / hybrid_fill as before. The
# seeded parts then flow through compatibility_node (Layer C) like any other pick.

# Cheap, LLM-free gate: only spend an extraction call when the message actually
# reads like an already-chosen parts list. Two independent signals: (a) explicit
# slot labels ("CPU:", "Motherboard -", "PSU –"), or (b) three-plus distinct slot
# keywords co-occurring (a paste rarely mentions <3 categories). A pure budget
# request ("$600 best price/perf build") matches neither and skips the call.
_PARTS_LABEL_RE = re.compile(
    r"(?im)^\s*[-*•]?\s*(cpu|processor|gpu|graphics\s*card|video\s*card|motherboard|"
    r"mobo|mainboard|ram|memory|psu|power\s*supply|storage|ssd|nvme|hdd|case|chassis|"
    r"cooler)\s*[:\-–]"
)


def _looks_like_parts_list(msg: str) -> bool:
    if _PARTS_LABEL_RE.search(msg):
        return True
    low = msg.lower()
    hits = sum(1 for kws in _SLOT_KEYWORDS.values() if any(k in low for k in kws))
    return hits >= 3


async def explicit_parts_node(state: BuildState) -> dict:
    """Seed empty slots with components the user explicitly named in their message."""
    build   = dict(state.get("active_build") or {})
    missing = [s for s in _BUILD_SLOTS if not (build.get(s) or {}).get("name")]
    if not missing:
        return {"active_build": build}

    last = _last_user_message(state["messages"])
    if not _looks_like_parts_list(last):
        # No concrete parts named (e.g. a pure budget request) — skip the extra LLM
        # round-trip and let budget_allocation / hybrid_fill assemble the build.
        return {"active_build": build}

    if not (_groq_usable() or _gemini_usable()):
        # No provider — leave slots for hybrid_fill; the raw message still flows on.
        return {"active_build": build}

    system = (
        "You extract a PC parts list that the user has ALREADY chosen. Return ONLY "
        "the slots where the user named a concrete component (specific brand + model, "
        "e.g. 'AMD Ryzen 5 3500X', 'Antec 380W 80+ Bronze'). Do NOT invent, upgrade, "
        "substitute, or complete the build — if the user did not name a part for a "
        "slot, leave that slot null. For each named part fill: name (verbatim as the "
        "user wrote it), price (USD est.), tdp (watts, cpu/gpu only), rating (watts, "
        "psu only — its wattage), and specs — cpu: {socket, cores, threads, ram_type}; "
        "gpu: {vram_gb, interface}; motherboard: {socket, form_factor, ram_type}; "
        "ram: {type (DDR4/DDR5), capacity_gb}; psu: {wattage, efficiency}; "
        "storage: {type (NVMe SSD/SATA SSD), capacity_gb, interface}; "
        "case: {form_factor, gpu_clearance_mm}."
    )
    human = (
        f"User message: {last}\n"
        f"Extract only slots the user explicitly named, from: {', '.join(missing)}"
    )

    try:
        parsed: BuildBlock = await _structured_resilient(
            [SystemMessage(content=system), HumanMessage(content=human)],
            temperature=0,
        )
        proposed = parsed.model_dump(exclude_none=True)
        added = 0
        for slot in missing:
            comp = proposed.get(slot) or {}
            name = comp.get("name", "")
            if not name:
                continue
            entry = {k: v for k, v in comp.items() if v not in (None, "", {})}
            build[slot] = entry
            added += 1
        logger.info("explicit_parts_node: seeded %d slot(s) from user request", added)
    except Exception as exc:
        logger.warning("explicit_parts_node: extraction failed — %s", exc)

    return {"active_build": build}


# ─── Node 4 — Budget Allocation Engine (Layer B) ─────────────────────────────
#
# Thin orchestration wrapper around services/selection_engine.run_allocation().
# All budget arithmetic and DB-backed selection logic lives in that module.
# The LLM never touches these numbers or selects component names.

async def budget_allocation_node(state: BuildState) -> dict:
    """
    Calls selection_engine.run_allocation() to deterministically fill unfilled
    component slots from hardware_specs, then stores the resulting report for
    the response_node to cite verbatim.

    On retry (allocation_attempt > 0), the excluded_components dict (populated
    by compatibility_node on the previous pass) is forwarded to run_allocation()
    so incompatible parts are filtered from DB queries via a $nin clause.

    A plain sync function here would be auto-offloaded by LangGraph to the
    shared default thread-pool executor (the same pool asyncio.to_thread draws
    from elsewhere in this module) — but with no bound, a stalled Mongo query
    would occupy that thread forever, one hang at a time exhausting the pool
    until every blocking call in the process stalls. asyncio.wait_for bounds it
    explicitly and degrades gracefully like the other Mongo-touching nodes.
    """
    intent   = state.get("build_intent") or {}
    build    = dict(state.get("active_build") or {})
    attempt  = state.get("allocation_attempt", 0)
    excluded = dict(state.get("excluded_components") or {})

    budget   = intent.get("budget_usd")
    use_case = intent.get("use_case") or "general"

    def _allocate() -> AllocationResult:
        client = _get_mongo_client()
        # NOTE: this is MONGODB_CATALOG_COLLECTION ("hardware_catalog"), not
        # MONGODB_COLLECTION ("hardware_specs"). hardware_specs is the RAG/
        # embedding collection rag_node queries (schema: component_type, flat
        # fields, no `category`/`specs.launch_msrp_usd`) — pointing the
        # deterministic allocator at it meant every query matched zero
        # documents, silently forcing every build onto the LLM-guessed
        # hybrid_fill path instead of a real DB-backed pick.
        collection = client[
            os.environ.get("MONGODB_DATABASE",          "neurobuilds")
        ][
            os.environ.get("MONGODB_CATALOG_COLLECTION", "hardware_catalog")
        ]
        return run_allocation(
            budget=budget,
            use_case=use_case,
            build=build,
            collection=collection,
            attempt=attempt,
            excluded=excluded,
        )

    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(_allocate),
            timeout=float(os.environ.get("MONGO_QUERY_TIMEOUT_S", "10")),
        )
        updated_build = result["build"]
        report        = result["report"]

        logger.info(
            "budget_allocation_node: attempt=%d slots_filled=%d",
            attempt,
            sum(1 for s in result["slot_log"] if s["selected"]),
        )
    except (Exception, asyncio.TimeoutError) as exc:
        # MongoDB unreachable/timed out — keep existing build, generate report from it
        logger.warning("budget_allocation_node: allocation unavailable — %s", exc)
        from services.selection_engine import build_selection_report, ALLOCATION_WEIGHTS
        weights = ALLOCATION_WEIGHTS.get(use_case, ALLOCATION_WEIGHTS["general"])
        updated_build = build
        report = build_selection_report(build, budget or 0, use_case, weights)

    return {
        "active_build":       updated_build,
        "selection_report":   report,
        "allocation_attempt": attempt + 1,
    }


# ─── Coherence enforcement for LLM-invented motherboard/RAM ──────────────────
#
# hybrid_fill_node / edit_node's system prompts ASK the LLM to match socket/RAM
# type to the anchor CPU, but an instruction is not a guarantee — the LLM can
# still emit a board/RAM with no socket spec or a mismatched one, which lets a
# fatal mismatch slip past compatibility_node's guarded checks (they only fire
# when both sides resolve a value; see validation_engine's "skipped" checks).
# This deterministically OVERWRITES the invented slot's socket/DDR spec to match
# the already-chosen CPU/board, rather than trusting the LLM's free-text spec.
# Called only for slots the LLM just added (never for explicit_parts_node, which
# seeds parts the user explicitly named verbatim).

def _enforce_socket_ddr_coherence(slot: str, build: dict) -> None:
    if slot == "motherboard":
        socket = required_socket(build.get("cpu") or {})
        if socket:
            build[slot].setdefault("specs", {})
            build[slot]["specs"]["socket"] = socket
    elif slot == "ram":
        ddr = required_ddr(build)
        if ddr:
            build[slot].setdefault("specs", {})
            build[slot]["specs"]["type"] = ddr


# ─── Node 4.5 — Hybrid Fill (Layer A — LLM proposes, code merges) ─────────────
#
# The deterministic budget_allocation_node fills slots from MongoDB. When the DB
# is un-ingested (or a slot has no priced match), those slots stay empty and the
# BuildCanvas would render nothing. This node makes ONE structured-output call to
# propose the full parts list as a typed dict (BuildBlock) and merges the proposal
# into EMPTY slots only — deterministic DB picks always win. The proposal then
# flows through compatibility_node (Layer C) for validation exactly like DB picks,
# preserving the deterministic/probabilistic split.

async def hybrid_fill_node(state: BuildState) -> dict:
    """Fill any empty component slot via a single Gemini structured-output call."""
    build   = dict(state.get("active_build") or {})
    missing = [s for s in _BUILD_SLOTS if not (build.get(s) or {}).get("name")]
    if not missing:
        return {"active_build": build}

    if not os.environ.get("GOOGLE_API_KEY", "") and not os.environ.get("FALLBACK_LLM_API_KEY", ""):
        logger.info("hybrid_fill_node: no LLM provider — leaving %d slot(s) empty", len(missing))
        return {"active_build": build}

    intent   = state.get("build_intent") or {}
    last     = _last_user_message(state["messages"])
    filled   = {s: (build.get(s) or {}).get("name", "") for s in _BUILD_SLOTS if (build.get(s) or {}).get("name")}
    excluded = state.get("excluded_components") or {}
    excl_txt = "; ".join(f"{slot}: {', '.join(names)}" for slot, names in excluded.items() if names) or "none"

    system = (
        "You are a PC hardware selector. Propose a coherent, mutually-compatible "
        "parts list for the user's needs. Fill ONLY the requested empty slots. For "
        "each proposed part give: name, price (USD est.), tdp (watts, cpu/gpu only), "
        "rating (watts, psu only), and specs — cpu: {socket, cores, threads, ram_type}; "
        "gpu: {vram_gb, interface}; motherboard: {socket, form_factor, ram_type}; "
        "ram: {type (DDR4/DDR5), capacity_gb}; psu: {wattage, efficiency}; "
        "storage: {type (NVMe SSD/SATA SSD), capacity_gb, interface}; "
        "case: {form_factor, gpu_clearance_mm}. Ensure the CPU socket matches the "
        "motherboard socket, RAM type matches the board, and the case fits the board form factor."
    )
    human = (
        f"User request: {last}\n"
        f"Budget (USD): {intent.get('budget_usd') or 'unspecified'}\n"
        f"Use case: {intent.get('use_case', 'general')}\n"
        f"Perf target: {intent.get('perf_target') or 'unspecified'}\n"
        f"Preferred brands: {', '.join(intent.get('preferred_brands') or []) or 'none'}\n"
        f"Already selected (keep, must remain compatible): {filled or 'none'}\n"
        f"Do NOT propose these excluded parts: {excl_txt}\n"
        f"Fill ONLY these empty slots: {', '.join(missing)}"
    )

    try:
        proposal: BuildBlock = await _structured_resilient(
            [SystemMessage(content=system), HumanMessage(content=human)],
            temperature=0,
        )
        proposed = proposal.model_dump(exclude_none=True)
        added = 0
        for slot in missing:
            comp = proposed.get(slot) or {}
            name = comp.get("name", "")
            if not name:
                continue
            # Drop empty/None fields so the emitted block stays compact.
            entry = {k: v for k, v in comp.items() if v not in (None, "", {})}
            build[slot] = entry
            _enforce_socket_ddr_coherence(slot, build)
            added += 1
        logger.info("hybrid_fill_node: proposed %d/%d empty slot(s)", added, len(missing))
    except Exception as exc:
        logger.warning("hybrid_fill_node: proposal failed — %s", exc)

    return {"active_build": build}


# ─── Shared report formatter (compatibility_node + edit_node) ────────────────

def _format_validation_report(result: ValidationResult) -> list[str]:
    """Renders a ValidationResult into the narrative lines Layer D cites verbatim."""
    lines: list[str] = []
    if result["issues"]:
        lines.append("⚠  COMPATIBILITY ISSUES:")
        lines.extend(f"   ✗  {i}" for i in result["issues"])
    if result["warnings"]:
        lines.append("⡇  ADVISORIES:")
        lines.extend(f"   △  {w}" for w in result["warnings"])
    if result.get("skipped"):
        # Distinct from "passed" — these checks could not run at all (missing
        # spec data), so the build is UNVERIFIED on that point, not confirmed
        # compatible. Surfacing this prevents a false sense of confidence.
        lines.append("❓  NOT VERIFIED (missing data):")
        lines.extend(f"   ?  {s}" for s in result["skipped"])
    if result["passed"]:
        lines.append("✓  CHECKS PASSED:")
        lines.extend(f"   ✓  {p}" for p in result["passed"])
    return lines


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
    if not result["issues"] and not result["warnings"] and not result["passed"] and not result.get("skipped"):
        report_lines = [
            "No active build components to validate. "
            "Recommend components based on user requirements."
        ]
    else:
        report_lines = _format_validation_report(result)

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

    # The build is a hard FAILURE (not just "retry") only once fatal issues
    # remain AND the retry budget is spent — this is what _should_retry uses to
    # route to `respond`, and what run_pipeline / response_node use to refuse to
    # present the build.  While attempts remain, validation_failed stays False so
    # the loop keeps trying to assemble a compatible build.
    attempt           = state.get("allocation_attempt", 0)
    validation_failed = (not result["ok"]) and attempt >= _MAX_ALLOC_ATTEMPTS

    logger.info(
        "compatibility_node: ok=%s issues=%d warnings=%d passed=%d attempt=%d validation_failed=%s",
        result["ok"], len(result["issues"]), len(result["warnings"]),
        len(result["passed"]), attempt, validation_failed,
    )

    return {
        "compatibility_report": report,
        "compat_ok":            result["ok"],
        "validation_failed":    validation_failed,
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
    if not os.environ.get("GOOGLE_API_KEY", "") and not os.environ.get("FALLBACK_LLM_API_KEY", ""):
        # No provider → cannot narrate. Return a clear degraded message (surfaced by
        # run_pipeline when no tokens streamed) instead of crashing the pipeline.
        logger.warning("response_node: no LLM provider configured — skipping narration")
        return {
            "response": (
                "⚠ AI narration is unavailable (no LLM API key configured on the "
                "server). The build below was assembled by the deterministic engine."
            )
        }

    # Gate FIRST: if a fatal build survived the retry budget, response_node must
    # refuse to present it — it may never narrate an invalid build as usable.
    # This takes priority over the edit/build prompt selection.
    if state.get("validation_failed"):
        system_prompt = _build_validation_failure_prompt()
    elif route_request(state) == "edit":
        # Edit turns get a confirmation-oriented prompt — the build prompt forbids
        # naming/changing components, which makes it wrongly "refuse" a change the
        # user explicitly asked for and the system already applied.
        system_prompt = _build_edit_system_prompt()
    else:
        system_prompt = _build_response_system_prompt()
    lc_messages: list = [SystemMessage(content=system_prompt)]
    for msg in state["messages"]:
        role    = msg.get("role", "")
        content = msg.get("content", "")
        if role == "user":
            lc_messages.append(HumanMessage(content=content))
        elif role == "assistant" and content:
            lc_messages.append(AIMessage(content=content))

    # The deterministic report reflects the CURRENT build and must be the freshest,
    # authoritative context. Appending it AFTER the conversation history (as the
    # final turn) stops the model from re-narrating a build from an earlier reply
    # ("as I mentioned earlier…") when the allocation has since changed.
    lc_messages.append(HumanMessage(content=_build_deterministic_context(state)))

    try:
        result = await _ainvoke_resilient(lc_messages, temperature=0.7)
        return {"response": result.content}
    except Exception as exc:
        # A transient LLM outage (e.g. 503 "model busy") must not kill the whole
        # response — run_pipeline still emits the deterministic build block after
        # this returns, so the BuildCanvas populates even when narration fails.
        logger.warning("response_node: narration failed — %s", exc)
        return {
            "response": (
                "⚠ AI narration is temporarily unavailable (the model is busy). The "
                "build below was assembled by the deterministic engine — retry shortly "
                "for a full explanation."
            )
        }


# ─── Conditional edge router ──────────────────────────────────────────────────

def _should_retry(state: BuildState) -> str:
    """
    Route back to budget_allocation_node when:
      - compatibility_node found fatal issues (compat_ok=False)
      - retry budget has not been exhausted (< _MAX_ALLOC_ATTEMPTS)
    Otherwise route to response_node.

    NOTE: routing to "respond" on an exhausted-and-still-failing build does NOT
    mean the invalid build is presented — compatibility_node sets
    validation_failed=True in that case, and response_node / run_pipeline refuse
    to narrate or serialize it.  The node order (…→ response → END) is preserved.
    """
    compat_ok = state.get("compat_ok", True)
    attempt   = state.get("allocation_attempt", 0)

    if not compat_ok and attempt < _MAX_ALLOC_ATTEMPTS:
        logger.info("_should_retry: compatibility failed — retry %d/%d", attempt, _MAX_ALLOC_ATTEMPTS)
        return "retry"
    return "respond"


# ─── Router + lightweight paths (chat / edit) ────────────────────────────────
#
# Not every message needs the full build pipeline. A deterministic router sends
# each turn down the cheapest capable path:
#   • build : full pipeline (search → intent → allocation → hybrid_fill → …)
#   • edit  : ONE structured call to add/swap/remove specific parts (fast)
#   • chat  : ONE conversational call to gather requirements / answer questions
# This is the token-optimised conversational flow — follow-ups no longer re-run
# three LLM calls + web search, which is what was causing the multi-minute hangs.

_SLOT_KEYWORDS: dict[str, tuple[str, ...]] = {
    "cpu":         ("cpu", "processor"),
    "gpu":         ("gpu", "graphics", "graphic card", "video card"),
    "motherboard": ("motherboard", "mobo", "mainboard", "board"),
    "ram":         ("ram", "memory"),
    "psu":         ("psu", "power supply"),
    "storage":     ("ssd", "nvme", "storage", "hard drive", "hdd", "drive"),
    "case":        ("case", "chassis", "tower"),
}

_EDIT_VERBS = (
    "add ", "swap", "replace", "remove", "change ", "exchange", "drop ", "delete",
    "upgrade", "switch", "instead", "different", "better ", "without ", "take out",
)

# A bare "build" is ambiguous (noun vs verb), so build detection uses either an
# explicit request phrase or a concrete budget/resolution signal — never the noun
# alone, so "is this a good build?" is treated as a question, not a new request.
_STRONG_BUILD = (
    "build me", "build a", "new build", "another build", "new pc",
    "recommend a", "suggest a", "put together", "spec me", "complete build",
    "full build", "parts list",
)
_SPEC_SIGNALS = (
    "$", " usd", "dollar", "budget", "1080p", "1440p", "4k", "gaming pc",
    "gaming rig", "workstation", "cheaper", "less expensive", "lower price",
    "lower cost", "reduce cost", "cut cost", "more expensive", "pricier",
    "higher budget", "bigger budget", "increase budget", "lower budget",
    "reduce budget", "smaller budget",
)
_QUESTION_STARTS = (
    "is ", "are ", "what", "how", "why", "which", "should", "can ", "could",
    "does", "do ", "will ", "would", "tell me", "explain",
)


def route_request(state: BuildState) -> str:
    """Deterministic router → 'build' | 'edit' | 'chat' (no LLM call)."""
    msg   = _last_user_message(state["messages"]).lower().strip()
    build = state.get("active_build") or {}
    has_build = any((build.get(s) or {}).get("name") for s in _BUILD_SLOTS)

    if has_build and any(v in msg for v in _EDIT_VERBS):
        return "edit"

    is_question = msg.endswith("?") or msg.startswith(_QUESTION_STARTS)
    strong = any(t in msg for t in _STRONG_BUILD) or any(t in msg for t in _SPEC_SIGNALS)

    if has_build:
        # Existing build: only re-build on an explicit, non-question request;
        # otherwise it's a follow-up question → chat.
        return "build" if (strong and not is_question) else "chat"

    # No build yet.
    if strong:
        return "build"
    if not is_question and any(
        w in msg for w in ("pc", "rig", "computer", "gpu", "cpu", "gaming", "build")
    ):
        return "build"
    return "chat"


async def chat_node(state: BuildState) -> dict:
    """Lightweight conversational turn — understand needs / answer build questions."""
    if not os.environ.get("GOOGLE_API_KEY", "") and not os.environ.get("FALLBACK_LLM_API_KEY", ""):
        return {"response": "⚠ Chat is unavailable (no LLM API key configured on the server)."}

    build   = state.get("active_build") or {}
    summary = ", ".join(
        f"{s}={(build.get(s) or {}).get('name')}"
        for s in _BUILD_SLOTS if (build.get(s) or {}).get("name")
    ) or "none yet"

    system = (
        "You are Neuro, a friendly expert PC-build assistant for NeuroBuilds. Chat "
        "naturally to understand the user's needs (use case, budget, resolution, "
        "brand preferences). Ask one concise clarifying question when it helps. Keep "
        "replies short and conversational. Do NOT invent a full parts list here — when "
        "the user is ready for a build they'll ask and a separate engine assembles it. "
        "You may answer questions about the current build.\n"
        f"Current build: {summary}"
    )
    lc = [SystemMessage(content=system)]
    for m in state["messages"]:
        role, content = m.get("role", ""), m.get("content", "")
        if role == "user":
            lc.append(HumanMessage(content=content))
        elif role == "assistant" and content:
            lc.append(AIMessage(content=content))

    try:
        result = await _ainvoke_resilient(lc, temperature=0.6)
        return {"response": result.content}
    except Exception as exc:
        logger.warning("chat_node: failed — %s", exc)
        return {"response": "⚠ I'm having trouble reaching the AI right now — please retry shortly."}


async def edit_node(state: BuildState) -> dict:
    """Add / swap / remove specific slots on the existing build, then re-validate."""
    build = dict(state.get("active_build") or {})
    msg   = _last_user_message(state["messages"])
    low   = msg.lower()

    # ── Removal (deterministic) ────────────────────────────────────────────
    removed: list[str] = []
    if any(v in low for v in ("remove", "drop ", "delete", "without ", "take out", "get rid")):
        for slot, kws in _SLOT_KEYWORDS.items():
            if build.get(slot) and any(k in low for k in kws):
                build.pop(slot, None)
                removed.append(slot)

    # ── Add / swap (structured LLM, empty-slot-agnostic) ───────────────────
    wants_change = any(
        v in low for v in ("add", "swap", "replace", "change", "exchange", "upgrade",
                           "switch", "instead", "different", "better")
    )
    if wants_change and (os.environ.get("GOOGLE_API_KEY", "") or os.environ.get("FALLBACK_LLM_API_KEY", "")):
        current = {
            s: (build.get(s) or {}).get("name", "")
            for s in _BUILD_SLOTS if (build.get(s) or {}).get("name")
        }
        system = (
            "You are editing an EXISTING PC build. Return ONLY the component slots the "
            "user wants to add or change — as structured fields (name, price, tdp/rating, "
            "specs) — and leave every other slot null. Keep new parts compatible with the "
            "kept parts (matching socket, RAM type, form factor)."
        )
        human = f"Current build: {current}\nUser request: {msg}\nReturn only the changed/added slots."
        try:
            proposal = await _structured_resilient(
                [SystemMessage(content=system), HumanMessage(content=human)], temperature=0,
            )
            for slot, comp in proposal.model_dump(exclude_none=True).items():
                if isinstance(comp, dict) and comp.get("name"):
                    build[slot] = {k: v for k, v in comp.items() if v not in (None, "", {})}
                    _enforce_socket_ddr_coherence(slot, build)
        except Exception as exc:
            logger.warning("edit_node: proposal failed — %s", exc)

    # ── Inline compatibility (Layer C) so response_node narrates accurately ─
    result: ValidationResult = run_checks(build, case=build.get("case"))
    lines: list[str] = []
    if removed:
        lines.append(f"Removed: {', '.join(removed)}")
    lines.extend(_format_validation_report(result))

    logger.info("edit_node: removed=%s ok=%s issues=%d", removed, result["ok"], len(result["issues"]))
    return {
        "active_build":         build,
        "compatibility_report": "\n".join(lines) or "Build updated.",
        "compat_ok":            result["ok"],
        # The edit path has no retry loop, so a fatal edit is an immediate
        # failure: response_node refuses to endorse it and run_pipeline suppresses
        # the build JSON — the invalid edit never reaches the canvas.
        "validation_failed":    not result["ok"],
    }


# ─── Graph assembly ───────────────────────────────────────────────────────────

def _build_graph():
    g = StateGraph(BuildState)

    g.add_node("search",            search_node)
    g.add_node("rag",               rag_node)
    g.add_node("market",            market_node)            # weekly market-intel reference context
    g.add_node("intent",            intent_node)            # Layer A — LLM semantic extraction
    g.add_node("explicit_parts",    explicit_parts_node)    # Layer A — seed user-named parts
    g.add_node("budget_allocation", budget_allocation_node) # Layer B — deterministic DB selection
    g.add_node("hybrid_fill",       hybrid_fill_node)       # Layer A — LLM fills empty slots
    g.add_node("compatibility",     compatibility_node)     # Layer C — 9-tier validation
    g.add_node("response",          response_node)          # Layer D — LLM narration only
    g.add_node("chat",              chat_node)              # lightweight conversation path
    g.add_node("edit",              edit_node)              # single-part add/swap/remove path

    # Conditional entry point — route each turn to the cheapest capable path.
    g.add_conditional_edges(
        START,
        route_request,
        {"build": "search", "edit": "edit", "chat": "chat"},
    )

    # Build path (full pipeline)
    g.add_edge("search",            "rag")
    g.add_edge("rag",               "market")
    g.add_edge("market",            "intent")
    g.add_edge("intent",            "explicit_parts")
    g.add_edge("explicit_parts",    "budget_allocation")
    g.add_edge("budget_allocation", "hybrid_fill")
    g.add_edge("hybrid_fill",       "compatibility")
    g.add_conditional_edges(
        "compatibility",
        _should_retry,
        {"retry": "budget_allocation", "respond": "response"},
    )

    # Edit path validates inline then narrates; chat path ends immediately.
    g.add_edge("edit",     "response")
    g.add_edge("response", END)
    g.add_edge("chat",     END)

    return g.compile()


_graph = _build_graph()


# ─── Public entry point ───────────────────────────────────────────────────────

def _serialise_build(build: dict) -> dict:
    """
    Reduce the pipeline's active_build to the frontend `ActiveBuild` shape:
    only populated slots, each carrying name + any of tdp/rating/price/specs.
    """
    out: dict = {}
    for slot in _BUILD_SLOTS:
        comp = build.get(slot)
        if isinstance(comp, dict) and comp.get("name"):
            entry: dict = {"name": comp["name"]}
            for key in ("tdp", "rating", "price", "specs"):
                if comp.get(key) not in (None, "", {}):
                    entry[key] = comp[key]
            out[slot] = entry
    return out


# Progress heartbeats streamed as each build-path node completes — keeps the HTTP
# stream from going silent for the ~30s a full build can take, and shows the user
# the pipeline is working rather than hung.
_NODE_PROGRESS: dict[str, str] = {
    "search":            "🔎 Researching current hardware prices…\n",
    "rag":               "📚 Consulting the hardware knowledge base…\n",
    "intent":            "🧠 Understanding your requirements…\n",
    "budget_allocation": "💰 Allocating your budget across components…\n",
    "hybrid_fill":       "🧩 Selecting compatible parts…\n",
    "compatibility":     "✅ Validating compatibility…\n\n",
}


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
        "market_context":       "",
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
        "validation_failed":    False,
        "allocation_attempt":   0,
        "excluded_components":  {},
    }

    # Immediate keep-alive + progress cue for the slower build/edit paths, so the
    # streaming connection stays warm while the pipeline runs (prevents idle drops)
    # and the user gets instant feedback instead of a blank wait.
    _route = route_request(initial_state)
    if _route == "build":
        yield "🔧 Assembling your build…\n\n"
    elif _route == "edit":
        yield "🔧 Updating your build…\n\n"

    final_state: dict = {}
    streamed_any = False
    seen_nodes: set[str] = set()

    # Drive the graph through a queue so a single slow node (e.g. rag_node can take
    # ~16s embedding + Atlas vector search; intent ~8s on a throttled free tier)
    # can't leave the HTTP stream silent long enough to trip an idle timeout — the
    # frontend surfaces that silence as the "OFFLINE MODE — backend unreachable"
    # mock. A background producer feeds events into the queue; while we wait we emit
    # a zero-width heartbeat every few seconds so bytes keep flowing regardless of
    # which node is slow. The producer is never cancelled mid-step, so the graph
    # generator is never corrupted.
    _HEARTBEAT_S = 4.0
    queue: asyncio.Queue = asyncio.Queue()

    async def _producer():
        try:
            async for event in _graph.astream_events(initial_state, version="v2"):
                await queue.put(("event", event))
        except Exception as exc:  # surface the failure to the consumer, don't swallow
            await queue.put(("error", exc))
        finally:
            await queue.put(("done", None))

    producer = asyncio.create_task(_producer())
    try:
        while True:
            try:
                kind, payload = await asyncio.wait_for(queue.get(), timeout=_HEARTBEAT_S)
            except asyncio.TimeoutError:
                yield "​"  # zero-width heartbeat — keeps the socket warm, invisible
                continue

            if kind == "done":
                break
            if kind == "error":
                raise payload

            event = payload
            etype = event["event"]
            if (
                etype == "on_chat_model_stream"
                and event.get("metadata", {}).get("langgraph_node") in ("response", "chat")
            ):
                chunk = event["data"].get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    streamed_any = True
                    yield chunk.content
            elif etype == "on_chain_end":
                output = event.get("data", {}).get("output")
                if isinstance(output, dict) and "active_build" in output:
                    final_state = output  # last one wins → graph's final merged state
                # Human-readable progress when a build-path node finishes — gives the
                # user real feedback before narration starts (the heartbeat above only
                # keeps the socket warm; this tells them what's happening).
                node = event.get("name", "")
                if node in _NODE_PROGRESS and node not in seen_nodes:
                    seen_nodes.add(node)
                    yield _NODE_PROGRESS[node]
    finally:
        if not producer.done():
            producer.cancel()

    # If no narration streamed (e.g. GOOGLE_API_KEY missing on the server), surface
    # the degraded response text so the user isn't left with an empty reply.
    if not streamed_any and final_state.get("response"):
        yield str(final_state["response"])

    # Emit the final deterministic build as a machine-readable JSON fence so the
    # frontend's extractBuild() populates the BuildCanvas. Built by CODE from the
    # pipeline's active_build — the LLM never hand-writes this block.
    #
    # HARD GATE: when validation_failed (fatal issues survived the retry budget,
    # or a fatal edit) we emit NO build block — an invalid build can never reach
    # the BuildCanvas. The narration above already refused to present it.
    if not final_state.get("validation_failed"):
        build_out = _serialise_build(final_state.get("active_build") or initial_state["active_build"])
        # Diagnostic: makes it possible to tell, from the server log alone, whether
        # a slot missing on the frontend was ever in the deterministic build (a
        # hybrid_fill / state-capture bug) or was never filled at all (in which case
        # any mention of it in the narrated prose is the LLM inventing a component
        # response_node was explicitly told never to invent).
        logger.info("run_pipeline: emitting build slots=%s", sorted(build_out.keys()))
        if build_out:
            yield f"\n\n```json\n{json.dumps({'build': build_out})}\n```\n"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _last_user_message(messages: list[dict]) -> str:
    for msg in reversed(messages):
        if msg.get("role") == "user":
            return msg.get("content", "")
    return ""


def _build_edit_system_prompt() -> str:
    """Narration for the edit path — confirm the change, never refuse it."""
    return """\
You are Neuro, a friendly PC-build assistant. The user asked to modify their existing
build and the change has ALREADY been applied and validated by the system (see the
CURRENT BUILD STATE and COMPATIBILITY ANALYSIS below).

Your job:
  • Confirm the change in a concise, friendly way, referencing the new component(s) by name.
  • Mention any compatibility results or advisories from the report (e.g. PSU headroom).
  • NEVER refuse or say you "can't change components" — the change is already done.
  • Output PLAIN PROSE ONLY — no JSON, no code blocks. Keep it to 2–4 sentences."""


def _build_validation_failure_prompt() -> str:
    """
    Narration for a build that FAILED deterministic validation after the retry
    budget was spent.  The LLM must NOT present or endorse the parts list — it
    explains the fatal constraint and asks the user to adjust their requirements.
    Mirrors the contract: validationPassed == false → never explain the build.
    """
    return """\
You are Neuro, an expert AI hardware architect for the NeuroBuilds platform.
The deterministic validation engine could NOT assemble a compatible build for
this request (see the COMPATIBILITY ANALYSIS below — its status is FATAL).

WHAT YOU MUST DO:
  • Clearly tell the user a compatible build could not be finalised.
  • Explain, in plain English, the specific fatal constraint(s) from the
    COMPATIBILITY ANALYSIS (e.g. socket mismatch, DDR mismatch, insufficient PSU).
  • Ask a concrete follow-up: suggest adjusting the budget, loosening a brand /
    form-factor preference, or picking a different anchor part — whatever would
    resolve the specific conflict reported.

WHAT YOU MUST NEVER DO:
  • NEVER present, recommend, or endorse the incomplete/invalid parts list as if
    it were usable — there is no valid build to describe.
  • NEVER claim the parts are compatible or "will work".
  • NEVER invent replacement component names yourself — the engine selects parts.
  • Do NOT perform your own compatibility or price arithmetic.

OUTPUT FORMAT:
  • Plain prose only. No JSON, no code blocks. Keep it concise, honest, and helpful."""


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
  • If the COMPATIBILITY ANALYSIS has a "NOT VERIFIED" section, tell the user plainly
    that those specific checks could not be confirmed (missing spec data) — do NOT
    imply the build is fully validated when some checks were skipped.

WHAT YOU MUST NEVER DO:
  • Suggest or change specific component names or model numbers. All hardware was
    selected by the deterministic budget_allocation_node from the MongoDB database.
    Your job is to explain WHY those choices are good, not to pick alternatives.
  • Name, price, or spec ANY component (motherboard, storage, case, cooler, or
    otherwise) that does not appear by name inside the CURRENT BUILD STATE JSON
    block below. If a slot is absent from that JSON, it was NOT selected — say so
    plainly ("no storage drive selected yet") instead of inventing one. This is
    the single most important rule: the JSON block is the ONLY valid source for
    which components exist. Do not fill a gap with plausible-sounding hardware.
  • Recalculate, re-derive, or approximate any figure already present in the reports.
  • Perform socket compatibility checks — the compatibility engine already did this.
  • Perform PSU power or budget arithmetic — the selection engine already did this.
  • Contradict or "correct" a figure from a deterministic report.
  • Guess at compatibility if the build is incomplete — say "more components needed".

━━━ OUTPUT FORMAT RULES ━━━
  • Output PLAIN PROSE ONLY. Never emit JSON, code blocks, or key:value dumps —
    the structured build is delivered separately by the system, not by you.
  • Describe the selected build in plain prose — explain the rationale for each
    component choice based on the budget allocation and compatibility reports.
  • Address any compatibility warnings or issues with practical advice.
  • If the allocation engine could not find components (empty slots), explain what
    budget range or category adjustments might help.
  • Keep prose concise and educational; avoid marketing language."""


def _build_deterministic_context(state: BuildState) -> str:
    """
    Assembles the Layer B+C deterministic reports into the final narration turn.

    Delivered as the last message (after the chat history) so the model treats
    these figures as the current, authoritative build — superseding any component
    names mentioned in earlier assistant replies, which may describe a build the
    allocation engine has since replaced.
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

    # Reference-only context (search / RAG / market) is bulky and pollutes every
    # narration prompt. Include each section only when it carries real content and
    # cap its length — the deterministic reports below remain the source of truth.
    _NOISE = (
        "Web search unavailable",
        "Hardware database unavailable",
        "No web search results",
        "No database results",
    )

    def _ref_section(title: str, value: str, limit: int = 800) -> str:
        text = (value or "").strip()
        if not text or any(text.startswith(n) for n in _NOISE):
            return ""
        return f"\n━━━ {title} ━━━\n{text[:limit]}\n"

    reference_blocks = "".join([
        _ref_section("LIVE MARKET DATA (Tavily — reference only, no arithmetic)", state.get("search_context", "")),
        _ref_section("HARDWARE DATABASE (MongoDB RAG — reference only)", state.get("rag_context", "")),
        _ref_section("MARKET INTELLIGENCE (weekly snapshot — reference only, no arithmetic)", state.get("market_context", "")),
    ])

    return f"""\
<deterministic_report>
IMPORTANT: This is the CURRENT build and is authoritative. Narrate ONLY the
components listed below. If earlier replies in this conversation named different
parts, they are STALE — the allocation engine has since changed the build. Do not
say "as I mentioned earlier" or reference any component not present here.

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
{reference_blocks}</deterministic_report>"""
