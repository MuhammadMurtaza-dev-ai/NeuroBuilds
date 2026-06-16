"""
NeuroBuilds — Gemini API Key Rotation Manager

Python port of gemini-key-manager/src/services/KeyRotationManager.ts and
GeminiProxyService.ts.

Manages a pool of up to 10 Gemini API keys loaded from env vars GEMINI_KEY_1
through GEMINI_KEY_10. Falls back to GOOGLE_API_KEY for single-key mode.
All existing agent.py / LangChain paths that set google_api_key= can simply
call `await gemini_manager.get_available_key()` to get a rotated key.

Public singleton (import and use directly):

    from services.gemini_manager import gemini_manager, gemini_client

    key    = await gemini_manager.get_available_key()
    result = await gemini_client.generate_text(prompt, system_prompt="...")
    result = await gemini_client.embed_content(text)
    stats  = gemini_client.get_stats()
"""

import asyncio
import logging
import os
import random
import re
import time
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_WINDOW_DURATION_S       = 60.0
_MAX_REQUESTS_PER_WINDOW = 60
_DEFAULT_COOLDOWN_S      = 60.0
_DEFAULT_TEXT_MODEL      = "gemini-2.0-flash"
_EMBEDDING_MODEL         = "text-embedding-004"  # 768 dims — matches Atlas vector_index


# ─── Key metadata ─────────────────────────────────────────────────────────────

@dataclass
class _KeyMeta:
    id: str
    key: str
    status: str = "healthy"           # "healthy" | "throttled"
    requests_in_window: int = 0
    tokens_in_window: int = 0
    throttled_until: Optional[float] = None
    total_successful_calls: int = 0


# ─── Key rotation manager ─────────────────────────────────────────────────────

