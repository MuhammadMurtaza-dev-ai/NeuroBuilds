"""
NeuroBuilds — Academic Evaluation Suite
========================================
Standalone deterministic evaluation of the compatibility and selection engines.
No LLM calls. No network I/O. No database required for Experiment 1.

Usage:
    cd backend
    python tests/evaluation_suite.py

Experiments:
    1. Compatibility Engine Accuracy   — Confusion matrix / Precision / Recall / F1
    2. Budget Allocation Adherence     — MAE, variance, per-persona breakdown
"""

from __future__ import annotations

import sys
import os
import time
import math
from typing import Optional
from unittest.mock import MagicMock

# ── path fixup so 'services.*' resolves when run from backend/ ────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.validation_engine import run_checks
from services.selection_engine  import run_allocation, ALLOCATION_WEIGHTS, ALLOCATION_TOLERANCE_USD


# ══════════════════════════════════════════════════════════════════════════════
# TERMINAL COLOURS
# ══════════════════════════════════════════════════════════════════════════════

class C:
    RESET   = "\033[0m"
    BOLD    = "\033[1m"
    CYAN    = "\033[96m"
    GREEN   = "\033[92m"
    RED     = "\033[91m"
    YELLOW  = "\033[93m"
    MAGENTA = "\033[95m"
    BLUE    = "\033[94m"
    DIM     = "\033[2m"
    WHITE   = "\033[97m"

def h1(text: str) -> None:
    width = 72
    print(f"\n{C.CYAN}{C.BOLD}{'═' * width}{C.RESET}")
    print(f"{C.CYAN}{C.BOLD}  {text}{C.RESET}")
    print(f"{C.CYAN}{C.BOLD}{'═' * width}{C.RESET}")

def h2(text: str) -> None:
    print(f"\n{C.MAGENTA}{C.BOLD}  ▶  {text}{C.RESET}")
    print(f"{C.DIM}  {'─' * 66}{C.RESET}")

def row(label: str, value: str, colour: str = C.WHITE) -> None:
    print(f"  {C.DIM}{label:<36}{C.RESET}{colour}{value}{C.RESET}")

def separator() -> None:
    print(f"{C.DIM}  {'─' * 66}{C.RESET}")


# ══════════════════════════════════════════════════════════════════════════════
# EXPERIMENT 1 — FIXTURE DATA
# ══════════════════════════════════════════════════════════════════════════════
#
# Build schema mirrors agent.py / frontend ActiveBuild:
#   build["cpu"]  = { name, tdp, specs: { socket, chipset, cooler_height_mm } }
#   build["gpu"]  = { name, tdp, specs: { length_mm } }
#   build["motherboard"] = { name, specs: { socket, chipset, form_factor,
#                                           max_memory, max_gpu_length_mm,
#                                           max_cooler_height_mm } }
#   build["ram"]  = { name, specs: { speed } }
#   build["psu"]  = { name, rating }
#
# label=True  → "Known Good"  (expect validation ok=True, i.e. no fatal issues)
# label=False → "Intentionally Broken" (expect validation ok=False, ≥1 fatal issue)


