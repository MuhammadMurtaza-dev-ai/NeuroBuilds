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
import CyberSelect from '../CyberSelect';

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
}

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

export default function LocationSelector({ country, value, onChange }: Props) {
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
            <CyberSelect
              value={value.province}
              onChange={handleProvinceChange}
              options={provinces.map(p => ({ value: p, label: p }))}
              placeholder="Select Province..."
              className="w-full"
            />
          </FieldWrapper>

          {/* City */}
          <FieldWrapper label="City">
            <CyberSelect
              value={value.city}
              onChange={handleCityChange}
              options={cities.map(c => ({ value: c, label: c }))}
              placeholder={value.province ? 'Select City...' : 'Waiting for Province...'}
              disabled={!value.province}
              className="w-full"
            />
          </FieldWrapper>

          {/* Area — always occupies the 3rd column to prevent layout shift */}
          {(value.city && !hasAreas)
            ? <CityWideBanner city={value.city} />
            : (
              <FieldWrapper label="Area / Neighbourhood">
                <CyberSelect
                  value={value.area}
                  onChange={handleAreaChange}
                  options={areas.map(a => ({ value: a, label: a }))}
                  placeholder={value.city ? 'No Areas Available...' : 'Waiting for City...'}
                  disabled={!value.city || !hasAreas}
                  className="w-full"
                />
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
          <CyberSelect
            value={value.province}
            onChange={handleStateChange}
            options={states.map(s => ({ value: s, label: s }))}
            placeholder="Select State..."
            className="w-full"
          />
        </FieldWrapper>

        {/* City */}
        <FieldWrapper label="City">
          <CyberSelect
            value={value.city}
            onChange={handleGlobalCityChange}
            options={stateCities.map(c => ({ value: c, label: c }))}
            placeholder={value.province ? 'Select City...' : 'Waiting for Province...'}
            disabled={!value.province}
            className="w-full"
          />
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
