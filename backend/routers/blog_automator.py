"""
NeuroBuilds — AI Blog Automator Router

Python migration of blog-automator/ (TypeScript) into the FastAPI backend.
All LLM calls replaced with Gemini via services.gemini_manager.

Endpoints (all require `role: admin` via require_admin dependency):

    POST /api/admin/blog-automator/trigger
        Body: { "topic": "...", "mock": false }
        Enforces 12-hour anti-spam window.
        Queues a background pipeline and returns a job_id immediately.

    GET  /api/admin/blog-automator/jobs
        Lists recent jobs (newest-first, default limit 20).

Pipeline stages:
    [1] Research    — Tavily web search (top 5 results, same key as agent.py)
    [2] Draft       — Gemini writer LLM (GEMINI_MODEL from env)
    [3] Critique    — Gemini critic LLM (same model; JSON response)
        If score < 75 AND iterations < MAX_CRITIQUE_ITERATIONS → back to [2]
    [4] Publish     — Creates Firestore `blogs` doc, status "pending_review",
                      authorType "ai_agent". Admin reviews via existing
                      ReviewConsole UI; no Ghost CMS dependency.

State persistence: Firestore `blog_automator_jobs/{job_id}` (replaces the
TypeScript file-based stateManager.ts).

Anti-spam: Firestore `blog_automator_meta/config.lastTriggeredAt` is checked
before every trigger.  Requests within 12 hours of the previous trigger are
rejected with HTTP 429.
"""

import asyncio
import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, field_validator

import firebase_admin
from firebase_admin import firestore as fb_firestore

from services.auth_guard import require_admin
from services.gemini_manager import gemini_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/blog-automator", tags=["blog-automator"])

_ANTI_SPAM_HOURS    = 12
_MAX_ITERATIONS     = 2        # max draft+critique loops before forcing HITL
_REVISION_THRESHOLD = 75       # critic score below this triggers a revision

_META_COL    = "blog_automator_meta"
_META_DOC    = "config"
_PROMPTS_DOC = "prompts"
_JOBS_COL    = "blog_automator_jobs"
_BLOGS_COL   = "blogs"


# ─── Request / response models ────────────────────────────────────────────────

