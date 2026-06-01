/**
 * Pakistan hierarchical geo-location dataset.
 *
 * Structure: Country → Province → City → Area
 *
 * Provincial / Federal capitals carry per-area lat/lng so the cascading
 * fallback search can perform radius queries (Tier 2) without storing
 * coordinates on every Firestore listing document.
 *
 * Minor cities that are not provincial capitals have an empty `areas` array —
 * the LocationSelector gracefully hides the Area dropdown in that case.
 *
 * Coordinates are approximate centroids sourced from OpenStreetMap / Nominatim.
 * Radius search accuracy is ±500 m, which is well within the 5 km default radius.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeoArea {
  name: string;
  lat: number;
  lng: number;
}

export interface GeoCity {
  name: string;
  /** City centroid — used as fallback when no matching area is found. */
  lat: number;
  lng: number;
  areas: GeoArea[];
}

export interface Province {
  name: string;
  cities: GeoCity[];
}

export interface PakistanGeoData {
  country: string;
  provinces: Province[];
}

// ─── Dataset ─────────────────────────────────────────────────────────────────

export const PK_GEO_DATA: PakistanGeoData = {
  country: 'Pakistan',
  provinces: [

    // ── Punjab ────────────────────────────────────────────────────────────────
    {
      name: 'Punjab',
      cities: [
        {
          name: 'Lahore',
          lat: 31.5204,
          lng: 74.3587,
          areas: [
            { name: 'Gulberg',           lat: 31.5111, lng: 74.3353 },
            { name: 'DHA Phase 1',       lat: 31.4697, lng: 74.3861 },
            { name: 'DHA Phase 5',       lat: 31.4507, lng: 74.3867 },
            { name: 'DHA Phase 6',       lat: 31.4255, lng: 74.3884 },
            { name: 'Johar Town',        lat: 31.4697, lng: 74.2738 },
            { name: 'Model Town',        lat: 31.4961, lng: 74.3097 },
            { name: 'Bahria Town',       lat: 31.3648, lng: 74.1856 },
            { name: 'Cantt',             lat: 31.5315, lng: 74.3527 },
            { name: 'Allama Iqbal Town', lat: 31.5188, lng: 74.2847 },
            { name: 'Wapda Town',        lat: 31.4607, lng: 74.2665 },
            { name: 'Garden Town',       lat: 31.5218, lng: 74.3249 },
            { name: 'Shadman',           lat: 31.5400, lng: 74.3228 },
            { name: 'Tariq Garden',      lat: 31.5042, lng: 74.2823 },
            { name: 'Township',          lat: 31.4693, lng: 74.2651 },
            { name: 'Iqbal Town',        lat: 31.5132, lng: 74.3058 },
            { name: 'Samanabad',         lat: 31.5498, lng: 74.3042 },
            { name: 'Faisal Town',       lat: 31.4853, lng: 74.3068 },
            { name: 'Cavalry Ground',    lat: 31.5401, lng: 74.3609 },
            { name: 'Gulshan Ravi',      lat: 31.5523, lng: 74.3297 },
            { name: 'Bahmanabad',        lat: 31.5336, lng: 74.3156 },
          ],
        },
        {
          name: 'Rawalpindi',
          lat: 33.5973,
          lng: 73.0479,
          areas: [
            { name: 'Saddar',            lat: 33.5987, lng: 73.0435 },
            { name: 'Bahria Town',       lat: 33.5553, lng: 72.9745 },
            { name: 'DHA Phase 1',       lat: 33.5362, lng: 73.0960 },
            { name: 'Gulraiz Housing',   lat: 33.6178, lng: 72.9962 },
            { name: 'Westridge',         lat: 33.5891, lng: 73.0210 },
            { name: 'Satellite Town',    lat: 33.6071, lng: 73.0432 },
            { name: 'Chaklala Scheme',   lat: 33.5921, lng: 73.0872 },
            { name: 'Adiala Road',       lat: 33.5462, lng: 72.9897 },
            { name: 'Morgah',            lat: 33.6231, lng: 73.0082 },
            { name: 'Humak',             lat: 33.5798, lng: 73.1310 },
          ],
        },
        {
          name: 'Faisalabad',
          lat: 31.4187,
          lng: 73.0791,
          areas: [
            { name: 'Peoples Colony',    lat: 31.4240, lng: 73.0721 },
            { name: 'Gulberg',           lat: 31.4344, lng: 73.0889 },
            { name: 'Madina Town',       lat: 31.4106, lng: 73.0632 },
            { name: 'Canal Road',        lat: 31.4013, lng: 73.0923 },
            { name: 'Samanabad',         lat: 31.4387, lng: 73.0532 },
            { name: 'Millat Town',       lat: 31.3975, lng: 73.0764 },
            { name: 'D Ground',          lat: 31.4265, lng: 73.0869 },
            { name: 'Jinnah Colony',     lat: 31.4498, lng: 73.0653 },
            { name: 'Susan Road',        lat: 31.4571, lng: 73.0491 },
            { name: 'Ghulam Muhammad Abad', lat: 31.4090, lng: 73.0812 },
          ],
        },
        {
          name: 'Multan',
          lat: 30.1575,
          lng: 71.5249,
          areas: [
            { name: 'Gulgasht Colony',    lat: 30.1820, lng: 71.4732 },
            { name: 'Bosan Road',         lat: 30.1921, lng: 71.4473 },
            { name: 'Cantt',              lat: 30.1893, lng: 71.5134 },
            { name: 'Shah Rukn-e-Alam',   lat: 30.1948, lng: 71.4682 },
            { name: 'New Multan',         lat: 30.1412, lng: 71.4609 },
            { name: 'Gulshan-e-Iqbal',    lat: 30.2135, lng: 71.4878 },
            { name: 'Model Town',         lat: 30.1876, lng: 71.4904 },
            { name: 'Vehari Road',        lat: 30.1638, lng: 71.5602 },
          ],
        },
        { name: 'Sialkot',      lat: 32.4945, lng: 74.5229, areas: [] },
        { name: 'Gujranwala',   lat: 32.1877, lng: 74.1945, areas: [] },
        { name: 'Gujrat',       lat: 32.5738, lng: 74.0878, areas: [] },
        { name: 'Sargodha',     lat: 32.0836, lng: 72.6711, areas: [] },
        { name: 'Bahawalpur',   lat: 29.3956, lng: 71.6836, areas: [] },
        { name: 'Sheikhupura',  lat: 31.7167, lng: 73.9851, areas: [] },
        { name: 'Sahiwal',      lat: 30.6682, lng: 73.1064, areas: [] },
        { name: 'Rahim Yar Khan', lat: 28.4202, lng: 70.2952, areas: [] },
        { name: 'Jhang',        lat: 31.2681, lng: 72.3180, areas: [] },
        { name: 'Kasur',        lat: 31.1178, lng: 74.4476, areas: [] },
        { name: 'Okara',        lat: 30.8091, lng: 73.4454, areas: [] },
        { name: 'Wah Cantt',    lat: 33.8004, lng: 72.7086, areas: [] },
      ],
    },

    // ── Sindh ─────────────────────────────────────────────────────────────────
    {
      name: 'Sindh',
      cities: [
        {
          name: 'Karachi',
          lat: 24.8607,
          lng: 67.0104,
          areas: [
            { name: 'Clifton',           lat: 24.8136, lng: 67.0291 },
            { name: 'DHA Phase 1',       lat: 24.8060, lng: 67.0695 },
            { name: 'DHA Phase 6',       lat: 24.7874, lng: 67.0731 },
            { name: 'Gulshan-e-Iqbal',   lat: 24.9157, lng: 67.0898 },
            { name: 'North Nazimabad',   lat: 24.9413, lng: 67.0528 },
            { name: 'Korangi',           lat: 24.8271, lng: 67.1322 },
            { name: 'Saddar',            lat: 24.8607, lng: 67.0104 },
            { name: 'Bahadurabad',       lat: 24.8850, lng: 67.0610 },
            { name: 'PECHS',             lat: 24.8703, lng: 67.0451 },
            { name: 'Gulistan-e-Johar',  lat: 24.9198, lng: 67.1292 },
            { name: 'Federal B Area',    lat: 24.9282, lng: 67.0717 },
            { name: 'Malir',             lat: 24.8960, lng: 67.1958 },
            { name: 'Scheme 33',         lat: 24.9576, lng: 67.1248 },
            { name: 'Orangi Town',       lat: 24.9551, lng: 67.0091 },
            { name: 'Lyari',             lat: 24.8548, lng: 67.0097 },
            { name: 'Landhi',            lat: 24.8395, lng: 67.1707 },
            { name: 'Surjani Town',      lat: 25.0085, lng: 67.0476 },
            { name: 'Liaquatabad',       lat: 24.9061, lng: 67.0501 },
            { name: 'Nazimabad',         lat: 24.9200, lng: 67.0395 },
            { name: 'Kemari',            lat: 24.8241, lng: 66.9726 },
          ],
        },
        { name: 'Hyderabad',   lat: 25.3960, lng: 68.3578, areas: [] },
        { name: 'Sukkur',      lat: 27.7052, lng: 68.8574, areas: [] },
        { name: 'Larkana',     lat: 27.5570, lng: 68.2214, areas: [] },
        { name: 'Mirpurkhas',  lat: 25.5270, lng: 69.0130, areas: [] },
        { name: 'Nawabshah',   lat: 26.2442, lng: 68.4100, areas: [] },
        { name: 'Thatta',      lat: 24.7481, lng: 67.9196, areas: [] },
        { name: 'Jacobabad',   lat: 28.2769, lng: 68.4511, areas: [] },
        { name: 'Shikarpur',   lat: 27.9553, lng: 68.6379, areas: [] },
      ],
    },

    // ── Khyber Pakhtunkhwa ────────────────────────────────────────────────────
    {
      name: 'Khyber Pakhtunkhwa',
      cities: [
        {
          name: 'Peshawar',
          lat: 34.0151,
          lng: 71.5249,
          areas: [
            { name: 'Hayatabad',       lat: 34.0097, lng: 71.4356 },
            { name: 'University Town', lat: 34.0009, lng: 71.4823 },
            { name: 'Saddar',          lat: 34.0052, lng: 71.5576 },
            { name: 'Cantt',           lat: 34.0155, lng: 71.5621 },
            { name: 'Gulbahar',        lat: 34.0113, lng: 71.5347 },
            { name: 'Regi Model Town', lat: 33.9952, lng: 71.4600 },
            { name: 'Defence Colony',  lat: 34.0031, lng: 71.4901 },
            { name: 'Warsak Road',     lat: 34.0395, lng: 71.4836 },
            { name: 'Kohat Road',      lat: 33.9701, lng: 71.5248 },
            { name: 'Ring Road',       lat: 33.9787, lng: 71.4623 },
            { name: 'Dalazak Road',    lat: 34.0432, lng: 71.5388 },
            { name: 'GT Road',         lat: 34.0328, lng: 71.5897 },
          ],
        },
        { name: 'Abbottabad',        lat: 34.1688, lng: 73.2215, areas: [] },
        { name: 'Mardan',            lat: 34.1982, lng: 72.0404, areas: [] },
        { name: 'Swabi',             lat: 34.1199, lng: 72.4700, areas: [] },
        { name: 'Kohat',             lat: 33.5869, lng: 71.4414, areas: [] },
        { name: 'Nowshera',          lat: 34.0153, lng: 71.9747, areas: [] },
        { name: 'Mansehra',          lat: 34.3289, lng: 73.2009, areas: [] },
        { name: 'Dera Ismail Khan',  lat: 31.8323, lng: 70.9018, areas: [] },
        { name: 'Swat (Mingora)',    lat: 34.7717, lng: 72.3600, areas: [] },
        { name: 'Charsadda',         lat: 34.1480, lng: 71.7302, areas: [] },
      ],
    },

    // ── Balochistan ───────────────────────────────────────────────────────────
    {
      name: 'Balochistan',
      cities: [
        {
          name: 'Quetta',
          lat: 30.1798,
          lng: 66.9945,
          areas: [
            { name: 'Satellite Town',      lat: 30.1976, lng: 67.0208 },
            { name: 'Jinnah Town',         lat: 30.2060, lng: 67.0289 },
            { name: 'Cantt',               lat: 30.1798, lng: 66.9945 },
            { name: 'Civil Lines',         lat: 30.1967, lng: 67.0164 },
            { name: 'Sariab Road',         lat: 30.1725, lng: 66.9768 },
            { name: 'Brewery Road',        lat: 30.2176, lng: 67.0115 },
            { name: 'Quetta Cantonment',   lat: 30.1680, lng: 67.0059 },
            { name: 'Samungli Road',       lat: 30.2036, lng: 66.9699 },
            { name: 'Airport Road',        lat: 30.2432, lng: 66.9448 },
            { name: 'Spini Road',          lat: 30.1589, lng: 67.0392 },
          ],
        },
        { name: 'Gwadar',   lat: 25.1216, lng: 62.3254, areas: [] },
        { name: 'Turbat',   lat: 26.0024, lng: 63.0636, areas: [] },
        { name: 'Khuzdar',  lat: 27.8122, lng: 66.6138, areas: [] },
        { name: 'Hub',      lat: 25.0266, lng: 67.1106, areas: [] },
        { name: 'Zhob',     lat: 31.3419, lng: 69.4479, areas: [] },
        { name: 'Sibi',     lat: 29.5430, lng: 67.8791, areas: [] },
        { name: 'Chaman',   lat: 30.9167, lng: 66.4500, areas: [] },
      ],
    },

    // ── Islamabad Capital Territory ───────────────────────────────────────────
    {
      name: 'Islamabad Capital Territory',
      cities: [
        {
          name: 'Islamabad',
          lat: 33.7215,
          lng: 73.0433,
          areas: [
            { name: 'F-6',         lat: 33.7286, lng: 73.1012 },
            { name: 'F-7',         lat: 33.7295, lng: 73.0929 },
            { name: 'F-8',         lat: 33.7156, lng: 73.1017 },
            { name: 'F-10',        lat: 33.7113, lng: 73.0539 },
            { name: 'F-11',        lat: 33.7046, lng: 73.0353 },
            { name: 'G-9',         lat: 33.6932, lng: 73.0647 },
            { name: 'G-11',        lat: 33.6802, lng: 73.0280 },
            { name: 'G-13',        lat: 33.6642, lng: 73.0165 },
            { name: 'Blue Area',   lat: 33.7220, lng: 73.0830 },
            { name: 'DHA Phase 1', lat: 33.5375, lng: 73.0960 },
            { name: 'DHA Phase 2', lat: 33.5280, lng: 73.1170 },
            { name: 'Bahria Town', lat: 33.5578, lng: 72.9740 },
            { name: 'Bani Gala',   lat: 33.6577, lng: 73.0954 },
            { name: 'I-8',         lat: 33.6880, lng: 73.0827 },
            { name: 'E-11',        lat: 33.7134, lng: 73.0165 },
            { name: 'I-10',        lat: 33.6751, lng: 73.0610 },
            { name: 'H-13',        lat: 33.6491, lng: 73.0082 },
          ],
        },
      ],
    },

    // ── Gilgit-Baltistan ──────────────────────────────────────────────────────
    {
      name: 'Gilgit-Baltistan',
      cities: [
        {
          name: 'Gilgit',
          lat: 35.9221,
          lng: 74.3082,
          areas: [
            { name: 'Jutial',          lat: 35.9232, lng: 74.3115 },
            { name: 'City Centre',     lat: 35.9221, lng: 74.3082 },
            { name: 'Konodas',         lat: 35.9087, lng: 74.3218 },
            { name: 'Airport Road',    lat: 35.9176, lng: 74.3302 },
            { name: 'Aga Khan Road',   lat: 35.9187, lng: 74.3129 },
            { name: 'Nomal',           lat: 35.9421, lng: 74.3488 },
            { name: 'Sultanabad',      lat: 35.9305, lng: 74.2889 },
            { name: 'Barmas',          lat: 35.9012, lng: 74.2966 },
          ],
        },
        { name: 'Skardu',  lat: 35.2971, lng: 75.6333, areas: [] },
        { name: 'Hunza',   lat: 36.3167, lng: 74.6500, areas: [] },
        { name: 'Chilas',  lat: 35.4167, lng: 74.1000, areas: [] },
        { name: 'Ghanche', lat: 35.3839, lng: 76.5500, areas: [] },
        { name: 'Ghizer',  lat: 36.0614, lng: 73.7548, areas: [] },
      ],
    },

    // ── Azad Jammu & Kashmir ──────────────────────────────────────────────────
    {
      name: 'Azad Jammu & Kashmir',
      cities: [
        {
          name: 'Muzaffarabad',
          lat: 34.3626,
          lng: 73.4693,
          areas: [
            { name: 'City Centre',  lat: 34.3626, lng: 73.4693 },
            { name: 'Chattar',      lat: 34.3595, lng: 73.4713 },
            { name: 'Subri',        lat: 34.3487, lng: 73.4821 },
            { name: 'Pattika',      lat: 34.3705, lng: 73.4623 },
            { name: 'Necksotha',    lat: 34.3748, lng: 73.4575 },
            { name: 'Abbas Road',   lat: 34.3612, lng: 73.4756 },
            { name: 'New Town',     lat: 34.3543, lng: 73.4678 },
            { name: 'Old Town',     lat: 34.3660, lng: 73.4712 },
          ],
        },
        { name: 'Mirpur',      lat: 33.1479, lng: 73.7516, areas: [] },
        { name: 'Rawalakot',   lat: 33.8573, lng: 73.7612, areas: [] },
        { name: 'Bagh',        lat: 33.9765, lng: 73.7739, areas: [] },
        { name: 'Kotli',       lat: 33.5136, lng: 73.9018, areas: [] },
        { name: 'Bhimber',     lat: 32.9738, lng: 74.0673, areas: [] },
      ],
    },

  ],
};

