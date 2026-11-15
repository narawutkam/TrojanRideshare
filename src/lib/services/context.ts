import type { AppConfig } from "@/config/env";
import { AppError } from "@/lib/services/errors";
import type { MapsAdapter } from "@/lib/maps/adapter";
import type { MockDb } from "@/lib/mock/fixtures";
import type { TravelTimeProvider } from "@/lib/routing/travel-time";
import type { Clock } from "@/lib/time";

/**
 * Everything a service needs. In mock mode `db` is the shared fixture store.
 * A live implementation replaces `db` access with Supabase transactions behind
 * the same service methods (README §2).
 */
export interface ServiceContext {
  db: MockDb;
  clock: Clock;
  config: AppConfig;
  maps: MapsAdapter;
  /** Drive times between places at a departure time (docs/decisions.md D-010). */
  travel: TravelTimeProvider;
}

/** Opaque offset cursor, scoped to the query that produced it (README §5). */
export function encodeCursor(offset: number, scope: string): string {
  return Buffer.from(JSON.stringify({ o: offset, s: scope })).toString("base64url");
}

export function decodeCursor(cursor: string | undefined, scope: string): number {
  if (!cursor) return 0;
  try {
    const v = JSON.parse(Buffer.from(cursor, "base64url").toString()) as { o: number; s: string };
    if (v.s === scope && Number.isInteger(v.o) && v.o >= 0) return v.o;
  } catch {
    /* fall through */
  }
  throw new Error("INVALID_CURSOR");
}

export function page<T>(items: T[], cursor: string | undefined, scope: string, size: number): { items: T[]; nextCursor: string | null } {
  let offset: number;
  try {
    offset = decodeCursor(cursor, scope);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid or expired cursor.");
  }
  const slice = items.slice(offset, offset + size);
  return { items: slice, nextCursor: offset + size < items.length ? encodeCursor(offset + size, scope) : null };
}
