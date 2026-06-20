"""
Weekly GenAI market-intelligence engine.

Mirrors the project's deterministic-then-narrate split (Layer B → Layer D):

  • collect_listings()  — pull newly posted (24 h) + active-corpus listings from
                          Firestore via the Firebase Admin SDK (sync).
  • aggregate()         — PURE PYTHON, zero LLM: per-category price ranges, hot
                          products (view velocity), dead inventory (old + unseen),
                          and price movements vs the previous snapshot.
  • summarize()         — Gemini narration of the deterministic aggregates
                          (skipped when no API key; supports mock mode).
  • read_latest() /
    write_snapshot()    — MongoDB persistence with an ~8-day TTL so each weekly
                          run still has the prior snapshot to diff prices against.

The resulting snapshot is consumed by:
  • routers/market_intel.py  — admin trigger + GET latest.
  • agent.py market_node     — injects a compact brief into the chat pipeline.
"""

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Hold snapshots for ~8 days. The job runs weekly (7 d); the extra day guarantees
# the previous snapshot is still alive when the next run computes price deltas.
TTL_SECONDS = 8 * 24 * 3600

_DAY_SECONDS = 24 * 3600
_HOT_MAX_AGE_DAYS = 7      # only recent listings count as "hot"
_DEAD_MIN_AGE_DAYS = 14    # active this long…
_DEAD_MAX_VIEWS = 3        # …with this few views is "dead" inventory
_CORPUS_LIMIT = 1000       # bound the active-corpus scan
_TOP_N = 8                 # hot/dead list lengths


def _collection_name() -> str:
    return os.getenv("MONGODB_MARKET_INTEL_COLLECTION", "market_intel")


# ─── Index bootstrap ──────────────────────────────────────────────────────────

def ensure_market_intel_index(mongo_client, db_name: str) -> None:
    """
    Create (or migrate) the TTL index on market_intel.createdAt. Safe to call on
    every startup. Mirrors components.ensure_youtube_cache_index — a collMod
    fallback handles an IndexOptionsConflict from an earlier, different TTL.
    """
    col_name = _collection_name()
    db = mongo_client[db_name]
    col = db[col_name]
    try:
        col.create_index("createdAt", expireAfterSeconds=TTL_SECONDS, background=True)
        logger.info("%s TTL index verified (8-day expiry)", col_name)
    except Exception as exc:
        try:
            db.command({
                "collMod": col_name,
                "index": {"keyPattern": {"createdAt": 1}, "expireAfterSeconds": TTL_SECONDS},
            })
            logger.info("%s TTL index migrated to 8-day expiry via collMod", col_name)
        except Exception as exc2:
            logger.warning(
                "Could not create or migrate %s TTL index: %s / %s", col_name, exc, exc2
            )


# ─── Numeric helpers ──────────────────────────────────────────────────────────

