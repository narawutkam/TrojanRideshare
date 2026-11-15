/**
 * Canonical public contracts (README §3, §5). Import these everywhere; do not
 * redeclare DTO shapes in features. UUIDs cross the wire as strings and all
 * timestamps are ISO 8601 UTC with a `Z` suffix.
 */

export type Id = string;
export type UtcTime = string;

export type TripStatus = "open" | "full" | "in_progress" | "completed" | "cancelled";
export type ParticipantStatus = "confirmed" | "cancelled" | "no_show";

/** Private self view. */
export interface User {
  id: Id;
  email: string;
  displayName: string;
  verifiedUSC: boolean;
  createdAt: UtcTime;
}

/** Member roster view. */
export interface ParticipantSummary {
  userId: Id;
  displayName: string;
}

export interface Region {
  id: Id;
  name: string;
}

export interface Location {
  id: Id;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  regionId: Id | null;
  googlePlaceId: string | null;
}

export interface Trip {
  id: Id;
  bookerId: Id;
  pickupLocationId: Id;
  destinationLocationId: Id;
  departureTime: UtcTime;
  maxParticipants: number;
  participantCount: number;
  status: TripStatus;
  returnTripId: Id | null;
  createdAt: UtcTime;
}

/** Internal membership record. Never returned by discovery or roster payloads. */
export interface TripParticipant {
  id: Id;
  tripId: Id;
  userId: Id;
  /** Where this rider gets out. The Booker's is the trip destination (docs/decisions.md D-010). */
  destinationLocationId: Id;
  status: ParticipantStatus;
  joinedAt: UtcTime;
  agreementAcceptedAt: UtcTime | null;
  agreementVersion: string | null;
}

/** One drop-off in the planned route (docs/decisions.md D-010). */
export interface RouteStop {
  order: number;
  isFinal: boolean;
  location: Location;
  /** Minutes driven since the previous stop (or the pickup). */
  legMinutes: number;
  /** Minutes after departure until riders at this stop get out. */
  rideMinutes: number;
  /** Who gets out here. Null for nonmembers. */
  riders: ParticipantSummary[] | null;
}

/** Estimated fare split for a route (docs/decisions.md D-011). Demo rates; nothing is charged. */
export interface RoutePricing {
  /** Estimated Uber fare for the whole route. */
  estimatedTotal: number;
  /** The viewer's share of it. Null if the viewer is not on the route. */
  yourShare: number | null;
  /** What the viewer would pay riding alone straight to their own stop. */
  yourSoloPrice: number | null;
  /** yourSoloPrice − yourShare. Positive means sharing is cheaper. */
  yourSavings: number | null;
  /** Everyone's share. Members only; null for nonmembers. */
  shares: { userId: Id; displayName: string; amount: number }[] | null;
  pricePerMile: number;
}

/** The car-train plan for a trip: stops in driving order, with times estimated for departure time. */
export interface TripRoute {
  stops: RouteStop[];
  /** Minutes from departure until the last rider gets out. */
  totalMinutes: number;
  /** Most extra minutes any rider's ride may exceed their direct ride. */
  maxDetourMinutes: number;
  /** Estimated fares. Null if distances weren't available. */
  pricing: RoutePricing | null;
  /** The viewer's own stop and ride time. Null if the viewer is not on the route. */
  your: { order: number; rideMinutes: number; directMinutes: number; detourMinutes: number } | null;
}

/** Whether a destination fits a trip's route, and the route if it did (docs/decisions.md D-010). */
export interface TripFit {
  tripId: Id;
  fits: boolean;
  reason: "MAX_STOPS" | "DETOUR_LIMIT" | null;
  message: string | null;
  /** The stop this was checked for: the place the viewer searched for or picked. */
  stop: Location | null;
  /** The route including the viewer's stop. Present when it fits. */
  route: TripRoute | null;
}

/** One point on the route map. Order 0 is the pickup. */
export interface MapStop {
  order: number;
  kind: "pickup" | "stop" | "final";
  name: string;
  latitude: number;
  longitude: number;
  /** The viewer's own stop. */
  yours: boolean;
}

