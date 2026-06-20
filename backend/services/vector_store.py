"""
NeuroBuilds — VectorStoreEngine
================================
Wraps MongoDBAtlasVectorSearch for the hardware_specs collection.
Accepts a shared MongoClient so no extra connection pools are opened.

Atlas Search Index definitions
--------------------------------
Create these indexes in the MongoDB Atlas UI before first use.

hardware_specs collection — index name: vector_index  (already required)
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    }
  ]
}

semantic_cache collection — index name: semantic_cache_index  (NEW — must be created)
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    }
  ]
}
"""

import logging
from typing import TYPE_CHECKING

from langchain_core.documents import Document
from services.embeddings import GeminiEmbeddings

if TYPE_CHECKING:
    from pymongo import MongoClient
    from langchain_core.vectorstores import VectorStoreRetriever

logger = logging.getLogger(__name__)


class VectorStoreEngine:
    """
    Thread-safe wrapper around MongoDBAtlasVectorSearch.

    The MongoClient is injected at construction time (typically from
    app.state.mongo in main.py) so the entire FastAPI process shares
    a single connection pool rather than opening one per request.

    All public methods are synchronous; call them from async contexts
    via asyncio.to_thread() if blocking latency is a concern, though in
    practice Atlas Vector Search completes well within acceptable limits.
    """

    def __init__(
        self,
        client: "MongoClient",
        db_name: str,
        collection_name: str = "hardware_specs",
        index_name: str = "vector_index",
    ) -> None:
        try:
            from langchain_mongodb import MongoDBAtlasVectorSearch
        except ImportError:
            from langchain_community.vectorstores import MongoDBAtlasVectorSearch  # type: ignore

        self._collection = client[db_name][collection_name]
        self._embeddings = GeminiEmbeddings()
        self._store = MongoDBAtlasVectorSearch(
            collection=self._collection,
            embedding=self._embeddings,
            index_name=index_name,
            text_key="content",
        )
        logger.info(
            "VectorStoreEngine ready — db=%s collection=%s index=%s",
            db_name, collection_name, index_name,
        )

    # ── Write path ────────────────────────────────────────────────────────────

    def ingest_documents(self, docs: list[Document]) -> int:
        """
        Embed and insert documents into the vector store.
        Returns the number of documents successfully added.
        Raises on upstream errors so callers can handle gracefully.
        """
        if not docs:
            return 0
        ids = self._store.add_documents(docs)
        logger.info("VectorStoreEngine: ingested %d documents", len(ids))
        return len(ids)

    # ── Read path ─────────────────────────────────────────────────────────────

    def get_retriever(self, top_k: int = 5) -> "VectorStoreRetriever":
        """
        Returns a standard LangChain VectorStoreRetriever for use in
        LangGraph nodes or LangChain chains. top_k controls the number
        of nearest-neighbour documents returned per query.
        """
        return self._store.as_retriever(search_kwargs={"k": top_k})

    def similarity_search(self, query: str, top_k: int = 4) -> list[Document]:
        """
        Direct similarity search — convenience wrapper used by rag_node
        when the full retriever abstraction is not needed.
        """
        return self._store.similarity_search(query, k=top_k)
