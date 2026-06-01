"""
NeuroBuilds — Hardware Catalog Ingestion Script
Populates the `hardware_catalog` collection with GPU, CPU, motherboard, RAM,
and PSU data sourced from three inputs (merged in priority order):

  1. Hardcoded authoritative specs — flagship cards with full TDP/VRAM/price
  2. CPU_Exhaustive_Database.csv  — ~70-column rich CPU dataset
  3. GPU_Exhaustive_Database.csv  — 8-column AIB card index (sparse specs)

Each document is dual-indexed:
  • B-tree index on `name`    → fast substring regex lookup
  • Dense vector on `embedding` → semantic RAG (Atlas Vector Search)

Usage:
    cd backend
    python scripts/ingest_hardware.py

Requires backend/.env with OPENAI_API_KEY and MONGODB_ATLAS_URI.
"""

import csv
import json
import os
import re
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

# Resolve .env from backend/ regardless of invocation directory
_env_path = Path(__file__).parent.parent / ".env"
load_dotenv(_env_path)

try:
    from openai import OpenAI
    from pymongo import MongoClient, UpdateOne
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Run: pip install openai pymongo python-dotenv")
    sys.exit(1)


# ─── Authoritative hardcoded specs ────────────────────────────────────────────
# Primary source for flagship GPU/CPU/MB/RAM/PSU entries — contains fields
# (VRAM, TDP, price) that the sparse GPU CSV does not carry.

