import { newId } from "@/lib/ids";
import type { TripRecord } from "@/lib/mock/fixtures";
import { distanceKm } from "@/lib/regions/regions";
import { page, type ServiceContext } from "@/lib/services/context";
import { AppError } from "@/lib/services/errors";
import { LocationService } from "@/lib/services/location-service";
import {
  PAGE_SIZE,
  type CreateTripInput, type ListTripsQuery, type ParticipantSummary, type Trip, type TripParticipant, type TripStatus, type TripView,
} from "@/types";

/**
 * TripService (README §5). In mock mode every method runs synchronously against
 * the shared store, so each call is atomic (no interleaving between the
 * capacity check and the insert). The live implementation must provide the
 * same guarantees with a row lock on the trip (README §4 "Transaction boundaries").
 */
export class TripService {
  private readonly locations: LocationService;

  constructor(private readonly ctx: ServiceContext) {
    this.locations = new LocationService(ctx);
  }

  private now() {
    return this.ctx.clock.now();
  }

  // ---------- read helpers ----------

  private record(id: string): TripRecord | undefined {
    return this.ctx.db.trips.find((t) => t.id === id);
  }

  private membership(tripId: string, userId: string): TripParticipant | undefined {
    return this.ctx.db.participants.find((p) => p.tripId === tripId && p.userId === userId);
  }

  private confirmed(tripId: string): TripParticipant[] {
    return this.ctx.db.participants.filter((p) => p.tripId === tripId && p.status === "confirmed");
  }

  private status(rec: TripRecord): TripStatus {
    if (rec.status === "open" && this.confirmed(rec.id).length >= rec.maxParticipants) return "full";
    return rec.status;
  }

  private toTrip(rec: TripRecord): Trip {
    return { ...rec, participantCount: this.confirmed(rec.id).length, status: this.status(rec) };
  }

  /** A trip is visible unless it is cancelled; members keep seeing their cancelled trips. */
  private visible(rec: TripRecord | undefined, actorId: string): rec is TripRecord {
    if (!rec) return false;
    return rec.status !== "cancelled" || !!this.membership(rec.id, actorId);
  }

  private requireVisible(tripId: string, actorId: string): TripRecord {
    const rec = this.record(tripId);
    if (!this.visible(rec, actorId)) throw new AppError("TRIP_NOT_FOUND", "Trip not found.");
    return rec;
  }

  toView(rec: TripRecord, actorId: string): TripView {
    const viewerMembership = this.membership(rec.id, actorId)?.status ?? null;
    let roster: ParticipantSummary[] | null = null;
    if (viewerMembership === "confirmed") {
      const names = new Map(this.ctx.db.users.map((u) => [u.id, u.displayName]));
      roster = this.confirmed(rec.id)
        .sort((a, b) => (a.userId === rec.bookerId ? -1 : b.userId === rec.bookerId ? 1 : a.joinedAt.localeCompare(b.joinedAt)))
        .map((p) => ({ userId: p.userId, displayName: names.get(p.userId) ?? "USC student" }));
    }
    return {
      trip: this.toTrip(rec),
      pickup: this.locations.requireLocation(rec.pickupLocationId, "pickup"),
      destination: this.locations.requireLocation(rec.destinationLocationId, "destination"),
      viewerMembership,
      roster,
    };
  }

  /** Upcoming, non-cancelled trips the user is confirmed in (docs/decisions.md D-002). */
  private activeTripsOf(userId: string): TripRecord[] {
    const now = this.now().getTime();
    return this.ctx.db.participants
      .filter((p) => p.userId === userId && p.status === "confirmed")
      .map((p) => this.record(p.tripId))
      .filter((t): t is TripRecord => !!t && (t.status === "open" || t.status === "in_progress") && Date.parse(t.departureTime) > now);
  }

  /** Two legs of one linked trip count as one trip for the one-trip rule. */
  private linked(a: TripRecord, b: TripRecord): boolean {
    return a.id === b.id || a.returnTripId === b.id || b.returnTripId === a.id;
  }

