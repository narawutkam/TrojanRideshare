import { describe, expect, it } from "vitest";
import { loadConfig } from "@/config/env";
import { LOC, TRIP } from "@/lib/mock/fixtures";
import { REGIONS } from "@/lib/regions/regions";
import { formatTime, laLocalToUtc, laStartOfDay } from "@/lib/time";
import { expectCode, NOW, setup } from "./helpers";

const inHours = (h: number) => new Date(Date.parse(NOW) + h * 36e5).toISOString();
const region = (slug: string) => REGIONS.find((r) => r.slug === slug)!.id;

describe("USC entry and configuration", () => {
  it("requires an approved capacity in live mode", async () => {
    expect(() => loadConfig({ APP_MODE: "live" })).toThrow(/TRIP_CAPACITY/);
    expect(loadConfig({ APP_MODE: "live", TRIP_CAPACITY: "6" }).tripCapacity).toBe(6);
    expect(loadConfig({ APP_MODE: "mock" }).tripCapacity).toBe(4);
  });
});

describe("Create with return", () => {
  it("creates a linked return leg with reversed endpoints and its own Booker membership", async () => {
    const s = setup();
    const v = await s.trips.createTrip(s.USER.tommy, {
      pickupLocationId: LOC.village, destinationLocationId: LOC.lax, departureTime: inHours(5), returnDepartureTime: inHours(30),
    });
    expect(v.trip.participantCount).toBe(1);
    expect(v.trip.bookerId).toBe(s.USER.tommy);
    expect(v.trip.maxParticipants).toBe(4);
    expect(v.route?.stops.map((x) => x.location.id)).toEqual([LOC.lax]);
    expect(v.route?.your?.order).toBe(1);
    const ret = s.trips.getTrip(s.USER.tommy, v.trip.returnTripId!);
    expect(ret.trip.participantCount).toBe(1);
    expect(ret.pickup.id).toBe(LOC.lax);
    expect(ret.destination.id).toBe(LOC.village);
    expect(Date.parse(ret.trip.departureTime)).toBeGreaterThan(Date.parse(v.trip.departureTime));

    // Joining the outbound leaves return seats unchanged.
    await s.trips.joinTrip(s.students[0], v.trip.id, s.terms);
    expect(s.trips.getTrip(s.USER.tommy, v.trip.id).trip.participantCount).toBe(2);
    expect(s.trips.getTrip(s.USER.tommy, ret.trip.id).trip.participantCount).toBe(1);
  });

  it("rolls back both legs when the return is invalid", async () => {
    const s = setup();
    const before = s.db.trips.length;
    await expectCode(() => s.trips.createTrip(s.USER.tommy, {
      pickupLocationId: LOC.village, destinationLocationId: LOC.lax, departureTime: inHours(5), returnDepartureTime: inHours(4),
    }), "VALIDATION_ERROR");
    expect(s.db.trips.length).toBe(before);
  });

  it("rejects destinations outside every ride region", async () => {
    const s = setup();
    await expectCode(() => s.trips.createTrip(s.USER.tommy, { pickupLocationId: LOC.village, destinationLocationId: LOC.longBeach, departureTime: inHours(5) }), "VALIDATION_ERROR");
  });
});

describe("Search and time", () => {
  it("resolves the destination's region and ranks by distance, then departure", async () => {
    const s = setup();
    // Pickup Webb -> The Grove exists; add another Melrose/Fairfax trip that's farther from The Grove.
    const pinks = s.db.locations.find((l) => l.name === "Pink's Hot Dogs")!;
    const far = await s.trips.createTrip(s.students[0], { pickupLocationId: LOC.village, destinationLocationId: pinks.id, departureTime: inHours(2) });
    const r = s.trips.listTrips(s.USER.hannah, { scope: "discover", destinationLocationId: LOC.grove });
    expect(r.items.map((v) => v.trip.id)).toEqual([TRIP.groveOutbound, far.trip.id]);
    expect(r.items.every((v) => v.destination.regionId === region("melrose-fairfax"))).toBe(true);
  });

  it("uses the explicit region over the inferred one", async () => {
    const s = setup();
    const r = s.trips.listTrips(s.USER.hannah, { scope: "discover", destinationLocationId: LOC.grove, regionId: region("lax") });
    expect(r.items.map((v) => v.trip.id)).toEqual([TRIP.joinableLax]);
  });

  it("filters with inclusive from and exclusive to", async () => {
    const s = setup();
    const lax = s.db.trips.find((t) => t.id === TRIP.joinableLax)!;
    const at = lax.departureTime;
    const ids = (q: object) => s.trips.listTrips(s.USER.hannah, { scope: "discover", ...q }).items.map((v) => v.trip.id);
    expect(ids({ from: at, to: inHours(21) })).toContain(TRIP.joinableLax);
    expect(ids({ from: inHours(0), to: at })).not.toContain(TRIP.joinableLax);
  });

  it("renders Los Angeles time across daylight saving", async () => {
    expect(laLocalToUtc("2026-07-01T09:00")).toBe("2026-07-01T16:00:00.000Z"); // PDT
    expect(laLocalToUtc("2026-12-01T09:00")).toBe("2026-12-01T17:00:00.000Z"); // PST
    expect(formatTime("2026-03-08T10:30:00.000Z")).toBe("3:30 AM"); // just after spring-forward
    expect(laStartOfDay(new Date(NOW))).toBe("2026-11-13T08:00:00.000Z");
  });

  it("hides cancelled trips and past trips from discovery", async () => {
    const s = setup();
    const ids = s.trips.listTrips(s.USER.tommy, { scope: "discover" }).items.map((v) => v.trip.id);
    expect(ids).not.toContain(TRIP.pastDodgers);
  });
});

