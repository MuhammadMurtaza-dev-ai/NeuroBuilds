"""
NeuroBuilds — LLM Semantic Cache Manager
==========================================
Initialises MongoDBAtlasSemanticCache and binds it globally so every
LangChain / LangGraph LLM call (intent_node, response_node) is automatically
intercepted. Semantically similar prompts return cached responses without
spending tokens — critical for repeated build queries like "gaming build $800".

Prerequisites
-------------
1. The `semantic_cache` Atlas Vector Search index must exist before the first
   cached call. See the index definition in services/vector_store.py.
2. MONGODB_ATLAS_URI must be set; GOOGLE_API_KEY is required for Gemini embeddings.

Usage (called once at FastAPI startup in main.py)
---------
    from services.cache_manager import setup_semantic_cache
    setup_semantic_cache(mongo_client, db_name)
"""

import logging
import os
from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from pymongo import MongoClient

logger = logging.getLogger(__name__)

_CACHE_COLLECTION = "semantic_cache"
_CACHE_INDEX      = "semantic_cache_index"
_SCORE_THRESHOLD  = 0.97  # cosine similarity — tighter = fewer false cache hits


# ─── Resilience wrapper ───────────────────────────────────────────────────────
# MongoDBAtlasSemanticCache.lookup() calls embed_query() inline, inside
# LangChain's LLM call chain which has no surrounding try/except.  If the
# embedding model is unavailable the exception propagates and crashes the
# pipeline.  This wrapper converts any cache error into a cache miss so the
# LLM falls through to a normal (uncached) API call instead.

class _SafeCache:
    """Drop-in wrapper that makes any LangChain BaseCache non-fatal."""

    def __init__(self, inner: Any) -> None:
        self._inner = inner

    def lookup(self, prompt: str, llm_string: str) -> Optional[Any]:
        try:
            return self._inner.lookup(prompt, llm_string)
        except Exception as exc:
            logger.debug("semantic cache lookup failed (cache miss): %s", exc)
            return None

    def update(self, prompt: str, llm_string: str, return_val: Any) -> None:
        try:
            self._inner.update(prompt, llm_string, return_val)
        except Exception as exc:
            logger.debug("semantic cache update failed (skipped): %s", exc)

    async def alookup(self, prompt: str, llm_string: str) -> Optional[Any]:
        try:
            if hasattr(self._inner, "alookup"):
                return await self._inner.alookup(prompt, llm_string)
            return self._inner.lookup(prompt, llm_string)
        except Exception as exc:
            logger.debug("semantic cache alookup failed (cache miss): %s", exc)
            return None

    async def aupdate(self, prompt: str, llm_string: str, return_val: Any) -> None:
        try:
            if hasattr(self._inner, "aupdate"):
                await self._inner.aupdate(prompt, llm_string, return_val)
            else:
                self._inner.update(prompt, llm_string, return_val)
        except Exception as exc:
            logger.debug("semantic cache aupdate failed (skipped): %s", exc)

    def clear(self, **kwargs: Any) -> None:
        try:
            self._inner.clear(**kwargs)
        except Exception:
            pass


def setup_semantic_cache(client: "MongoClient", db_name: str) -> None:
    """
    Bind a MongoDBAtlasSemanticCache to the global LangChain LLM cache slot.

    The cache is wrapped in _SafeCache so any embedding or Atlas error is
    silently downgraded to a cache miss — the pipeline always continues.

    Silently no-ops if:
      - langchain-mongodb is not installed
      - GOOGLE_API_KEY is absent (embeddings can't be initialised)
      - Atlas is unreachable (we don't block startup on cache availability)
    """
    if not os.getenv("GOOGLE_API_KEY"):
        logger.warning(
            "cache_manager: GOOGLE_API_KEY not set — semantic cache disabled"
        )
        return

    try:
        from langchain_mongodb.cache import MongoDBAtlasSemanticCache
    except ImportError:
        logger.warning(
            "cache_manager: langchain-mongodb not installed — semantic cache disabled. "
            "Run: pip install langchain-mongodb"
        )
        return

    try:
        from langchain.globals import set_llm_cache
        from services.embeddings import GeminiEmbeddings

        collection_name = os.getenv("MONGODB_CACHE_COLLECTION", _CACHE_COLLECTION)

        embeddings = GeminiEmbeddings()

        inner_cache = MongoDBAtlasSemanticCache(
            connection_string=os.environ["MONGODB_ATLAS_URI"],
            embedding=embeddings,
            collection_name=collection_name,
            database_name=db_name,
            index_name=_CACHE_INDEX,
            score_threshold=_SCORE_THRESHOLD,
            wait_until_ready=False,  # don't block startup if index is still building
        )

        set_llm_cache(_SafeCache(inner_cache))
        logger.info(
            "Semantic LLM cache active (resilient) — db=%s collection=%s index=%s threshold=%.2f",
            db_name, collection_name, _CACHE_INDEX, _SCORE_THRESHOLD,
        )

    except Exception as exc:
        # Cache is non-critical — a miss just means a normal LLM call.
        logger.warning(
            "cache_manager: failed to initialise semantic cache (%s) — "
            "continuing without cache", exc,
        )
