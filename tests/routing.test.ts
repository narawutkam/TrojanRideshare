import { describe, expect, it } from "vitest";
import { evaluateJoin, planRoute, type StopRequest } from "@/lib/routing/planner";
import { createGoogleTravelTimeProvider, createMockTravelTimeProvider, trafficMultiplier, type GeoPoint, type TravelTimeProvider } from "@/lib/routing/travel-time";

/**
 * Stub provider with explicit minutes. Each test point carries its name's index in `latitude`,
 * so the table is easy to read: table[from][to] = minutes.
 */
function tableProvider(names: string[], table: Record<string, Record<string, number>>): { provider: TravelTimeProvider; point: (n: string) => GeoPoint } {
  const point = (n: string): GeoPoint => ({ latitude: names.indexOf(n), longitude: 0 });
  return {
    point,
    provider: {
      async matrix(points) {
        return points.map((a) => points.map((b) => {
          const from = names[a.latitude];
          const to = names[b.latitude];
          return from === to ? 0 : table[from][to];
        }));
      },
      async miles(points) {
        return points.map((a) => points.map((b) => (a.latitude === b.latitude ? 0 : table[names[a.latitude]][names[b.latitude]] / 2)));
      },
    },
  };
}

const DEPART = new Date("2026-11-16T18:00:00Z");
const req = (riderId: string, point: GeoPoint): StopRequest => ({ riderId, point });

// P = pickup, H = Hollywood (creator), K = Koreatown (on the way), Z = a farther-out stop.
function scenario() {
  const names = ["P", "H", "K", "Z"];
  const { provider, point } = tableProvider(names, {
    P: { H: 30, K: 18, Z: 20 },
    K: { H: 14, P: 18, Z: 8 },
    Z: { H: 22, P: 20, K: 12 },
    H: { P: 30, K: 14, Z: 22 },
  });
  return { provider, point };
}

const base = (point: (n: string) => GeoPoint, provider: TravelTimeProvider, over: object = {}) => ({
  pickup: point("P"), departAt: DEPART, maxDetourMinutes: 10, stopDwellMinutes: 0, provider, ...over,
});

