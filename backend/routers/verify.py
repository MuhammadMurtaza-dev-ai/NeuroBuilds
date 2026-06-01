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
_E164_RE     = re.compile(r"^\+\d{7,15}$")


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


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/request", status_code=status.HTTP_200_OK)
async def request_verification(
    body: VerifyRequestBody,
    uid: Annotated[str, Depends(require_auth)],
):
    """Generate an OTP, persist it to Firestore, and dispatch it via WhatsApp."""
    db  = _get_firestore()
    otp = _generate_otp()
    now = datetime.now(timezone.utc)

    # Persist — overwrite any previous pending entry for this UID so only the
    # latest OTP is ever valid (prevents replay of stale codes).
    try:
        db.collection(_PENDING_COL).document(uid).set({
            "otp":       otp,
            "phone":     body.phone,
            "expiresAt": now + timedelta(minutes=5),
            "createdAt": now,
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
    expires_at: datetime = record["expiresAt"]
    now        = datetime.now(timezone.utc)

    # Firestore Timestamps are returned as tz-aware datetimes; guard anyway.
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if now > expires_at:
        ref.delete()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Verification code has expired. Please request a new one.",
        )

    # Constant-time comparison prevents timing oracle on the OTP.
    if not secrets.compare_digest(record["otp"], body.otp):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid verification code. Please check and try again.",
        )

    if record.get("phone") != body.phone:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Phone number does not match the one the code was sent to.",
        )

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
