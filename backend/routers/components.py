"""
GET /api/components/reviews — YouTube review proxy with server-side MongoDB TTL cache.

Cache collection : youtube_cache
TTL              : 24 hours (MongoDB TTL index on the `cachedAt` field) — matches
                   the SRS §2.2.1 / UC-04 review-cache constraint.
"""

import asyncio
import logging
import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

router = APIRouter()
logger = logging.getLogger(__name__)

_YT_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
_REVIEW_CHANNELS = "Gamers Nexus OR Hardware Unboxed OR Linus Tech Tips OR Bitwit OR TechSource"
_TTL_SECONDS = 24 * 3600  # 24 hours — SRS §2.2.1 / UC-04 review-cache constraint


# ── Index bootstrap ───────────────────────────────────────────────────────────

def ensure_youtube_cache_index(mongo_client, db_name: str) -> None:
    """
    Create (or update) the TTL index on youtube_cache.cachedAt. Safe to call on
    every startup.

    MongoDB refuses a re-create_index() that changes expireAfterSeconds on an
    existing index (IndexOptionsConflict). So if the index already exists with a
    different TTL — e.g. an old 7-day deployment being migrated to 24 hours — we
    fall back to a collMod to mutate the expiry in place instead of failing.
    """
    db  = mongo_client[db_name]
    col = db["youtube_cache"]
    try:
        col.create_index("cachedAt", expireAfterSeconds=_TTL_SECONDS, background=True)
        logger.info("youtube_cache TTL index verified (24-hour expiry)")
    except Exception as exc:
        # Likely IndexOptionsConflict — index exists with a stale TTL. Migrate it.
        try:
            db.command({
                "collMod": "youtube_cache",
                "index": {"keyPattern": {"cachedAt": 1}, "expireAfterSeconds": _TTL_SECONDS},
            })
            logger.info("youtube_cache TTL index migrated to 24-hour expiry via collMod")
        except Exception as exc2:
            logger.warning(
                "Could not create or migrate youtube_cache TTL index: %s / %s", exc, exc2
            )


# ── Cache helpers ─────────────────────────────────────────────────────────────

def _cache_lookup(col, key: str) -> list[dict] | None:
    doc = col.find_one({"_id": key}, {"_id": 0, "videos": 1})
    return doc["videos"] if doc else None


def _cache_store(col, key: str, videos: list[dict]) -> None:
    col.replace_one(
        {"_id": key},
        {"_id": key, "videos": videos, "cachedAt": datetime.now(tz=timezone.utc)},
        upsert=True,
    )


# ── YouTube fetch ─────────────────────────────────────────────────────────────

async def _fetch_youtube(component: str, api_key: str) -> list[dict]:
    params = {
        "part":       "snippet",
        "type":       "video",
        "maxResults": "3",
        "q":          f"{component} review ({_REVIEW_CHANNELS})",
        "key":        api_key,
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(_YT_SEARCH_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    return [
        {
            "videoId":      item["id"]["videoId"],
            "title":        item["snippet"]["title"],
            "channelTitle": item["snippet"]["channelTitle"],
            "thumbnail": (
                item["snippet"]["thumbnails"].get("medium", {}).get("url")
                or item["snippet"]["thumbnails"].get("default", {}).get("url", "")
            ),
        }
        for item in data.get("items", [])
    ]


# ── Route ─────────────────────────────────────────────────────────────────────

@router.get("/api/components/reviews")
async def component_reviews(
    request: Request,
    component: str = Query(..., min_length=1, description="Component name, e.g. 'RTX 4070'"),
):
    """
    Returns up to 3 YouTube reviews (Gamers Nexus / Hardware Unboxed / LTT)
    for the requested hardware component.

    Results are cached in MongoDB Atlas `youtube_cache` for 7 days via a TTL
    index on the `cachedAt` field. The `X-Cache: HIT|MISS` response header
    exposes cache status so the frontend telemetry tracker can record it.

    Returns an empty array when YOUTUBE_API_KEY is not configured.
    """
    api_key = os.getenv("YOUTUBE_API_KEY", "").strip()
    if not api_key:
        return JSONResponse(content=[], headers={"X-Cache": "MISS"})

    mongo = getattr(request.app.state, "mongo", None)
    col = None
    if mongo is not None:
        db_name = os.getenv("MONGODB_DATABASE", "neurobuilds")
        col = mongo[db_name]["youtube_cache"]

    cache_key = component.strip().lower()

    # ── Cache read ────────────────────────────────────────────────────────────
    if col is not None:
        try:
            cached = await asyncio.to_thread(_cache_lookup, col, cache_key)
            if cached is not None:
                logger.debug("youtube_cache HIT for %r", cache_key)
                return JSONResponse(content=cached, headers={"X-Cache": "HIT"})
        except Exception as exc:
            logger.warning("youtube_cache read error: %s", exc)

    # ── YouTube API call ──────────────────────────────────────────────────────
    try:
        videos = await _fetch_youtube(component, api_key)
    except Exception as exc:
        logger.warning("YouTube API fetch failed for %r: %s", component, exc)
        return JSONResponse(content=[], headers={"X-Cache": "MISS"})

    # ── Cache write ───────────────────────────────────────────────────────────
    if col is not None:
        try:
            await asyncio.to_thread(_cache_store, col, cache_key, videos)
        except Exception as exc:
            logger.warning("youtube_cache write error: %s", exc)

    return JSONResponse(content=videos, headers={"X-Cache": "MISS"})
