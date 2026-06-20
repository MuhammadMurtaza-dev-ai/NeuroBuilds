"""
Listings maintenance router — auto-expire active listings older than 30 days.

The sweep is called:
  1. On a background asyncio task (hourly) started in main.py lifespan.
  2. Via POST /api/admin/listings/sweep-expired (admin-only, for manual/testing use).

For each expired listing:
  - Sets status = 'expired' via Firebase Admin SDK.
  - Writes a 'listing_expired' notification to the seller's subcollection.
  - Writes an audit log entry.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from google.cloud.firestore_v1 import SERVER_TIMESTAMP  # type: ignore[import]

from services.auth_guard import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/listings", tags=["listings-maintenance"])

THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60


def _get_admin_db():
    """Lazily import firebase_admin to avoid import-time errors if SDK is not ready."""
    from firebase_admin import firestore as admin_firestore  # type: ignore[import]
    return admin_firestore.client()


async def run_expired_sweep() -> dict:
    """
    Sweep active listings that have expired and flip them to 'expired'.
    Returns a summary dict with counts.
    """
    try:
        db = await asyncio.to_thread(_get_admin_db)
    except Exception as exc:
        logger.warning("listings_maintenance: firebase_admin not ready — %s", exc)
        return {"skipped": True, "reason": str(exc)}

    now = datetime.now(timezone.utc)
    expired_ids: list[str] = []

    try:
        # Query active listings where expiresAt <= now (new docs) or
        # postedDate <= now - 30 days (legacy docs missing expiresAt).
        listings_ref = db.collection("listings")

        # Stream 1: docs with expiresAt set and past due
        q1 = listings_ref.where("status", "==", "active").where("expiresAt", "<=", now)
        for doc in (await asyncio.to_thread(q1.stream)):
            await asyncio.to_thread(_expire_listing, db, doc, now)
            expired_ids.append(doc.id)

        # Stream 2: legacy docs without expiresAt — use postedDate as proxy
        cutoff = datetime.fromtimestamp(now.timestamp() - THIRTY_DAYS_SECONDS, tz=timezone.utc)
        q2 = (
            listings_ref
            .where("status", "==", "active")
            .where("postedDate", "<=", cutoff)
        )
        for doc in (await asyncio.to_thread(q2.stream)):
            if doc.id in expired_ids:
                continue  # already handled above
            data = doc.to_dict() or {}
            if data.get("expiresAt"):
                continue  # has expiresAt, handled in stream 1
            await asyncio.to_thread(_expire_listing, db, doc, now)
            expired_ids.append(doc.id)

        logger.info("listings_maintenance: expired %d listings", len(expired_ids))
        return {"expired": len(expired_ids), "ids": expired_ids}

    except Exception as exc:
        logger.error("listings_maintenance sweep failed: %s", exc, exc_info=True)
        return {"error": str(exc), "expired": len(expired_ids)}


def _expire_listing(db, doc, now: datetime) -> None:
    """Write the expiry update + notification + audit log for a single listing doc."""
    data = doc.to_dict() or {}
    seller_id: str = data.get("sellerId", "")
    title: str = data.get("title", "Untitled listing")
    listing_id: str = doc.id

    # 1. Set status = 'expired'
    doc.reference.update({
        "status": "expired",
    })

    if not seller_id:
        return

    # 2. Write notification to seller
    notif_ref = db.collection("users").document(seller_id).collection("notifications").document()
    notif_ref.set({
        "type": "listing_expired",
        "title": "Listing expired",
        "body": f'Your listing "{title}" has been deactivated after 30 days. Reactivate it from My Listings.',
        "linkUrl": "/marketplace?view=mine",
        "isRead": False,
        "createdAt": SERVER_TIMESTAMP,
    })

    # 3. Append-only audit log
    audit_ref = db.collection("audit_logs").document()
    audit_ref.set({
        "actorId": "system",
        "action": "listing.expired",
        "meta": {
            "targetId": listing_id,
            "targetType": "listing",
            "title": title,
        },
        "createdAt": SERVER_TIMESTAMP,
    })


@router.post("/sweep-expired")
async def sweep_expired(
    _uid: Annotated[str, Depends(require_admin)],
):
    """Manually trigger the listing expiry sweep. Useful for testing."""
    result = await run_expired_sweep()
    return {"status": "ok", **result}


async def start_background_sweep():
    """
    Long-running asyncio task that sweeps expired listings every hour.
    Call once from the FastAPI lifespan startup.
    """
    while True:
        await asyncio.sleep(3600)  # sleep first — startup sweep would block lifespan
        try:
            result = await run_expired_sweep()
            logger.info("Background sweep result: %s", result)
        except Exception as exc:
            logger.error("Background sweep crashed: %s", exc, exc_info=True)
