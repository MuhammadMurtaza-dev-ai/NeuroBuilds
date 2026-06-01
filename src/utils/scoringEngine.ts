import type { ActiveBuild } from '../hooks/useAIAssistant';

// ─── Public types ──────────────────────────────────────────────────────────────

export type UserPersona = 'gaming' | 'productivity' | 'budget';

export interface ScoreBreakdown {
  key: string;
  label: string;
  value: number;   // 0–100
  weight: number;  // persona-adjusted fractional weight
  color: string;   // Tailwind text-colour token for bar + label
}

export interface BuildScores {
  performancePerRupee: number;
  compatibilityConfidence: number;
  thermalEfficiency: number;
  upgradePotential: number;
  powerEfficiency: number;
  buildScore: number;
  persona: UserPersona;
  breakdown: ScoreBreakdown[];
}

// ─── Per-persona weight matrices ──────────────────────────────────────────────
// BuildScore = Σ(weight_i × subScore_i)
// Gaming    → GPU fps focus, less upgrade headroom matters
// Productivity → multi-core CPU + RAM, more upgrade potential
// Budget    → price-performance dominates

interface WeightMatrix {
  performancePerRupee: number;
  compatibilityConfidence: number;
  thermalEfficiency: number;
  upgradePotential: number;
  powerEfficiency: number;
}

const PERSONA_WEIGHTS: Record<UserPersona, WeightMatrix> = {
  gaming:       { performancePerRupee: 0.40, compatibilityConfidence: 0.25, thermalEfficiency: 0.20, upgradePotential: 0.05, powerEfficiency: 0.10 },
  productivity: { performancePerRupee: 0.30, compatibilityConfidence: 0.25, thermalEfficiency: 0.15, upgradePotential: 0.20, powerEfficiency: 0.10 },
  budget:       { performancePerRupee: 0.45, compatibilityConfidence: 0.25, thermalEfficiency: 0.10, upgradePotential: 0.10, powerEfficiency: 0.10 },
};

// ─── Utility ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

function spec(specs: Record<string, string> | undefined, key: string): string {
  return specs?.[key] ?? '';
}