HARDCODED_SPECS: list[dict] = [
    # ── GPUs ──────────────────────────────────────────────────────────────────
    {"category": "GPU", "name": "NVIDIA GeForce RTX 4090",
     "specs": {"vram": "24GB GDDR6X", "tdp_w": 450, "launch_msrp_usd": 1599,
               "cuda_cores": 16384, "boost_clock_mhz": 2520, "memory_bus": "384-bit",
               "tier": "Flagship", "use_case": "4K gaming, content creation, AI workloads"}},
    {"category": "GPU", "name": "NVIDIA GeForce RTX 4080 Super",
     "specs": {"vram": "16GB GDDR6X", "tdp_w": 320, "launch_msrp_usd": 999,
               "cuda_cores": 10240, "boost_clock_mhz": 2550, "memory_bus": "256-bit",
               "tier": "High-end", "use_case": "4K/1440p gaming, VR"}},
    {"category": "GPU", "name": "NVIDIA GeForce RTX 4080",
     "specs": {"vram": "16GB GDDR6X", "tdp_w": 320, "launch_msrp_usd": 1199,
               "cuda_cores": 9728, "boost_clock_mhz": 2510, "memory_bus": "256-bit",
               "tier": "High-end", "use_case": "4K/1440p gaming"}},
    {"category": "GPU", "name": "NVIDIA GeForce RTX 4070 Ti Super",
     "specs": {"vram": "16GB GDDR6X", "tdp_w": 285, "launch_msrp_usd": 799,
               "cuda_cores": 8448, "boost_clock_mhz": 2610, "memory_bus": "256-bit",
               "tier": "High-end", "use_case": "1440p/4K gaming"}},
    {"category": "GPU", "name": "NVIDIA GeForce RTX 4070 Super",
     "specs": {"vram": "12GB GDDR6X", "tdp_w": 220, "launch_msrp_usd": 599,
               "cuda_cores": 7168, "boost_clock_mhz": 2480, "memory_bus": "192-bit",
               "tier": "Upper mid-range", "use_case": "1440p gaming"}},
    {"category": "GPU", "name": "NVIDIA GeForce RTX 4070",
     "specs": {"vram": "12GB GDDR6X", "tdp_w": 200, "launch_msrp_usd": 549,
               "cuda_cores": 5888, "boost_clock_mhz": 2475, "memory_bus": "192-bit",
               "tier": "Mid-range", "use_case": "1440p gaming"}},
    {"category": "GPU", "name": "NVIDIA GeForce RTX 4060 Ti",
     "specs": {"vram": "8GB GDDR6", "tdp_w": 165, "launch_msrp_usd": 399,
               "cuda_cores": 4352, "boost_clock_mhz": 2535, "memory_bus": "128-bit",
               "tier": "Mid-range", "use_case": "1080p/1440p gaming"}},
    {"category": "GPU", "name": "NVIDIA GeForce RTX 4060",
     "specs": {"vram": "8GB GDDR6", "tdp_w": 115, "launch_msrp_usd": 299,
               "cuda_cores": 3072, "boost_clock_mhz": 2460, "memory_bus": "128-bit",
               "tier": "Budget", "use_case": "1080p gaming"}},
    {"category": "GPU", "name": "AMD Radeon RX 7900 XTX",
     "specs": {"vram": "24GB GDDR6", "tdp_w": 355, "launch_msrp_usd": 949,
               "compute_units": 96, "boost_clock_mhz": 2500, "memory_bus": "384-bit",
               "tier": "Flagship", "use_case": "4K gaming, content creation"}},
    {"category": "GPU", "name": "AMD Radeon RX 7900 XT",
     "specs": {"vram": "20GB GDDR6", "tdp_w": 315, "launch_msrp_usd": 799,
               "compute_units": 84, "boost_clock_mhz": 2400, "memory_bus": "320-bit",
               "tier": "High-end", "use_case": "4K/1440p gaming"}},
    {"category": "GPU", "name": "AMD Radeon RX 7800 XT",
     "specs": {"vram": "16GB GDDR6", "tdp_w": 263, "launch_msrp_usd": 499,
               "compute_units": 60, "boost_clock_mhz": 2430, "memory_bus": "256-bit",
               "tier": "Upper mid-range", "use_case": "1440p gaming"}},
    {"category": "GPU", "name": "AMD Radeon RX 7700 XT",
     "specs": {"vram": "12GB GDDR6", "tdp_w": 245, "launch_msrp_usd": 449,
               "compute_units": 54, "boost_clock_mhz": 2540, "memory_bus": "192-bit",
               "tier": "Mid-range", "use_case": "1440p gaming"}},
    {"category": "GPU", "name": "AMD Radeon RX 7600",
     "specs": {"vram": "8GB GDDR6", "tdp_w": 165, "launch_msrp_usd": 269,
               "compute_units": 32, "boost_clock_mhz": 2655, "memory_bus": "128-bit",
               "tier": "Budget", "use_case": "1080p gaming"}},
    {"category": "GPU", "name": "NVIDIA GeForce RTX 3080",
     "specs": {"vram": "10GB GDDR6X", "tdp_w": 320, "launch_msrp_usd": 699,
               "cuda_cores": 8704, "boost_clock_mhz": 1710, "memory_bus": "320-bit",
               "tier": "Previous gen high-end", "use_case": "4K/1440p gaming"}},
    {"category": "GPU", "name": "NVIDIA GeForce RTX 3070",
     "specs": {"vram": "8GB GDDR6", "tdp_w": 220, "launch_msrp_usd": 499,
               "cuda_cores": 5888, "boost_clock_mhz": 1730, "memory_bus": "256-bit",
               "tier": "Previous gen mid-range", "use_case": "1440p gaming"}},

    # ── CPUs ──────────────────────────────────────────────────────────────────
    {"category": "CPU", "name": "Intel Core i9-14900K",
     "specs": {"cores": 24, "threads": 32, "tdp_w": 125, "launch_msrp_usd": 399,
               "boost_clock_ghz": 6.0, "base_clock_ghz": 3.2, "socket": "LGA1700",
               "l3_cache_mb": 36, "tier": "Flagship"}},
    {"category": "CPU", "name": "Intel Core i7-14700K",
     "specs": {"cores": 20, "threads": 28, "tdp_w": 125, "launch_msrp_usd": 319,
               "boost_clock_ghz": 5.6, "base_clock_ghz": 3.4, "socket": "LGA1700",
               "l3_cache_mb": 33, "tier": "High-end"}},
    {"category": "CPU", "name": "Intel Core i5-14600K",
     "specs": {"cores": 14, "threads": 20, "tdp_w": 125, "launch_msrp_usd": 229,
               "boost_clock_ghz": 5.3, "base_clock_ghz": 3.5, "socket": "LGA1700",
               "l3_cache_mb": 24, "tier": "Mid-range"}},
    {"category": "CPU", "name": "AMD Ryzen 9 7950X",
     "specs": {"cores": 16, "threads": 32, "tdp_w": 170, "launch_msrp_usd": 699,
               "boost_clock_ghz": 5.7, "base_clock_ghz": 4.5, "socket": "AM5",
               "l3_cache_mb": 64, "tier": "Flagship"}},
    {"category": "CPU", "name": "AMD Ryzen 9 7900X",
     "specs": {"cores": 12, "threads": 24, "tdp_w": 170, "launch_msrp_usd": 449,
               "boost_clock_ghz": 5.6, "base_clock_ghz": 4.7, "socket": "AM5",
               "l3_cache_mb": 64, "tier": "High-end"}},
    {"category": "CPU", "name": "AMD Ryzen 7 7800X3D",
     "specs": {"cores": 8, "threads": 16, "tdp_w": 120, "launch_msrp_usd": 449,
               "boost_clock_ghz": 5.0, "base_clock_ghz": 4.5, "socket": "AM5",
               "l3_cache_mb": 96, "cache_type": "3D V-Cache", "tier": "Gaming flagship"}},
    {"category": "CPU", "name": "AMD Ryzen 7 7700X",
     "specs": {"cores": 8, "threads": 16, "tdp_w": 105, "launch_msrp_usd": 299,
               "boost_clock_ghz": 5.4, "base_clock_ghz": 4.5, "socket": "AM5",
               "l3_cache_mb": 32, "tier": "Upper mid-range"}},
    {"category": "CPU", "name": "AMD Ryzen 5 7600X",
     "specs": {"cores": 6, "threads": 12, "tdp_w": 105, "launch_msrp_usd": 249,
               "boost_clock_ghz": 5.3, "base_clock_ghz": 4.7, "socket": "AM5",
               "l3_cache_mb": 32, "tier": "Mid-range"}},
    {"category": "CPU", "name": "AMD Ryzen 5 5600X",
     "specs": {"cores": 6, "threads": 12, "tdp_w": 65, "launch_msrp_usd": 299,
               "boost_clock_ghz": 4.6, "base_clock_ghz": 3.7, "socket": "AM4",
               "l3_cache_mb": 32, "tier": "Budget"}},

    # ── Motherboards ──────────────────────────────────────────────────────────
    {"category": "MOTHERBOARD", "name": "ASUS ROG STRIX B650-A Gaming WiFi",
     "specs": {"socket": "AM5", "chipset": "B650", "form_factor": "ATX",
               "memory_slots": 4, "max_memory_gb": 128, "memory_type": "DDR5",
               "launch_msrp_usd": 199, "features": "WiFi 6E, 2.5G LAN, PCIe 5.0"}},
    {"category": "MOTHERBOARD", "name": "MSI MAG X670E Tomahawk WiFi",
     "specs": {"socket": "AM5", "chipset": "X670E", "form_factor": "ATX",
               "memory_slots": 4, "max_memory_gb": 192, "memory_type": "DDR5",
               "launch_msrp_usd": 299, "features": "WiFi 6E, 2.5G LAN, PCIe 5.0 x16 and M.2"}},
    {"category": "MOTHERBOARD", "name": "Gigabyte B650 AORUS Elite AX",
     "specs": {"socket": "AM5", "chipset": "B650", "form_factor": "ATX",
               "memory_slots": 4, "max_memory_gb": 128, "memory_type": "DDR5",
               "launch_msrp_usd": 219, "features": "WiFi 6E, 2.5G LAN, PCIe 4.0"}},
    {"category": "MOTHERBOARD", "name": "ASUS TUF Gaming Z790-Plus WiFi",
     "specs": {"socket": "LGA1700", "chipset": "Z790", "form_factor": "ATX",
               "memory_slots": 4, "max_memory_gb": 128, "memory_type": "DDR5",
               "launch_msrp_usd": 249, "features": "WiFi 6E, 2.5G LAN, PCIe 5.0"}},
    {"category": "MOTHERBOARD", "name": "MSI PRO B760M-A WiFi DDR4",
     "specs": {"socket": "LGA1700", "chipset": "B760", "form_factor": "Micro-ATX",
               "memory_slots": 4, "max_memory_gb": 128, "memory_type": "DDR4",
               "launch_msrp_usd": 139, "features": "WiFi 5, 2.5G LAN, PCIe 4.0"}},
    {"category": "MOTHERBOARD", "name": "ASUS ROG CROSSHAIR X670E Hero",
     "specs": {"socket": "AM5", "chipset": "X670E", "form_factor": "ATX",
               "memory_slots": 4, "max_memory_gb": 128, "memory_type": "DDR5",
               "launch_msrp_usd": 499, "features": "WiFi 6E, 10G LAN, dual PCIe 5.0"}},

    # ── RAM ───────────────────────────────────────────────────────────────────
    {"category": "RAM", "name": "Corsair Vengeance DDR5-5600 32GB",
     "specs": {"capacity_gb": 32, "kit": "2x16GB", "speed": "DDR5-5600",
               "speed_mhz": 5600, "latency": "CL36", "voltage_v": 1.25,
               "memory_type": "DDR5", "launch_msrp_usd": 89}},
    {"category": "RAM", "name": "G.Skill Trident Z5 RGB DDR5-6000 32GB",
     "specs": {"capacity_gb": 32, "kit": "2x16GB", "speed": "DDR5-6000",
               "speed_mhz": 6000, "latency": "CL30", "voltage_v": 1.35,
               "memory_type": "DDR5", "launch_msrp_usd": 129}},
    {"category": "RAM", "name": "Kingston Fury Beast DDR4-3200 16GB",
     "specs": {"capacity_gb": 16, "kit": "2x8GB", "speed": "DDR4-3200",
               "speed_mhz": 3200, "latency": "CL16", "voltage_v": 1.35,
               "memory_type": "DDR4", "launch_msrp_usd": 39}},
    {"category": "RAM", "name": "Corsair Vengeance LPX DDR4-3600 32GB",
     "specs": {"capacity_gb": 32, "kit": "2x16GB", "speed": "DDR4-3600",
               "speed_mhz": 3600, "latency": "CL18", "voltage_v": 1.35,
               "memory_type": "DDR4", "launch_msrp_usd": 69}},
    {"category": "RAM", "name": "G.Skill Ripjaws V DDR4-3200 16GB",
     "specs": {"capacity_gb": 16, "kit": "2x8GB", "speed": "DDR4-3200",
               "speed_mhz": 3200, "latency": "CL16", "voltage_v": 1.35,
               "memory_type": "DDR4", "launch_msrp_usd": 35}},
    {"category": "RAM", "name": "Teamgroup T-Force Vulcan DDR5-5200 64GB",
     "specs": {"capacity_gb": 64, "kit": "2x32GB", "speed": "DDR5-5200",
               "speed_mhz": 5200, "latency": "CL40", "voltage_v": 1.1,
               "memory_type": "DDR5", "launch_msrp_usd": 159}},

    # ── PSUs ──────────────────────────────────────────────────────────────────
    {"category": "PSU", "name": "Corsair RM1000x",
     "specs": {"wattage_w": 1000, "efficiency": "80+ Gold", "modular": "Fully Modular",
               "launch_msrp_usd": 179, "warranty_years": 10}},
    {"category": "PSU", "name": "Corsair RM850x",
     "specs": {"wattage_w": 850, "efficiency": "80+ Gold", "modular": "Fully Modular",
               "launch_msrp_usd": 149, "warranty_years": 10}},
    {"category": "PSU", "name": "Corsair RM750x",
     "specs": {"wattage_w": 750, "efficiency": "80+ Gold", "modular": "Fully Modular",
               "launch_msrp_usd": 109, "warranty_years": 10}},
    {"category": "PSU", "name": "Seasonic Focus GX-850",
     "specs": {"wattage_w": 850, "efficiency": "80+ Gold", "modular": "Fully Modular",
               "launch_msrp_usd": 139, "warranty_years": 10}},
    {"category": "PSU", "name": "be quiet! Straight Power 11 750W",
     "specs": {"wattage_w": 750, "efficiency": "80+ Platinum", "modular": "Fully Modular",
               "launch_msrp_usd": 129, "warranty_years": 5}},
    {"category": "PSU", "name": "EVGA SuperNOVA 650 G6",
     "specs": {"wattage_w": 650, "efficiency": "80+ Gold", "modular": "Fully Modular",
               "launch_msrp_usd": 89, "warranty_years": 10}},
    {"category": "PSU", "name": "Corsair CX550",
     "specs": {"wattage_w": 550, "efficiency": "80+ Bronze", "modular": "Non-Modular",
               "launch_msrp_usd": 59, "warranty_years": 5}},
]


