"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LocationSearch } from "@/components/LocationSearch";
import { TripCard } from "@/components/TripCard";
import { Button, ButtonLink, EmptyState, ErrorState, Field, inputClass, Loading, Notice } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { useCurrentUser, useLoad, useRegions } from "@/lib/client/hooks";
import { distanceKm } from "@/lib/regions/regions";
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

/** Find Trips (README R03): destination search, region and time filters, ranked results. */
export function DiscoverScreen() {
  const regions = useRegions();
  const { data: me } = useCurrentUser();
  const [destination, setDestination] = useState<Location | null>(null);
  const [regionId, setRegionId] = useState("");
  const [when, setWhen] = useState<When>("any");
  const [more, setMore] = useState<{ items: TripView[]; cursor: string | null; loading: boolean }>({ items: [], cursor: null, loading: false });
  const [moreError, setMoreError] = useState<ApiError | null>(null);

  const outsideRegions = !!destination && !destination.regionId && !regionId;
  const query: ListTripsQuery = { scope: "discover", destinationLocationId: destination?.id, regionId: regionId || undefined, ...timeRange(when) };
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

  const createHref = destination?.regionId
    ? `/create?destination=${destination.id}&name=${encodeURIComponent(destination.name)}`
    : "/create";

  return (
    <AppShell title="Find a trip" subtitle="Search where you're going. We match it to an LA region and rank trips by how close they're headed.">
      <section aria-label="Search and filters" className="grid gap-3 rounded-sm border border-line bg-surface p-4 sm:grid-cols-[2fr_1fr_1fr]">
        <Field label="Destination" htmlFor="dest">
          <LocationSearch id="dest" value={destination} onChange={setDestination} regionNames={regions} />
        </Field>
        <Field label="Region" htmlFor="region">
          <select id="region" className={inputClass} value={regionId} onChange={(e) => setRegionId(e.target.value)}>
            <option value="">{destination?.regionId ? `Auto: ${regions.get(destination.regionId) ?? "matched region"}` : "All regions"}</option>
            {[...regions].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
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
      </section>

      <div className="mt-3 grid gap-2">
        {destination?.regionId && !regionId && (
          <Notice tone="ok">{destination.name} is in <b>{regions.get(destination.regionId)}</b>. Showing trips to that region, closest first.</Notice>
        )}
        {outsideRegions && (
          <Notice tone="warn">{destination!.name} isn&apos;t inside a ride region, so trips can&apos;t be booked there. Try a destination inside one of the regions.</Notice>
        )}
      </div>

      <div className="mb-3 mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{regionId ? `Trips to ${regions.get(regionId)}` : destination?.regionId ? `Trips to ${regions.get(destination.regionId)}` : "Upcoming trips"}</h2>
        {!outsideRegions && <ButtonLink href={createHref} variant="secondary">+ Create a trip{destination?.regionId ? " here" : ""}</ButtonLink>}
      </div>

      {list.loading && !list.data ? <Loading /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !items.length ? (
        <EmptyState title={outsideRegions ? "No bookable trips for this destination" : "No trips match yet"}>
          {!outsideRegions && <ButtonLink href={createHref}>Create the first one</ButtonLink>}
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {items.map((v) => (
            <TripCard key={v.trip.id} view={v} actorId={me?.id} regionName={v.destination.regionId ? regions.get(v.destination.regionId) : undefined}
              extra={destination ? <p className="mt-1 text-xs text-muted">{distanceKm(destination, v.destination).toFixed(1)} km from {destination.name}</p> : undefined} />
          ))}
          {moreError && <ErrorState error={moreError} onRetry={loadMore} />}
          {nextCursor && <Button variant="secondary" onClick={loadMore} disabled={more.loading}>{more.loading ? "Loading…" : "Load more"}</Button>}
        </div>
      )}
    </AppShell>
  );
}