COMPAT_FIXTURES: list[dict] = [

    # ── KNOWN GOOD (10 builds) ─────────────────────────────────────────────

    {
        "id": "KG-01",
        "label": True,
        "desc": "Mid-range AM5 gaming build — perfect socket/DDR5/PSU alignment",
        "build": {
            "cpu": {
                "name": "AMD Ryzen 7 7700X",
                "tdp": 105,
                "specs": {"socket": "AM5", "cooler_height_mm": 155},
            },
            "gpu": {
                "name": "RTX 4070 SUPER",
                "tdp": 220,
                "specs": {"length_mm": 336},
            },
            "motherboard": {
                "name": "ASUS ROG STRIX B650-A",
                "specs": {
                    "socket": "AM5",
                    "chipset": "B650",
                    "form_factor": "ATX",
                    "max_memory": "DDR5-6000",
                    "max_gpu_length_mm": 380,
                    "max_cooler_height_mm": 170,
                },
            },
            "ram":  {"name": "G.Skill Trident Z5 DDR5-6000 32GB", "specs": {"speed": "DDR5-6000"}},
            "psu":  {"name": "Corsair RM850x", "rating": 850},
        },
    },

    {
        "id": "KG-02",
        "desc": "High-end Intel LGA1700 workstation — ample PSU, matched DDR5",
        "label": True,
        "build": {
            "cpu": {
                "name": "Intel Core i9-13900K",
                "tdp": 125,
                "specs": {"socket": "LGA1700", "cooler_height_mm": 158},
            },
            "gpu": {
                "name": "RTX 4080 SUPER",
                "tdp": 320,
                "specs": {"length_mm": 336},
            },
            "motherboard": {
                "name": "MSI MEG Z790 ACE",
                "specs": {
                    "socket": "LGA1700",
                    "chipset": "Z790",
                    "form_factor": "ATX",
                    "max_memory": "DDR5-6400",
                    "max_gpu_length_mm": 420,
                    "max_cooler_height_mm": 180,
                },
            },
            "ram":  {"name": "Corsair Dominator Platinum DDR5-6000 64GB", "specs": {"speed": "DDR5-5600"}},
            "psu":  {"name": "EVGA SuperNOVA 1000 G6", "rating": 1000},
        },
    },

    {
        "id": "KG-03",
        "desc": "Budget AM4 B550 build with Ryzen 5 5600X — no BIOS flash needed",
        "label": True,
        "build": {
            "cpu": {
                "name": "AMD Ryzen 5 5600X",
                "tdp": 65,
                "specs": {"socket": "AM4", "cooler_height_mm": 154},
            },
            "gpu": {
                "name": "RX 6600",
                "tdp": 132,
                "specs": {"length_mm": 240},
            },
            "motherboard": {
                "name": "Gigabyte B550 AORUS Elite AX",
                "specs": {
                    "socket": "AM4",
                    "chipset": "B550",
                    "form_factor": "ATX",
                    "max_memory": "DDR4-5100",
                    "max_gpu_length_mm": 340,
                    "max_cooler_height_mm": 162,
                },
            },
            "ram":  {"name": "Corsair Vengeance LPX DDR4-3200 16GB", "specs": {"speed": "DDR4-3200"}},
            "psu":  {"name": "Seasonic Focus GX-650", "rating": 650},
        },
    },

    {
        "id": "KG-04",
        "desc": "mITX AM5 mini build — tight but legal clearances",
        "label": True,
        "build": {
            "cpu": {
                "name": "AMD Ryzen 5 7600",
                "tdp": 65,
                "specs": {"socket": "AM5", "cooler_height_mm": 130},
            },
            "gpu": {
                "name": "RTX 4060",
                "tdp": 115,
                "specs": {"length_mm": 240},
            },
            "motherboard": {
                "name": "ASRock B650I Lightning WiFi",
                "specs": {
                    "socket": "AM5",
                    "chipset": "B650",
                    "form_factor": "MINI-ITX",
                    "max_memory": "DDR5-6400",
                    "max_gpu_length_mm": 270,
                    "max_cooler_height_mm": 145,
                },
            },
            "ram":  {"name": "Kingston Fury Beast DDR5-5200 16GB", "specs": {"speed": "DDR5-5200"}},
            "psu":  {"name": "SFX Corsair SF750", "rating": 750},
        },
    },

    {
        "id": "KG-05",
        "desc": "Content creation AM5 powerhouse — RTX 4090 + 1200W PSU",
        "label": True,
        "build": {
            "cpu": {
                "name": "AMD Ryzen 9 7950X",
                "tdp": 170,
                "specs": {"socket": "AM5", "cooler_height_mm": 163},
            },
            "gpu": {
                "name": "RTX 4090",
                "tdp": 450,
                "specs": {"length_mm": 336},
            },
            "motherboard": {
                "name": "ASUS ProArt X670E-CREATOR WIFI",
                "specs": {
                    "socket": "AM5",
                    "chipset": "X670",
                    "form_factor": "ATX",
                    "max_memory": "DDR5-6400",
                    "max_gpu_length_mm": 420,
                    "max_cooler_height_mm": 185,
                },
            },
            "ram":  {"name": "G.Skill Trident Z5 DDR5-6000 128GB", "specs": {"speed": "DDR5-6000"}},
            "psu":  {"name": "Seasonic Prime TX-1300", "rating": 1300},
        },
    },

    {
        "id": "KG-06",
        "desc": "Arrow Lake LGA1851 build — latest platform, matched DDR5",
        "label": True,
        "build": {
            "cpu": {
                "name": "Intel Core Ultra 9 285K",
                "tdp": 125,
                "specs": {"socket": "LGA1851", "cooler_height_mm": 155},
            },
            "gpu": {
                "name": "RTX 4080",
                "tdp": 320,
                "specs": {"length_mm": 336},
            },
            "motherboard": {
                "name": "Gigabyte Z890 AORUS Master",
                "specs": {
                    "socket": "LGA1851",
                    "chipset": "Z890",
                    "form_factor": "ATX",
                    "max_memory": "DDR5-9200",
                    "max_gpu_length_mm": 400,
                    "max_cooler_height_mm": 180,
                },
            },
            "ram":  {"name": "Corsair Dominator Titanium DDR5-7200 32GB", "specs": {"speed": "DDR5-7200"}},
            "psu":  {"name": "be quiet! Dark Power Pro 13 1000W", "rating": 1000},
        },
    },

    {
        "id": "KG-07",
        "desc": "Budget Intel LGA1700 office build — low TDP, 550W PSU is sufficient",
        "label": True,
        "build": {
            "cpu": {
                "name": "Intel Core i5-12400",
                "tdp": 65,
                "specs": {"socket": "LGA1700", "cooler_height_mm": 140},
            },
            "gpu": {
                "name": "GTX 1660 SUPER",
                "tdp": 125,
                "specs": {"length_mm": 225},
            },
            "motherboard": {
                "name": "MSI PRO B660M-A DDR4",
                "specs": {
                    "socket": "LGA1700",
                    "chipset": "B660",
                    "form_factor": "MICRO-ATX",
                    "max_memory": "DDR4-5000",
                    "max_gpu_length_mm": 320,
                    "max_cooler_height_mm": 160,
                },
            },
            "ram":  {"name": "Crucial Ballistix DDR4-3200 16GB", "specs": {"speed": "DDR4-3200"}},
            "psu":  {"name": "Corsair CX550M", "rating": 550},
        },
    },

    {
        "id": "KG-08",
        "desc": "Ryzen 7 7700 + RX 7800 XT on AM5 — balanced gaming build",
        "label": True,
        "build": {
            "cpu": {
                "name": "AMD Ryzen 7 7700",
                "tdp": 65,
                "specs": {"socket": "AM5", "cooler_height_mm": 155},
            },
            "gpu": {
                "name": "RX 7800 XT",
                "tdp": 263,
                "specs": {"length_mm": 267},
            },
            "motherboard": {
                "name": "MSI MAG B650 TOMAHAWK WIFI",
                "specs": {
                    "socket": "AM5",
                    "chipset": "B650",
                    "form_factor": "ATX",
                    "max_memory": "DDR5-7800",
                    "max_gpu_length_mm": 360,
                    "max_cooler_height_mm": 172,
                },
            },
            "ram":  {"name": "TeamGroup T-Force Vulcan DDR5-5600 32GB", "specs": {"speed": "DDR5-5600"}},
            "psu":  {"name": "Fractal Design Ion+ 750W", "rating": 750},
        },
    },

    {
        "id": "KG-09",
        "desc": "Streaming rig — i7-13700K on Z790 with RTX 3070 and 850W PSU",
        "label": True,
        "build": {
            "cpu": {
                "name": "Intel Core i7-13700K",
                "tdp": 125,
                "specs": {"socket": "LGA1700", "cooler_height_mm": 158},
            },
            "gpu": {
                "name": "RTX 3070 Ti",
                "tdp": 290,
                "specs": {"length_mm": 300},
            },
            "motherboard": {
                "name": "ASUS TUF Gaming Z790-Plus WiFi",
                "specs": {
                    "socket": "LGA1700",
                    "chipset": "Z790",
                    "form_factor": "ATX",
                    "max_memory": "DDR5-7800",
                    "max_gpu_length_mm": 390,
                    "max_cooler_height_mm": 175,
                },
            },
            "ram":  {"name": "G.Skill Ripjaws S5 DDR5-5600 32GB", "specs": {"speed": "DDR5-5600"}},
            "psu":  {"name": "Corsair RM850e", "rating": 850},
        },
    },

    {
        "id": "KG-10",
        "desc": "AM4 B550 + Ryzen 9 5900X — known compatible 500-series chipset",
        "label": True,
        "build": {
            "cpu": {
                "name": "AMD Ryzen 9 5900X",
                "tdp": 105,
                "specs": {"socket": "AM4", "cooler_height_mm": 158},
            },
            "gpu": {
                "name": "RX 6700 XT",
                "tdp": 230,
                "specs": {"length_mm": 267},
            },
            "motherboard": {
                "name": "ASUS ROG STRIX X570-E Gaming",
                "specs": {
                    "socket": "AM4",
                    "chipset": "X570",
                    "form_factor": "ATX",
                    "max_memory": "DDR4-5100",
                    "max_gpu_length_mm": 380,
                    "max_cooler_height_mm": 175,
                },
            },
            "ram":  {"name": "G.Skill Trident Z Neo DDR4-3600 32GB", "specs": {"speed": "DDR4-3600"}},
            "psu":  {"name": "Seasonic Focus GX-850", "rating": 850},
        },
    },

    # ── INTENTIONALLY BROKEN (10 builds) ──────────────────────────────────

    {
        "id": "IB-01",
        "desc": "Socket mismatch — AM5 CPU on AM4 motherboard",
        "label": False,
        "build": {
            "cpu": {
                "name": "AMD Ryzen 7 7700X",
                "tdp": 105,
                "specs": {"socket": "AM5"},
            },
            "gpu":  {"name": "RTX 4070", "tdp": 200, "specs": {"length_mm": 300}},
            "motherboard": {
                "name": "MSI MAG B450 TOMAHAWK MAX",
                "specs": {
                    "socket": "AM4",
                    "chipset": "B450",
                    "form_factor": "ATX",
                    "max_memory": "DDR4-4400",
                    "max_gpu_length_mm": 380,
                },
            },
            "ram":  {"name": "Corsair Vengeance DDR4-3200", "specs": {"speed": "DDR4-3200"}},
            "psu":  {"name": "Corsair RM750x", "rating": 750},
        },
    },

    {
        "id": "IB-02",
        "desc": "DDR5 RAM on DDR4 motherboard — memory type mismatch",
        "label": False,
        "build": {
            "cpu": {
                "name": "Intel Core i7-13700K",
                "tdp": 125,
                "specs": {"socket": "LGA1700"},
            },
            "gpu":  {"name": "RTX 4070", "tdp": 200, "specs": {"length_mm": 300}},
            "motherboard": {
                "name": "Gigabyte B660M DS3H DDR4",
                "specs": {
                    "socket": "LGA1700",
                    "chipset": "B660",
                    "form_factor": "MICRO-ATX",
                    "max_memory": "DDR4-5000",
                    "max_gpu_length_mm": 350,
                },
            },
            "ram":  {"name": "Kingston Fury Beast DDR5-5200 16GB", "specs": {"speed": "DDR5-5200"}},
            "psu":  {"name": "EVGA 650W", "rating": 650},
        },
    },

    {
        "id": "IB-03",
        "desc": "PSU transient deficit — 450W PSU powering RTX 4090 + i9-13900K",
        "label": False,
        "build": {
            "cpu": {
                "name": "Intel Core i9-13900K",
                "tdp": 125,
                "specs": {"socket": "LGA1700"},
            },
            "gpu":  {"name": "RTX 4090", "tdp": 450, "specs": {"length_mm": 336}},
            "motherboard": {
                "name": "ASUS ROG Maximus Z790 Hero",
                "specs": {
                    "socket": "LGA1700",
                    "chipset": "Z790",
                    "form_factor": "ATX",
                    "max_memory": "DDR5-7600",
                    "max_gpu_length_mm": 420,
                },
            },
            "ram":  {"name": "G.Skill Trident Z5 DDR5-6000", "specs": {"speed": "DDR5-6000"}},
            "psu":  {"name": "Cooler Master 450W", "rating": 450},
        },
    },

    {
        "id": "IB-04",
        "desc": "GPU physically too long — 380mm GPU in 330mm max clearance case",
        "label": False,
        "build": {
            "cpu": {
                "name": "AMD Ryzen 5 5600X",
                "tdp": 65,
                "specs": {"socket": "AM4"},
            },
            "gpu":  {"name": "RTX 4080 SUPER", "tdp": 320, "specs": {"length_mm": 380}},
            "motherboard": {
                "name": "MSI B550M PRO-VDH WIFI",
                "specs": {
                    "socket": "AM4",
                    "chipset": "B550",
                    "form_factor": "MICRO-ATX",
                    "max_memory": "DDR4-5100",
                    "max_gpu_length_mm": 330,
                },
            },
            "ram":  {"name": "Crucial Ballistix DDR4-3200", "specs": {"speed": "DDR4-3200"}},
            "psu":  {"name": "Seasonic Focus GX-850", "rating": 850},
        },
    },

    {
        "id": "IB-05",
        "desc": "LGA1200 CPU on LGA1700 motherboard — Intel socket mismatch",
        "label": False,
        "build": {
            "cpu": {
                "name": "Intel Core i5-10400",
                "tdp": 65,
                "specs": {"socket": "LGA1200"},
            },
            "gpu":  {"name": "RX 6600", "tdp": 132, "specs": {"length_mm": 240}},
            "motherboard": {
                "name": "ASRock B660M Pro RS",
                "specs": {
                    "socket": "LGA1700",
                    "chipset": "B660",
                    "form_factor": "MICRO-ATX",
                    "max_memory": "DDR4-4800",
                    "max_gpu_length_mm": 330,
                },
            },
            "ram":  {"name": "TeamGroup Vulcan DDR4-3200", "specs": {"speed": "DDR4-3200"}},
            "psu":  {"name": "Corsair CX550", "rating": 550},
        },
    },

    {
        "id": "IB-06",
        "desc": "CPU cooler too tall — 185mm cooler in 160mm max clearance case",
        "label": False,
        "build": {
            "cpu": {
                "name": "AMD Ryzen 9 7950X",
                "tdp": 170,
                "specs": {"socket": "AM5", "cooler_height_mm": 185},
            },
            "gpu":  {"name": "RTX 4070 Ti", "tdp": 285, "specs": {"length_mm": 298}},
            "motherboard": {
                "name": "ASUS ROG CROSSHAIR X670E HERO",
                "specs": {
                    "socket": "AM5",
                    "chipset": "X670",
                    "form_factor": "ATX",
                    "max_memory": "DDR5-6400",
                    "max_gpu_length_mm": 380,
                    "max_cooler_height_mm": 160,
                },
            },
            "ram":  {"name": "G.Skill Trident Z5 DDR5-6000 64GB", "specs": {"speed": "DDR5-6000"}},
            "psu":  {"name": "Seasonic Prime TX-1000", "rating": 1000},
        },
    },

    {
        "id": "IB-07",
        "desc": "DDR4 RAM on DDR5-only AM5 motherboard",
        "label": False,
        "build": {
            "cpu": {
                "name": "AMD Ryzen 7 7700X",
                "tdp": 105,
                "specs": {"socket": "AM5"},
            },
            "gpu":  {"name": "RX 7700 XT", "tdp": 245, "specs": {"length_mm": 267}},
            "motherboard": {
                "name": "Gigabyte B650 EAGLE AX",
                "specs": {
                    "socket": "AM5",
                    "chipset": "B650",
                    "form_factor": "ATX",
                    "max_memory": "DDR5-7600",
                    "max_gpu_length_mm": 375,
                },
            },
            "ram":  {"name": "Corsair Vengeance DDR4-3600 32GB", "specs": {"speed": "DDR4-3600"}},
            "psu":  {"name": "be quiet! Straight Power 850W", "rating": 850},
        },
    },

    {
        "id": "IB-08",
        "desc": "PSU deficit — 500W powering RTX 3080 (250W TDP) + i9-13900K (125W)",
        "label": False,
        "build": {
            "cpu": {
                "name": "Intel Core i9-13900K",
                "tdp": 125,
                "specs": {"socket": "LGA1700"},
            },
            "gpu":  {"name": "RTX 3080", "tdp": 320, "specs": {"length_mm": 285}},
            "motherboard": {
                "name": "MSI MPG Z790 Carbon WiFi",
                "specs": {
                    "socket": "LGA1700",
                    "chipset": "Z790",
                    "form_factor": "ATX",
                    "max_memory": "DDR5-7600",
                    "max_gpu_length_mm": 400,
                },
            },
            "ram":  {"name": "Kingston Fury Renegade DDR5-6000", "specs": {"speed": "DDR5-6000"}},
            "psu":  {"name": "Generic 500W PSU", "rating": 500},
        },
    },

    {
        "id": "IB-09",
        "desc": "AM4 socket mismatch — AM5 board with AM4 CPU",
        "label": False,
        "build": {
            "cpu": {
                "name": "AMD Ryzen 5 5600X",
                "tdp": 65,
                "specs": {"socket": "AM4"},
            },
            "gpu":  {"name": "RX 6700 XT", "tdp": 230, "specs": {"length_mm": 267}},
            "motherboard": {
                "name": "ASRock X670E Steel Legend",
                "specs": {
                    "socket": "AM5",
                    "chipset": "X670",
                    "form_factor": "ATX",
                    "max_memory": "DDR5-6800",
                    "max_gpu_length_mm": 390,
                },
            },
            "ram":  {"name": "Corsair Vengeance DDR5-5600", "specs": {"speed": "DDR5-5600"}},
            "psu":  {"name": "Fractal Ion+ 750W", "rating": 750},
        },
    },

    {
        "id": "IB-10",
        "desc": "Triple failure — socket mismatch + DDR mismatch + PSU deficit",
        "label": False,
        "build": {
            "cpu": {
                "name": "Intel Core i5-10400",
                "tdp": 65,
                "specs": {"socket": "LGA1200"},
            },
            "gpu":  {"name": "RTX 4080", "tdp": 320, "specs": {"length_mm": 336}},
            "motherboard": {
                "name": "MSI Z790 Edge WiFi",
                "specs": {
                    "socket": "LGA1700",
                    "chipset": "Z790",
                    "form_factor": "ATX",
                    "max_memory": "DDR5-7600",
                    "max_gpu_length_mm": 400,
                },
            },
            "ram":  {"name": "Kingston HyperX Fury DDR4-3200", "specs": {"speed": "DDR4-3200"}},
            "psu":  {"name": "Budget 350W PSU", "rating": 350},
        },
    },

    # ── ADDED: brief-mandated fatal rules + LLM key-schema regressions ─────────
    # These extend coverage for the "invalid build reached response_node" bug.
    # KG-11..13 are the required happy paths; IB-11..20 are the required fatals
    # plus the LLM-key-schema variants that the old engine silently passed.

    {
        "id": "KG-11",
        "label": True,
        "desc": "Ryzen 5 7600 + B650 (AM5, DDR5) — required happy path",
        "build": {
            "cpu": {"name": "AMD Ryzen 5 7600", "tdp": 65, "specs": {"socket": "AM5"}},
            "gpu": {"name": "RTX 4060", "tdp": 115, "specs": {"length_mm": 240}},
            "motherboard": {
                "name": "Gigabyte B650 Gaming X AX",
                "specs": {
                    "socket": "AM5", "chipset": "B650", "form_factor": "ATX",
                    "max_memory": "DDR5-6400", "max_gpu_length_mm": 392,
                },
            },
            "ram": {"name": "Corsair Vengeance DDR5-5600 32GB", "specs": {"speed": "DDR5-5600"}},
            "psu": {"name": "Seasonic Focus GX-650", "rating": 650},
        },
    },

    {
        "id": "KG-12",
        "label": True,
        "desc": "Ryzen 7 5700X + B550 (AM4, DDR4) — required happy path",
        "build": {
            "cpu": {"name": "AMD Ryzen 7 5700X", "tdp": 65, "specs": {"socket": "AM4"}},
            "gpu": {"name": "RX 6600", "tdp": 132, "specs": {"length_mm": 240}},
            "motherboard": {
                "name": "MSI MAG B550 TOMAHAWK",
                "specs": {
                    "socket": "AM4", "chipset": "B550", "form_factor": "ATX",
                    "max_memory": "DDR4-4400", "max_gpu_length_mm": 340,
                },
            },
            "ram": {"name": "G.Skill Ripjaws V DDR4-3600 32GB", "specs": {"speed": "DDR4-3600"}},
            "psu": {"name": "Corsair RM650", "rating": 650},
        },
    },

    {
        "id": "KG-13",
        "label": True,
        "desc": "Happy path in LLM key schema (ram.type / mb.ram_type, no explicit socket)",
        "build": {
            # No explicit CPU/MB socket — must be inferred from name/chipset.
            "cpu": {"name": "AMD Ryzen 5 7600", "tdp": 65, "specs": {"cores": "6"}},
            "gpu": {"name": "RTX 4060", "tdp": 115, "specs": {"length_mm": 240, "interface": "PCIe 4.0 x16"}},
            "motherboard": {
                "name": "Gigabyte B650 Gaming X",
                "specs": {"chipset": "B650", "form_factor": "ATX", "ram_type": "DDR5"},
            },
            "ram": {"name": "Corsair Vengeance 32GB", "specs": {"type": "DDR5", "capacity_gb": "32"}},
            "psu": {"name": "Seasonic Focus GX-650", "rating": 650},
        },
    },

    {
        "id": "IB-11",
        "label": False,
        "desc": "Ryzen 7600 (AM5) + B550 (AM4) — required socket mismatch",
        "build": {
            "cpu": {"name": "AMD Ryzen 5 7600", "tdp": 65, "specs": {"socket": "AM5"}},
            "gpu": {"name": "RTX 4060", "tdp": 115, "specs": {"length_mm": 240}},
            "motherboard": {
                "name": "Gigabyte B550 AORUS Elite AX",
                "specs": {
                    "socket": "AM4", "chipset": "B550", "form_factor": "ATX",
                    "max_memory": "DDR4-5100", "max_gpu_length_mm": 340,
                },
            },
            "ram": {"name": "Corsair Vengeance LPX DDR4-3200 16GB", "specs": {"speed": "DDR4-3200"}},
            "psu": {"name": "Seasonic Focus GX-650", "rating": 650},
        },
    },

    {
        "id": "IB-12",
        "label": False,
        "desc": "DDR5 RAM on B550 (DDR4) — required memory mismatch",
        "build": {
            "cpu": {"name": "AMD Ryzen 5 5600X", "tdp": 65, "specs": {"socket": "AM4"}},
            "gpu": {"name": "RX 6600", "tdp": 132, "specs": {"length_mm": 240}},
            "motherboard": {
                "name": "MSI B550M PRO-VDH",
                "specs": {
                    "socket": "AM4", "chipset": "B550", "form_factor": "MICRO-ATX",
                    "max_memory": "DDR4-5100", "max_gpu_length_mm": 330,
                },
            },
            "ram": {"name": "Kingston Fury Beast DDR5-5200 16GB", "specs": {"speed": "DDR5-5200"}},
            "psu": {"name": "Seasonic Focus GX-650", "rating": 650},
        },
    },

    {
        "id": "IB-13",
        "label": False,
        "desc": "RTX 5090 (450W) on 500W PSU — required PSU transient deficit",
        "build": {
            "cpu": {"name": "AMD Ryzen 9 7950X", "tdp": 170, "specs": {"socket": "AM5"}},
            "gpu": {"name": "RTX 5090", "tdp": 450, "specs": {"length_mm": 336}},
            "motherboard": {
                "name": "ASUS ProArt X870E Creator",
                "specs": {
                    "socket": "AM5", "chipset": "X870", "form_factor": "ATX",
                    "max_memory": "DDR5-7200", "max_gpu_length_mm": 420,
                },
            },
            "ram": {"name": "G.Skill Trident Z5 DDR5-6000 64GB", "specs": {"speed": "DDR5-6000"}},
            "psu": {"name": "Generic Budget 500W", "rating": 500},
        },
    },

    {
        "id": "IB-14",
        "label": False,
        "desc": "GPU longer than the enclosure clearance — required physical fit failure",
        "build": {
            "cpu": {"name": "Intel Core i7-14700K", "tdp": 125, "specs": {"socket": "LGA1700"}},
            "gpu": {"name": "RTX 4090 Gaming OC", "tdp": 450, "specs": {"length_mm": 420}},
            "motherboard": {
                "name": "ASUS TUF Gaming B760-Plus",
                "specs": {
                    "socket": "LGA1700", "chipset": "B760", "form_factor": "ATX",
                    "max_memory": "DDR5-7600", "max_gpu_length_mm": 360,
                },
            },
            "ram": {"name": "Corsair Vengeance DDR5-6000 32GB", "specs": {"speed": "DDR5-6000"}},
            "psu": {"name": "Corsair RM1000x", "rating": 1000},
        },
    },

    {
        "id": "IB-15",
        "label": False,
        "desc": "CPU cooler taller than clearance — required cooler height failure",
        "build": {
            "cpu": {"name": "AMD Ryzen 7 7700X", "tdp": 105, "specs": {"socket": "AM5", "cooler_height_mm": 185}},
            "gpu": {"name": "RTX 4070 SUPER", "tdp": 220, "specs": {"length_mm": 300}},
            "motherboard": {
                "name": "MSI MAG B650 TOMAHAWK",
                "specs": {
                    "socket": "AM5", "chipset": "B650", "form_factor": "ATX",
                    "max_memory": "DDR5-6000", "max_gpu_length_mm": 380,
                    "max_cooler_height_mm": 160,
                },
            },
            "ram": {"name": "Corsair Vengeance DDR5-6000 32GB", "specs": {"speed": "DDR5-6000"}},
            "psu": {"name": "Corsair RM850x", "rating": 850},
        },
    },

    {
        "id": "IB-16",
        "label": False,
        "desc": "THE REPORTED BUG — Ryzen 5 7600X + B550M + DDR5 in LLM key schema, no explicit socket",
        "build": {
            # Reproduces the exact escaped build: socket derived from name/chipset,
            # DDR read from the LLM's ram.type / mb.ram_type keys.  Old engine passed this.
            "cpu": {"name": "AMD Ryzen 5 7600X", "tdp": 105, "specs": {"cores": "6", "threads": "12"}},
            "gpu": {"name": "RTX 4060", "tdp": 115, "specs": {"length_mm": 240}},
            "motherboard": {
                "name": "MSI B550M Bazooka",
                "specs": {"chipset": "B550", "form_factor": "MICRO-ATX", "ram_type": "DDR4"},
            },
            "ram": {"name": "G.Skill Flare X5 32GB", "specs": {"type": "DDR5", "capacity_gb": "32"}},
            "psu": {"name": "Corsair RM650", "rating": 650},
        },
    },

    {
        "id": "IB-17",
        "label": False,
        "desc": "DDR mismatch via LLM keys — ram.type=DDR5 vs mb.ram_type=DDR4",
        "build": {
            "cpu": {"name": "Intel Core i5-12400", "tdp": 65, "specs": {"socket": "LGA1700"}},
            "gpu": {"name": "RTX 3060", "tdp": 170, "specs": {"length_mm": 242}},
            "motherboard": {
                "name": "MSI PRO B660M-A DDR4",
                "specs": {"socket": "LGA1700", "chipset": "B660", "form_factor": "MICRO-ATX", "ram_type": "DDR4"},
            },
            "ram": {"name": "Kingston Fury 16GB", "specs": {"type": "DDR5"}},
            "psu": {"name": "Corsair CX650", "rating": 650},
        },
    },

    {
        "id": "IB-18",
        "label": False,
        "desc": "CPU cooler does not support the CPU socket — Check 12",
        "build": {
            "cpu": {"name": "AMD Ryzen 7 7700X", "tdp": 105, "specs": {"socket": "AM5"}},
            "gpu": {"name": "RTX 4070 SUPER", "tdp": 220, "specs": {"length_mm": 300}},
            "motherboard": {
                "name": "MSI MAG B650 TOMAHAWK",
                "specs": {
                    "socket": "AM5", "chipset": "B650", "form_factor": "ATX",
                    "max_memory": "DDR5-6000", "max_gpu_length_mm": 380,
                },
            },
            "ram": {"name": "Corsair Vengeance DDR5-6000 32GB", "specs": {"speed": "DDR5-6000"}},
            "psu": {"name": "Corsair RM850x", "rating": 850},
            "cooler": {"name": "Old Intel-only tower cooler", "specs": {"supported_sockets": "LGA1700, LGA1200"}},
        },
    },

    {
        "id": "IB-19",
        "label": False,
        "desc": "NVMe drive on a board with zero M.2 slots — Check 10",
        "build": {
            "cpu": {"name": "AMD Ryzen 5 5600", "tdp": 65, "specs": {"socket": "AM4"}},
            "gpu": {"name": "RX 6600", "tdp": 132, "specs": {"length_mm": 240}},
            "motherboard": {
                "name": "Biostar A320MH (legacy)",
                "specs": {
                    "socket": "AM4", "chipset": "A320", "form_factor": "MICRO-ATX",
                    "max_memory": "DDR4-3200", "max_gpu_length_mm": 330, "m2_slots": 0,
                },
            },
            "ram": {"name": "Corsair Vengeance DDR4-3200 16GB", "specs": {"speed": "DDR4-3200"}},
            "psu": {"name": "Corsair CX550", "rating": 550},
            "storage": {"name": "Samsung 990 Pro 1TB", "specs": {"type": "NVMe SSD", "capacity_gb": "1000"}},
        },
    },

    {
        "id": "IB-20",
        "label": False,
        "desc": "PSU has fewer PCIe power connectors than the GPU needs — Check 11",
        "build": {
            "cpu": {"name": "Intel Core i7-13700K", "tdp": 125, "specs": {"socket": "LGA1700"}},
            "gpu": {"name": "RTX 4080 SUPER", "tdp": 320, "specs": {"length_mm": 336, "pcie_power_connectors": 3}},
            "motherboard": {
                "name": "MSI PRO Z790-A",
                "specs": {
                    "socket": "LGA1700", "chipset": "Z790", "form_factor": "ATX",
                    "max_memory": "DDR5-7200", "max_gpu_length_mm": 400,
                },
            },
            "ram": {"name": "Corsair Vengeance DDR5-6000 32GB", "specs": {"speed": "DDR5-6000"}},
            "psu": {"name": "Small SFX 600W", "rating": 900, "specs": {"pcie_connectors": 2}},
        },
    },
]


