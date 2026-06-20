"""
NeuroBuilds — MongoDB Atlas RAG Ingest Script
Populates the hardware_specs collection with GPU, CPU, motherboard, RAM, and PSU data.
Generates Gemini embeddings for each document and upserts into Atlas.

Usage:
    cd backend
    python ../scripts/ingest-rag.py

Requires backend/.env with GOOGLE_API_KEY and MONGODB_ATLAS_URI.
After ingestion, create the Atlas Vector Search index named 'vector_index'
on the 'embedding' field (dimensions: 768, similarity: cosine).
"""

import csv
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

# Load backend .env
load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

try:
    from google import genai
    from pymongo import MongoClient, UpdateOne
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Run: pip install google-genai pymongo python-dotenv")
    sys.exit(1)


# ─── Hardware dataset ─────────────────────────────────────────────────────────

HARDWARE_SPECS = [
    # ── GPUs ──────────────────────────────────────────────────────────────────
    {
        "type": "gpu", "name": "NVIDIA GeForce RTX 4090",
        "vram": "24GB GDDR6X", "tdp": 450, "price_usd": 1599,
        "cuda_cores": 16384, "boost_clock": "2.52 GHz", "memory_bus": "384-bit",
        "tier": "Flagship", "use_case": "4K gaming, content creation, AI workloads",
    },
    {
        "type": "gpu", "name": "NVIDIA GeForce RTX 4080 Super",
        "vram": "16GB GDDR6X", "tdp": 320, "price_usd": 999,
        "cuda_cores": 10240, "boost_clock": "2.55 GHz", "memory_bus": "256-bit",
        "tier": "High-end", "use_case": "4K/1440p gaming, VR",
    },
    {
        "type": "gpu", "name": "NVIDIA GeForce RTX 4080",
        "vram": "16GB GDDR6X", "tdp": 320, "price_usd": 1199,
        "cuda_cores": 9728, "boost_clock": "2.51 GHz", "memory_bus": "256-bit",
        "tier": "High-end", "use_case": "4K/1440p gaming",
    },
    {
        "type": "gpu", "name": "NVIDIA GeForce RTX 4070 Ti Super",
        "vram": "16GB GDDR6X", "tdp": 285, "price_usd": 799,
        "cuda_cores": 8448, "boost_clock": "2.61 GHz", "memory_bus": "256-bit",
        "tier": "High-end", "use_case": "1440p/4K gaming",
    },
    {
        "type": "gpu", "name": "NVIDIA GeForce RTX 4070 Super",
        "vram": "12GB GDDR6X", "tdp": 220, "price_usd": 599,
        "cuda_cores": 7168, "boost_clock": "2.48 GHz", "memory_bus": "192-bit",
        "tier": "Upper mid-range", "use_case": "1440p gaming",
    },
    {
        "type": "gpu", "name": "NVIDIA GeForce RTX 4070",
        "vram": "12GB GDDR6X", "tdp": 200, "price_usd": 549,
        "cuda_cores": 5888, "boost_clock": "2.475 GHz", "memory_bus": "192-bit",
        "tier": "Mid-range", "use_case": "1440p gaming",
    },
    {
        "type": "gpu", "name": "NVIDIA GeForce RTX 4060 Ti",
        "vram": "8GB GDDR6", "tdp": 165, "price_usd": 399,
        "cuda_cores": 4352, "boost_clock": "2.54 GHz", "memory_bus": "128-bit",
        "tier": "Mid-range", "use_case": "1080p/1440p gaming",
    },
    {
        "type": "gpu", "name": "NVIDIA GeForce RTX 4060",
        "vram": "8GB GDDR6", "tdp": 115, "price_usd": 299,
        "cuda_cores": 3072, "boost_clock": "2.46 GHz", "memory_bus": "128-bit",
        "tier": "Budget", "use_case": "1080p gaming",
    },
    {
        "type": "gpu", "name": "AMD Radeon RX 7900 XTX",
        "vram": "24GB GDDR6", "tdp": 355, "price_usd": 949,
        "compute_units": 96, "boost_clock": "2.5 GHz", "memory_bus": "384-bit",
        "tier": "Flagship", "use_case": "4K gaming, content creation",
    },
    {
        "type": "gpu", "name": "AMD Radeon RX 7900 XT",
        "vram": "20GB GDDR6", "tdp": 315, "price_usd": 799,
        "compute_units": 84, "boost_clock": "2.4 GHz", "memory_bus": "320-bit",
        "tier": "High-end", "use_case": "4K/1440p gaming",
    },
    {
        "type": "gpu", "name": "AMD Radeon RX 7800 XT",
        "vram": "16GB GDDR6", "tdp": 263, "price_usd": 499,
        "compute_units": 60, "boost_clock": "2.43 GHz", "memory_bus": "256-bit",
        "tier": "Upper mid-range", "use_case": "1440p gaming",
    },
    {
        "type": "gpu", "name": "AMD Radeon RX 7700 XT",
        "vram": "12GB GDDR6", "tdp": 245, "price_usd": 449,
        "compute_units": 54, "boost_clock": "2.54 GHz", "memory_bus": "192-bit",
        "tier": "Mid-range", "use_case": "1440p gaming",
    },
    {
        "type": "gpu", "name": "AMD Radeon RX 7600",
        "vram": "8GB GDDR6", "tdp": 165, "price_usd": 269,
        "compute_units": 32, "boost_clock": "2.655 GHz", "memory_bus": "128-bit",
        "tier": "Budget", "use_case": "1080p gaming",
    },
    {
        "type": "gpu", "name": "NVIDIA GeForce RTX 3080",
        "vram": "10GB GDDR6X", "tdp": 320, "price_usd": 500,
        "cuda_cores": 8704, "boost_clock": "1.71 GHz", "memory_bus": "320-bit",
        "tier": "Previous gen high-end", "use_case": "4K/1440p gaming",
    },
    {
        "type": "gpu", "name": "NVIDIA GeForce RTX 3070",
        "vram": "8GB GDDR6", "tdp": 220, "price_usd": 350,
        "cuda_cores": 5888, "boost_clock": "1.73 GHz", "memory_bus": "256-bit",
        "tier": "Previous gen mid-range", "use_case": "1440p gaming",
    },

    # ── CPUs ──────────────────────────────────────────────────────────────────
    {
        "type": "cpu", "name": "Intel Core i9-14900K",
        "cores": "24 (8P+16E)", "threads": 32, "tdp": 125, "price_usd": 399,
        "boost_clock": "6.0 GHz", "base_clock": "3.2 GHz", "socket": "LGA1700",
        "cache": "36MB L3", "tier": "Flagship", "use_case": "Gaming, content creation, streaming",
    },
    {
        "type": "cpu", "name": "Intel Core i7-14700K",
        "cores": "20 (8P+12E)", "threads": 28, "tdp": 125, "price_usd": 319,
        "boost_clock": "5.6 GHz", "base_clock": "3.4 GHz", "socket": "LGA1700",
        "cache": "33MB L3", "tier": "High-end", "use_case": "Gaming, productivity",
    },
    {
        "type": "cpu", "name": "Intel Core i5-14600K",
        "cores": "14 (6P+8E)", "threads": 20, "tdp": 125, "price_usd": 229,
        "boost_clock": "5.3 GHz", "base_clock": "3.5 GHz", "socket": "LGA1700",
        "cache": "24MB L3", "tier": "Mid-range", "use_case": "Gaming, everyday productivity",
    },
    {
        "type": "cpu", "name": "AMD Ryzen 9 7950X",
        "cores": 16, "threads": 32, "tdp": 170, "price_usd": 549,
        "boost_clock": "5.7 GHz", "base_clock": "4.5 GHz", "socket": "AM5",
        "cache": "64MB L3", "tier": "Flagship", "use_case": "Content creation, 3D rendering, workstation",
    },
    {
        "type": "cpu", "name": "AMD Ryzen 9 7900X",
        "cores": 12, "threads": 24, "tdp": 170, "price_usd": 379,
        "boost_clock": "5.6 GHz", "base_clock": "4.7 GHz", "socket": "AM5",
        "cache": "64MB L3", "tier": "High-end", "use_case": "Content creation, gaming",
    },
    {
        "type": "cpu", "name": "AMD Ryzen 7 7800X3D",
        "cores": 8, "threads": 16, "tdp": 120, "price_usd": 349,
        "boost_clock": "5.0 GHz", "base_clock": "4.5 GHz", "socket": "AM5",
        "cache": "96MB L3 (3D V-Cache)", "tier": "Gaming flagship", "use_case": "Best-in-class gaming",
    },
    {
        "type": "cpu", "name": "AMD Ryzen 7 7700X",
        "cores": 8, "threads": 16, "tdp": 105, "price_usd": 249,
        "boost_clock": "5.4 GHz", "base_clock": "4.5 GHz", "socket": "AM5",
        "cache": "32MB L3", "tier": "Upper mid-range", "use_case": "Gaming, productivity",
    },
    {
        "type": "cpu", "name": "AMD Ryzen 5 7600X",
        "cores": 6, "threads": 12, "tdp": 105, "price_usd": 179,
        "boost_clock": "5.3 GHz", "base_clock": "4.7 GHz", "socket": "AM5",
        "cache": "32MB L3", "tier": "Mid-range", "use_case": "Gaming, budget builds",
    },
    {
        "type": "cpu", "name": "AMD Ryzen 5 5600X",
        "cores": 6, "threads": 12, "tdp": 65, "price_usd": 149,
        "boost_clock": "4.6 GHz", "base_clock": "3.7 GHz", "socket": "AM4",
        "cache": "32MB L3", "tier": "Budget", "use_case": "Budget gaming",
    },

    # ── Motherboards ──────────────────────────────────────────────────────────
    {
        "type": "motherboard", "name": "ASUS ROG STRIX B650-A Gaming WiFi",
        "socket": "AM5", "chipset": "B650", "form_factor": "ATX",
        "memory_slots": 4, "max_memory": "128GB DDR5", "price_usd": 199,
        "features": "WiFi 6E, 2.5G LAN, PCIe 5.0",
        "use_case": "AMD AM5 mid-range gaming build",
    },
    {
        "type": "motherboard", "name": "MSI MAG X670E Tomahawk WiFi",
        "socket": "AM5", "chipset": "X670E", "form_factor": "ATX",
        "memory_slots": 4, "max_memory": "192GB DDR5", "price_usd": 299,
        "features": "WiFi 6E, 2.5G LAN, PCIe 5.0 x16 and M.2",
        "use_case": "AMD AM5 high-end gaming or workstation",
    },
    {
        "type": "motherboard", "name": "Gigabyte B650 AORUS Elite AX",
        "socket": "AM5", "chipset": "B650", "form_factor": "ATX",
        "memory_slots": 4, "max_memory": "128GB DDR5", "price_usd": 219,
        "features": "WiFi 6E, 2.5G LAN, PCIe 4.0",
        "use_case": "AMD AM5 mainstream gaming",
    },
    {
        "type": "motherboard", "name": "ASUS TUF Gaming Z790-Plus WiFi",
        "socket": "LGA1700", "chipset": "Z790", "form_factor": "ATX",
        "memory_slots": 4, "max_memory": "128GB DDR5", "price_usd": 249,
        "features": "WiFi 6E, 2.5G LAN, PCIe 5.0",
        "use_case": "Intel LGA1700 mid-to-high-end gaming",
    },
    {
        "type": "motherboard", "name": "MSI PRO B760M-A WiFi DDR4",
        "socket": "LGA1700", "chipset": "B760", "form_factor": "Micro-ATX",
        "memory_slots": 4, "max_memory": "128GB DDR4", "price_usd": 139,
        "features": "WiFi 5, 2.5G LAN, PCIe 4.0",
        "use_case": "Intel LGA1700 budget compact build",
    },
    {
        "type": "motherboard", "name": "ASUS ROG CROSSHAIR X670E Hero",
        "socket": "AM5", "chipset": "X670E", "form_factor": "ATX",
        "memory_slots": 4, "max_memory": "128GB DDR5", "price_usd": 499,
        "features": "WiFi 6E, 10G LAN, dual PCIe 5.0",
        "use_case": "AMD AM5 flagship enthusiast platform",
    },

    # ── RAM ───────────────────────────────────────────────────────────────────
    {
        "type": "ram", "name": "Corsair Vengeance DDR5-5600 32GB",
        "capacity": "32GB", "kit": "2x16GB", "speed": "DDR5-5600",
        "latency": "CL36", "voltage": "1.25V", "price_usd": 89,
        "use_case": "AM5/LGA1700 mainstream gaming",
    },
    {
        "type": "ram", "name": "G.Skill Trident Z5 RGB DDR5-6000 32GB",
        "capacity": "32GB", "kit": "2x16GB", "speed": "DDR5-6000",
        "latency": "CL30", "voltage": "1.35V", "price_usd": 129,
        "use_case": "AM5 high-performance gaming (EXPO profile)",
    },
    {
        "type": "ram", "name": "Kingston Fury Beast DDR4-3200 16GB",
        "capacity": "16GB", "kit": "2x8GB", "speed": "DDR4-3200",
        "latency": "CL16", "voltage": "1.35V", "price_usd": 39,
        "use_case": "LGA1700/AM4 budget gaming",
    },
    {
        "type": "ram", "name": "Corsair Vengeance LPX DDR4-3600 32GB",
        "capacity": "32GB", "kit": "2x16GB", "speed": "DDR4-3600",
        "latency": "CL18", "voltage": "1.35V", "price_usd": 69,
        "use_case": "LGA1700/AM4 mainstream to high-end gaming",
    },
    {
        "type": "ram", "name": "G.Skill Ripjaws V DDR4-3200 16GB",
        "capacity": "16GB", "kit": "2x8GB", "speed": "DDR4-3200",
        "latency": "CL16", "voltage": "1.35V", "price_usd": 35,
        "use_case": "AM4 budget gaming build",
    },
    {
        "type": "ram", "name": "Teamgroup T-Force Vulcan DDR5-5200 64GB",
        "capacity": "64GB", "kit": "2x32GB", "speed": "DDR5-5200",
        "latency": "CL40", "voltage": "1.1V", "price_usd": 159,
        "use_case": "Content creation, workstation, streaming",
    },

    # ── PSUs ──────────────────────────────────────────────────────────────────
    {
        "type": "psu", "name": "Corsair RM1000x",
        "wattage": 1000, "efficiency": "80+ Gold", "modular": "Fully Modular",
        "price_usd": 179, "warranty": "10 years",
        "use_case": "High-end GPU builds (RTX 4090, RX 7900 XTX)",
    },
    {
        "type": "psu", "name": "Corsair RM850x",
        "wattage": 850, "efficiency": "80+ Gold", "modular": "Fully Modular",
        "price_usd": 149, "warranty": "10 years",
        "use_case": "RTX 4080/4070 Ti class GPUs",
    },
    {
        "type": "psu", "name": "Corsair RM750x",
        "wattage": 750, "efficiency": "80+ Gold", "modular": "Fully Modular",
        "price_usd": 109, "warranty": "10 years",
        "use_case": "RTX 4070/4060 Ti class GPUs",
    },
    {
        "type": "psu", "name": "Seasonic Focus GX-850",
        "wattage": 850, "efficiency": "80+ Gold", "modular": "Fully Modular",
        "price_usd": 139, "warranty": "10 years",
        "use_case": "High-end gaming builds",
    },
    {
        "type": "psu", "name": "be quiet! Straight Power 11 750W",
        "wattage": 750, "efficiency": "80+ Platinum", "modular": "Fully Modular",
        "price_usd": 129, "warranty": "5 years",
        "use_case": "Quiet mid-to-high-end gaming builds",
    },
    {
        "type": "psu", "name": "EVGA SuperNOVA 650 G6",
        "wattage": 650, "efficiency": "80+ Gold", "modular": "Fully Modular",
        "price_usd": 89, "warranty": "10 years",
        "use_case": "RTX 4060/RX 7600 class budget gaming builds",
    },
    {
        "type": "psu", "name": "Corsair CX550",
        "wattage": 550, "efficiency": "80+ Bronze", "modular": "Non-Modular",
        "price_usd": 59, "warranty": "5 years",
        "use_case": "Entry-level gaming or office builds",
    },
]


