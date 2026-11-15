import { newId } from "@/lib/ids";
import type { RouteMatrix, TripRecord } from "@/lib/mock/fixtures";
import { distanceKm } from "@/lib/regions/regions";
import { priceTripRoute } from "@/lib/pricing/trip-pricing";
import { planFromMatrix, type RoutePlan } from "@/lib/routing/planner";
import { page, type ServiceContext } from "@/lib/services/context";
import { AppError } from "@/lib/services/errors";
import { LocationService } from "@/lib/services/location-service";
import {
  PAGE_SIZE,
  type CreateTripInput, type ListTripsQuery, type Location, type MapStop, type ParticipantSummary, type RoutePricing, type RouteStop, type Trip, type TripFit, type TripMap,
  type TripParticipant, type TripRoute, type TripStatus, type TripView,
} from "@/types";

/** Pull-over time per extra stop (docs/decisions.md D-010). */
const STOP_DWELL_MINUTES = 1;
/** Most trips checked for fit in one destination search, so a search stays cheap. */
const MAX_FIT_CHECKS = 10;

/** The matrix for just these riders, or null if it doesn't cover all of them. */
function subGrid(grid: number[][], all: string[], userIds: string[]): number[][] | null {
  const idx = userIds.map((u) => all.indexOf(u));
  if (idx.some((i) => i < 0)) return null;
  const rows = [0, ...idx.map((i) => i + 1)];
  return rows.map((i) => rows.map((j) => grid[i][j]));
}

/** The stored matrices for just these riders, or null if they don't cover all of them. */
function subMatrix(rm: RouteMatrix, userIds: string[]): RouteMatrix | null {
  const minutes = subGrid(rm.minutes, rm.userIds, userIds);
  const miles = subGrid(rm.miles, rm.userIds, userIds);
  return minutes && miles ? { userIds, minutes, miles } : null;
}