  // ---------- queries ----------

  listTrips(actorId: string, query: ListTripsQuery): { items: TripView[]; nextCursor: string | null } {
    const scope = query.scope ?? "discover";
    const now = this.now().getTime();
    const from = query.from ? Date.parse(query.from) : -Infinity;
    const to = query.to ? Date.parse(query.to) : Infinity;
    let recs = this.ctx.db.trips.filter((t) => {
      const dep = Date.parse(t.departureTime);
      if (dep < from || dep >= to) return false; // inclusive from, exclusive to
      if (scope === "mine") return t.bookerId === actorId || !!this.membership(t.id, actorId);
      return t.status === "open" && dep > now; // discover: upcoming open and full trips
    });

    const search = query.destinationLocationId ? this.locations.requireLocation(query.destinationLocationId, "destination") : null;
    const effectiveRegion = query.regionId ?? search?.regionId ?? null; // explicit region wins
    if (effectiveRegion) {
      recs = recs.filter((t) => this.locations.getLocation(t.destinationLocationId)?.regionId === effectiveRegion);
    }
    const byDeparture = (a: TripRecord, b: TripRecord) => a.departureTime.localeCompare(b.departureTime) || a.id.localeCompare(b.id);
    if (search) {
      const dist = new Map(recs.map((t) => [t.id, distanceKm(search, this.locations.getLocation(t.destinationLocationId)!)]));
      recs.sort((a, b) => dist.get(a.id)! - dist.get(b.id)! || byDeparture(a, b));
    } else {
      recs.sort(byDeparture);
    }
    const scopeKey = JSON.stringify({ ...query, cursor: undefined, actor: scope === "mine" ? actorId : undefined });
    const { items, nextCursor } = page(recs, query.cursor, scopeKey, PAGE_SIZE);
    return { items: items.map((r) => this.toView(r, actorId)), nextCursor };
  }

  getTrip(actorId: string, tripId: string): TripView {
    return this.toView(this.requireVisible(tripId, actorId), actorId);
  }

  // ---------- mutations ----------

  createTrip(actorId: string, input: CreateTripInput): TripView {
    const now = this.now();
    const pickup = this.locations.requireLocation(input.pickupLocationId, "pickup location");
    const destination = this.locations.requireLocation(input.destinationLocationId, "destination");
    if (!this.locations.isPickup(pickup.id)) throw new AppError("VALIDATION_ERROR", "Choose one of the campus pickup locations.");
    if (!destination.regionId) throw new AppError("VALIDATION_ERROR", "That destination isn't inside a ride region, so a trip can't be created there.");
    if (Date.parse(input.departureTime) <= now.getTime()) throw new AppError("VALIDATION_ERROR", "Departure must be in the future.");
    if (input.returnDepartureTime && Date.parse(input.returnDepartureTime) <= Date.parse(input.departureTime)) {
      throw new AppError("VALIDATION_ERROR", "Return departure must be after the outbound departure.");
    }
    if (this.activeTripsOf(actorId).length) {
      throw new AppError("ACTIVE_TRIP_EXISTS", "You're already in an upcoming trip. Leave or cancel it before creating another.");
    }

    // Build every row first, then commit together: a failed return leg leaves nothing behind.
    const iso = now.toISOString();
    const capacity = this.ctx.config.tripCapacity; // snapshot the resolved capacity on each new trip
    const outbound: TripRecord = {
      id: newId(), bookerId: actorId, pickupLocationId: pickup.id, destinationLocationId: destination.id,
      departureTime: new Date(input.departureTime).toISOString(), maxParticipants: capacity, status: "open", returnTripId: null, createdAt: iso,
    };
    const legs: TripRecord[] = [outbound];
    if (input.returnDepartureTime) {
      const ret: TripRecord = {
        id: newId(), bookerId: actorId, pickupLocationId: destination.id, destinationLocationId: pickup.id,
        departureTime: new Date(input.returnDepartureTime).toISOString(), maxParticipants: capacity, status: "open", returnTripId: null, createdAt: iso,
      };
      outbound.returnTripId = ret.id;
      legs.push(ret);
    }
    const memberships: TripParticipant[] = legs.map((t) => ({
      id: newId(), tripId: t.id, userId: actorId, status: "confirmed", joinedAt: iso,
      agreementAcceptedAt: iso, agreementVersion: this.ctx.config.agreementVersion,
    }));
    this.ctx.db.trips.push(...legs);
    this.ctx.db.participants.push(...memberships);
    return this.toView(outbound, actorId);
  }