// Extracts the first decimal number from a string (e.g. "5.3 GHz" → 5.3)
function parseNum(val: string): number {
  const m = val.match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

// ─── Component-level metric extractors ────────────────────────────────────────

function cpuPerfIndex(build: ActiveBuild): number {
  const cpu = build.cpu;
  if (!cpu) return 0;
  const cores     = parseNum(spec(cpu.specs, 'cores'))       || 4;
  const boostGHz  = parseNum(spec(cpu.specs, 'boost_clock')) || 3.5;
  // Reference ceiling: 16 cores @ 6.0 GHz ≈ 100
  const coreScore  = clamp((cores / 16) * 100);
  const clockScore = clamp((boostGHz / 6.0) * 100);
  return coreScore * 0.55 + clockScore * 0.45;
}

function gpuPerfIndex(build: ActiveBuild): number {
  const gpu = build.gpu;
  if (!gpu) return 0;
  const cudaCores = parseNum(spec(gpu.specs, 'cuda_cores'));
  const vramGB    = parseNum(spec(gpu.specs, 'vram'));
  const tdp       = gpu.tdp ?? 0;

  if (cudaCores > 0) {
    // Ceiling: RTX 4090 = 16 384 CUDA cores
    const cudaScore = clamp((cudaCores / 16_384) * 100);
    const vramScore = clamp((vramGB / 24) * 100);
    return cudaScore * 0.70 + vramScore * 0.30;
  }
  // TDP proxy when CUDA core count absent (300 W ≈ flagship ceiling)
  const tdpScore  = clamp((tdp / 300) * 100);
  const vramScore = vramGB > 0 ? clamp((vramGB / 24) * 100) : tdpScore;
  return tdpScore * 0.65 + vramScore * 0.35;
}

function ramCapacityScore(build: ActiveBuild): number {
  if (!build.ram) return 0;
  const gb = parseNum(spec(build.ram.specs, 'capacity'));
  // 64 GB = 100 for workstation context; 32 GB ≈ 75
  return clamp((gb / 64) * 100);
}

// Maps 80+ tier string to an approximate efficiency percentage
function psuEfficiencyScore(build: ActiveBuild): number {
  const eff = spec(build.psu?.specs, 'efficiency').toLowerCase();
  if (eff.includes('titanium')) return 97;
  if (eff.includes('platinum')) return 92;
  if (eff.includes('gold'))     return 85;
  if (eff.includes('silver'))   return 78;
  if (eff.includes('bronze'))   return 72;
  return 60;
}

// ─── Five sub-score calculators ───────────────────────────────────────────────

function calcPerformancePerRupee(build: ActiveBuild, persona: UserPersona): number {
  const totalPrice = Object.values(build).reduce(
    (sum, c) => sum + (c && typeof c === 'object' && 'price' in c ? (c.price ?? 0) : 0),
    0,
  );
  if (totalPrice === 0) return 0;

  const cpuIdx = cpuPerfIndex(build);
  const gpuIdx = gpuPerfIndex(build);
  const ramIdx = ramCapacityScore(build);

  let rawPerf: number;
  switch (persona) {
    case 'gaming':
      rawPerf = gpuIdx * 0.65 + cpuIdx * 0.30 + ramIdx * 0.05;
      // CPU bottleneck penalty: if CPU lags GPU by >25 pts
      if (cpuIdx < gpuIdx - 25) rawPerf *= 0.90;
      break;
    case 'productivity':
      rawPerf = cpuIdx * 0.55 + ramIdx * 0.30 + gpuIdx * 0.15;
      break;
    case 'budget':
    default:
      rawPerf = (cpuIdx + gpuIdx) / 2;
  }

  // Normalise against reference budgets (USD); at the reference, rawPerf × 0.75 ≈ good score
  const refBudget = persona === 'productivity' ? 1200 : persona === 'budget' ? 600 : 1000;
  return clamp(rawPerf * (refBudget / totalPrice) * 0.75);
}

function calcCompatibilityConfidence(build: ActiveBuild): number {
  let checks = 0;
  let passed = 0;

  // CPU ↔ Motherboard socket match
  const cpuSocket = spec(build.cpu?.specs, 'socket').toLowerCase();
  const mbSocket  = spec(build.motherboard?.specs, 'socket').toLowerCase();
  if (cpuSocket && mbSocket) {
    checks++;
    if (cpuSocket === mbSocket) passed++;
  }

  // RAM generation ↔ Motherboard supported memory (DDR4/DDR5)
  const ramSpeed = spec(build.ram?.specs, 'speed').toLowerCase();
  const mbMaxMem = spec(build.motherboard?.specs, 'max_memory').toLowerCase();
  if (ramSpeed && mbMaxMem) {
    checks++;
    const ramGen = ramSpeed.match(/ddr\d/)?.[0] ?? '';
    if (ramGen && mbMaxMem.includes(ramGen)) passed++;
  }

  // PSU power budget: must cover CPU TDP + GPU TDP + 150 W system buffer
  const cpuTdp    = build.cpu?.tdp;
  const gpuTdp    = build.gpu?.tdp;
  const psuRating = build.psu?.rating;
  if (cpuTdp !== undefined && gpuTdp !== undefined && psuRating !== undefined) {
    checks++;
    if (psuRating >= cpuTdp + gpuTdp + 150) passed++;
  }

  // Not enough data to check → return neutral
  if (checks === 0) return 60;
  return clamp((passed / checks) * 100);
}

function calcThermalEfficiency(build: ActiveBuild): number {
  // PSU 80+ tier score normalised to 0–100
  const effRaw = psuEfficiencyScore(build); // 60–97
  const normalizedEff = clamp(((effRaw - 60) / 37) * 100);

  const cpuTdp    = build.cpu?.tdp  ?? 0;
  const gpuTdp    = build.gpu?.tdp  ?? 0;
  const psuRating = build.psu?.rating;

  if (!psuRating) return clamp(normalizedEff * 0.5 + 50 * 0.5);

  // Load fraction; ideal thermal headroom is >25 %
  const load = (cpuTdp + gpuTdp + 150) / psuRating;
  let headroomScore: number;
  if      (load <= 0.60) headroomScore = 100;
  else if (load <= 0.75) headroomScore = 85;
  else if (load <= 0.90) headroomScore = 65;
  else if (load <= 1.00) headroomScore = 30;
  else                   headroomScore = 0;

  return clamp(normalizedEff * 0.40 + headroomScore * 0.60);
}

function calcUpgradePotential(build: ActiveBuild): number {
  let score = 60; // neutral baseline

  // RAM slot count
  const memSlots = parseNum(spec(build.motherboard?.specs, 'memory_slots'));
  if (memSlots > 0) score += memSlots >= 4 ? 20 : memSlots === 2 ? 5 : 0;

  // Max installed memory ceiling
  const maxMemGB = parseNum(spec(build.motherboard?.specs, 'max_memory'));
  if (maxMemGB > 0) score += maxMemGB >= 128 ? 15 : maxMemGB >= 64 ? 8 : 2;

  // Socket longevity: AM5/LGA1851 platforms have multi-generation CPU support
  const socket = spec(build.cpu?.specs, 'socket').toUpperCase();
  if (socket) {
    const MODERN  = ['AM5', 'LGA1851', 'LGA1700', 'TR5'];
    const MATURE  = ['AM4', 'LGA1200', 'TR4', 'EPYC'];
    if (MODERN.includes(socket))  score += 15;
    else if (MATURE.includes(socket)) score += 5;
  }

  return clamp(score);
}

function calcPowerEfficiency(build: ActiveBuild): number {
  const cpuTdp    = build.cpu?.tdp  ?? 0;
  const gpuTdp    = build.gpu?.tdp  ?? 0;
  const psuRating = build.psu?.rating;

  if (!psuRating) return 60;

  const load = (cpuTdp + gpuTdp + 150) / psuRating;

  // Optimum operating band: 50–75 % PSU load (peak efficiency curve)
  if (load >= 0.50 && load <= 0.75) return 100;
  if (load >= 0.40 && load <  0.50) return 82;
  if (load >  0.75 && load <= 0.90) return 72;
  if (load >  0.90 && load <= 1.00) return 38;
  if (load >  1.00)                 return clamp(100 - (load - 1) * 200, 0, 18);
  // < 40 % load: PSU is over-provisioned (operates below efficiency peak)
  return clamp(50 + load * 60);
}

// ─── Persona auto-detection ───────────────────────────────────────────────────

export function detectPersona(build: ActiveBuild): UserPersona {
  const totalPrice = Object.values(build).reduce(
    (s, c) => s + (c && typeof c === 'object' && 'price' in c ? (c.price ?? 0) : 0),
    0,
  );
  const cpuCores = parseNum(spec(build.cpu?.specs, 'cores'));
  const gpuTdp   = build.gpu?.tdp ?? 0;

  if (totalPrice > 0 && totalPrice < 650) return 'budget';
  if (cpuCores >= 8 && gpuTdp < 150)      return 'productivity';
  return 'gaming';
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function scoreBuild(build: ActiveBuild, persona?: UserPersona): BuildScores {
  const resolvedPersona = persona ?? detectPersona(build);
  const w = PERSONA_WEIGHTS[resolvedPersona];

  const performancePerRupee     = Math.round(calcPerformancePerRupee(build, resolvedPersona));
  const compatibilityConfidence = Math.round(calcCompatibilityConfidence(build));
  const thermalEfficiency       = Math.round(calcThermalEfficiency(build));
  const upgradePotential        = Math.round(calcUpgradePotential(build));
  const powerEfficiency         = Math.round(calcPowerEfficiency(build));

  const buildScore = Math.round(
    performancePerRupee     * w.performancePerRupee     +
    compatibilityConfidence * w.compatibilityConfidence +
    thermalEfficiency       * w.thermalEfficiency       +
    upgradePotential        * w.upgradePotential        +
    powerEfficiency         * w.powerEfficiency,
  );

  const breakdown: ScoreBreakdown[] = [
    { key: 'performancePerRupee',     label: 'PERF / VALUE',  value: performancePerRupee,     weight: w.performancePerRupee,     color: 'text-primary'    },
    { key: 'compatibilityConfidence', label: 'COMPAT.',       value: compatibilityConfidence,  weight: w.compatibilityConfidence, color: 'text-green-400'  },
    { key: 'thermalEfficiency',       label: 'THERMAL EFF.',  value: thermalEfficiency,        weight: w.thermalEfficiency,       color: 'text-orange-400' },
    { key: 'upgradePotential',        label: 'UPGRADE POT.',  value: upgradePotential,         weight: w.upgradePotential,        color: 'text-blue-400'   },
    { key: 'powerEfficiency',         label: 'POWER EFF.',    value: powerEfficiency,          weight: w.powerEfficiency,         color: 'text-yellow-400' },
  ];

  return {
    performancePerRupee,
    compatibilityConfidence,
    thermalEfficiency,
    upgradePotential,
    powerEfficiency,
    buildScore,
    persona: resolvedPersona,
    breakdown,
  };
}
