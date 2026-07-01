"""
NeuroBuilds — 7-Tier Deterministic Compatibility Matrix
========================================================
Pure Python, zero API calls. All hardware validation logic lives here so it
can be imported by agent.py nodes, ingestion scripts, and tests alike.

Tier mapping (fatal → `issues`, advisory → `warnings`):
  1  PSU transient margin        — GPU-family-specific peak-spike headroom   [fatal]
  2  CPU ↔ Motherboard socket    — mismatch → build will not POST            [fatal]
  3  BIOS flash advisory         — AM4-400 + Ryzen 5000 compatibility        [warning]
  4  RAM ↔ Motherboard type      — DDR4/DDR5 mismatch (platform-derived)     [fatal]
  5  Form factor fit             — MB form factor vs. case supported list    [fatal]
  6  GPU physical clearance      — gpu.length_mm vs. case clearance          [fatal]
  7  CPU cooler height clearance — cooler height vs. case/MB max height      [fatal]
  8  Hardware bottleneck         — tier-gap estimation (CPU-/GPU-bound)      [warning]
  9  Platform upgrade path       — future CPU compatibility score            [warning — never fatal]
 10  Storage interface fit       — NVMe/M.2 drive vs. board M.2-slot count   [fatal]
 11  PSU PCIe connectors         — GPU required vs. PSU available connectors [fatal]
 12  CPU cooler socket + TDP     — cooler socket list / TDP rating vs. CPU   [fatal]
 13  PCIe generation             — GPU gen vs. board x16 slot gen            [warning]

Spec-key tolerance: components come from five sources that disagree on key
names, so every spec is read through the _spec()/_extract_ddr() helpers and, for
socket/DDR, backstopped by name/chipset inference — a check must never silently
no-op just because a field was spelled differently (see the DDR5+B550 bug).

Public surface:
  run_checks(build: dict, case: dict | None = None) -> ValidationResult
"""

import re
from typing import Optional, TypedDict


class ValidationResult(TypedDict):
    ok:       bool        # True only when issues list is empty (warnings are non-fatal)
    issues:   list[str]   # Fatal — build cannot work as-is
    warnings: list[str]   # Advisory — build works but has risks or trade-offs
    passed:   list[str]   # Affirmative checks — confirmed compatible


# ─── PSU transient multiplier table ──────────────────────────────────────────
# Maps GPU family keyword lists to worst-case peak-transient multiplier above
# rated TDP. Ada Lovelace (RTX 40-series) is notorious for instantaneous spikes
# well above nameplate TDP.
_GPU_TRANSIENT_FACTORS: list[tuple[list[str], float]] = [
    (["RTX 40", "RTX 4090", "RTX 4080", "RTX 4070", "RTX 4060"], 1.25),  # Ada Lovelace
    (["RTX 30", "RTX 3090", "RTX 3080", "RTX 3070", "RTX 3060"], 1.15),  # Ampere
    (["RX 7"],                                                      1.20),  # RDNA 3
    (["RX 6"],                                                      1.10),  # RDNA 2
]
_PSU_SAFETY_FACTOR = 1.20   # minimum recommended headroom above peak transient
_PSU_WARN_MARGIN   = 0.30   # advisory when headroom < 30% above peak transient

# ─── Chipset → platform tag ───────────────────────────────────────────────────
_CHIPSET_TO_PLATFORM: dict[str, str] = {
    # AMD AM4 — 400-series (Ryzen 5000 requires BIOS flash)
    "B450": "AM4_400", "X470": "AM4_400", "A320": "AM4_400",
    "B350": "AM4_400", "X370": "AM4_400",
    # AMD AM4 — 500-series (Ryzen 5000 natively supported)
    "B550": "AM4_500", "X570": "AM4_500", "A520": "AM4_500",
    # AMD AM5
    "B650": "AM5", "X670": "AM5", "A620": "AM5", "X870": "AM5",
    # Intel LGA1700 (12th / 13th / 14th gen)
    "Z690": "LGA1700", "Z790": "LGA1700", "B660": "LGA1700",
    "B760": "LGA1700", "H770": "LGA1700", "H610": "LGA1700",
    # Intel LGA1851 (Arrow Lake / 15th gen)
    "Z890": "LGA1851", "B860": "LGA1851", "H810": "LGA1851",
    # Intel LGA1200 (10th / 11th gen — obsolete)
    "Z590": "LGA1200", "Z490": "LGA1200", "B560": "LGA1200",
    "H570": "LGA1200", "H510": "LGA1200",
}

