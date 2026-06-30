"""
GeminiEmbeddings — thin LangChain-compatible wrapper around the google-genai SDK.

Uses the google-genai SDK directly (already a project dependency) so we are not
subject to langchain-google-genai's internal API-version routing decisions.

Model: gemini-embedding-001 with output_dimensionality=768 (Matryoshka truncation)
— matches the MongoDB Atlas vector_index (768-dim cosine).
Key resolution: explicit arg → GOOGLE_API_KEY.
"""

import logging
import os
from langchain_core.embeddings import Embeddings
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

_EMBEDDING_MODEL = "gemini-embedding-001"
_EMBEDDING_DIMENSIONS = 768


def _resolve_api_key(explicit: str | None = None) -> str:
    """Return an API key — explicit arg or GOOGLE_API_KEY."""
    if explicit:
        return explicit
    if k := os.environ.get("GOOGLE_API_KEY", "").strip():
        return k
    raise RuntimeError(
        "GeminiEmbeddings: no API key configured. Set GOOGLE_API_KEY."
    )


class GeminiEmbeddings(Embeddings):
    """LangChain Embeddings backed directly by the google-genai SDK.

    Uses gemini-embedding-001 with output_dimensionality=768 (Matryoshka truncation)
    to stay compatible with the Atlas vector_index.
    """

    def __init__(
        self,
        api_key: str | None = None,
    ) -> None:
        self._client = genai.Client(
            api_key=_resolve_api_key(api_key),
        )
        self._model: str = _EMBEDDING_MODEL
        self._embed_config = types.EmbedContentConfig(
            output_dimensionality=_EMBEDDING_DIMENSIONS,
        )
        logger.info(
            "GeminiEmbeddings: initialised with model '%s' (%d dims)",
            self._model,
            _EMBEDDING_DIMENSIONS,
        )

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        response = self._client.models.embed_content(
            model=self._model,
            contents=texts,
            config=self._embed_config,
        )
        return [list(e.values) for e in response.embeddings]

    def embed_query(self, text: str) -> list[float]:
        response = self._client.models.embed_content(
            model=self._model,
            contents=text,
            config=self._embed_config,
        )
        return list(response.embeddings[0].values)