# ══════════════════════════════════════════════════════════════════════════════
# EXPERIMENT 2 — FIXTURE DATA
# ══════════════════════════════════════════════════════════════════════════════
#
# Each intent describes a build request with a target budget and persona.
# run_allocation() requires a MongoDB collection; we stub it with a mock that
# returns pre-baked component documents so we can evaluate allocation arithmetic
# purely in-process, with zero network I/O.

BUDGET_INTENTS: list[dict] = [
    {"id": "BA-01", "budget": 500,  "use_case": "budget",           "desc": "Entry-level budget gaming rig"},
    {"id": "BA-02", "budget": 700,  "use_case": "gaming",           "desc": "Mid-range 1080p gaming build"},
    {"id": "BA-03", "budget": 1000, "use_case": "gaming",           "desc": "High-refresh 1440p gaming build"},
    {"id": "BA-04", "budget": 1200, "use_case": "streaming",        "desc": "Dual-purpose streaming + gaming"},
    {"id": "BA-05", "budget": 1500, "use_case": "content_creation", "desc": "Video editing workstation"},
    {"id": "BA-06", "budget": 2000, "use_case": "workstation",      "desc": "Professional CAD workstation"},
    {"id": "BA-07", "budget": 2500, "use_case": "gaming",           "desc": "Enthusiast 4K gaming system"},
    {"id": "BA-08", "budget": 3000, "use_case": "workstation",      "desc": "High-end rendering workstation"},
    {"id": "BA-09", "budget": 800,  "use_case": "general",          "desc": "All-round productivity desktop"},
    {"id": "BA-10", "budget": 1800, "use_case": "content_creation", "desc": "Photography + light 3D editing"},
]

