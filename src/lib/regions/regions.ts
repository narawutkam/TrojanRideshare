import { fixtureId } from "@/lib/ids";
import type { Region } from "@/types";

/**
 * LA destination regions (README §1 R02). Hand-drawn polygons around popular
 * destinations; boundaries are pending team approval (README §8 "Region and
 * pickup rules"). Coordinates are [longitude, latitude].
 *
 * Internal to LocationService: only `Region { id, name }` crosses the API.
 */
export interface RegionShape extends Region {
  slug: string;
  polygon: [number, number][];
}

const R = (n: number, slug: string, name: string, polygon: [number, number][]): RegionShape => ({ id: fixtureId("region", n), slug, name, polygon });

export const REGIONS: RegionShape[] = [
  R(1, "dtla", "Downtown LA", [[-118.276, 34.034], [-118.244, 34.034], [-118.244, 34.058], [-118.25, 34.064], [-118.262, 34.064], [-118.276, 34.055]]),
  R(2, "arts-district", "Arts District / Little Tokyo", [[-118.244, 34.03], [-118.226, 34.03], [-118.226, 34.058], [-118.244, 34.058]]),
  R(3, "chinatown", "Chinatown / Dodger Stadium", [[-118.25, 34.064], [-118.244, 34.058], [-118.226, 34.058], [-118.226, 34.085], [-118.25, 34.085]]),
  R(4, "koreatown", "Koreatown", [[-118.315, 34.045], [-118.285, 34.045], [-118.285, 34.077], [-118.315, 34.077]]),
  R(5, "echo-park-silver-lake", "Echo Park / Silver Lake", [[-118.285, 34.068], [-118.25, 34.068], [-118.25, 34.097], [-118.285, 34.097]]),
  R(6, "los-feliz", "Los Feliz / Griffith Park", [[-118.305, 34.097], [-118.27, 34.097], [-118.27, 34.13], [-118.305, 34.13]]),
  R(7, "hollywood", "Hollywood", [[-118.345, 34.09], [-118.305, 34.09], [-118.305, 34.12], [-118.345, 34.12]]),
  R(8, "west-hollywood", "West Hollywood", [[-118.396, 34.074], [-118.37, 34.074], [-118.37, 34.09], [-118.345, 34.09], [-118.345, 34.104], [-118.396, 34.104]]),
  R(9, "melrose-fairfax", "Melrose / Fairfax", [[-118.37, 34.068], [-118.338, 34.068], [-118.338, 34.09], [-118.37, 34.09]]),
  R(10, "miracle-mile", "Miracle Mile / Mid-Wilshire", [[-118.375, 34.052], [-118.33, 34.052], [-118.33, 34.068], [-118.375, 34.068]]),
  R(11, "beverly-hills", "Beverly Hills", [[-118.428, 34.062], [-118.408, 34.062], [-118.408, 34.056], [-118.396, 34.056], [-118.396, 34.09], [-118.428, 34.09]]),
  R(12, "century-city", "Century City", [[-118.428, 34.048], [-118.408, 34.048], [-118.408, 34.062], [-118.428, 34.062]]),
  R(13, "westwood", "Westwood / UCLA", [[-118.46, 34.052], [-118.428, 34.052], [-118.428, 34.078], [-118.46, 34.078]]),
  R(14, "sawtelle", "Sawtelle Japantown", [[-118.455, 34.025], [-118.435, 34.025], [-118.435, 34.05], [-118.455, 34.05]]),
  R(15, "culver-city", "Culver City", [[-118.415, 34.005], [-118.375, 34.005], [-118.375, 34.03], [-118.415, 34.03]]),
  R(16, "santa-monica", "Santa Monica", [[-118.525, 34.04], [-118.455, 34.04], [-118.455, 34.005], [-118.48, 33.998], [-118.495, 33.998], [-118.525, 34.028]]),
  R(17, "venice", "Venice", [[-118.495, 33.998], [-118.48, 33.998], [-118.455, 34.005], [-118.445, 33.995], [-118.455, 33.98], [-118.485, 33.978]]),
  R(18, "marina-del-rey", "Marina del Rey", [[-118.485, 33.978], [-118.455, 33.98], [-118.445, 33.995], [-118.425, 33.99], [-118.43, 33.965], [-118.47, 33.96]]),
  R(19, "south-bay", "Manhattan / Hermosa Beach", [[-118.43, 33.905], [-118.385, 33.905], [-118.375, 33.85], [-118.41, 33.85]]),
  R(20, "lax", "LAX", [[-118.435, 33.928], [-118.375, 33.928], [-118.375, 33.955], [-118.435, 33.955]]),
  R(21, "inglewood", "Inglewood (SoFi / Forum)", [[-118.365, 33.935], [-118.32, 33.935], [-118.32, 33.975], [-118.365, 33.975]]),
  R(22, "universal-city", "Universal City / Studio City", [[-118.39, 34.13], [-118.34, 34.13], [-118.34, 34.15], [-118.39, 34.15]]),
  R(23, "glendale", "Glendale", [[-118.27, 34.135], [-118.235, 34.135], [-118.235, 34.16], [-118.27, 34.16]]),
  R(24, "pasadena", "Pasadena", [[-118.18, 34.125], [-118.11, 34.125], [-118.11, 34.17], [-118.18, 34.17]]),
];

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Region containing the point, or null (strict containment; docs/decisions.md D-004). */
export function regionIdFor(lat: number, lng: number): string | null {
  return REGIONS.find((r) => pointInPolygon(lat, lng, r.polygon))?.id ?? null;
}

/** Great-circle distance in km. */
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