class GeminiKeyManager:
    """
    Asyncio-safe key pool manager.

    Selection strategy: sort ascending by window-request-count, randomly pick
    from the lower half (Fisher-Yates shuffle) to prevent hot-spotting on a
    single key — identical to the TypeScript KeyRotationManager.
    """

    def __init__(self, keys: list[str]) -> None:
        if not keys:
            raise ValueError("GeminiKeyManager: at least one API key is required.")
        self._registry: dict[str, _KeyMeta] = {
            k: _KeyMeta(id=f"key_{str(i + 1).zfill(2)}", key=k)
            for i, k in enumerate(keys)
        }
        self._window_start = time.monotonic()
        self._lock = asyncio.Lock()

    # ── Private helpers ───────────────────────────────────────────────────────

    def _maybe_reset_window(self) -> None:
        now = time.monotonic()
        if now - self._window_start >= _WINDOW_DURATION_S:
            self._window_start = now
            for meta in self._registry.values():
                meta.requests_in_window = 0
                meta.tokens_in_window   = 0

    def _evict_expired_throttles(self) -> None:
        now = time.monotonic()
        for meta in self._registry.values():
            if (
                meta.status == "throttled"
                and meta.throttled_until is not None
                and now >= meta.throttled_until
            ):
                meta.status          = "healthy"
                meta.throttled_until = None
                meta.requests_in_window = 0
                meta.tokens_in_window   = 0
                logger.info(
                    "gemini_manager: %s throttle expired — restored to healthy", meta.id
                )

    # ── Public API ────────────────────────────────────────────────────────────

    async def get_available_key(self) -> str:
        """
        Returns the raw API key string for the healthiest, least-utilised key.
        Increments requests_in_window on the chosen key.
        Raises RuntimeError when all keys are throttled or exhausted.
        """
        async with self._lock:
            self._maybe_reset_window()
            self._evict_expired_throttles()

            candidates = [
                m for m in self._registry.values()
                if m.status == "healthy"
                and m.requests_in_window < _MAX_REQUESTS_PER_WINDOW
            ]

            if not candidates:
                raise RuntimeError(
                    "GeminiKeyManager: all keys are throttled or exhausted."
                )

            candidates.sort(key=lambda m: m.requests_in_window)
            pool_size = max(1, (len(candidates) + 1) // 2)
            pool = candidates[:pool_size]
            random.shuffle(pool)

            chosen = pool[0]
            chosen.requests_in_window += 1
            return chosen.key

    def mark_throttled(self, key: str, cooldown_s: float = _DEFAULT_COOLDOWN_S) -> None:
        meta = self._registry.get(key)
        if not meta:
            return
        meta.status          = "throttled"
        meta.throttled_until = time.monotonic() + cooldown_s
        logger.warning(
            "gemini_manager: %s marked throttled — blocked for %.0fs",
            meta.id, cooldown_s,
        )

    def record_success(self, key: str, tokens_used: int = 0) -> None:
        meta = self._registry.get(key)
        if not meta:
            return
        meta.total_successful_calls += 1
        meta.tokens_in_window       += tokens_used

    def get_key_id(self, key: str) -> str:
        meta = self._registry.get(key)
        return meta.id if meta else "unknown"

    def get_stats(self) -> list[dict]:
        """Returns a sanitised snapshot (keys redacted) for logging/dashboards."""
        return [
            {
                "id":                     m.id,
                "status":                 m.status,
                "requests_in_window":     m.requests_in_window,
                "tokens_in_window":       m.tokens_in_window,
                "throttled_until_epoch":  m.throttled_until,
                "total_successful_calls": m.total_successful_calls,
            }
            for m in self._registry.values()
        ]

    @property
    def pool_size(self) -> int:
        return len(self._registry)


# ─── 429 detection helpers ────────────────────────────────────────────────────

def _parse_cooldown_s(err: Exception) -> float:
    match = re.search(r"retry.?after[:\s]+(\d+)", str(err), re.IGNORECASE)
    return float(match.group(1)) if match else _DEFAULT_COOLDOWN_S


def _is_429(err: Exception) -> bool:
    return bool(
        re.search(r"429|quota|rate.?limit|resource.?exhausted", str(err), re.IGNORECASE)
    )


# ─── Gemini client wrapper ────────────────────────────────────────────────────

class GeminiClient:
    """
    Async wrapper around the native google-genai SDK with transparent
    429-rotation retry. Mirrors GeminiProxyService.ts.

    generate_text / embed_content are async, using asyncio.to_thread so the
    synchronous google-genai SDK does not block the event loop.
    """

    def __init__(self, manager: GeminiKeyManager) -> None:
        self._manager = manager

    async def generate_text(
        self,
        prompt: str,
        *,
        model: str = _DEFAULT_TEXT_MODEL,
        system_prompt: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        attempt: int = 0,
    ) -> dict:
        if attempt >= self._manager.pool_size:
            raise RuntimeError(
                f"generate_text: all {self._manager.pool_size} key(s) exhausted."
            )

        start_ms = time.monotonic() * 1_000
        key      = await self._manager.get_available_key()
        key_id   = self._manager.get_key_id(key)

        logger.info(
            "gemini_client: generate_text [%s] attempt %d/%d",
            key_id, attempt + 1, self._manager.pool_size,
        )

        try:
            from google import genai
            from google.genai import types as genai_types

            def _sync_call() -> str:
                client = genai.Client(api_key=key)
                cfg = genai_types.GenerateContentConfig(
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                    system_instruction=system_prompt,
                )
                resp = client.models.generate_content(
                    model=model, contents=prompt, config=cfg
                )
                return resp.text or ""

            text       = await asyncio.to_thread(_sync_call)
            tokens_used = 0  # token count not exposed by sync path without usage_metadata

            self._manager.record_success(key, tokens_used)

            return {
                "text":        text,
                "model":       model,
                "key_id":      key_id,
                "tokens_used": tokens_used,
                "retry_count": attempt,
                "duration_ms": int(time.monotonic() * 1_000 - start_ms),
            }

        except Exception as err:
            if _is_429(err):
                logger.warning(
                    "gemini_client: [%s] 429 rate-limit — rotating (attempt %d)",
                    key_id, attempt + 1,
                )
                self._manager.mark_throttled(key, _parse_cooldown_s(err))
                return await self.generate_text(
                    prompt,
                    model=model,
                    system_prompt=system_prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    attempt=attempt + 1,
                )
            raise RuntimeError(f"generate_text failed on {key_id}: {err}") from err

    async def embed_content(self, text: str, attempt: int = 0) -> dict:
        if attempt >= self._manager.pool_size:
            raise RuntimeError(
                f"embed_content: all {self._manager.pool_size} key(s) exhausted."
            )

        start_ms = time.monotonic() * 1_000
        key      = await self._manager.get_available_key()
        key_id   = self._manager.get_key_id(key)

        try:
            from google import genai

            def _sync_embed() -> list[float]:
                client = genai.Client(api_key=key)
                resp   = client.models.embed_content(
                    model=_EMBEDDING_MODEL, contents=text
                )
                if resp.embeddings:
                    return list(resp.embeddings[0].values or [])
                return []

            values = await asyncio.to_thread(_sync_embed)
            self._manager.record_success(key, len(values))

            return {
                "values":      values,
                "model":       _EMBEDDING_MODEL,
                "key_id":      key_id,
                "retry_count": attempt,
                "duration_ms": int(time.monotonic() * 1_000 - start_ms),
            }

        except Exception as err:
            if _is_429(err):
                logger.warning(
                    "gemini_client: [%s] 429 embed rate-limit — rotating", key_id
                )
                self._manager.mark_throttled(key, _parse_cooldown_s(err))
                return await self.embed_content(text, attempt=attempt + 1)
            raise RuntimeError(f"embed_content failed on {key_id}: {err}") from err

    def get_stats(self) -> list[dict]:
        return self._manager.get_stats()


# ─── Module-level singleton ───────────────────────────────────────────────────

def _resolve_keys() -> list[str]:
    """
    Load GEMINI_KEY_1..GEMINI_KEY_10 for pool-mode key rotation.
    Falls back to GOOGLE_API_KEY for single-key (legacy) mode.
    """
    pool = [
        v for i in range(1, 11)
        if (v := os.getenv(f"GEMINI_KEY_{i}", "").strip())
    ]
    if pool:
        return pool
    fallback = os.getenv("GOOGLE_API_KEY", "").strip()
    if fallback:
        return [fallback]
    return []


def _build_singleton() -> tuple[Optional[GeminiKeyManager], Optional[GeminiClient]]:
    keys = _resolve_keys()
    if not keys:
        logger.warning(
            "gemini_manager: no API keys found "
            "(set GEMINI_KEY_1..10 or GOOGLE_API_KEY) — singletons are None"
        )
        return None, None
    try:
        manager = GeminiKeyManager(keys)
        client  = GeminiClient(manager)
        logger.info(
            "gemini_manager: pool initialised with %d key(s)", manager.pool_size
        )
        return manager, client
    except Exception as exc:
        logger.warning("gemini_manager: init failed — %s", exc)
        return None, None


gemini_manager: Optional[GeminiKeyManager]
gemini_client:  Optional[GeminiClient]
gemini_manager, gemini_client = _build_singleton()