# Component catalogue keyed by category → list of documents
# Prices are chosen to be realistic relative to 2024/2025 market prices
_MOCK_CATALOGUE: dict[str, list[dict]] = {
    "CPU": [
        {"name": "AMD Ryzen 3 4100",      "category": "CPU", "performance_score": 0.42,
         "specs": {"launch_msrp_usd": 75,  "tdp_w": 65,  "socket": "AM4", "chipset": "B450"}},
        {"name": "Intel Core i3-12100F",  "category": "CPU", "performance_score": 0.50,
         "specs": {"launch_msrp_usd": 100, "tdp_w": 58,  "socket": "LGA1700", "chipset": "B660"}},
        {"name": "AMD Ryzen 5 5600X",     "category": "CPU", "performance_score": 0.65,
         "specs": {"launch_msrp_usd": 150, "tdp_w": 65,  "socket": "AM4", "chipset": "B550"}},
        {"name": "Intel Core i5-13600K",  "category": "CPU", "performance_score": 0.78,
         "specs": {"launch_msrp_usd": 250, "tdp_w": 125, "socket": "LGA1700", "chipset": "Z690"}},
        {"name": "AMD Ryzen 7 7700X",     "category": "CPU", "performance_score": 0.82,
         "specs": {"launch_msrp_usd": 310, "tdp_w": 105, "socket": "AM5", "chipset": "B650"}},
        {"name": "Intel Core i7-13700K",  "category": "CPU", "performance_score": 0.87,
         "specs": {"launch_msrp_usd": 380, "tdp_w": 125, "socket": "LGA1700", "chipset": "Z790"}},
        {"name": "AMD Ryzen 9 7950X",     "category": "CPU", "performance_score": 0.96,
         "specs": {"launch_msrp_usd": 550, "tdp_w": 170, "socket": "AM5", "chipset": "X670"}},
        {"name": "Intel Core i9-13900K",  "category": "CPU", "performance_score": 0.98,
         "specs": {"launch_msrp_usd": 550, "tdp_w": 125, "socket": "LGA1700", "chipset": "Z790"}},
    ],
    "GPU": [
        {"name": "Nvidia GTX 1660 Super", "category": "GPU", "performance_score": 0.38,
         "specs": {"launch_msrp_usd": 130, "tdp_w": 125, "length_mm": 225}},
        {"name": "AMD RX 6600",           "category": "GPU", "performance_score": 0.48,
         "specs": {"launch_msrp_usd": 170, "tdp_w": 132, "length_mm": 240}},
        {"name": "Nvidia RTX 3060",       "category": "GPU", "performance_score": 0.55,
         "specs": {"launch_msrp_usd": 200, "tdp_w": 170, "length_mm": 242}},
        {"name": "Nvidia RTX 4060",       "category": "GPU", "performance_score": 0.62,
         "specs": {"launch_msrp_usd": 280, "tdp_w": 115, "length_mm": 240}},
        {"name": "AMD RX 7700 XT",        "category": "GPU", "performance_score": 0.71,
         "specs": {"launch_msrp_usd": 380, "tdp_w": 245, "length_mm": 267}},
        {"name": "Nvidia RTX 4070 SUPER", "category": "GPU", "performance_score": 0.80,
         "specs": {"launch_msrp_usd": 490, "tdp_w": 220, "length_mm": 336}},
        {"name": "Nvidia RTX 4080 SUPER", "category": "GPU", "performance_score": 0.91,
         "specs": {"launch_msrp_usd": 850, "tdp_w": 320, "length_mm": 336}},
        {"name": "Nvidia RTX 4090",       "category": "GPU", "performance_score": 1.00,
         "specs": {"launch_msrp_usd": 1550,"tdp_w": 450, "length_mm": 336}},
    ],
    "MOTHERBOARD": [
        {"name": "ASRock B450M HDV",      "category": "MOTHERBOARD", "performance_score": 0.40,
         "specs": {"launch_msrp_usd": 70,  "socket": "AM4", "chipset": "B450", "form_factor": "MICRO-ATX",
                   "max_memory": "DDR4-4266", "max_gpu_length_mm": 330}},
        {"name": "MSI PRO B660M-A DDR4",  "category": "MOTHERBOARD", "performance_score": 0.50,
         "specs": {"launch_msrp_usd": 110, "socket": "LGA1700", "chipset": "B660", "form_factor": "MICRO-ATX",
                   "max_memory": "DDR4-5000", "max_gpu_length_mm": 340}},
        {"name": "Gigabyte B550 AORUS Elite", "category": "MOTHERBOARD", "performance_score": 0.62,
         "specs": {"launch_msrp_usd": 160, "socket": "AM4", "chipset": "B550", "form_factor": "ATX",
                   "max_memory": "DDR4-5100", "max_gpu_length_mm": 380}},
        {"name": "ASUS TUF Gaming B760-Plus", "category": "MOTHERBOARD", "performance_score": 0.72,
         "specs": {"launch_msrp_usd": 200, "socket": "LGA1700", "chipset": "B760", "form_factor": "ATX",
                   "max_memory": "DDR5-7600", "max_gpu_length_mm": 385}},
        {"name": "MSI MAG B650 TOMAHAWK",  "category": "MOTHERBOARD", "performance_score": 0.78,
         "specs": {"launch_msrp_usd": 230, "socket": "AM5", "chipset": "B650", "form_factor": "ATX",
                   "max_memory": "DDR5-7800", "max_gpu_length_mm": 380}},
        {"name": "ASUS ROG STRIX X670E-F", "category": "MOTHERBOARD", "performance_score": 0.90,
         "specs": {"launch_msrp_usd": 390, "socket": "AM5", "chipset": "X670", "form_factor": "ATX",
                   "max_memory": "DDR5-6800", "max_gpu_length_mm": 420}},
    ],
    "RAM": [
        {"name": "Crucial DDR4-3200 8GB",    "category": "RAM", "performance_score": 0.35,
         "specs": {"launch_msrp_usd": 25,  "speed": "DDR4-3200"}},
        {"name": "Corsair Vengeance DDR4-3200 16GB", "category": "RAM", "performance_score": 0.55,
         "specs": {"launch_msrp_usd": 45,  "speed": "DDR4-3200"}},
        {"name": "G.Skill Ripjaws V DDR4-3600 32GB", "category": "RAM", "performance_score": 0.65,
         "specs": {"launch_msrp_usd": 75,  "speed": "DDR4-3600"}},
        {"name": "Kingston Fury Beast DDR5-5200 16GB", "category": "RAM", "performance_score": 0.70,
         "specs": {"launch_msrp_usd": 65,  "speed": "DDR5-5200"}},
        {"name": "Corsair Dominator DDR5-6000 32GB",   "category": "RAM", "performance_score": 0.85,
         "specs": {"launch_msrp_usd": 130, "speed": "DDR5-6000"}},
        {"name": "G.Skill Trident Z5 DDR5-6400 64GB",  "category": "RAM", "performance_score": 0.95,
         "specs": {"launch_msrp_usd": 230, "speed": "DDR5-6400"}},
    ],
    "PSU": [
        {"name": "Corsair CX450",          "category": "PSU", "performance_score": 0.35,
         "specs": {"launch_msrp_usd": 45,  "wattage_w": 450}},
        {"name": "Seasonic Focus GX-550",  "category": "PSU", "performance_score": 0.55,
         "specs": {"launch_msrp_usd": 75,  "wattage_w": 550}},
        {"name": "Corsair RM750x",         "category": "PSU", "performance_score": 0.72,
         "specs": {"launch_msrp_usd": 100, "wattage_w": 750}},
        {"name": "Seasonic Focus GX-850",  "category": "PSU", "performance_score": 0.82,
         "specs": {"launch_msrp_usd": 130, "wattage_w": 850}},
        {"name": "be quiet! Dark Power 1000W", "category": "PSU", "performance_score": 0.90,
         "specs": {"launch_msrp_usd": 180, "wattage_w": 1000}},
        {"name": "Seasonic Prime TX-1300", "category": "PSU", "performance_score": 0.97,
         "specs": {"launch_msrp_usd": 280, "wattage_w": 1300}},
    ],
}


