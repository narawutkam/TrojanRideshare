/**
 * Stable fixture IDs (README §7 "Use stable IDs"). Valid v4-shaped UUIDs so they
 * pass the same validation as live IDs. Group digits keep fixture kinds apart.
 */
export const FIXTURE_GROUP = { user: 1, region: 2, location: 3, trip: 4, participant: 5, message: 6, report: 7 } as const;

export function fixtureId(group: keyof typeof FIXTURE_GROUP, n: number): string {
  return `00000000-0000-4000-8${FIXTURE_GROUP[group]}00-${n.toString().padStart(12, "0")}`;
}

export function newId(): string {
  return crypto.randomUUID();
}