# ─── Normalisation helpers ─────────────────────────────────────────────────────

def _to_int(val) -> "int | None":
    """Strip all non-digit characters and cast to int. Returns None on failure."""
    if val is None:
        return None
    digits = re.sub(r"[^\d]", "", str(val).strip())
    return int(digits) if digits else None


def _to_float(val) -> "float | None":
    """Strip non-numeric characters (keep first dot) and cast to float."""
    if val is None:
        return None
    s = str(val).strip()
    # Keep digits and the first decimal point only
    cleaned = re.sub(r"[^\d.]", "", s)
    try:
        return float(cleaned) if cleaned else None
    except ValueError:
        return None


def _nonempty(val) -> "str | None":
    """Return stripped string or None if blank / sentinel values."""
    s = str(val).strip() if val is not None else ""
    return s if s and s.lower() not in ("", "n/a", "nan", "none", "null", "-") else None


# ─── Per-source parsers ────────────────────────────────────────────────────────

def parse_cpu_row(row: dict) -> "dict | None":
    """
    Normalise one row from CPU_Exhaustive_Database.csv into a catalog document.
    Returns None (and increments skip count at call site) if name is absent.
    """
    name = _nonempty(row.get("CPU_Name"))
    if not name:
        return None

    specs: dict = {}

    # Integer fields
    for src, dst in [
        ("TDP_W",           "tdp_w"),
        ("Cores_Physical",  "cores"),
        ("Threads",         "threads"),
        ("Max_Memory_GB",   "max_memory_gb"),
        ("Process_Node_nm", "process_node_nm"),
        ("Launch_Year",     "launch_year"),
        ("Memory_Speed_MHz","memory_speed_mhz"),
        ("PCIe_Lanes_CPU",  "pcie_lanes"),
        ("Max_Operating_Temp_C", "max_temp_c"),
    ]:
        v = _to_int(row.get(src))
        if v is not None:
            specs[dst] = v

    # Float fields
    for src, dst in [
        ("Base_Clock_GHz",    "base_clock_ghz"),
        ("Boost_Clock_GHz",   "boost_clock_ghz"),
        ("All_Core_Boost_GHz","all_core_boost_ghz"),
        ("Cache_L3_MB",       "l3_cache_mb"),
        ("Cache_L2_MB",       "l2_cache_mb"),
        ("Die_Size_mm2",      "die_size_mm2"),
        ("Transistors_Billion","transistors_b"),
    ]:
        v = _to_float(row.get(src))
        if v is not None:
            specs[dst] = v

    # MSRP — float → int
    msrp = _to_float(row.get("Launch_MSRP_USD"))
    if msrp is not None:
        specs["launch_msrp_usd"] = int(msrp)

    # String fields
    for src, dst in [
        ("Socket",        "socket"),
        ("Architecture",  "architecture"),
        ("Codename",      "codename"),
        ("Memory_Type",   "memory_type"),
        ("PCIe_Version",  "pcie_version"),
        ("Brand",         "brand"),
        ("Segment",       "segment"),
        ("Use_Case",      "use_case"),
        ("Current_Tier",  "tier"),
        ("Product_Line",  "product_line"),
        ("Chiplet_Design","chiplet_design"),
        ("Unlocked_Multiplier", "unlocked"),
        ("Integrated_Graphics", "integrated_graphics"),
        ("iGPU_Model",    "igpu_model"),
        ("ECC_Support",   "ecc_support"),
        ("Hyperthreading","hyperthreading"),
        ("Boost_Technology", "boost_technology"),
    ]:
        v = _nonempty(row.get(src))
        if v:
            specs[dst] = v

    return {"category": "CPU", "name": name, "specs": specs}


