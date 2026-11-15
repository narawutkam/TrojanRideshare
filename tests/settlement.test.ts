import { describe, expect, it } from "vitest";
import { calculateSettlement } from "@/lib/pricing/settlement";

/**
 * Expected values below were produced by running the team's original Python `calculate_settlement`
 * on the same inputs, so this port is held to identical results.
 */

const rider = (id: string, pickup: number | string, dropoff: number | string) => ({ id, pickup, dropoff });

describe("calculateSettlement matches the Python original", () => {
  it("splits a three-rider car-train by who is aboard each stretch", () => {
    const s = calculateSettlement({ riders: [rider("alice", 0, 20), rider("bob", 0, 10), rider("carol", 0, 5)], stops: [0, 5, 10, 20], pricePerMile: 2, stopFee: 1 });
    expect(s.bookerId).toBe("alice");
    expect(s.intermediateStopCount).toBe(2);
    expect(s.estimatedTotal).toBe(42);
    expect(s.upfrontPayment).toBe(42);
    expect(s.fares).toEqual({ alice: 29.48, bob: 8.9, carol: 3.62 });
    expect(s.reimbursements).toEqual([{ from: "bob", to: "alice", amount: 8.9 }, { from: "carol", to: "alice", amount: 3.62 }]);
    expect(s.bookerFinalCost).toBe(29.48);
  });

  it("charges a solo rider the whole fare, and two riders to one place half each", () => {
    expect(calculateSettlement({ riders: [rider("a", 0, 8)], stops: [0, 8], pricePerMile: 2.5 }).fares).toEqual({ a: 20 });
    const pair = calculateSettlement({ riders: [rider("a", 0, 8), rider("b", 0, 8)], stops: [0, 8], pricePerMile: 2.5 });
    expect(pair.fares).toEqual({ a: 10, b: 10 });
    expect(pair.reimbursements).toEqual([{ from: "b", to: "a", amount: 10 }]);
  });

  it("makes the early rider cheaper than riding alone: the shared stretch is split", () => {
    const s = calculateSettlement({ riders: [rider("k", 0, 8), rider("h", 0, 11.5)], stops: [0, 8, 11.5], pricePerMile: 2.5, stopFee: 1 });
    expect(s.bookerId).toBe("h");
    expect(s.estimatedTotal).toBe(29.75);
    expect(s.fares).toEqual({ k: 10.41, h: 19.34 });
    expect(s.fares.k).toBeLessThan(8 * 2.5); // $20 alone
  });

  it("scales shares to Uber's real total without adding fees twice", () => {
    const s = calculateSettlement({
      riders: [rider("alice", 0, 20), rider("bob", 0, 10), rider("carol", 0, 5)], stops: [0, 5, 10, 20],
      pricePerMile: 2, stopFee: 1, extraCosts: 3, actualUberTotal: 60,
    });
    expect(s.estimatedTotal).toBe(45);
    expect(s.upfrontPayment).toBe(60);
    expect(s.fares).toEqual({ alice: 41.59, bob: 13.01, carol: 5.4 });
  });

  it("spreads empty stretches over riders by distance", () => {
    const s = calculateSettlement({ riders: [rider("alice", 0, 10), rider("bob", 15, 20)], stops: [0, 10, 15, 20], pricePerMile: 2 });
    expect(s.estimatedTotal).toBe(40);
    expect(s.fares).toEqual({ alice: 26.67, bob: 13.33 });
  });

  it("allocates whole cents that add up exactly", () => {
    const s = calculateSettlement({ riders: [rider("a", 0, 10), rider("b", 0, 10), rider("c", 0, 10)], stops: [0, 10], pricePerMile: "0.3333333" });
    expect(s.upfrontPayment).toBe(3.33);
    expect(s.fares).toEqual({ a: 1.11, b: 1.11, c: 1.11 });
    // A total that does not divide evenly: the leftover cent goes to someone, and the sum still balances.
    const odd = calculateSettlement({ riders: [rider("a", 0, 10), rider("b", 0, 10), rider("c", 0, 10)], stops: [0, 10], pricePerMile: "0.334" });
    expect(Object.values(odd.faresCents).reduce((x, y) => x + y, 0)).toBe(Math.round(odd.upfrontPayment * 100));
  });

  it("reads decimal strings exactly", () => {
    const s = calculateSettlement({
      riders: [rider("a", "0", "4.25"), rider("b", "0", "7.1")], stops: ["0", "4.25", "7.1"], pricePerMile: "2.35", stopFee: "0.75", extraCosts: "1.1",
    });
    expect(s.bookerId).toBe("b");
    expect(s.estimatedTotal).toBe(18.54);
    expect(s.fares).toEqual({ a: 5.69, b: 12.85 });
  });
});

describe("calculateSettlement validation, same messages as the original", () => {
  const base = { stops: [0, 1], pricePerMile: 1 };
  it.each([
    ["no riders", { riders: [], ...base }, "Add at least one rider."],
    ["duplicate ids", { riders: [rider("a", 0, 1), rider("a", 0, 1)], ...base }, "Rider IDs must be unique."],
    ["drop-off before pickup", { riders: [rider("a", 2, 1)], ...base }, "Every drop-off must come after pickup."],
    ["drop-off missing from stops", { riders: [rider("a", 0, 2)], ...base }, "Include every rider's pickup and drop-off in stops."],
    ["negative rate", { riders: [rider("a", 0, 2)], stops: [0, 2], pricePerMile: -1 }, "Distances and costs must be finite and nonnegative."],
    ["stops out of order", { riders: [rider("a", 0, 2)], stops: [0, 2, 1], pricePerMile: 1 }, "List stops in increasing cumulative route miles."],
    ["route not ending at last drop-off", { riders: [rider("a", 0, 1)], stops: [0, 1, 2], pricePerMile: 1 }, "Route must start at the first pickup and end at the last drop-off."],
  ])("rejects %s", (_name, input, message) => {
    expect(() => calculateSettlement(input)).toThrow(message);
  });
  it("rejects non-finite numbers", () => {
    expect(() => calculateSettlement({ riders: [rider("a", 0, Number.POSITIVE_INFINITY)], stops: [0, 1], pricePerMile: 1 })).toThrow(/finite/);
  });
});

describe("calculateSettlement bookerId override", () => {
  it("sends reimbursements to the named Booker instead of the longest rider", () => {
    const s = calculateSettlement({ riders: [rider("k", 0, 8), rider("h", 0, 11.5)], stops: [0, 8, 11.5], pricePerMile: 2.5, stopFee: 1, bookerId: "k" });
    expect(s.bookerId).toBe("k");
    expect(s.reimbursements).toEqual([{ from: "h", to: "k", amount: 19.34 }]);
    expect(s.fares).toEqual({ k: 10.41, h: 19.34 }); // the split itself doesn't change
  });
  it("rejects a Booker who isn't riding", () => {
    expect(() => calculateSettlement({ riders: [rider("a", 0, 1)], stops: [0, 1], pricePerMile: 1, bookerId: "z" })).toThrow(/Booker/);
  });
});
