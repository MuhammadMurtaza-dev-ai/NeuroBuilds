"""
NeuroBuilds — Deterministic Selection Engine (Layer B)
=======================================================
Weighted Budget Allocation Model — zero LLM calls, pure deterministic logic.

This module owns ALL hardware selection arithmetic:
  • Persona-weighted budget ceiling calculation (Budget × Weight × 1.15 margin)
  • MongoDB performance_score-ranked component queries (price-sort fallback)
  • Per-retry ceiling reduction for CPU/GPU when compatibility fails
  • Excluded-names blacklist so retry passes skip incompatible components
  • Human-readable price/efficiency report for Layer D narration

The LangGraph budget_allocation_node in agent.py is a thin orchestration
wrapper around run_allocation(). Nothing in this module makes LLM calls.

Public API:
    run_allocation(budget, use_case, build, collection, attempt, excluded)
        -> AllocationResult
    build_selection_report(build, budget, use_case, weights)
        -> str
"""

import logging
from typing import Optional, TypedDict

from services.validation_engine import (
    component_tier,
    cpu_tier_table,
    gpu_tier_table,
    required_ddr,
    required_socket,
)

logger = logging.getLogger(__name__)


# ─── Per-persona allocation weights ──────────────────────────────────────────
#
# Each row is the fraction of the total budget earmarked for that component
# slot.  Rows intentionally do not sum to exactly 1.0 — the remainder is
# unallocated slack for storage, peripherals, OS licences, and shipping.
#
# "storage" is advisory only: the allocator reports its recommended ceiling
# but does NOT fill a storage slot (no storage key in ActiveBuild / validation).
#
# Academic reference:
#   Gaming ratios derived from PCPartPicker community aggregates (2023–2025).
#   Workstation ratios follow professional CAD/render workstation conventions
#   (CPU-heavy, GPU mid-weight, high-capacity RAM priority).

ALLOCATION_WEIGHTS: dict[str, dict[str, float]] = {
    "gaming": {
        "cpu":         0.20,
        "gpu":         0.40,
        "motherboard": 0.12,
        "ram":         0.08,
        "psu":         0.08,
        "storage":     0.10,
    },
    "workstation": {
        "cpu":         0.35,
        "gpu":         0.30,
        "motherboard": 0.15,
        "ram":         0.12,
        "psu":         0.08,
        "storage":     0.00,
    },
    "content_creation": {
        "cpu":         0.30,
        "gpu":         0.35,
        "motherboard": 0.13,
        "ram":         0.12,
        "psu":         0.08,
        "storage":     0.02,
    },
    "streaming": {
        "cpu":         0.28,
        "gpu":         0.38,
        "motherboard": 0.12,
        "ram":         0.10,
        "psu":         0.07,
        "storage":     0.05,
    },
    "budget": {
        "cpu":         0.22,
        "gpu":         0.42,
        "motherboard": 0.12,
        "ram":         0.10,
        "psu":         0.09,
        "storage":     0.05,
    },
    "general": {
        "cpu":         0.25,
        "gpu":         0.40,
        "motherboard": 0.13,
        "ram":         0.10,
        "psu":         0.08,
        "storage":     0.04,
    },
}

# Target Ceiling = Budget × Weight × _VARIANCE_MARGIN
# The 15% variance widens the candidate pool so a $200 GPU slot does not
# reject a $225 card that still fits within the overall budget in practice.
_VARIANCE_MARGIN: float = 1.15

# Component is "on target" when within this delta of the recommended allocation.
ALLOCATION_TOLERANCE_USD: int = 50

# Per-retry ceiling multiplier for cpu/gpu (0.90^attempt → 10% reduction each).
# Forces the allocator toward lower-tier, potentially more compatible parts.
_RETRY_CEILING_REDUCTION: float = 0.90

# Slots the allocator fills and that validation_engine validates.
_CORE_SLOTS: tuple[str, ...] = ("cpu", "gpu", "motherboard", "ram", "psu")

_SLOT_CATEGORY: dict[str, str] = {
    "cpu":         "CPU",
    "gpu":         "GPU",
    "motherboard": "MOTHERBOARD",
    "ram":         "RAM",
    "psu":         "PSU",
}


# ─── Result TypedDicts ────────────────────────────────────────────────────────

class SlotResult(TypedDict):
    """Outcome of a single-slot DB query."""
    slot:     str
    selected: bool
    name:     Optional[str]
    price:    Optional[int]
    ceiling:  int
    score:    Optional[float]   # performance_score from DB; None if field absent