describe.each([4, 6])("Agreement and concurrency at capacity %i", (capacity) => {
  it("requires current terms", async () => {
    const s = setup(capacity);
    await expectCode(() => s.trips.joinTrip(s.USER.tommy, TRIP.palladium, {}), "AGREEMENT_REQUIRED");
    await expectCode(() => s.trips.joinTrip(s.USER.tommy, TRIP.palladium, { agreementAccepted: true, agreementVersion: "old" }), "AGREEMENT_REQUIRED");
  });

  it("gives the last seat to exactly one of two competing riders", async () => {
    const s = setup(capacity);
    const id = TRIP.palladium; // Booker only
    for (let i = 0; i < capacity - 2; i++) await s.trips.joinTrip(s.students[i], id, s.terms);
    const [a, b] = [s.students[6], s.students[7]];
    // Both requests are in flight at once: each waits on drive times before it can write.
    const results = (await Promise.all([a, b].map(async (u) => {
      try { await s.trips.joinTrip(u, id, s.terms); return "ok"; } catch (e) { return (e as { code: string }).code; }
    })));
    expect(results.sort()).toEqual(["TRIP_FULL", "ok"]);
    const view = s.trips.getTrip(a, id);
    expect(view.trip.participantCount).toBe(capacity);
    expect(view.trip.status).toBe("full");
    // Winner retries: still one membership.
    await s.trips.joinTrip(a, id, s.terms);
    expect(s.db.participants.filter((p) => p.tripId === id && p.userId === a).length).toBe(1);
  });
});

describe("Leave and cancellation", () => {
  it("reopens a seat when a rider leaves, and repeats succeed", async () => {
    const s = setup();
    await s.trips.joinTrip(s.USER.tommy, TRIP.joinableLax, s.terms);
    expect(s.trips.getTrip(s.USER.tommy, TRIP.joinableLax).trip.participantCount).toBe(3);
    const left = s.trips.leaveTrip(s.USER.tommy, TRIP.joinableLax);
    expect(left.trip.participantCount).toBe(2);
    expect(left.viewerMembership).toBe("cancelled");
    expect(left.roster).toBeNull();
    expect(s.trips.leaveTrip(s.USER.tommy, TRIP.joinableLax).viewerMembership).toBe("cancelled");
    // Rejoin reactivates the same row.
    await s.trips.joinTrip(s.USER.tommy, TRIP.joinableLax, s.terms);
    expect(s.db.participants.filter((p) => p.tripId === TRIP.joinableLax && p.userId === s.USER.tommy).length).toBe(1);
  });

  it("blocks leaving inside the cutoff window", async () => {
    const s = setup();
    await s.trips.joinTrip(s.USER.tommy, TRIP.joinableLax, s.terms);
    const dep = Date.parse(s.db.trips.find((t) => t.id === TRIP.joinableLax)!.departureTime);
    s.clock.current = new Date(dep - 30 * 60000);
    await expectCode(() => s.trips.leaveTrip(s.USER.tommy, TRIP.joinableLax), "LEAVE_WINDOW_CLOSED");
  });

  it("lets only the Booker cancel; cancellation hides the trip and closes joins and chat", async () => {
    const s = setup();
    await s.trips.joinTrip(s.USER.tommy, TRIP.joinableLax, s.terms);
    await expectCode(() => s.trips.leaveTrip(s.USER.maya, TRIP.joinableLax), "FORBIDDEN"); // Booker can't leave
    await expectCode(() => s.trips.cancelTrip(s.USER.tommy, TRIP.joinableLax), "FORBIDDEN");
    const c = s.trips.cancelTrip(s.USER.maya, TRIP.joinableLax);
    expect(c.trip.status).toBe("cancelled");
    expect(s.trips.cancelTrip(s.USER.maya, TRIP.joinableLax).trip.status).toBe("cancelled"); // repeat
    expect(s.trips.listTrips(s.USER.hannah, { scope: "discover" }).items.map((v) => v.trip.id)).not.toContain(TRIP.joinableLax);
    await expectCode(() => s.trips.joinTrip(s.USER.hannah, TRIP.joinableLax, s.terms), "TRIP_NOT_FOUND");
    await expectCode(() => s.messages.sendMessage(s.USER.tommy, TRIP.joinableLax, "hi"), "FORBIDDEN");
  });
});

