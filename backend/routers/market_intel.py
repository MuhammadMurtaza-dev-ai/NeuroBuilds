"""
Market-intelligence router.

Endpoints (all admin-only):
  POST /api/admin/market-intel/run     body: { "mock"?: bool } — run the analysis now
  GET  /api/admin/market-intel/latest  — return the most recent snapshot

Plus start_market_intel_loop(), a weekly background task started from main.py's
lifespan (mirrors listings_maintenance.start_background_sweep).
"""

import asyncio
import logging
import os
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from services.auth_guard import require_admin
from services.market_intel import read_latest, run_market_analysis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/market-intel", tags=["market-intel"])

_WEEK_SECONDS = 7 * 24 * 3600


def _db_name() -> str:
    return os.getenv("MONGODB_DATABASE", "neurobuilds")


class RunRequest(BaseModel):
    mock: bool = False


@router.post("/run")
async def run_now(
    request: Request,
    body: RunRequest,
    _uid: Annotated[str, Depends(require_admin)],
):
    """Trigger a market-intelligence analysis immediately and return the snapshot."""
    mongo = getattr(request.app.state, "mongo", None)
    try:
        snapshot = await run_market_analysis(
            mongo, _db_name(), mock=body.mock, generated_by="manual"
        )
    except Exception as exc:
        logger.exception("market_intel manual run failed")
        raise HTTPException(
            status_code=503,
            detail=(
                f"Market analysis failed: {exc}. "
                "Ensure the Firebase Admin SDK is initialised."
            ),
        )
    return {"status": "ok", "snapshot": snapshot}


@router.get("/latest")
async def latest(
    request: Request,
    _uid: Annotated[str, Depends(require_admin)],
):
    """Return the most recent stored snapshot, or null if none / Mongo unconfigured."""
    mongo = getattr(request.app.state, "mongo", None)
    if mongo is None:
        return {"status": "ok", "snapshot": None}
    snapshot = await asyncio.to_thread(read_latest, mongo, _db_name())
    return {"status": "ok", "snapshot": snapshot}


async def start_market_intel_loop(mongo_client, db_name: Optional[str] = None) -> None:
    """
    Long-running asyncio task that runs the market analysis weekly.
    Call once from the FastAPI lifespan startup. Sleeps first so startup is not
    blocked; exceptions are logged and swallowed so a transient error never
    crashes the service.
    """
    db = db_name or _db_name()
    logger.info("Market-intel weekly loop started (7-day interval)")
    while True:
        await asyncio.sleep(_WEEK_SECONDS)
        try:
            snap = await run_market_analysis(
                mongo_client, db, mock=False, generated_by="weekly"
            )
            logger.info(
                "Market-intel weekly run complete: %d active, %d categories, %d movers",
                snap.get("activeCount", 0),
                len(snap.get("categories", [])),
                len(snap.get("priceMovements", [])),
            )
        except Exception as exc:
            logger.error("Market-intel weekly run crashed: %s", exc, exc_info=True)
