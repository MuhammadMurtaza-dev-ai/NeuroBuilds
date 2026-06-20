"""
NeuroBuilds — RAG Document Ingestion (hardware_specs vector store)
==================================================================
High-performance, idempotent ingestion of CPU/GPU component data into the
`hardware_specs` MongoDB Atlas vector collection (the one rag_node and
VectorStoreEngine query — index `vector_index`, 768-dim cosine, Gemini
text-embedding-004).

Pipeline per run:
  1. Load  — read a raw source file: backend/data/hardware_source.json (default)
             or a structured CSV (--source path.csv). Each row → canonical record.
  2. Build — serialise every component into a LangChain `Document`:
               • page_content : human/RAG-readable spec string
               • metadata     : exact relational + physical specs
               • id           : SHA-256(brand|model)  ← deterministic vector id
  3. Diff  — compare each document's content hash against what is already in
             Mongo. Unchanged docs are SKIPPED (zero re-embedding, no bloat);
             new/changed docs are queued for upsert.
  4. Embed — asynchronous, concurrent batch embedding (chunks of --batch-size,
             default 64; --concurrency chunks in flight) via GeminiEmbeddings.
  5. Upsert— bulk `UpdateOne(_id=hash, upsert=True)` writes content + embedding
             + flattened metadata + content_hash. Overwrite-if-changed semantics.

Every row and every embedding chunk is wrapped in try/except with structured
logging, so one corrupt record never aborts the whole run.

Usage:
    cd backend
    python scripts/ingest_rag_documents.py                       # default JSON source
    python scripts/ingest_rag_documents.py --source data/parts.csv
    python scripts/ingest_rag_documents.py --dry-run             # parse + diff, no network writes
    python scripts/ingest_rag_documents.py --batch-size 100 --concurrency 4
    python scripts/ingest_rag_documents.py --verify              # validate config + source only

Requires backend/.env with a Gemini key (GOOGLE_API_KEY or GEMINI_KEY_1) and
MONGODB_ATLAS_URI.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import hashlib
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# Make `services.*` importable regardless of invocation directory, and resolve
# backend/.env the same way the sibling ingestion scripts do.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND_DIR))
load_dotenv(_BACKEND_DIR / ".env")

try:
    from pymongo import MongoClient, UpdateOne
    from langchain_core.documents import Document
except ImportError as exc:  # pragma: no cover - environment guard
    print(f"Missing dependency: {exc}")
    print("Run: pip install -r requirements.txt")
    sys.exit(1)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("ingest_rag")

DEFAULT_SOURCE = _BACKEND_DIR / "data" / "hardware_source.json"
EMBEDDING_DIMENSIONS = 768  # gemini-embedding-001 — must match the Atlas vector_index


# ─── Field coercion ─────────────────────────────────────────────────────────────
# CSV values arrive as strings; JSON values arrive pre-typed. Coerce known
# numeric/boolean fields so both sources converge on one canonical record shape.

_INT_FIELDS = {
    # CPU / GPU
    "cores", "threads", "tdp_watts", "vram_gb", "l3_cache_mb",
    "boost_clock_mhz", "base_clock_mhz", "memory_bus_bits", "launch_msrp_usd",
    # RAM
    "capacity_gb", "speed_mhz", "latency_cas",
    # PSU
    "wattage", "warranty_years", "fan_size_mm",
    # CASE
    "max_gpu_length_mm", "max_cpu_cooler_height_mm",
    "drive_bays_35", "drive_bays_25", "fan_slots", "included_fans",
    # FAN
    "max_rpm", "min_rpm",
    # MOTHERBOARD
    "memory_slots", "max_memory_gb", "pcie_x16_slots", "m2_slots",
}
_FLOAT_FIELDS = {
    "base_clock_ghz", "boost_clock_ghz",
    # RAM
    "voltage_v",
    # FAN
    "airflow_cfm", "static_pressure_mmh2o", "noise_dba",
}
_BOOL_FIELDS = {
    "integrated_graphics",
    # RAM
    "xmp_expo_support", "rgb",
    # PSU
    "atx3_support",
    # CASE
    "tempered_glass",
    # MOTHERBOARD
    "wifi_builtin", "bluetooth", "overclocking_support",
}

_TRUE_TOKENS = {"true", "yes", "y", "1", "t"}
_FALSE_TOKENS = {"false", "no", "n", "0", "f"}


def _coerce(key: str, value: Any) -> Any:
    """Coerce a single field to its canonical type. Returns None for blanks."""
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if value == "" or value.lower() in ("n/a", "nan", "none", "null", "-"):
            return None

    if key in _BOOL_FIELDS:
        if isinstance(value, bool):
            return value
        token = str(value).lower()
        if token in _TRUE_TOKENS:
            return True
        if token in _FALSE_TOKENS:
            return False
        return None
    if key in _INT_FIELDS:
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return None
    if key in _FLOAT_FIELDS:
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
    return value


def normalise_record(raw: dict[str, Any]) -> dict[str, Any]:
    """
    Turn one raw row (JSON object or CSV dict) into a canonical record.
    Raises ValueError if the identifying triplet is incomplete — the caller
    logs and skips so the rest of the run proceeds.
    """
    rec: dict[str, Any] = {}
    for key, value in raw.items():
        clean_key = key.strip().lower().replace(" ", "_")
        coerced = _coerce(clean_key, value)
        if coerced is not None:
            rec[clean_key] = coerced

    _VALID_TYPES = {"CPU", "GPU", "RAM", "PSU", "CASE", "FAN", "MOTHERBOARD"}
    component_type = str(rec.get("component_type", "")).upper()
    brand = rec.get("brand")
    model = rec.get("model")
    if component_type not in _VALID_TYPES:
        raise ValueError(f"unsupported/absent component_type={component_type!r}")
    if not brand or not model:
        raise ValueError(f"missing brand/model (brand={brand!r} model={model!r})")

    rec["component_type"] = component_type
    return rec


# ─── Loaders ────────────────────────────────────────────────────────────────────

def load_source(path: Path) -> list[dict[str, Any]]:
    """Load raw rows from a .json (list of objects) or .csv (DictReader) file."""
    if not path.exists():
        raise FileNotFoundError(f"source file not found: {path}")

    suffix = path.suffix.lower()
    if suffix == ".json":
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            raise ValueError("JSON source must be a top-level array of objects")
        return data
    if suffix == ".csv":
        with open(path, newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))
    raise ValueError(f"unsupported source extension {suffix!r} (use .json or .csv)")


# ─── Serialisation ──────────────────────────────────────────────────────────────

def _vector_id(brand: str, model: str) -> str:
    """Deterministic SHA-256 id from the unique brand+model combination."""
    key = f"{brand.strip().lower()}|{model.strip().lower()}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _content_hash(content: str, metadata: dict[str, Any]) -> str:
    """Stable hash over content + metadata; drives overwrite-if-changed / skip."""
    payload = json.dumps(
        {"content": content, "metadata": metadata},
        sort_keys=True, separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def build_page_content(rec: dict[str, Any]) -> str:
    """
    Construct the pipe-delimited spec string used as the embedding chunk.
    Supports CPU, GPU, RAM, PSU, CASE, FAN, MOTHERBOARD component types.
    """
    brand, model = rec["brand"], rec["model"]
    ctype = rec["component_type"]
    segments: list[str] = [f"Component: {brand} {model}", f"Type: {ctype}"]

    if ctype == "CPU":
        ordered: list[tuple[str, str]] = [
            ("Cores", "cores"), ("Threads", "threads"),
            ("Base Clock", "base_clock_ghz"), ("Boost Clock", "boost_clock_ghz"),
            ("Socket", "socket"), ("TDP", "tdp_watts"),
            ("L3 Cache", "l3_cache_mb"), ("Microarchitecture", "microarchitecture"),
        ]
        units: dict[str, str] = {"base_clock_ghz": "GHz", "boost_clock_ghz": "GHz",
                                  "tdp_watts": "W", "l3_cache_mb": "MB"}
    elif ctype == "GPU":
        ordered = [
            ("VRAM", "vram_gb"), ("Interface", "interface"),
            ("Boost Clock", "boost_clock_mhz"), ("Memory Bus", "memory_bus_bits"),
            ("TDP", "tdp_watts"), ("Power Connectors", "power_connectors"),
            ("Microarchitecture", "microarchitecture"),
        ]
        units = {"vram_gb": "GB", "boost_clock_mhz": "MHz",
                 "memory_bus_bits": "-bit", "tdp_watts": "W"}
    elif ctype == "RAM":
        ordered = [
            ("Memory Type", "memory_type"), ("Capacity", "capacity_gb"),
            ("Speed", "speed_mhz"), ("CAS Latency", "latency_cas"),
            ("Kit", "kit_config"), ("Voltage", "voltage_v"),
            ("Form Factor", "form_factor"), ("XMP/EXPO", "xmp_expo_support"),
            ("RGB", "rgb"),
        ]
        units = {"capacity_gb": "GB", "speed_mhz": "MHz", "voltage_v": "V"}
    elif ctype == "PSU":
        ordered = [
            ("Wattage", "wattage"), ("Efficiency", "efficiency_rating"),
            ("Modular", "modular"), ("Form Factor", "form_factor"),
            ("ATX 3.0", "atx3_support"), ("Fan", "fan_size_mm"),
            ("Warranty", "warranty_years"),
        ]
        units = {"wattage": "W", "fan_size_mm": "mm", "warranty_years": " years"}
    elif ctype == "CASE":
        ordered = [
            ("Case Type", "case_type"), ("Form Factor", "form_factor_support"),
            ("Max GPU Length", "max_gpu_length_mm"),
            ("Max CPU Cooler", "max_cpu_cooler_height_mm"),
            ("3.5\" Bays", "drive_bays_35"), ("2.5\" Bays", "drive_bays_25"),
            ("Fan Slots", "fan_slots"), ("Included Fans", "included_fans"),
            ("Radiator Support", "radiator_support"),
            ("Tempered Glass", "tempered_glass"),
        ]
        units = {"max_gpu_length_mm": "mm", "max_cpu_cooler_height_mm": "mm"}
    elif ctype == "FAN":
        ordered = [
            ("Size", "fan_size_mm"), ("Fan Type", "fan_type"),
            ("Max RPM", "max_rpm"), ("Min RPM", "min_rpm"),
            ("Airflow", "airflow_cfm"), ("Static Pressure", "static_pressure_mmh2o"),
            ("Noise", "noise_dba"), ("Bearing", "bearing_type"),
            ("Connector", "connector"), ("RGB", "rgb"),
        ]
        units = {"fan_size_mm": "mm", "airflow_cfm": "CFM",
                 "static_pressure_mmh2o": "mmH2O", "noise_dba": "dBA"}
    else:  # MOTHERBOARD
        ordered = [
            ("Socket", "socket"), ("Chipset", "chipset"),
            ("Form Factor", "form_factor"), ("Memory Type", "memory_type"),
            ("Memory Slots", "memory_slots"), ("Max Memory", "max_memory_gb"),
            ("PCIe x16 Slots", "pcie_x16_slots"), ("M.2 Slots", "m2_slots"),
            ("WiFi", "wifi_builtin"), ("Bluetooth", "bluetooth"),
            ("Overclocking", "overclocking_support"),
        ]
        units = {"max_memory_gb": "GB"}

    for label, key in ordered:
        if key in rec and rec[key] is not None:
            value = rec[key]
            if key in _BOOL_FIELDS:
                value = "Yes" if value else "No"
            suffix = units.get(key, "")
            segments.append(f"{label}: {value}{suffix}")

    line = " | ".join(segments)
    summary = rec.get("summary")
    return f"{line}. {summary}" if summary else f"{line}."


def build_metadata(rec: dict[str, Any]) -> dict[str, Any]:
    """Map exact relational/physical specs into the Document metadata dict."""
    ctype = rec["component_type"]
    common = ["component_type", "brand", "model", "tdp_watts"]
    if ctype == "CPU":
        keys = common + ["microarchitecture", "socket", "cores", "threads",
                         "l3_cache_mb", "base_clock_ghz", "boost_clock_ghz",
                         "integrated_graphics"]
    elif ctype == "GPU":
        keys = common + ["microarchitecture", "vram_gb", "interface",
                         "power_connectors", "boost_clock_mhz", "memory_bus_bits"]
    elif ctype == "RAM":
        keys = common + ["memory_type", "capacity_gb", "speed_mhz", "latency_cas",
                         "kit_config", "voltage_v", "form_factor",
                         "xmp_expo_support", "rgb"]
    elif ctype == "PSU":
        keys = ["component_type", "brand", "model", "wattage",
                "efficiency_rating", "modular", "form_factor",
                "atx3_support", "fan_size_mm", "warranty_years", "tdp_watts"]
    elif ctype == "CASE":
        keys = ["component_type", "brand", "model", "case_type",
                "form_factor_support", "max_gpu_length_mm",
                "max_cpu_cooler_height_mm", "drive_bays_35", "drive_bays_25",
                "fan_slots", "included_fans", "radiator_support", "tempered_glass"]
    elif ctype == "FAN":
        keys = common + ["fan_size_mm", "fan_type", "max_rpm", "min_rpm",
                         "airflow_cfm", "static_pressure_mmh2o", "noise_dba",
                         "bearing_type", "connector", "rgb"]
    else:  # MOTHERBOARD
        keys = common + ["socket", "chipset", "form_factor", "memory_type",
                         "memory_slots", "max_memory_gb", "pcie_x16_slots",
                         "m2_slots", "wifi_builtin", "bluetooth",
                         "overclocking_support"]
    return {k: rec[k] for k in keys if k in rec and rec[k] is not None}


def build_document(rec: dict[str, Any]) -> Document:
    """Assemble a LangChain Document with deterministic id + content hash."""
    content = build_page_content(rec)
    metadata = build_metadata(rec)
    doc_id = _vector_id(rec["brand"], rec["model"])
    metadata["content_hash"] = _content_hash(content, metadata)
    return Document(id=doc_id, page_content=content, metadata=metadata)


# ─── Embedding (async, concurrent, batched) ─────────────────────────────────────

def _chunk(items: list[Any], size: int) -> list[list[Any]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


async def embed_documents_async(
    docs: list[Document], batch_size: int, concurrency: int,
    chunk_delay: float = 0.0,
) -> dict[str, list[float]]:
    """
    Embed `docs` in concurrent chunks. Returns {doc_id: vector}. A chunk that
    fails to embed is logged and its docs are omitted from the result (and thus
    skipped at upsert time) rather than crashing the run.

    chunk_delay: seconds to sleep after each successful chunk — use this to
    stay within the free-tier 100 req/min rate limit (each item counts as 1 req).
    """
    from services.embeddings import GeminiEmbeddings

    embedder = GeminiEmbeddings()
    chunks = _chunk(docs, batch_size)
    semaphore = asyncio.Semaphore(concurrency)
    vectors: dict[str, list[float]] = {}

    async def run_chunk(index: int, chunk: list[Document]) -> None:
        async with semaphore:
            try:
                texts = [d.page_content for d in chunk]
                embeddings = await asyncio.to_thread(embedder.embed_documents, texts)
                if len(embeddings) != len(chunk):
                    raise ValueError(
                        f"embedding count {len(embeddings)} != chunk size {len(chunk)}"
                    )
                for doc, vector in zip(chunk, embeddings):
                    if len(vector) != EMBEDDING_DIMENSIONS:
                        raise ValueError(
                            f"vector dim {len(vector)} != {EMBEDDING_DIMENSIONS} "
                            f"for {doc.metadata.get('model')}"
                        )
                    vectors[doc.id] = vector
                logger.info("  embedded chunk %d/%d (%d docs)",
                            index + 1, len(chunks), len(chunk))
                if chunk_delay > 0:
                    await asyncio.sleep(chunk_delay)
            except Exception as err:
                logger.error("  [SKIP] embedding chunk %d failed: %s", index + 1, err)

    await asyncio.gather(*(run_chunk(i, c) for i, c in enumerate(chunks)))
    return vectors


# ─── Mongo diff + upsert ────────────────────────────────────────────────────────

def partition_by_change(
    collection, docs: list[Document]
) -> tuple[list[Document], int]:
    """
    Split docs into (to_upsert, skipped_count) by comparing each document's
    content_hash against the stored value. Identical → skip (idempotent).
    """
    ids = [d.id for d in docs]
    existing: dict[str, str] = {}
    for found in collection.find({"_id": {"$in": ids}}, {"content_hash": 1}):
        existing[found["_id"]] = found.get("content_hash", "")

    to_upsert: list[Document] = []
    skipped = 0
    for doc in docs:
        if existing.get(doc.id) == doc.metadata["content_hash"]:
            skipped += 1
        else:
            to_upsert.append(doc)
    return to_upsert, skipped


def upsert_documents(
    collection, docs: list[Document], vectors: dict[str, list[float]]
) -> tuple[int, int]:
    """Bulk-upsert documents that were successfully embedded. Returns (inserted, updated)."""
    ops: list[UpdateOne] = []
    for doc in docs:
        vector = vectors.get(doc.id)
        if vector is None:
            continue  # embedding failed for this doc's chunk — leave existing data intact
        ops.append(
            UpdateOne(
                {"_id": doc.id},
                {"$set": {
                    "content": doc.page_content,   # text_key used by VectorStoreEngine
                    "embedding": vector,
                    **doc.metadata,
                }},
                upsert=True,
            )
        )
    if not ops:
        return 0, 0
    result = collection.bulk_write(ops, ordered=False)
    return result.upserted_count, result.modified_count


# ─── Config / verification ──────────────────────────────────────────────────────

def resolve_gemini_key() -> str | None:
    if key := os.environ.get("GOOGLE_API_KEY", "").strip():
        return key
    for i in range(1, 11):
        if key := os.environ.get(f"GEMINI_KEY_{i}", "").strip():
            return key
    return None


def verify_config(source: Path, require_network: bool) -> tuple[str | None, str | None]:
    """
    Validate flags + environment. Prints a resolved-config summary (the
    'execution command flag verification step'). Exits non-zero on hard errors
    when network is required.
    """
    gemini_key = resolve_gemini_key()
    mongo_uri = os.environ.get("MONGODB_ATLAS_URI")
    db_name = os.environ.get("MONGODB_DATABASE", "neurobuilds")
    col_name = os.environ.get("MONGODB_COLLECTION", "hardware_specs")

    logger.info("Configuration")
    logger.info("  source      : %s", source)
    logger.info("  target      : %s.%s (index vector_index)", db_name, col_name)
    logger.info("  gemini key  : %s", "set" if gemini_key else "MISSING")
    logger.info("  mongo uri   : %s", "set" if mongo_uri else "MISSING")

    problems: list[str] = []
    if not source.exists():
        problems.append(f"source file not found: {source}")
    if require_network and not gemini_key:
        problems.append("no Gemini key (set GOOGLE_API_KEY or GEMINI_KEY_1)")
    if require_network and not mongo_uri:
        problems.append("MONGODB_ATLAS_URI not set")

    if problems:
        for p in problems:
            logger.error("  [FAIL] %s", p)
        if require_network or not source.exists():
            sys.exit(1)
    else:
        logger.info("  [OK] configuration OK")
    return mongo_uri, gemini_key


# ─── Entry point ────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Idempotent RAG ingestion of CPU/GPU components into hardware_specs.",
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE,
                        help=f"JSON or CSV source file (default: {DEFAULT_SOURCE})")
    parser.add_argument("--batch-size", type=int, default=64,
                        help="components per embedding chunk (50–100 recommended)")
    parser.add_argument("--concurrency", type=int, default=4,
                        help="embedding chunks in flight concurrently")
    parser.add_argument("--chunk-delay", type=float, default=0.0,
                        help="seconds to sleep after each chunk (use ~15s on free-tier to avoid 429)")
    parser.add_argument("--dry-run", action="store_true",
                        help="parse + diff against Mongo, but generate no embeddings and write nothing")
    parser.add_argument("--verify", action="store_true",
                        help="validate config + parse source, then exit (no Mongo connection)")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not 1 <= args.batch_size <= 200:
        logger.error("--batch-size must be between 1 and 200")
        sys.exit(2)

    t0 = time.time()
    logger.info("%s", "-" * 60)
    logger.info("  NeuroBuilds - RAG Document Ingestion")
    logger.info("%s", "-" * 60)

    require_network = not (args.verify or args.dry_run)
    mongo_uri, _ = verify_config(args.source, require_network)

    # ── Load + build documents (per-row error isolation) ───────────────────────
    raw_rows = load_source(args.source)
    docs: list[Document] = []
    failed = 0
    for i, raw in enumerate(raw_rows):
        try:
            docs.append(build_document(normalise_record(raw)))
        except Exception as err:
            failed += 1
            logger.warning("  [SKIP] row %d: %s", i, err)

    logger.info("Parsed %d/%d rows into documents (%d skipped)",
                len(docs), len(raw_rows), failed)

    # Guard against duplicate brand+model collisions within one source file.
    seen: dict[str, str] = {}
    deduped: list[Document] = []
    for doc in docs:
        if doc.id in seen:
            logger.warning("  [DUP] '%s' collides with '%s' — keeping first",
                           doc.metadata["model"], seen[doc.id])
            continue
        seen[doc.id] = doc.metadata["model"]
        deduped.append(doc)
    docs = deduped

    if args.verify:
        logger.info("Verify-only: %d documents ready. Exiting before network I/O.", len(docs))
        return

    if not docs:
        logger.error("No valid documents to ingest. Aborting.")
        sys.exit(1)

    # ── Connect + diff ─────────────────────────────────────────────────────────
    db_name = os.environ.get("MONGODB_DATABASE", "neurobuilds")
    col_name = os.environ.get("MONGODB_COLLECTION", "hardware_specs")
    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=10_000)
    collection = client[db_name][col_name]

    to_upsert, skipped = partition_by_change(collection, docs)
    logger.info("Idempotency diff: %d new/changed, %d identical (skipped)",
                len(to_upsert), skipped)

    if args.dry_run:
        logger.info("Dry-run: would embed + upsert %d documents. No writes performed.",
                    len(to_upsert))
        for doc in to_upsert:
            logger.info("    - %s %s", doc.metadata["brand"], doc.metadata["model"])
        return

    if not to_upsert:
        logger.info("Nothing to do — collection already up to date. Done in %.1fs.",
                    time.time() - t0)
        return

    # ── Embed (async) + upsert ─────────────────────────────────────────────────
    logger.info("Embedding %d documents (batch=%d, concurrency=%d, delay=%.1fs) ...",
                len(to_upsert), args.batch_size, args.concurrency, args.chunk_delay)
    vectors = asyncio.run(
        embed_documents_async(to_upsert, args.batch_size, args.concurrency,
                              chunk_delay=args.chunk_delay)
    )
    embedded = len(vectors)
    if embedded < len(to_upsert):
        logger.warning("  %d/%d documents embedded — %d skipped due to chunk errors",
                       embedded, len(to_upsert), len(to_upsert) - embedded)

    inserted, updated = upsert_documents(collection, to_upsert, vectors)

    # ── Summary ────────────────────────────────────────────────────────────────
    logger.info("%s", "-" * 60)
    logger.info("  Done in %.1fs", time.time() - t0)
    logger.info("  Inserted : %d", inserted)
    logger.info("  Updated  : %d", updated)
    logger.info("  Skipped  : %d (unchanged)", skipped)
    logger.info("  Failed   : %d (parse) + %d (embed)",
                failed, len(to_upsert) - embedded)
    logger.info("  Target   : %s.%s", db_name, col_name)
    logger.info("%s", "-" * 60)
    logger.info("Ensure the Atlas Vector Search index 'vector_index' exists on "
                "'embedding' (768 dims, cosine).")


if __name__ == "__main__":
    main()