describe("One active trip per rider (D-002)", () => {
  it("blocks a second trip but allows the linked return leg", async () => {
    const s = setup();
    await s.trips.joinTrip(s.USER.tommy, TRIP.groveOutbound, s.terms);
    await expectCode(() => s.trips.joinTrip(s.USER.tommy, TRIP.palladium, s.terms), "ACTIVE_TRIP_EXISTS");
    await expectCode(() => s.trips.createTrip(s.USER.tommy, { pickupLocationId: LOC.village, destinationLocationId: LOC.lax, departureTime: inHours(4) }), "ACTIVE_TRIP_EXISTS");
    expect((await s.trips.joinTrip(s.USER.tommy, TRIP.groveReturn, s.terms)).viewerMembership).toBe("confirmed");
  });
});

describe("Chat isolation", () => {
  it("lets members talk and blocks nonmembers and former members", async () => {
    const s = setup();
    await s.trips.joinTrip(s.USER.tommy, TRIP.joinableLax, s.terms);
    const m = s.messages.sendMessage(s.USER.tommy, TRIP.joinableLax, "  See you at the Village!  ");
    expect(m.content).toBe("See you at the Village!");
    const seen = s.messages.getMessages(s.USER.maya, TRIP.joinableLax).items;
    expect(seen[0].id).toBe(m.id); // newest first
    await expectCode(() => s.messages.getMessages(s.USER.hannah, TRIP.joinableLax), "FORBIDDEN");
    await expectCode(() => s.messages.sendMessage(s.USER.hannah, TRIP.joinableLax, "hi"), "FORBIDDEN");
    s.trips.leaveTrip(s.USER.tommy, TRIP.joinableLax);
    await expectCode(() => s.messages.getMessages(s.USER.tommy, TRIP.joinableLax), "FORBIDDEN");
  });

  it("validates length and pages older messages", async () => {
    const s = setup();
    await expectCode(() => s.messages.sendMessage(s.USER.maya, TRIP.joinableLax, "   "), "VALIDATION_ERROR");
    await expectCode(() => s.messages.sendMessage(s.USER.maya, TRIP.joinableLax, "x".repeat(1001)), "VALIDATION_ERROR");
    for (let i = 0; i < 30; i++) {
      s.clock.current = new Date(Date.parse(NOW) + i * 1000);
      s.messages.sendMessage(s.USER.maya, TRIP.joinableLax, `m${i}`);
    }
    const p1 = s.messages.getMessages(s.USER.maya, TRIP.joinableLax);
    expect(p1.items).toHaveLength(25);
    expect(p1.items[0].content).toBe("m29");
    const p2 = s.messages.getMessages(s.USER.maya, TRIP.joinableLax, p1.nextCursor!);
    expect(p2.items.map((x) => x.id)).not.toContain(p1.items[24].id);
    expect(p1.items.length + p2.items.length).toBe(32); // 30 new + 2 seeded
    expect(p2.nextCursor).toBeNull();
  });
});

describe("Honor system", () => {
  it("records pending reports without changing membership, and denies duplicates and non-Bookers", async () => {
    const s = setup();
    const r = s.attendance.reportNoShow(s.USER.hannah, TRIP.pastDodgers, s.USER.maya);
    expect(r.status).toBe("pending");
    expect(s.db.participants.find((p) => p.tripId === TRIP.pastDodgers && p.userId === s.USER.maya)!.status).toBe("confirmed");
    await expectCode(() => s.attendance.reportNoShow(s.USER.hannah, TRIP.pastDodgers, s.USER.maya), "ALREADY_REPORTED");
    await expectCode(() => s.attendance.reportNoShow(s.USER.hannah, TRIP.pastDodgers, s.USER.jordan), "ALREADY_REPORTED"); // seeded
    await expectCode(() => s.attendance.reportNoShow(s.USER.maya, TRIP.pastDodgers, s.USER.jordan), "FORBIDDEN");
    await expectCode(() => s.attendance.reportNoShow(s.USER.maya, TRIP.joinableLax, s.USER.jordan), "TRIP_CLOSED"); // not departed
  });
});

describe("Locations", () => {
  it("returns persisted locations with their region, or null outside regions", async () => {
    const s = setup();
    const grove = (await s.locations.searchLocations("grove")).items[0];
    expect(grove.id).toBe(LOC.grove);
    expect(grove.regionId).toBe(region("melrose-fairfax"));
    const lb = (await s.locations.searchLocations("aquarium")).items[0];
    expect(lb.regionId).toBeNull();
    expect(s.locations.getPickups().map((p) => p.name)).toEqual(["USC Village", "Everybody's Kitchen", "Webb Tower"]);
  });
});