class AllocationResult(TypedDict):
    """Complete output of run_allocation()."""
    build:    dict              # updated build dict — user slots preserved, empty slots filled
    report:   str               # plain-text budget analysis; Layer D cites this verbatim
    slot_log: list[SlotResult]  # per-slot detail for logging / telemetry
    attempt:  int               # echo of the attempt counter consumed


# ─── Public entry point ───────────────────────────────────────────────────────

def run_allocation(
    budget:    Optional[int],
    use_case:  str,
    build:     dict,
    collection,                                          # pymongo.collection.Collection
    attempt:   int = 0,
    excluded:  Optional[dict[str, list[str]]] = None,   # slot → [excluded names]
) -> AllocationResult:
    """
    Deterministic weighted budget allocation with MongoDB-backed component selection.

    For each unfilled core slot the function:
      1. Computes Target Ceiling  = Budget × Weight × 1.15
      2. Applies retry reduction  : cpu/gpu × 0.90^attempt
      3. Queries hardware_specs   : ORDER BY performance_score DESC WHERE price ≤ ceiling
      4. Skips excluded names     : $nin filter on the ``name`` field
      5. Falls back               : ORDER BY specs.price DESC if performance_score absent

    Pre-filled slots (build[slot].price is not None) are never overwritten;
    user-supplied components or accepted selections from a prior iteration are
    always preserved.

    If budget is None or ≤ 0, no DB queries are issued and an analysis-only
    report is generated from the existing build.

    Args:
        budget:     Total USD budget (may be None when the user omits it).
        use_case:   Persona key; unknown values fall back to "general".
        build:      Current ActiveBuild dict; a shallow copy is returned — the
                    original is never mutated.
        collection: PyMongo Collection for hardware_specs.
        attempt:    Retry counter supplied by the orchestrator (0 on first pass).
        excluded:   Per-slot exclusion lists populated from prior compatibility
                    failures.  Components whose names appear here are filtered
                    from the DB query so they are never re-selected.

    Returns:
        AllocationResult — updated build, narrative report, slot log, attempt.
    """
    build    = dict(build)
    weights  = ALLOCATION_WEIGHTS.get(use_case, ALLOCATION_WEIGHTS["general"])
    excluded = excluded or {}

    # Short-circuit: no budget → analysis only, no DB queries
    if not budget or budget <= 0:
        report = build_selection_report(build, 0, use_case, weights)
        return AllocationResult(build=build, report=report, slot_log=[], attempt=attempt)

    retry_mult = _RETRY_CEILING_REDUCTION ** attempt
    slot_log: list[SlotResult] = []

    for slot in _CORE_SLOTS:
        # Preserve pre-filled slots (user-supplied or previously accepted)
        if build.get(slot) and build[slot].get("price") is not None:
            continue

        weight  = weights.get(slot, 0.0)
        ceiling = int(budget * weight * _VARIANCE_MARGIN)

        if slot in ("cpu", "gpu"):
            ceiling = int(ceiling * retry_mult)

        if ceiling <= 0:
            slot_log.append(SlotResult(
                slot=slot, selected=False, name=None,
                price=None, ceiling=ceiling, score=None,
            ))
            continue

        # Constrain the candidate pool to parts compatible with slots already
        # filled (CPU chosen before motherboard, board before RAM) so the
        # allocator never ranks — and never selects — an incompatible component.
        component, score = _query_best_component(
            collection, slot, ceiling, excluded.get(slot, []),
            _compat_filter(slot, build),
        )

        if component:
            specs = component.get("specs", {}) or {}
            entry: dict = {
                "name":  component.get("name", ""),
                "price": _safe_int(specs.get("price"), default=0),
                "specs": specs,
            }
            # Promote TDP / wattage to top-level so compatibility_node can read them
            # without diving into the nested specs dict.
            if slot == "cpu" and specs.get("tdp"):
                entry["tdp"] = int(specs["tdp"])
            elif slot == "gpu" and specs.get("tdp"):
                entry["tdp"] = int(specs["tdp"])
            elif slot == "psu" and specs.get("wattage"):
                entry["rating"] = int(specs["wattage"])

            build[slot] = entry
            slot_log.append(SlotResult(
                slot=slot, selected=True, name=entry["name"],
                price=entry["price"], ceiling=ceiling, score=score,
            ))
            logger.info(
                "selection_engine [%s] attempt=%d: '%s' @ $%s "
                "(ceiling $%s, perf_score=%s)",
                slot, attempt, entry["name"], entry["price"], ceiling,
                f"{score:.3f}" if score is not None else "n/a",
            )
        else:
            slot_log.append(SlotResult(
                slot=slot, selected=False, name=None,
                price=None, ceiling=ceiling, score=None,
            ))
            logger.warning(
                "selection_engine [%s] attempt=%d: no component found within $%s",
                slot, attempt, ceiling,
            )

    report = build_selection_report(build, budget, use_case, weights)
    return AllocationResult(build=build, report=report, slot_log=slot_log, attempt=attempt)