def parse_gpu_row(row: dict) -> "dict | None":
    """
    Normalise one row from GPU_Exhaustive_Database.csv.
    The CSV is sparse (no VRAM/TDP); stores clocks, length, AIB, chip.
    Returns None if Custom_Model_Name is absent.
    """
    name = _nonempty(row.get("Custom_Model_Name"))
    if not name:
        return None

    specs: dict = {}

    # Clock fields — values may be bare integers or "2520 MHz"
    for src, dst in [
        ("Base_Clock",   "base_clock_mhz"),
        ("Boost_Clock",  "boost_clock_mhz"),
        ("Memory_Clock", "memory_clock_mhz"),
    ]:
        v = _to_int(row.get(src))
        if v is not None:
            specs[dst] = v

    # Physical length
    v = _to_int(row.get("Length"))
    if v is not None:
        specs["length_mm"] = v

    # String metadata
    for src, dst in [
        ("Base_Chip",   "base_chip"),
        ("AIB_Partner", "aib_partner"),
    ]:
        val = _nonempty(row.get(src))
        if val:
            specs[dst] = val

    return {"category": "GPU", "name": name, "specs": specs}


# ─── Semantic content builder ──────────────────────────────────────────────────

def make_content(doc: dict) -> str:
    """
    Build a rich natural-language sentence from a catalog document.
    Used as the text chunk for embedding generation.
    """
    cat   = doc["category"]
    name  = doc["name"]
    specs = doc.get("specs", {})

    if cat == "GPU":
        parts = [f"{name} is a {specs.get('tier', '')} GPU".rstrip()]
        if "vram"          in specs: parts.append(f"with {specs['vram']} VRAM")
        if "tdp_w"         in specs: parts.append(f"TDP {specs['tdp_w']}W")
        if "boost_clock_mhz" in specs: parts.append(f"boost {specs['boost_clock_mhz']} MHz")
        if "cuda_cores"    in specs: parts.append(f"{specs['cuda_cores']} CUDA cores")
        if "compute_units" in specs: parts.append(f"{specs['compute_units']} compute units")
        if "memory_bus"    in specs: parts.append(f"{specs['memory_bus']} memory bus")
        if "aib_partner"   in specs: parts.append(f"manufactured by {specs['aib_partner']}")
        if "launch_msrp_usd" in specs: parts.append(f"MSRP ${specs['launch_msrp_usd']}")
        return ". ".join(parts) + "."

    if cat == "CPU":
        parts = [f"{name} is a {specs.get('tier', '')} CPU".rstrip()]
        if "socket"          in specs: parts.append(f"socket {specs['socket']}")
        if "cores"           in specs: parts.append(f"{specs['cores']} cores")
        if "threads"         in specs: parts.append(f"{specs['threads']} threads")
        if "boost_clock_ghz" in specs: parts.append(f"boost {specs['boost_clock_ghz']} GHz")
        if "base_clock_ghz"  in specs: parts.append(f"base {specs['base_clock_ghz']} GHz")
        if "tdp_w"           in specs: parts.append(f"TDP {specs['tdp_w']}W")
        if "l3_cache_mb"     in specs: parts.append(f"L3 cache {specs['l3_cache_mb']} MB")
        if "architecture"    in specs: parts.append(f"{specs['architecture']} architecture")
        if "launch_msrp_usd" in specs: parts.append(f"MSRP ${specs['launch_msrp_usd']}")
        return ". ".join(parts) + "."

    if cat == "MOTHERBOARD":
        parts = [f"{name} is a {specs.get('form_factor', '')} motherboard".rstrip()]
        if "socket"    in specs: parts.append(f"for {specs['socket']} processors")
        if "chipset"   in specs: parts.append(f"chipset {specs['chipset']}")
        if "memory_type" in specs: parts.append(f"supports {specs['memory_type']}")
        if "max_memory_gb" in specs: parts.append(f"up to {specs['max_memory_gb']}GB RAM")
        if "launch_msrp_usd" in specs: parts.append(f"MSRP ${specs['launch_msrp_usd']}")
        return ". ".join(parts) + "."

    if cat == "RAM":
        parts = [f"{name} is a RAM kit"]
        if "capacity_gb" in specs: parts.append(f"{specs['capacity_gb']}GB capacity")
        if "speed"       in specs: parts.append(f"running at {specs['speed']}")
        if "latency"     in specs: parts.append(f"latency {specs['latency']}")
        if "kit"         in specs: parts.append(f"kit {specs['kit']}")
        if "launch_msrp_usd" in specs: parts.append(f"MSRP ${specs['launch_msrp_usd']}")
        return ". ".join(parts) + "."

    if cat == "PSU":
        parts = [f"{name} is a power supply unit"]
        if "wattage_w"   in specs: parts.append(f"{specs['wattage_w']}W rated")
        if "efficiency"  in specs: parts.append(f"{specs['efficiency']} efficiency")
        if "modular"     in specs: parts.append(specs["modular"])
        if "warranty_years" in specs: parts.append(f"{specs['warranty_years']}-year warranty")
        if "launch_msrp_usd" in specs: parts.append(f"MSRP ${specs['launch_msrp_usd']}")
        return ". ".join(parts) + "."

    return json.dumps({"name": name, "specs": specs})


