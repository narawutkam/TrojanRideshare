/**
 * A small flat projection for drawing places on an SVG diagram (no map tiles needed). Longitude is scaled by the
 * cosine of the middle latitude so distances look right at LA's latitude.
 */
export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface Projection {
  width: number;
  height: number;
  /** Map a place to x/y in the SVG's coordinate space. */
  at(latitude: number, longitude: number): [number, number];
}

/** Fit the given places into a width × height box with padding, keeping the true shape. */
export function fitProjection(points: LatLng[], width: number, height: number, padding = 0.12): Projection {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  // Never zoom in tighter than about 0.02 degrees (1.5 miles) so a short hop still shows some surroundings.
  const spanX = Math.max((maxLng - minLng) * k, 0.02);
  const spanY = Math.max(maxLat - minLat, 0.02);
  const scale = Math.min((width * (1 - 2 * padding)) / spanX, (height * (1 - 2 * padding)) / spanY);
  const cx = ((minLng + maxLng) / 2) * k;
  const cy = (minLat + maxLat) / 2;
  return {
    width,
    height,
    at: (latitude, longitude) => [width / 2 + (longitude * k - cx) * scale, height / 2 - (latitude - cy) * scale],
  };
}

/** Google Maps directions link for the same route. It needs no key and opens the Maps app on a phone. */
export function googleDirectionsUrl(stops: LatLng[]): string {
  const pt = (p: LatLng) => `${p.latitude},${p.longitude}`;
  if (stops.length === 1) return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: pt(stops[0]) }).toString()}`;
  const first = stops[0];
  const last = stops[stops.length - 1];
  const via = stops.slice(1, -1).map(pt).join("|");
  const params = new URLSearchParams({ api: "1", origin: pt(first), destination: pt(last), travelmode: "driving" });
  if (via) params.set("waypoints", via);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