describe("planRoute: detour limit", () => {
  it("accepts Koreatown on the way to Hollywood: 30 min becomes 32, within a 10 min limit", async () => {
    const { provider, point } = scenario();
    const plan = await planRoute({ ...base(point, provider), committed: [req("hollywood", point("H"))], candidates: [req("korea", point("K"))] });
    expect(plan.rejected).toEqual([]);
    expect(plan.stops.map((s) => s.riderId)).toEqual(["korea", "hollywood"]);
    expect(plan.finalRiderId).toBe("hollywood");
    expect(plan.totalMinutes).toBe(32);
    expect(plan.stops[1]).toMatchObject({ directMinutes: 30, rideMinutes: 32, detourMinutes: 2, isFinal: true });
    expect(plan.stops[0]).toMatchObject({ rideMinutes: 18, detourMinutes: 0, legMinutes: 18, isFinal: false });
  });

  it("counts the pull-over time at each extra stop", async () => {
    const { provider, point } = scenario();
    const plan = await planRoute({ ...base(point, provider, { stopDwellMinutes: 1 }), committed: [req("hollywood", point("H"))], candidates: [req("korea", point("K"))] });
    expect(plan.totalMinutes).toBe(33);
    expect(plan.stops[1].detourMinutes).toBe(3);
  });

  it("rejects a stop that would push someone past the limit, and reports by how much", async () => {
    const { provider, point } = scenario();
    const plan = await planRoute({ ...base(point, provider), committed: [req("hollywood", point("H"))], candidates: [req("zed", point("Z"))] });
    // P→Z→H = 20 + 22 = 42: 12 over Hollywood's direct 30, so 2 over a 10 min limit.
    expect(plan.stops.map((s) => s.riderId)).toEqual(["hollywood"]);
    expect(plan.rejected).toHaveLength(1);
    expect(plan.rejected[0]).toMatchObject({ riderId: "zed", reason: "DETOUR_LIMIT", affectedRiderId: "hollywood", minutesOver: 2 });
  });

  it("accepts the same stop under a looser limit", async () => {
    const { provider, point } = scenario();
    const plan = await planRoute({ ...base(point, provider, { maxDetourMinutes: 15 }), committed: [req("hollywood", point("H"))], candidates: [req("zed", point("Z"))] });
    expect(plan.rejected).toEqual([]);
    expect(plan.stops.find((s) => s.riderId === "hollywood")?.detourMinutes).toBe(12);
  });

  it("lets a rider going farther become the final stop, if everyone stays within the limit", async () => {
    // B (Burbank) is past Hollywood: P→H→B = 30 + 12 = 42, B direct 40. B is +2, H is +0.
    const names = ["P", "H", "B"];
    const { provider, point } = tableProvider(names, {
      P: { H: 30, B: 40 }, H: { P: 30, B: 12 }, B: { P: 40, H: 12 },
    });
    const plan = await planRoute({ ...base(point, provider), committed: [req("hollywood", point("H"))], candidates: [req("burbank", point("B"))] });
    expect(plan.rejected).toEqual([]);
    expect(plan.stops.map((s) => s.riderId)).toEqual(["hollywood", "burbank"]);
    expect(plan.finalRiderId).toBe("burbank");
    expect(plan.stops.map((s) => s.detourMinutes)).toEqual([0, 2]);
  });

  it("applies the limit to the whole route: each stop fits alone, both together do not", async () => {
    const { provider, point } = scenario();
    // K alone: 32 (+2). Z alone: 42 (+12), fine at limit 14.
    // Together the best order is P→Z→K→H = 20+12+14 = 46 (+16), which is over 14 (the other order is 48).
    const common = base(point, provider, { maxDetourMinutes: 14 });
    const hollywood = req("hollywood", point("H"));
    const korea = req("korea", point("K"));
    const zed = req("zed", point("Z"));

    const koreaFirst = await planRoute({ ...common, committed: [hollywood], candidates: [korea, zed] });
    expect(koreaFirst.stops.map((s) => s.riderId)).toEqual(["korea", "hollywood"]);
    expect(koreaFirst.rejected.map((r) => r.riderId)).toEqual(["zed"]);

    // Priority matters: whoever is considered first keeps their spot.
    const zedFirst = await planRoute({ ...common, committed: [hollywood], candidates: [zed, korea] });
    expect(zedFirst.stops.map((s) => s.riderId)).toEqual(["zed", "hollywood"]);
    expect(zedFirst.rejected.map((r) => r.riderId)).toEqual(["korea"]);
  });

  it("reorders stops into the cheapest drive, whatever order people joined in", async () => {
    // Both on the way: P→K→Z→H (30) beats every other order.
    const names = ["P", "H", "K", "Z"];
    const { provider, point } = tableProvider(names, {
      P: { H: 30, K: 10, Z: 20 },
      K: { H: 22, P: 10, Z: 9 },
      Z: { H: 11, P: 20, K: 9 },
      H: { P: 30, K: 22, Z: 11 },
    });
    const plan = await planRoute({ ...base(point, provider), committed: [req("h", point("H"))], candidates: [req("z", point("Z")), req("k", point("K"))] });
    expect(plan.rejected).toEqual([]);
    expect(plan.stops.map((s) => s.riderId)).toEqual(["k", "z", "h"]);
    expect(plan.totalMinutes).toBe(30);
  });

  it("never makes room for a newcomer by hurting someone already aboard", async () => {
    // Non-metric on purpose (a freeway shortcut Y→H). X and H are fine together; adding Y breaks someone in every order.
    const names = ["P", "H", "X", "Y"];
    const { provider, point } = tableProvider(names, {
      P: { H: 30, X: 5, Y: 8 },
      X: { H: 28, P: 5, Y: 20 },
      Y: { H: 4, P: 8, X: 20 },
      H: { P: 30, X: 28, Y: 4 },
    });
    const plan = await planRoute({ ...base(point, provider), committed: [req("h", point("H")), req("x", point("X"))], candidates: [req("y", point("Y"))] });
    expect(plan.stops.map((s) => s.riderId)).toEqual(["x", "h"]);
    expect(plan.rejected[0]).toMatchObject({ riderId: "y", reason: "DETOUR_LIMIT" });
  });

  it("caps the number of riders", async () => {
    const { provider, point } = scenario();
    const plan = await planRoute({ ...base(point, provider, { maxStops: 1 }), committed: [req("h", point("H"))], candidates: [req("k", point("K"))] });
    expect(plan.rejected[0]).toMatchObject({ riderId: "k", reason: "MAX_STOPS" });
  });

  it("lets riders heading to the same place share a stop with no extra pull-over", async () => {
    const { provider, point } = scenario();
    const plan = await planRoute({ ...base(point, provider, { stopDwellMinutes: 1 }), committed: [req("a", point("H"))], candidates: [req("b", point("H"))] });
    expect(plan.rejected).toEqual([]);
    expect(plan.totalMinutes).toBe(30);
    expect(plan.stops.map((s) => s.rideMinutes)).toEqual([30, 30]);
  });

  it("throws if riders already in the trip cannot fit, rather than quietly dropping them", async () => {
    const { provider, point } = scenario();
    await expect(planRoute({ ...base(point, provider, { maxDetourMinutes: 5 }), committed: [req("h", point("H")), req("z", point("Z"))] })).rejects.toThrow(/no longer fit/);
  });

  it("evaluateJoin keeps existing riders and says whether the newcomer fits", async () => {
    const { provider, point } = scenario();
    const common = { ...base(point, provider), committed: [req("h", point("H"))] };
    const ok = await evaluateJoin({ ...common, newcomer: req("k", point("K")) });
    expect(ok.allowed).toBe(true);
    const no = await evaluateJoin({ ...common, newcomer: req("z", point("Z")) });
    expect(no.allowed).toBe(false);
    expect(no.rejection?.reason).toBe("DETOUR_LIMIT");
  });
});

