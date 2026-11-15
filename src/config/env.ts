import { z } from "zod";

/**
 * Validated server settings (README §2, §4). Read once per process.
 *
 * Mock mode ships demo defaults. Live mode refuses to start without an
 * explicit, team-approved TRIP_CAPACITY (README §4 "Capacity conflict").
 */
const schema = z.object({
  APP_MODE: z.enum(["mock", "live"]).default("mock"),
  TRIP_CAPACITY: z.coerce.number().int().positive().optional(),
  AGREEMENT_VERSION: z.string().min(1).default("mock-terms-v1"),
  /** Riders cannot leave within this many minutes of departure (docs/decisions.md D-003). */
  LEAVE_CUTOFF_MINUTES: z.coerce.number().int().nonnegative().default(60),
  /** Pending-report demo for the honor system (README §1 R09). Reports never issue strikes. */
  ATTENDANCE_REPORTING: z.enum(["on", "off"]).default("on"),
  /** Most extra ride minutes any rider may be given by the group route (docs/decisions.md D-010). */
  ROUTE_MAX_DETOUR_MINUTES: z.coerce.number().positive().default(10),
  /** Estimated Uber price per road mile, used to split fares (docs/decisions.md D-011). Demo default; set the real rate. */
  UBER_PRICE_PER_MILE: z.coerce.number().positive().default(2.5),
  /** Estimated fee per intermediate stop. Demo default; set the real fee. */
  UBER_STOP_FEE: z.coerce.number().nonnegative().default(1),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
});

export type AppConfig = {
  appMode: "mock" | "live";
  tripCapacity: number;
  agreementVersion: string;
  leaveCutoffMinutes: number;
  attendanceReporting: boolean;
  routeMaxDetourMinutes: number;
  pricePerMile: number;
  stopFee: number;
  googleMapsApiKey?: string;
};

export const MOCK_DEFAULT_CAPACITY = 4;

let cached: AppConfig | null = null;

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  const e = parsed.data;
  if (e.APP_MODE === "live" && e.TRIP_CAPACITY === undefined) {
    throw new Error("TRIP_CAPACITY must be set to the team-approved value in live mode.");
  }
  return {
    appMode: e.APP_MODE,
    tripCapacity: e.TRIP_CAPACITY ?? MOCK_DEFAULT_CAPACITY,
    agreementVersion: e.AGREEMENT_VERSION,
    leaveCutoffMinutes: e.LEAVE_CUTOFF_MINUTES,
    attendanceReporting: e.ATTENDANCE_REPORTING === "on",
    routeMaxDetourMinutes: e.ROUTE_MAX_DETOUR_MINUTES,
    pricePerMile: e.UBER_PRICE_PER_MILE,
    stopFee: e.UBER_STOP_FEE,
    googleMapsApiKey: e.GOOGLE_MAPS_API_KEY || undefined,
  };
}

export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}

/** Agreement text shown at signup. Approved wording is an open decision (README §8). */
export const AGREEMENT_TEXT =
  "I will pay my share of the fare to the Booker. A cancellation fee may apply if I cancel close to departure or do not show up, and a no-show may be reported under the honor system. (Demo terms: no money is collected.)";
