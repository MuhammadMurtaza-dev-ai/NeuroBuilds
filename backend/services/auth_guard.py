"""
FastAPI dependency — enforce admin-only access via Firebase JWT custom claims.

The `require_admin` dependency:
  1. Extracts the Bearer token from the Authorization header.
  2. Cryptographically verifies it with the Firebase Admin SDK
     (signature, expiry, audience, issuer, revocation check).
  3. Confirms the token carries the custom claim `{ admin: true }` that was
     baked in by promote_admin.py via firebase_admin.auth.set_custom_user_claims().
  4. Returns the verified UID to the endpoint on success.
  5. Raises an appropriate HTTP error (401/403) on any failure.

Usage
-----
    from services.auth_guard import require_admin
    from fastapi import Depends

    @app.get("/api/admin/something")
    async def sensitive_endpoint(uid: str = Depends(require_admin)):
        return {"message": f"Hello admin {uid}"}
"""

import asyncio
import logging
import os
from typing import Annotated

import firebase_admin
import firebase_admin.auth as fb_auth
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)

# auto_error=False lets us return a clean 401 instead of FastAPI's default 403
_bearer_scheme = HTTPBearer(auto_error=False)

# verify_id_token(check_revoked=True) makes a network call to Google's Identity
# Toolkit API (accounts:lookup) on top of the local cert/signature check. The
# underlying requests/urllib3 session has no timeout of its own, so a transient
# DNS/network blip reaching that host causes several retries with backoff that
# can run 20-30+ seconds — long past the frontend's own request timeout, which
# then misreports it as "backend unreachable" even though the server is up and
# every other endpoint is responding fine. Bound it here, matching the hard-
# timeout pattern already used for Gemini/Mongo calls elsewhere in the backend.
_FIREBASE_AUTH_TIMEOUT_S = float(os.getenv("FIREBASE_AUTH_TIMEOUT_S", "10"))


async def _verify_id_token(token: str) -> dict:
    """asyncio.wait_for-bounded wrapper around fb_auth.verify_id_token."""
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(fb_auth.verify_id_token, token, check_revoked=True),
            timeout=_FIREBASE_AUTH_TIMEOUT_S,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "Firebase token verification timed out after %.0fs (network issue "
            "reaching Google's Identity Toolkit API?).", _FIREBASE_AUTH_TIMEOUT_S,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not verify token — the auth service network call timed out. Retry shortly.",
        )


async def optional_auth(
    request: Request,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(_bearer_scheme),
    ] = None,
) -> str | None:
    """Verify a Firebase ID token when one is provided, but allow anonymous access."""
    if not credentials:
        return None

    if not firebase_admin._apps:  # type: ignore[attr-defined]
        return None

    token = credentials.credentials

    try:
        decoded: dict = await _verify_id_token(token)
    except Exception:
        return None

    request.state.uid = decoded["uid"]
    return decoded["uid"]


async def require_auth(
    request: Request,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(_bearer_scheme),
    ] = None,
) -> str:
    """
    FastAPI dependency — verify any authenticated Firebase user.

    Unlike ``require_admin``, this does NOT check for the ``admin`` custom
    claim; it accepts any valid, non-revoked Firebase ID token.

    Returns
    -------
    str
        The verified Firebase UID.

    Raises
    ------
    HTTP 401  No / malformed / expired / revoked token.
    HTTP 503  Firebase Admin SDK not initialised.
    """
    if not firebase_admin._apps:  # type: ignore[attr-defined]
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is not configured on this server.",
        )

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a valid Firebase ID token "
                   "in the Authorization: Bearer <token> header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    try:
        # _verify_id_token performs blocking network I/O (cert fetch + revocation
        # check) off the event loop, bounded by FIREBASE_AUTH_TIMEOUT_S so a
        # network hiccup fails fast instead of hanging past the client's own
        # request timeout.
        decoded: dict = await _verify_id_token(token)
    except HTTPException:
        raise
    except fb_auth.RevokedIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has been revoked. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except fb_auth.ExpiredIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please refresh your ID token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except fb_auth.CertificateFetchError as exc:
        logger.warning("Certificate fetch error during token verification: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not verify token — certificate fetch failed. Retry shortly.",
        )
    except (fb_auth.InvalidIdTokenError, Exception) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid ID token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Expose the verified UID to downstream middleware (per-UID rate limiting)
    request.state.uid = decoded["uid"]
    return decoded["uid"]


async def require_admin(
    request: Request,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(_bearer_scheme),
    ] = None,
) -> str:
    """
    FastAPI dependency that verifies admin identity via Firebase JWT.

    Returns
    -------
    str
        The verified Firebase UID of the authenticated admin.

    Raises
    ------
    HTTP 401  No / malformed / expired / revoked token.
    HTTP 403  Valid token but the caller is not an admin.
    HTTP 503  Firebase Admin SDK not initialised (misconfigured deployment).
    """
    # ── 0. Confirm Firebase Admin SDK is ready ─────────────────────────────────
    if not firebase_admin._apps:  # type: ignore[attr-defined]
        logger.error(
            "require_admin: Firebase Admin SDK is not initialised. "
            "Set FIREBASE_SERVICE_ACCOUNT_PATH in the environment."
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is not configured on this server.",
        )

    # ── 1. Require Bearer token ────────────────────────────────────────────────
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a valid Firebase ID token "
                   "in the Authorization: Bearer <token> header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # ── 2. Cryptographically verify the ID token ───────────────────────────────
    try:
        # Blocking network I/O (cert fetch + revocation check) — offloaded to a
        # thread and bounded by FIREBASE_AUTH_TIMEOUT_S so a network hiccup
        # reaching Google fails fast instead of hanging past the client's own
        # request timeout.
        decoded: dict = await _verify_id_token(token)

    except HTTPException:
        raise
    except fb_auth.RevokedIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has been revoked. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except fb_auth.ExpiredIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please refresh your ID token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except fb_auth.CertificateFetchError as exc:
        logger.warning("Certificate fetch error during token verification: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not verify token — certificate fetch failed. Retry shortly.",
        )
    except fb_auth.InvalidIdTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid ID token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as exc:
        logger.exception("Unexpected error during token verification")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token verification failed: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # ── 3. Enforce the admin custom claim ─────────────────────────────────────
    # The claim is set by promote_admin.py via set_custom_user_claims().
    # A missing or falsy value means the user has not been promoted.
    if not decoded.get("admin"):
        uid = decoded.get("uid", "<unknown>")
        logger.warning("Forbidden: UID %s attempted admin access without the claim.", uid)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required.",
        )

    request.state.uid = decoded["uid"]
    return decoded["uid"]