/** What to draw for a trip's route: the stops in order, and the road path through them when it is known. */
export interface TripMap {
  stops: MapStop[];
  /** Google encoded polyline of the drive through the stops, or null (the map then joins the stops with straight lines). */
  encodedPolyline: string | null;
}

export interface TripView {
  trip: Trip;
  pickup: Location;
  destination: Location;
  viewerMembership: ParticipantStatus | null;
  /** Null for nonmembers. */
  roster: ParticipantSummary[] | null;
  /** Planned stops and ride times. Null only if times could not be worked out. */
  route: TripRoute | null;
  /** Set when the list was searched by destination: does that destination fit this trip? */
  fit?: TripFit;
}

export interface ChatMessage {
  id: Id;
  tripId: Id;
  senderId: Id;
  content: string;
  createdAt: UtcTime;
}

export interface AttendanceReport {
  id: Id;
  tripId: Id;
  reporterId: Id;
  subjectId: Id;
  reason: "no_show";
  status: "pending" | "dismissed" | "upheld";
  createdAt: UtcTime;
}

/** Active agreement terms and signup policy, read from server config (README §7; proposed GET /api/terms). */
export interface AgreementTerms {
  version: string;
  text: string;
  /** Riders cannot leave within this many minutes of departure (docs/decisions.md D-003). */
  leaveCutoffMinutes: number;
  /** Most extra minutes any rider's ride may exceed a direct ride (docs/decisions.md D-010). */
  maxDetourMinutes: number;
}

/** What a deployment is configured with, shown by GET /api/health. Yes/no and Google's own error text only; never a secret. */
export interface HealthInfo {
  mode: "mock" | "live";
  googleKeyConfigured: boolean;
  /** Redis for shared demo data on serverless hosting (docs/deploy-vercel.md). */
  sharedDataConfigured: boolean;
  environment: string | null;
  region: string | null;
  commit: string | null;
  /** Present only for `?check=google`: one test call to each Google API. */
  google?: {
    configured: boolean;
    places: { ok: boolean; httpStatus: number | null; detail: string } | null;
    routes: { ok: boolean; httpStatus: number | null; detail: string } | null;
  };
}

// ---------- API envelope (README §5) ----------

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "TRIP_NOT_FOUND"
  | "TRIP_FULL"
  | "TRIP_CLOSED"
  | "ALREADY_REPORTED"
  /** Proposed in docs/decisions.md D-002: one active trip per rider. */
  | "ACTIVE_TRIP_EXISTS"
  /** Proposed in docs/decisions.md D-003: no leaving inside the cutoff window. */
  | "LEAVE_WINDOW_CLOSED"
  /** Proposed in docs/decisions.md D-010: the rider's stop would push a ride past the detour limit. */
  | "ROUTE_DETOUR_EXCEEDED"
  | "AGREEMENT_REQUIRED"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: { nextCursor: string | null };
}

export interface ApiFailure {
  success: false;
  error: { code: ErrorCode; message: string };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

// ---------- Request payloads (README §5) ----------

export interface ListTripsQuery {
  destinationLocationId?: Id;
  pickupLocationId?: Id;
  regionId?: Id;
  from?: UtcTime;
  to?: UtcTime;
  scope?: "discover" | "mine";
  cursor?: string;
}

export interface CreateTripInput {
  pickupLocationId: Id;
  destinationLocationId: Id;
  departureTime: UtcTime;
  returnDepartureTime?: UtcTime;
}

export interface JoinTripInput {
  agreementAccepted: true;
  agreementVersion: string;
  /** Where this rider gets out. Defaults to the trip destination. */
  destinationLocationId?: Id;
}

export interface SendMessageInput {
  content: string;
}

export interface ReportNoShowInput {
  subjectId: Id;
  reason: "no_show";
}

export const PAGE_SIZE = 25;
export const CHAT_MAX_LENGTH = 1000;
