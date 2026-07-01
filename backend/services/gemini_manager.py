"""
NeuroBuilds — Gemini API Client (single-key)

Reads GOOGLE_API_KEY from the environment and exposes a GeminiClient
singleton used by blog_automator.py and market_intel.py.

Public singletons (import and use directly):

    from services.gemini_manager import gemini_client

    result = await gemini_client.generate_text(prompt, system_prompt="...")
    result = await gemini_client.embed_content(text)
"""

import asyncio
import logging
import os
import time
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_DEFAULT_TEXT_MODEL = "gemini-2.0-flash"
_EMBEDDING_MODEL    = "text-embedding-004"  # 768 dims — matches Atlas vector_index

# Retry tuning for transient Gemini server errors (503 UNAVAILABLE / 429 / overload).
# Free tier throttles hard and models get "high demand" spikes; a single 503 must
# not kill a whole blog-automator / market-intel job.
_MAX_TRANSIENT_RETRIES = int(os.getenv("GEMINI_MAX_RETRIES", "2"))
_RETRY_BASE_DELAY_S    = 2.0   # exponential backoff base (2s, 4s, 8s, …)

# Transient HTTP status codes worth retrying / falling back on.
_TRANSIENT_STATUSES = {429, 500, 502, 503, 504}
_TRANSIENT_MARKERS  = (
    "unavailable", "high demand", "overloaded", "try again",
    "deadline", "timeout", "temporarily",
)


def _is_transient(err: Exception) -> bool:
    """True when an error looks temporary (server overload / rate limit)."""
    code = getattr(err, "code", None) or getattr(err, "status_code", None)
    if isinstance(code, int) and code in _TRANSIENT_STATUSES:
        return True
    msg = str(err).lower()
    if any(str(s) in msg for s in _TRANSIENT_STATUSES):
        return True
    return any(marker in msg for marker in _TRANSIENT_MARKERS)


def _fallback_models(primary: str) -> list[str]:
    """
    Ordered model chain to try when `primary` is overloaded. A comma-separated
    GEMINI_FALLBACK_MODELS env var overrides the built-in chain. The primary is
    always tried first and de-duplicated out of the fallbacks.
    """
    env = os.getenv("GEMINI_FALLBACK_MODELS", "").strip()
    if env:
        chain = [m.strip() for m in env.split(",") if m.strip()]
    else:
        chain = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"]
    ordered = [primary] + [m for m in chain if m != primary]
    # preserve order, drop dupes
    seen: set[str] = set()
    return [m for m in ordered if not (m in seen or seen.add(m))]


class GeminiClient:
    """Async wrapper around the native google-genai SDK."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    async def generate_text(
        self,
        prompt: str,
        *,
        model: str = _DEFAULT_TEXT_MODEL,
        system_prompt: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> dict:
        start_ms = time.monotonic() * 1_000

        from google import genai
        from google.genai import types as genai_types

        def _sync_call(target_model: str) -> str:
            client = genai.Client(api_key=self._api_key)
            cfg = genai_types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
                system_instruction=system_prompt,
            )
            resp = client.models.generate_content(
                model=target_model, contents=prompt, config=cfg
            )
            return resp.text or ""

        last_err: Optional[Exception] = None
        # Try each model in the fallback chain; retry each one on transient errors
        # with exponential backoff before advancing to the next model.
        for target_model in _fallback_models(model):
            for attempt in range(_MAX_TRANSIENT_RETRIES + 1):
                try:
                    text = await asyncio.to_thread(_sync_call, target_model)
                    if target_model != model:
                        logger.info(
                            "gemini_client: served via fallback model %s (requested %s)",
                            target_model, model,
                        )
                    return {
                        "text":        text,
                        "model":       target_model,
                        "tokens_used": 0,
                        "duration_ms": int(time.monotonic() * 1_000 - start_ms),
                    }
                except Exception as err:  # noqa: BLE001
                    last_err = err
                    if not _is_transient(err):
                        raise RuntimeError(f"generate_text failed: {err}") from err
                    if attempt < _MAX_TRANSIENT_RETRIES:
                        delay = _RETRY_BASE_DELAY_S * (2 ** attempt)
                        logger.warning(
                            "gemini_client: transient error on %s (attempt %d/%d) — "
                            "retrying in %.0fs: %s",
                            target_model, attempt + 1, _MAX_TRANSIENT_RETRIES + 1,
                            delay, err,
                        )
                        await asyncio.sleep(delay)
                    else:
                        logger.warning(
                            "gemini_client: %s exhausted retries — trying next model: %s",
                            target_model, err,
                        )

        raise RuntimeError(
            f"generate_text failed after retrying all models: {last_err}"
        ) from last_err

    async def embed_content(self, text: str) -> dict:
        start_ms = time.monotonic() * 1_000

        try:
            from google import genai

            def _sync_embed() -> list[float]:
                client = genai.Client(api_key=self._api_key)
                resp   = client.models.embed_content(
                    model=_EMBEDDING_MODEL, contents=text
                )
                if resp.embeddings:
                    return list(resp.embeddings[0].values or [])
                return []

            values = await asyncio.to_thread(_sync_embed)

            return {
                "values":      values,
                "model":       _EMBEDDING_MODEL,
                "duration_ms": int(time.monotonic() * 1_000 - start_ms),
            }

        except Exception as err:
            raise RuntimeError(f"embed_content failed: {err}") from err


# ─── Module-level singleton ───────────────────────────────────────────────────

def _build_singleton() -> Optional[GeminiClient]:
    key = os.getenv("GOOGLE_API_KEY", "").strip()
    if not key:
        logger.warning(
            "gemini_client: GOOGLE_API_KEY not set — gemini_client is None"
        )
        return None
    logger.info("gemini_client: initialised")
    return GeminiClient(key)


gemini_manager = None  # retained for import compatibility
gemini_client: Optional[GeminiClient] = _build_singleton()
