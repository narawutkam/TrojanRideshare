import { describe, expect, it } from "vitest";
import { LOC, TRIP } from "@/lib/mock/fixtures";
import { expectCode, setup } from "./helpers";

/** Trip routes with per-rider destinations (docs/decisions.md D-010), on the mock drive-time estimator. */

const place = (s: ReturnType<typeof setup>, name: string) => s.db.locations.find((l) => l.name === name)!.id;

describe("Joining with your own destination", () => {
  it("adds a stop on the way and re-plans the route", async () => {
    const s = setup();
    // Palladium trip (Village → Hollywood Palladium). The Wiltern is on the way.
    const v = await s.trips.joinTrip(s.USER.tommy, TRIP.palladium, { ...s.terms, destinationLocationId: LOC.wiltern });
    expect(v.route?.stops.map((x) => x.location.name)).toEqual(["The Wiltern", "Hollywood Palladium"]);
    expect(v.route?.stops[1].isFinal).toBe(true);
    expect(v.route?.your).toMatchObject({ order: 1, detourMinutes: 0 });
    // Everyone's detour stays within the limit.
    expect(v.route!.stops[1].rideMinutes).toBeGreaterThan(v.route!.stops[0].rideMinutes);
  });

  it("defaults to the trip destination, sharing the stop", async () => {
    const s = setup();
    const v = await s.trips.joinTrip(s.USER.tommy, TRIP.palladium, s.terms);
    expect(v.route?.stops).toHaveLength(1);
    expect(v.route?.stops[0].riders?.map((r) => r.displayName).sort()).toEqual(["Alex Romero", "Tommy Trojan"]);
  });

  it("lets a rider going farther become the final stop", async () => {
    const s = setup();
    // Wiltern trip (Village → The Wiltern). Hollywood Palladium is past it.
    const v = await s.trips.joinTrip(s.USER.tommy, TRIP.wiltern, { ...s.terms, destinationLocationId: LOC.palladium });
    expect(v.route?.stops.map((x) => x.location.name)).toEqual(["The Wiltern", "Hollywood Palladium"]);
    expect(v.route?.stops[1].isFinal).toBe(true);
    expect(v.route?.your?.order).toBe(2);
  });

  it("refuses a stop that would add too much to someone's ride, leaving the trip unchanged", async () => {
    const s = setup();
    const before = s.db.participants.length;
    await expectCode(() => s.trips.joinTrip(s.USER.tommy, TRIP.palladium, { ...s.terms, destinationLocationId: LOC.smPier }), "ROUTE_DETOUR_EXCEEDED");
    expect(s.db.participants.length).toBe(before);
    expect(s.trips.getTrip(s.USER.tommy, TRIP.palladium).trip.participantCount).toBe(1);
  });

  it("requires a stop inside a ride region", async () => {
    const s = setup();
    await expectCode(() => s.trips.joinTrip(s.USER.tommy, TRIP.palladium, { ...s.terms, destinationLocationId: LOC.longBeach }), "VALIDATION_ERROR");
  });

  it("on a return trip, only campus drop-offs are allowed", async () => {
    const s = setup();
    await expectCode(() => s.trips.joinTrip(s.USER.tommy, TRIP.groveReturn, { ...s.terms, destinationLocationId: LOC.wiltern }), "VALIDATION_ERROR");
    const v = await s.trips.joinTrip(s.USER.tommy, TRIP.groveReturn, { ...s.terms, destinationLocationId: LOC.evk });
    expect(v.route?.stops.map((x) => x.location.id).sort()).toEqual([LOC.evk, LOC.webb].sort());
  });

  it("re-plans from the remaining riders when someone leaves", async () => {
    const s = setup();
    await s.trips.joinTrip(s.USER.tommy, TRIP.palladium, { ...s.terms, destinationLocationId: LOC.wiltern });
    const left = s.trips.leaveTrip(s.USER.tommy, TRIP.palladium);
    const alex = s.trips.getTrip(s.USER.alex, TRIP.palladium);
    expect(left.route?.your).toBeNull(); // no longer on the route, and like any nonmember no names are shown
    expect(left.route?.stops[0].riders).toBeNull();
    expect(alex.route?.stops.map((x) => x.location.name)).toEqual(["Hollywood Palladium"]);
  });

  it("keeps the seat limit: a full trip refuses, whatever the destination", async () => {
    const s = setup();
    await expectCode(() => s.trips.joinTrip(s.USER.tommy, TRIP.fullSantaMonica, { ...s.terms, destinationLocationId: LOC.smPier }), "TRIP_FULL");
  });
});

