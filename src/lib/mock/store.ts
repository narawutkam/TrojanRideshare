import { getConfig } from "@/config/env";
import { createFixtures, type MockDb } from "@/lib/mock/fixtures";

/**
 * Shared in-memory fixture store for mock mode (README §7). One instance per
 * server process, shared by every demo session so two browser profiles see the
 * same trips. Survives Next.js dev hot reloads via globalThis.
 */
const g = globalThis as unknown as { __hacksc_mock_db?: MockDb };

export function getMockDb(): MockDb {
  if (getConfig().appMode !== "mock") throw new Error("The mock store is only available in APP_MODE=mock.");
  if (!g.__hacksc_mock_db) g.__hacksc_mock_db = createFixtures(new Date(), getConfig().tripCapacity);
  return g.__hacksc_mock_db;
}

/** Demo reset action (README §7): restore the known starting dataset. */
export function resetMockDb(): MockDb {
  g.__hacksc_mock_db = createFixtures(new Date(), getConfig().tripCapacity);
  return g.__hacksc_mock_db;
}
