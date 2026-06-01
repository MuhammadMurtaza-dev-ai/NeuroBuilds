"""
NeuroBuilds AI Service — FastAPI gateway
Run: uvicorn main:app --reload --port 8000
"""

import logging
import os
import re
from contextlib import asynccontextmanager
from typing import Annotated, Any, Optional

import firebase_admin
from firebase_admin import credentials as fb_credentials
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pymongo import MongoClient

from agent import run_pipeline
from routers.verify import router as verify_router
from services.auth_guard import require_admin
from services.cache_manager import setup_semantic_cache
from services.vector_store import VectorStoreEngine
from services.location_search import LocationSearchService, ensure_indexes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


# ─── Lifecycle ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_uri = os.getenv("MONGODB_ATLAS_URI", "")
    db_name   = os.getenv("MONGODB_DATABASE", "neurobuilds")

    if mongo_uri:
        # Lazy connect — doesn't block startup if Atlas is temporarily unreachable
        app.state.mongo = MongoClient(mongo_uri, serverSelectionTimeoutMS=5_000)
        logger.info("MongoDB client initialised")

        # Wire vector store engine — shared client, zero extra connections
        app.state.vector_store = VectorStoreEngine(
            client=app.state.mongo,
            db_name=db_name,
            collection_name=os.getenv("MONGODB_COLLECTION", "hardware_specs"),
            index_name=os.getenv("MONGODB_VECTOR_INDEX", "vector_index"),
        )

        # Bind global LLM semantic cache — silently no-ops on any error
        setup_semantic_cache(app.state.mongo, db_name)

        # Ensure geospatial + compound indexes for marketplace search
        listings_col_name = os.getenv("MONGODB_LISTINGS_COLLECTION", "listings")
        ensure_indexes(app.state.mongo[db_name][listings_col_name])
        logger.info("Marketplace search indexes verified")
    else:
        app.state.mongo        = None
        app.state.vector_store = None
        logger.warning("MONGODB_ATLAS_URI not set — /api/hardware/lookup and /api/marketplace/search will return 503")

    # ── Firebase Admin SDK ─────────────────────────────────────────────────────
    # Required by the require_admin dependency in auth_guard.py.
    # Set FIREBASE_SERVICE_ACCOUNT_PATH to a service-account JSON key file.
    # On GCP (Cloud Run / App Engine) the env var can be omitted — the SDK
    # will pick up Application Default Credentials automatically.
    sa_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "").strip()
    if not firebase_admin._apps:
        try:
            if sa_path and os.path.isfile(sa_path):
                cred = fb_credentials.Certificate(sa_path)
            else:
                # Attempt ADC (Cloud Run, Cloud Shell, gcloud auth login)
                cred = fb_credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin SDK initialised")
        except Exception as exc:
            # Non-fatal at startup — admin-guarded endpoints will return 503
            # rather than blocking the whole service from starting.
            logger.warning(
                "Firebase Admin SDK could not be initialised (%s). "
                "Admin-protected endpoints will be unavailable until this is resolved. "
                "Set FIREBASE_SERVICE_ACCOUNT_PATH to a valid service-account JSON file.",
                exc,
            )

    logger.info("NeuroBuilds AI service ready on http://localhost:8000")
    yield

    if app.state.mongo:
        app.state.mongo.close()
    logger.info("NeuroBuilds AI service shut down.")


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="NeuroBuilds AI Service",
    description="LangGraph multi-agent PC hardware advisor — streaming backend",
    version="1.0.0",
    lifespan=lifespan,
)

# Origins are read from CORS_ORIGINS env var (comma-separated) so production
# and staging domains can be added without touching source code.
_cors_raw = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
_allowed_origins: list[str] = [o.strip() for o in _cors_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(verify_router)


# ─── Request models ───────────────────────────────────────────────────────────

class Message(BaseModel):
    role: str       # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]
    activeBuild: dict = {}


class HardwareLookupResponse(BaseModel):
    name: str
    category: str
    specs: dict[str, Any]


class MarketplaceSearchRequest(BaseModel):
    area: str
    """Target area name, e.g. 'Tariq Garden'."""

    radius_m: int = 8_000
    """Tier-2 search radius in metres (default 8 km)."""

    limit: int = 50
    """Maximum results to return (capped at 100)."""

    # Optional extra filters forwarded to MongoDB as-is
    category:     Optional[str] = None
    listing_type: Optional[str] = None
    condition:    Optional[str] = None
    price_min:    Optional[float] = None
    price_max:    Optional[float] = None


class MarketplaceSearchResponse(BaseModel):
    tier:       int
    tier_label: str
    count:      int
    listings:   list[dict[str, Any]]


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "neurobuilds-ai"}


