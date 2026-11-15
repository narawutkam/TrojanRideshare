"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MembershipLabel, TripStatusLabel } from "@/components/ui";
import { formatDateTime } from "@/lib/time";
import type { TripView } from "@/types";

/** Shared trip summary card (README §2 "Reuse … TripCard"). */
export function TripCard({ view, regionName, actorId, extra, actions }: {
  view: TripView; regionName?: string; actorId?: string; extra?: ReactNode; actions?: ReactNode;
}) {
  const { trip, pickup, destination, viewerMembership } = view;
  const seatsLeft = Math.max(0, trip.maxParticipants - trip.participantCount);
  return (
    <article className="grid gap-3 rounded-sm border border-line bg-surface p-4">
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <TripStatusLabel status={trip.status} />
          {regionName && <span className="rounded-sm bg-cardinal/10 px-2 py-0.5 text-xs font-semibold text-cardinal">{regionName}</span>}
          <MembershipLabel status={viewerMembership} isBooker={actorId === trip.bookerId} />
          {trip.returnTripId && <span className="rounded-sm border border-line px-2 py-0.5 text-xs">Return trip offered</span>}
        </div>
        <h3 className="truncate text-lg font-bold">
          <Link href={`/trips/${trip.id}`} className="hover:underline">{destination.name}</Link>
        </h3>
        <p className="text-sm text-muted">
          {formatDateTime(trip.departureTime)} · from {pickup.name}
        </p>
        {extra}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <div className="text-sm" aria-label={`${trip.participantCount} of ${trip.maxParticipants} seats taken`}>
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: trip.maxParticipants }, (_, i) => (
              <span key={i} className={`h-3 w-3 rounded-[2px] border ${i < trip.participantCount ? "border-cardinal bg-cardinal" : "border-line bg-canvas"}`} />
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">
            {trip.participantCount}/{trip.maxParticipants} riders · {trip.status === "full" ? "no seats left" : `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left`}
          </p>
        </div>
        <div className="flex gap-2">{actions ?? <Link href={`/trips/${trip.id}`} className="text-sm font-semibold text-cardinal hover:underline">View trip →</Link>}</div>
      </div>
    </article>
  );
}
