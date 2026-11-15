/**
 * Fare settlement for a shared Uber with several drop-offs (docs/decisions.md D-011).
 *
 * A port of the team's Python `calculate_settlement`, with the same rules and the same exact
 * arithmetic (BigInt fractions, so no floating-point drift) and the same cent rounding:
 *
 *  1. Each stretch of the route is paid for by the riders aboard it, split evenly.
 *  2. Empty stretches (nobody aboard), stop fees and other extras are spread over riders by distance.
 *  3. If Uber's real total is known it replaces the estimate; the shares are scaled to it.
 *  4. Everything is allocated in whole cents that add up exactly to the total.
 *
 * `bookerId` is an addition to the Python: by default the rider with the longest trip is the
 * Booker (as in the original), but the app passes the trip creator so reimbursements go to them.
 */

type Num = number | string;
type Frac = { n: bigint; d: bigint };

const ZERO: Frac = { n: 0n, d: 1n };

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

function frac(n: bigint, d: bigint = 1n): Frac {
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}

const add = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
const div = (a: Frac, b: Frac) => frac(a.n * b.d, a.d * b.n);
const cmp = (a: Frac, b: Frac) => { const l = a.n * b.d, r = b.n * a.d; return l < r ? -1 : l > r ? 1 : 0; };
const fromInt = (n: number) => frac(BigInt(n));

/** Python's `Decimal(str(value))`, exactly: "4.25" is 425/100, not a float. Finite and nonnegative only. */
function number(value: Num): Frac {
  const bad = () => new Error("Distances and costs must be finite and nonnegative.");
  if (typeof value === "number" && !Number.isFinite(value)) throw bad();
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(String(value).trim());
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) throw bad();
  const digits = BigInt((m[2] || "0") + (m[3] ?? ""));
  const exp = Number(m[4] ?? 0) - (m[3] ?? "").length;
  let out = exp >= 0 ? frac(digits * 10n ** BigInt(exp)) : frac(digits, 10n ** BigInt(-exp));
  if (m[1] === "-" && out.n !== 0n) throw bad();
  if (out.n < 0n) out = ZERO;
  return out;
}

/** Round a nonnegative dollar amount to whole cents, halves up. */
function roundedCents(value: Frac): bigint {
  const v = mul(value, fromInt(100));
  return (2n * v.n + v.d) / (2n * v.d);
}

export interface SettlementRider {
  id: string;
  /** Cumulative route miles where the rider gets in. */
  pickup: Num;
  /** Cumulative route miles where the rider gets out. */
  dropoff: Num;
}

export interface SettlementInput {
  riders: SettlementRider[];
  /** Every stop in booking order, as cumulative route miles, e.g. [0, 5, 10, 20]. */
  stops: Num[];
  pricePerMile: Num;
  /** Estimated fee per intermediate stop. */
  stopFee?: Num;
  /** Estimated waiting fees, tolls and other charges for the whole trip. */
  extraCosts?: Num;
  /** Uber's complete quoted or final fare. Replaces the estimate; fees are not added twice. */
  actualUberTotal?: Num | null;
  /** Who books and pays upfront. Default: the rider with the longest trip. */
  bookerId?: string;
}

export interface Settlement {
  bookerId: string;
  stopsToEnterInUber: Num[];
  intermediateStopCount: number;
  estimatedTotal: number;
  upfrontPayment: number;
  /** Dollars per rider. */
  fares: Record<string, number>;
  /** Whole cents per rider. These sum exactly to `upfrontPayment`. */
  faresCents: Record<string, number>;
  reimbursements: { from: string; to: string; amount: number }[];
  bookerFinalCost: number;
}

