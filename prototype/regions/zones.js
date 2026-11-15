/**
 * LA drop-off zones for the USC rideshare app.
 *
 * Model: the Uber drops the whole party at ONE drop-off point per zone, and
 * everyone walks from there. So a zone is a drop-off point plus a walking
 * radius, and a destination is only assigned to a zone if it is within
 * walking distance of that zone's drop-off point.
 *
 * Zones are grouped into larger "areas" (Santa Monica, Hollywood, ...) purely
 * for browsing/filtering the trip list. Matching always happens at zone level.
 *
 * Works in Node (require) and the browser (window.LARegions), no dependencies.
 * Coordinates are approximate; check each drop-off point on the map before
 * launch.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LARegions = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Max straight-line distance (km) from the drop-off point to a destination.
  // Street walking is ~1.3x straight-line, so 0.8 km is roughly a 12-13 min walk.
  const WALK_RADIUS_KM = 0.8;
  const WALK_DETOUR_FACTOR = 1.3; // straight line -> street distance
  const WALK_SPEED_KMH = 5;

  const AREAS = [
    { id: "downtown", name: "Downtown LA" },
    { id: "central", name: "Koreatown / Echo Park / Silver Lake / Los Feliz" },
    { id: "hollywood", name: "Hollywood" },
    { id: "weho", name: "West Hollywood" },
    { id: "mid-city", name: "Melrose / Fairfax / Miracle Mile" },
    { id: "westside", name: "Beverly Hills / Century City / Westwood" },
    { id: "beaches", name: "Santa Monica / Venice / Marina" },
    { id: "south-bay", name: "South Bay" },
    { id: "south", name: "LAX / Inglewood" },
    { id: "north", name: "Universal / Glendale / Pasadena" },
  ];

  // Each zone: drop-off point + landmarks that should be walkable from it.
  const L = (name, lat, lng) => ({ name, lat, lng });
  const ZONES = [
    // ---- Downtown ----
    { id: "la-live", area: "downtown", name: "L.A. Live / Crypto.com Arena", dropoff: { lat: 34.0441, lng: -118.2665 },
      landmarks: [L("Crypto.com Arena", 34.0430, -118.2673), L("Peacock Theater", 34.0446, -118.2671), L("LA Convention Center", 34.0403, -118.2696)] },
    { id: "dtla-core", area: "downtown", name: "Grand Central Market / Bunker Hill", dropoff: { lat: 34.0515, lng: -118.2505 },
      landmarks: [L("Grand Central Market", 34.0509, -118.2490), L("The Broad", 34.0545, -118.2503), L("Walt Disney Concert Hall", 34.0553, -118.2498), L("Pershing Square", 34.0485, -118.2529), L("Bradbury Building", 34.0505, -118.2478)] },
    { id: "little-tokyo", area: "downtown", name: "Little Tokyo", dropoff: { lat: 34.0498, lng: -118.2400 },
      landmarks: [L("Japanese Village Plaza", 34.0493, -118.2400), L("Japanese American National Museum", 34.0496, -118.2385), L("Geffen Contemporary", 34.0505, -118.2385)] },
    { id: "arts-district", area: "downtown", name: "Arts District", dropoff: { lat: 34.0430, lng: -118.2335 },
      landmarks: [L("Hauser & Wirth", 34.0423, -118.2329), L("Angel City Brewery", 34.0459, -118.2328)] },
    { id: "chinatown", area: "downtown", name: "Chinatown / Union Station", dropoff: { lat: 34.0605, lng: -118.2380 },
      landmarks: [L("Chinatown Central Plaza", 34.0638, -118.2384), L("Olvera Street", 34.0575, -118.2377), L("Union Station", 34.0562, -118.2365)] },
    { id: "dodger-stadium", area: "downtown", name: "Dodger Stadium", dropoff: { lat: 34.0739, lng: -118.2400 },
      landmarks: [L("Dodger Stadium", 34.0739, -118.2400)] },

    // ---- Central ----
    { id: "ktown-west", area: "central", name: "Koreatown (Wilshire / Western)", dropoff: { lat: 34.0605, lng: -118.3075 },
      landmarks: [L("The Wiltern", 34.0617, -118.3089), L("Koreatown Plaza", 34.0573, -118.3089)] },
    { id: "ktown-east", area: "central", name: "Koreatown (6th St)", dropoff: { lat: 34.0636, lng: -118.3000 },
      landmarks: [L("6th St restaurants & bars", 34.0636, -118.2990), L("The Line Hotel", 34.0624, -118.2935)] },
    { id: "echo-park", area: "central", name: "Echo Park", dropoff: { lat: 34.0760, lng: -118.2600 },
      landmarks: [L("Echo Park Lake", 34.0729, -118.2606), L("The Echo", 34.0777, -118.2601)] },
    { id: "silver-lake", area: "central", name: "Silver Lake (Sunset Junction)", dropoff: { lat: 34.0895, lng: -118.2770 },
      landmarks: [L("Sunset Junction", 34.0905, -118.2780)] },
    { id: "los-feliz", area: "central", name: "Los Feliz Village", dropoff: { lat: 34.1045, lng: -118.2917 },
      landmarks: [L("Vermont Ave shops / Skylight Books", 34.1043, -118.2919)] },
    { id: "griffith", area: "central", name: "Griffith Observatory / Greek Theatre", dropoff: { lat: 34.1190, lng: -118.2985 },
      landmarks: [L("Griffith Observatory", 34.1184, -118.3004), L("Greek Theatre", 34.1196, -118.2962)] },

    // ---- Hollywood ----
    { id: "hollywood-highland", area: "hollywood", name: "Hollywood & Highland", dropoff: { lat: 34.1017, lng: -118.3387 },
      landmarks: [L("Ovation Hollywood", 34.1017, -118.3387), L("TCL Chinese Theatre", 34.1022, -118.3409), L("Dolby Theatre", 34.1026, -118.3399), L("El Capitan Theatre", 34.1012, -118.3394)] },
    { id: "hollywood-vine", area: "hollywood", name: "Hollywood & Vine", dropoff: { lat: 34.1015, lng: -118.3260 },
      landmarks: [L("Capitol Records", 34.1032, -118.3265), L("Pantages Theatre", 34.1022, -118.3253), L("Hollywood Palladium", 34.0983, -118.3243), L("Avalon Hollywood", 34.1027, -118.3270)] },
    { id: "hollywood-bowl", area: "hollywood", name: "Hollywood Bowl", dropoff: { lat: 34.1122, lng: -118.3391 },
      landmarks: [L("Hollywood Bowl", 34.1122, -118.3391)] },

    // ---- West Hollywood ----
    { id: "sunset-strip", area: "weho", name: "Sunset Strip", dropoff: { lat: 34.0920, lng: -118.3810 },
      landmarks: [L("Whisky a Go Go", 34.0907, -118.3857), L("The Roxy", 34.0905, -118.3878), L("The Comedy Store", 34.0957, -118.3739)] },
    { id: "weho-sm-blvd", area: "weho", name: "WeHo (Santa Monica Blvd)", dropoff: { lat: 34.0845, lng: -118.3835 },
      landmarks: [L("The Abbey", 34.0832, -118.3851), L("Pacific Design Center", 34.0826, -118.3843)] },
    { id: "beverly-center", area: "weho", name: "Beverly Center", dropoff: { lat: 34.0750, lng: -118.3770 },
      landmarks: [L("Beverly Center", 34.0754, -118.3768)] },

    // ---- Mid-City ----
    { id: "melrose", area: "mid-city", name: "Melrose Ave (Fairfax)", dropoff: { lat: 34.0837, lng: -118.3570 },
      landmarks: [L("Melrose & Fairfax", 34.0837, -118.3615), L("Melrose Trading Post", 34.0835, -118.3620), L("Melrose shops (Stanley-Martel)", 34.0837, -118.3530)] },
    { id: "the-grove", area: "mid-city", name: "The Grove / Farmers Market", dropoff: { lat: 34.0718, lng: -118.3585 },
      landmarks: [L("The Grove", 34.0720, -118.3575), L("Original Farmers Market", 34.0719, -118.3605)] },
    { id: "miracle-mile", area: "mid-city", name: "LACMA / Museum Row", dropoff: { lat: 34.0630, lng: -118.3590 },
      landmarks: [L("LACMA", 34.0639, -118.3592), L("Academy Museum", 34.0630, -118.3613), L("La Brea Tar Pits", 34.0638, -118.3557), L("Petersen Automotive Museum", 34.0622, -118.3614)] },

    // ---- Westside ----
    { id: "rodeo", area: "westside", name: "Rodeo Drive", dropoff: { lat: 34.0690, lng: -118.4020 },
      landmarks: [L("Rodeo Drive", 34.0696, -118.4031), L("Beverly Wilshire", 34.0672, -118.4003), L("Beverly Gardens Park", 34.0729, -118.4040)] },
    { id: "century-city", area: "westside", name: "Century City", dropoff: { lat: 34.0583, lng: -118.4189 },
      landmarks: [L("Westfield Century City", 34.0583, -118.4189)] },
    { id: "westwood-village", area: "westside", name: "Westwood Village", dropoff: { lat: 34.0615, lng: -118.4465 },
      landmarks: [L("Westwood Village", 34.0610, -118.4470), L("Hammer Museum", 34.0594, -118.4434)] },
    { id: "ucla", area: "westside", name: "UCLA Campus", dropoff: { lat: 34.0705, lng: -118.4430 },
      landmarks: [L("Royce Hall", 34.0729, -118.4422), L("Ackerman Union", 34.0705, -118.4445), L("Pauley Pavilion", 34.0702, -118.4469)] },
    { id: "sawtelle", area: "westside", name: "Sawtelle Japantown", dropoff: { lat: 34.0395, lng: -118.4428 },
      landmarks: [L("Tsujita", 34.0393, -118.4425), L("Sawtelle & Olympic", 34.0378, -118.4430)] },
    { id: "culver-city", area: "westside", name: "Downtown Culver City", dropoff: { lat: 34.0250, lng: -118.3925 },
      landmarks: [L("Culver Steps", 34.0236, -118.3956), L("Platform", 34.0277, -118.3887)] },

    // ---- Beaches ----
    { id: "sm-pier", area: "beaches", name: "Santa Monica Pier / Promenade", dropoff: { lat: 34.0130, lng: -118.4955 },
      landmarks: [L("Santa Monica Pier", 34.0094, -118.4973), L("Third Street Promenade", 34.0160, -118.4963), L("Santa Monica Place", 34.0137, -118.4945)] },
    { id: "sm-main-st", area: "beaches", name: "Main Street Santa Monica", dropoff: { lat: 34.0020, lng: -118.4835 },
      landmarks: [L("Main St & Ocean Park", 34.0020, -118.4835)] },
    { id: "venice", area: "beaches", name: "Venice Beach / Abbot Kinney", dropoff: { lat: 33.9880, lng: -118.4700 },
      landmarks: [L("Venice Boardwalk (Windward)", 33.9875, -118.4725), L("Abbot Kinney Blvd", 33.9915, -118.4686), L("Venice Canals", 33.9845, -118.4660), L("Muscle Beach", 33.9853, -118.4729)] },
    { id: "marina-del-rey", area: "beaches", name: "Marina del Rey", dropoff: { lat: 33.9765, lng: -118.4500 },
      landmarks: [L("Fisherman's Village", 33.9725, -118.4440), L("Mother's Beach", 33.9805, -118.4560)] },

    // ---- South Bay ----
    { id: "manhattan-beach", area: "south-bay", name: "Manhattan Beach Pier", dropoff: { lat: 33.8850, lng: -118.4095 },
      landmarks: [L("Manhattan Beach Pier", 33.8847, -118.4109), L("Downtown Manhattan Beach", 33.8853, -118.4093)] },
    { id: "hermosa-beach", area: "south-bay", name: "Hermosa Beach Pier", dropoff: { lat: 33.8622, lng: -118.3990 },
      landmarks: [L("Hermosa Beach Pier", 33.8617, -118.4004), L("Pier Ave", 33.8622, -118.3990)] },

    // ---- LAX / Inglewood ----
    { id: "lax", area: "south", name: "LAX Terminals", dropoff: { lat: 33.9425, lng: -118.4081 },
      landmarks: [L("Tom Bradley Intl Terminal", 33.9416, -118.4085), L("Terminal 1", 33.9452, -118.4024)] },
    { id: "sofi", area: "south", name: "SoFi / Kia Forum / Intuit Dome", dropoff: { lat: 33.9520, lng: -118.3410 },
      landmarks: [L("SoFi Stadium", 33.9535, -118.3392), L("Kia Forum", 33.9583, -118.3419), L("Intuit Dome", 33.9450, -118.3430)] },

    // ---- North ----
    { id: "universal", area: "north", name: "Universal CityWalk", dropoff: { lat: 34.1365, lng: -118.3530 },
      landmarks: [L("Universal CityWalk", 34.1365, -118.3530), L("Universal Studios entrance", 34.1381, -118.3534)] },
    { id: "glendale", area: "north", name: "Americana at Brand", dropoff: { lat: 34.1460, lng: -118.2565 },
      landmarks: [L("The Americana at Brand", 34.1460, -118.2552), L("Glendale Galleria", 34.1459, -118.2588)] },
    { id: "old-pasadena", area: "north", name: "Old Pasadena", dropoff: { lat: 34.1458, lng: -118.1530 },
      landmarks: [L("Colorado & Fair Oaks", 34.1458, -118.1500), L("Norton Simon Museum", 34.1462, -118.1592)] },
    { id: "rose-bowl", area: "north", name: "Rose Bowl", dropoff: { lat: 34.1613, lng: -118.1676 },
      landmarks: [L("Rose Bowl", 34.1613, -118.1676)] },
  ];

  // USC pickup locations (from the app spec).
  const PICKUPS = [
    { id: "village", name: "USC Village", lat: 34.0256, lng: -118.2853 },
    { id: "evk", name: "Everybody's Kitchen", lat: 34.0211, lng: -118.2880 },
    { id: "webb", name: "Webb Tower", lat: 34.0252, lng: -118.2867 },
  ];

  const toRad = (d) => (d * Math.PI) / 180;

  /** Great-circle distance in km between two {lat, lng} points. */
  function distanceKm(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }

  /** Estimated walking minutes for a straight-line distance. */
  function walkMinutes(straightKm) {
    return Math.round(((straightKm * WALK_DETOUR_FACTOR) / WALK_SPEED_KMH) * 60);
  }

  /**
   * Assign a destination to the nearest drop-off zone.
   * Returns { zone, area, walkKm, walkMinutes } when the destination is
   * within WALK_RADIUS_KM of that zone's drop-off point; otherwise returns
   * { zone: null, nearest, nearestKm } so the app can say e.g.
   * "No shared rides go there yet. Closest drop-off: Venice (1.4 km)".
   */
  function assignZone(lat, lng) {
    const dest = { lat, lng };
    let nearest = null;
    let nearestKm = Infinity;
    for (const z of ZONES) {
      const d = distanceKm(dest, z.dropoff);
      if (d < nearestKm) { nearest = z; nearestKm = d; }
    }
    if (nearestKm <= WALK_RADIUS_KM) {
      return { zone: nearest, area: AREAS.find((a) => a.id === nearest.area), walkKm: nearestKm, walkMinutes: walkMinutes(nearestKm) };
    }
    return { zone: null, nearest, nearestKm };
  }

  /**
   * Search flow: given a searched destination, return trips going to the
   * same drop-off zone, sorted by how close each rider's destination is to
   * the searched one. trips: [{ zoneId, destination: { lat, lng }, ... }]
   */
  function rankTripsByDistance(search, trips) {
    const match = assignZone(search.lat, search.lng);
    if (!match.zone) return [];
    return trips
      .filter((t) => t.zoneId === match.zone.id)
      .map((t) => ({ ...t, distanceKm: distanceKm(search, t.destination) }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  /** Zones as GeoJSON points (drop-off locations) with walk radius in properties. */
  function toGeoJSON() {
    return {
      type: "FeatureCollection",
      features: ZONES.map((z) => ({
        type: "Feature",
        properties: { id: z.id, name: z.name, area: z.area, walkRadiusKm: WALK_RADIUS_KM, landmarks: z.landmarks.map((l) => l.name) },
        geometry: { type: "Point", coordinates: [z.dropoff.lng, z.dropoff.lat] },
      })),
    };
  }

  return { WALK_RADIUS_KM, AREAS, ZONES, PICKUPS, assignZone, rankTripsByDistance, distanceKm, walkMinutes, toGeoJSON };
});
