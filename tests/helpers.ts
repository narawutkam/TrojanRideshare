import { loadConfig } from "@/config/env";
import { createMockMapsAdapter } from "@/lib/maps/adapter";
import { createMockTravelTimeProvider } from "@/lib/routing/travel-time";
import { createFixtures, USER } from "@/lib/mock/fixtures";
import { createServices } from "@/lib/services";
import { fixedClock } from "@/lib/time";
import type { User } from "@/types";

/** Fixed demo clock: Friday 2026-11-13 10:00 PST. */
export const NOW = "2026-11-13T18:00:00.000Z";

export function setup(capacity = 4, now = NOW) {
  const db = createFixtures(new Date(now), capacity);
  // Extra eligible students with no trips, for capacity races.
  const extra: User[] = Array.from({ length: 8 }, (_, i) => ({
    id: `00000000-0000-4000-8900-${String(i + 1).padStart(12, "0")}`, email: `student${i + 1}@usc.edu`,
    displayName: `Student ${i + 1}`, verifiedUSC: true, createdAt: now,
  }));
  db.users.push(...extra);
  const config = loadConfig({ APP_MODE: "mock", TRIP_CAPACITY: String(capacity) });
  const clock = { current: new Date(now), now() { return new Date(this.current); } };
  const services = createServices({ db, clock, config, maps: createMockMapsAdapter(() => db.locations), travel: createMockTravelTimeProvider() });
  const terms = { agreementAccepted: true, agreementVersion: config.agreementVersion };
  return { ...services, db, config, clock, terms, students: extra.map((u) => u.id), USER };
}

export { fixedClock };

/** Works for sync and async calls: `await expectCode(() => service.call(), "CODE")`. */
export async function expectCode(fn: () => unknown, code: string) {
  try {
    await fn();
  } catch (e) {
    if ((e as { code?: string }).code === code) return;
    throw new Error(`Expected ${code}, got ${(e as { code?: string }).code ?? e}`);
  }
  throw new Error(`Expected ${code}, but the call succeeded`);
}
