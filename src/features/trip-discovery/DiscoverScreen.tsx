"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LocationSearch } from "@/components/LocationSearch";
import { TripCard } from "@/components/TripCard";
import { Button, ButtonLink, EmptyState, ErrorState, Field, inputClass, Loading, Notice } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { useCurrentUser, useLoad, useRegions } from "@/lib/client/hooks";
import { money } from "@/lib/money";
import { laStartOfDay } from "@/lib/time";
import type { ListTripsQuery, Location, TripView } from "@/types";

type When = "any" | "today" | "tomorrow" | "week";

function timeRange(when: When): Pick<ListTripsQuery, "from" | "to"> {
  const now = new Date();
  if (when === "today") return { from: laStartOfDay(now, 0), to: laStartOfDay(now, 1) };
  if (when === "tomorrow") return { from: laStartOfDay(now, 1), to: laStartOfDay(now, 2) };
  if (when === "week") return { from: laStartOfDay(now, 0), to: laStartOfDay(now, 7) };
  return {};
}

/**
 * Find a trip (README R03). Search a destination and you get the trips whose route it fits:
 * the stop must not push anyone's ride past the detour limit (docs/decisions.md D-010).
 */
export function DiscoverScreen() {
  const regions = useRegions();
  const { data: me } = useCurrentUser();
  const pickups = useLoad(() => api.pickups(), []);
  const [destination, setDestination] = useState<Location | null>(null);
  const [pickupId, setPickupId] = useState("");
  const [when, setWhen] = useState<When>("any");
  const [more, setMore] = useState<{ items: TripView[]; cursor: string | null; loading: boolean }>({ items: [], cursor: null, loading: false });
  const [moreError, setMoreError] = useState<ApiError | null>(null);

  const outsideRegions = !!destination && !destination.regionId;
  const query: ListTripsQuery = { scope: "discover", destinationLocationId: destination?.id, pickupLocationId: pickupId || undefined, ...timeRange(when) };
  const key = JSON.stringify(query);

  const list = useLoad(async () => {
    setMore({ items: [], cursor: null, loading: false });
    if (outsideRegions) return { items: [] as TripView[], nextCursor: null };
    return api.listTrips(query);
  }, [key]);

  const items = [...(list.data?.items ?? []), ...more.items];
  const nextCursor = more.cursor ?? list.data?.nextCursor ?? null;

  async function loadMore() {
    if (!nextCursor) return;
    setMore((m) => ({ ...m, loading: true }));
    try {
      const r = await api.listTrips({ ...query, cursor: nextCursor });
      setMore((m) => ({ items: [...m.items, ...r.items], cursor: r.nextCursor, loading: false }));
      setMoreError(null);
    } catch (e) {
      setMore((m) => ({ ...m, loading: false }));
      setMoreError(e instanceof ApiError ? e : null);
    }
  }

  // Compare the options that fit: the fastest one is the baseline, and a cheaper option says by how much and how many more minutes.
  const fits = items.filter((v) => v.fit?.route?.your && v.fit.route.pricing?.yourShare != null);
  const shareOf = (v: TripView) => v.fit!.route!.pricing!.yourShare!;
  const baseline = fits.reduce<TripView | null>((best, v) => (!best || v.fit!.route!.your!.rideMinutes < best.fit!.route!.your!.rideMinutes ? v : best), null);
  const cheapest = fits.length > 1 ? fits.reduce((best, v) => (shareOf(v) < shareOf(best) ? v : best)) : null;

  /** The note under a result: what it saves against the most direct option, or that it is the lowest price. */
  const comparison = (v: TripView) => {
    if (!baseline || !v.fit?.route?.your) return null;
    if (v !== baseline) {
      const saves = shareOf(baseline) - shareOf(v);
      const moreMin = Math.round(v.fit.route.your.rideMinutes - baseline.fit!.route!.your!.rideMinutes);
      if (saves >= 0.005) {
        return (
          <p className="mt-3 border-l-4 border-gold bg-[#fff8d6] px-3 py-2 text-[15px] text-ink">
            <b className="font-semibold">Cheaper.</b> {money(saves)} less than the fastest option{moreMin > 0 ? `, for about ${moreMin} more min` : ""}
          </p>
        );
      }
    }
    return cheapest === v ? <p className="mt-3 border-l-4 border-gold bg-[#fff8d6] px-3 py-2 text-[15px] font-semibold text-ink">Lowest price of these options</p> : null;
  };

  const createHref = destination?.regionId ? `/create?destination=${destination.id}&name=${encodeURIComponent(destination.name)}` : "/create";

  return (
    <AppShell title="Where to?" subtitle="Pick a destination and we'll show the trips that can drop you there without a long detour.">
      <section aria-label="Search" className="grid gap-4">
        <Field label="Destination" htmlFor="dest">
          <LocationSearch id="dest" value={destination} onChange={setDestination} regionNames={regions} placeholder="Search a place in LA" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Leaving from" htmlFor="pickup">
            <select id="pickup" className={inputClass} value={pickupId} onChange={(e) => setPickupId(e.target.value)}>
              <option value="">Any pickup</option>
              {pickups.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="When" htmlFor="when">
            <select id="when" className={inputClass} value={when} onChange={(e) => setWhen(e.target.value as When)}>
              <option value="any">Any time</option>
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="week">Next 7 days</option>
            </select>
          </Field>
        </div>
      </section>

      {outsideRegions && (
        <div className="mt-4">
          <Notice tone="warn">{destination!.name} isn&apos;t inside a ride region, so trips can&apos;t take you there. Try a place inside one of the regions.</Notice>
        </div>
      )}

      <div className="mb-3 mt-8 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold">{destination && !outsideRegions ? `Trips that fit ${destination.name}` : "Upcoming trips"}</h2>
      </div>
      {fits.length > 1 && <p className="-mt-1 mb-3 text-sm text-muted">Riding with more people splits the fare, so a trip that goes a bit farther can cost you less.</p>}

      {list.loading && !list.data ? <Loading label={destination ? "Checking routes…" : "Loading…"} /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !items.length ? (
        <EmptyState title={outsideRegions ? "No trips for this place" : destination ? "No trip fits that stop yet" : "No trips yet"}>
          {!outsideRegions && <ButtonLink href={createHref}>{destination ? `Start a trip to ${destination.name}` : "Create the first one"}</ButtonLink>}
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {items.map((v) => <TripCard key={v.trip.id} view={v} actorId={me?.id} extra={comparison(v)} />)}
          {moreError && <ErrorState error={moreError} onRetry={loadMore} />}
          {nextCursor && <Button variant="secondary" onClick={loadMore} disabled={more.loading}>{more.loading ? "Loading…" : "Load more"}</Button>}
          {destination && !outsideRegions && (
            <div className="mt-2 text-center"><ButtonLink href={createHref} variant="secondary">Start a new trip to {destination.name}</ButtonLink></div>
          )}
        </div>
      )}
    </AppShell>
  );
}