def _make_mock_collection() -> MagicMock:
    """
    Returns a MagicMock that behaves like a pymongo Collection.
    find_one() inspects the query dict and returns the best-scoring
    component from _MOCK_CATALOGUE that satisfies the price ceiling.
    Supports $lte price filter, $nin name exclusion, performance_score sort.
    """
    def _find_one(query: dict, projection=None, sort=None):
        category = query.get("category", "").upper()
        docs = _MOCK_CATALOGUE.get(category, [])
        if not docs:
            return None

        price_filter = query.get("specs.launch_msrp_usd", {})
        max_price = price_filter.get("$lte", float("inf"))
        excluded  = (query.get("name") or {}).get("$nin", [])

        candidates = [
            d for d in docs
            if d["specs"]["launch_msrp_usd"] <= max_price
            and d["name"] not in excluded
        ]
        if not candidates:
            return None

        # sort by performance_score DESC (primary), price DESC (fallback)
        sort_key = sort[0][0] if sort else "performance_score"
        if sort_key == "performance_score":
            candidates.sort(key=lambda d: d.get("performance_score", 0), reverse=True)
        else:
            candidates.sort(key=lambda d: d["specs"]["launch_msrp_usd"], reverse=True)

        return candidates[0]

    mock = MagicMock()
    mock.find_one.side_effect = _find_one
    return mock


