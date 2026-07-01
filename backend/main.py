"""
NeuroBuilds AI Service — FastAPI gateway
Run: uvicorn main:app --reload --port 8000
"""

import asyncio
import datetime
import json
import logging
import os
import re
from contextlib import asynccontextmanager
from typing import Annotated, Any, Literal, Optional

import firebase_admin
from firebase_admin import credentials as fb_credentials
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, field_validator
from pymongo import MongoClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from agent import run_pipeline
from routers.verify import router as verify_router
from routers.blog_automator import router as blog_automator_router
from routers.admin_users import router as admin_users_router
from routers.components import router as components_router, ensure_youtube_cache_index
from routers.listings_maintenance import router as listings_maintenance_router, start_background_sweep
from routers.market_intel import router as market_intel_router, start_market_intel_loop
from services.auth_guard import require_admin, require_auth
from services.cache_manager import setup_semantic_cache
from services.market_intel import ensure_market_intel_index
from services.vector_store import VectorStoreEngine
from services.location_search import LocationSearchService, ensure_indexes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


# ─── Scheduled-post publisher ─────────────────────────────────────────────────

async def _publish_scheduled_posts() -> int:
    """
    Query Firestore for blog posts with status='scheduled' whose publishAt
    timestamp is <= now, then atomically flip each one to status='published'.
    Returns the number of posts transitioned.
    Runs inside asyncio.to_thread so the synchronous Firestore Admin client
    never blocks the event loop.
    """
    def _run() -> int:
        from firebase_admin import firestore as fb_firestore  # noqa: PLC0415
        from google.cloud.firestore_v1.base_query import FieldFilter  # noqa: PLC0415

        db  = fb_firestore.client()
        now = datetime.datetime.now(tz=datetime.timezone.utc)

        due_docs = list(
            db.collection("blogs")
            .where(filter=FieldFilter("status", "==", "scheduled"))
            .where(filter=FieldFilter("publishAt", "<=", now))
            .stream()
        )

        count = 0
        for doc in due_docs:
            doc.reference.update({"status": "published", "isPublished": True})
            count += 1
            logger.info("Scheduled publisher: published blog id=%s", doc.id)

        return count

    return await asyncio.to_thread(_run)


async def _scheduled_publisher_loop() -> None:
    """
    Background worker that wakes every 60 s and publishes any overdue
    scheduled blog posts. Runs an immediate check on startup so posts
    that fell due while the server was offline are caught right away.
    Exceptions are logged and swallowed so a transient Firestore error
    never crashes the service.
    """
    logger.info("Scheduled-post publisher started (60 s interval)")
    while True:
        try:
            n = await _publish_scheduled_posts()
            if n:
                logger.info("Scheduled publisher: %d post(s) published this cycle", n)
        except Exception as exc:
            logger.warning("Scheduled publisher error (will retry in 60 s): %s", exc)
        await asyncio.sleep(60)


