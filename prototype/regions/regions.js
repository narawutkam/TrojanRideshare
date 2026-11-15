/**
 * LA destination regions for the USC rideshare app.
 *
 * Single source of truth: the region polygons, USC pickup points, and the
 * helpers the backend uses to (1) assign a destination to a region and
 * (2) rank trips by distance. Works in Node (require) and the browser
 * (window.LARegions) with no dependencies.
 *
 * Polygons are hand-drawn approximations around each area's main
 * attractions, not official city boundaries. Coordinates are [lng, lat]
 * to match GeoJSON.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LARegions = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const REGIONS = [
    // ---- Central / Downtown ----
    {
      id: "dtla",
      name: "Downtown LA",
      landmarks: ["Crypto.com Arena", "L.A. Live", "Grand Central Market", "The Broad", "Pershing Square"],
      polygon: [[-118.2760, 34.0340], [-118.2440, 34.0340], [-118.2440, 34.0580], [-118.2500, 34.0640], [-118.2620, 34.0640], [-118.2760, 34.0550]],
    },
    {
      id: "arts-district",
      name: "Arts District / Little Tokyo",
      landmarks: ["Little Tokyo", "Arts District breweries", "Row DTLA", "Hauser & Wirth"],
      polygon: [[-118.2440, 34.0300], [-118.2260, 34.0300], [-118.2260, 34.0580], [-118.2440, 34.0580]],
    },
    {
      id: "chinatown",
      name: "Chinatown / Dodger Stadium",
      landmarks: ["Dodger Stadium", "Chinatown Central Plaza", "Olvera Street", "Union Station"],
      polygon: [[-118.2500, 34.0640], [-118.2440, 34.0580], [-118.2260, 34.0580], [-118.2260, 34.0850], [-118.2500, 34.0850]],
    },
    {
      id: "koreatown",
      name: "Koreatown",
      landmarks: ["Wilshire/Western", "Koreatown Plaza", "The Wiltern", "BCD Tofu House"],
      polygon: [[-118.3150, 34.0450], [-118.2850, 34.0450], [-118.2850, 34.0770], [-118.3150, 34.0770]],
    },
    {
      id: "echo-park-silver-lake",
      name: "Echo Park / Silver Lake",
      landmarks: ["Echo Park Lake", "Silver Lake Reservoir", "Sunset Junction", "The Echo"],
      polygon: [[-118.2850, 34.0680], [-118.2500, 34.0680], [-118.2500, 34.0970], [-118.2850, 34.0970]],
    },
    {
      id: "los-feliz",
      name: "Los Feliz / Griffith Park",
      landmarks: ["Griffith Observatory", "Greek Theatre", "Vermont Ave shops"],
      polygon: [[-118.3050, 34.0970], [-118.2700, 34.0970], [-118.2700, 34.1300], [-118.3050, 34.1300]],
    },

    // ---- Hollywood / Mid-City ----
    {
      id: "hollywood",
      name: "Hollywood",
      landmarks: ["Hollywood & Highland", "Walk of Fame", "TCL Chinese Theatre", "Hollywood Bowl", "Hollywood Palladium"],
      polygon: [[-118.3450, 34.0900], [-118.3050, 34.0900], [-118.3050, 34.1200], [-118.3450, 34.1200]],
    },
    {
      id: "west-hollywood",
      name: "West Hollywood",
      landmarks: ["Sunset Strip", "Santa Monica Blvd", "The Abbey", "Pacific Design Center", "Melrose Place"],
      polygon: [[-118.3960, 34.0740], [-118.3700, 34.0740], [-118.3700, 34.0900], [-118.3450, 34.0900], [-118.3450, 34.1040], [-118.3960, 34.1040]],
    },
    {
      id: "melrose-fairfax",
      name: "Melrose / Fairfax",
      landmarks: ["Melrose Ave shops", "The Grove", "Original Farmers Market", "Fairfax Ave"],
      polygon: [[-118.3700, 34.0680], [-118.3380, 34.0680], [-118.3380, 34.0900], [-118.3700, 34.0900]],
    },
    {
      id: "miracle-mile",
      name: "Miracle Mile / Mid-Wilshire",
      landmarks: ["LACMA", "Academy Museum", "La Brea Tar Pits", "Petersen Automotive Museum"],
      polygon: [[-118.3750, 34.0520], [-118.3300, 34.0520], [-118.3300, 34.0680], [-118.3750, 34.0680]],
    },

    // ---- Westside ----
    {
      id: "beverly-hills",
      name: "Beverly Hills",
      landmarks: ["Rodeo Drive", "Beverly Center", "Beverly Gardens Park"],
      polygon: [[-118.4280, 34.0620], [-118.4080, 34.0620], [-118.4080, 34.0560], [-118.3960, 34.0560], [-118.3960, 34.0900], [-118.4280, 34.0900]],
    },
    {
      id: "century-city",
      name: "Century City",
      landmarks: ["Westfield Century City"],
      polygon: [[-118.4280, 34.0480], [-118.4080, 34.0480], [-118.4080, 34.0620], [-118.4280, 34.0620]],
    },
    {
      id: "westwood",
      name: "Westwood / UCLA",
      landmarks: ["UCLA", "Westwood Village", "Hammer Museum", "Getty Center (via 405)"],
      polygon: [[-118.4600, 34.0520], [-118.4280, 34.0520], [-118.4280, 34.0780], [-118.4600, 34.0780]],
    },
    {
      id: "sawtelle",
      name: "Sawtelle Japantown",
      landmarks: ["Sawtelle Blvd restaurants", "Tsujita", "Daiso"],
      polygon: [[-118.4550, 34.0250], [-118.4350, 34.0250], [-118.4350, 34.0500], [-118.4550, 34.0500]],
    },
    {
      id: "culver-city",
      name: "Culver City",
      landmarks: ["Downtown Culver City", "Platform", "Sony Pictures Studios", "Culver Steps"],
      polygon: [[-118.4150, 34.0050], [-118.3750, 34.0050], [-118.3750, 34.0300], [-118.4150, 34.0300]],
    },

    // ---- Beaches ----
    {
      id: "santa-monica",
      name: "Santa Monica",
      landmarks: ["Santa Monica Pier", "Third Street Promenade", "Main Street", "Santa Monica Place"],
      polygon: [[-118.5250, 34.0400], [-118.4550, 34.0400], [-118.4550, 34.0050], [-118.4800, 33.9980], [-118.4950, 33.9980], [-118.5250, 34.0280]],
    },
    {
      id: "venice",
      name: "Venice",
      landmarks: ["Venice Beach Boardwalk", "Abbot Kinney Blvd", "Venice Canals", "Muscle Beach"],
      polygon: [[-118.4950, 33.9980], [-118.4800, 33.9980], [-118.4550, 34.0050], [-118.4450, 33.9950], [-118.4550, 33.9800], [-118.4850, 33.9780]],
    },
    {
      id: "marina-del-rey",
      name: "Marina del Rey",
      landmarks: ["Fisherman's Village", "Mother's Beach", "Marina harbor"],
      polygon: [[-118.4850, 33.9780], [-118.4550, 33.9800], [-118.4450, 33.9950], [-118.4250, 33.9900], [-118.4300, 33.9650], [-118.4700, 33.9600]],
    },
    {
      id: "south-bay",
      name: "Manhattan / Hermosa Beach",
      landmarks: ["Manhattan Beach Pier", "Hermosa Beach Pier", "Pier Ave"],
      polygon: [[-118.4300, 33.9050], [-118.3850, 33.9050], [-118.3750, 33.8500], [-118.4100, 33.8500]],
    },

    // ---- South LA / Airport ----
    {
      id: "lax",
      name: "LAX",
      landmarks: ["LAX terminals", "LAX-it lot"],
      polygon: [[-118.4350, 33.9280], [-118.3750, 33.9280], [-118.3750, 33.9550], [-118.4350, 33.9550]],
    },
    {
      id: "inglewood",
      name: "Inglewood (SoFi / Forum)",
      landmarks: ["SoFi Stadium", "Kia Forum", "Intuit Dome", "YouTube Theater"],
      polygon: [[-118.3650, 33.9350], [-118.3200, 33.9350], [-118.3200, 33.9750], [-118.3650, 33.9750]],
    },

    // ---- North / Valley-adjacent ----
    {
      id: "universal-city",
      name: "Universal City / Studio City",
      landmarks: ["Universal Studios Hollywood", "Universal CityWalk", "Ventura Blvd"],
      polygon: [[-118.3900, 34.1300], [-118.3400, 34.1300], [-118.3400, 34.1500], [-118.3900, 34.1500]],
    },
    {
      id: "glendale",
      name: "Glendale",
      landmarks: ["The Americana at Brand", "Glendale Galleria"],
      polygon: [[-118.2700, 34.1350], [-118.2350, 34.1350], [-118.2350, 34.1600], [-118.2700, 34.1600]],
    },
    {
      id: "pasadena",
      name: "Pasadena",
      landmarks: ["Old Pasadena", "Rose Bowl", "Caltech", "Norton Simon Museum"],
      polygon: [[-118.1800, 34.1250], [-118.1100, 34.1250], [-118.1100, 34.1700], [-118.1800, 34.1700]],
    },
  ];

  // USC pickup locations (from the app spec).
  const PICKUPS = [
    { id: "village", name: "USC Village", lat: 34.0256, lng: -118.2853 },
    { id: "evk", name: "Everybody's Kitchen", lat: 34.0211, lng: -118.2880 },
    { id: "webb", name: "Webb Tower", lat: 34.0252, lng: -118.2867 },
  ];

  // Destinations that fall outside every polygon still snap to the nearest
  // region if they are within this distance of its edge.
  const SNAP_DISTANCE_KM = 1.5;

  const EARTH_RADIUS_KM = 6371;
  const toRad = (d) => (d * Math.PI) / 180;

  /** Great-circle distance in km between two {lat, lng} points. */
  function distanceKm(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
  }

  /** Ray-casting point-in-polygon test. polygon is [[lng, lat], ...]. */
  function pointInPolygon(lat, lng, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /** Approximate distance (km) from a point to a polygon's nearest edge. */
  function distanceToPolygonKm(lat, lng, polygon) {
    // Project to a local flat plane in km; accurate enough at city scale.
    const kx = 111.32 * Math.cos(toRad(lat));
    const ky = 110.57;
    let best = Infinity;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const ax = (polygon[j][0] - lng) * kx, ay = (polygon[j][1] - lat) * ky;
      const bx = (polygon[i][0] - lng) * kx, by = (polygon[i][1] - lat) * ky;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      const px = ax + t * dx, py = ay + t * dy;
      best = Math.min(best, Math.hypot(px, py));
    }
    return best;
  }

  /** Centroid of a polygon as {lat, lng} (vertex average; fine for these shapes). */
  function centroid(polygon) {
    const n = polygon.length;
    const sum = polygon.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
    return { lat: sum[1] / n, lng: sum[0] / n };
  }

  /**
   * Assign a destination to a region.
   * Returns { region, matched: "inside" | "nearby" } or null if the point is
   * not in or near any region (the app can show it as "Other").
   */
  function assignRegion(lat, lng) {
    const inside = REGIONS.find((r) => pointInPolygon(lat, lng, r.polygon));
    if (inside) return { region: inside, matched: "inside" };

    let nearest = null;
    let nearestDist = Infinity;
    for (const r of REGIONS) {
      const d = distanceToPolygonKm(lat, lng, r.polygon);
      if (d < nearestDist) { nearest = r; nearestDist = d; }
    }
    if (nearestDist <= SNAP_DISTANCE_KM) return { region: nearest, matched: "nearby", distanceKm: nearestDist };
    return null;
  }

  /**
   * Search flow: given a searched destination, return trips in the same
   * region sorted by how close each trip's destination is to it.
   * trips: [{ destination: { lat, lng }, regionId, ... }]
   */
  function rankTripsByDistance(search, trips) {
    const match = assignRegion(search.lat, search.lng);
    if (!match) return [];
    return trips
      .filter((t) => t.regionId === match.region.id)
      .map((t) => ({ ...t, distanceKm: distanceKm(search, t.destination) }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  /** Regions as a GeoJSON FeatureCollection (for map layers / export). */
  function toGeoJSON() {
    return {
      type: "FeatureCollection",
      features: REGIONS.map((r) => ({
        type: "Feature",
        properties: { id: r.id, name: r.name, landmarks: r.landmarks },
        geometry: { type: "Polygon", coordinates: [[...r.polygon, r.polygon[0]]] },
      })),
    };
  }

  return { REGIONS, PICKUPS, SNAP_DISTANCE_KM, assignRegion, rankTripsByDistance, distanceKm, pointInPolygon, centroid, toGeoJSON };
});