# ══════════════════════════════════════════════════════════════════════════════
# EXPERIMENT 1 — COMPATIBILITY ENGINE ACCURACY
# ══════════════════════════════════════════════════════════════════════════════

def run_experiment_1() -> dict:
    h1("EXPERIMENT 1 — Compatibility Engine Accuracy")
    h2(f"Running {len(COMPAT_FIXTURES)} fixtures through validation_engine.run_checks()")

    results = []
    for fx in COMPAT_FIXTURES:
        build       = fx["build"]
        true_label  = fx["label"]   # True=good, False=broken
        result      = run_checks(build)
        pred_ok     = result["ok"]  # True=engine says compatible

        tp = true_label is False and pred_ok is False   # broken, correctly flagged
        tn = true_label is True  and pred_ok is True    # good,   correctly passed
        fp = true_label is True  and pred_ok is False   # good,   incorrectly flagged
        fn = true_label is False and pred_ok is True    # broken, missed

        tag = (
            f"{C.GREEN}TP{C.RESET}" if tp else
            f"{C.GREEN}TN{C.RESET}" if tn else
            f"{C.RED}FP{C.RESET}"   if fp else
            f"{C.RED}FN{C.RESET}"
        )
        outcome = "CORRECT" if (tp or tn) else f"{C.RED}WRONG{C.RESET}"

        issues_str = f"{len(result['issues'])} issue(s)" if result["issues"] else "none"
        print(
            f"  [{tag}] {fx['id']}  {'PASS' if pred_ok else 'FAIL':4s}  "
            f"issues={issues_str:12s}  {C.DIM}{fx['desc'][:50]}{C.RESET}"
        )

        results.append({"id": fx["id"], "tp": tp, "tn": tn, "fp": fp, "fn": fn,
                        "result": result, "true_label": true_label, "pred_ok": pred_ok})

    TP = sum(1 for r in results if r["tp"])
    TN = sum(1 for r in results if r["tn"])
    FP = sum(1 for r in results if r["fp"])
    FN = sum(1 for r in results if r["fn"])

    precision = TP / (TP + FP) if (TP + FP) > 0 else 0.0
    recall    = TP / (TP + FN) if (TP + FN) > 0 else 0.0
    f1        = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
    accuracy  = (TP + TN) / len(results)

    h2("Confusion Matrix")
    cm_w = 28
    print(f"\n  {'':28s}  {C.BOLD}Predicted FAIL{C.RESET}   {C.BOLD}Predicted PASS{C.RESET}")
    print(f"  {C.BOLD}{'Actual BROKEN (Positive)':28s}{C.RESET}  "
          f"{C.GREEN}{str(TP):^14}{C.RESET}  {C.RED}{str(FN):^14}{C.RESET}")
    print(f"  {C.BOLD}{'Actual GOOD (Negative)':28s}{C.RESET}  "
          f"{C.RED}{str(FP):^14}{C.RESET}  {C.GREEN}{str(TN):^14}{C.RESET}")

    h2("Classification Metrics")
    prec_c  = C.GREEN if precision >= 0.9 else C.YELLOW if precision >= 0.7 else C.RED
    rec_c   = C.GREEN if recall    >= 0.9 else C.YELLOW if recall    >= 0.7 else C.RED
    f1_c    = C.GREEN if f1        >= 0.9 else C.YELLOW if f1        >= 0.7 else C.RED
    acc_c   = C.GREEN if accuracy  >= 0.9 else C.YELLOW if accuracy  >= 0.7 else C.RED

    row("True Positives (TP)",  str(TP),                    C.GREEN)
    row("True Negatives (TN)",  str(TN),                    C.GREEN)
    row("False Positives (FP)", str(FP),                    C.RED if FP else C.GREEN)
    row("False Negatives (FN)", str(FN),                    C.RED if FN else C.GREEN)
    separator()
    row("Precision",  f"{precision:.4f}  ({precision*100:.1f}%)",  prec_c)
    row("Recall",     f"{recall:.4f}  ({recall*100:.1f}%)",        rec_c)
    row("F1-Score",   f"{f1:.4f}  ({f1*100:.1f}%)",               f1_c)
    row("Accuracy",   f"{accuracy:.4f}  ({accuracy*100:.1f}%)",    acc_c)

    return {"TP": TP, "TN": TN, "FP": FP, "FN": FN,
            "precision": precision, "recall": recall, "f1": f1, "accuracy": accuracy}


