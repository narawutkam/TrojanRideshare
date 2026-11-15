import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixtures } from "@/lib/mock/fixtures";
import { carryOverPlaces, createUpstashKv, DEMO_KEY, kvFromEnv, loadDemoDb, saveDemoDb, type KvClient } from "@/lib/mock/persistence";
import { TRIP, USER } from "@/lib/mock/fixtures";

const NOW = new Date("2026-11-13T18:00:00Z");
const HOUR = 3600_000;

function memoryKv(): KvClient & { sets: number; data: Map<string, string> } {
  const data = new Map<string, string>();
  const kv = {
    sets: 0,
    data,
    async get(key: string) { return data.get(key) ?? null; },
    async set(key: string, value: string) { kv.sets++; data.set(key, value); },
  };
  return kv;
}

describe("shared demo snapshot", () => {
  const opts = { ttlMs: 6 * HOUR, now: () => NOW, seed: () => createFixtures(NOW, 4) };

  it("seeds when nothing is stored, and loads the same data back afterwards", async () => {
    const kv = memoryKv();
    const first = await loadDemoDb(kv, opts);
    expect(first.created).toBe(true);
    await saveDemoDb(kv, first.db, first.seededAt, first.json, 3600);
    const second = await loadDemoDb(kv, opts);
    expect(second.created).toBe(false);
    expect(second.db.trips.length).toBe(first.db.trips.length);
    expect(second.seededAt).toBe(first.seededAt);
  });

  it("only writes when the data changed", async () => {
    const kv = memoryKv();
    const first = await loadDemoDb(kv, opts);
    let json = await saveDemoDb(kv, first.db, first.seededAt, first.json, 3600);
    expect(kv.sets).toBe(1);
    json = await saveDemoDb(kv, first.db, first.seededAt, json, 3600);
    expect(kv.sets).toBe(1); // unchanged
    first.db.messages.pop();
    await saveDemoDb(kv, first.db, first.seededAt, json, 3600);
    expect(kv.sets).toBe(2);
  });

  it("reseeds a snapshot older than the limit, because its trips are dated from the seed time", async () => {
    const kv = memoryKv();
    const first = await loadDemoDb(kv, opts);
    await saveDemoDb(kv, first.db, first.seededAt, "", 3600);
    const later = await loadDemoDb(kv, { ...opts, now: () => new Date(NOW.getTime() + 7 * HOUR) });
    expect(later.created).toBe(true);
  });

  it("reseeds when the stored value cannot be read", async () => {
    const kv = memoryKv();
    kv.data.set(DEMO_KEY, "not json");
    expect((await loadDemoDb(kv, opts)).created).toBe(true);
  });
});