# ─── Platform upgrade-path scores (0–10) ────────────────────────────────────
_PLATFORM_SCORES: dict[str, tuple[int, str]] = {
    "AM5":     (9, "AMD AM5 — multiple CPU gens confirmed (Ryzen 7000/9000+); AMD committed to socket through 2027+"),
    "LGA1851": (7, "Intel LGA1851 — current Arrow Lake platform; Intel track record on socket longevity is mixed"),
    "AM4_500": (5, "AMD AM4 B550/X570 — mature platform; Ryzen 5000 is the final gen; strong used-market upgrade value"),
    "LGA1700": (4, "Intel LGA1700 — confirmed end-of-life; Intel moved to LGA1851 for Arrow Lake; no future CPUs"),
    "AM4_400": (3, "AMD AM4 B450/X470 — Ryzen 5000 is last gen AND requires a BIOS flash; limited upgrade runway"),
    "LGA1200": (1, "Intel LGA1200 — fully obsolete; zero CPU upgrade path remaining"),
}

# ─── GPU tier table (5 = flagship, 1 = entry-level) ──────────────────────────
_GPU_TIER_TABLE: list[tuple[int, list[str]]] = [
    (5, ["RTX 4090", "RX 7900 XTX", "RTX 3090 Ti"]),
    (4, ["RTX 4080 SUPER", "RTX 4080 Super", "RTX 4080",
         "RX 7900 XT", "RTX 3090", "RTX 3080 Ti"]),
    (3, ["RTX 4070 TI SUPER", "RTX 4070 Ti Super", "RTX 4070 TI", "RTX 4070 Ti",
         "RTX 4070 SUPER", "RTX 4070 Super",
         "RX 7800 XT", "RX 7700 XT", "RTX 3080", "RTX 3070 Ti"]),
    (2, ["RTX 4070", "RTX 4060 Ti", "RX 7600 XT", "RX 7600",
         "RTX 3070", "RTX 3060 Ti"]),
    (1, ["RTX 4060", "RX 6600", "RTX 3060", "GTX 1660", "RX 6500"]),
]

# ─── CPU tier table ───────────────────────────────────────────────────────────
_CPU_TIER_TABLE: list[tuple[int, list[str]]] = [
    (5, ["i9", "Core i9", "Ryzen 9", "RYZEN 9", "Core Ultra 9", "Threadripper"]),
    (4, ["i7", "Core i7", "Ryzen 7", "RYZEN 7", "Core Ultra 7"]),
    (3, ["i5-13600", "i5-14600", "i5-12600",
         "Ryzen 5 7600", "Ryzen 5 5600X", "Core Ultra 5"]),
    (2, ["i5", "Core i5", "Ryzen 5", "RYZEN 5"]),
    (1, ["i3", "Core i3", "Ryzen 3", "RYZEN 3", "Pentium", "Celeron", "Athlon"]),
]

# Bottleneck severity keyed by absolute tier gap (capped at 4)
_BOTTLENECK_TABLE: dict[int, tuple[int, str]] = {
    2: (20, "moderate"),
    3: (35, "significant"),
    4: (55, "severe"),
}

# BIOS-flash advisory: (platform_tag, cpu_gen) → message template
_BIOS_FLASH_SCENARIOS: dict[tuple[str, str], str] = {
    ("AM4_400", "RYZEN_5000"): (
        "BIOS FLASH REQUIRED: {chipset} motherboards do not natively boot Ryzen 5000 CPUs. "
        "A BIOS update is mandatory before installation. You may need a compatible "
        "Ryzen 1000/2000/3000 CPU to perform the initial flash, or use the board's "
        "USB BIOS Flashback feature if available. Verify the latest firmware version "
        "on the manufacturer's website before purchasing the CPU."
    ),
}


# ─── Private helpers ──────────────────────────────────────────────────────────

def _gpu_transient_factor(gpu_name: str) -> float:
    n = gpu_name.upper()
    for keywords, factor in _GPU_TRANSIENT_FACTORS:
        if any(k.upper() in n for k in keywords):
            return factor
    return 1.10  # conservative default for unknown GPU families