/**
 * TripService (README §5). In mock mode every method runs synchronously against
 * the shared store, so each call is atomic (no interleaving between the
 * capacity check and the insert). The live implementation must provide the
 * same guarantees with a row lock on the trip (README §4 "Transaction boundaries").
 *
 * Creating or joining needs drive times, which is an async call. Those methods look the times up
 * first, then re-validate and write in one synchronous step, so the atomicity above still holds.
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
    return {
      id: rec.id, bookerId: rec.bookerId, pickupLocationId: rec.pickupLocationId, destinationLocationId: rec.destinationLocationId,
      departureTime: rec.departureTime, maxParticipants: rec.maxParticipants, returnTripId: rec.returnTripId, createdAt: rec.createdAt,
      participantCount: this.confirmed(rec.id).length, status: this.status(rec),
    };
  }

  // ---------- route helpers (docs/decisions.md D-010) ----------

  private stopOf(riderId: string, places: Map<string, Location>): Location {
    return places.get(riderId) as Location;
  }

  /** Turn a plan into the public route. Same-place stops merge. Names show only to members. */
  private buildRoute(plan: RoutePlan, places: Map<string, Location>, actorId: string, showRiders: boolean, pricing: RoutePricing | null): TripRoute {
    const names = new Map(this.ctx.db.users.map((u) => [u.id, u.displayName]));
    const stops: RouteStop[] = [];
    let your: TripRoute["your"] = null;
    for (const s of plan.stops) {
      const location = this.stopOf(s.riderId, places);
      const rider: ParticipantSummary | null = showRiders ? { userId: s.riderId, displayName: names.get(s.riderId) ?? "USC student" } : null;
      const prev = stops[stops.length - 1];
      if (prev && prev.location.id === location.id && s.legMinutes === 0) {
        prev.isFinal = s.isFinal;
        prev.rideMinutes = s.rideMinutes;
        if (rider) prev.riders = [...(prev.riders ?? []), rider];
      } else {
        stops.push({ order: stops.length + 1, isFinal: s.isFinal, location, legMinutes: s.legMinutes, rideMinutes: s.rideMinutes, riders: rider ? [rider] : null });
      }
      if (s.riderId === actorId) your = { order: stops.length, rideMinutes: s.rideMinutes, directMinutes: s.directMinutes, detourMinutes: s.detourMinutes };
    }
    return { stops, totalMinutes: plan.totalMinutes, maxDetourMinutes: this.ctx.config.routeMaxDetourMinutes, pricing, your };
  }

  /** Estimated fares for a planned route. Everyone's share is shown to members only. */
  private pricingFor(rec: TripRecord, plan: RoutePlan, riderIds: string[], miles: number[][], actorId: string, showRiders: boolean): RoutePricing | null {
    try {
      const { settlement, soloPrice } = priceTripRoute({
        plan, riderIds, miles, pricePerMile: this.ctx.config.pricePerMile, stopFee: this.ctx.config.stopFee, bookerId: rec.bookerId,
      });
      const names = new Map(this.ctx.db.users.map((u) => [u.id, u.displayName]));
      const yourShare = settlement.fares[actorId] ?? null;
      const yourSoloPrice = yourShare === null ? null : soloPrice[actorId];
      return {
        estimatedTotal: settlement.estimatedTotal,
        yourShare,
        yourSoloPrice,
        yourSavings: yourShare === null || yourSoloPrice === null ? null : Math.round((yourSoloPrice - yourShare) * 100) / 100,
        shares: showRiders ? riderIds.map((id) => ({ userId: id, displayName: names.get(id) ?? "USC student", amount: settlement.fares[id] })) : null,
        pricePerMile: this.ctx.config.pricePerMile,
      };
    } catch {
      return null; // pricing is informational; never block showing a route
    }
  }

  /** The planned route for the people confirmed right now, laid out from the stored drive times. */
  private routeOf(rec: TripRecord, actorId: string, showRiders: boolean): TripRoute | null {
    const members = this.confirmed(rec.id);
    if (!rec.routeMatrix || !members.length) return null;
    const sub = subMatrix(rec.routeMatrix, members.map((m) => m.userId));
    if (!sub) return null;
    const matrix = sub.minutes;
    const places = new Map(members.map((m) => [m.userId, this.locations.requireLocation(m.destinationLocationId, "destination")]));
    const plan = planFromMatrix({
      riders: members.map((m) => ({ riderId: m.userId, point: places.get(m.userId)! })), committedCount: members.length, matrix,
      maxDetourMinutes: Number.POSITIVE_INFINITY, maxStops: rec.maxParticipants, stopDwellMinutes: STOP_DWELL_MINUTES,
    });
    return this.buildRoute(plan, places, actorId, showRiders, this.pricingFor(rec, plan, sub.userIds, sub.miles, actorId, showRiders));
  }

  /** Riders in planning order: the Booker first, then by join time. */
  private planningOrder(rec: TripRecord): TripParticipant[] {
    return this.confirmed(rec.id).sort((a, b) => (a.userId === rec.bookerId ? -1 : b.userId === rec.bookerId ? 1 : a.joinedAt.localeCompare(b.joinedAt)));
  }

  private rosterKey(rec: TripRecord): string {
    return this.planningOrder(rec).map((p) => `${p.userId}:${p.destinationLocationId}`).join(",");
  }

  /** Where a rider may get out: inside a ride region on outbound trips, or a campus pickup on a return leg. */
  private resolveDestination(rec: TripRecord, destinationId: string | undefined): Location {
    const dest = this.locations.requireLocation(destinationId ?? rec.destinationLocationId, "destination");
    if (dest.id === rec.pickupLocationId) throw new AppError("VALIDATION_ERROR", "Your stop can't be the pickup.");
    if (this.locations.isPickup(rec.destinationLocationId)) {
      if (!this.locations.isPickup(dest.id)) throw new AppError("VALIDATION_ERROR", "On a return trip, choose a campus drop-off.");
    } else if (!dest.regionId) {
      throw new AppError("VALIDATION_ERROR", "That destination isn't inside a ride region, so a trip can't take you there.");
    }
    return dest;
  }

  /**
   * Look up drive times for the riders aboard plus one newcomer, then check the newcomer fits.
   * Returns the plan and the matrix so a successful join can store them.
   */
  private async evaluateFit(rec: TripRecord, actorId: string, destination: Location) {
    const committed = this.planningOrder(rec);
    const pickup = this.locations.requireLocation(rec.pickupLocationId, "pickup");
    const places = new Map(committed.map((m) => [m.userId, this.locations.requireLocation(m.destinationLocationId, "destination")]));
    places.set(actorId, destination);
    const riders = [...committed.map((m) => m.userId), actorId].map((riderId) => ({ riderId, point: places.get(riderId)! }));
    const points = [pickup, ...riders.map((r) => r.point)];
    const [matrix, miles] = await Promise.all([this.ctx.travel.matrix(points, new Date(rec.departureTime)), this.ctx.travel.miles(points, new Date(rec.departureTime))]);

    let plan: RoutePlan | null = null;
    let broken = false;
    try {
      plan = planFromMatrix({
        riders, committedCount: committed.length, matrix, maxDetourMinutes: this.ctx.config.routeMaxDetourMinutes,
        maxStops: rec.maxParticipants, stopDwellMinutes: STOP_DWELL_MINUTES,
      });
    } catch {
      broken = true; // the riders already aboard no longer fit the limit (e.g. the limit was lowered)
    }
    const rejection = plan?.rejected[0] ?? null;
    const fit: TripFit = {
      tripId: rec.id,
      stop: destination,
      fits: !!plan && !rejection,
      reason: broken ? "DETOUR_LIMIT" : rejection?.reason ?? null,
      message: broken ? "This trip's route is already at its limit." : rejection?.message ?? null,
      route: plan && !rejection ? this.buildRoute(plan, places, actorId, false, this.pricingFor(rec, plan, riders.map((r) => r.riderId), miles, actorId, false)) : null,
    };
    return { fit, plan, riders, matrix, miles };
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
      route: this.routeOf(rec, actorId, viewerMembership === "confirmed"),
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
      if (query.pickupLocationId && t.pickupLocationId !== query.pickupLocationId) return false;
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

  /** All the rules for creating, with no side effects. Run before and after the drive-time lookup. */
  private prepareCreate(actorId: string, input: CreateTripInput) {
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
    return { pickup, destination };
  }

  async createTrip(actorId: string, input: CreateTripInput): Promise<TripView> {
    const first = this.prepareCreate(actorId, input);
    // Drive times for each leg, looked up before anything is written.
    const leg = async (from: Location, to: Location, at: string) => {
      const pts = [from, to];
      const [minutes, miles] = await Promise.all([this.ctx.travel.matrix(pts, new Date(at)), this.ctx.travel.miles(pts, new Date(at))]);
      return { minutes, miles };
    };
    const [outLeg, retLeg] = await Promise.all([
      leg(first.pickup, first.destination, input.departureTime),
      input.returnDepartureTime ? leg(first.destination, first.pickup, input.returnDepartureTime) : Promise.resolve(null),
    ]);
    const { pickup, destination } = this.prepareCreate(actorId, input); // re-check after the wait

    // Build every row first, then commit together: a failed return leg leaves nothing behind.
    const iso = this.now().toISOString();
    const capacity = this.ctx.config.tripCapacity; // snapshot the resolved capacity on each new trip
    const outbound: TripRecord = {
      id: newId(), bookerId: actorId, pickupLocationId: pickup.id, destinationLocationId: destination.id,
      departureTime: new Date(input.departureTime).toISOString(), maxParticipants: capacity, status: "open", returnTripId: null, createdAt: iso,
      routeMatrix: { userIds: [actorId], ...outLeg },
    };
    const legs: TripRecord[] = [outbound];
    if (input.returnDepartureTime && retLeg) {
      const ret: TripRecord = {
        id: newId(), bookerId: actorId, pickupLocationId: destination.id, destinationLocationId: pickup.id,
        departureTime: new Date(input.returnDepartureTime).toISOString(), maxParticipants: capacity, status: "open", returnTripId: null, createdAt: iso,
        routeMatrix: { userIds: [actorId], ...retLeg },
      };
      outbound.returnTripId = ret.id;
      legs.push(ret);
    }
    const memberships: TripParticipant[] = legs.map((t) => ({
      id: newId(), tripId: t.id, userId: actorId, destinationLocationId: t.destinationLocationId, status: "confirmed", joinedAt: iso,
      agreementAcceptedAt: iso, agreementVersion: this.ctx.config.agreementVersion,
    }));
    this.ctx.db.trips.push(...legs);
    this.ctx.db.participants.push(...memberships);
    return this.toView(outbound, actorId);
  }

  /** Every non-routing rule for joining, with no side effects. Run before and after the drive-time lookup. */
  private prepareJoin(actorId: string, tripId: string, input: { agreementAccepted?: boolean; agreementVersion?: string; destinationLocationId?: string }) {
    const rec = this.requireVisible(tripId, actorId);
    const existing = this.membership(rec.id, actorId);
    if (existing?.status === "confirmed") return { kind: "already" as const, rec };

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
    const destination = this.resolveDestination(rec, input.destinationLocationId);
    return { kind: "open" as const, rec, existing, destination, rosterKey: this.rosterKey(rec) };
  }

  async joinTrip(actorId: string, tripId: string, input: { agreementAccepted?: boolean; agreementVersion?: string; destinationLocationId?: string }): Promise<TripView> {
    // The drive-time lookup is async, so someone else may join while we wait. If the roster changed, look again.
    for (let attempt = 0; attempt < 3; attempt++) {
      const pre = this.prepareJoin(actorId, tripId, input);
      if (pre.kind === "already") return this.toView(pre.rec, actorId); // successful repeat
      const result = await this.evaluateFit(pre.rec, actorId, pre.destination);

      const post = this.prepareJoin(actorId, tripId, input); // everything from here to the write is synchronous
      if (post.kind === "already") return this.toView(post.rec, actorId);
      if (post.rosterKey !== pre.rosterKey) continue;
      if (!result.fit.fits) {
        throw new AppError(result.fit.reason === "MAX_STOPS" ? "TRIP_FULL" : "ROUTE_DETOUR_EXCEEDED", result.fit.message ?? "This stop doesn't fit the trip's route.");
      }

      const { rec, existing, destination } = post;
      const iso = this.now().toISOString();
      if (existing) {
        // Rejoin reactivates the cancelled row and captures new terms acceptance.
        Object.assign(existing, { status: "confirmed", joinedAt: iso, destinationLocationId: destination.id, agreementAcceptedAt: iso, agreementVersion: input.agreementVersion });
      } else {
        this.ctx.db.participants.push({
          id: newId(), tripId: rec.id, userId: actorId, destinationLocationId: destination.id, status: "confirmed", joinedAt: iso,
          agreementAcceptedAt: iso, agreementVersion: input.agreementVersion ?? null,
        });
      }
      rec.routeMatrix = { userIds: result.riders.map((r) => r.riderId), minutes: result.matrix, miles: result.miles };
      return this.toView(rec, actorId);
    }
    throw new AppError("INTERNAL_ERROR", "The trip changed while checking your stop. Try again.");
  }

  /** Would this destination fit the trip's route? Powers the live check before joining. */
  async fitTrip(actorId: string, tripId: string, destinationLocationId: string): Promise<TripFit> {
    const rec = this.requireVisible(tripId, actorId);
    if (rec.status !== "open" || Date.parse(rec.departureTime) <= this.now().getTime()) throw new AppError("TRIP_CLOSED", "This trip is no longer accepting riders.");
    const destination = this.resolveDestination(rec, destinationLocationId);
    if (this.membership(rec.id, actorId)?.status === "confirmed") {
      return { tripId: rec.id, stop: destination, fits: true, reason: null, message: null, route: this.routeOf(rec, actorId, false) };
    }
    if (this.confirmed(rec.id).length >= rec.maxParticipants) {
      return { tripId: rec.id, stop: destination, fits: false, reason: "MAX_STOPS", message: "This trip is full.", route: null };
    }
    return (await this.evaluateFit(rec, actorId, destination)).fit;
  }

  /**
   * What to draw on the route map: the pickup and every stop in driving order with coordinates, plus the road path
   * through them when the provider can draw one. For someone who has not joined, `destinationLocationId` shows the
   * route as it would be with their stop in it. A failed path lookup is not an error: the map just joins the stops.
   */
  async mapFor(actorId: string, tripId: string, destinationLocationId?: string): Promise<TripMap> {
    const rec = this.requireVisible(tripId, actorId);
    const pickup = this.locations.requireLocation(rec.pickupLocationId, "pickup");
    const isMember = this.membership(rec.id, actorId)?.status === "confirmed";

    let route: TripRoute | null = null;
    if (destinationLocationId && !isMember) {
      const destination = this.resolveDestination(rec, destinationLocationId);
      route = (await this.evaluateFit(rec, actorId, destination)).fit.route;
    }
    route ??= this.routeOf(rec, actorId, false);
    if (!route) throw new AppError("VALIDATION_ERROR", "There is no route to show for this trip.");

    const stops: MapStop[] = [
      { order: 0, kind: "pickup", name: pickup.name, latitude: pickup.latitude, longitude: pickup.longitude, yours: false },
      ...route.stops.map((s): MapStop => ({
        order: s.order, kind: s.isFinal ? "final" : "stop", name: s.location.name, latitude: s.location.latitude, longitude: s.location.longitude,
        yours: route!.your?.order === s.order,
      })),
    ];
    let encodedPolyline: string | null = null;
    try {
      encodedPolyline = (await this.ctx.travel.path?.(stops.map((p) => ({ latitude: p.latitude, longitude: p.longitude })), new Date(rec.departureTime))) ?? null;
    } catch {
      encodedPolyline = null;
    }
    return { stops, encodedPolyline };
  }

  /**
   * Discovery. With a destination, only trips whose route that stop fits are returned, each with the
   * route you'd get; without one this is the plain list. Checks are capped so a search stays cheap.
   */
  async searchTrips(actorId: string, query: ListTripsQuery): Promise<{ items: TripView[]; nextCursor: string | null }> {
    if (!query.destinationLocationId) return this.listTrips(actorId, query);
    const destination = this.locations.requireLocation(query.destinationLocationId, "destination");
    const { items } = this.listTrips(actorId, { ...query, destinationLocationId: undefined, cursor: undefined });
    const mine = items.filter((v) => v.viewerMembership === "confirmed");
    const candidates = items.filter((v) => v.viewerMembership !== "confirmed" && v.trip.status === "open").slice(0, MAX_FIT_CHECKS);
    const fits = await Promise.all(candidates.map(async (v): Promise<TripView | null> => {
      const rec = this.record(v.trip.id)!;
      try {
        this.resolveDestination(rec, destination.id);
      } catch {
        return null; // e.g. a return leg heading to campus: not comparable to this destination
      }
      const { fit } = await this.evaluateFit(rec, actorId, destination);
      return fit.fits ? { ...v, fit } : null;
    }));
    const out = [...fits.filter((v): v is TripView => v !== null), ...mine].sort((a, b) => a.trip.departureTime.localeCompare(b.trip.departureTime));
    return { items: out, nextCursor: null };
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
    // The route re-plans from the remaining riders' stored times, so leaving never needs a lookup.
    const remaining = rec.routeMatrix ? subMatrix(rec.routeMatrix, this.confirmed(rec.id).map((p) => p.userId)) : null;
    if (remaining) rec.routeMatrix = remaining;
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
