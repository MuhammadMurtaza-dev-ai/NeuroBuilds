/**
 * LocationSelector — cascading Province → City → Area dropdowns.
 *
 * Pakistan: 3-tier with geo data from pakistanGeoLocations.
 * Other countries: 2-tier (State/Province → City) from globalLocations.
 *
 * Guarantees:
 *  - Province change → city & area reset to "" synchronously.
 *  - City change    → area resets to "" synchronously.
 *  - Cities without geo-areas show an inline "City-wide search active" banner
 *    instead of a broken empty selector (3rd column always occupies space).
 */

import {
  getPakistanProvinces,
  getCitiesForProvince,
  getAreasForCity,
} from '../../data/pakistanGeoLocations';
import { GLOBAL_LOCATIONS } from '../../data/globalLocations';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LocationValue {
  province: string;
  city: string;
  area: string;
}

interface Props {
  country: string;
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  selectClassName?: string;
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const DEFAULT_SELECT_CLS =
  'w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl ' +
  'font-mono text-sm text-white ' +
  'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary/50 ' +
  'disabled:opacity-40 disabled:cursor-not-allowed ' +
  'transition-colors duration-150 cursor-pointer';

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldWrapper({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-gray-500 px-0.5 font-mono tracking-wide uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}

function CityWideBanner({ city }: { city: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-gray-500 px-0.5 font-mono tracking-wide uppercase">
        Area / Neighbourhood
      </label>
      <div className="w-full px-3 py-2 bg-primary/5 border border-primary/20 rounded-xl text-xs text-primary/70 font-mono flex items-center gap-2">
        <span className="text-primary">◈</span>
        City-wide search active
        {city && (
          <span className="text-gray-500 ml-auto truncate">{city}</span>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LocationSelector({ country, value, onChange, selectClassName }: Props) {
  const cls = selectClassName ?? DEFAULT_SELECT_CLS;
  const isPakistan = country === 'Pakistan';

  // ── Pakistan path — 3 dependent tiers ─────────────────────────────────────
  if (isPakistan) {
    const provinces = getPakistanProvinces();
    const cities    = value.province ? getCitiesForProvince(value.province).map(c => c.name) : [];
    const areas     = value.province && value.city
      ? getAreasForCity(value.province, value.city).map(a => a.name)
      : [];
    const hasAreas = areas.length > 0;

    const handleProvinceChange = (province: string) =>
      onChange({ province, city: '', area: '' });

    const handleCityChange = (city: string) =>
      onChange({ province: value.province, city, area: '' });

    const handleAreaChange = (area: string) =>
      onChange({ ...value, area });

    return (
      <div className="flex flex-col gap-3 w-full">

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">

          {/* Province */}
          <FieldWrapper label="Province / Territory">
            <select
              value={value.province}
              onChange={e => handleProvinceChange(e.target.value)}
              className={cls}
            >
              <option value="" disabled hidden>Select Province...</option>
              {provinces.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </FieldWrapper>

          {/* City */}
          <FieldWrapper label="City">
            <select
              value={value.city}
              onChange={e => handleCityChange(e.target.value)}
              disabled={!value.province}
              className={cls}
            >
              {!value.province
                ? <option value="" disabled hidden>Waiting for Province...</option>
                : <option value="" disabled hidden>Select City...</option>
              }
              {cities.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FieldWrapper>

          {/* Area — always occupies the 3rd column to prevent layout shift */}
          {(value.city && !hasAreas)
            ? <CityWideBanner city={value.city} />
            : (
              <FieldWrapper label="Area / Neighbourhood">
                <select
                  value={value.area}
                  onChange={e => handleAreaChange(e.target.value)}
                  disabled={!value.city || !hasAreas}
                  className={cls}
                >
                  {!value.city
                    ? <option value="" disabled hidden>Waiting for City...</option>
                    : <option value="" disabled hidden>No Areas Available...</option>
                  }
                  {areas.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </FieldWrapper>
            )
          }

        </div>

        {/* Live save-as preview */}
        {value.city && (
          <p className="text-xs text-gray-500 px-0.5 font-mono">
            Saving as:{' '}
            <span className="text-gray-400">
              {[value.area, value.city, value.province, country]
                .filter(Boolean)
                .join(', ')}
            </span>
          </p>
        )}

      </div>
    );
  }

  // ── Non-Pakistan path — State → City (no Area tier) ───────────────────────
  const stateMap = GLOBAL_LOCATIONS[country] ?? {};
  const states   = Object.keys(stateMap);
  const stateCities: string[] = value.province ? (stateMap[value.province] ?? []) : [];

  const handleStateChange = (province: string) =>
    onChange({ province, city: '', area: '' });

  const handleGlobalCityChange = (city: string) =>
    onChange({ province: value.province, city, area: '' });

  return (
    <div className="flex flex-col gap-3 w-full">

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">

        {/* State / Province */}
        <FieldWrapper label="State / Province">
          <select
            value={value.province}
            onChange={e => handleStateChange(e.target.value)}
            className={cls}
          >
            <option value="" disabled hidden>Select State...</option>
            {states.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </FieldWrapper>

        {/* City */}
        <FieldWrapper label="City">
          <select
            value={value.city}
            onChange={e => handleGlobalCityChange(e.target.value)}
            disabled={!value.province}
            className={cls}
          >
            {!value.province
              ? <option value="" disabled hidden>Waiting for Province...</option>
              : <option value="" disabled hidden>Select City...</option>
            }
            {stateCities.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </FieldWrapper>

      </div>

      {value.city && (
        <p className="text-xs text-gray-500 px-0.5 font-mono">
          Saving as:{' '}
          <span className="text-gray-400">
            {[value.city, value.province, country].filter(Boolean).join(', ')}
          </span>
        </p>
      )}

    </div>
  );
}
