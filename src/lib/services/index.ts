import { getConfig } from "@/config/env";
import { createFallbackMapsAdapter, createGoogleMapsAdapter, createMockMapsAdapter } from "@/lib/maps/adapter";
import { createFixtures, type MockDb } from "@/lib/mock/fixtures";
import { kvFromEnv, loadDemoDb, saveDemoDb, type KvClient } from "@/lib/mock/persistence";
import { getMockDb, getSeededAt, installMockDb } from "@/lib/mock/store";
import {
  createCachingTravelTimeProvider, createFallbackTravelTimeProvider, createGoogleTravelTimeProvider, createMockTravelTimeProvider, type TravelTimeProvider,
} from "@/lib/routing/travel-time";
import { AttendanceService } from "@/lib/services/attendance-service";
import type { ServiceContext } from "@/lib/services/context";
import { AppError } from "@/lib/services/errors";
import { LocationService } from "@/lib/services/location-service";
import { MessageService } from "@/lib/services/message-service";
import { TripService } from "@/lib/services/trip-service";
import { systemClock } from "@/lib/time";

export interface Services {
  trips: TripService;
  locations: LocationService;
  messages: MessageService;
  attendance: AttendanceService;
  ctx: ServiceContext;
}

export function createServices(ctx: ServiceContext): Services {
  return {
    trips: new TripService(ctx),
    locations: new LocationService(ctx),
    messages: new MessageService(ctx),
    attendance: new AttendanceService(ctx),
    ctx,
  };
}

// One cached provider per process, so repeated searches don't re-bill the same lookups.
let travelCache: { key: string | undefined; provider: TravelTimeProvider } | null = null;

function getTravelProvider(apiKey: string | undefined): TravelTimeProvider {
  if (!travelCache || travelCache.key !== apiKey) {
    const mock = createMockTravelTimeProvider();
    const base = apiKey ? createFallbackTravelTimeProvider(createGoogleTravelTimeProvider(apiKey), mock) : mock;
    travelCache = { key: apiKey, provider: createCachingTravelTimeProvider(base) };
  }
  return travelCache.provider;
}

/**
 * Seeded trips start with mock estimates. When real drive times are available, refresh each seeded trip once so
 * its route matches what a join check will say. Skips a trip whose riders changed while the lookup ran.
 */
const warmedDbs = new WeakSet<MockDb>();
function warmSeedRoutes(db: MockDb, travel: TravelTimeProvider): Promise<void> {
  if (warmedDbs.has(db)) return Promise.resolve();
  warmedDbs.add(db);
  const pending: Promise<void>[] = [];
  for (const trip of db.trips) {
    const base = trip.routeMatrix;
    if (!base || trip.status !== "open") continue;
    const place = (id: string) => db.locations.find((l) => l.id === id);
    const points = [place(trip.pickupLocationId), ...base.userIds.map((u) => place(db.participants.find((p) => p.tripId === trip.id && p.userId === u)?.destinationLocationId ?? ""))];
    if (points.some((p) => !p)) continue;
    const pts = points as NonNullable<(typeof points)[number]>[];
    const at = new Date(trip.departureTime);
    pending.push(Promise.all([travel.matrix(pts, at), travel.miles(pts, at)]).then(([minutes, miles]) => {
      if (trip.routeMatrix === base) trip.routeMatrix = { userIds: base.userIds, minutes, miles };
    }).catch(() => {}));
  }
  return Promise.all(pending).then(() => undefined);
}

// ---------- shared demo data on serverless hosting (docs/deploy-vercel.md) ----------

let kvClient: KvClient | null | undefined;
/** Whether shared demo data is configured (Redis), for the health report. */
export const sharedStoreConfigured = (): boolean => sharedStore() !== null;
const sharedStore = (): KvClient | null => (kvClient === undefined ? (kvClient = kvFromEnv()) : kvClient);
let lastSavedJson = "";

const ttlSeconds = () => Math.max(Math.round(getConfig().demoDataTtlHours * 3600 * 2), 3600);

/**
 * Load the shared snapshot (or seed a fresh one) into this process's store. Every request loads it, with no caching:
 * a trip created on one server must be visible to the very next request, which may reach another server.
 * Never throws: on failure the process keeps its own data.
 */
async function prepareRequest(): Promise<void> {
  const config = getConfig();
  const store = sharedStore();
  if (config.appMode !== "mock" || !store) return;
  try {
    const loaded = await loadDemoDb(store, {
      ttlMs: config.demoDataTtlHours * 3600_000,
      now: () => new Date(),
      seed: () => createFixtures(new Date(), config.tripCapacity),
    });
    installMockDb(loaded.db, loaded.seededAt);
    const db = getMockDb();
    if (loaded.created) {
      // A fresh seed: refresh its route times from Google once, then store it for every other server.
      if (config.googleMapsApiKey) await warmSeedRoutes(db, getTravelProvider(config.googleMapsApiKey));
      lastSavedJson = await saveDemoDb(store, db, getSeededAt(), "", ttlSeconds());
    } else {
      warmedDbs.add(db);
      lastSavedJson = loaded.json;
    }
  } catch (e) {
    console.error("Shared demo store unavailable:", e instanceof Error ? e.name : typeof e);
  }
}

async function finishRequest(): Promise<void> {
  const store = sharedStore();
  if (getConfig().appMode !== "mock" || !store) return;
  try {
    lastSavedJson = await saveDemoDb(store, getMockDb(), getSeededAt(), lastSavedJson, ttlSeconds());
  } catch (e) {
    console.error("Shared demo store could not save:", e instanceof Error ? e.name : typeof e);
  }
}

// Requests in one server run one at a time while the shared store is on, so two of them cannot load, change and save over each other.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Run an API handler against the shared demo data. Without a configured Redis this just runs the handler.
 * With one, the snapshot is loaded first and saved afterwards if the handler changed anything.
 */
export async function withDemoStore<T>(fn: () => Promise<T>, opts: { readOnly?: boolean } = {}): Promise<T> {
  if (!sharedStore() || getConfig().appMode !== "mock") return fn();
  const run = queue.then(async () => {
    await prepareRequest();
    try {
      return await fn();
    } finally {
      if (!opts.readOnly) await finishRequest();
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Resolve services for the current mode. Live persistence (Supabase) is not
 * implemented yet: live mode fails loudly instead of silently using mock data.
 */
export function getServices(): Services {
  const config = getConfig();
  if (config.appMode === "live") {
    throw new AppError("PROVIDER_UNAVAILABLE", "Live mode is not wired to Supabase yet. Run with APP_MODE=mock.");
  }
  const db = getMockDb();
  const catalog = createMockMapsAdapter(() => db.locations);
  const maps = config.googleMapsApiKey ? createFallbackMapsAdapter(createGoogleMapsAdapter(config.googleMapsApiKey), catalog) : catalog;
  const travel = getTravelProvider(config.googleMapsApiKey);
  if (config.googleMapsApiKey) warmSeedRoutes(db, travel);
  return createServices({ db, clock: systemClock, config, maps, travel });
}
