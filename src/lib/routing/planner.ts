import type { GeoPoint, TravelTimeProvider } from "./travel-time";

/**
 * Car-train route planner.
 *
 * One car leaves the pickup and drops riders off one stop after another. No stop is fixed as
 * the last one: the planner tries every order and keeps the one with the shortest total drive in
 * which EVERY rider's planned ride time is within `maxDetourMinutes` of their own direct ride
 * time. Whoever ends up last is the final destination (normally the farthest rider).
 *
 * Because the limit is per rider, a newcomer can only join if everyone already in the trip stays
 * inside it too. Riders already in the trip are never dropped to make room.
 *
 * The search is exact. The stop count is small (the app caps a trip at 4 riders; the hard cap
 * here is 6, which is 720 orders), so there is no need for a heuristic.
 *
 * All legs use one travel-time matrix taken at departure, so a long ride is approximated as if
 * it ran entirely in departure-time traffic.
 */

export interface StopRequest {
  riderId: string;
  point: GeoPoint;
}

export interface PlanFromMatrixInput {
  /** Riders already in the trip first, then people asking to join in priority order. */
  riders: StopRequest[];
  /** How many of `riders` (from the start) are already in the trip and must all fit. */
  committedCount: number;
  /** minutes[i][j]: drive from point i to j. Index 0 is the pickup, rider r is at r + 1. */
  matrix: number[][];
  /** Most extra minutes any rider may be given. Use Infinity to just lay out a route. */
  maxDetourMinutes: number;
  /** Max riders/stops in the route. Default 4, capped at 6. */
  maxStops?: number;
  /** Minutes lost at each stop after the first (pull over, rider gets out). Default 1. */
  stopDwellMinutes?: number;
}

export interface PlanRouteInput extends Omit<PlanFromMatrixInput, "riders" | "matrix" | "committedCount"> {
  pickup: GeoPoint;
  committed: StopRequest[];
  candidates?: StopRequest[];
  departAt: Date;
  provider: TravelTimeProvider;
}

export interface PlannedStop {
  riderId: string;
  /** 1-based position in the route. */
  order: number;
  isFinal: boolean;
  /** Minutes driven since the previous stop (or the pickup). */
  legMinutes: number;
  /** Minutes from departure until this rider gets out (includes earlier stops' pull-overs). */
  rideMinutes: number;
  /** Minutes this rider would ride going straight there. */
  directMinutes: number;
  /** rideMinutes − directMinutes. */
  detourMinutes: number;
}

export type RejectionReason = "MAX_STOPS" | "DETOUR_LIMIT";

export interface Rejection {
  riderId: string;
  reason: RejectionReason;
  /** The rider who would end up over the limit in the least-bad order (the candidate or someone aboard). */
  affectedRiderId: string | null;
  /** Minutes over the limit in that least-bad order (0 for MAX_STOPS). */
  minutesOver: number;
  message: string;
}

export interface RoutePlan {
  /** Drop-offs in driving order; the last is the final destination. */
  stops: PlannedStop[];
  rejected: Rejection[];
  finalRiderId: string | null;
  /** Minutes from departure until the last rider gets out. */
  totalMinutes: number;
}

const HARD_MAX_STOPS = 6;
const EPS = 1e-9;
const round = (n: number) => Math.round(n * 10) / 10;

interface Eval {
  stops: PlannedStop[];
  totalMinutes: number;
  detourSum: number;
}

type Search = { ok: true; best: Eval } | { ok: false; worstRiderIndex: number; over: number };

function* permutations(items: number[]): Generator<number[]> {
  if (items.length <= 1) {
    yield items.slice();
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const p of permutations(rest)) yield [items[i], ...p];
  }
}