describe("Upstash client", () => {
  it("sends commands as a JSON array with the token and reads the result", async () => {
    const calls: { url: string; body: unknown; auth: string | null }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get("Authorization") });
      return Response.json({ result: "stored" });
    }) as unknown as typeof fetch;
    const kv = createUpstashKv("https://kv.example.test", "secret-token", fetchImpl);
    expect(await kv.get("k")).toBe("stored");
    await kv.set("k", "v", 60);
    expect(calls[0]).toMatchObject({ url: "https://kv.example.test", body: ["GET", "k"], auth: "Bearer secret-token" });
    expect(calls[1].body).toEqual(["SET", "k", "v", "EX", 60]);
  });

  it("is off unless both settings exist, and accepts either naming", () => {
    expect(kvFromEnv({})).toBeNull();
    expect(kvFromEnv({ KV_REST_API_URL: "https://x" })).toBeNull();
    expect(kvFromEnv({ KV_REST_API_URL: "https://x", KV_REST_API_TOKEN: "t" })).not.toBeNull();
    expect(kvFromEnv({ UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" })).not.toBeNull();
  });

  it("finds the settings when Vercel added a prefix to their names", () => {
    expect(kvFromEnv({ STORAGE_KV_REST_API_URL: "https://x", STORAGE_KV_REST_API_TOKEN: "t" })).not.toBeNull();
    expect(kvFromEnv({ MY_DB_UPSTASH_REDIS_REST_URL: "https://x", MY_DB_UPSTASH_REDIS_REST_TOKEN: "t" })).not.toBeNull();
  });

  it("never uses the read-only token, because the app has to write", () => {
    expect(kvFromEnv({ KV_REST_API_URL: "https://x", KV_REST_API_READ_ONLY_TOKEN: "readonly" })).toBeNull();
    expect(kvFromEnv({ STORAGE_KV_REST_API_URL: "https://x", STORAGE_KV_REST_API_READ_ONLY_TOKEN: "readonly" })).toBeNull();
  });

  it("does not mistake unrelated variables for the settings", () => {
    expect(kvFromEnv({ SOMETHING_URL: "https://x", OTHER_TOKEN: "t", KV_URL: "redis://x" })).toBeNull();
  });
});

/** A fake Upstash endpoint backed by a Map. Several "servers" share one Map, like several Vercel instances share one database. */
function fakeUpstash(data: Map<string, string>, state: { down?: boolean; sets: number }): typeof fetch {
  return (async (_url: string, init: RequestInit) => {
    if (state.down) throw new Error("network down");
    const [cmd, key, value] = JSON.parse(String(init.body)) as [string, string, string];
    if (cmd === "GET") return Response.json({ result: data.get(key) ?? null });
    if (cmd === "SET") { state.sets++; data.set(key, value); return Response.json({ result: "OK" }); }
    return Response.json({ error: "unsupported" }, { status: 400 });
  }) as unknown as typeof fetch;
}

/** Start a brand-new "server": no in-memory data and fresh module state, pointed at the shared fake Redis. */
async function startServer(data: Map<string, string>, state: { down?: boolean; sets: number }) {
  vi.resetModules();
  vi.stubEnv("KV_REST_API_URL", "https://kv.example.test");
  vi.stubEnv("KV_REST_API_TOKEN", "test-token");
  vi.stubGlobal("fetch", fakeUpstash(data, state));
  (globalThis as { __hacksc_mock_db?: unknown }).__hacksc_mock_db = undefined;
  return import("@/lib/services");
}

describe("withDemoStore across servers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const terms = { agreementAccepted: true, agreementVersion: "mock-terms-v1" };

  it("keeps a join made on one server visible on another", async () => {
    const data = new Map<string, string>();
    const state = { sets: 0 };

    const a = await startServer(data, state);
    await a.withDemoStore(async () => { await a.getServices().trips.joinTrip(USER.tommy, TRIP.palladium, terms); });

    const b = await startServer(data, state); // a different server with empty memory
    const view = await b.withDemoStore(async () => b.getServices().trips.getTrip(USER.tommy, TRIP.palladium), { readOnly: true });
    expect(view.viewerMembership).toBe("confirmed");
    expect(view.trip.participantCount).toBe(2);
  });

  it("does not write when a request changes nothing", async () => {
    const data = new Map<string, string>();
    const state = { sets: 0 };
    const a = await startServer(data, state);
    await a.withDemoStore(async () => a.getServices().trips.getTrip(USER.tommy, TRIP.palladium)); // seeds and stores once
    const afterSeed = state.sets;
    await a.withDemoStore(async () => a.getServices().trips.getTrip(USER.tommy, TRIP.palladium)); // a write-mode request that changes nothing
    expect(state.sets).toBe(afterSeed);
  });

  it("starts from fresh seed data once the stored data is too old", async () => {
    const data = new Map<string, string>();
    const state = { sets: 0 };
    const a = await startServer(data, state);
    await a.withDemoStore(async () => { await a.getServices().trips.joinTrip(USER.tommy, TRIP.palladium, terms); });

    // Age the stored snapshot past the 6 hour limit.
    const snap = JSON.parse(data.get(DEMO_KEY)!);
    snap.seededAt = new Date(Date.now() - 7 * HOUR).toISOString();
    data.set(DEMO_KEY, JSON.stringify(snap));

    const b = await startServer(data, state);
    const view = await b.withDemoStore(async () => b.getServices().trips.getTrip(USER.tommy, TRIP.palladium));
    expect(view.viewerMembership).toBeNull(); // the old join is gone with the old data
    expect(view.trip.participantCount).toBe(1);
  });

  it("still serves requests from memory if Redis is unreachable", async () => {
    const data = new Map<string, string>();
    const state = { sets: 0, down: true };
    const a = await startServer(data, state);
    const view = await a.withDemoStore(async () => a.getServices().trips.getTrip(USER.tommy, TRIP.palladium));
    expect(view.trip.id).toBe(TRIP.palladium);
  });

  it("runs requests one at a time within a server", async () => {
    const a = await startServer(new Map(), { sets: 0 });
    const log: string[] = [];
    const slow = (name: string, ms: number) => a.withDemoStore(async () => {
      log.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`end ${name}`);
    });
    await Promise.all([slow("one", 30), slow("two", 1)]);
    expect(log).toEqual(["start one", "end one", "start two", "end two"]);
  });

  it("just runs the handler when no shared store is configured", async () => {
    vi.resetModules();
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const a = await import("@/lib/services");
    expect(await a.withDemoStore(async () => 42)).toBe(42);
  });
});

describe("reseeding keeps searched places", () => {
  const googlePlace = { id: "11111111-1111-4111-8111-111111111111", name: "Quarters Korean BBQ", address: "LA", latitude: 34.06, longitude: -118.3, regionId: null, googlePlaceId: "ChIJ-test" };

  it("carries Google places into a stale reseed, so an open page's place id still works", async () => {
    const kv = memoryKv();
    const first = await loadDemoDb(kv, { ttlMs: 6 * HOUR, now: () => NOW, seed: () => createFixtures(NOW, 4) });
    first.db.locations.push(googlePlace);
    await saveDemoDb(kv, first.db, first.seededAt, "", 3600);
    const later = await loadDemoDb(kv, { ttlMs: 6 * HOUR, now: () => new Date(NOW.getTime() + 7 * HOUR), seed: () => createFixtures(new Date(NOW.getTime() + 7 * HOUR), 4) });
    expect(later.created).toBe(true);
    expect(later.db.locations.find((l) => l.id === googlePlace.id)?.name).toBe("Quarters Korean BBQ");
    expect(later.db.locations.filter((l) => l.id === googlePlace.id)).toHaveLength(1);
  });

  it("does not carry over the built-in catalog twice, or anything that is not from Google", () => {
    const next = createFixtures(NOW, 4);
    const before = next.locations.length;
    carryOverPlaces(next, [...next.locations, { ...googlePlace, googlePlaceId: null, id: "22222222-2222-4222-8222-222222222222" }]);
    expect(next.locations).toHaveLength(before);
  });
});