// ─── Convenience helpers ──────────────────────────────────────────────────────

export const getPakistanProvinces = (): string[] =>
  PK_GEO_DATA.provinces.map(p => p.name);

export const getCitiesForProvince = (province: string): GeoCity[] =>
  PK_GEO_DATA.provinces.find(p => p.name === province)?.cities ?? [];

export const getAreasForCity = (province: string, city: string): GeoArea[] =>
  getCitiesForProvince(province).find(c => c.name === city)?.areas ?? [];

export const findCityNode = (cityName: string): GeoCity | undefined => {
  for (const prov of PK_GEO_DATA.provinces) {
    const city = prov.cities.find(c => c.name === cityName);
    if (city) return city;
  }
};

export const findAreaNode = (areaName: string): (GeoArea & { cityName: string; provinceName: string }) | undefined => {
  for (const prov of PK_GEO_DATA.provinces) {
    for (const city of prov.cities) {
      const area = city.areas.find(a => a.name === areaName);
      if (area) return { ...area, cityName: city.name, provinceName: prov.name };
    }
  }
};

// ─── Haversine distance (kilometres) ─────────────────────────────────────────

export const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Returns names of areas in the same city that are within `radiusKm` of the
 * given area. Used for Tier-2 radius expansion in the cascading search.
 */
export const getNearbyAreaNames = (areaName: string, radiusKm = 8): string[] => {
  for (const prov of PK_GEO_DATA.provinces) {
    for (const city of prov.cities) {
      const target = city.areas.find(a => a.name === areaName);
      if (!target) continue;
      return city.areas
        .filter(a => a.name !== areaName)
        .filter(a => haversineKm(target.lat, target.lng, a.lat, a.lng) <= radiusKm)
        .map(a => a.name);
    }
  }
  return [];
};

/**
 * Returns the city name that contains the given area (for Tier-3 fallback).
 */
export const getCityForArea = (areaName: string): string | undefined => {
  const found = findAreaNode(areaName);
  return found?.cityName;
};