class TriggerRequest(BaseModel):
    topic: str
    mock: bool = False

    @field_validator("topic")
    @classmethod
    def validate_topic(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 5:
            raise ValueError("topic must be at least 5 characters long")
        if len(v) > 200:
            raise ValueError("topic must be ≤200 characters")
        return v


class TriggerResponse(BaseModel):
    job_id:  str
    status:  str
    message: str


class PromptsRequest(BaseModel):
    writerSystem: str
    criticSystem: str

    @field_validator("writerSystem", "criticSystem")
    @classmethod
    def validate_not_empty(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 20:
            raise ValueError("Prompt must be at least 20 characters")
        return v


# ─── Firestore helpers ────────────────────────────────────────────────────────

def _db():
    if not firebase_admin._apps:  # type: ignore[attr-defined]
        raise RuntimeError("Firebase Admin SDK is not initialised.")
    return fb_firestore.client()


def _set_job(db, job_id: str, data: dict) -> None:
    db.collection(_JOBS_COL).document(job_id).set(
        {**data, "updatedAt": datetime.now(timezone.utc)}, merge=True
    )


# ─── Anti-spam guard ──────────────────────────────────────────────────────────

def _check_anti_spam(db) -> None:
    """
    Raises HTTP 429 if the pipeline was triggered within the last 12 hours.
    The check is based on `blog_automator_meta/config.lastTriggeredAt` in Firestore.
    """
    snap = db.collection(_META_COL).document(_META_DOC).get()
    if snap.exists:
        meta: dict = snap.to_dict() or {}
        last: Optional[datetime] = meta.get("lastTriggeredAt")
        if last is not None:
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            remaining = timedelta(hours=_ANTI_SPAM_HOURS) - (datetime.now(timezone.utc) - last)
            if remaining.total_seconds() > 0:
                hours = int(remaining.total_seconds() // 3600)
                mins  = int((remaining.total_seconds() % 3600) // 60)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=(
                        f"Anti-spam: the blog automator was triggered recently. "
                        f"Please wait {hours}h {mins}m before triggering again."
                    ),
                )


def _record_trigger(db) -> None:
    db.collection(_META_COL).document(_META_DOC).set(
        {"lastTriggeredAt": datetime.now(timezone.utc)}, merge=True
    )


# ─── Prompt loader ────────────────────────────────────────────────────────────

def _load_prompts(db) -> tuple[str, str]:
    """
    Return (writer_system, critic_system) from Firestore blog_automator_meta/prompts.
    Falls back to the hardcoded module-level defaults if the doc does not exist or
    if any field is empty.  Never raises — a Firestore error silently returns defaults.
    """
    try:
        snap = db.collection(_META_COL).document(_PROMPTS_DOC).get()
        if snap.exists:
            data = snap.to_dict() or {}
            writer = (data.get("writerSystem") or "").strip() or _WRITER_SYSTEM
            critic = (data.get("criticSystem") or "").strip() or _CRITIC_SYSTEM
            return writer, critic
    except Exception as exc:
        logger.warning("blog_automator: failed to load custom prompts — %s", exc)
    return _WRITER_SYSTEM, _CRITIC_SYSTEM


# ─── Stage 1 — Tavily research ────────────────────────────────────────────────

async def _research_stage(topic: str) -> str:
    api_key = os.getenv("TAVILY_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("TAVILY_API_KEY is not set.")

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.tavily.com/search",
            json={
                "api_key":       api_key,
                "query":         topic,
                "search_depth":  "advanced",
                "include_answer": True,
                "max_results":   5,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    results: list[dict] = data.get("results", [])
    if not results:
        raise RuntimeError("Tavily returned zero results — try a more specific topic.")

    sections: list[str] = []
    if data.get("answer"):
        sections.append(f"## AI Summary\n{data['answer']}")

    source_parts = [
        (
            f"### [{i + 1}] {r.get('title', '')}\n"
            f"**URL:** {r.get('url', '')}\n"
            f"**Relevance:** {r.get('score', 0) * 100:.0f}%\n\n"
            f"{r.get('content', '')}"
        )
        for i, r in enumerate(results[:5])
    ]
    sections.append("## Source Articles\n\n" + "\n\n---\n\n".join(source_parts))

    research_data = "\n\n---\n\n".join(sections)
    logger.info("blog_automator: research gathered %d source(s)", len(results))
    return research_data


# ─── Stage 2 — Gemini writer (replaces Anthropic draftNode) ──────────────────

_WRITER_SYSTEM = """\
You are an expert technical blog writer specialising in SEO-optimised, long-form content.
You write comprehensive, authoritative posts firmly grounded in provided research.

Requirements:
- Target 1,500–2,500 words of flowing prose
- Use H2 and H3 markdown headings to create clear structure
- Open with an engaging introduction that frames the problem
- Present main points with depth, concrete examples, and figures from the research
- Use bullet points and numbered lists where they genuinely aid comprehension
- Close with a conclusion that distils actionable takeaways
- Do NOT invent statistics or quotes — only reference figures present in the provided research
- Output ONLY the blog post markdown — no preamble, meta-commentary, or word count annotations"""


async def _draft_stage(
    topic: str,
    research_data: str,
    prior_draft: Optional[str] = None,
    feedback: Optional[list[str]] = None,
    *,
    writer_system: str = _WRITER_SYSTEM,
) -> str:
    if gemini_client is None:
        raise RuntimeError(
            "Gemini client is not initialised — check GEMINI_KEY_1 or GOOGLE_API_KEY."
        )

    is_revision = bool(prior_draft and feedback)

    if is_revision:
        user_message = "\n".join([
            f"Topic: {topic}", "",
            "## Research Data", research_data, "",
            "## Previous Draft", prior_draft or "", "",
            "## Critic Feedback (address every item in your revision)",
            *[f"{i + 1}. {f}" for i, f in enumerate(feedback or [])], "",
            "Revise the previous draft to address all critic feedback above. "
            "Preserve every strength of the original; fix only what the feedback identifies. "
            "Output ONLY the revised blog post markdown.",
        ])
    else:
        user_message = "\n".join([
            f"Topic: {topic}", "",
            "## Research Data", research_data, "",
            "Write a complete, publication-ready blog post on this topic using the research above.",
        ])

    model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    result = await gemini_client.generate_text(
        user_message,
        model=model,
        system_prompt=writer_system,
        max_tokens=4096,
        temperature=0.7,
    )

    draft = result["text"].strip()
    if len(draft) < 200:
        raise RuntimeError(
            f"Draft suspiciously short ({len(draft)} chars) — check model output."
        )

    logger.info(
        "blog_automator: draft generated (%d chars, %s)",
        len(draft), "revision" if is_revision else "initial",
    )
    return draft


# ─── Stage 3 — Gemini critic (replaces Anthropic criticNode) ─────────────────

_CRITIC_SYSTEM = """\
You are a Senior Copyeditor and SEO Expert reviewing a technical blog post draft.

Evaluate the draft against three criteria:
1. SEO Optimisation — natural keyword density, scannable H2/H3 header hierarchy,
   opening paragraph quality as an implicit meta description, internal linking opportunities.
2. Structural Readability — logical section flow, heading frequency (one H2 per 300–400 words),
   effective use of bullet and numbered lists, paragraph length (target ≤5 sentences each).
3. Engagement — strength of the opening hook, tone calibrated to audience, specificity of
   actionable takeaways, absence of filler phrases ("it's worth noting", "in conclusion").

Return ONLY a valid JSON object — no markdown fences, no prose before or after:
{
  "score": <integer 0–100>,
  "feedback": [<one actionable critique per issue>],
  "requiresRevision": <true if score < 75 or a critical structural flaw is present, else false>
}

Rules for feedback items:
- Each string must cite a specific heading, paragraph, or sentence pattern in the draft.
- Each string must state the exact change required, not just describe the problem.
- Maximum 6 feedback items. Omit minor style preferences.
- If the draft scores ≥ 75, feedback may list 1–2 small polish notes only."""


def _parse_critique(raw: str) -> dict:
    stripped = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
    stripped = re.sub(r"\s*```\s*$", "", stripped, flags=re.MULTILINE).strip()
    try:
        obj = json.loads(stripped)
    except json.JSONDecodeError:
        return {
            "score":            0,
            "feedback":         [f"Critic returned unparseable JSON: {raw[:300]}"],
            "requiresRevision": True,
        }

    score    = max(0, min(100, int(obj.get("score", 0))))
    feedback = [f for f in obj.get("feedback", []) if isinstance(f, str)]
    requires = bool(obj.get("requiresRevision", score < _REVISION_THRESHOLD))
    return {"score": score, "feedback": feedback, "requiresRevision": requires}


async def _critic_stage(draft: str, *, critic_system: str = _CRITIC_SYSTEM) -> dict:
    if gemini_client is None:
        raise RuntimeError("Gemini client is not initialised.")

    model  = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    result = await gemini_client.generate_text(
        f"Please critique the following blog post draft:\n\n{draft}",
        model=model,
        system_prompt=critic_system,
        max_tokens=1024,
        temperature=0.2,
    )

    report = _parse_critique(result["text"])
    logger.info(
        "blog_automator: critic score=%d requires_revision=%s",
        report["score"], report["requiresRevision"],
    )
    return report


# ─── Stage 4 — Publish → Firestore blogs collection ──────────────────────────

def _extract_title(markdown: str) -> str:
    m = re.search(r"^#\s+(.+)$", markdown, re.MULTILINE)
    return m.group(1).strip() if m else "Untitled Post"


def _derive_excerpt(markdown: str) -> str:
    cleaned = re.sub(r"[#*`_\[\]()\n]", " ", markdown)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:160]


def _publish_to_firestore(db, job_id: str, topic: str, draft: str, critique: dict) -> str:
    title   = _extract_title(draft)
    excerpt = _derive_excerpt(draft)
    now     = datetime.now(timezone.utc)

    doc_ref = db.collection(_BLOGS_COL).document()
    doc_ref.set({
        "title":           title,
        "content":         draft,
        "excerpt":         excerpt,
        "category":        "Hardware",
        "status":          "pending_review",
        "authorType":      "ai_agent",
        "authorName":      "Neuro AI",
        "isPublished":     False,
        "thumbnailUrl":    "",
        "videoUrl":        None,
        "publishAt":       None,
        "commentCount":    0,
        "rejectionNote":   None,
        "critiqueScore":   critique.get("score"),
        "critiqueHistory": [json.dumps(critique)],
        "automatorJobId":  job_id,
        "sourceTopic":     topic,
        "createdAt":       now,
        "updatedAt":       now,
    })

    logger.info("blog_automator: Firestore blog doc created → %s (pending_review)", doc_ref.id)
    return doc_ref.id


# ─── Mock data (mirrors TypeScript mockProvider.ts) ──────────────────────────

_MOCK_RESEARCH = """\
## AI Summary
Artificial intelligence is transforming personal computing via on-device NPUs.

---

### [1] NPU Integration in Consumer CPUs
**URL:** https://example.com/npu-consumer-chips
**Relevance:** 95%

AMD Ryzen AI 300 and Intel Core Ultra now ship with dedicated NPUs (40–50 TOPS),
enabling real-time AI workloads without discrete GPU acceleration."""

_MOCK_DRAFT = """\
# The Future of AI in Personal Computing

On-device intelligence is quietly redefining what laptops and desktops can do.

## From Cloud Dependency to Local Inference

NPUs in AMD Ryzen AI 300 and Intel Core Ultra deliver 40–50 TOPS for local AI tasks.

## Key Takeaways

1. Design for graceful degradation between local and cloud inference.
2. Evaluate quantised models first (GGUF 4-bit).
3. Target 50 ms as the interactive latency budget."""

_MOCK_CRITIQUE = {
    "score":            88,
    "feedback":         ["Lead with the latency figure earlier in the opening paragraph."],
    "requiresRevision": False,
}


# ─── Background pipeline ──────────────────────────────────────────────────────

async def _run_pipeline(job_id: str, topic: str, mock: bool) -> None:
    try:
        db = _db()
    except RuntimeError as exc:
        logger.error("blog_automator: cannot get Firestore for job %s — %s", job_id, exc)
        return

    def update(data: dict) -> None:
        _set_job(db, job_id, data)

    # Load custom prompts once per job so the entire run is consistent.
    # _load_prompts always returns (writer, critic) — never raises.
    writer_system, critic_system = _load_prompts(db)

    try:
        # ── Stage 1: Research ────────────────────────────────────────────────
        update({"stage": "researching", "status": "running"})

        if mock:
            research_data = _MOCK_RESEARCH
            logger.info("blog_automator: mock mode — using synthetic research data")
        else:
            research_data = await _research_stage(topic)

        # ── Stages 2 + 3: Actor-Critic loop ──────────────────────────────────
        draft:    Optional[str]        = None
        critique: Optional[dict]       = None
        feedback: Optional[list[str]]  = None
        critique_history: list[str]    = []

        if mock:
            draft    = _MOCK_DRAFT
            critique = _MOCK_CRITIQUE
            critique_history.append(json.dumps(critique))
            update({"stage": "reviewing", "draftIteration": 1})
        else:
            for iteration in range(_MAX_ITERATIONS):
                update({"stage": "drafting", "draftIteration": iteration + 1})
                draft = await _draft_stage(
                    topic, research_data,
                    prior_draft=draft,
                    feedback=feedback,
                    writer_system=writer_system,
                )

                update({"stage": "reviewing"})
                critique = await _critic_stage(draft, critic_system=critic_system)
                critique_history.append(json.dumps(critique))

                if not critique["requiresRevision"]:
                    logger.info(
                        "blog_automator: critic approved after %d iteration(s) (score=%d)",
                        iteration + 1, critique["score"],
                    )
                    break

                if iteration < _MAX_ITERATIONS - 1:
                    logger.info(
                        "blog_automator: iteration %d score=%d — routing back to writer",
                        iteration + 1, critique["score"],
                    )
                    feedback = critique["feedback"]
                else:
                    logger.info(
                        "blog_automator: critique cap reached after %d iteration(s) "
                        "(score=%d) — forwarding to human review",
                        _MAX_ITERATIONS, critique["score"],
                    )

        # ── Stage 4: Publish → Firestore ─────────────────────────────────────
        update({"stage": "publishing"})
        blog_id = _publish_to_firestore(
            db, job_id, topic, draft or "", critique or {}
        )

        update({
            "stage":           "completed",
            "status":          "completed",
            "blogId":          blog_id,
            "critiqueScore":   (critique or {}).get("score"),
            "critiqueHistory": critique_history,
        })
        logger.info("blog_automator: job %s completed → blogId=%s", job_id, blog_id)

    except Exception as exc:
        logger.exception("blog_automator: pipeline error for job %s", job_id)
        update({"stage": "failed", "status": "failed", "error": str(exc)})


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post(
    "/trigger",
    response_model=TriggerResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_pipeline(
    req: TriggerRequest,
    background_tasks: BackgroundTasks,
    _admin_uid: Annotated[str, Depends(require_admin)] = "",
):
    """
    Queue the AI blog generation pipeline for a given topic.

    Returns HTTP 202 immediately with a `job_id`. Monitor progress by polling
    `GET /api/admin/blog-automator/jobs` or watching
    Firestore `blog_automator_jobs/{job_id}`.

    A 12-hour anti-spam window is enforced — HTTP 429 is returned if the
    automator was triggered less than 12 hours ago.
    """
    if not firebase_admin._apps:  # type: ignore[attr-defined]
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Firebase Admin SDK is not configured.",
        )

    db = fb_firestore.client()
    _check_anti_spam(db)

    job_id = str(uuid.uuid4())
    now    = datetime.now(timezone.utc)

    db.collection(_JOBS_COL).document(job_id).set({
        "jobId":     job_id,
        "topic":     req.topic,
        "mock":      req.mock,
        "status":    "queued",
        "stage":     "queued",
        "createdAt": now,
        "updatedAt": now,
    })
    _record_trigger(db)

    background_tasks.add_task(_run_pipeline, job_id, req.topic, req.mock)

    return TriggerResponse(
        job_id=job_id,
        status="queued",
        message=(
            f"Pipeline queued for topic: '{req.topic}'. "
            f"Track progress at Firestore blog_automator_jobs/{job_id}"
        ),
    )


@router.get("/jobs")
async def list_jobs(
    _admin_uid: Annotated[str, Depends(require_admin)] = "",
    limit: int = 20,
):
    """Return the most recent blog automator jobs, newest-first (max 50)."""
    if not firebase_admin._apps:  # type: ignore[attr-defined]
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Firebase Admin SDK is not configured.",
        )

    db   = fb_firestore.client()
    docs = (
        db.collection(_JOBS_COL)
        .order_by("createdAt", direction=fb_firestore.Query.DESCENDING)
        .limit(min(limit, 50))
        .stream()
    )
    return [d.to_dict() for d in docs]


@router.get("/prompts")
async def get_prompts(
    _admin_uid: Annotated[str, Depends(require_admin)] = "",
):
    """
    Return the active writer and critic system prompts.

    If a custom document exists in Firestore (blog_automator_meta/prompts),
    its values are returned. Otherwise the hardcoded module defaults are returned
    and `isCustom` is False.
    """
    if not firebase_admin._apps:  # type: ignore[attr-defined]
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Firebase Admin SDK is not configured.",
        )

    db   = fb_firestore.client()
    snap = db.collection(_META_COL).document(_PROMPTS_DOC).get()

    if snap.exists:
        data       = snap.to_dict() or {}
        updated_at = data.get("updatedAt")
        return {
            "writerSystem": (data.get("writerSystem") or "").strip() or _WRITER_SYSTEM,
            "criticSystem":  (data.get("criticSystem")  or "").strip() or _CRITIC_SYSTEM,
            "isCustom":      True,
            "updatedAt":     updated_at.isoformat() if updated_at else None,
            "updatedBy":     data.get("updatedBy"),
        }

    return {
        "writerSystem": _WRITER_SYSTEM,
        "criticSystem":  _CRITIC_SYSTEM,
        "isCustom":      False,
        "updatedAt":     None,
        "updatedBy":     None,
    }


@router.put("/prompts")
async def update_prompts(
    req: PromptsRequest,
    _admin_uid: Annotated[str, Depends(require_admin)] = "",
):
    """
    Persist custom writer and critic system prompts to Firestore.

    The saved values are picked up by the next pipeline run via _load_prompts().
    Sending empty strings is rejected (≥20 chars required per field). To revert
    to the hardcoded defaults, delete the Firestore document manually.
    """
    if not firebase_admin._apps:  # type: ignore[attr-defined]
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Firebase Admin SDK is not configured.",
        )

    db = fb_firestore.client()
    db.collection(_META_COL).document(_PROMPTS_DOC).set(
        {
            "writerSystem": req.writerSystem,
            "criticSystem":  req.criticSystem,
            "updatedAt":     datetime.now(timezone.utc),
            "updatedBy":     _admin_uid,
        },
        merge=True,
    )
    logger.info("blog_automator: prompts updated by admin uid=%s", _admin_uid)
    return {"ok": True, "message": "Prompts saved. Next pipeline run will use the updated prompts."}