def make_content(spec: dict) -> str:
    """Produce a rich natural-language description for embedding."""
    t = spec["type"]
    name = spec["name"]

    if t == "gpu":
        return (
            f"{name} graphics card (GPU). VRAM: {spec.get('vram', 'N/A')}. "
            f"TDP: {spec.get('tdp', 'N/A')}W. "
            f"Price: ~${spec.get('price_usd', 'N/A')} USD. "
            f"Performance tier: {spec.get('tier', '')}. "
            f"Best for: {spec.get('use_case', '')}. "
            f"Boost clock: {spec.get('boost_clock', 'N/A')}. "
            f"Memory bus: {spec.get('memory_bus', 'N/A')}."
        )
    elif t == "cpu":
        return (
            f"{name} processor (CPU). "
            f"Cores: {spec.get('cores', 'N/A')}, Threads: {spec.get('threads', 'N/A')}. "
            f"TDP: {spec.get('tdp', 'N/A')}W. Socket: {spec.get('socket', 'N/A')}. "
            f"Boost clock: {spec.get('boost_clock', 'N/A')}. "
            f"Cache: {spec.get('cache', 'N/A')}. "
            f"Price: ~${spec.get('price_usd', 'N/A')} USD. "
            f"Tier: {spec.get('tier', '')}. Best for: {spec.get('use_case', '')}."
        )
    elif t == "motherboard":
        return (
            f"{name} motherboard. Socket: {spec.get('socket', 'N/A')}. "
            f"Chipset: {spec.get('chipset', 'N/A')}. Form factor: {spec.get('form_factor', 'N/A')}. "
            f"Max memory: {spec.get('max_memory', 'N/A')} ({spec.get('memory_slots', 'N/A')} slots). "
            f"Features: {spec.get('features', '')}. "
            f"Price: ~${spec.get('price_usd', 'N/A')} USD. "
            f"Best for: {spec.get('use_case', '')}."
        )
    elif t == "ram":
        return (
            f"{name} memory (RAM). "
            f"Capacity: {spec.get('capacity', 'N/A')} ({spec.get('kit', 'N/A')}). "
            f"Speed: {spec.get('speed', 'N/A')}. Latency: {spec.get('latency', 'N/A')}. "
            f"Price: ~${spec.get('price_usd', 'N/A')} USD. "
            f"Best for: {spec.get('use_case', '')}."
        )
    elif t == "psu":
        return (
            f"{name} power supply unit (PSU). "
            f"Wattage: {spec.get('wattage', 'N/A')}W. "
            f"Efficiency: {spec.get('efficiency', 'N/A')}. "
            f"Modular: {spec.get('modular', 'N/A')}. "
            f"Price: ~${spec.get('price_usd', 'N/A')} USD. "
            f"Best for: {spec.get('use_case', '')}."
        )
    else:
        return json.dumps(spec)


