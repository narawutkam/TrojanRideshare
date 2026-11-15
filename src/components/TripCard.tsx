"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { detourLabel } from "@/components/RouteTimeline";
import { MembershipLabel, TripStatusLabel } from "@/components/ui";
import { money } from "@/lib/money";
import { formatDay, formatTime } from "@/lib/time";
import type { TripView } from "@/types";

/** Shared trip summary (README §2 "Reuse … TripCard"): departure time first, then where it goes. */
export function TripCard({ view, actorId, extra, actions }: {
  view: TripView; actorId?: string; extra?: ReactNode; actions?: ReactNode;
}) {
  const { trip, pickup, destination, viewerMembership, route, fit } = view;
  const seatsLeft = Math.max(0, trip.maxParticipants - trip.participantCount);
  // After a destination search, show the route with the rider's own stop in it, not the trip as posted.
  const shown = fit?.route ?? route;
  const stops = shown?.stops ?? [];
  const last = stops[stops.length - 1]?.location ?? destination;
  const yours = fit?.route?.your;
  const via = stops.slice(0, -1).map((s) => (yours?.order === s.order ? `${s.location.name} (your stop)` : s.location.name));
  const price = fit?.route?.pricing;
  const tripHref = `/trips/${trip.id}${fit?.stop ? `?stop=${fit.stop.id}` : ""}`; // the trip page opens with this stop selected

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="whitespace-nowrap text-[22px] font-bold leading-none tabular-nums">{formatTime(trip.departureTime)}</p>
          <p className="mt-1 text-sm text-muted">{formatDay(trip.departureTime)}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <MembershipLabel status={viewerMembership} isBooker={actorId === trip.bookerId} />
          <TripStatusLabel status={trip.status} />
        </div>
      </div>
      <p className="mt-3 text-[17px] font-semibold leading-snug">{pickup.name} → {last.name}</p>
      {via.length > 0 && <p className="text-sm text-muted">via {via.join(", ")}</p>}
      <p className="mt-1 text-sm text-muted">
        {stops.length > 1 ? `${stops.length} stops` : "Direct"}
        {shown ? ` · about ${Math.round(shown.totalMinutes)} min` : ""}
        {` · ${trip.status === "full" ? "no seats left" : `${seatsLeft} of ${trip.maxParticipants} seats open`}`}
        {trip.returnTripId ? " · return offered" : ""}
      </p>
      {yours && (
        <p className="mt-3 border-l-4 border-ok bg-[#eef6f0] px-3 py-2 text-[15px] text-ink">
          <b className="font-semibold">You get out at {fit?.stop?.name ?? "your stop"}.</b> About {Math.round(yours.rideMinutes)} min ride, {detourLabel(yours.detourMinutes)}
        </p>
      )}
      {price && price.yourShare !== null && (
        <div className="mt-3 flex items-end justify-between gap-3 border-t border-line pt-3">
          <div>
            <p className="text-[26px] font-bold leading-none tabular-nums">{money(price.yourShare)}</p>
            <p className="mt-1 text-sm text-muted">your share, estimated</p>
          </div>
          {price.yourSoloPrice !== null && price.yourSoloPrice > price.yourShare && (
            <p className="text-right text-sm text-muted">Alone: <span className="line-through">{money(price.yourSoloPrice)}</span></p>
          )}
        </div>
      )}
      {extra}
    </>
  );

  if (!actions) {
    return (
      <article>
        <Link href={tripHref} className="block rounded-sm border border-line bg-surface p-4 active:bg-field">{body}</Link>
      </article>
    );
  }
  return (
    <article className="rounded-sm border border-line bg-surface p-4">
      {body}
      <div className="mt-4 grid gap-2">{actions}</div>
    </article>
  );
}
