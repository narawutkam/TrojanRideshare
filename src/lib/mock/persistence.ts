import type { MockDb } from "@/lib/mock/fixtures";
import type { Location } from "@/types";

/**
 * Shared demo data for serverless hosting (docs/deploy-vercel.md).
 *
 * On Vercel every request can land on a different short-lived server with its own memory, so the
 * in-memory demo store would forget trips and joins between requests. When a Redis REST endpoint is
 * configured, the whole store is kept as one JSON snapshot there: loaded at the start of a request and
 * saved at the end if it changed. Last write wins, which is fine for a demo but not for production data.
 * Without Redis nothing here is used and the app keeps its data in process memory, as in local dev.
 */

export const DEMO_KEY = "trojan-rideshare:demo:v1";

export interface KvClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/** Upstash Redis over its REST API (what Vercel's Redis integration provides). */
export function createUpstashKv(url: string, token: string, fetchImpl: typeof fetch = fetch): KvClient {
  async function run(command: (string | number)[]): Promise<unknown> {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`KV request failed (${res.status})`);
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (body.error) throw new Error("KV command failed");
    return body.result;
  }
  return {
    async get(key) {
      const r = await run(["GET", key]);
      return typeof r === "string" ? r : null;
    },
    async set(key, value, ttlSeconds) {
      await run(["SET", key, value, "EX", ttlSeconds]);
    },
  };
}

/**
 * A setting by its standard name, or with any prefix Vercel may have added when the database was connected to the
 * project (for example STORAGE_KV_REST_API_URL). The read-only token is never used: the app needs to write.
 */
function findEnv(env: Record<string, string | undefined>, names: string[]): string | undefined {
  for (const name of names) if (env[name]) return env[name];
  for (const [key, value] of Object.entries(env)) {
    if (value && names.some((name) => key.endsWith(`_${name}`)) && !key.includes("READ_ONLY")) return value;
  }
  return undefined;
}

/** Vercel's Redis integration sets KV_REST_API_*; a direct Upstash database sets UPSTASH_REDIS_REST_*. Either may carry a prefix. */
export function kvFromEnv(env: Record<string, string | undefined> = process.env): KvClient | null {
  const url = findEnv(env, ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL"]);
  const token = findEnv(env, ["KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN"]);
  return url && token ? createUpstashKv(url, token) : null;
}

/**
 * Keep the places found by a Google search when demo data is reseeded. Pages that are open at the time still hold
 * those places' ids, and a reseed that forgot them would turn the rider's next tap into "unknown destination".
 */
export function carryOverPlaces(into: MockDb, previous: Location[] | undefined): MockDb {
  const have = new Set(into.locations.map((l) => l.id));
  for (const l of previous ?? []) if (l.googlePlaceId && !have.has(l.id)) into.locations.push(l);
  return into;
}

export interface Loaded {
  db: MockDb;
  seededAt: string;
  /** True when no usable snapshot existed and a fresh seed was created. */
  created: boolean;
  /** JSON of `db` as loaded, for change detection. Empty for a fresh seed. */
  json: string;
}

/**
 * The stored snapshot if it is still fresh, otherwise a new seed. Seeded trips are dated relative to "now",
 * so a snapshot older than `ttlMs` is replaced rather than left showing trips that already departed.
 */
export async function loadDemoDb(kv: KvClient, opts: { ttlMs: number; now: () => Date; seed: () => MockDb }): Promise<Loaded> {
  const raw = await kv.get(DEMO_KEY);
  let stale: MockDb | undefined;
  if (raw) {
    try {
      const snap = JSON.parse(raw) as { seededAt?: string; db?: MockDb };
      if (snap.db && snap.seededAt && opts.now().getTime() - Date.parse(snap.seededAt) < opts.ttlMs) {
        return { db: snap.db, seededAt: snap.seededAt, created: false, json: JSON.stringify(snap.db) };
      }
      stale = snap.db;
    } catch {
      /* unreadable snapshot: fall through and reseed */
    }
  }
  return { db: carryOverPlaces(opts.seed(), stale?.locations), seededAt: opts.now().toISOString(), created: true, json: "" };
}

/** Write the snapshot only if it changed since `lastJson`. Returns the JSON now stored. */
export async function saveDemoDb(kv: KvClient, db: MockDb, seededAt: string, lastJson: string, ttlSeconds: number): Promise<string> {
  const json = JSON.stringify(db);
  if (json === lastJson) return lastJson;
  await kv.set(DEMO_KEY, JSON.stringify({ seededAt, db }), ttlSeconds);
  return json;
}
