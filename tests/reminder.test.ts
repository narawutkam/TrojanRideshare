import { describe, expect, it } from "vitest";
import { minutesUntil, reminderPhase, uberLink } from "@/lib/reminder";
import type { Location } from "@/types";

const dep = "2026-11-20T20:00:00.000Z";
const at = (minutesBefore: number) => Date.parse(dep) - minutesBefore * 60000;

const place = (name: string, lat: number, lng: number): Location => ({
  id: name, name, address: `${name}, Los Angeles, CA`, latitude: lat, longitude: lng, regionId: null, googlePlaceId: null,
});

describe("booking reminder window", () => {
  it("is not due more than 15 minutes before departure", () => {
    expect(reminderPhase(dep, at(16))).toBe("later");
    expect(reminderPhase(dep, at(120))).toBe("later");
  });

  it("is due from 15 minutes before until 15 minutes after", () => {
    expect(reminderPhase(dep, at(15))).toBe("now");
    expect(reminderPhase(dep, at(1))).toBe("now");
    expect(reminderPhase(dep, at(0))).toBe("now");
    expect(reminderPhase(dep, at(-15))).toBe("now");
  });

  it("is over after that", () => {
    expect(reminderPhase(dep, at(-16))).toBe("over");
  });

  it("counts whole minutes up and never goes negative", () => {
    expect(minutesUntil(dep, at(10) + 1000)).toBe(10);
    expect(minutesUntil(dep, at(-5))).toBe(0);
  });
});

describe("uberLink", () => {
  it("fills in pickup and the last stop with encoded names", () => {
    const url = uberLink(place("Webb Tower", 34.0252, -118.2867), place("Quarters Korean BBQ", 34.06, -118.3));
    expect(url.startsWith("https://m.uber.com/ul/?action=setPickup&")).toBe(true);
    expect(url).toContain("pickup[latitude]=34.0252");
    expect(url).toContain("dropoff[longitude]=-118.3");
    expect(url).toContain("dropoff[nickname]=Quarters%20Korean%20BBQ");
  });
});