# ─── MongoDB query ────────────────────────────────────────────────────────────

def _compat_filter(slot: str, build: dict) -> dict:
    """
    A Mongo sub-query constraining a slot to components compatible with the
    parts already chosen.  Applied BEFORE ranking so an incompatible part is
    never even a candidate (Layer B must not intentionally pick a mismatch).

      • motherboard → socket must equal the CPU's required socket
      • ram         → DDR generation must equal the board/CPU's required DDR

    Tolerant of the several spellings the docs use for the memory-type field.
    Returns {} when the constraint cannot be determined (query stays unfiltered).
    """
    if slot == "motherboard":
        socket = required_socket(build.get("cpu") or {})
        if socket:
            return {"specs.socket": socket}
    elif slot == "ram":
        ddr = required_ddr(build)
        if ddr:
            return {"$or": [
                {"specs.memory_type": ddr},
                {"specs.type":        ddr},
                {"specs.speed":  {"$regex": ddr, "$options": "i"}},
                {"specs.max_memory": {"$regex": ddr, "$options": "i"}},
            ]}
    return {}


def _query_best_component(
    collection,
    slot:           str,
    ceiling:        int,
    excluded_names: list[str],
    compat_filter:  Optional[dict] = None,
) -> tuple[Optional[dict], Optional[float]]:
    """
    Query hardware_specs for the highest-performance component within a price ceiling.

    Primary   : ORDER BY performance_score DESC — maximises objective capability score.
    Fallback  : ORDER BY specs.price DESC — highest-priced = best-within-budget proxy,
                used when performance_score field is absent from the collection schema.

    The $nin filter on the name field ensures previously rejected components are
    not re-selected during retry passes.  ``compat_filter`` (from _compat_filter)
    additionally constrains the pool to parts compatible with already-chosen slots.
    When no compatible component exists within budget the caller leaves the slot
    empty — hybrid_fill / the retry loop then handle it — rather than selecting a
    known-incompatible part.

    Returns (document, performance_score) or (None, None) on DB error / no match.
    """
    category = _SLOT_CATEGORY.get(slot, slot.upper())
    query: dict = {
        "category":    category,
        "specs.price": {"$lte": ceiling, "$gt": 0},
    }
    if excluded_names:
        query["name"] = {"$nin": excluded_names}
    if compat_filter:
        query.update(compat_filter)

    try:
        # Attempt primary sort: highest performance_score within budget
        doc = collection.find_one(
            query,
            {"embedding": 0},
            sort=[("performance_score", -1)],
        )
        if doc is not None:
            return doc, doc.get("performance_score")

        # Fallback: price as capability proxy (legacy catalogs without performance_score)
        doc = collection.find_one(
            query,
            {"embedding": 0},
            sort=[("specs.price", -1)],
        )
        return doc, None

    except Exception as exc:
        logger.warning(
            "selection_engine: MongoDB query failed for slot '%s' — %s", slot, exc,
        )
        return None, None


# ─── Budget analysis report ───────────────────────────────────────────────────

