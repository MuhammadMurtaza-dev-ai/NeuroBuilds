"""
Phone verification via WhatsApp OTP.

POST /api/verify/request
    Requires: Firebase Bearer token (any authenticated user)
    Body:     { "phone": "+923001234567" }
    1. Generates a cryptographically random 6-digit OTP.
    2. Writes it to Firestore `phone_verifications/{uid}` (5-minute TTL).
    3. POSTs { phone, otp } to the local WhatsApp gateway over localhost.

POST /api/verify/confirm
    Requires: Firebase Bearer token (same user)
    Body:     { "phone": "+923001234567", "otp": "123456" }
    1. Reads the pending OTP from Firestore.
    2. Checks expiry and constant-time token equality.
    3. Atomically writes { isVerified: true, phoneNumber } to users/{uid}.
    4. Deletes the pending verification document.
"""

import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator

import firebase_admin
from firebase_admin import firestore as fb_firestore

from services.auth_guard import require_auth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/verify", tags=["verification"])

_PENDING_COL = "phone_verifications"
_RATE_COL    = "otp_request_limits"
_E164_RE     = re.compile(r"^\+\d{7,15}$")

# Brute-force / spam protection
_MAX_OTP_ATTEMPTS    = 5          # failed /confirm tries before the OTP is invalidated
_REQUEST_COOLDOWN_S  = 30         # min seconds between /request calls per UID
_HOURLY_REQUEST_CAP  = 5          # max /request calls per rolling hour per UID


# ── Config helpers ────────────────────────────────────────────────────────────

def _gateway_url() -> str:
    return os.getenv("WHATSAPP_GATEWAY_URL", "http://127.0.0.1:3001").rstrip("/")

def _gateway_secret() -> str:
    return os.getenv("GATEWAY_SECRET", "")


# ── Request/response models ───────────────────────────────────────────────────

class VerifyRequestBody(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not _E164_RE.fullmatch(v.strip()):
            raise ValueError("phone must be in E.164 format, e.g. +923001234567")
        return v.strip()


class VerifyConfirmBody(BaseModel):
    phone: str
    otp: str

    @field_validator("otp")
    @classmethod
    def validate_otp(cls, v: str) -> str:
        if not re.fullmatch(r"\d{6}", v.strip()):
            raise ValueError("otp must be exactly 6 digits")
        return v.strip()

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not _E164_RE.fullmatch(v.strip()):
            raise ValueError("phone must be in E.164 format")
        return v.strip()


# ── Internal helpers ──────────────────────────────────────────────────────────

def _get_firestore():
    if not firebase_admin._apps:  # type: ignore[attr-defined]
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is not configured on this server.",
        )
    return fb_firestore.client()


def _generate_otp() -> str:
    """Cryptographically random 6-digit string, uniform in [100000, 999999]."""
    return str(secrets.randbelow(900_000) + 100_000)


