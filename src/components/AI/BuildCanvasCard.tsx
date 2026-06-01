import { useMemo } from 'react';
import type { ActiveBuild, BuildComponent } from '../../hooks/useAIAssistant';
import { scoreBuild } from '../../utils/scoringEngine';
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
              className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/30 border border-white/10 text-gray-400"
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
  'text-primary':    'bg-primary/75',
  'text-green-400':  'bg-green-400/75',
  'text-orange-400': 'bg-orange-400/75',
  'text-blue-400':   'bg-blue-400/75',
  'text-yellow-400': 'bg-yellow-400/75',
};

function BuildScorePanel({ scores }: { scores: BuildScores }) {
  const scoreColor =
    scores.buildScore >= 80 ? 'text-primary' :
    scores.buildScore >= 60 ? 'text-yellow-400' : 'text-orange-400';

  return (
    <div className="space-y-2.5">
      {/* Aggregate row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-xs text-gray-600">analytics</span>
          <span className="text-[9px] font-mono text-gray-600 tracking-widest">SCORE ANALYSIS</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-[9px] font-mono uppercase tracking-widest ${scoreColor} opacity-60`}>
            {scores.persona}
          </span>
          <span className={`text-lg font-bold font-mono leading-none ${scoreColor}`}>
            {scores.buildScore}
          </span>
          <span className="text-[9px] font-mono text-gray-600">/100</span>
        </div>
      </div>

      {/* Per-dimension bars */}
      {scores.breakdown.map(item => (
        <div key={item.key}>
          <div className="flex justify-between items-center mb-0.5">
            <span className={`text-[8px] font-mono tracking-wider ${item.color}`}>
              {item.label}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-mono text-gray-700">
                ×{item.weight.toFixed(2)}
              </span>
              <span className={`text-[9px] font-mono font-bold ${item.color}`}>
                {item.value}
              </span>
            </div>
          </div>
          <div className="h-1 bg-black/50 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${BAR_BG[item.color] ?? 'bg-white/40'}`}
              style={{ width: `${item.value}%` }}
            />
          </div>
        </div>
      ))}
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

  const scores = useMemo(
    () => (hasBuildData ? scoreBuild(activeBuild) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(activeBuild)],
  );

  return (
    <div className="h-full glass-panel rounded-bento overflow-hidden border border-white/5 flex flex-col">
      {/* Header */}
      <div className="p-5 border-b border-white/5 bg-black/20 shrink-0">
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
          <div className="flex flex-col items-center justify-center h-full gap-3 py-10">
            <span className="material-symbols-outlined text-5xl text-gray-700">
              construction
            </span>
            <div className="text-center">
              <p className="text-[10px] font-mono text-gray-600 tracking-wider">
                AWAITING BUILD DATA
              </p>
              <p className="text-[9px] font-mono text-gray-700 mt-1 leading-4">
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
                <div className="h-px bg-white/5 my-1" />
                <BuildScorePanel scores={scores} />
              </>
            )}
          </>
        )}
      </div>

      {/* Footer — power budget + total cost */}
      {hasBuildData && (
        <div className="p-4 border-t border-white/5 bg-black/10 shrink-0 space-y-3">
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