describe("mock travel times by time of day", () => {
  const hollywood: GeoPoint = { latitude: 34.1016, longitude: -118.3267 };
  const koreatown: GeoPoint = { latitude: 34.0614, longitude: -118.3008 };
  const usc: GeoPoint = { latitude: 34.0224, longitude: -118.2851 };
  const mock = createMockTravelTimeProvider();

  // 2026-11-16 is a Monday. LA is UTC-8 in November.
  const at = (hhmmLA: string, day = "2026-11-16") => new Date(`${day}T${hhmmLA}:00-08:00`);

  it("is slower at evening rush than midday, and quickest at night", async () => {
    const rush = (await mock.matrix([usc, hollywood], at("17:30")))[0][1];
    const midday = (await mock.matrix([usc, hollywood], at("12:00")))[0][1];
    const night = (await mock.matrix([usc, hollywood], at("02:00")))[0][1];
    expect(rush).toBeGreaterThan(midday);
    expect(midday).toBeGreaterThan(night);
  });

  it("is lighter on a weekend morning than a weekday morning", () => {
    expect(trafficMultiplier(at("08:00", "2026-11-14"))).toBeLessThan(trafficMultiplier(at("08:00", "2026-11-16")));
  });

  it("has a zero diagonal and returns a full matrix", async () => {
    const m = await mock.matrix([usc, koreatown, hollywood], at("12:00"));
    expect(m).toHaveLength(3);
    m.forEach((row, i) => { expect(row).toHaveLength(3); expect(row[i]).toBe(0); });
  });

  it("plans USC → Hollywood with Koreatown on the way using real coordinates", async () => {
    const plan = await planRoute({
      pickup: usc, committed: [req("hollywood", hollywood)], candidates: [req("korea", koreatown)],
      departAt: at("12:00"), maxDetourMinutes: 10, provider: mock,
    });
    expect(plan.rejected).toEqual([]);
    expect(plan.stops.map((s) => s.riderId)).toEqual(["korea", "hollywood"]);
    expect(plan.stops.every((s) => s.detourMinutes <= 10)).toBe(true);
  });
});

describe("Google Routes adapter", () => {
  const a: GeoPoint = { latitude: 34.02, longitude: -118.28 };
  const b: GeoPoint = { latitude: 34.1, longitude: -118.32 };
  const fixedNow = () => new Date("2026-11-16T00:00:00Z");

  it("asks for traffic-aware times at the departure time and parses durations", async () => {
    let sent: { url: string; body: Record<string, unknown>; key: string | null } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)), key: new Headers(init.headers).get("X-Goog-Api-Key") };
      return new Response(JSON.stringify([
        { originIndex: 0, destinationIndex: 1, duration: "1800s", condition: "ROUTE_EXISTS" },
        { originIndex: 1, destinationIndex: 0, duration: "1950s", condition: "ROUTE_EXISTS" },
      ]), { status: 200 });
    }) as unknown as typeof fetch;
    const provider = createGoogleTravelTimeProvider("test-key", { fetchImpl, now: fixedNow });
    const m = await provider.matrix([a, b], new Date("2026-11-17T01:30:00Z"));
    expect(m).toEqual([[0, 30], [32.5, 0]]);
    expect(sent!.body).toMatchObject({ travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE", departureTime: "2026-11-17T01:30:00.000Z" });
    expect(sent!.key).toBe("test-key");
  });

  it("moves a past departure time forward, because Google needs a future time", async () => {
    let departure = "";
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      departure = JSON.parse(String(init.body)).departureTime;
      return new Response(JSON.stringify([
        { originIndex: 0, destinationIndex: 1, duration: "60s" },
        { originIndex: 1, destinationIndex: 0, duration: "60s" },
      ]), { status: 200 });
    }) as unknown as typeof fetch;
    await createGoogleTravelTimeProvider("k", { fetchImpl, now: fixedNow }).matrix([a, b], new Date("2020-01-01T00:00:00Z"));
    expect(departure).toBe("2026-11-16T00:01:00.000Z");
  });

  it("fails clearly when a route is missing or the API errors", async () => {
    const missing = (async () => new Response(JSON.stringify([{ originIndex: 0, destinationIndex: 1, condition: "ROUTE_NOT_FOUND" }]), { status: 200 })) as unknown as typeof fetch;
    await expect(createGoogleTravelTimeProvider("k", { fetchImpl: missing, now: fixedNow }).matrix([a, b], DEPART)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    const down = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await expect(createGoogleTravelTimeProvider("k", { fetchImpl: down, now: fixedNow }).matrix([a, b], DEPART)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
});
