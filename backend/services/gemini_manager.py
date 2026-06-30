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

        try:
            from google import genai
            from google.genai import types as genai_types

            def _sync_call() -> str:
                client = genai.Client(api_key=self._api_key)
                cfg = genai_types.GenerateContentConfig(
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                    system_instruction=system_prompt,
                )
                resp = client.models.generate_content(
                    model=model, contents=prompt, config=cfg
                )
                return resp.text or ""

            text = await asyncio.to_thread(_sync_call)

            return {
                "text":        text,
                "model":       model,
                "tokens_used": 0,
                "duration_ms": int(time.monotonic() * 1_000 - start_ms),
            }

        except Exception as err:
            raise RuntimeError(f"generate_text failed: {err}") from err

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