def _component_tier(name: str, table: list[tuple[int, list[str]]]) -> Optional[int]:
    n = name.upper()
    for tier, keywords in table:
        if any(k.upper() in n for k in keywords):
            return tier
    return None


def _detect_platform(chipset: str, mb_name: str) -> tuple[Optional[str], Optional[str]]:
    search = (chipset + " " + mb_name).upper()
    for chip_key, tag in _CHIPSET_TO_PLATFORM.items():
        if chip_key in search:
            return tag, chip_key
    return None, None


def _detect_cpu_gen(cpu_name: str) -> str:
    n = cpu_name.upper()
    m = re.search(r"RYZEN\s+\d+\s+(\d)\d{3}", n)
    if m:
        return {
            "2": "RYZEN_2000", "3": "RYZEN_3000", "5": "RYZEN_5000",
            "7": "RYZEN_7000", "8": "RYZEN_8000", "9": "RYZEN_9000",
        }.get(m.group(1), "RYZEN_UNKNOWN")
    m = re.search(r"I[3579]-(\d{2})\d{3}", n)
    if m:
        return {
            "12": "INTEL_GEN12", "13": "INTEL_GEN13", "14": "INTEL_GEN14",
        }.get(m.group(1), "INTEL_UNKNOWN")
    return "UNKNOWN"


def _safe_int(value, default: Optional[int] = None) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


# ─── Spec-key tolerance layer ─────────────────────────────────────────────────
# The build dict is produced by five different sources (source JSON, the Mongo
# ingestion, the selection engine, the hybrid_fill LLM, and hand-written tests)
# and they historically DISAGREE on spec key names — e.g. board memory type has
# been written as `max_memory`, `memory_type`, and `ram_type`; RAM type as
# `speed` and `type`; case GPU clearance as `max_gpu_clearance_mm` and
# `max_gpu_length_mm`.  A check that reads only one spelling silently no-ops on
# the others (this is what let DDR5+B550 slip through).  Read every spec through
# these tolerant helpers so a fatal mismatch is caught regardless of spelling.
# TODO(schema): unify the key names across data + ingestion + the LLM prompt so
# this tolerance layer can eventually be removed.

def _spec(specs: dict, *keys: str) -> str:
    """First non-empty value among the given spec keys, as a trimmed string."""
    for k in keys:
        v = (specs or {}).get(k)
        if v not in (None, "", {}, []):
            return str(v).strip()
    return ""


_DDR_TYPES = ("DDR5", "DDR4", "DDR3")


def _extract_ddr(text: str) -> str:
    """Pull the DDR generation token out of an arbitrary memory string."""
    t = (text or "").upper()
    for d in _DDR_TYPES:
        if d in t:
            return d
    return ""


# ─── Platform → socket / DDR derivation ──────────────────────────────────────
# When a component omits its explicit socket / memory-type spec (common for
# LLM-invented parts), derive it from the model name / chipset so the socket and
# RAM checks still fire.  LGA1700 is intentionally absent from _PLATFORM_DDR:
# Alder/Raptor Lake boards ship in both DDR4 and DDR5 variants, so the platform
# tag alone cannot decide the RAM type — we defer to the board's own spec there.

_PLATFORM_SOCKET: dict[str, str] = {
    "AM4_400": "AM4", "AM4_500": "AM4", "AM5": "AM5",
    "LGA1700": "LGA1700", "LGA1851": "LGA1851", "LGA1200": "LGA1200",
}

_PLATFORM_DDR: dict[str, str] = {
    "AM4_400": "DDR4", "AM4_500": "DDR4", "AM5": "DDR5",
    "LGA1200": "DDR4", "LGA1851": "DDR5",
}


def _socket_from_cpu_name(name: str) -> str:
    """Best-effort CPU socket inference from the model name (no external data)."""
    n = (name or "").upper()
    m = re.search(r"RYZEN\s+\d+\s+(\d)\d{3}", n)
    if m:
        return "AM5" if m.group(1) in ("7", "8", "9") else "AM4"
    if "CORE ULTRA" in n:                      # Arrow Lake — 15th gen
        return "LGA1851"
    m = re.search(r"I[3579][\s-]*(\d{2})\d{3}", n)
    if m:
        gen = int(m.group(1))
        if gen in (12, 13, 14):
            return "LGA1700"
        if gen in (10, 11):
            return "LGA1200"
    return ""


