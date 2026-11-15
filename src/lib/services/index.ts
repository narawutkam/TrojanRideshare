import { getConfig } from "@/config/env";
import { createGoogleMapsAdapter, createMockMapsAdapter } from "@/lib/maps/adapter";
import type { MockDb } from "@/lib/mock/fixtures";
import { getMockDb } from "@/lib/mock/store";
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
function warmSeedRoutes(db: MockDb, travel: TravelTimeProvider): void {
  if (warmedDbs.has(db)) return;
  warmedDbs.add(db);
  for (const trip of db.trips) {
    const base = trip.routeMatrix;
    if (!base || trip.status !== "open") continue;
    const place = (id: string) => db.locations.find((l) => l.id === id);
    const points = [place(trip.pickupLocationId), ...base.userIds.map((u) => place(db.participants.find((p) => p.tripId === trip.id && p.userId === u)?.destinationLocationId ?? ""))];
    if (points.some((p) => !p)) continue;
    const pts = points as NonNullable<(typeof points)[number]>[];
    const at = new Date(trip.departureTime);
    Promise.all([travel.matrix(pts, at), travel.miles(pts, at)]).then(([minutes, miles]) => {
      if (trip.routeMatrix === base) trip.routeMatrix = { userIds: base.userIds, minutes, miles };
    }).catch(() => {});
  }
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
  const maps = config.googleMapsApiKey ? createGoogleMapsAdapter(config.googleMapsApiKey) : createMockMapsAdapter(() => db.locations);
  const travel = getTravelProvider(config.googleMapsApiKey);
  if (config.googleMapsApiKey) warmSeedRoutes(db, travel);
  return createServices({ db, clock: systemClock, config, maps, travel });
}