# ─── Lifecycle ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_uri = os.getenv("MONGODB_ATLAS_URI", "")
    db_name   = os.getenv("MONGODB_DATABASE", "neurobuilds")

    if mongo_uri:
        try:
            # MongoClient.__init__ performs a synchronous SRV DNS lookup for
            # mongodb+srv:// URIs. Wrap in try/except so a DNS timeout or
            # unreachable Atlas cluster degrades gracefully instead of crashing
            # the entire lifespan (serverSelectionTimeoutMS only gates server
            # selection, not the initial SRV resolution).
            app.state.mongo  = MongoClient(mongo_uri, serverSelectionTimeoutMS=5_000)
            # Async Motor client — used by the GET /api/marketplace/search endpoint
            app.state.motor  = AsyncIOMotorClient(mongo_uri, serverSelectionTimeoutMS=5_000)
            logger.info("MongoDB clients initialised (sync + async Motor)")

            # Wire vector store engine — shared client, zero extra connections
            app.state.vector_store = VectorStoreEngine(
                client=app.state.mongo,
                db_name=db_name,
                collection_name=os.getenv("MONGODB_COLLECTION", "hardware_specs"),
                index_name=os.getenv("MONGODB_VECTOR_INDEX", "vector_index"),
            )

            # Bind global LLM semantic cache — opt-in. Its lookup embeds every
            # prompt via Gemini embeddings, which share the (small, free-tier)
            # Gemini quota; when that quota is exhausted the cache lookup itself
            # stalls for ~90s per call. Enable only when the embedding quota is
            # healthy: set ENABLE_SEMANTIC_CACHE=true.
            if os.getenv("ENABLE_SEMANTIC_CACHE", "false").lower() == "true":
                setup_semantic_cache(app.state.mongo, db_name)
            else:
                logger.info("Semantic LLM cache disabled (ENABLE_SEMANTIC_CACHE != true)")

            # Ensure geospatial + compound indexes for marketplace search
            listings_col_name = os.getenv("MONGODB_LISTINGS_COLLECTION", "listings")
            ensure_indexes(app.state.mongo[db_name][listings_col_name])
            logger.info("Marketplace search indexes verified")

            # Ensure 7-day TTL index for YouTube review cache
            ensure_youtube_cache_index(app.state.mongo, db_name)

            # Ensure ~8-day TTL index for weekly market-intel snapshots
            ensure_market_intel_index(app.state.mongo, db_name)

        except Exception as exc:
            app.state.mongo        = None
            app.state.motor        = None
            app.state.vector_store = None
            logger.warning(
                "MongoDB could not be reached at startup (%s). "
                "RAG, marketplace search, and hardware lookup will return 503 "
                "until the connection is restored and the service is restarted.",
                exc,
            )
    else:
        app.state.mongo        = None
        app.state.motor        = None
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
            import json as _json
            # Resolve relative SA paths against this file's directory, not CWD
            if sa_path and not os.path.isabs(sa_path):
                sa_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), sa_path)

            if sa_path and os.path.isfile(sa_path):
                cred = fb_credentials.Certificate(sa_path)
                with open(sa_path) as _f:
                    project_id = _json.load(_f).get("project_id", "")
            else:
                cred = fb_credentials.ApplicationDefault()
                project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()

            options = {"projectId": project_id} if project_id else {}
            firebase_admin.initialize_app(cred, options)
            logger.info("Firebase Admin SDK initialised (project=%s)", project_id or "auto")
        except Exception as exc:
            # Non-fatal at startup — admin-guarded endpoints will return 503
            # rather than blocking the whole service from starting.
            logger.warning(
                "Firebase Admin SDK could not be initialised (%s). "
                "Admin-protected endpoints will be unavailable until this is resolved. "
                "Set FIREBASE_SERVICE_ACCOUNT_PATH to a valid service-account JSON file.",
                exc,
            )

    # ── Scheduled-post publisher ───────────────────────────────────────────────
    # Only start if Firebase Admin SDK initialised successfully; the worker
    # imports firebase_admin.firestore lazily so it is safe to guard on _apps.
    publisher_task: asyncio.Task | None = None
    sweep_task: asyncio.Task | None = None
    market_intel_task: asyncio.Task | None = None
    if firebase_admin._apps:
        publisher_task = asyncio.create_task(_scheduled_publisher_loop())
        sweep_task = asyncio.create_task(start_background_sweep())
        # Weekly market-intel needs both Firestore (Admin SDK) and MongoDB.
        if app.state.mongo is not None:
            market_intel_task = asyncio.create_task(
                start_market_intel_loop(app.state.mongo, db_name)
            )
        else:
            logger.warning("Market-intel loop not started — MongoDB unavailable.")
    else:
        logger.warning(
            "Scheduled-post publisher, listing-sweep, and market-intel not started "
            "— Firebase Admin SDK unavailable."
        )

    logger.info("NeuroBuilds AI service ready on http://localhost:8000")
    yield

    for task in (publisher_task, sweep_task, market_intel_task):
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    logger.info("Background tasks stopped.")

    if app.state.mongo:
        app.state.mongo.close()
    if app.state.motor:
        app.state.motor.close()
    logger.info("NeuroBuilds AI service shut down.")


# ─── Rate limiting ────────────────────────────────────────────────────────────

def _rate_limit_key(request: Request) -> str:
    """
    Per-UID rate-limit key. require_auth / require_admin stash the verified
    Firebase UID on request.state before the endpoint body runs, so
    authenticated routes are throttled per user, not per IP. Unauthenticated
    requests (which fail auth anyway) fall back to the client IP.
    """
    uid = getattr(request.state, "uid", None)
    return f"uid:{uid}" if uid else get_remote_address(request)


limiter = Limiter(key_func=_rate_limit_key)


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="NeuroBuilds AI Service",
    description="LangGraph multi-agent PC hardware advisor — streaming backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
    expose_headers=["X-Cache"],
)