def _socket_from_platform(platform: Optional[str]) -> str:
    return _PLATFORM_SOCKET.get(platform or "", "")


def _pcie_gen(text: str) -> Optional[int]:
    """Extract the PCIe generation integer from an interface string (e.g. 'PCIe 4.0 x16' → 4)."""
    m = re.search(r"PCIE\s*([3-5])", (text or "").upper())
    return int(m.group(1)) if m else None


# ─── Public entry point ───────────────────────────────────────────────────────

def run_checks(build: dict, case: Optional[dict] = None) -> ValidationResult:
    """
    Run all 9 deterministic compatibility checks against a component build dict.

    The build dict mirrors the ActiveBuild schema used by the frontend and
    agent.py (keys: cpu, gpu, motherboard, ram, psu — each with name, specs,
    tdp/rating, price sub-keys).

    The optional ``case`` argument adds physical enclosure constraints for
    Tiers 5–7.  Expected structure::

        {
          "name": "NZXT H510",
          "specs": {
            "supported_motherboards": ["ATX", "mATX", "Mini-ITX"],
            "max_gpu_clearance_mm": 381,
            "max_cooler_height_mm": 165
          }
        }

    When ``case`` is None, Tier 5 falls back to mb_specs.max_gpu_length_mm and
    mb_specs.max_cooler_height_mm (backward-compatible with existing DB schema).

    Returns a ValidationResult. ``ok`` is False only when ``issues`` is
    non-empty; warnings are advisory and do not block the build.
    """
    issues:   list[str] = []
    warnings: list[str] = []
    passed:   list[str] = []

    cpu = build.get("cpu",         {}) or {}
    gpu = build.get("gpu",         {}) or {}
    mb  = build.get("motherboard", {}) or {}
    ram = build.get("ram",         {}) or {}
    psu = build.get("psu",         {}) or {}

    cpu_name = cpu.get("name", "") or ""
    gpu_name = gpu.get("name", "") or ""
    mb_name  = mb.get("name",  "") or ""

    cpu_specs  = cpu.get("specs", {}) or {}
    mb_specs   = mb.get("specs",  {}) or {}
    ram_specs  = ram.get("specs", {}) or {}
    gpu_specs  = gpu.get("specs", {}) or {}
    psu_specs  = psu.get("specs", {}) or {}
    case_specs = (case or {}).get("specs", {}) or {}

    cpu_tdp    = _safe_int(cpu.get("tdp"))
    gpu_tdp    = _safe_int(gpu.get("tdp"))
    psu_rating = _safe_int(psu.get("rating"))

    # Hoisted platform detection — shared by the socket (2), BIOS (3), RAM (4)
    # and upgrade-path (9) checks so each can fall back to it when a component
    # omits its explicit spec.
    mb_chipset           = _spec(mb_specs, "chipset")
    platform, matched_ch = _detect_platform(mb_chipset, mb_name)
    cpu_gen              = _detect_cpu_gen(cpu_name) if cpu_name else "UNKNOWN"

    # ── Check 1 — PSU Transient Margin ──────────────────────────────────────
    if all(v is not None for v in [cpu_tdp, gpu_tdp, psu_rating]):
        t_factor       = _gpu_transient_factor(gpu_name)
        peak_transient = cpu_tdp + gpu_tdp * t_factor + 50
        safe_minimum   = peak_transient * _PSU_SAFETY_FACTOR
        headroom_pct   = (psu_rating - peak_transient) / peak_transient * 100

        if psu_rating < safe_minimum:
            deficit = safe_minimum - psu_rating
            issues.append(
                f"PSU TRANSIENT DEFICIT: {psu_rating}W PSU is {deficit:.0f}W below the "
                f"{safe_minimum:.0f}W safe minimum "
                f"(peak transient {peak_transient:.0f}W × {_PSU_SAFETY_FACTOR:.0%} safety factor; "
                f"GPU transient multiplier {t_factor:.2f}×). "
                "Risk: GPU power spikes may cause system instability or unexpected shutdowns."
            )
        elif headroom_pct < _PSU_WARN_MARGIN * 100:
            warnings.append(
                f"PSU MARGIN TIGHT: {psu_rating}W PSU has only {headroom_pct:.0f}% headroom "
                f"above {peak_transient:.0f}W peak transient (GPU factor {t_factor:.2f}×). "
                f"Recommended safe minimum: {safe_minimum:.0f}W. "
                "Consider upgrading for long-term stability under sustained load."
            )
        else:
            passed.append(
                f"PSU TRANSIENT OK: {psu_rating}W covers {peak_transient:.0f}W peak transient "
                f"(GPU factor {t_factor:.2f}×) with {headroom_pct:.0f}% headroom "
                f"— above {_PSU_SAFETY_FACTOR:.0%} safety threshold"
            )

    # ── Check 2 — CPU ↔ Motherboard Socket ──────────────────────────────────
    # Read the explicit socket spec first; when a component omits it (common for
    # LLM-invented parts) fall back to name/chipset inference so the mismatch is
    # still caught rather than silently skipped.
    cpu_socket = _spec(cpu_specs, "socket").upper()
    mb_socket  = _spec(mb_specs,  "socket").upper()
    if not cpu_socket:
        cpu_socket = _socket_from_cpu_name(cpu_name)
    if not mb_socket:
        mb_socket = _socket_from_platform(platform)

    if cpu_socket and mb_socket:
        if cpu_socket == mb_socket:
            passed.append(f"SOCKET COMPATIBLE: {cpu_socket}")
        else:
            issues.append(
                f"SOCKET MISMATCH: CPU requires {cpu_socket}, "
                f"motherboard has {mb_socket}"
            )

    # ── Check 3 — BIOS Flash Advisory ───────────────────────────────────────
    # platform / matched_ch / cpu_gen were computed once at the top of run_checks.
    if platform and cpu_gen != "UNKNOWN":
        msg_tpl = _BIOS_FLASH_SCENARIOS.get((platform, cpu_gen))
        if msg_tpl:
            warnings.append(msg_tpl.format(chipset=matched_ch or mb_chipset))

    # ── Check 4 — RAM ↔ Motherboard Memory Type ─────────────────────────────
    # Read the RAM DDR generation from any of the spellings in use (`type`,
    # `speed`, `memory_type`) and the board's supported type from its own spec
    # (`ram_type`, `memory_type`, `max_memory`).  When the board omits an
    # explicit memory-type spec, derive it from the chipset platform
    # (AM4→DDR4, AM5→DDR5, …) so a DDR5-on-B550 mismatch is still fatal.
    ram_type = _extract_ddr(_spec(ram_specs, "type", "speed", "memory_type"))
    mb_type  = _extract_ddr(_spec(mb_specs, "ram_type", "memory_type", "max_memory"))
    mb_type_source = "motherboard spec"
    if not mb_type and platform in _PLATFORM_DDR:
        mb_type = _PLATFORM_DDR[platform]
        mb_type_source = f"{platform} platform"

    if ram_type and mb_type:
        if ram_type == mb_type:
            passed.append(f"MEMORY TYPE COMPATIBLE: {ram_type}")
        else:
            issues.append(
                f"MEMORY MISMATCH: RAM is {ram_type} but the motherboard supports "
                f"{mb_type} ({mb_type_source}). {ram_type} modules are physically "
                f"keyed differently and will not fit a {mb_type} board."
            )

    # ── Check 5 — Form Factor Fit ────────────────────────────────────────────
    # When a case component is present, validate that the motherboard form factor
    # is in the case's supported list (fatal — an ATX board cannot be mounted in
    # an mATX-only case).  Without case data, simply report the detected factor.
    mb_form_factor = _spec(mb_specs, "form_factor").upper()
    # Case supported-form-factor list is written either as a JSON list
    # (`supported_motherboards`) or a CSV string (`form_factor_support`).
    case_supported_raw = (
        case_specs.get("supported_motherboards")
        or case_specs.get("form_factor_support")
        or []
    )
    if isinstance(case_supported_raw, str):
        case_supported_raw = re.split(r"[,;/]", case_supported_raw)
    case_supported = [f.upper().strip() for f in case_supported_raw if f]

    if mb_form_factor and case_supported:
        if mb_form_factor in case_supported:
            passed.append(
                f"FORM FACTOR COMPATIBLE: {mb_form_factor} motherboard fits in case "
                f"(supports: {', '.join(case_supported)})"
            )
        else:
            issues.append(
                f"FORM FACTOR MISMATCH: {mb_form_factor} motherboard is not supported "
                f"by the selected case (supports: {', '.join(case_supported)}). "
                "Select a compatible case or a different motherboard form factor."
            )
    elif mb_form_factor:
        passed.append(f"FORM FACTOR: {mb_form_factor} motherboard detected (no case data to validate against)")

    # ── Check 6 — GPU Physical Clearance ────────────────────────────────────
    # Source priority: case.specs.max_gpu_clearance_mm → mb_specs.max_gpu_length_mm
    # A mismatch here is fatal — the card physically will not fit inside the enclosure.
    gpu_length_mm     = _safe_int(gpu_specs.get("length_mm"))
    case_gpu_max      = (
        _safe_int(case_specs.get("max_gpu_clearance_mm"))
        or _safe_int(case_specs.get("max_gpu_length_mm"))
    )
    max_gpu_length_mm = case_gpu_max or _safe_int(mb_specs.get("max_gpu_length_mm"))
    clearance_source  = "case" if case_gpu_max else "motherboard data"

    if gpu_length_mm is not None and max_gpu_length_mm is not None:
        if gpu_length_mm > max_gpu_length_mm:
            issues.append(
                f"GPU CLEARANCE FATAL: {gpu_name} is {gpu_length_mm}mm long but the "
                f"{clearance_source} supports a maximum of {max_gpu_length_mm}mm. "
                "The card will not physically fit. Select a shorter GPU or a larger case."
            )
        else:
            slack = max_gpu_length_mm - gpu_length_mm
            if slack < 20:
                warnings.append(
                    f"GPU CLEARANCE TIGHT: {gpu_name} ({gpu_length_mm}mm) leaves only {slack}mm "
                    f"of clearance against the {max_gpu_length_mm}mm {clearance_source} limit. "
                    "Verify cable routing does not obstruct the card."
                )
            else:
                passed.append(
                    f"GPU CLEARANCE OK: {gpu_name} ({gpu_length_mm}mm) fits within "
                    f"{max_gpu_length_mm}mm {clearance_source} limit with {slack}mm slack"
                )

    # ── Check 7 — CPU Cooler Clearance ──────────────────────────────────────
    # Source priority: case.specs.max_cooler_height_mm → mb_specs.max_cooler_height_mm
    # Tight but non-zero slack is advisory; exceeding the limit is fatal.
    cooler_height_mm     = _safe_int(cpu_specs.get("cooler_height_mm"))
    case_cooler_max      = (
        _safe_int(case_specs.get("max_cooler_height_mm"))
        or _safe_int(case_specs.get("max_cpu_cooler_height_mm"))
    )
    max_cooler_height_mm = case_cooler_max or _safe_int(mb_specs.get("max_cooler_height_mm"))
    cooler_source        = "case" if case_cooler_max else "motherboard data"

    if cooler_height_mm is not None and max_cooler_height_mm is not None:
        if cooler_height_mm > max_cooler_height_mm:
            issues.append(
                f"COOLER CLEARANCE FATAL: CPU cooler is {cooler_height_mm}mm tall but "
                f"the {cooler_source} maximum is {max_cooler_height_mm}mm. "
                "Select a low-profile cooler or a larger case."
            )
        else:
            slack = max_cooler_height_mm - cooler_height_mm
            if slack < 10:
                warnings.append(
                    f"COOLER CLEARANCE TIGHT: {cooler_height_mm}mm cooler leaves only "
                    f"{slack}mm of headroom against the {max_cooler_height_mm}mm "
                    f"{cooler_source} limit. Check side-panel clearance before purchasing."
                )
            else:
                passed.append(
                    f"COOLER CLEARANCE OK: {cooler_height_mm}mm cooler fits within "
                    f"{max_cooler_height_mm}mm {cooler_source} limit with {slack}mm slack"
                )

    # ── Check 8 — Hardware Bottleneck Estimation ─────────────────────────────
    g_tier = _component_tier(gpu_name, _GPU_TIER_TABLE) if gpu_name else None
    c_tier = _component_tier(cpu_name, _CPU_TIER_TABLE) if cpu_name else None

    if g_tier is not None and c_tier is not None:
        gap = g_tier - c_tier
        if gap >= 2:
            pct, label = _BOTTLENECK_TABLE.get(min(gap, 4), (55, "severe"))
            warnings.append(
                f"CPU BOTTLENECK ESTIMATED ~{pct}%: GPU tier {g_tier}/5 ({gpu_name}) paired "
                f"with CPU tier {c_tier}/5 ({cpu_name}) creates a {label} structural mismatch. "
                "The CPU will cap performance in CPU-bound workloads; "
                "balancing component tiers will maximise frame-rate yield."
            )
        elif gap <= -2:
            pct, label = _BOTTLENECK_TABLE.get(min(-gap, 4), (55, "severe"))
            warnings.append(
                f"GPU BOTTLENECK ESTIMATED ~{pct}%: CPU tier {c_tier}/5 ({cpu_name}) "
                f"significantly outperforms GPU tier {g_tier}/5 ({gpu_name}). "
                "GPU is the limiting factor; a GPU upgrade will unlock the CPU's full potential."
            )
        else:
            passed.append(
                f"TIER BALANCE OK: CPU tier {c_tier}/5 and GPU tier {g_tier}/5 — "
                "well-matched pairing with minimal structural bottleneck"
            )

    # ── Check 9 — Upgrade Path Potential ────────────────────────────────────
    if platform:
        score, description = _PLATFORM_SCORES.get(platform, (0, "Unrecognised platform"))
        bar   = "█" * score + "░" * (10 - score)
        entry = f"UPGRADE PATH [{bar}] {score}/10: {description}"
        # Upgrade path is ADVISORY only — a mature/EOL platform still POSTs and
        # runs.  It must never be a fatal `issue`: doing so both mis-classifies
        # severity and pollutes the retry loop (excluding a perfectly working
        # board because it has a short upgrade runway).
        if score >= 7:
            passed.append(entry)
        else:
            warnings.append(entry)

    # ── Check 10 — Storage interface fit (NVMe needs an M.2 slot) ────────────
    # Fires only when both the drive interface and the board M.2-slot count are
    # known; skips silently otherwise.
    storage       = build.get("storage", {}) or {}
    storage_specs = storage.get("specs", {}) or {}
    storage_iface = _spec(storage_specs, "interface", "type").upper()
    mb_m2_slots   = _safe_int(_spec(mb_specs, "m2_slots", "m2_slot_count"))
    if storage_iface and mb_m2_slots is not None:
        needs_m2 = "NVME" in storage_iface or "M.2" in storage_iface or "M2" in storage_iface
        if needs_m2 and mb_m2_slots <= 0:
            issues.append(
                "STORAGE INTERFACE FATAL: an NVMe / M.2 drive was selected but the "
                "motherboard exposes no M.2 slots. Select a SATA drive or a board with M.2."
            )
        else:
            passed.append(f"STORAGE INTERFACE OK: {storage_iface} supported by the motherboard")

    # ── Check 11 — PSU PCIe power connectors for the GPU ─────────────────────
    # Fatal only when required vs available connector counts can both be read;
    # connector counts are not always present in the data, so this skips cleanly.
    gpu_pcie_needed = _safe_int(_spec(gpu_specs, "pcie_power_connectors", "pcie_8pin"))
    psu_pcie_avail  = _safe_int(_spec(psu_specs, "pcie_connectors", "pcie_8pin"))
    if gpu_pcie_needed is not None and psu_pcie_avail is not None:
        if psu_pcie_avail < gpu_pcie_needed:
            issues.append(
                f"PSU CONNECTOR FATAL: the GPU needs {gpu_pcie_needed} PCIe power "
                f"connector(s) but the PSU provides only {psu_pcie_avail}. "
                "The card cannot be powered safely without daisy-chain adapters."
            )
        else:
            passed.append(
                f"PSU CONNECTORS OK: {psu_pcie_avail} PCIe connector(s) cover the "
                f"GPU's {gpu_pcie_needed} required"
            )

    # ── Check 12 — CPU cooler socket + TDP support ───────────────────────────
    # Reads an optional dedicated `cooler` slot; the height check (Tier 7) still
    # uses cpu.specs.cooler_height_mm for backward compatibility.
    cooler       = build.get("cooler", {}) or {}
    cooler_specs = cooler.get("specs", {}) or {}
    cooler_sockets_raw = (
        cooler_specs.get("supported_sockets") or cooler_specs.get("sockets") or ""
    )
    if isinstance(cooler_sockets_raw, str):
        cooler_sockets_raw = re.split(r"[,;/]", cooler_sockets_raw)
    cooler_sockets = [s.upper().strip() for s in cooler_sockets_raw if s]
    if cooler_sockets and cpu_socket:
        if cpu_socket in cooler_sockets:
            passed.append(f"COOLER SOCKET OK: cooler mounts on {cpu_socket}")
        else:
            issues.append(
                f"COOLER SOCKET FATAL: the CPU cooler does not support {cpu_socket} "
                f"(supports: {', '.join(cooler_sockets)}). It cannot be mounted on this CPU."
            )
    cooler_tdp_rating = _safe_int(_spec(cooler_specs, "tdp_rating", "max_tdp"))
    if cooler_tdp_rating is not None and cpu_tdp is not None:
        if cpu_tdp > cooler_tdp_rating:
            issues.append(
                f"COOLER TDP FATAL: the CPU dissipates {cpu_tdp}W but the cooler is rated "
                f"for {cooler_tdp_rating}W. It cannot keep the CPU within thermal limits."
            )
        else:
            passed.append(
                f"COOLER TDP OK: {cooler_tdp_rating}W cooler covers the {cpu_tdp}W CPU"
            )

    # ── Check 13 — PCIe generation (advisory — PCIe is backward-compatible) ──
    gpu_pcie_gen = _pcie_gen(_spec(gpu_specs, "interface", "pcie"))
    mb_pcie_gen  = _pcie_gen(_spec(mb_specs, "pcie_gen", "pcie_x16_gen", "interface"))
    if gpu_pcie_gen and mb_pcie_gen and gpu_pcie_gen > mb_pcie_gen:
        warnings.append(
            f"PCIe GENERATION: the GPU is PCIe {gpu_pcie_gen} but the board's x16 slot is "
            f"PCIe {mb_pcie_gen}. The link negotiates down to Gen {mb_pcie_gen} — a minor "
            "bandwidth trade-off, still fully functional (PCIe is backward-compatible)."
        )

    return ValidationResult(
        ok=len(issues) == 0,
        issues=issues,
        warnings=warnings,
        passed=passed,
    )


