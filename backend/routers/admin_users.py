"""
Admin user-management router.

Exposes role assignment as a privileged server-side operation so that the two
sources of admin truth stay in sync:

  1. Firestore   users/{uid}.role        — read by the frontend role hooks and
                                            firestore.rules isModerator() fallback.
  2. JWT custom claim  { admin: true }   — read by firestore.rules isAdmin() and
                                            the FastAPI require_admin guard.

The frontend RoleAssignmentMatrix can only write the Firestore field (and even
that is blocked by the rules for the `role` key). Setting the cryptographic
custom claim requires the Admin SDK, which only the server holds — hence this
endpoint. Every call is gated by require_admin.

Endpoint
--------
POST /api/admin/users/{uid}/role   body: { "role": "user|vendor|moderator|admin" }
"""

import asyncio
import logging

import firebase_admin
import firebase_admin.auth as fb_auth
from firebase_admin import firestore
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Annotated

from services.auth_guard import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/users", tags=["admin-users"])

_VALID_ROLES = {"user", "vendor", "moderator", "admin"}


class RoleUpdateRequest(BaseModel):
    role: str


class RoleUpdateResponse(BaseModel):
    uid: str
    role: str
    admin_claim: bool
    requires_relogin: bool


def _apply_role(uid: str, role: str) -> None:
    """Synchronous Admin-SDK work: Firestore field + JWT custom claim."""
    db = firestore.client()
    db.collection("users").document(uid).set({"role": role}, merge=True)

    # The admin claim is the security-critical half. Set it true only for the
    # admin role; clear it for every other role so a demotion actually revokes
    # privileges. set_custom_user_claims(uid, None) wipes all claims — this app
    # uses no other custom claims, so that is the correct "not admin" state.
    if role == "admin":
        fb_auth.set_custom_user_claims(uid, {"admin": True})
    else:
        fb_auth.set_custom_user_claims(uid, None)

    # Revoke refresh tokens so the change can't be deferred indefinitely by a
    # long-lived session — the next ID-token refresh re-reads the new claim.
    fb_auth.revoke_refresh_tokens(uid)


@router.post("/{uid}/role", response_model=RoleUpdateResponse)
async def set_user_role(
    uid: str,
    req: RoleUpdateRequest,
    admin_uid: Annotated[str, Depends(require_admin)] = "",
):
    """
    Assign a role to a user, updating BOTH the Firestore role field and the
    Firebase JWT custom claim atomically (from the caller's perspective).

    Guarded by require_admin — only a caller whose token already carries the
    admin claim may reassign roles, which closes the self-service escalation
    hole the client-only path left open.
    """
    role = req.role.strip().lower()
    if role not in _VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role '{req.role}'. Must be one of: {', '.join(sorted(_VALID_ROLES))}.",
        )

    # Guard against self-demotion locking the last admin out of the workspace.
    if uid == admin_uid and role != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove your own admin role. Ask another admin to do it.",
        )

    if not firebase_admin._apps:  # type: ignore[attr-defined]
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is not configured on this server.",
        )

    try:
        await asyncio.to_thread(_apply_role, uid, role)
    except fb_auth.UserNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No Firebase Auth user exists for uid '{uid}'.",
        )
    except Exception as exc:
        logger.exception("Failed to set role for uid=%s", uid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update role: {exc}",
        )

    logger.info("Admin %s set uid=%s role=%s", admin_uid, uid, role)
    return RoleUpdateResponse(
        uid=uid,
        role=role,
        admin_claim=(role == "admin"),
        requires_relogin=True,
    )
