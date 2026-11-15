"use client";

import type {
  AgreementTerms, ApiResponse, AttendanceReport, ChatMessage, CreateTripInput, ErrorCode, ListTripsQuery, Location, Region, TripView, User,
} from "@/types";

/** Typed browser client for the routes in README §5. Screens never call fetch directly. */

export class ApiError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export interface Page<T> {
  items: T;
  nextCursor: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<Page<T>> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
  } catch {
    throw new ApiError("PROVIDER_UNAVAILABLE", "You appear to be offline. Check your connection and retry.", 0);
  }
  let body: ApiResponse<T>;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError("INTERNAL_ERROR", "Unexpected response from the server.", res.status);
  }
  if (!body.success) throw new ApiError(body.error.code, body.error.message, res.status);
  return { items: body.data, nextCursor: body.meta?.nextCursor ?? null };
}

const get = async <T>(path: string) => (await request<T>(path)).items;
const send = async <T>(method: "POST" | "PATCH", path: string, body: unknown = {}) =>
  (await request<T>(path, { method, body: JSON.stringify(body) })).items;

function qs(params: object): string {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") s.set(k, String(v)); });
  const str = s.toString();
  return str ? `?${str}` : "";
}

export const api = {
  me: () => get<User>("/api/auth/me"),
  login: (userId: string) => send<User>("POST", "/api/auth/login", { userId }),
  logout: () => send<{ signedOut: true }>("POST", "/api/auth/logout"),

  listTrips: (q: ListTripsQuery) => request<TripView[]>(`/api/trips${qs(q)}`),
  getTrip: (id: string) => get<TripView>(`/api/trips/${id}`),
  createTrip: (input: CreateTripInput) => send<TripView>("POST", "/api/trips", input),
  cancelTrip: (id: string) => send<TripView>("PATCH", `/api/trips/${id}`, { status: "cancelled" }),
  joinTrip: (id: string, agreementVersion: string) => send<TripView>("POST", `/api/trips/${id}/join`, { agreementAccepted: true, agreementVersion }),
  leaveTrip: (id: string) => send<TripView>("POST", `/api/trips/${id}/leave`, {}),

  searchLocations: (q: string) => request<Location[]>(`/api/locations/search${qs({ q })}`),
  pickups: () => get<Location[]>("/api/locations/pickups"),
  regions: () => get<Region[]>("/api/regions"),
  terms: () => get<AgreementTerms>("/api/terms"),

  messages: (tripId: string, cursor?: string) => request<ChatMessage[]>(`/api/trips/${tripId}/messages${qs({ cursor })}`),
  sendMessage: (tripId: string, content: string) => send<ChatMessage>("POST", `/api/trips/${tripId}/messages`, { content }),
  reportNoShow: (tripId: string, subjectId: string) => send<AttendanceReport>("POST", `/api/trips/${tripId}/attendance-reports`, { subjectId, reason: "no_show" }),

  resetDemo: () => send<{ trips: number }>("POST", "/api/demo/reset"),
};