  joinTrip(actorId: string, tripId: string, input: { agreementAccepted?: boolean; agreementVersion?: string }): TripView {
    const rec = this.requireVisible(tripId, actorId);
    const existing = this.membership(rec.id, actorId);
    if (existing?.status === "confirmed") return this.toView(rec, actorId); // successful repeat

    const now = this.now();
    if (rec.status !== "open" || Date.parse(rec.departureTime) <= now.getTime()) {
      throw new AppError("TRIP_CLOSED", "This trip is no longer accepting riders.");
    }
    if (input.agreementAccepted !== true || input.agreementVersion !== this.ctx.config.agreementVersion) {
      throw new AppError("AGREEMENT_REQUIRED", "Accept the current billing agreement to join.");
    }
    if (this.confirmed(rec.id).length >= rec.maxParticipants) {
      throw new AppError("TRIP_FULL", "This trip is full.");
    }
    if (this.activeTripsOf(actorId).some((t) => !this.linked(t, rec))) {
      throw new AppError("ACTIVE_TRIP_EXISTS", "You're already in an upcoming trip. Leave it before joining another.");
    }

    const iso = now.toISOString();
    if (existing) {
      // Rejoin reactivates the cancelled row and captures new terms acceptance.
      Object.assign(existing, { status: "confirmed", joinedAt: iso, agreementAcceptedAt: iso, agreementVersion: input.agreementVersion });
    } else {
      this.ctx.db.participants.push({
        id: newId(), tripId: rec.id, userId: actorId, status: "confirmed", joinedAt: iso, agreementAcceptedAt: iso, agreementVersion: input.agreementVersion,
      });
    }
    return this.toView(rec, actorId);
  }

  leaveTrip(actorId: string, tripId: string): TripView {
    const rec = this.requireVisible(tripId, actorId);
    const m = this.membership(rec.id, actorId);
    if (!m) throw new AppError("FORBIDDEN", "You're not a member of this trip.");
    if (m.status === "cancelled") return this.toView(rec, actorId); // successful repeat
    if (rec.bookerId === actorId) throw new AppError("FORBIDDEN", "The Booker cancels the trip instead of leaving it.");
    const msLeft = Date.parse(rec.departureTime) - this.now().getTime();
    if (rec.status !== "open" || msLeft <= 0) throw new AppError("TRIP_CLOSED", "This trip has already departed or closed.");
    if (msLeft < this.ctx.config.leaveCutoffMinutes * 60000) {
      throw new AppError("LEAVE_WINDOW_CLOSED", `You can't leave within ${this.ctx.config.leaveCutoffMinutes} minutes of departure. Message your party instead.`);
    }
    m.status = "cancelled";
    return this.toView(rec, actorId);
  }

  cancelTrip(actorId: string, tripId: string): TripView {
    const rec = this.requireVisible(tripId, actorId);
    if (rec.bookerId !== actorId) throw new AppError("FORBIDDEN", "Only the Booker can cancel this trip.");
    if (rec.status === "cancelled") return this.toView(rec, actorId); // successful repeat
    if (rec.status !== "open" || Date.parse(rec.departureTime) <= this.now().getTime()) {
      throw new AppError("TRIP_CLOSED", "This trip has already departed or closed.");
    }
    rec.status = "cancelled"; // each leg is cancelled separately (README §4)
    return this.toView(rec, actorId);
  }
}