def _as_utc(dt: datetime | None) -> datetime | None:
    """Firestore Timestamps come back tz-aware, but guard anyway."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _enforce_request_rate_limit(db, uid: str, now: datetime) -> None:
    """
    Per-UID OTP request throttle, persisted in Firestore `otp_request_limits/{uid}`:
      * cooldown — at most 1 request per _REQUEST_COOLDOWN_S seconds
      * rolling hourly window — at most _HOURLY_REQUEST_CAP requests per hour
    Raises HTTP 429 when either limit is hit; otherwise records this request.
    The counter is updated BEFORE the WhatsApp dispatch so failed dispatches
    still count — the limit exists to protect gateway cost, not UX.
    """
    rate_ref = db.collection(_RATE_COL).document(uid)

    try:
        snap = rate_ref.get()
    except Exception:
        logger.exception("Rate-limit read failed for uid=%s", uid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check request limits. Please try again.",
        )

    window_start = now
    count        = 1

    if snap.exists:
        data         = snap.to_dict() or {}
        last_request = _as_utc(data.get("lastRequestAt"))
        prev_window  = _as_utc(data.get("windowStart"))
        prev_count   = int(data.get("count", 0))

        if last_request is not None:
            elapsed = (now - last_request).total_seconds()
            if elapsed < _REQUEST_COOLDOWN_S:
                retry_after = int(_REQUEST_COOLDOWN_S - elapsed) + 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Please wait {retry_after} seconds before requesting another code.",
                    headers={"Retry-After": str(retry_after)},
                )

        if prev_window is not None and now - prev_window < timedelta(hours=1):
            if prev_count >= _HOURLY_REQUEST_CAP:
                retry_after = int((prev_window + timedelta(hours=1) - now).total_seconds()) + 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many verification requests. Please try again later.",
                    headers={"Retry-After": str(retry_after)},
                )
            window_start = prev_window
            count        = prev_count + 1

    try:
        rate_ref.set({
            "lastRequestAt": now,
            "windowStart":   window_start,
            "count":         count,
        })
    except Exception:
        logger.exception("Rate-limit write failed for uid=%s", uid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record request. Please try again.",
        )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/request", status_code=status.HTTP_200_OK)
async def request_verification(
    body: VerifyRequestBody,
    uid: Annotated[str, Depends(require_auth)],
):
    """Generate an OTP, persist it to Firestore, and dispatch it via WhatsApp."""
    db  = _get_firestore()
    now = datetime.now(timezone.utc)

    # Throttle: 1 request / 30 s and 5 requests / hour per UID (raises 429).
    _enforce_request_rate_limit(db, uid, now)

    otp = _generate_otp()

    # Persist — overwrite any previous pending entry for this UID so only the
    # latest OTP is ever valid (prevents replay of stale codes).
    try:
        db.collection(_PENDING_COL).document(uid).set({
            "otp":       otp,
            "phone":     body.phone,
            "expiresAt": now + timedelta(minutes=5),
            "createdAt": now,
            "attempts":  0,
        })
    except Exception:
        logger.exception("Firestore write failed for uid=%s", uid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to store verification token. Please try again.",
        )

    # Build request to the WhatsApp gateway
    headers: dict[str, str] = {"Content-Type": "application/json"}
    secret = _gateway_secret()
    if secret:
        headers["Authorization"] = f"Bearer {secret}"

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(
                f"{_gateway_url()}/send-otp",
                json={"phone": body.phone, "otp": otp},
                headers=headers,
            )
        resp.raise_for_status()
        logger.info("OTP dispatched via WhatsApp gateway for uid=%s", uid)

    except httpx.ConnectError:
        logger.error("WhatsApp gateway unreachable at %s", _gateway_url())
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "WhatsApp gateway is not running. "
                "Start it with: cd backend/whatsapp-gateway && node index.js"
            ),
        )
    except httpx.TimeoutException:
        logger.error("WhatsApp gateway timed out for uid=%s", uid)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="WhatsApp gateway did not respond in time. Please try again.",
        )
    except httpx.HTTPStatusError as exc:
        body_text = exc.response.text[:300]
        logger.error(
            "Gateway returned HTTP %s for uid=%s: %s",
            exc.response.status_code, uid, body_text,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gateway error ({exc.response.status_code}): {body_text}",
        )

    return {"success": True, "message": "Verification code sent via WhatsApp."}


@router.post("/confirm", status_code=status.HTTP_200_OK)
async def confirm_verification(
    body: VerifyConfirmBody,
    uid: Annotated[str, Depends(require_auth)],
):
    """Validate the submitted OTP and mark the user as verified in Firestore."""
    db = _get_firestore()

    try:
        ref  = db.collection(_PENDING_COL).document(uid)
        snap = ref.get()
    except Exception:
        logger.exception("Firestore read failed for uid=%s", uid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve verification token. Please try again.",
        )

    if not snap.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No pending verification found. Please request a new code.",
        )

    record     = snap.to_dict()
    expires_at = _as_utc(record["expiresAt"])
    now        = datetime.now(timezone.utc)
    attempts   = int(record.get("attempts", 0))

    if now > expires_at:
        ref.delete()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Verification code has expired. Please request a new one.",
        )

    # Brute-force guard: invalidate the OTP after _MAX_OTP_ATTEMPTS failures.
    if attempts >= _MAX_OTP_ATTEMPTS:
        ref.delete()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. The code has been invalidated — request a new one.",
        )

    def _register_failure(reason: str) -> None:
        """Count a failed attempt; invalidate the OTP once the cap is hit."""
        remaining = _MAX_OTP_ATTEMPTS - (attempts + 1)
        try:
            if remaining <= 0:
                ref.delete()
            else:
                ref.update({"attempts": attempts + 1})
        except Exception:
            logger.exception("Attempt-counter update failed for uid=%s", uid)
        if remaining <= 0:
            logger.warning("OTP invalidated after %d failed attempts: uid=%s", _MAX_OTP_ATTEMPTS, uid)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed attempts. The code has been invalidated — request a new one.",
            )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{reason} {remaining} attempt(s) remaining.",
        )

    # Constant-time comparison prevents timing oracle on the OTP.
    if not secrets.compare_digest(record["otp"], body.otp):
        _register_failure("Invalid verification code.")

    if record.get("phone") != body.phone:
        _register_failure("Phone number does not match the one the code was sent to.")

    # Commit verification to the user profile and clean up the pending doc.
    try:
        db.collection("users").document(uid).set(
            {"isVerified": True, "phoneNumber": body.phone},
            merge=True,
        )
        ref.delete()
        logger.info("Seller verified: uid=%s phone=%s", uid, body.phone)
    except Exception:
        logger.exception("Profile update failed for uid=%s", uid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Verification succeeded but profile update failed. Contact support.",
        )

    return {"success": True, "message": "Phone number verified successfully."}