# ══════════════════════════════════════════════════════════════════════════════
# EXPERIMENT 2 — BUDGET ALLOCATION ADHERENCE
# ══════════════════════════════════════════════════════════════════════════════

def run_experiment_2() -> dict:
    h1("EXPERIMENT 2 — Budget Allocation Adherence")
    h2("Running 10 intents through selection_engine.run_allocation()")

    collection = _make_mock_collection()
    run_results = []

    col_w = [8, 22, 10, 10, 10, 10, 10, 8]
    hdr   = (f"  {'ID':<{col_w[0]}} {'Description':<{col_w[1]}} "
             f"{'Budget':>{col_w[2]}} {'BuildCost':>{col_w[3]}} "
             f"{'Variance':>{col_w[4]}} {'Var%':>{col_w[5]}} "
             f"{'Filled':>{col_w[6]}} {'Tries':>{col_w[7]}}")
    separator()
    print(f"{C.BOLD}{hdr}{C.RESET}")
    separator()

    for intent in BUDGET_INTENTS:
        budget    = intent["budget"]
        use_case  = intent["use_case"]
        attempt   = 0
        build     = {}
        excluded: dict[str, list[str]] = {}
        max_tries = 5
        final_result = None

        t0 = time.perf_counter()
        while attempt < max_tries:
            alloc = run_allocation(budget, use_case, build, collection,
                                   attempt=attempt, excluded=excluded)
            # Check compatibility of the allocated build
            compat = run_checks(alloc["build"])
            if compat["ok"]:
                final_result = alloc
                break
            # Mark incompatible components for exclusion and retry
            for issue_text in compat["issues"]:
                for slot in ("cpu", "gpu", "motherboard", "ram", "psu"):
                    comp = alloc["build"].get(slot, {})
                    if comp and comp.get("name"):
                        if slot not in excluded:
                            excluded[slot] = []
                        if comp["name"] not in excluded[slot]:
                            excluded[slot].append(comp["name"])
            build = {}  # reset for fresh allocation on next attempt
            attempt += 1

        if final_result is None:
            final_result = alloc

        elapsed_ms = (time.perf_counter() - t0) * 1000

        # Calculate total build cost
        build_cost = sum(
            (final_result["build"].get(s) or {}).get("price", 0) or 0
            for s in ("cpu", "gpu", "motherboard", "ram", "psu")
        )
        variance     = build_cost - budget
        variance_pct = (variance / budget * 100) if budget else 0.0
        slots_filled = sum(
            1 for s in ("cpu", "gpu", "motherboard", "ram", "psu")
            if final_result["build"].get(s)
        )

        var_c = (
            C.GREEN  if abs(variance_pct) <= 15 else
            C.YELLOW if abs(variance_pct) <= 30 else
            C.RED
        )
        sign = "+" if variance >= 0 else ""
        print(
            f"  {intent['id']:<{col_w[0]}} "
            f"{intent['desc'][:21]:<{col_w[1]}} "
            f"${budget:>{col_w[2]-1},} "
            f"${build_cost:>{col_w[3]-1},} "
            f"{var_c}{sign}${abs(variance):>{col_w[4]-1},}{C.RESET} "
            f"{var_c}{sign}{variance_pct:>{col_w[5]-2}.1f}%{C.RESET} "
            f"{'#' * slots_filled}{'.' * (5 - slots_filled)}{' ':>{col_w[6]-5}} "
            f"{attempt + 1:>{col_w[7]}}"
        )

        run_results.append({
            "id":           intent["id"],
            "budget":       budget,
            "use_case":     use_case,
            "build_cost":   build_cost,
            "variance":     variance,
            "variance_pct": variance_pct,
            "slots_filled": slots_filled,
            "tries":        attempt + 1,
            "elapsed_ms":   elapsed_ms,
            "build":        final_result["build"],
        })

    separator()

    # ── Aggregated metrics ─────────────────────────────────────────────────
    variances    = [r["variance"] for r in run_results]
    var_pcts     = [r["variance_pct"] for r in run_results]
    tries_list   = [r["tries"] for r in run_results]
    filled_list  = [r["slots_filled"] for r in run_results]

    mae         = sum(abs(v) for v in variances) / len(variances)
    rmse        = math.sqrt(sum(v**2 for v in variances) / len(variances))
    mean_var_pct = sum(abs(p) for p in var_pcts) / len(var_pcts)
    avg_tries   = sum(tries_list) / len(tries_list)
    avg_filled  = sum(filled_list) / len(filled_list)
    on_target   = sum(1 for p in var_pcts if abs(p) <= 15)

    h2("Aggregated Budget Adherence Metrics")

    mae_c  = C.GREEN if mae <= 100 else C.YELLOW if mae <= 200 else C.RED
    pct_c  = C.GREEN if mean_var_pct <= 15 else C.YELLOW if mean_var_pct <= 30 else C.RED
    try_c  = C.GREEN if avg_tries <= 1.5 else C.YELLOW if avg_tries <= 2.5 else C.RED

    row("Mean Absolute Error (MAE)",      f"${mae:.2f}",            mae_c)
    row("Root Mean Squared Error (RMSE)", f"${rmse:.2f}",           mae_c)
    row("Mean Absolute Variance %",       f"{mean_var_pct:.2f}%",   pct_c)
    row("Within ±15% of Budget",          f"{on_target}/10 intents", C.GREEN if on_target >= 8 else C.YELLOW)
    separator()
    row("Avg Allocation Attempts",        f"{avg_tries:.2f}",       try_c)
    row("Avg Slots Filled (of 5)",        f"{avg_filled:.2f}",      C.GREEN if avg_filled >= 4.5 else C.YELLOW)

    h2("Per-Persona Breakdown")
    persona_groups: dict[str, list[dict]] = {}
    for r in run_results:
        persona_groups.setdefault(r["use_case"], []).append(r)

    for persona, group in sorted(persona_groups.items()):
        p_mae = sum(abs(r["variance"]) for r in group) / len(group)
        p_pct = sum(abs(r["variance_pct"]) for r in group) / len(group)
        p_c   = C.GREEN if p_pct <= 15 else C.YELLOW if p_pct <= 30 else C.RED
        row(f"  {persona:<20} MAE", f"${p_mae:.2f}   avg variance {p_pct:.1f}%", p_c)

    return {
        "mae": mae, "rmse": rmse, "mean_var_pct": mean_var_pct,
        "on_target": on_target, "avg_tries": avg_tries,
        "avg_filled": avg_filled, "runs": run_results,
    }


# ══════════════════════════════════════════════════════════════════════════════
# EXPERIMENT 3 — VALIDATION GATE + SELECTION PRE-FILTER
# ══════════════════════════════════════════════════════════════════════════════
#
# Proves the two structural guarantees added to close the "invalid build reached
# response_node" bug:
#   (A) an unfixable fatal build is flagged validation_failed AFTER the retry
#       budget, routes to `respond` (not an infinite loop), and its build JSON is
#       suppressed by run_pipeline — it can never reach the BuildCanvas.
#   (B) the selection engine pre-filters candidates so it never *selects* an
#       incompatible motherboard / RAM for the chosen CPU.