export function calculateSettlement(input: SettlementInput): Settlement {
  const { riders, stops, actualUberTotal } = input;
  if (!riders.length) throw new Error("Add at least one rider.");

  // Insertion order matters (it breaks ties), so use a Map.
  const trips = new Map<string, [Frac, Frac]>();
  for (const r of riders) {
    if (trips.has(r.id)) throw new Error("Rider IDs must be unique.");
    const pickup = number(r.pickup);
    const dropoff = number(r.dropoff);
    if (cmp(dropoff, pickup) <= 0) throw new Error("Every drop-off must come after pickup.");
    trips.set(r.id, [pickup, dropoff]);
  }

  const route = stops.map(number);
  if (route.length < 2 || route.some((end, i) => i > 0 && cmp(end, route[i - 1]) <= 0)) {
    throw new Error("List stops in increasing cumulative route miles.");
  }

  const required: Frac[] = [...trips.values()].flat();
  const has = (p: Frac) => route.some((s) => cmp(s, p) === 0);
  if (!required.every(has)) throw new Error("Include every rider's pickup and drop-off in stops.");
  const lo = required.reduce((a, b) => (cmp(b, a) < 0 ? b : a));
  const hi = required.reduce((a, b) => (cmp(b, a) > 0 ? b : a));
  if (cmp(route[0], lo) !== 0 || cmp(route[route.length - 1], hi) !== 0) {
    throw new Error("Route must start at the first pickup and end at the last drop-off.");
  }

  const distances = new Map<string, Frac>();
  for (const [id, [start, end]] of trips) distances.set(id, sub(end, start));
  const totalRiderDistance = [...distances.values()].reduce(add, ZERO);

  // Python's max(): the first rider with the largest distance.
  let longest = [...distances.keys()][0];
  for (const [id, d] of distances) if (cmp(d, distances.get(longest)!) > 0) longest = id;
  const bookerId = input.bookerId ?? longest;
  if (!trips.has(bookerId)) throw new Error("The Booker must be one of the riders.");

  // Split occupied stretches among the riders aboard.
  const rate = number(input.pricePerMile);
  const shares = new Map<string, Frac>([...trips.keys()].map((id) => [id, ZERO]));
  let emptyCost = ZERO;
  for (let i = 1; i < route.length; i++) {
    const start = route[i - 1], end = route[i];
    const onboard = [...trips].filter(([, [pickup, dropoff]]) => cmp(pickup, start) <= 0 && cmp(dropoff, end) >= 0).map(([id]) => id);
    const segmentCost = mul(sub(end, start), rate);
    if (onboard.length) {
      for (const id of onboard) shares.set(id, add(shares.get(id)!, div(segmentCost, fromInt(onboard.length))));
    } else {
      emptyCost = add(emptyCost, segmentCost);
    }
  }

  // Stop fees, other extras and empty driving are spread by distance.
  const intermediateStops = route.length - 2;
  const extras = add(add(mul(number(input.stopFee ?? 0), fromInt(intermediateStops)), number(input.extraCosts ?? 0)), emptyCost);
  for (const id of trips.keys()) {
    shares.set(id, add(shares.get(id)!, div(mul(extras, distances.get(id)!), totalRiderDistance)));
  }

  const estimatedTotal = [...shares.values()].reduce(add, ZERO);
  const total = actualUberTotal !== undefined && actualUberTotal !== null ? number(actualUberTotal) : estimatedTotal;
  const weights = cmp(estimatedTotal, ZERO) > 0 ? shares : distances;

  // Whole cents that add up exactly: floor everyone, then hand the leftover cents to the largest remainders.
  const totalCents = roundedCents(total);
  const weightSum = [...weights.values()].reduce(add, ZERO);
  const raw = new Map<string, Frac>();
  const cents = new Map<string, bigint>();
  for (const [id, w] of weights) {
    const r = div(mul(frac(totalCents), w), weightSum);
    raw.set(id, r);
    cents.set(id, r.n / r.d);
  }
  const remainder = (id: string) => sub(raw.get(id)!, frac(cents.get(id)!));
  const order = [...trips.keys()].sort((a, b) => -cmp(remainder(a), remainder(b))); // stable, largest first
  const remaining = Number(totalCents - [...cents.values()].reduce((a, b) => a + b, 0n));
  for (const id of order.slice(0, remaining)) cents.set(id, cents.get(id)! + 1n);

  const fares: Record<string, number> = {};
  const faresCents: Record<string, number> = {};
  for (const [id, c] of cents) { fares[id] = Number(c) / 100; faresCents[id] = Number(c); }

  return {
    bookerId,
    stopsToEnterInUber: [...stops],
    intermediateStopCount: intermediateStops,
    estimatedTotal: Number(roundedCents(estimatedTotal)) / 100,
    upfrontPayment: Number(totalCents) / 100,
    fares,
    faresCents,
    reimbursements: [...cents].filter(([id, c]) => id !== bookerId && c > 0n).map(([id, c]) => ({ from: id, to: bookerId, amount: Number(c) / 100 })),
    bookerFinalCost: Number(cents.get(bookerId)!) / 100,
  };
}