describe("Hiding other riders from nonmembers", () => {
  it("shows stops and times to nonmembers but not who is getting out where", async () => {
    const s = setup();
    const v = s.trips.getTrip(s.USER.hannah, TRIP.palladium);
    expect(v.viewerMembership).toBeNull();
    expect(v.route?.stops[0].riders).toBeNull();
    expect(v.route?.stops[0].rideMinutes).toBeGreaterThan(0);
    const fit = await s.trips.fitTrip(s.USER.hannah, TRIP.palladium, LOC.wiltern);
    expect(fit.fits).toBe(true);
    expect(fit.route?.stops.every((x) => x.riders === null)).toBe(true);
  });
});

describe("Finding trips your destination fits", () => {
  it("returns only the trips whose route the stop fits", async () => {
    const s = setup();
    const r = await s.trips.searchTrips(s.USER.hannah, { scope: "discover", destinationLocationId: LOC.wiltern });
    const ids = r.items.map((v) => v.trip.id);
    expect(ids).toContain(TRIP.palladium); // The Wiltern is on the way to Hollywood
    expect(ids).toContain(TRIP.wiltern); // same place
    expect(ids).not.toContain(TRIP.fullSantaMonica); // full
    expect(ids).not.toContain(TRIP.sofi); // far the other way
    expect(r.items.find((v) => v.trip.id === TRIP.palladium)?.fit?.route?.your).not.toBeNull();
  });

  it("is a plain list when no destination is given", async () => {
    const s = setup();
    const r = await s.trips.searchTrips(s.USER.hannah, { scope: "discover" });
    expect(r.items.length).toBeGreaterThan(3);
    expect(r.items.every((v) => v.fit === undefined)).toBe(true);
  });

  it("can narrow by pickup", async () => {
    const s = setup();
    const r = await s.trips.searchTrips(s.USER.hannah, { scope: "discover", pickupLocationId: LOC.evk });
    expect(r.items.every((v) => v.pickup.id === LOC.evk)).toBe(true);
  });
});

describe("Seeded trips have routes", () => {
  it("gives every upcoming trip a one-stop route with a ride time", () => {
    const s = setup();
    const r = s.trips.listTrips(s.USER.hannah, { scope: "discover" });
    for (const v of r.items) {
      expect(v.route?.stops.length).toBeGreaterThan(0);
      expect(v.route!.totalMinutes).toBeGreaterThan(0);
    }
    expect(place(s, "The Wiltern")).toBe(LOC.wiltern);
  });
});