/** Best feasible order for `members` (indexes into riders). Best = shortest total, then smallest sum of detours. */
function search(members: number[], riderIds: string[], M: number[][], maxDetour: number, dwell: number): Search {
  let best: Eval | null = null;
  let leastBad = { rider: members[0] ?? 0, over: Number.POSITIVE_INFINITY };

  for (const order of permutations(members)) {
    let prev = 0; // matrix index of the previous stop
    let clock = 0;
    const stops: PlannedStop[] = [];
    let worst = { rider: order[0] ?? 0, over: Number.NEGATIVE_INFINITY };
    let detourSum = 0;

    order.forEach((r, k) => {
      const at = r + 1;
      const leg = M[prev][at];
      if (k > 0 && leg > 0) clock += dwell; // pull-over only if the car actually moved
      clock += leg;
      const direct = M[0][at];
      const detour = clock - direct;
      detourSum += detour;
      if (detour - maxDetour > worst.over) worst = { rider: r, over: detour - maxDetour };
      stops.push({ riderId: riderIds[r], order: k + 1, isFinal: k === order.length - 1, legMinutes: round(leg), rideMinutes: round(clock), directMinutes: round(direct), detourMinutes: round(detour) });
      prev = at;
    });

    if (worst.over <= EPS) {
      if (!best || clock < best.totalMinutes - EPS || (Math.abs(clock - best.totalMinutes) <= EPS && detourSum < best.detourSum)) {
        best = { stops, totalMinutes: clock, detourSum };
      }
    } else if (worst.over < leastBad.over) {
      leastBad = { rider: worst.rider, over: worst.over };
    }
  }
  return best ? { ok: true, best } : { ok: false, worstRiderIndex: leastBad.rider, over: leastBad.over };
}

/** Synchronous core: plan from a ready-made matrix. Used inside atomic service sections. */
export function planFromMatrix(input: PlanFromMatrixInput): RoutePlan {
  const { riders, committedCount, matrix: M, maxDetourMinutes } = input;
  const dwell = input.stopDwellMinutes ?? 1;
  const maxStops = Math.min(input.maxStops ?? 4, HARD_MAX_STOPS);
  const ids = riders.map((r) => r.riderId);
  if (new Set(ids).size !== ids.length) throw new Error("Each rider can appear in a route only once.");
  if (M.length !== riders.length + 1 || M.some((row) => row.length !== riders.length + 1)) throw new Error("Travel-time matrix has the wrong shape.");
  if (committedCount > HARD_MAX_STOPS) throw new Error(`A route can have at most ${HARD_MAX_STOPS} stops.`);

  const committed = Array.from({ length: committedCount }, (_, i) => i);
  const first = search(committed, ids, M, maxDetourMinutes, dwell);
  if (!first.ok) throw new Error("Riders already in the trip no longer fit the detour limit.");
  let current = first.best;
  let members = committed;
  const rejected: Rejection[] = [];

  for (let idx = committedCount; idx < riders.length; idx++) {
    const cand = riders[idx];
    if (members.length + 1 > maxStops) {
      rejected.push({ riderId: cand.riderId, reason: "MAX_STOPS", affectedRiderId: null, minutesOver: 0, message: `A trip can have at most ${maxStops} riders.` });
      continue;
    }
    const attempt = search([...members, idx], ids, M, maxDetourMinutes, dwell);
    if (attempt.ok) {
      current = attempt.best;
      members = [...members, idx];
      continue;
    }
    const over = round(attempt.over);
    rejected.push({
      riderId: cand.riderId,
      reason: "DETOUR_LIMIT",
      affectedRiderId: ids[attempt.worstRiderIndex],
      minutesOver: over,
      message: `This stop would push a ride ${over} min past the ${maxDetourMinutes}-min limit.`,
    });
  }

  const last = current.stops[current.stops.length - 1];
  return { stops: current.stops, rejected, finalRiderId: last?.riderId ?? null, totalMinutes: last?.rideMinutes ?? 0 };
}

/** Fetch times for the departure instant, then plan. */
export async function planRoute(input: PlanRouteInput): Promise<RoutePlan> {
  const candidates = input.candidates ?? [];
  const riders = [...input.committed, ...candidates];
  const matrix = await input.provider.matrix([input.pickup, ...riders.map((r) => r.point)], input.departAt);
  return planFromMatrix({ ...input, riders, committedCount: input.committed.length, matrix });
}

/** Would `newcomer` fit into a trip whose current riders must stay? */
export async function evaluateJoin(input: Omit<PlanRouteInput, "candidates"> & { newcomer: StopRequest }) {
  const { newcomer, ...rest } = input;
  const plan = await planRoute({ ...rest, candidates: [newcomer] });
  const rejection = plan.rejected[0] ?? null;
  return { allowed: rejection === null, plan, rejection };
}
