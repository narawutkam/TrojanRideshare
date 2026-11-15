import { describeGoogleError } from "@/lib/maps/adapter";
import { AppError } from "@/lib/services/errors";
import { APP_TIME_ZONE } from "@/lib/time";

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * Provider boundary for drive times (mirrors MapsAdapter: mock for demos, Google for live).
 * `matrix(points, departAt)[i][j]` is the driving time in MINUTES from points[i] to points[j]
 * for a car leaving at `departAt`. The diagonal is 0. It need not be symmetric: traffic and
 * one-way streets make A→B differ from B→A, and the planner handles that.
 */
export interface TravelTimeProvider {
  matrix(points: GeoPoint[], departAt: Date): Promise<number[][]>;
  /** Road miles between the same points, `miles(points)[i][j]` from points[i] to points[j]. Used for pricing. */
  miles(points: GeoPoint[], departAt: Date): Promise<number[][]>;
  /**
   * The road path through the points in order, as a Google encoded polyline, for drawing the route on a map.
   * Null when the provider cannot draw one (the estimate model); the map then joins the stops with straight lines.
   */
  path?(points: GeoPoint[], departAt: Date): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Mock estimator (no credentials). Distance-based with an LA time-of-day curve.
// ---------------------------------------------------------------------------

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Piecewise-linear curve through (hour, multiplier) anchors. */
function curve(points: [number, number][], hour: number): number {
  for (let i = 1; i < points.length; i++) {
    const [h1, m1] = points[i - 1];
    const [h2, m2] = points[i];
    if (hour <= h2) return m1 + ((m2 - m1) * (hour - h1)) / (h2 - h1);
  }
  return points[points.length - 1][1];
}

// 1.0 = free-flow. Weekday has a morning and a stronger evening rush; weekends are a flatter afternoon bump.
const WEEKDAY: [number, number][] = [[0, 1.0], [5, 1.0], [6.5, 1.25], [8, 1.6], [9.5, 1.5], [11, 1.25], [14, 1.25], [16, 1.55], [17.5, 1.8], [19, 1.55], [20.5, 1.2], [22, 1.05], [24, 1.0]];
const WEEKEND: [number, number][] = [[0, 1.0], [8, 1.0], [11, 1.2], [14, 1.3], [18, 1.3], [21, 1.15], [24, 1.0]];

/** Traffic slow-down factor (≥ 1) for a departure instant, in Los Angeles local time. */
export function trafficMultiplier(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, weekday: "short", hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 12) + Number(parts.find((p) => p.type === "minute")?.value ?? 0) / 60;
  return curve(weekday === "Sat" || weekday === "Sun" ? WEEKEND : WEEKDAY, hour);
}

export interface MockTravelTimeOptions {
  /** Road distance ÷ straight-line distance. LA's grid and freeways land around 1.3–1.4. */
  circuity?: number;
  /** Average speed with no traffic, km/h (surface streets and freeways blended). */
  freeFlowKmh?: number;
}

/** Rough but deterministic: straight-line distance × circuity ÷ speed × time-of-day traffic. Not real traffic. */
export function estimateMatrix(points: GeoPoint[], departAt: Date, opts: MockTravelTimeOptions = {}): number[][] {
  const circuity = opts.circuity ?? 1.35;
  const kmh = opts.freeFlowKmh ?? 40;
  const factor = trafficMultiplier(departAt);
  return points.map((a, i) =>
    points.map((b, j) => {
      if (i === j) return 0;
      const km = haversineKm(a, b) * circuity;
      if (km < 0.05) return 0; // same place
      return Math.max(1, Math.round(((km / kmh) * 60 * factor) * 10) / 10);
    }),
  );
}

const KM_PER_MILE = 1.609344;

/** Straight-line distance × circuity, in miles. */
export function estimateMiles(points: GeoPoint[], opts: MockTravelTimeOptions = {}): number[][] {
  const circuity = opts.circuity ?? 1.35;
  return points.map((a, i) => points.map((b, j) => (i === j ? 0 : Math.round((haversineKm(a, b) * circuity / KM_PER_MILE) * 100) / 100)));
}

