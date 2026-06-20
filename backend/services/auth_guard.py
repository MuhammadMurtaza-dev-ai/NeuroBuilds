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

import logging
from typing import Annotated

import firebase_admin
import firebase_admin.auth as fb_auth
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)

# auto_error=False lets us return a clean 401 instead of FastAPI's default 403
_bearer_scheme = HTTPBearer(auto_error=False)


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
        decoded: dict = fb_auth.verify_id_token(token, check_revoked=True)
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
        decoded: dict = fb_auth.verify_id_token(token, check_revoked=True)

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