def build_selection_report(
    build:    dict,
    budget:   int,
    use_case: str,
    weights:  Optional[dict[str, float]] = None,
) -> str:
    """
    Pure arithmetic budget and efficiency analysis. Zero LLM involvement.

    Sections:
      A — Price breakdown (slot / price / % of total / name)
      B — Budget constraint status (within / exceeded; delta and %)
      C — Recommended allocation vs. actual (per slot; ON TARGET / OVER / UNDER)
      D — Price-to-tier efficiency for GPU and CPU (tier-points per $100 spent)

    The returned string is attached as an AIMessage in _build_deterministic_context()
    so the Layer D LLM receives it as already-established context it must cite
    verbatim — it must not recompute, round, or contradict any figure.

    Args:
        build:    Current build dict (may contain None or partial slots).
        budget:   Total budget in USD (pass 0 when budget is unknown).
        use_case: Persona key for recommended-allocation labels.
        weights:  Pre-resolved weight dict; resolved from ALLOCATION_WEIGHTS if None.
    """
    if weights is None:
        weights = ALLOCATION_WEIGHTS.get(use_case, ALLOCATION_WEIGHTS["general"])

    lines: list[str] = []

    # ── A. Price inventory ─────────────────────────────────────────────────────
    component_prices: dict[str, int] = {}
    for slot in _CORE_SLOTS:
        comp  = build.get(slot) or {}
        price = comp.get("price")
        if price is not None:
            v = _safe_int(price)
            if v is not None:
                component_prices[slot] = v

    total = sum(component_prices.values())

    if component_prices:
        lines.append("CURRENT BUILD — PRICE BREAKDOWN:")
        for slot in _CORE_SLOTS:
            if slot in component_prices:
                price = component_prices[slot]
                pct   = price / total * 100 if total else 0.0
                name  = (build.get(slot) or {}).get("name", "")
                lines.append(
                    f"  {slot.upper():14s}: ${price:>6,}  ({pct:4.1f}%)  {name}"
                )
        lines.append(f"  {'TOTAL':14s}: ${total:>6,}")
    else:
        lines.append("PRICE BREAKDOWN: No priced components in the active build yet.")

    # ── B. Budget constraint ───────────────────────────────────────────────────
    if budget > 0 and total:
        over = total - budget
        if over > 0:
            lines.append(
                f"\nBUDGET STATUS — EXCEEDED: ${total:,} total is ${over:,} "
                f"over the ${budget:,} budget ({over / budget * 100:.1f}% overage)."
            )
        else:
            lines.append(
                f"\nBUDGET STATUS — WITHIN BUDGET: ${total:,} total leaves "
                f"${-over:,} remaining from the ${budget:,} budget "
                f"({-over / budget * 100:.1f}% headroom)."
            )
    elif budget > 0:
        lines.append(
            f"\nBUDGET TARGET: ${budget:,} (no priced components to evaluate yet)."
        )

    # ── C. Recommended vs. actual allocation ───────────────────────────────────
    if budget > 0:
        lines.append(
            f"\nRECOMMENDED ALLOCATION for '{use_case}' build (${budget:,} budget):"
        )
        margin_pct = int((_VARIANCE_MARGIN - 1) * 100)
        for slot in _CORE_SLOTS:
            weight      = weights.get(slot, 0.0)
            recommended = int(budget * weight)
            ceiling     = int(budget * weight * _VARIANCE_MARGIN)
            actual      = component_prices.get(slot)

            if actual is not None:
                delta  = actual - recommended
                status = (
                    f"OVER   by ${delta:,}"   if delta >  ALLOCATION_TOLERANCE_USD else
                    f"UNDER  by ${-delta:,}"  if delta < -ALLOCATION_TOLERANCE_USD else
                    "ON TARGET"
                )
                lines.append(
                    f"  {slot.upper():14s}: recommended ${recommended:>5,} "
                    f"(ceiling ${ceiling:>5,} +{margin_pct}% margin) "
                    f"| actual ${actual:>5,} | {status}"
                )
            else:
                lines.append(
                    f"  {slot.upper():14s}: recommended ${recommended:>5,} "
                    f"(ceiling ${ceiling:>5,} +{margin_pct}% margin) | (not yet selected)"
                )

        # Advisory: storage slot (not filled by allocator but reported for planning)
        storage_weight = weights.get("storage", 0.0)
        if storage_weight > 0:
            storage_rec  = int(budget * storage_weight)
            storage_ceil = int(budget * storage_weight * _VARIANCE_MARGIN)
            lines.append(
                f"  {'STORAGE':14s}: recommended ${storage_rec:>5,} "
                f"(ceiling ${storage_ceil:>5,} +{margin_pct}% margin) | (advisory — not auto-selected)"
            )

    # ── D. Price-to-tier efficiency ────────────────────────────────────────────
    efficiency_lines: list[str] = []
    for slot, tier_fn in (("gpu", gpu_tier_table), ("cpu", cpu_tier_table)):
        comp  = build.get(slot) or {}
        name  = comp.get("name", "")
        price = component_prices.get(slot)
        if name and price:
            tier = component_tier(name, tier_fn())
            if tier:
                eff = tier / (price / 100)
                efficiency_lines.append(
                    f"  {slot.upper()}: tier {tier}/5 at ${price:,} "
                    f"= {eff:.3f} tier-points per $100 spent"
                )

    if efficiency_lines:
        lines.append("\nPRICE-TO-TIER EFFICIENCY (higher = better value):")
        lines.extend(efficiency_lines)

    return "\n".join(lines)


# ─── Shared utility ───────────────────────────────────────────────────────────

def _safe_int(value, default: Optional[int] = None) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
