"use client";

import { AppShell } from "@/components/AppShell";
import { TripCard } from "@/components/TripCard";
import { ButtonLink, EmptyState, ErrorState, Loading, Notice } from "@/components/ui";
import { api } from "@/lib/client/api";
import { useCurrentUser, useLoad } from "@/lib/client/hooks";
import type { TripView } from "@/types";

/** My Trips (README §1 demo scope): the actor's created and joined trips. */
export function MyTripsScreen() {
  const { data: me } = useCurrentUser();
  const list = useLoad(async () => {
    const all: TripView[] = [];
    let cursor: string | undefined;
    do {
      const r = await api.listTrips({ scope: "mine", cursor });
      all.push(...r.items);
      cursor = r.nextCursor ?? undefined;
    } while (cursor);
    return all;
  }, []);

  const now = Date.now();
  const all = list.data ?? [];
  const upcoming = all.filter((v) => v.viewerMembership === "confirmed" && v.trip.status !== "cancelled" && v.trip.status !== "completed" && Date.parse(v.trip.departureTime) > now);
  const past = all.filter((v) => !upcoming.includes(v)).sort((a, b) => b.trip.departureTime.localeCompare(a.trip.departureTime));

  const card = (v: TripView) => {
    const isBooker = v.trip.bookerId === me?.id;
    const note = v.viewerMembership === "cancelled" ? "You left this trip." : v.trip.status === "cancelled" ? "Cancelled by the Booker." : undefined;
    return (
      <TripCard key={v.trip.id} view={v} actorId={me?.id}
        extra={note && <p className="mt-2 text-sm text-muted">{note}</p>}
        actions={<ButtonLink href={`/trips/${v.trip.id}`} variant={upcoming.includes(v) ? "primary" : "secondary"}>
          {upcoming.includes(v) ? (isBooker ? "Manage trip and chat" : "Open party and chat") : "View"}
        </ButtonLink>} />
    );
  };

  return (
    <AppShell title="My trips" subtitle="You can be in one upcoming trip at a time. A trip and its return count as one.">
      {list.loading && !list.data ? <Loading /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : (
        <div className="grid gap-8">
          <section className="grid gap-3">
            <h2 className="text-xl font-bold">Upcoming</h2>
            {upcoming.length ? upcoming.map(card) : (
              <EmptyState title="You're not in an upcoming trip">
                <ButtonLink href="/trips">Find a trip</ButtonLink>
                <ButtonLink href="/create" variant="secondary">Create one</ButtonLink>
              </EmptyState>
            )}
            {upcoming.length > 0 && <Notice>Open a trip to see the route, chat with your party, leave it or, as the Booker, cancel it.</Notice>}
          </section>
          <section className="grid gap-3">
            <h2 className="text-xl font-bold">Past and cancelled</h2>
            {past.length ? past.map(card) : <p className="text-sm text-muted">Nothing here yet.</p>}
          </section>
        </div>
      )}
    </AppShell>
  );
}
