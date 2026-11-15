import { getConfig } from "@/config/env";
import { createFixtures, type MockDb } from "@/lib/mock/fixtures";

/**
 * Shared in-memory fixture store for mock mode (README §7). One instance per
 * server process, shared by every demo session so two browser profiles see the
 * same trips. Survives Next.js dev hot reloads via globalThis. On serverless
 * hosting it is backed by a shared snapshot (see persistence.ts).
 */
const g = globalThis as unknown as { __hacksc_mock_db?: MockDb; __hacksc_seeded_at?: string };

export function getMockDb(): MockDb {
  if (getConfig().appMode !== "mock") throw new Error("The mock store is only available in APP_MODE=mock.");
  if (!g.__hacksc_mock_db) {
    g.__hacksc_mock_db = createFixtures(new Date(), getConfig().tripCapacity);
    g.__hacksc_seeded_at = new Date().toISOString();
  }
  return g.__hacksc_mock_db;
}

/** When the current seed data was created. Seeded trips are dated from this moment. */
export function getSeededAt(): string {
  return g.__hacksc_seeded_at ?? new Date(0).toISOString();
}

/**
 * Replace the store's contents with a loaded snapshot. The object itself is kept, because services hold a
 * reference to it: they read its arrays on every call, so they see the new data.
 */
export function installMockDb(db: MockDb, seededAt: string): void {
  if (!g.__hacksc_mock_db) g.__hacksc_mock_db = db;
  else Object.assign(g.__hacksc_mock_db, db);
  g.__hacksc_seeded_at = seededAt;
}

/** Demo reset action (README §7): restore the known starting dataset. */
export function resetMockDb(): MockDb {
  const fresh = createFixtures(new Date(), getConfig().tripCapacity);
  installMockDb(fresh, new Date().toISOString());
  return getMockDb();
}