export function createMockTravelTimeProvider(opts: MockTravelTimeOptions = {}): TravelTimeProvider {
  return {
    async matrix(points, departAt) { return estimateMatrix(points, departAt, opts); },
    async miles(points) { return estimateMiles(points, opts); },
  };
}

/** Use `primary`; if it is unavailable, fall back to `fallback` so a provider outage never blocks a ride. */
export function createFallbackTravelTimeProvider(primary: TravelTimeProvider, fallback: TravelTimeProvider): TravelTimeProvider {
  const guard = async (run: (p: TravelTimeProvider) => Promise<number[][]>) => {
    try {
      return await run(primary);
    } catch (e) {
      if (e instanceof AppError && e.code === "PROVIDER_UNAVAILABLE") return run(fallback);
      throw e;
    }
  };
  return {
    matrix: (points, departAt) => guard((p) => p.matrix(points, departAt)),
    miles: (points, departAt) => guard((p) => p.miles(points, departAt)),
    async path(points, departAt) {
      try {
        return (await primary.path?.(points, departAt)) ?? null;
      } catch (e) {
        if (e instanceof AppError && e.code === "PROVIDER_UNAVAILABLE") return (await fallback.path?.(points, departAt)) ?? null;
        throw e;
      }
    },
  };
}

/** Remember answers for a few minutes. Same places and the same quarter-hour of departure share an entry. */
export function createCachingTravelTimeProvider(inner: TravelTimeProvider, ttlMs = 10 * 60_000, now: () => number = Date.now): TravelTimeProvider {
  const cache = new Map<string, { at: number; value: number[][] }>();
  const cached = (kind: "m" | "mi", ask: (points: GeoPoint[], at: Date) => Promise<number[][]>) => async (points: GeoPoint[], departAt: Date) => {
    const bucket = Math.floor(departAt.getTime() / (15 * 60_000));
    const key = `${kind}|${bucket}|${points.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join(";")}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value.map((r) => r.slice());
    const value = await ask(points, departAt);
    cache.set(key, { at: now(), value });
    if (cache.size > 500) cache.delete(cache.keys().next().value as string);
    return value.map((r) => r.slice());
  };
  const pathCache = new Map<string, { at: number; value: string | null }>();
  return {
    matrix: cached("m", (p, a) => inner.matrix(p, a)),
    miles: cached("mi", (p, a) => inner.miles(p, a)),
    async path(points, departAt) {
      const bucket = Math.floor(departAt.getTime() / (15 * 60_000));
      const key = `p|${bucket}|${points.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join(";")}`;
      const hit = pathCache.get(key);
      if (hit && now() - hit.at < ttlMs) return hit.value;
      const value = (await inner.path?.(points, departAt)) ?? null;
      pathCache.set(key, { at: now(), value });
      if (pathCache.size > 200) pathCache.delete(pathCache.keys().next().value as string);
      return value;
    },
  };
}

// ---------------------------------------------------------------------------
// Live: Google Routes API, traffic-aware for the departure time.
// ---------------------------------------------------------------------------

export interface GoogleRoutesOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

type MatrixElement = { originIndex?: number; destinationIndex?: number; duration?: string; distanceMeters?: number; condition?: string; status?: { code?: number } };
type Both = { minutes: number[][]; miles: number[][] };

/**
 * Google Routes `computeRouteMatrix` with TRAFFIC_AWARE routing. The key is server-only (README §7).
 * One request returns both drive time and distance, and `matrix()` and `miles()` share it.
 * Google requires a departure time in the future, so past or "now" times are bumped forward a minute.
 */
export function createGoogleTravelTimeProvider(apiKey: string, opts: GoogleRoutesOptions = {}): TravelTimeProvider {
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());
  const waypoint = (p: GeoPoint) => ({ waypoint: { location: { latLng: { latitude: p.latitude, longitude: p.longitude } } } });
  const unavailable = (msg = "Travel times are unavailable. Try again.") => new AppError("PROVIDER_UNAVAILABLE", msg);

  async function fetchBoth(points: GeoPoint[], departAt: Date): Promise<Both> {
    const n = points.length;
    const grid = () => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Number.NaN)));
    const out: Both = { minutes: grid(), miles: grid() };
    if (n < 2) return out;

    const earliest = now().getTime() + 60_000;
    const departure = new Date(Math.max(departAt.getTime(), earliest)).toISOString();
    let res: Response;
    try {
      res = await doFetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition,status",
        },
        body: JSON.stringify({
          origins: points.map(waypoint),
          destinations: points.map(waypoint),
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          departureTime: departure,
        }),
        cache: "no-store",
      });
    } catch {
      throw unavailable();
    }
    if (!res.ok) throw unavailable();

    const body = (await res.json()) as MatrixElement[];
    for (const el of Array.isArray(body) ? body : []) {
      const { originIndex: i, destinationIndex: j } = el;
      if (i === undefined || j === undefined || i === j || el.condition === "ROUTE_NOT_FOUND") continue;
      const seconds = el.duration ? Number.parseFloat(el.duration) : Number.NaN; // "1234s"
      if (Number.isFinite(seconds)) out.minutes[i][j] = Math.round((seconds / 60) * 10) / 10;
      if (typeof el.distanceMeters === "number") out.miles[i][j] = Math.round((el.distanceMeters / 1609.344) * 100) / 100;
    }
    return out;
  }

  // Share one request between matrix() and miles() for the same places and departure.
  const memo = new Map<string, { at: number; value: Promise<Both> }>();
  function both(points: GeoPoint[], departAt: Date): Promise<Both> {
    const key = `${departAt.getTime()}|${points.map((p) => `${p.latitude},${p.longitude}`).join(";")}`;
    const hit = memo.get(key);
    if (hit && now().getTime() - hit.at < 60_000) return hit.value;
    const value = fetchBoth(points, departAt);
    memo.set(key, { at: now().getTime(), value });
    value.catch(() => memo.delete(key));
    if (memo.size > 50) memo.delete(memo.keys().next().value as string);
    return value;
  }

  const complete = (m: number[][]) => {
    if (m.some((row) => row.some((v) => Number.isNaN(v)))) throw unavailable("Some destinations could not be routed.");
    return m;
  };
  const latLng = (p: GeoPoint) => ({ location: { latLng: { latitude: p.latitude, longitude: p.longitude } } });

  /** Routes API computeRoutes: one drive through every stop, in order. Only the encoded path is requested. */
  async function drivePath(points: GeoPoint[], departAt: Date): Promise<string | null> {
    if (points.length < 2) return null;
    const earliest = now().getTime() + 60_000;
    const departure = new Date(Math.max(departAt.getTime(), earliest)).toISOString();
    let res: Response;
    try {
      res = await doFetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "routes.polyline.encodedPolyline" },
        body: JSON.stringify({
          origin: latLng(points[0]),
          destination: latLng(points[points.length - 1]),
          ...(points.length > 2 ? { intermediates: points.slice(1, -1).map(latLng) } : {}),
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          departureTime: departure,
          polylineQuality: "OVERVIEW",
          polylineEncoding: "ENCODED_POLYLINE",
        }),
        cache: "no-store",
      });
    } catch {
      throw unavailable("The route path is unavailable.");
    }
    if (!res.ok) throw unavailable("The route path is unavailable.");
    const body = (await res.json()) as { routes?: { polyline?: { encodedPolyline?: string } }[] };
    return body.routes?.[0]?.polyline?.encodedPolyline ?? null;
  }

  return {
    async matrix(points, departAt) { return complete((await both(points, departAt)).minutes); },
    async miles(points, departAt) { return complete((await both(points, departAt)).miles); },
    path: drivePath,
  };
}

/** One small Routes API call, to show whether this key can compute drive times from this server. */
export async function probeGoogleRoutes(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; httpStatus: number | null; detail: string }> {
  const waypoint = (latitude: number, longitude: number) => ({ waypoint: { location: { latLng: { latitude, longitude } } } });
  try {
    const res = await fetchImpl("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "originIndex,destinationIndex,duration,condition" },
      body: JSON.stringify({
        origins: [waypoint(34.0224, -118.2851)],
        destinations: [waypoint(34.1016, -118.3267)],
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        departureTime: new Date(Date.now() + 3600_000).toISOString(),
      }),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, httpStatus: res.status, detail: await describeGoogleError(res) };
    return { ok: true, httpStatus: res.status, detail: "OK" };
  } catch {
    return { ok: false, httpStatus: null, detail: "Could not reach Google from this server." };
  }
}