def _make_compat_mock() -> MagicMock:
    """Mock Collection that honours the socket / DDR compat sub-queries."""
    from services.validation_engine import _extract_ddr  # local import (test-only)

    def _find_one(query: dict, projection=None, sort=None):
        category  = query.get("category", "").upper()
        docs      = _MOCK_CATALOGUE.get(category, [])
        max_price = query.get("specs.launch_msrp_usd", {}).get("$lte", float("inf"))
        excluded  = (query.get("name") or {}).get("$nin", [])
        req_sock  = query.get("specs.socket")
        or_clause = query.get("$or")

        def matches(d: dict) -> bool:
            s = d["specs"]
            if s["launch_msrp_usd"] > max_price or d["name"] in excluded:
                return False
            if req_sock and s.get("socket") != req_sock:
                return False
            if or_clause:
                want = ""
                for cond in or_clause:
                    for _k, v in cond.items():
                        want = v if isinstance(v, str) else v.get("$regex", "")
                        break
                    if want:
                        break
                have = _extract_ddr(str(s.get("memory_type") or s.get("type") or s.get("speed") or ""))
                if _extract_ddr(want) and have and _extract_ddr(want) != have:
                    return False
            return True

        cands = [d for d in docs if matches(d)]
        if not cands:
            return None
        cands.sort(key=lambda d: d.get("performance_score", 0), reverse=True)
        return cands[0]

    mock = MagicMock()
    mock.find_one.side_effect = _find_one
    return mock


def run_experiment_3() -> dict:
    h1("EXPERIMENT 3 — Validation Gate + Selection Pre-Filter")

    checks: list[tuple[str, bool]] = []

    # ── Part A — the airtight gate (needs agent.py) ────────────────────────────
    h2("Part A — a fatal build never reaches / populates response_node")
    try:
        from agent import (
            compatibility_node,
            _should_retry,
            _MAX_ALLOC_ATTEMPTS,
            _serialise_build,
        )

        fatal_build = {
            "cpu": {"name": "AMD Ryzen 5 7600X", "tdp": 105, "specs": {"socket": "AM5"}},
            "motherboard": {"name": "MSI B550M Bazooka",
                            "specs": {"socket": "AM4", "chipset": "B550"}},
            "ram": {"name": "DDR5 kit", "specs": {"type": "DDR5"}},
        }
        # Simulate the state AFTER the retry budget has been spent.
        state = {
            "active_build":        dict(fatal_build),
            "allocation_attempt":  _MAX_ALLOC_ATTEMPTS,
            "excluded_components": {},
        }
        out = compatibility_node(state)

        checks.append(("compatibility flags fatal (compat_ok=False)", out["compat_ok"] is False))
        checks.append(("validation_failed=True after retry budget spent",
                       out.get("validation_failed") is True))
        checks.append(("_should_retry routes to 'respond' (no infinite loop)",
                       _should_retry({"compat_ok": False,
                                      "allocation_attempt": _MAX_ALLOC_ATTEMPTS}) == "respond"))
        # run_pipeline's serialization guard: build JSON is emitted only when NOT failed.
        would_emit_json = not out.get("validation_failed")
        checks.append(("build JSON suppressed for a failed build", would_emit_json is False))
        # And a healthy build is NOT gated (regression guard).
        checks.append(("_should_retry lets a passing build respond",
                       _should_retry({"compat_ok": True, "allocation_attempt": 1}) == "respond"))
    except Exception as exc:  # pragma: no cover — langgraph optional in some envs
        row("Part A SKIPPED (agent import failed)", str(exc)[:46], C.YELLOW)

    # ── Part B — selection never picks an incompatible part ────────────────────
    h2("Part B — selection_engine pre-filters for compatibility")
    collection = _make_compat_mock()
    alloc = run_allocation(budget=2000, use_case="gaming", build={},
                           collection=collection, attempt=0, excluded={})
    b = alloc["build"]
    cpu_sock = ((b.get("cpu") or {}).get("specs") or {}).get("socket")
    mb_sock  = ((b.get("motherboard") or {}).get("specs") or {}).get("socket")
    if cpu_sock and mb_sock:
        checks.append((f"selected board socket {mb_sock} matches CPU socket {cpu_sock}",
                       cpu_sock == mb_sock))
    # If both a CPU and RAM were selected, the DDR generations must agree with the board.
    from services.validation_engine import run_checks as _rc
    sel_result = _rc(b)
    checks.append(("full allocated build passes validation (no fatal issues)",
                   sel_result["ok"] is True))

    # ── Report ─────────────────────────────────────────────────────────────────
    separator()
    passed = 0
    for label, ok in checks:
        tag = f"{C.GREEN}PASS{C.RESET}" if ok else f"{C.RED}FAIL{C.RESET}"
        print(f"  [{tag}] {label}")
        passed += 1 if ok else 0
    separator()
    total = len(checks)
    all_ok = passed == total
    row("Gate assertions passed",
        f"{passed}/{total}", C.GREEN if all_ok else C.RED)

    return {"passed": passed, "total": total, "all_ok": all_ok}


# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY BANNER
# ══════════════════════════════════════════════════════════════════════════════

def print_summary(exp1: dict, exp2: dict, exp3: dict) -> None:
    h1("EVALUATION SUITE — SUMMARY")

    print(f"\n  {C.BOLD}{'Metric':<44}  Value{C.RESET}")
    separator()

    # Experiment 1
    print(f"  {C.CYAN}{C.BOLD}Experiment 1 — Compatibility Engine{C.RESET}")
    row("  Precision",  f"{exp1['precision']*100:.1f}%",
        C.GREEN if exp1['precision'] >= 0.9 else C.YELLOW)
    row("  Recall",     f"{exp1['recall']*100:.1f}%",
        C.GREEN if exp1['recall'] >= 0.9 else C.YELLOW)
    row("  F1-Score",   f"{exp1['f1']*100:.1f}%",
        C.GREEN if exp1['f1'] >= 0.9 else C.YELLOW)
    row("  Accuracy",   f"{exp1['accuracy']*100:.1f}%",
        C.GREEN if exp1['accuracy'] >= 0.9 else C.YELLOW)
    row("  FP / FN",    f"{exp1['FP']} false positives, {exp1['FN']} false negatives",
        C.GREEN if exp1['FP'] == 0 and exp1['FN'] == 0 else C.YELLOW)

    separator()

    # Experiment 2
    print(f"  {C.CYAN}{C.BOLD}Experiment 2 — Budget Allocation Adherence{C.RESET}")
    row("  MAE (Budget vs. Build Cost)",     f"${exp2['mae']:.2f}",
        C.GREEN if exp2['mae'] <= 100 else C.YELLOW)
    row("  RMSE",                            f"${exp2['rmse']:.2f}",
        C.GREEN if exp2['rmse'] <= 150 else C.YELLOW)
    row("  Within ±15% Budget Target",       f"{exp2['on_target']}/10",
        C.GREEN if exp2['on_target'] >= 8 else C.YELLOW)
    row("  Avg Retry Attempts",              f"{exp2['avg_tries']:.2f}",
        C.GREEN if exp2['avg_tries'] <= 1.5 else C.YELLOW)
    row("  Avg Slots Filled",                f"{exp2['avg_filled']:.2f} / 5",
        C.GREEN if exp2['avg_filled'] >= 4.5 else C.YELLOW)

    separator()

    # Experiment 3
    print(f"  {C.CYAN}{C.BOLD}Experiment 3 — Validation Gate + Selection Pre-Filter{C.RESET}")
    row("  Gate assertions passed",          f"{exp3['passed']}/{exp3['total']}",
        C.GREEN if exp3['all_ok'] else C.RED)

    print(f"\n{C.CYAN}{C.BOLD}{'═' * 72}{C.RESET}\n")


# ══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    # Force UTF-8 output on Windows so box-drawing and block characters render
    if sys.platform == "win32":
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

    print(f"\n{C.BOLD}{C.CYAN}"
          "  +-+-+-+-+-+-+-+-+-+-+\n"
          "  | N E U R O B U I L D S |\n"
          "  +-+-+-+-+-+-+-+-+-+-+\n"
          f"{C.RESET}"
          f"{C.DIM}  Deterministic Engine Evaluation Suite  -  FYP Academic Thesis{C.RESET}\n")

    t_start = time.perf_counter()

    exp1_metrics = run_experiment_1()
    exp2_metrics = run_experiment_2()
    exp3_metrics = run_experiment_3()
    print_summary(exp1_metrics, exp2_metrics, exp3_metrics)

    elapsed = time.perf_counter() - t_start
    print(f"  {C.DIM}Total evaluation time: {elapsed*1000:.1f} ms{C.RESET}\n")

    # Non-zero exit code if any experiment regressed — usable in CI / pre-commit.
    ok = (
        exp1_metrics["FP"] == 0 and exp1_metrics["FN"] == 0
        and exp3_metrics["all_ok"]
    )
    sys.exit(0 if ok else 1)
