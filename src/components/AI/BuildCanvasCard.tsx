import { useMemo } from 'react';
import type { ActiveBuild, BuildComponent } from '../../hooks/useAIAssistant';
import { scoreBuild, detectPersona } from '../../utils/scoringEngine';
import type { BuildScores } from '../../utils/scoringEngine';

interface Props {
  activeBuild: ActiveBuild;
}

interface RowConfig {
  key: keyof ActiveBuild;
  label: string;
  icon: string;
  accent: string;
  glow: string;
}

const ROWS: RowConfig[] = [
  { key: 'cpu',         label: 'CPU',         icon: 'memory',            accent: 'text-primary',        glow: 'border-primary/30 bg-primary/5'         },
  { key: 'gpu',         label: 'GPU',          icon: 'videogame_asset',   accent: 'text-accent-purple',  glow: 'border-accent-purple/30 bg-accent-purple/5' },
  { key: 'motherboard', label: 'MOTHERBOARD',  icon: 'developer_board',   accent: 'text-blue-400',       glow: 'border-blue-400/30 bg-blue-400/5'       },
  { key: 'ram',         label: 'RAM',          icon: 'storage',           accent: 'text-green-400',      glow: 'border-green-400/30 bg-green-400/5'     },
  { key: 'psu',         label: 'PSU',          icon: 'bolt',              accent: 'text-yellow-400',     glow: 'border-yellow-400/30 bg-yellow-400/5'   },
];

// ─── Component row ─────────────────────────────────────────────────────────────

