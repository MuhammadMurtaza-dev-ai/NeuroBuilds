"""
location_search.py — Cascading geo-fallback search for the NeuroBuilds marketplace.

Architecture
============
Listings are stored in MongoDB with the following relevant fields:

  {
    "area":     "Tariq Garden",   # neighbourhood / area name
    "city":     "Lahore",
    "province": "Punjab",
    "country":  "Pakistan",
    "location": "Tariq Garden, Lahore, Pakistan",   # denormalized string
    "status":   "active",
    "geo": {                       # GeoJSON Point — required for Tier-2 search
      "type":        "Point",
      "coordinates": [74.2823, 31.5042]   # [lng, lat] — MongoDB convention
    }
  }

Required MongoDB index (run once):

  db.listings.create_index([("geo", "2dsphere")])

Optional compound indexes for Tier-1 / Tier-3 speed:

  db.listings.create_index([("area", 1), ("status", 1)])
  db.listings.create_index([("city", 1), ("status", 1)])

Fallback pipeline
=================
  Tier 1 — Exact area match    (area == target_area, status == "active")
  Tier 2 — Radius expansion    ($nearSphere from area centroid, within radius_m)
  Tier 3 — City-wide fallback  (city == city_of_area, status == "active")

The area centroids for Tier-2 are sourced from the same dataset embedded here
so we stay in sync with the TypeScript frontend without a round-trip.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from pymongo.collection import Collection
from pymongo import ASCENDING


# ─── Embedded area centroids (mirrors src/data/pakistanGeoLocations.ts) ───────
#
# Only provincial / federal capitals are included because those are the only
# cities that carry area-level granularity in the dataset.

_AREA_CENTROIDS: dict[str, dict[str, Any]] = {
    # ── Islamabad ──────────────────────────────────────────────────────────────
    "F-6":         {"lat": 33.7286, "lng": 73.1012, "city": "Islamabad", "province": "Islamabad Capital Territory"},
    "F-7":         {"lat": 33.7295, "lng": 73.0929, "city": "Islamabad", "province": "Islamabad Capital Territory"},
    "F-8":         {"lat": 33.7156, "lng": 73.1017, "city": "Islamabad", "province": "Islamabad Capital Territory"},
    "F-10":        {"lat": 33.7113, "lng": 73.0539, "city": "Islamabad", "province": "Islamabad Capital Territory"},
    "F-11":        {"lat": 33.7046, "lng": 73.0353, "city": "Islamabad", "province": "Islamabad Capital Territory"},
    "G-9":         {"lat": 33.6932, "lng": 73.0647, "city": "Islamabad", "province": "Islamabad Capital Territory"},
    "G-11":        {"lat": 33.6802, "lng": 73.0280, "city": "Islamabad", "province": "Islamabad Capital Territory"},
    "G-13":        {"lat": 33.6642, "lng": 73.0165, "city": "Islamabad", "province": "Islamabad Capital Territory"},
    "Blue Area":   {"lat": 33.7220, "lng": 73.0830, "city": "Islamabad", "province": "Islamabad Capital Territory"},
    "I-8":         {"lat": 33.6880, "lng": 73.0827, "city": "Islamabad", "province": "Islamabad Capital Territory"},
    "I-10":        {"lat": 33.6751, "lng": 73.0610, "city": "Islamabad", "province": "Islamabad Capital Territory"},
    "E-11":        {"lat": 33.7134, "lng": 73.0165, "city": "Islamabad", "province": "Islamabad Capital Territory"},
    "H-13":        {"lat": 33.6491, "lng": 73.0082, "city": "Islamabad", "province": "Islamabad Capital Territory"},
    "Bani Gala":   {"lat": 33.6577, "lng": 73.0954, "city": "Islamabad", "province": "Islamabad Capital Territory"},

    # ── Lahore ────────────────────────────────────────────────────────────────
    "Gulberg":           {"lat": 31.5111, "lng": 74.3353, "city": "Lahore", "province": "Punjab"},
    "Johar Town":        {"lat": 31.4697, "lng": 74.2738, "city": "Lahore", "province": "Punjab"},
    "Model Town":        {"lat": 31.4961, "lng": 74.3097, "city": "Lahore", "province": "Punjab"},
    "Cantt":             {"lat": 31.5315, "lng": 74.3527, "city": "Lahore", "province": "Punjab"},
    "Allama Iqbal Town": {"lat": 31.5188, "lng": 74.2847, "city": "Lahore", "province": "Punjab"},
    "Wapda Town":        {"lat": 31.4607, "lng": 74.2665, "city": "Lahore", "province": "Punjab"},
    "Garden Town":       {"lat": 31.5218, "lng": 74.3249, "city": "Lahore", "province": "Punjab"},
    "Shadman":           {"lat": 31.5400, "lng": 74.3228, "city": "Lahore", "province": "Punjab"},
    "Tariq Garden":      {"lat": 31.5042, "lng": 74.2823, "city": "Lahore", "province": "Punjab"},
    "Township":          {"lat": 31.4693, "lng": 74.2651, "city": "Lahore", "province": "Punjab"},
    "Iqbal Town":        {"lat": 31.5132, "lng": 74.3058, "city": "Lahore", "province": "Punjab"},
    "Samanabad":         {"lat": 31.5498, "lng": 74.3042, "city": "Lahore", "province": "Punjab"},
    "Faisal Town":       {"lat": 31.4853, "lng": 74.3068, "city": "Lahore", "province": "Punjab"},
    "Cavalry Ground":    {"lat": 31.5401, "lng": 74.3609, "city": "Lahore", "province": "Punjab"},
    "DHA Phase 1":       {"lat": 31.4697, "lng": 74.3861, "city": "Lahore", "province": "Punjab"},
    "DHA Phase 5":       {"lat": 31.4507, "lng": 74.3867, "city": "Lahore", "province": "Punjab"},
    "DHA Phase 6":       {"lat": 31.4255, "lng": 74.3884, "city": "Lahore", "province": "Punjab"},

    # ── Karachi ───────────────────────────────────────────────────────────────
    "Clifton":          {"lat": 24.8136, "lng": 67.0291, "city": "Karachi", "province": "Sindh"},
    "Gulshan-e-Iqbal":  {"lat": 24.9157, "lng": 67.0898, "city": "Karachi", "province": "Sindh"},
    "North Nazimabad":  {"lat": 24.9413, "lng": 67.0528, "city": "Karachi", "province": "Sindh"},
    "Korangi":          {"lat": 24.8271, "lng": 67.1322, "city": "Karachi", "province": "Sindh"},
    "Saddar":           {"lat": 24.8607, "lng": 67.0104, "city": "Karachi", "province": "Sindh"},
    "Bahadurabad":      {"lat": 24.8850, "lng": 67.0610, "city": "Karachi", "province": "Sindh"},
    "PECHS":            {"lat": 24.8703, "lng": 67.0451, "city": "Karachi", "province": "Sindh"},
    "Gulistan-e-Johar": {"lat": 24.9198, "lng": 67.1292, "city": "Karachi", "province": "Sindh"},
    "Federal B Area":   {"lat": 24.9282, "lng": 67.0717, "city": "Karachi", "province": "Sindh"},
    "Malir":            {"lat": 24.8960, "lng": 67.1958, "city": "Karachi", "province": "Sindh"},
    "Scheme 33":        {"lat": 24.9576, "lng": 67.1248, "city": "Karachi", "province": "Sindh"},
    "Orangi Town":      {"lat": 24.9551, "lng": 67.0091, "city": "Karachi", "province": "Sindh"},
    "Lyari":            {"lat": 24.8548, "lng": 67.0097, "city": "Karachi", "province": "Sindh"},
    "Landhi":           {"lat": 24.8395, "lng": 67.1707, "city": "Karachi", "province": "Sindh"},

    # ── Peshawar ──────────────────────────────────────────────────────────────
    "Hayatabad":       {"lat": 34.0097, "lng": 71.4356, "city": "Peshawar", "province": "Khyber Pakhtunkhwa"},
    "University Town": {"lat": 34.0009, "lng": 71.4823, "city": "Peshawar", "province": "Khyber Pakhtunkhwa"},
    "Gulbahar":        {"lat": 34.0113, "lng": 71.5347, "city": "Peshawar", "province": "Khyber Pakhtunkhwa"},
    "Regi Model Town": {"lat": 33.9952, "lng": 71.4600, "city": "Peshawar", "province": "Khyber Pakhtunkhwa"},
    "Defence Colony":  {"lat": 34.0031, "lng": 71.4901, "city": "Peshawar", "province": "Khyber Pakhtunkhwa"},
    "Warsak Road":     {"lat": 34.0395, "lng": 71.4836, "city": "Peshawar", "province": "Khyber Pakhtunkhwa"},
    "Kohat Road":      {"lat": 33.9701, "lng": 71.5248, "city": "Peshawar", "province": "Khyber Pakhtunkhwa"},
    "Ring Road":       {"lat": 33.9787, "lng": 71.4623, "city": "Peshawar", "province": "Khyber Pakhtunkhwa"},
    "Dalazak Road":    {"lat": 34.0432, "lng": 71.5388, "city": "Peshawar", "province": "Khyber Pakhtunkhwa"},
    "GT Road":         {"lat": 34.0328, "lng": 71.5897, "city": "Peshawar", "province": "Khyber Pakhtunkhwa"},

    # ── Quetta ────────────────────────────────────────────────────────────────
    "Satellite Town":    {"lat": 30.1976, "lng": 67.0208, "city": "Quetta", "province": "Balochistan"},
    "Jinnah Town":       {"lat": 30.2060, "lng": 67.0289, "city": "Quetta", "province": "Balochistan"},
    "Civil Lines":       {"lat": 30.1967, "lng": 67.0164, "city": "Quetta", "province": "Balochistan"},
    "Sariab Road":       {"lat": 30.1725, "lng": 66.9768, "city": "Quetta", "province": "Balochistan"},
    "Brewery Road":      {"lat": 30.2176, "lng": 67.0115, "city": "Quetta", "province": "Balochistan"},
    "Quetta Cantonment": {"lat": 30.1680, "lng": 67.0059, "city": "Quetta", "province": "Balochistan"},
    "Samungli Road":     {"lat": 30.2036, "lng": 66.9699, "city": "Quetta", "province": "Balochistan"},
    "Airport Road":      {"lat": 30.2432, "lng": 66.9448, "city": "Quetta", "province": "Balochistan"},
    "Spini Road":        {"lat": 30.1589, "lng": 67.0392, "city": "Quetta", "province": "Balochistan"},

    # ── Gilgit ────────────────────────────────────────────────────────────────
    "Jutial":        {"lat": 35.9232, "lng": 74.3115, "city": "Gilgit", "province": "Gilgit-Baltistan"},
    "City Centre":   {"lat": 35.9221, "lng": 74.3082, "city": "Gilgit", "province": "Gilgit-Baltistan"},
    "Konodas":       {"lat": 35.9087, "lng": 74.3218, "city": "Gilgit", "province": "Gilgit-Baltistan"},
    "Aga Khan Road": {"lat": 35.9187, "lng": 74.3129, "city": "Gilgit", "province": "Gilgit-Baltistan"},
    "Nomal":         {"lat": 35.9421, "lng": 74.3488, "city": "Gilgit", "province": "Gilgit-Baltistan"},
    "Sultanabad":    {"lat": 35.9305, "lng": 74.2889, "city": "Gilgit", "province": "Gilgit-Baltistan"},
    "Barmas":        {"lat": 35.9012, "lng": 74.2966, "city": "Gilgit", "province": "Gilgit-Baltistan"},

    # ── Muzaffarabad ──────────────────────────────────────────────────────────
    "Chattar":    {"lat": 34.3595, "lng": 73.4713, "city": "Muzaffarabad", "province": "Azad Jammu & Kashmir"},
    "Subri":      {"lat": 34.3487, "lng": 73.4821, "city": "Muzaffarabad", "province": "Azad Jammu & Kashmir"},
    "Pattika":    {"lat": 34.3705, "lng": 73.4623, "city": "Muzaffarabad", "province": "Azad Jammu & Kashmir"},
    "Necksotha":  {"lat": 34.3748, "lng": 73.4575, "city": "Muzaffarabad", "province": "Azad Jammu & Kashmir"},
    "Abbas Road": {"lat": 34.3612, "lng": 73.4756, "city": "Muzaffarabad", "province": "Azad Jammu & Kashmir"},
    "New Town":   {"lat": 34.3543, "lng": 73.4678, "city": "Muzaffarabad", "province": "Azad Jammu & Kashmir"},
    "Old Town":   {"lat": 34.3660, "lng": 73.4712, "city": "Muzaffarabad", "province": "Azad Jammu & Kashmir"},
}


# ─── Result type ──────────────────────────────────────────────────────────────

@dataclass
class GeoSearchResult:
    listings: list[dict]
    tier: int                    # 1 | 2 | 3
    tier_label: str              # e.g. "Tariq Garden" | "Nearby Tariq Garden" | "All of Lahore"
    count: int = field(init=False)

    def __post_init__(self) -> None:
        self.count = len(self.listings)


# ─── Haversine helper (Python) ────────────────────────────────────────────────

def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ─── Core service ─────────────────────────────────────────────────────────────

class LocationSearchService:
    """
    Stateless service — pass a PyMongo Collection on each call so the caller
    controls connection lifecycle (aligned with how main.py manages app.state.mongo).
    """

    DEFAULT_RADIUS_M = 8_000       # 8 km for Tier-2
    MAX_RESULTS      = 50

    def __init__(self, collection: Collection) -> None:
        self._col = collection

    # ── Public entry point ────────────────────────────────────────────────────

    def search(
        self,
        area: str,
        *,
        extra_filters: dict | None = None,
        radius_m: int = DEFAULT_RADIUS_M,
        limit: int = MAX_RESULTS,
    ) -> GeoSearchResult:
        """
        Run the 3-tier cascading fallback for `area`.

        `extra_filters` is merged into every MongoDB query as additional
        $match clauses (e.g. {"category": "components", "listingType": "sell"}).
        """
        filters = extra_filters or {}
        base = {"status": "active", **filters}

        # ── Tier 1: exact area match ──────────────────────────────────────────
        tier1_docs = self._query_exact_area(area, base, limit)
        if tier1_docs:
            return GeoSearchResult(listings=tier1_docs, tier=1, tier_label=area)

        # ── Tier 2: radius search around area centroid ────────────────────────
        centroid = _AREA_CENTROIDS.get(area)
        if centroid:
            tier2_docs = self._query_near(
                lat=centroid["lat"],
                lng=centroid["lng"],
                radius_m=radius_m,
                exclude_area=area,
                base_filter=base,
                limit=limit,
            )
            if tier2_docs:
                return GeoSearchResult(
                    listings=tier2_docs,
                    tier=2,
                    tier_label=f"Nearby {area}",
                )

        # ── Tier 3: city-wide fallback ────────────────────────────────────────
        city = centroid["city"] if centroid else None
        tier3_docs = self._query_city(city, base, limit) if city else []
        return GeoSearchResult(
            listings=tier3_docs,
            tier=3,
            tier_label=f"All of {city}" if city else "All Locations",
        )

    # ── Private query builders ────────────────────────────────────────────────

    def _project(self) -> dict:
        """Standard projection — strips internal fields."""
        return {"_id": 0, "geo": 0}

    def _query_exact_area(
        self, area: str, base_filter: dict, lim: int
    ) -> list[dict]:
        """Tier 1 — case-insensitive exact area field match."""
        query = {**base_filter, "area": {"$regex": f"^{area}$", "$options": "i"}}
        return list(
            self._col.find(query, self._project())
                     .sort("postedDate", -1)
                     .limit(lim)
        )

    def _query_near(
        self,
        lat: float,
        lng: float,
        radius_m: int,
        exclude_area: str,
        base_filter: dict,
        lim: int,
    ) -> list[dict]:
        """
        Tier 2 — MongoDB $nearSphere geospatial query.
        Requires a 2dsphere index on the `geo` field.
        """
        query = {
            **base_filter,
            "area": {"$ne": exclude_area},
            "geo": {
                "$nearSphere": {
                    "$geometry": {"type": "Point", "coordinates": [lng, lat]},
                    "$maxDistance": radius_m,
                }
            },
        }
        return list(self._col.find(query, self._project()).limit(lim))

    def _query_city(
        self, city: str | None, base_filter: dict, lim: int
    ) -> list[dict]:
        """Tier 3 — strip area constraint, match city."""
        if not city:
            return []
        query = {**base_filter, "city": {"$regex": f"^{city}$", "$options": "i"}}
        return list(
            self._col.find(query, self._project())
                     .sort("postedDate", -1)
                     .limit(lim)
        )


# ─── Index setup helper ───────────────────────────────────────────────────────

def ensure_indexes(col: Collection) -> None:
    """
    Create the indexes required for geo-search.
    Safe to call on every startup — MongoDB silently no-ops if they exist.
    """
    col.create_index([("geo", "2dsphere")], background=True)
    col.create_index([("area", ASCENDING), ("status", ASCENDING)], background=True)
    col.create_index([("city", ASCENDING), ("status", ASCENDING)], background=True)
    col.create_index([("country", ASCENDING), ("postedDate", -1)], background=True)
