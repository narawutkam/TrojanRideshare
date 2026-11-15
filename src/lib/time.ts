/** All display times render in Los Angeles (README §2 "Shared interface design"). */
export const APP_TIME_ZONE = "America/Los_Angeles";

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(iso: string): Clock {
  const t = new Date(iso);
  return { now: () => new Date(t) };
}

export const toUtc = (d: Date): string => d.toISOString();

export function formatTime(utc: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, hour: "numeric", minute: "2-digit" }).format(new Date(utc));
}

export function formatDay(utc: string, now: Date = new Date()): string {
  const key = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const d = new Date(utc);
  const tomorrow = new Date(now.getTime() + 864e5);
  if (key(d) === key(now)) return "Today";
  if (key(d) === key(tomorrow)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, weekday: "short", month: "short", day: "numeric" }).format(d);
}

export const formatDateTime = (utc: string, now?: Date) => `${formatDay(utc, now)}, ${formatTime(utc)}`;

/** Offset in minutes of LA from UTC at a given instant (handles daylight saving). */
function laOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Convert an LA wall-clock value from <input type="datetime-local"> ("YYYY-MM-DDTHH:mm") to UTC ISO. */
export function laLocalToUtc(local: string): string {
  const [date, time] = local.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = laOffsetMinutes(new Date(guess));
  let utc = guess - offset * 60000;
  const offset2 = laOffsetMinutes(new Date(utc)); // correct across a DST boundary
  if (offset2 !== offset) utc = guess - offset2 * 60000;
  return new Date(utc).toISOString();
}

/** UTC ISO → LA wall-clock value for <input type="datetime-local">. */
export function utcToLaLocal(utc: string): string {
  const d = new Date(utc);
  const shifted = new Date(d.getTime() + laOffsetMinutes(d) * 60000);
  return shifted.toISOString().slice(0, 16);
}

/** Start of the LA calendar day containing `at`, plus `days`, as UTC ISO. */
export function laStartOfDay(at: Date, days = 0): string {
  const local = utcToLaLocal(at.toISOString()).slice(0, 10);
  const base = laLocalToUtc(`${local}T00:00`);
  const d = new Date(Date.parse(base) + days * 864e5);
  // Re-anchor in case the added days crossed a DST change.
  return laLocalToUtc(`${utcToLaLocal(new Date(d.getTime() + 6 * 36e5).toISOString()).slice(0, 10)}T00:00`);
}
