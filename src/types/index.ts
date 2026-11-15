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
  status: ParticipantStatus;
  joinedAt: UtcTime;
  agreementAcceptedAt: UtcTime | null;
  agreementVersion: string | null;
}

export interface TripView {
  trip: Trip;
  pickup: Location;
  destination: Location;
  viewerMembership: ParticipantStatus | null;
  /** Null for nonmembers. */
  roster: ParticipantSummary[] | null;
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
