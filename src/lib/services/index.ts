import { getConfig } from "@/config/env";
import { createGoogleMapsAdapter, createMockMapsAdapter } from "@/lib/maps/adapter";
import { getMockDb } from "@/lib/mock/store";
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
  return createServices({ db, clock: systemClock, config, maps });
}