def load_csv_gpus(csv_path: Path) -> list[dict]:
    """Merge any rows from GPU_Exhaustive_Database.csv into the dataset."""
    rows = []
    if not csv_path.exists():
        return rows
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if not row.get("Custom_Model_Name"):
                continue
            rows.append({
                "type": "gpu",
                "name": row["Custom_Model_Name"].strip(),
                "base_chip": row.get("Base_Chip", ""),
                "aib_partner": row.get("AIB_Partner", ""),
                "base_clock": row.get("Base_Clock", ""),
                "boost_clock": row.get("Boost_Clock", ""),
                "memory_clock": row.get("Memory_Clock", ""),
                "length_mm": row.get("Length", ""),
                "use_case": "PC gaming and compute",
            })
    return rows


def embed_batch(texts: list[str], model: str = "models/embedding-001") -> list[list[float]]:
    """Embed a batch of texts using Gemini, with a small delay to avoid rate limits."""
    api_key = os.environ.get("GOOGLE_API_KEY", "")
    client = genai.Client(api_key=api_key)
    BATCH_SIZE = 20
    all_embeddings: list[list[float]] = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        result = client.models.embed_content(model=model, contents=batch)
        all_embeddings.extend([list(e.values) for e in result.embeddings])
        if i + BATCH_SIZE < len(texts):
            time.sleep(0.3)  # stay within rate limits
    return all_embeddings