function ComponentRow({ row, component }: { row: RowConfig; component: BuildComponent }) {
  const specEntries = component.specs ? Object.entries(component.specs).slice(0, 3) : [];

  return (
    <div className={`rounded-xl p-3 border transition-all hover:scale-[1.01] ${row.glow}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`material-symbols-outlined text-base leading-none ${row.accent}`}>
          {row.icon}
        </span>
        <span className={`text-[9px] font-bold tracking-[0.15em] font-mono ${row.accent}`}>
          {row.label}
        </span>
        {component.price !== undefined && (
          <span className="ml-auto text-[10px] font-mono text-gray-400">
            ${component.price.toLocaleString()}
          </span>
        )}
      </div>

      <p className="text-sm font-semibold text-white leading-tight mb-2">{component.name}</p>

      {specEntries.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {specEntries.map(([, v]) => (
            <span
              key={v}
              className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/8 dark:bg-black/30 border border-black/10 dark:border-white/10 text-gray-400"
            >
              {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Power badge ───────────────────────────────────────────────────────────────

function PowerBadge({ activeBuild }: { activeBuild: ActiveBuild }) {
  const cpuTdp = activeBuild.cpu?.tdp;
  const gpuTdp = activeBuild.gpu?.tdp;
  const psuRating = activeBuild.psu?.rating;

  if (cpuTdp === undefined || gpuTdp === undefined || psuRating === undefined) {
    return (
      <p className="text-[9px] font-mono text-gray-600 text-center">
        CPU · GPU · PSU required for power check
      </p>
    );
  }

  const required = cpuTdp + gpuTdp + 150; // +150 W safety buffer
  const safe = psuRating >= required;
  const shortfall = required - psuRating;

  return (
    <div
      className={`rounded-xl p-3 border text-center ${
        safe
          ? 'border-green-500/40 bg-green-500/5 shadow-[0_0_12px_rgba(34,197,94,0.15)]'
          : 'border-amber-500/40 bg-amber-500/5'
      }`}
    >
      <div
        className={`text-[10px] font-mono font-bold tracking-wider mb-1 ${
          safe ? 'text-green-400' : 'text-amber-400 animate-pulse'
        }`}
      >
        {safe ? '✓ POWER BUDGET VALIDATED' : `⚠ PSU CRITICALLY LOW`}
      </div>
      <div className="text-[9px] font-mono text-gray-500 leading-4">
        {required}W required ({cpuTdp}W + {gpuTdp}W + 150W buffer)
        {!safe && (
          <span className="text-amber-500/80"> · +{shortfall}W needed</span>
        )}
      </div>
    </div>
  );
}

// ─── Score visualisation ───────────────────────────────────────────────────────

const BAR_BG: Record<string, string> = {
  'text-primary':    'bg-primary/80',
  'text-green-400':  'bg-green-400/80',
  'text-orange-400': 'bg-orange-400/80',
  'text-blue-400':   'bg-blue-400/80',
  'text-yellow-400': 'bg-yellow-400/80',
};

const BAR_GLOW: Record<string, string> = {
  'text-primary':    '0 0 6px rgba(13,242,242,0.5)',
  'text-green-400':  '0 0 6px rgba(74,222,128,0.5)',
  'text-orange-400': '0 0 6px rgba(251,146,60,0.5)',
  'text-blue-400':   '0 0 6px rgba(96,165,250,0.5)',
  'text-yellow-400': '0 0 6px rgba(250,204,21,0.5)',
};

function CircularGauge({ score }: { score: number }) {
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;

  const strokeColor =
    score >= 80 ? '#0df2f2' :
    score >= 60 ? '#facc15' : '#f97316';

  const glowColor =
    score >= 80 ? 'rgba(13,242,242,0.55)' :
    score >= 60 ? 'rgba(250,204,21,0.55)' : 'rgba(249,115,22,0.55)';

  const label =
    score >= 80 ? 'EXCELLENT' :
    score >= 60 ? 'GOOD'      : 'FAIR';

  return (
    <svg width="112" height="112" viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
      {/* Ambient outer ring */}
      <circle cx="50" cy="50" r={r + 7} fill="none" stroke={strokeColor} strokeWidth="0.5" opacity="0.12" />
      {/* Track */}
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
      {/* Quarter-tick marks */}
      {[0, 25, 50, 75, 100].map(tick => {
        const angle = (tick / 100) * 2 * Math.PI - Math.PI / 2;
        const i = r - 5;
        const o = r + 1;
        return (
          <line
            key={tick}
            x1={50 + i * Math.cos(angle)} y1={50 + i * Math.sin(angle)}
            x2={50 + o * Math.cos(angle)} y2={50 + o * Math.sin(angle)}
            stroke="rgba(255,255,255,0.18)" strokeWidth="1.2"
          />
        );
      })}
      {/* Progress arc */}
      <circle
        cx="50" cy="50" r={r}
        fill="none"
        stroke={strokeColor}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
        transform="rotate(-90,50,50)"
        style={{ filter: `drop-shadow(0 0 7px ${glowColor})` }}
      />
      {/* Score */}
      <text
        x="50" y="44"
        textAnchor="middle"
        fill={strokeColor}
        fontSize="22"
        fontFamily="'Courier New',monospace"
        fontWeight="bold"
        style={{ filter: `drop-shadow(0 0 5px ${glowColor})` }}
      >
        {score}
      </text>
      <text x="50" y="55" textAnchor="middle" fill="rgba(107,114,128,1)" fontSize="7.5" fontFamily="'Courier New',monospace">
        /100
      </text>
      <text x="50" y="66" textAnchor="middle" fill={strokeColor} fontSize="5.8" fontFamily="'Courier New',monospace" opacity="0.65" letterSpacing="1.5">
        {label}
      </text>
    </svg>
  );
}

const PERSONA_STYLE: Record<string, string> = {
  gaming:       'text-primary border-primary/30 bg-primary/10',
  productivity: 'text-accent-purple border-accent-purple/30 bg-accent-purple/10',
  budget:       'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
};

function BuildScorePanel({ scores }: { scores: BuildScores }) {
  return (
    <div className="space-y-3">
      {/* Header + persona badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-xs text-gray-600">analytics</span>
          <span className="text-[9px] font-mono text-gray-600 tracking-widest">BUILD SCORE</span>
        </div>
        <span className={`text-[8px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded border ${PERSONA_STYLE[scores.persona]}`}>
          {scores.persona}
        </span>
      </div>

      {/* Circular gauge */}
      <div className="flex justify-center py-0.5">
        <CircularGauge score={scores.buildScore} />
      </div>

      {/* Per-dimension bars */}
      <div className="space-y-2">
        {scores.breakdown.map(item => (
          <div key={item.key}>
            <div className="flex justify-between items-center mb-1">
              <span className={`text-[8px] font-mono tracking-wider ${item.color}`}>
                {item.label}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] font-mono text-gray-700">×{item.weight.toFixed(2)}</span>
                <span className={`text-[9px] font-mono font-bold ${item.color}`}>{item.value}</span>
              </div>
            </div>
            <div className="h-2 bg-black/10 dark:bg-black/40 rounded-full overflow-hidden border border-black/[0.06] dark:border-white/[0.04]">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${BAR_BG[item.color] ?? 'bg-white/40'}`}
                style={{ width: `${item.value}%`, boxShadow: BAR_GLOW[item.color] }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

export default function BuildCanvasCard({ activeBuild }: Props) {
  const hasBuildData = ROWS.some(r => activeBuild[r.key] !== undefined);

  const totalCost = ROWS.reduce(
    (sum, { key }) => sum + (activeBuild[key]?.price ?? 0),
    0,
  );

  const scores = useMemo(() => {
    if (!hasBuildData) return null;
    const persona = detectPersona(activeBuild);
    return scoreBuild(activeBuild, persona);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(activeBuild)]);

  return (
    <div className="h-full glass-panel rounded-bento overflow-hidden border border-border-glass flex flex-col">
      {/* Header */}
      <div className="p-5 border-b border-border-glass bg-black/5 dark:bg-black/20 shrink-0">
        <h2 className="text-[10px] font-bold text-gray-400 tracking-[0.15em] font-mono flex items-center gap-2">
          <span className="material-symbols-outlined text-sm text-primary">
            precision_manufacturing
          </span>
          CONTEXTUAL RETRIEVAL ENGINE
        </h2>
        {hasBuildData && (
          <p className="text-[9px] font-mono text-gray-600 mt-1 tracking-wide">
            AI-ASSISTED FRAMEWORK · BUDGET-CONSTRAINED BUILDS
          </p>
        )}
      </div>

      {/* Component list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-0">
        {!hasBuildData ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-10">
            <div className="relative">
              <span className="material-symbols-outlined text-5xl text-gray-700 opacity-30 select-none">
                precision_manufacturing
              </span>
              <span
                className="absolute inset-0 flex items-center justify-center material-symbols-outlined text-5xl text-primary opacity-[0.07] blur-sm select-none"
                aria-hidden="true"
              >
                precision_manufacturing
              </span>
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-[11px] font-mono font-bold text-gray-500 tracking-[0.2em]">
                NO ACTIVE BUILD
              </p>
              <p className="text-[10px] font-mono text-gray-600 tracking-widest">
                COMPILED
              </p>
              <div className="w-8 h-px bg-primary/20 mx-auto my-2" />
              <p className="text-[9px] font-mono text-gray-700 leading-5">
                Describe your budget &amp; use case<br />to receive guided recommendations.
              </p>
            </div>
          </div>
        ) : (
          <>
            {ROWS.map(row => {
              const component = activeBuild[row.key];
              if (!component) return null;
              return <ComponentRow key={row.key} row={row} component={component} />;
            })}

            {scores && (
              <>
                <div className="h-px bg-black/8 dark:bg-white/5 my-1" />
                <BuildScorePanel scores={scores} />
              </>
            )}
          </>
        )}
      </div>

      {/* Footer — power budget + total cost */}
      {hasBuildData && (
        <div className="p-4 border-t border-border-glass bg-black/3 dark:bg-black/10 shrink-0 space-y-3">
          <PowerBadge activeBuild={activeBuild} />

          {totalCost > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-gray-500 tracking-wider">
                EST. TOTAL
              </span>
              <span className="text-sm font-bold font-mono text-white">
                ${totalCost.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