# ─── Tier table accessors (re-exported for agent.py budget_allocation_node) ──

def gpu_tier_table() -> list[tuple[int, list[str]]]:
    return _GPU_TIER_TABLE


def cpu_tier_table() -> list[tuple[int, list[str]]]:
    return _CPU_TIER_TABLE


def component_tier(name: str, table: list[tuple[int, list[str]]]) -> Optional[int]:
    return _component_tier(name, table)


# ─── Compatibility derivation (re-exported for selection_engine pre-filtering) ─
# These let the selection engine constrain candidate queries to compatible parts
# BEFORE ranking — so it never intentionally selects an incompatible component.

def required_socket(cpu: dict) -> str:
    """The socket a motherboard must have to fit this CPU (explicit spec → name)."""
    specs = (cpu or {}).get("specs", {}) or {}
    return _spec(specs, "socket").upper() or _socket_from_cpu_name((cpu or {}).get("name", ""))


def required_ddr(build: dict) -> str:
    """
    The DDR generation the RAM must be, derived from the chosen board/CPU.
    Priority: board memory-type spec → board chipset platform → CPU socket.
    Returns "" when it cannot be determined (LGA1700 is intentionally ambiguous).
    """
    mb       = (build or {}).get("motherboard", {}) or {}
    mb_specs = mb.get("specs", {}) or {}

    ddr = _extract_ddr(_spec(mb_specs, "ram_type", "memory_type", "max_memory"))
    if ddr:
        return ddr

    platform, _ = _detect_platform(_spec(mb_specs, "chipset"), mb.get("name", ""))
    if platform in _PLATFORM_DDR:
        return _PLATFORM_DDR[platform]

    socket = required_socket((build or {}).get("cpu", {}) or {})
    return {"AM5": "DDR5", "AM4": "DDR4", "LGA1200": "DDR4", "LGA1851": "DDR5"}.get(socket, "")