def _num(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _to_dt(v: Any) -> Optional[datetime]:
    """Firestore timestamps arrive as datetime subclasses; strings are tolerated."""
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    if isinstance(v, str):
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _age_days(posted: Any, now: datetime) -> float:
    dt = _to_dt(posted)
    if dt is None:
        return 0.0
    return max(0.0, (now - dt).total_seconds() / _DAY_SECONDS)


# ─── Firestore collection (Layer: data) ───────────────────────────────────────

def _get_admin_db():
    """Lazy import so a missing/un-initialised Admin SDK doesn't break imports."""
    from firebase_admin import firestore as admin_firestore  # type: ignore[import]
    return admin_firestore.client()


def collect_listings(now: datetime) -> tuple[list[dict], list[dict]]:
    """
    Returns (new_listings_24h, active_corpus) as plain dicts.

    new_listings_24h — any listing with postedDate within the last 24 h (single
                       range filter, auto-indexed).
    active_corpus    — up to _CORPUS_LIMIT newest active listings.
    """
    from google.cloud.firestore_v1.base_query import FieldFilter  # noqa: PLC0415

    db = _get_admin_db()
    listings_ref = db.collection("listings")
    cutoff = now - timedelta(seconds=_DAY_SECONDS)

    new_listings: list[dict] = []
    for doc in (
        listings_ref.where(filter=FieldFilter("postedDate", ">=", cutoff)).stream()
    ):
        new_listings.append(_doc_to_dict(doc))

    corpus: list[dict] = []
    for doc in (
        listings_ref
        .where(filter=FieldFilter("status", "==", "active"))
        .order_by("postedDate", direction="DESCENDING")
        .limit(_CORPUS_LIMIT)
        .stream()
    ):
        corpus.append(_doc_to_dict(doc))

    logger.info("market_intel: collected new24h=%d active=%d", len(new_listings), len(corpus))
    return new_listings, corpus


def _doc_to_dict(doc) -> dict:
    data = doc.to_dict() or {}
    return {
        "id": doc.id,
        "title": data.get("title", ""),
        "category": data.get("category") or "uncategorized",
        "price": _num(data.get("price")),
        "views": _num(data.get("views")),
        "condition": data.get("condition", ""),
        "status": data.get("status", ""),
        "postedDate": data.get("postedDate"),
    }


# ─── Deterministic aggregation (Layer B — pure Python, no LLM) ─────────────────

def aggregate(
    new_listings: list[dict],
    corpus: list[dict],
    prev_snapshot: Optional[dict],
    now: datetime,
) -> dict:
    """Compute per-category price stats, hot/dead products, and price movements."""
    # New-listing velocity per category
    new_per_cat: dict[str, int] = {}
    for l in new_listings:
        new_per_cat[l["category"]] = new_per_cat.get(l["category"], 0) + 1

    # Per-category price + view stats over the active corpus
    buckets: dict[str, dict] = {}
    for l in corpus:
        b = buckets.setdefault(l["category"], {"prices": [], "views": []})
        if l["price"] > 0:
            b["prices"].append(l["price"])
        b["views"].append(l["views"])

    categories: list[dict] = []
    for cat, b in buckets.items():
        prices = sorted(b["prices"])
        categories.append({
            "category": cat,
            "activeCount": len(b["views"]),
            "newCount24h": new_per_cat.get(cat, 0),
            "priceMin": round(prices[0]) if prices else 0,
            "priceMax": round(prices[-1]) if prices else 0,
            "priceMedian": round(median(prices)) if prices else 0,
            "priceAvg": round(sum(prices) / len(prices)) if prices else 0,
            "avgViews": round(sum(b["views"]) / len(b["views"])) if b["views"] else 0,
        })
    categories.sort(key=lambda c: c["newCount24h"], reverse=True)

    # Price movements vs the previous weekly snapshot (the "price context")
    prev_by_cat = {
        c["category"]: c for c in (prev_snapshot or {}).get("categories", [])
    }
    movements: list[dict] = []
    for c in categories:
        prev = prev_by_cat.get(c["category"])
        prev_median = (prev or {}).get("priceMedian", 0)
        if prev and prev_median:
            delta_pct = round((c["priceMedian"] - prev_median) / prev_median * 100, 1)
            direction = "up" if delta_pct > 1 else "down" if delta_pct < -1 else "stable"
            movements.append({
                "category": c["category"],
                "previousMedian": prev_median,
                "currentMedian": c["priceMedian"],
                "deltaPct": delta_pct,
                "direction": direction,
            })
    movements.sort(key=lambda m: abs(m["deltaPct"]), reverse=True)

    # Hot products — recent listings ranked by view velocity (views per day)
    hot_candidates = []
    for l in corpus:
        age = _age_days(l["postedDate"], now)
        if age <= _HOT_MAX_AGE_DAYS and l["views"] > 0:
            hot_candidates.append({
                "title": l["title"],
                "category": l["category"],
                "price": round(l["price"]),
                "views": round(l["views"]),
                "velocity": round(l["views"] / max(age, 0.5), 1),
            })
    hot = sorted(hot_candidates, key=lambda x: x["velocity"], reverse=True)[:_TOP_N]

    # Dead inventory — old active listings nobody is looking at
    dead_candidates = []
    for l in corpus:
        age = _age_days(l["postedDate"], now)
        if age >= _DEAD_MIN_AGE_DAYS and l["views"] <= _DEAD_MAX_VIEWS:
            dead_candidates.append({
                "title": l["title"],
                "category": l["category"],
                "price": round(l["price"]),
                "views": round(l["views"]),
                "ageDays": round(age),
            })
    dead = sorted(dead_candidates, key=lambda x: x["ageDays"], reverse=True)[:_TOP_N]

    return {
        "categories": categories,
        "hot": hot,
        "dead": dead,
        "priceMovements": movements,
    }


# ─── LLM narration (Layer D — optional) ───────────────────────────────────────

_SUMMARY_SYSTEM = (
    "You are a PC-hardware market analyst for the NeuroBuilds marketplace. "
    "You are given pre-computed, deterministic statistics. Write a concise "
    "(120-180 word) market brief for sellers and buyers covering: what is hot, "
    "where prices are moving, and what inventory is stale. Do NOT invent numbers "
    "or products — cite only the figures provided. Plain, factual prose; no markdown."
)


def _mock_summary(aggregates: dict) -> str:
    hot = ", ".join(h["title"] for h in aggregates["hot"][:3]) or "no standout movers"
    movers = aggregates["priceMovements"][:2]
    move_txt = "; ".join(
        f"{m['category']} {m['direction']} {m['deltaPct']:+}%" for m in movers
    ) or "prices broadly stable"
    dead_n = len(aggregates["dead"])
    return (
        f"[MOCK] Weekly market pulse: demand is concentrated around {hot}. "
        f"Price movement: {move_txt}. {dead_n} listing(s) flagged as stale inventory. "
        "Sellers should reprice slow movers; buyers may find value in stale categories."
    )


async def summarize(aggregates: dict, *, mock: bool = False) -> str:
    """Narrate the deterministic aggregates. Returns '' when no LLM is available."""
    if mock:
        return _mock_summary(aggregates)

    try:
        from services.gemini_manager import gemini_client  # noqa: PLC0415
    except Exception:
        gemini_client = None  # type: ignore[assignment]

    if gemini_client is None:
        logger.info("market_intel: gemini_client unavailable — storing snapshot without summary")
        return ""

    import json  # noqa: PLC0415
    prompt = (
        "Deterministic market statistics (JSON):\n"
        + json.dumps({
            "categories": aggregates["categories"],
            "priceMovements": aggregates["priceMovements"],
            "hot": aggregates["hot"],
            "dead": aggregates["dead"],
        }, default=str)
    )
    try:
        result = await gemini_client.generate_text(
            prompt, system_prompt=_SUMMARY_SYSTEM, temperature=0.5, max_tokens=512
        )
        text = result.get("text", "") if isinstance(result, dict) else str(result)
        return text.strip()
    except Exception as exc:
        logger.warning("market_intel: summary generation failed — %s", exc)
        return ""


# ─── MongoDB persistence ──────────────────────────────────────────────────────

def write_snapshot(mongo_client, db_name: str, snapshot: dict) -> None:
    mongo_client[db_name][_collection_name()].insert_one(dict(snapshot))


def read_latest(mongo_client, db_name: str) -> Optional[dict]:
    """Most recent snapshot (without the Mongo _id), or None."""
    if mongo_client is None:
        return None
    return mongo_client[db_name][_collection_name()].find_one(
        {}, {"_id": 0}, sort=[("createdAt", -1)]
    )


# ─── Orchestrator ─────────────────────────────────────────────────────────────

async def run_market_analysis(
    mongo_client,
    db_name: str,
    *,
    mock: bool = False,
    generated_by: str = "manual",
) -> dict:
    """
    Full collect → aggregate → summarize → persist cycle. Returns the snapshot.
    Firestore/Mongo I/O runs in worker threads so the event loop never blocks.
    """
    now = datetime.now(tz=timezone.utc)

    prev = await asyncio.to_thread(read_latest, mongo_client, db_name) if mongo_client is not None else None
    new_listings, corpus = await asyncio.to_thread(collect_listings, now)
    aggregates = aggregate(new_listings, corpus, prev, now)
    summary = await summarize(aggregates, mock=mock)

    snapshot = {
        "createdAt":   now,
        "windowStart": now - timedelta(seconds=_DAY_SECONDS),
        "windowEnd":   now,
        "generatedBy": generated_by,
        "newCount24h": len(new_listings),
        "activeCount": len(corpus),
        "categories":  aggregates["categories"],
        "hot":         aggregates["hot"],
        "dead":        aggregates["dead"],
        "priceMovements": aggregates["priceMovements"],
        "summary":     summary,
    }

    if mongo_client is not None:
        try:
            await asyncio.to_thread(write_snapshot, mongo_client, db_name, snapshot)
        except Exception as exc:
            logger.warning("market_intel: snapshot write failed — %s", exc)

    return snapshot


# ─── Compact brief for the AI pipeline ────────────────────────────────────────

def format_brief(snapshot: Optional[dict]) -> str:
    """Render a snapshot into a short text block for agent.py's Layer-D context."""
    if not snapshot:
        return ""
    lines: list[str] = []
    if snapshot.get("summary"):
        lines.append(snapshot["summary"])

    movements = snapshot.get("priceMovements", [])[:5]
    if movements:
        lines.append("Price movements (median, week-over-week):")
        for m in movements:
            arrow = "↑" if m["direction"] == "up" else "↓" if m["direction"] == "down" else "→"
            lines.append(
                f"  {arrow} {m['category']}: {m['deltaPct']:+}% "
                f"(Rs {m['previousMedian']} → Rs {m['currentMedian']})"
            )

    hot = snapshot.get("hot", [])[:5]
    if hot:
        lines.append("Hot (high demand): " + ", ".join(f"{h['title']} (Rs {h['price']})" for h in hot))

    cats = snapshot.get("categories", [])[:6]
    if cats:
        lines.append("Category price ranges (active listings):")
        for c in cats:
            lines.append(
                f"  {c['category']}: Rs {c['priceMin']}–{c['priceMax']} "
                f"(median Rs {c['priceMedian']}, {c['activeCount']} active)"
            )

    return "\n".join(lines)
