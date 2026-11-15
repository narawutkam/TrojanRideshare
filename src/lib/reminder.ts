import type { Location } from "@/types";

/** The Booker is reminded this many minutes before departure, and the reminder stays up this long after it. */
export const REMINDER_LEAD_MINUTES = 15;
export const REMINDER_GRACE_MINUTES = 15;

export type ReminderPhase = "later" | "now" | "over";

/** Where a trip is relative to its booking reminder: not yet, due now, or long past. */
export function reminderPhase(departureTime: string, now: number = Date.now()): ReminderPhase {
  const minutes = (Date.parse(departureTime) - now) / 60000;
  if (minutes > REMINDER_LEAD_MINUTES) return "later";
  if (minutes >= -REMINDER_GRACE_MINUTES) return "now";
  return "over";
}

/** Whole minutes until departure, never negative. */
export function minutesUntil(departureTime: string, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(departureTime) - now) / 60000));
}

/**
 * Uber's public deep link: opens the app (or m.uber.com) with the pickup and the final stop filled in. Uber's link
 * takes one drop-off, so any middle stops still have to be added inside Uber, which the instructions explain.
 */
export function uberLink(pickup: Location, finalStop: Location): string {
  const part = (key: string, l: Location) => [
    `${key}[latitude]=${l.latitude}`,
    `${key}[longitude]=${l.longitude}`,
    `${key}[nickname]=${encodeURIComponent(l.name)}`,
    `${key}[formatted_address]=${encodeURIComponent(l.address)}`,
  ];
  return `https://m.uber.com/ul/?action=setPickup&${[...part("pickup", pickup), ...part("dropoff", finalStop)].join("&")}`;
}
