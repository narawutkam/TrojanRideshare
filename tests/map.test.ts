import { describe, expect, it } from "vitest";
import { LOC, TRIP } from "@/lib/mock/fixtures";
import { createCachingTravelTimeProvider, createFallbackTravelTimeProvider, createGoogleTravelTimeProvider, createMockTravelTimeProvider, type GeoPoint, type TravelTimeProvider } from "@/lib/routing/travel-time";
import { AppError } from "@/lib/services/errors";
import { expectCode, setup } from "./helpers";

const A: GeoPoint = { latitude: 34.0224, longitude: -118.2851 };
const B: GeoPoint = { latitude: 34.0617, longitude: -118.3089 };
const C: GeoPoint = { latitude: 34.0983, longitude: -118.3243 };
const NOW = () => new Date("2026-11-16T00:00:00Z");
const DEPART = new Date("2026-11-17T01:30:00Z");

describe("route path from Google Routes", () => {
  function google(res: Response | Error) {
    const calls: { url: string; body: Record<string, unknown>; mask: string | null }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), mask: new Headers(init.headers).get("X-Goog-FieldMask") });
      if (res instanceof Error) throw res;
      return res;
    }) as unknown as typeof fetch;
    return { provider: createGoogleTravelTimeProvider("k", { fetchImpl, now: NOW }), calls };
  }

  it("asks for one drive through every stop in order and returns the encoded path", async () => {
    const { provider, calls } = google(Response.json({ routes: [{ polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC" } }] }));
    expect(await provider.path!([A, B, C], DEPART)).toBe("_p~iF~ps|U_ulLnnqC");
    expect(calls[0].url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
    expect(calls[0].mask).toBe("routes.polyline.encodedPolyline");
    expect(calls[0].body).toMatchObject({ travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE", polylineEncoding: "ENCODED_POLYLINE" });
    expect(calls[0].body.origin).toEqual({ location: { latLng: { latitude: A.latitude, longitude: A.longitude } } });
    expect(calls[0].body.destination).toEqual({ location: { latLng: { latitude: C.latitude, longitude: C.longitude } } });
    expect(calls[0].body.intermediates).toEqual([{ location: { latLng: { latitude: B.latitude, longitude: B.longitude } } }]);
  });

  it("sends no intermediates for a direct trip, and nothing for a single point", async () => {
    const { provider, calls } = google(Response.json({ routes: [{ polyline: { encodedPolyline: "x" } }] }));
    await provider.path!([A, C], DEPART);
    expect(calls[0].body).not.toHaveProperty("intermediates");
    expect(await provider.path!([A], DEPART)).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("moves a past departure time forward, because Google needs a future time", async () => {
    const { provider, calls } = google(Response.json({ routes: [{ polyline: { encodedPolyline: "x" } }] }));
    await provider.path!([A, C], new Date("2020-01-01T00:00:00Z"));
    expect(calls[0].body.departureTime).toBe("2026-11-16T00:01:00.000Z");
  });

  it("fails clearly, and the fallback provider turns that into 'no path'", async () => {
    const { provider } = google(new Response("nope", { status: 500 }));
    await expect(provider.path!([A, C], DEPART)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    const safe = createFallbackTravelTimeProvider(provider, createMockTravelTimeProvider());
    expect(await safe.path!([A, C], DEPART)).toBeNull();
  });

  it("returns null when Google finds no route", async () => {
    expect(await google(Response.json({})).provider.path!([A, C], DEPART)).toBeNull();
  });

  it("is cached for the same places and quarter hour", async () => {
    let calls = 0;
    const inner: TravelTimeProvider = { ...createMockTravelTimeProvider(), async path() { calls++; return "poly"; } };
    const cached = createCachingTravelTimeProvider(inner);
    expect(await cached.path!([A, C], DEPART)).toBe("poly");
    expect(await cached.path!([A, C], new Date(DEPART.getTime() + 60_000))).toBe("poly");
    expect(calls).toBe(1);
  });

  it("the estimate model has no path to draw", async () => {
    expect(await createMockTravelTimeProvider().path?.([A, C], DEPART)).toBeUndefined();
  });
});

describe("TripService.mapFor", () => {
  it("returns the pickup and each stop in driving order, with coordinates", async () => {
    const s = setup();
    const m = await s.trips.mapFor(s.USER.hannah, TRIP.palladium);
    expect(m.stops.map((x) => x.kind)).toEqual(["pickup", "final"]);
    expect(m.stops.map((x) => x.name)).toEqual(["USC Village", "Hollywood Palladium"]);
    for (const p of m.stops) {
      expect(Math.abs(p.latitude)).toBeGreaterThan(30);
      expect(p.longitude).toBeLessThan(-117);
    }
    expect(m.encodedPolyline).toBeNull(); // the estimate model draws no road path
  });

  it("previews the route with your stop in it before you join", async () => {
    const s = setup();
    const m = await s.trips.mapFor(s.USER.hannah, TRIP.palladium, LOC.wiltern);
    expect(m.stops.map((x) => x.name)).toEqual(["USC Village", "The Wiltern", "Hollywood Palladium"]);
    expect(m.stops.map((x) => x.kind)).toEqual(["pickup", "stop", "final"]);
    expect(m.stops.filter((x) => x.yours).map((x) => x.name)).toEqual(["The Wiltern"]);
  });

  it("shows the joined route, with your stop marked, once you are in", async () => {
    const s = setup();
    await s.trips.joinTrip(s.USER.hannah, TRIP.palladium, { ...s.terms, destinationLocationId: LOC.wiltern });
    const m = await s.trips.mapFor(s.USER.hannah, TRIP.palladium);
    expect(m.stops.map((x) => x.name)).toEqual(["USC Village", "The Wiltern", "Hollywood Palladium"]);
    expect(m.stops.find((x) => x.yours)?.name).toBe("The Wiltern");
  });

  it("falls back to the trip as it is when the preview stop does not fit", async () => {
    const s = setup();
    const m = await s.trips.mapFor(s.USER.hannah, TRIP.palladium, LOC.smPier);
    expect(m.stops.map((x) => x.name)).toEqual(["USC Village", "Hollywood Palladium"]);
    expect(m.stops.some((x) => x.yours)).toBe(false);
  });

  it("includes the road path when the provider can draw one, and survives it failing", async () => {
    const s = setup();
    const base = createMockTravelTimeProvider();
    s.ctx.travel = { ...base, async path(points) { return `path-through-${points.length}`; } };
    expect((await s.trips.mapFor(s.USER.hannah, TRIP.palladium, LOC.wiltern)).encodedPolyline).toBe("path-through-3");
    s.ctx.travel = { ...base, async path() { throw new AppError("PROVIDER_UNAVAILABLE", "down"); } };
    expect((await s.trips.mapFor(s.USER.hannah, TRIP.palladium, LOC.wiltern)).encodedPolyline).toBeNull();
  });

  it("rejects an unknown trip and a place outside the ride regions", async () => {
    const s = setup();
    await expectCode(() => s.trips.mapFor(s.USER.hannah, "00000000-0000-4000-8400-0000000000ff"), "TRIP_NOT_FOUND");
    await expectCode(() => s.trips.mapFor(s.USER.hannah, TRIP.palladium, LOC.longBeach), "VALIDATION_ERROR");
  });
});
