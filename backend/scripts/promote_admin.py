"""
Admin Promotion Script — bootstrap the first admin account.

Sets both a Firestore role field AND a Firebase JWT custom claim so every
layer of the security stack (Firestore rules, FastAPI guard, frontend hook)
independently verifies admin status.

Usage
-----
  # Option A — pass key path directly
  python scripts/promote_admin.py --key /path/to/serviceAccount.json

  # Option B — use the standard ADC environment variable
  GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \\
    python scripts/promote_admin.py

  # Option C — Application Default Credentials (GCP / Cloud Shell)
  python scripts/promote_admin.py

The target user MUST already exist in Firebase Auth (i.e. they have signed up
at least once).  After promotion, ask them to sign out and sign back in so the
new custom claim appears in their refreshed ID token.
"""

import argparse
import os
import sys

# ── Dependency guard ───────────────────────────────────────────────────────────
try:
    import firebase_admin
    from firebase_admin import auth, credentials, firestore
except ImportError:
    sys.exit(
        "[✗] firebase-admin is not installed.\n"
        "    Run: pip install firebase-admin"
    )

# ── Promotion target ───────────────────────────────────────────────────────────
TARGET_EMAIL = "70135799@student.uol.edu.pk"
ADMIN_CLAIMS = {"admin": True}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _resolve_credentials(key_path: str | None):
    """Return an appropriate firebase_admin credentials object."""
    # 1. Explicit --key argument takes highest priority
    if key_path:
        if not os.path.isfile(key_path):
            sys.exit(f"[✗] Key file not found: {key_path}")
        return credentials.Certificate(key_path)

    # 2. Standard GOOGLE_APPLICATION_CREDENTIALS env var
    env_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if env_path:
        if not os.path.isfile(env_path):
            sys.exit(
                f"[✗] GOOGLE_APPLICATION_CREDENTIALS points to a missing file:\n"
                f"    {env_path}"
            )
        return credentials.Certificate(env_path)

    # 3. Application Default Credentials (GCP, Cloud Shell, gcloud auth login)
    print("[INFO] No key file specified — falling back to Application Default Credentials.")
    return credentials.ApplicationDefault()


# ── Main ───────────────────────────────────────────────────────────────────────

def promote(key_path: str | None) -> None:
    cred = _resolve_credentials(key_path)

    # Initialise once; safe to call in scripts run multiple times
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)

    db = firestore.client()

    # ── 1. Resolve UID from email ──────────────────────────────────────────────
    print(f"\n[→] Looking up Firebase Auth user: {TARGET_EMAIL}")
    try:
        user = auth.get_user_by_email(TARGET_EMAIL)
    except auth.UserNotFoundError:
        sys.exit(
            f"\n[✗] No Firebase Auth account found for '{TARGET_EMAIL}'.\n"
            "    The user must complete sign-up before being promoted."
        )
    except Exception as exc:
        sys.exit(f"\n[✗] Failed to look up user: {exc}")

    uid = user.uid
    print(f"    UID resolved: {uid}")

    # ── 2. Write role to Firestore ─────────────────────────────────────────────
    user_ref = db.collection("users").document(uid)
    try:
        user_ref.set({"role": "admin"}, merge=True)
    except Exception as exc:
        sys.exit(f"\n[✗] Firestore write failed: {exc}")
    print(f"[✓] Firestore  users/{uid}.role = 'admin'")

    # ── 3. Bake custom claim into JWT ──────────────────────────────────────────
    # This claim is cryptographically signed by Google's servers and cannot be
    # forged by clients.  Firestore rules read it as request.auth.token.admin.
    try:
        auth.set_custom_user_claims(uid, ADMIN_CLAIMS)
    except Exception as exc:
        sys.exit(f"\n[✗] set_custom_user_claims failed: {exc}")
    print(f"[✓] Custom JWT claim set: {ADMIN_CLAIMS}")

    # ── Summary ────────────────────────────────────────────────────────────────
    print()
    print("=" * 62)
    print("  Promotion complete.")
    print(f"  Email : {TARGET_EMAIL}")
    print(f"  UID   : {uid}")
    print()
    print("  Firestore role : admin")
    print("  JWT claim      : { admin: true }")
    print()
    print("  ⚠  The user must SIGN OUT and SIGN BACK IN for the new")
    print("     custom claim to appear in their refreshed ID token.")
    print("=" * 62)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Promote a Firebase user to admin (Firestore role + JWT claim).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--key",
        metavar="PATH",
        default=None,
        help="Path to a Firebase service account JSON key file.",
    )
    args = parser.parse_args()
    promote(args.key)