@app.get("/api/hardware/lookup", response_model=HardwareLookupResponse)
async def hardware_lookup(
    request: Request,
    name: str = Query(..., min_length=1, description="Component name substring to search"),
    category: Optional[str] = Query(None, description="Optional category filter: GPU, CPU, MOTHERBOARD, RAM, PSU"),
    _admin_uid: Annotated[str, Depends(require_admin)] = "",
):
    """
    Case-insensitive substring lookup against the hardware_catalog collection.
    Uses a B-tree index on `name` for efficient regex scans at collection scale.
    Returns the first match; 404 if no entry matches; 503 if MongoDB is unconfigured.
    """
    if request.app.state.mongo is None:
        raise HTTPException(status_code=503, detail="Hardware catalog database not configured.")

    db_name  = os.getenv("MONGODB_DATABASE",           "neurobuilds")
    col_name = os.getenv("MONGODB_CATALOG_COLLECTION", "hardware_catalog")
    col      = request.app.state.mongo[db_name][col_name]

    query: dict = {"name": {"$regex": re.escape(name), "$options": "i"}}
    if category:
        query["category"] = category.strip().upper()

    doc = col.find_one(query, {"_id": 0, "embedding": 0, "content": 0})
    if doc is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Component '{name}' not found in the hardware catalog. "
                "Run backend/scripts/ingest_hardware.py to populate the collection."
            ),
        )

    return HardwareLookupResponse(
        name=doc["name"],
        category=doc["category"],
        specs=doc.get("specs", {}),
    )


@app.post("/api/marketplace/search", response_model=MarketplaceSearchResponse)
async def marketplace_search(
    req: MarketplaceSearchRequest,
    request: Request,
    _admin_uid: Annotated[str, Depends(require_admin)] = "",
):
    """
    Cascading geo-fallback marketplace search.

    Tier 1 — Exact area match  (area == req.area, status == "active")
    Tier 2 — Radius expansion  ($nearSphere ≤ req.radius_m metres)
    Tier 3 — City-wide results (city that contains req.area)

    The response includes a `tier` integer (1/2/3) and a human-readable
    `tier_label` so the frontend can display "Showing results near Tariq Garden"
    instead of a bare result count.

    Returns 503 if MongoDB is not configured.
    """
    if request.app.state.mongo is None:
        raise HTTPException(status_code=503, detail="Marketplace database not configured.")

    db_name          = os.getenv("MONGODB_DATABASE", "neurobuilds")
    listings_col     = os.getenv("MONGODB_LISTINGS_COLLECTION", "listings")
    col              = request.app.state.mongo[db_name][listings_col]
    svc              = LocationSearchService(col)

    # Build optional extra filter dict from request fields
    extra: dict = {}
    if req.category:
        extra["category"] = req.category
    if req.listing_type:
        extra["listingType"] = req.listing_type
    if req.condition:
        extra["condition"] = req.condition
    if req.price_min is not None or req.price_max is not None:
        price_clause: dict = {}
        if req.price_min is not None:
            price_clause["$gte"] = req.price_min
        if req.price_max is not None:
            price_clause["$lte"] = req.price_max
        extra["price"] = price_clause

    result = svc.search(
        req.area,
        extra_filters=extra,
        radius_m=req.radius_m,
        limit=min(req.limit, 100),   # hard cap at 100
    )

    return MarketplaceSearchResponse(
        tier=result.tier,
        tier_label=result.tier_label,
        count=result.count,
        listings=result.listings,
    )


@app.post("/api/chat")
async def chat(req: ChatRequest):
    """
    Accepts the full conversation history plus the current build state from
    useAIAssistant.ts and returns a raw token stream.

    No SSE framing — the frontend's liveStream() consumes raw bytes directly
    via ReadableStream. Each yielded string is written to the response body
    immediately; Nginx buffering is disabled via the X-Accel-Buffering header.

    On pipeline error the stream ends with a plain-text error token so the
    frontend UI shows a message rather than hanging silently.
    """
    messages = [m.model_dump() for m in req.messages]

    async def token_stream():
        try:
            async for token in run_pipeline(messages, req.activeBuild):
                yield token
        except Exception as exc:
            logger.exception("Pipeline error in /api/chat")
            yield f"\n\n[NEURO_ERROR] Pipeline encountered an error: {exc}"

    return StreamingResponse(
        token_stream(),
        media_type="text/plain; charset=utf-8",
        headers={"X-Accel-Buffering": "no"},
    )