app.include_router(verify_router)
app.include_router(blog_automator_router)
app.include_router(admin_users_router)
app.include_router(components_router)
app.include_router(listings_maintenance_router)
app.include_router(market_intel_router)


# ─── Request models ───────────────────────────────────────────────────────────

# Payload caps — reject oversized chat payloads at validation time (422)
# before any pipeline / LLM work is done, blocking large-payload DoS attempts.
MAX_CHAT_MESSAGES      = 50      # max conversation turns per request
MAX_MESSAGE_CHARS      = 8_000   # max characters per individual message
MAX_ACTIVE_BUILD_BYTES = 16_000  # max serialised size of the activeBuild dict


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=MAX_MESSAGE_CHARS)


class ChatRequest(BaseModel):
    messages: list[Message] = Field(..., min_length=1, max_length=MAX_CHAT_MESSAGES)
    activeBuild: dict = Field(default_factory=dict)

    @field_validator("activeBuild")
    @classmethod
    def cap_active_build_size(cls, v: dict) -> dict:
        try:
            size = len(json.dumps(v, default=str))
        except (TypeError, ValueError):
            raise ValueError("activeBuild must be JSON-serialisable")
        if size > MAX_ACTIVE_BUILD_BYTES:
            raise ValueError(
                f"activeBuild payload too large ({size} bytes > {MAX_ACTIVE_BUILD_BYTES})"
            )
        return v


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


@app.get("/api/admin/gemini/status")
async def gemini_status(
    _admin_uid: Annotated[str, Depends(require_admin)] = "",
):
    """
    Returns whether GOOGLE_API_KEY is configured.
    Returns 503 when no key is set.
    """
    key_set = bool(os.getenv("GOOGLE_API_KEY", "").strip())
    if not key_set:
        raise HTTPException(
            status_code=503,
            detail="GOOGLE_API_KEY is not set in the environment.",
        )
    return {"status": "ok", "key_configured": True}


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


@app.get("/api/marketplace/search")
async def marketplace_search_get(
    request: Request,
    area: str = Query(..., min_length=1, description="Neighbourhood / area name, e.g. 'Tariq Garden'"),
    city: Optional[str] = Query(None, description="Optional city filter to narrow Tier-3 fallback"),
    limit: int = Query(20, ge=1, le=100, description="Maximum listings to return"),
):
    """
    Public GET endpoint for the 3-tier cascading geo-fallback marketplace search.

    Tier 1 — Exact area match      (area == target, status == "active")
    Tier 2 — Radius expansion      ($nearSphere ≤ 8 km from area centroid)
    Tier 3 — City-wide fallback    (city that contains the area)

    The Motor client (app.state.motor) owns the async connection; the sync
    LocationSearchService runs inside asyncio.to_thread() so it never blocks
    the event loop.
    """
    if request.app.state.motor is None:
        raise HTTPException(status_code=503, detail="Marketplace database not configured.")

    db_name  = os.getenv("MONGODB_DATABASE",            "neurobuilds")
    col_name = os.getenv("MONGODB_LISTINGS_COLLECTION", "listings")

    # LocationSearchService is synchronous (pymongo); use the sync client so
    # Motor's async collection isn't passed to a blocking cursor.
    col = request.app.state.mongo[db_name][col_name]
    svc = LocationSearchService(col)

    extra: dict[str, Any] = {}
    if city:
        extra["city"] = city

    try:
        result = await asyncio.to_thread(
            svc.search,
            area,
            extra_filters=extra if extra else None,
            limit=limit,
        )
    except Exception as exc:
        logger.exception("Geo-search failed for area=%r", area)
        raise HTTPException(status_code=500, detail=f"Search failed: {exc}")

    return {
        "status":     "ok",
        "tier":       result.tier,
        "tier_label": result.tier_label,
        "count":      result.count,
        "listings":   result.listings,
    }


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
@limiter.limit("20/minute")
async def chat(
    request: Request,
    req: ChatRequest,
    uid: Annotated[str, Depends(require_auth)],
):
    """
    Accepts the full conversation history plus the current build state from
    useAIAssistant.ts and returns a raw token stream.

    Requires a valid Firebase ID token (any authenticated user) and is
    rate-limited to 20 requests/minute per UID via slowapi. Payload sizes
    are capped by the ChatRequest model (50 messages × 8 000 chars).

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
