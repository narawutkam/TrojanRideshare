"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LocationSearch } from "@/components/LocationSearch";
import { Button, ErrorState, Field, inputClass, Loading, Notice } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { useLoad, useRegions } from "@/lib/client/hooks";
import { laLocalToUtc, utcToLaLocal } from "@/lib/time";
import type { Location } from "@/types";

function defaultDeparture(hours: number): string {
  const d = new Date(Date.now() + hours * 36e5);
  d.setUTCMinutes(0, 0, 0);
  return utcToLaLocal(d.toISOString());
}

/** Create Trip (README R02, R06, R08): pickup, destination, time, Booker role and optional linked return. */
export function CreateTripScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const regions = useRegions();
  const pickups = useLoad(() => api.pickups(), []);
  const terms = useLoad(() => api.terms(), []);

  const prefill = params.get("destination");
  const [pickupId, setPickupId] = useState(params.get("pickup") ?? "");
  const [destination, setDestination] = useState<Location | null>(null);
  const [prefillName] = useState(params.get("name") ?? "");
  const [departure, setDeparture] = useState(defaultDeparture(3));
  const [withReturn, setWithReturn] = useState(false);
  const [returnAt, setReturnAt] = useState(defaultDeparture(6));
  const [ack, setAck] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Prefilled create action (e.g. after TRIP_FULL): resolve the destination ID through the same search.
  useEffect(() => {
    if (!prefill || !prefillName || prefillName.length < 2) return;
    api.searchLocations(prefillName).then((r) => {
      const hit = r.items.find((l) => l.id === prefill);
      if (hit) setDestination((d) => d ?? hit);
    }).catch(() => {});
  }, [prefill, prefillName]);

  const effectivePickup = pickupId || pickups.data?.[0]?.id || "";
  const outside = !!destination && !destination.regionId;
  const canSubmit = !!effectivePickup && !!destination && !outside && !!departure && ack && !pending && (!withReturn || !!returnAt);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !destination) return;
    setPending(true);
    setError(null);
    try {
      const view = await api.createTrip({
        pickupLocationId: effectivePickup,
        destinationLocationId: destination.id,
        departureTime: laLocalToUtc(departure),
        returnDepartureTime: withReturn ? laLocalToUtc(returnAt) : undefined,
      });
      router.push(`/trips/${view.trip.id}?created=1`);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("INTERNAL_ERROR", "Could not create the trip.", 500));
      setPending(false); // if the outcome is unknown, check My trips before retrying (README §4)
    }
  }

  if (pickups.loading || terms.loading) return <AppShell title="Create a trip"><Loading /></AppShell>;
  if (pickups.error) return <AppShell title="Create a trip"><ErrorState error={pickups.error} onRetry={pickups.reload} /></AppShell>;

  return (
    <AppShell title="Create a trip" subtitle="You'll be the Booker: you book and pay for the Uber on the day, and riders split the fare with you.">
      <form onSubmit={submit} className="grid max-w-2xl gap-4 rounded-sm border border-line bg-surface p-5" noValidate>
        <Field label="Pickup" htmlFor="pickup">
          <select id="pickup" className={inputClass} value={effectivePickup} onChange={(e) => setPickupId(e.target.value)}>
            {pickups.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>

        <Field label="Destination" htmlFor="destination"
          hint="Must be inside one of the LA ride regions."
          error={outside ? "That place isn't inside a ride region, so a trip can't be created there." : undefined}>
          <LocationSearch id="destination" value={destination} onChange={setDestination} regionNames={regions}
            placeholder={prefillName ? `e.g. ${prefillName}` : "Search a place in LA"} />
        </Field>
        {destination?.regionId && <Notice tone="ok">Region: <b>{regions.get(destination.regionId)}</b></Notice>}

        <Field label="Departure (Los Angeles time)" htmlFor="departure">
          <input id="departure" type="datetime-local" className={inputClass} value={departure} onChange={(e) => setDeparture(e.target.value)} required />
        </Field>

        <div className="grid gap-3 rounded-sm border border-line p-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 accent-cardinal" checked={withReturn} onChange={(e) => setWithReturn(e.target.checked)} />
            <span><b>Add an optional return trip.</b> It&apos;s listed as its own trip back to your pickup. Riders sign up for it separately.</span>
          </label>
          {withReturn && (
            <Field label="Return departure (Los Angeles time)" htmlFor="return">
              <input id="return" type="datetime-local" className={inputClass} value={returnAt} onChange={(e) => setReturnAt(e.target.value)} />
            </Field>
          )}
        </div>

        <label className="flex items-start gap-2 rounded-sm border border-line p-3 text-sm">
          <input type="checkbox" className="mt-1 accent-cardinal" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>
            <b>I&apos;m the Booker.</b> I&apos;ll book and pay for the Uber on departure day and add the riders. {terms.data?.text}
            {terms.data && <span className="block text-xs text-muted">Terms version {terms.data.version}</span>}
          </span>
        </label>

        {error && (
          <Notice tone="error">
            {error.message}{" "}
            {error.code === "ACTIVE_TRIP_EXISTS" && <Link href="/my-trips" className="font-semibold underline">Go to My trips</Link>}
          </Notice>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!canSubmit}>{pending ? "Posting…" : "Post trip"}</Button>
          <Link href="/trips" className="inline-flex items-center px-3 text-sm text-muted hover:underline">Cancel</Link>
        </div>
      </form>
    </AppShell>
  );
}