# ─── Embedding helper ──────────────────────────────────────────────────────────

def embed_batch(client: OpenAI, texts: list[str]) -> list[list[float]]:
    """Embed texts in batches of 20 with a short delay to respect rate limits."""
    BATCH = 20
    out: list[list[float]] = []
    for i in range(0, len(texts), BATCH):
        resp = client.embeddings.create(
            input=texts[i : i + BATCH],
            model="text-embedding-3-small",
        )
        out.extend(e.embedding for e in resp.data)
        if i + BATCH < len(texts):
            time.sleep(0.3)
    return out


# ─── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    openai_key = os.environ.get("OPENAI_API_KEY")
    mongo_uri  = os.environ.get("MONGODB_ATLAS_URI")

    if not openai_key:
        print("ERROR: OPENAI_API_KEY not set in backend/.env")
        sys.exit(1)
    if not mongo_uri:
        print("ERROR: MONGODB_ATLAS_URI not set in backend/.env")
        sys.exit(1)

    db_name  = os.environ.get("MONGODB_DATABASE",          "neurobuilds")
    col_name = os.environ.get("MONGODB_CATALOG_COLLECTION", "hardware_catalog")

    t0 = time.time()
    print(f"\n{'─'*60}")
    print(f"  NeuroBuilds — Hardware Catalog Ingestion")
    print(f"  Target: {db_name}.{col_name}")
    print(f"{'─'*60}\n")

    # ── Source 1: hardcoded authoritative specs ────────────────────────────────
    docs: list[dict] = list(HARDCODED_SPECS)
    seen_names: set[str] = {d["name"].lower() for d in docs}
    print(f"[1/3] Hardcoded specs   : {len(docs)} entries loaded")

    # ── Source 2: CPU CSV ──────────────────────────────────────────────────────
    _repo_root = Path(__file__).parent.parent.parent
    cpu_csv = _repo_root / "CPU_Exhaustive_Database.csv"
    cpu_ok = cpu_anomaly = 0

    if cpu_csv.exists():
        with open(cpu_csv, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                try:
                    doc = parse_cpu_row(row)
                    if doc is None:
                        cpu_anomaly += 1
                        continue
                    if doc["name"].lower() in seen_names:
                        # Hardcoded entry takes priority — richer data
                        continue
                    docs.append(doc)
                    seen_names.add(doc["name"].lower())
                    cpu_ok += 1
                except Exception as exc:
                    cpu_anomaly += 1
                    print(f"  [WARN] CPU row skipped: {exc}")
        print(f"[2/3] CPU CSV          : {cpu_ok} ingested, {cpu_anomaly} anomalies/skipped")
    else:
        print(f"[2/3] CPU CSV          : not found ({cpu_csv})")

    # ── Source 3: GPU CSV ──────────────────────────────────────────────────────
    gpu_csv = _repo_root / "GPU_Exhaustive_Database.csv"
    gpu_ok = gpu_anomaly = 0

    if gpu_csv.exists():
        with open(gpu_csv, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                try:
                    doc = parse_gpu_row(row)
                    if doc is None:
                        gpu_anomaly += 1
                        continue
                    if doc["name"].lower() in seen_names:
                        # Hardcoded entry takes priority — has TDP/VRAM/price
                        gpu_anomaly += 1
                        continue
                    docs.append(doc)
                    seen_names.add(doc["name"].lower())
                    gpu_ok += 1
                except Exception as exc:
                    gpu_anomaly += 1
                    print(f"  [WARN] GPU row skipped: {exc}")
        print(f"[3/3] GPU CSV          : {gpu_ok} ingested, {gpu_anomaly} anomalies/skipped")
    else:
        print(f"[3/3] GPU CSV          : not found ({gpu_csv})")

    print(f"\nTotal documents      : {len(docs)}")

    # ── Generate embeddings ────────────────────────────────────────────────────
    print(f"\nGenerating embeddings via text-embedding-3-small …")
    oai      = OpenAI(api_key=openai_key)
    contents = [make_content(d) for d in docs]
    t_embed  = time.time()
    embeddings = embed_batch(oai, contents)
    print(f"  ✓ {len(embeddings)} embeddings in {time.time() - t_embed:.1f}s")

    # ── Bulk upsert ────────────────────────────────────────────────────────────
    print(f"\nConnecting to MongoDB Atlas …")
    mongo = MongoClient(mongo_uri, serverSelectionTimeoutMS=10_000)
    col   = mongo[db_name][col_name]

    ops = [
        UpdateOne(
            {"name": doc["name"]},
            {"$set": {**doc, "content": content, "embedding": emb}},
            upsert=True,
        )
        for doc, content, emb in zip(docs, contents, embeddings)
    ]
    result = col.bulk_write(ops)
    print(f"  ✓ Upsert complete — {result.upserted_count} inserted, "
          f"{result.modified_count} updated")

    # ── B-tree index on name ───────────────────────────────────────────────────
    col.create_index("name", name="name_btree")
    print(f"  ✓ B-tree index 'name_btree' ensured on {col_name}.name")

    # ── Summary ────────────────────────────────────────────────────────────────
    elapsed = time.time() - t0
    print(f"\n{'─'*60}")
    print(f"  Done in {elapsed:.1f}s")
    print(f"  Collection : {db_name}.{col_name}")
    print(f"  Documents  : {len(docs)} total")
    by_cat: dict[str, int] = {}
    for d in docs:
        by_cat[d["category"]] = by_cat.get(d["category"], 0) + 1
    for cat, n in sorted(by_cat.items()):
        print(f"    {cat:<14}: {n}")
    print(f"\nNext — create the Atlas Vector Search index on the 'embedding' field:")
    print(json.dumps({
        "fields": [{"numDimensions": 1536, "path": "embedding",
                    "similarity": "cosine", "type": "vector"}]
    }, indent=2))
    print(f"{'─'*60}\n")


if __name__ == "__main__":
    main()
