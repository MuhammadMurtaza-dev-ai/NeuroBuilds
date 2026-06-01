# NeuroBuilds — Thesis Evaluation Baseline

**Research Question:** Can a natural-language AI pipeline with deterministic compatibility rules produce
PC build recommendations that exceed the coverage and correctness of both manual configuration and
rule-based tools (PCPartPicker) for budget-constrained, first-time builders?

---

## 1 — System Architecture Summary

NeuroBuilds uses a **deterministic / probabilistic split** pipeline (LangGraph, 6 nodes):

```
search_node → rag_node → intent_node → selection_node → compatibility_node → response_node
  (Tavily)    (MongoDB)   (LLM, T=0)    (pure Python)    (pure Python)        (LLM, stream)
```

- **Layer A (LLM):** intent parsing — natural language → structured `BuildIntent`
- **Layer B (Code):** budget maths, allocation ratios, efficiency scoring — NO LLM
- **Layer C (Code):** 7-check compatibility engine — NO LLM
- **Layer D (LLM):** narrative translation of B+C results — forbidden from recalculating

---

## 2 — Evaluation Dimensions

### 2.1 Natural Language Budget Allocation

| Capability | NeuroBuilds | PCPartPicker | Manual Research |
|---|---|---|---|
| Accepts conversational budget input | **Yes** ("I have $800 for gaming") | No (numeric filter) | No |
| Auto-derives component allocation ratios | **Yes** (GPU ~40%, CPU ~25%, RAM ~10%…) | No | No |
| Propagates budget constraint to selection | **Yes** (deterministic; `selection_node`) | Partial (sort-by-price) | User-driven |
| Detects budget overage and warns | **Yes** (tracked as `budget_exceeded` event) | No | No |
| Handles implicit constraints ("quiet build") | **Yes** (via `intent_node`) | No | Requires research |
| Persona detection (gaming / productivity / budget) | **Yes** (`detectPersona` in `scoringEngine.ts`) | No | Implicit |

### 2.2 Compatibility Validation Coverage

Seven deterministic checks executed on every build — results are logged as validation events:

| Check | NeuroBuilds | PCPartPicker | Manual |
|---|---|---|---|
| CPU ↔ Motherboard socket | **Deterministic** (string match) | Yes | Error-prone |
| PSU transient power margin | **Deterministic** (peak×1.2× safety factor) | Basic wattage sum | Rarely checked |
| RAM generation (DDR4/DDR5) | **Deterministic** (type string match) | Yes | Often missed |
| BIOS flash advisory | **Yes** (lookup table by platform + CPU gen) | Partial | Rarely flagged |
| Bottleneck estimation | **Yes** (tier gap × `_BOTTLENECK_TABLE`) | No | No |
| Upgrade path score | **Yes** (0–10 platform score, AM5=9, LGA1851=7…) | No | No |
| Budget overage | **Yes** (allocation delta vs. ±$50 tolerance) | No | No |

### 2.3 Response Generation Latency

*Populate from TelemetryPanel → Export JSON after test runs.*

| Metric | NeuroBuilds (live backend) | NeuroBuilds (mock fallback) | PCPartPicker | Manual |
|---|---|---|---|---|
| Time to first output | ___ ms (TTFT) | ~2 s (mock stream) | < 100 ms | Hours |
| Full recommendation | ___ s (avg latency) | ~5 s | Instant (list) | Hours–Days |
| P95 latency | ___ s | ~5 s | < 200 ms | — |

### 2.4 Explanation Quality (Qualitative)

| Dimension | NeuroBuilds | PCPartPicker | Manual |
|---|---|---|---|
| Explains WHY a component was chosen | **Yes** (narrative from `response_node`) | No | Self-researched |
| Quantifies bottleneck % | **Yes** (e.g., "~20% CPU bottleneck") | No | No |
| Provides upgrade path reasoning | **Yes** | No | No |
| Shows power budget breakdown | **Yes** (BuildCanvasCard, speedometer) | Wattage only | No |
| Cites web prices (live Tavily search) | **Yes** | Yes | Manual |

### 2.5 Build Scoring Dimensions (`scoringEngine.ts`)

Five orthogonal sub-scores (0–100), persona-weighted:

| Sub-score | What it measures | Weight (Gaming) | Weight (Productivity) | Weight (Budget) |
|---|---|---|---|---|
| Performance-per-Rupee | Value for money vs. reference | 0.40 | 0.30 | 0.45 |
| Compatibility Confidence | Socket + RAM + PSU pass rate | 0.25 | 0.25 | 0.25 |
| Thermal Efficiency | PSU load bands + efficiency | 0.20 | 0.15 | 0.10 |
| Upgrade Potential | Platform longevity score | 0.05 | 0.20 | 0.10 |
| Power Efficiency | Load vs. optimum band (50–75%) | 0.10 | 0.10 | 0.10 |

---

## 3 — Empirical Data Collection Protocol

### 3.1 Test Matrix

Run 10 standardised prompts through the AI chat and record telemetry after each:

| Test ID | Prompt | Budget | Expected Validations |
|---|---|---|---|
| T01 | "Gaming PC for $800, mainly 1080p" | $800 | bottleneck possible, upgrade_path |
| T02 | "Video editing workstation $1500" | $1500 | none (well-matched) |
| T03 | "Budget build under $400" | $400 | psu_margin, upgrade_path |
| T04 | "Intel CPU with AMD GPU, $1000" | $1000 | socket_mismatch (cross-platform) |
| T05 | "DDR4 RAM with Z790 board" | Any | ram_mismatch (DDR5 board) |
| T06 | "Ryzen 5000 on B450" | Any | bios_flash advisory |
| T07 | "Ultra-budget: $300 gaming" | $300 | budget_exceeded, psu_margin |
| T08 | "Streaming + gaming rig $1200" | $1200 | bottleneck (CPU-heavy) |
| T09 | "Silent workstation $900" | $900 | thermal warning possible |
| T10 | "Future-proof build $2000" | $2000 | upgrade_path (high score) |

### 3.2 Metrics to Record

After completing the test matrix, export from `/admin → Telemetry → Export JSON` and extract:

```
AI Latency
  - avgLatencyMs      → overall AI pipeline performance
  - avgTimeToFirstTokenMs → streaming responsiveness (UX)
  - p95LatencyMs      → worst-case user experience
  - mockFallbackRate  → backend availability during testing

Cache Efficiency
  - youtube.hitRatio  → sessionStorage effectiveness
  - gnews.hitRatio    → localStorage effectiveness

Validation Effectiveness
  - totalCaught       → total compatibility issues surfaced
  - errorCount        → hard incompatibilities caught
  - warningCount      → soft warnings surfaced
  - byCheckType       → per-rule catch rate
```

### 3.3 Baseline Data — To Fill In

```
Date collected:    ___________
Backend mode:      live / mock (circle one)
Test prompts run:  ___ / 10
Session duration:  ___

AI Performance
  Avg latency (end-to-end):  ___ ms
  Avg TTFT:                  ___ ms
  P95 latency:               ___ ms
  Mock fallback rate:        ___ %

Cache Performance
  YouTube hit rate:  ___ % (___ / ___ requests)
  GNews hit rate:    ___ % (___ / ___ requests)
  Overall hit rate:  ___ %

Validation Catches (10-prompt test run)
  Total events:  ___
  Hard errors:   ___
  Warnings:      ___

  socket_mismatch  : ___   (expected ≥ 1 from T04)
  psu_margin       : ___   (expected ≥ 1 from T03, T07)
  bios_flash       : ___   (expected ≥ 1 from T06)
  ram_mismatch     : ___   (expected ≥ 1 from T05)
  bottleneck       : ___   (expected ≥ 1 from T01, T08)
  upgrade_path     : ___   (expected ≥ 1 from T03, T07)
  budget_exceeded  : ___   (expected ≥ 1 from T07)
```

---

## 4 — Comparison Against Alternatives

### 4.1 PCPartPicker Limitations Addressed by NeuroBuilds

| Gap in PCPartPicker | NeuroBuilds Solution |
|---|---|
| No natural language interface | Conversational `intent_node` (LLM, T=0) |
| No budget auto-allocation | `selection_node` allocation ratios |
| No bottleneck estimation | Tier-gap calculation in `compatibility_node` |
| No upgrade path analysis | Platform score (AM5/LGA1851 = future-safe) |
| No explanation of trade-offs | `response_node` narrative prose |
| No persona-aware recommendations | `detectPersona` + weighted `scoreBuild` |

### 4.2 Manual Configuration Limitations Addressed

| Manual Pain Point | NeuroBuilds Solution |
|---|---|
| Hours of cross-referencing specs | Instant compatibility check (7 rules, < 100 ms) |
| TDP-based PSU selection error | Transient-aware safety factor (×1.20) |
| BIOS version research | Automatic BIOS flash advisory by platform + CPU gen |
| Price tracking across retailers | Tavily live web search in `search_node` |
| No objective quality score | 5-dimension `scoreBuild` output |

---

## 5 — Evaluation Notes

- **Mock fallback validity:** When backend is offline, the mock response contains a complete build
  (Ryzen 5 7600X + RTX 4070 + 750W PSU). Validation patterns still fire against the mock text,
  so cache and validation metrics remain valid even without the live FastAPI service.

- **Validation detection method:** Compatibility issues are detected client-side via regex patterns
  applied to the streamed AI response text. Pattern coverage is conservative — only fire on
  unambiguous phrasing — so the recorded `totalCaught` is a lower bound, not an upper bound.

- **Cache TTL parameters:** YouTube = 24 h (sessionStorage), GNews = 24 h / 1 h if rate-limited
  (localStorage). Hit ratios therefore improve across repeated test sessions for the same hardware
  or region. Record hit ratios both at session start (cold) and after warm-up.

- **Scoring engine:** `scoreBuild` is not yet wired into any live UI component (`scoringEngine.ts`
  exists as a utility). Score data must be generated programmatically for thesis charts. Example:
  ```typescript
  import { scoreBuild } from './src/utils/scoringEngine';
  // pass an ActiveBuild object from a test session
  const scores = scoreBuild(mockBuild, 'gaming');
  ```