def main() -> None:
    google_key = os.environ.get("GOOGLE_API_KEY")
    mongo_uri = os.environ.get("MONGODB_ATLAS_URI")

    if not google_key:
        print("ERROR: GOOGLE_API_KEY not set in backend/.env")
        sys.exit(1)
    if not mongo_uri:
        print("ERROR: MONGODB_ATLAS_URI not set in backend/.env")
        sys.exit(1)

    db_name = os.environ.get("MONGODB_DATABASE", "neurobuilds")
    col_name = os.environ.get("MONGODB_COLLECTION", "hardware_specs")

    # ── Merge hardcoded + CSV data ────────────────────────────────────────────
    csv_path = Path(__file__).parent.parent / "GPU_Exhaustive_Database.csv"
    csv_extras = load_csv_gpus(csv_path)

    # Deduplicate CSV GPUs against hardcoded names
    existing_names = {s["name"].lower() for s in HARDWARE_SPECS}
    csv_new = [r for r in csv_extras if r["name"].lower() not in existing_names]

    all_specs = HARDWARE_SPECS + csv_new
    print(f"Total hardware entries to ingest: {len(all_specs)} "
          f"({len(HARDWARE_SPECS)} hardcoded + {len(csv_new)} from CSV)")

    # ── Generate embeddings ───────────────────────────────────────────────────
    genai.configure(api_key=google_key)
    contents = [make_content(s) for s in all_specs]

    print("Generating embeddings via Gemini embedding-001 …")
    embeddings = embed_batch(contents)
    print(f"  ✓ {len(embeddings)} embeddings generated")

    # ── Upsert into MongoDB Atlas ─────────────────────────────────────────────
    mongo = MongoClient(mongo_uri, serverSelectionTimeoutMS=10_000)
    col = mongo[db_name][col_name]

    ops = []
    for spec, emb, content in zip(all_specs, embeddings, contents):
        doc = {
            **spec,
            "content": content,
            "embedding": emb,
        }
        ops.append(
            UpdateOne(
                {"name": spec["name"]},
                {"$set": doc},
                upsert=True,
            )
        )

    result = col.bulk_write(ops)
    print(f"  ✓ MongoDB upsert complete: "
          f"{result.upserted_count} inserted, {result.modified_count} updated")

    print()
    print("Next step — create the Atlas Vector Search index:")
    print("  1. Open your Atlas cluster → Search → Create Search Index")
    print("  2. Choose 'Atlas Vector Search' (JSON editor)")
    print(f"  3. Database: {db_name}  Collection: {col_name}")
    print("  4. Paste this index definition:")
    print(json.dumps({
        "fields": [{
            "numDimensions": 768,
            "path": "embedding",
            "similarity": "cosine",
            "type": "vector",
        }]
    }, indent=2))
    print(f"  5. Name the index: vector_index")
    print()
    print("Done!")


if __name__ == "__main__":
    main()
