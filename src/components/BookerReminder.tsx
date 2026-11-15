"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { money } from "@/lib/money";
import { minutesUntil, REMINDER_LEAD_MINUTES, reminderPhase, uberLink } from "@/lib/reminder";
import { formatTime } from "@/lib/time";
import type { TripView } from "@/types";

/** Re-render every 20 seconds so the countdown and the reminder window stay current. */
export function useNow(intervalMs = 20000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      /* copying is a convenience; the address is on screen */
    }
  }
  return (
    <button type="button" onClick={copy} aria-label={`Copy ${label}`} className="min-h-11 shrink-0 px-2 text-[13px] font-semibold text-cardinal">
      {done ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * Step-by-step guide for the Booker to book the group Uber. Always available on their trip page; it turns into a
 * "time to book" alert in the 15 minutes before departure.
 */
export function BookingInstructions({ view, meId }: { view: TripView; meId: string }) {
  const now = useNow();
  const { trip, pickup, route } = view;
  const phase = reminderPhase(trip.departureTime, now);
  const stops = route?.stops ?? [];
  const finalStop = stops[stops.length - 1]?.location ?? view.destination;
  const mins = minutesUntil(trip.departureTime, now);
  const others = route?.pricing?.shares?.filter((s) => s.userId !== meId) ?? [];
  const departed = Date.parse(trip.departureTime) <= now;
  const due = phase === "now";

  return (
    <section className={`rounded-xl p-5 ${due ? "bg-gold" : "border border-line bg-surface"}`} aria-label="Book the Uber">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-cardinal">{due ? "Time to book" : "For the Booker"}</p>
      <h2 className="mt-1 text-xl font-bold leading-tight">
        {due
          ? departed ? "Your departure time is here. Book the Uber now." : `Book the Uber in ${mins} min`
          : "How to book the Uber"}
      </h2>
      <p className="mt-1 text-sm leading-snug text-ink">
        {due
          ? `Be at ${pickup.name} now. Riders are meeting you there for ${formatTime(trip.departureTime)}.`
          : `We'll remind you ${REMINDER_LEAD_MINUTES} minutes before ${formatTime(trip.departureTime)}. Here is what to do then.`}
      </p>

      <ol className="mt-4 grid gap-3 text-[15px] leading-snug">
        <li className="flex gap-3">
          <Step n={1} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Be at the pickup</p>
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 text-sm text-muted">{pickup.name}, {pickup.address}</p>
              <CopyButton text={pickup.address} label="pickup address" />
            </div>
          </div>
        </li>
        <li className="flex gap-3">
          <Step n={2} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Open Uber and set the pickup</p>
            <p className="text-sm text-muted">Enter the pickup address above as where you are getting picked up.</p>
            <a href={uberLink(pickup, finalStop)} target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-ink px-4 text-sm font-semibold text-white">
              Open Uber with pickup and last stop filled in
            </a>
          </div>
        </li>
        <li className="flex gap-3">
          <Step n={3} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Add the stops in this order</p>
            <ul className="mt-1 grid gap-1">
              {stops.map((s) => (
                <li key={s.location.id} className="flex items-start justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <b className="font-semibold">{s.order}. {s.location.name}</b>{s.isFinal ? " (last stop)" : ""}
                    <span className="block text-muted">{s.location.address}</span>
                    {s.riders && s.riders.length > 0 && <span className="block text-muted">Drops off {s.riders.map((r) => (r.userId === meId ? "you" : r.displayName)).join(", ")}</span>}
                  </span>
                  <CopyButton text={s.location.address} label={`${s.location.name} address`} />
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted">In Uber, tap the drop-off box, then &quot;Add stop&quot; for each one after the first. Keep the order so nobody&apos;s ride runs long.</p>
          </div>
        </li>
        <li className="flex gap-3">
          <Step n={4} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Check the price, then request the ride</p>
            <p className="text-sm text-muted">
              {route?.pricing ? `We estimate about ${money(route.pricing.estimatedTotal)} for the whole ride. ` : ""}Uber&apos;s price in the app is the real one. Set it to leave now, and wait for riders to arrive before you confirm.
            </p>
          </div>
        </li>
        <li className="flex gap-3">
          <Step n={5} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Tell your party in the chat</p>
            <p className="text-sm text-muted">Post the driver, car and plate so riders can find you.</p>
            {others.length > 0 && (
              <p className="mt-1 text-sm text-muted">
                Riders pay you back: {others.map((s) => `${s.displayName} ${money(s.amount)}`).join(", ")} (estimated).
              </p>
            )}
          </div>
        </li>
      </ol>
    </section>
  );
}

function Step({ n }: { n: number }) {
  return <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cardinal text-xs font-bold text-white" aria-hidden>{n}</span>;
}

/**
 * Banner shown on every page to a Booker whose trip departs within 15 minutes. It is an in-app reminder: it appears
 * while the site is open, not as a phone push message.
 */
export function BookerReminderBar({ trips, meId }: { trips: TripView[]; meId: string }) {
  const now = useNow();
  const due = trips
    .filter((v) => v.trip.bookerId === meId && v.viewerMembership === "confirmed" && v.trip.status !== "cancelled" && v.trip.status !== "completed")
    .filter((v) => reminderPhase(v.trip.departureTime, now) === "now")
    .sort((a, b) => a.trip.departureTime.localeCompare(b.trip.departureTime))[0];
  if (!due) return null;
  const mins = minutesUntil(due.trip.departureTime, now);
  return (
    <Link href={`/trips/${due.trip.id}#book`} className="block bg-gold px-5 py-3 text-ink" role="status">
      <span className="block text-[15px] font-bold leading-snug">
        {mins > 0 ? `Time to book your Uber in ${mins} min` : "Time to book your Uber now"}
      </span>
      <span className="block text-[13px] leading-snug">
        Be at {due.pickup.name} for {formatTime(due.trip.departureTime)}. <u className="font-semibold">See instructions</u>
      </span>
    </Link>
  );
}