describe("Fare estimates (docs/decisions.md D-011)", () => {
  it("makes a stop on the way cheaper than riding alone, because the shared stretch is split", async () => {
    const s = setup();
    const fit = await s.trips.fitTrip(s.USER.hannah, TRIP.palladium, LOC.wiltern);
    const p = fit.route!.pricing!;
    expect(fit.fits).toBe(true);
    expect(p.yourShare).toBeGreaterThan(0);
    expect(p.yourSoloPrice).toBeGreaterThan(p.yourShare!);
    expect(p.yourSavings).toBeCloseTo(p.yourSoloPrice! - p.yourShare!, 2);
    expect(p.shares).toBeNull(); // others' amounts are not shown to someone who hasn't joined
  });

  it("shows everyone's share to members, and the shares add up to the estimated total", async () => {
    const s = setup();
    const v = await s.trips.joinTrip(s.USER.tommy, TRIP.palladium, { ...s.terms, destinationLocationId: LOC.wiltern });
    const p = v.route!.pricing!;
    expect(p.shares?.map((x) => x.displayName).sort()).toEqual(["Alex Romero", "Tommy Trojan"]);
    const sum = p.shares!.reduce((a, x) => a + x.amount, 0);
    expect(sum).toBeCloseTo(p.estimatedTotal, 2);
    expect(p.yourShare).toBe(p.shares!.find((x) => x.userId === s.USER.tommy)!.amount);
  });

  it("splits a shared direct ride evenly, and prices a solo ride at the full fare", async () => {
    const s = setup();
    const alone = s.trips.getTrip(s.USER.hannah, TRIP.palladium).route!.pricing!;
    expect(alone.yourShare).toBeNull(); // hannah isn't on it
    const v = await s.trips.joinTrip(s.USER.hannah, TRIP.palladium, s.terms); // same place as Alex
    const p = v.route!.pricing!;
    expect(p.yourShare).toBeCloseTo(p.estimatedTotal / 2, 1);
    expect(p.yourSoloPrice).toBeCloseTo(p.estimatedTotal, 1);
    expect(p.yourSavings).toBeCloseTo(p.estimatedTotal / 2, 1);
  });

  it("re-prices when someone leaves", async () => {
    const s = setup();
    await s.trips.joinTrip(s.USER.tommy, TRIP.palladium, { ...s.terms, destinationLocationId: LOC.wiltern });
    const before = s.trips.getTrip(s.USER.alex, TRIP.palladium).route!.pricing!.yourShare!;
    s.trips.leaveTrip(s.USER.tommy, TRIP.palladium);
    const after = s.trips.getTrip(s.USER.alex, TRIP.palladium).route!.pricing!;
    expect(after.yourShare).toBe(after.estimatedTotal); // alone again: pays the whole fare
    expect(after.yourShare).toBeGreaterThan(before);
  });

  it("puts a price on every option a destination search returns", async () => {
    const s = setup();
    const r = await s.trips.searchTrips(s.USER.hannah, { scope: "discover", destinationLocationId: LOC.wiltern });
    const fits = r.items.filter((v) => v.fit);
    expect(fits.length).toBeGreaterThan(1);
    for (const v of fits) {
      expect(v.fit!.route!.pricing!.yourShare).toBeGreaterThan(0);
      expect(v.fit!.route!.pricing!.yourSoloPrice).toBeGreaterThan(0);
    }
  });
});

describe("Joining with the place you searched for", () => {
  it("remembers which stop each result was checked for, so the trip page can open with it", async () => {
    const s = setup();
    const one = await s.trips.fitTrip(s.USER.hannah, TRIP.palladium, LOC.wiltern);
    expect(one.stop?.id).toBe(LOC.wiltern);
    const found = await s.trips.searchTrips(s.USER.hannah, { scope: "discover", destinationLocationId: LOC.wiltern });
    const withFit = found.items.filter((v) => v.fit);
    expect(withFit.length).toBeGreaterThan(0);
    expect(withFit.every((v) => v.fit!.stop?.id === LOC.wiltern)).toBe(true);
  });

  it("gets you out at the searched place, not the trip's final destination", async () => {
    const s = setup();
    const v = await s.trips.joinTrip(s.USER.hannah, TRIP.palladium, { ...s.terms, destinationLocationId: LOC.wiltern });
    const mine = v.route!.stops[v.route!.your!.order - 1];
    expect(mine.location.id).toBe(LOC.wiltern);
    expect(mine.isFinal).toBe(false);
    expect(v.route!.stops[v.route!.stops.length - 1].location.id).toBe(LOC.palladium); // the car still ends at the Palladium
    expect(s.db.participants.find((p) => p.tripId === TRIP.palladium && p.userId === s.USER.hannah)!.destinationLocationId).toBe(LOC.wiltern);
  });

  it("does not use the trip destination when no stop is given", async () => {
    const s = setup();
    const v = await s.trips.joinTrip(s.USER.hannah, TRIP.palladium, s.terms);
    expect(v.route!.stops[v.route!.your!.order - 1].location.id).toBe(LOC.palladium);
  });
});
