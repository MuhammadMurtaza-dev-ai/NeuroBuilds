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
2. MONGODB_ATLAS_URI must be set; OPENAI_API_KEY is required for embeddings.

Usage (called once at FastAPI startup in main.py)
---------
    from services.cache_manager import setup_semantic_cache
    setup_semantic_cache(mongo_client, db_name)
"""

import logging
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pymongo import MongoClient

logger = logging.getLogger(__name__)

_CACHE_COLLECTION = "semantic_cache"
_CACHE_INDEX      = "semantic_cache_index"
_SCORE_THRESHOLD  = 0.97  # cosine similarity — tighter = fewer false cache hits


def setup_semantic_cache(client: "MongoClient", db_name: str) -> None:
    """
    Bind a MongoDBAtlasSemanticCache to the global LangChain LLM cache slot.

    This is idempotent — calling it more than once replaces the cache with an
    equivalent instance (safe but wasteful; call it exactly once in lifespan).

    Silently no-ops if:
      - langchain-mongodb is not installed
      - OPENAI_API_KEY is absent (embeddings can't be initialised)
      - Atlas is unreachable (we don't block startup on cache availability)
    """
    if not os.getenv("OPENAI_API_KEY"):
        logger.warning(
            "cache_manager: OPENAI_API_KEY not set — semantic cache disabled"
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
        from langchain_openai import OpenAIEmbeddings

        collection_name = os.getenv("MONGODB_CACHE_COLLECTION", _CACHE_COLLECTION)

        embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

        cache = MongoDBAtlasSemanticCache(
            connection_string=os.environ["MONGODB_ATLAS_URI"],
            embedding=embeddings,
            collection_name=collection_name,
            database_name=db_name,
            index_name=_CACHE_INDEX,
            score_threshold=_SCORE_THRESHOLD,
            wait_until_ready=False,  # don't block startup if index is still building
        )

        set_llm_cache(cache)
        logger.info(
            "Semantic LLM cache active — db=%s collection=%s index=%s threshold=%.2f",
            db_name, collection_name, _CACHE_INDEX, _SCORE_THRESHOLD,
        )

    except Exception as exc:
        # Cache is non-critical — a miss just means a normal LLM call.
        logger.warning(
            "cache_manager: failed to initialise semantic cache (%s) — "
            "continuing without cache", exc,
        )
