import type { RoutePlan } from "@/lib/routing/planner";
import { calculateSettlement, type Settlement } from "./settlement";

/**
 * Prices a planned route (docs/decisions.md D-011). The planner decides the stop order; this
 * turns it into cumulative route miles and runs the settlement on them.
 */

export interface PricedRoute {
  settlement: Settlement;
  /** What each rider would pay riding alone, straight to their stop, at the same rate. */
  soloPrice: Record<string, number>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * @param plan    stops in driving order (from the route planner)
 * @param riderIds the riders in matrix order: rider `i` is at matrix index `i + 1`, the pickup at 0
 * @param miles   road miles between the pickup and each rider's stop
 * @param bookerId who books and pays upfront (reimbursements go to them)
 */
export function priceTripRoute(args: {
  plan: RoutePlan;
  riderIds: string[];
  miles: number[][];
  pricePerMile: number;
  stopFee: number;
  bookerId: string;
}): PricedRoute {
  const { plan, riderIds, miles, pricePerMile, stopFee, bookerId } = args;
  const index = new Map(riderIds.map((id, i) => [id, i + 1]));

  // Cumulative miles at each rider's drop-off, following the driving order.
  const dropoff = new Map<string, number>();
  let prev = 0;
  let cumulative = 0;
  for (const stop of plan.stops) {
    const at = index.get(stop.riderId)!;
    cumulative = Math.max(cumulative, round2(cumulative + miles[prev][at]));
    dropoff.set(stop.riderId, Math.max(cumulative, 0.01));
    prev = at;
  }

  // Riders who get out at the same place share a stop, so the stop list has each distance once.
  const stops = [0, ...[...new Set(dropoff.values())].sort((a, b) => a - b)];
  const settlement = calculateSettlement({
    riders: plan.stops.map((s) => ({ id: s.riderId, pickup: 0, dropoff: dropoff.get(s.riderId)! })),
    stops,
    pricePerMile,
    stopFee,
    bookerId,
  });

  const soloPrice: Record<string, number> = {};
  for (const id of riderIds) {
    const direct = Math.max(round2(miles[0][index.get(id)!]), 0.01);
    soloPrice[id] = calculateSettlement({ riders: [{ id, pickup: 0, dropoff: direct }], stops: [0, direct], pricePerMile }).fares[id];
  }
  return { settlement, soloPrice };
}
