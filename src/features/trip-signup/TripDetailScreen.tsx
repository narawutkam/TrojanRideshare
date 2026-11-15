"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LocationSearch } from "@/components/LocationSearch";
import { detourLabel, RouteTimeline } from "@/components/RouteTimeline";
import { Button, ButtonLink, Card, Dialog, ErrorState, Field, inputClass, Loading, MembershipLabel, Notice, TripStatusLabel } from "@/components/ui";
import { NoShowReport } from "@/features/attendance/NoShowReport";
import { PartyChat } from "@/features/party-chat/PartyChat";
import { api, ApiError } from "@/lib/client/api";
import { useCurrentUser, useLoad, useRegions } from "@/lib/client/hooks";
import { money } from "@/lib/money";
import { formatDateTime, formatTime } from "@/lib/time";
import type { AgreementTerms, Location, RoutePricing, TripFit, TripRoute, TripView } from "@/types";

/** Trip detail and signup (README R04, R05, R06): route, your stop, agreement, join, leave/cancel, party and chat. */
export function TripDetailScreen({ tripId }: { tripId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { data: me } = useCurrentUser();
  const view = useLoad(() => api.getTrip(tripId), [tripId]);
  const terms = useLoad(() => api.terms(), []);
  const returnLeg = useLoad(async () => (view.data?.trip.returnTripId ? api.getTrip(view.data.trip.returnTripId).catch(() => null) : null), [view.data?.trip.returnTripId]);
  const [showPosted, setShowPosted] = useState(params.has("created"));
  // Arriving from a destination search: the place the rider searched for is the stop to join with.
  const stopId = params.get("stop");
  const presetStop = useLoad(async () => (stopId ? api.getLocation(stopId).catch(() => null) : null), [stopId]);
  // The searched place could not be reopened (for example another server answered and never saw the search). Never fall
  // back to the trip's own destination in that case: the rider would join to a stop they did not choose.
  const lostStop = !!stopId && !presetStop.loading && !presetStop.data;
  // The route as it would be with the rider's stop in it, reported by the join panel while they pick a stop.
  const [preview, setPreview] = useState<TripRoute | null>(null);

  if (view.loading && !view.data) return <AppShell back={{ href: "/trips", label: "Back to Find" }}><Loading /></AppShell>;
  if (view.error || !view.data) {
    return (
      <AppShell back={{ href: "/trips", label: "Back to Find" }}>
        {view.error?.code === "TRIP_NOT_FOUND" ? <Notice tone="warn">This trip doesn&apos;t exist or is no longer available. <Link href="/trips" className="font-semibold underline">Find another trip</Link></Notice>
          : view.error ? <ErrorState error={view.error} onRetry={view.reload} /> : null}
      </AppShell>
    );
  }

  const v = view.data;
  const { trip, pickup, destination, viewerMembership, roster, route } = v;
  const isBooker = me?.id === trip.bookerId;
  const isMember = viewerMembership === "confirmed";
  const departed = Date.parse(trip.departureTime) <= Date.now();
  const seatsLeft = Math.max(0, trip.maxParticipants - trip.participantCount);
  const setView = (nv: TripView) => view.setData(nv);
  // Before joining, show the route with the rider's own stop in it. It is a preview, so it is only used when the
  // stop differs from the trip's destination; otherwise the trip is shown as posted.
  const previewStop = preview?.your ? preview.stops[preview.your.order - 1]?.location : null;
  const previewing = !isMember && !!preview && !!previewStop && previewStop.id !== destination.id;
  const shown = previewing ? preview : route;
  const stopCount = shown?.stops.length ?? 1;

  return (
    <AppShell
      back={{ href: isMember ? "/my-trips" : "/trips", label: isMember ? "Back to My trips" : "Back to Find" }}
      title={shown?.stops[shown.stops.length - 1]?.location.name ?? destination.name}
      subtitle={`${formatDateTime(trip.departureTime)} · from ${pickup.name}`}
    >
      <div className="grid gap-4">
        {showPosted && isBooker && (
          <div role="status" className="border-l-4 border-gold bg-field p-4">
            <p className="font-bold">Your trip is posted.</p>
            <p className="mt-1 text-sm">
              You&apos;ll be notified when more riders join. Riders heading the same way can add stops, as long as nobody&apos;s ride runs more than {route?.maxDetourMinutes ?? 10} minutes past a direct one.
              {trip.returnTripId && " Your return trip is listed separately."}
            </p>
            <button onClick={() => { setShowPosted(false); router.replace(`/trips/${trip.id}`); }} className="mt-2 min-h-11 text-sm font-semibold underline">Dismiss</button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <TripStatusLabel status={trip.status} />
          <MembershipLabel status={viewerMembership} isBooker={isBooker} />
        </div>

        {isMember && route?.your && trip.status !== "cancelled" && (
          <Notice tone="ok">
            <b className="font-semibold">You get out at {route.stops[route.your.order - 1]?.location.name ?? "your stop"}</b> at{" "}
            {formatTime(new Date(Date.parse(trip.departureTime) + route.your.rideMinutes * 60000).toISOString())}
            {route.stops.length > 1 ? `, stop ${route.your.order} of ${route.stops.length}` : ""}. The trip&apos;s final stop is {route.stops[route.stops.length - 1].location.name}.
          </Notice>
        )}

        <Card className="p-5">
          <div className="mb-5 flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-bold">Route</h2>
            <p className="text-sm text-muted">{stopCount === 1 ? "Direct" : `${stopCount} stops`}{shown ? ` · about ${Math.round(shown.totalMinutes)} min` : ""}</p>
          </div>
          {previewing && previewStop && (
            <p className="-mt-2 mb-5 border-l-4 border-gold bg-[#fff8d6] px-3 py-2 text-[15px] text-ink">
              <b className="font-semibold">Preview with your stop at {previewStop.name}.</b> Join this trip to confirm it.
            </p>
          )}
          {shown ? (
            <RouteTimeline pickupName={pickup.name} departureTime={trip.departureTime} route={shown} youId={me?.id} />
          ) : (
            <p className="text-sm text-muted">Ride times aren&apos;t available for this trip.</p>
          )}
          <p className="mt-5 border-t border-line pt-3 text-xs leading-relaxed text-muted">
            Times are estimates for the {formatTime(trip.departureTime)} departure. Nobody&apos;s ride runs more than {shown?.maxDetourMinutes ?? 10} minutes longer than going straight to their stop.
          </p>
        </Card>

        {shown?.pricing && (
          <FareCard pricing={shown.pricing} meId={me?.id} isMember={isMember}
            bookerName={isBooker ? "You" : roster?.find((r) => r.userId === trip.bookerId)?.displayName ?? "The Booker"} />
        )}

        <Card className="divide-y divide-line">
          <div className="flex justify-between gap-4 px-5 py-3.5 text-[15px]"><span className="text-muted">Riders</span><span className="font-semibold">{trip.participantCount} of {trip.maxParticipants} · {trip.status === "full" ? "full" : `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} open`}</span></div>
          <div className="flex justify-between gap-4 px-5 py-3.5 text-[15px]"><span className="text-muted">Booker</span><span className="text-right font-semibold">{isBooker ? "You" : roster?.find((r) => r.userId === trip.bookerId)?.displayName ?? "Trip creator"}</span></div>
          <p className="px-5 py-3.5 text-sm text-muted">The Booker books and pays for the Uber and adds the riders.</p>
        </Card>

        {returnLeg.data && (
          <Card className="p-5 text-sm">
            <p><b>Return trip</b> · {formatDateTime(returnLeg.data.trip.departureTime)} back to {returnLeg.data.destination.name}. It has its own seats and signup.</p>
            <Link href={`/trips/${returnLeg.data.trip.id}`} className="mt-2 inline-block min-h-11 py-2 font-semibold text-cardinal">
              {returnLeg.data.viewerMembership === "confirmed" ? "Open return trip" : "View and join return"} →
            </Link>
          </Card>
        )}

        {trip.status === "cancelled" && <Notice tone="warn">This trip was cancelled. Chat is closed and it no longer appears in search.</Notice>}

        {!isMember && trip.status !== "cancelled" && (
          stopId && presetStop.loading
            ? <Loading label="Loading your stop…" />
            : <JoinPanel key={presetStop.data?.id ?? "trip-destination"} view={v} terms={terms.data} onJoined={setView} departed={departed} initialStop={presetStop.data} startEmpty={lostStop} onPreview={setPreview} />
        )}

        {isMember && roster ? (
          <Card className="p-5">
            <h2 className="mb-3 text-xl font-bold">Party</h2>
            <ul className="grid gap-3">
              {roster.map((r) => (
                <li key={r.userId} className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-sm border border-field-border bg-white text-sm font-semibold">{r.displayName.split(" ").map((s) => s[0]).join("").slice(0, 2)}</span>
                  <span className="font-medium">{r.displayName}{r.userId === me?.id && <span className="font-normal text-muted"> (you)</span>}</span>
                  {r.userId === trip.bookerId && <span className="ml-auto rounded-[2px] bg-cardinal px-2 py-px text-[13px] font-semibold text-white">Booker</span>}
                </li>
              ))}
            </ul>
            {roster.length === 1 && isBooker && <p className="mt-4 text-sm text-muted">Waiting for riders. You&apos;ll be notified when someone joins.</p>}
          </Card>
        ) : null}

        {isMember && roster && me && trip.status !== "cancelled" && (
          <PartyChat tripId={trip.id} actorId={me.id} roster={roster} bookerId={trip.bookerId} onRosterStale={view.reload} />
        )}

        {isMember && isBooker && departed && roster && me && <NoShowReport tripId={trip.id} roster={roster} actorId={me.id} />}

        {isMember && !departed && trip.status !== "cancelled" && terms.data && (
          isBooker ? <CancelPanel view={v} onCancelled={setView} /> : <LeavePanel view={v} terms={terms.data} onLeft={setView} />
        )}
      </div>
    </AppShell>
  );
}

/** Estimated fare split. Members see everyone's share; others see only how it works. */
function FareCard({ pricing, meId, bookerName, isMember }: { pricing: RoutePricing; meId?: string; bookerName: string; isMember: boolean }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold">Fare</h2>
        <p className="text-sm text-muted">about {money(pricing.estimatedTotal)} total</p>
      </div>
      {isMember && pricing.shares ? (
        <ul className="divide-y divide-line">
          {pricing.shares.map((s) => (
            <li key={s.userId} className="flex justify-between gap-4 py-2.5 text-[15px]">
              <span>{s.userId === meId ? "You" : s.displayName}</span>
              <span className="font-semibold tabular-nums">{money(s.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Everyone aboard a stretch of the route splits its cost, so riders who get out earlier pay less.</p>
      )}
      <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">
        {isMember ? `${bookerName} pays Uber upfront and riders pay back their share. ` : ""}
        Estimated at {money(pricing.pricePerMile)} per mile plus a fee per extra stop. The final split uses Uber&apos;s actual total. No money moves in this demo.
      </p>
    </Card>
  );
}

function JoinPanel({ view, terms, onJoined, departed, initialStop, startEmpty = false, onPreview }: {
  view: TripView; terms: AgreementTerms | null; onJoined: (v: TripView) => void; departed: boolean;
  /** The place the rider searched for. Without one, the panel starts with the trip's own destination. */
  initialStop?: Location | null;
  /** The rider arrived with a searched place that could not be loaded: start with no stop chosen instead of the trip's destination. */
  startEmpty?: boolean;
  /** Told the route with the rider's stop in it whenever the chosen stop fits, or null when it does not. */
  onPreview: (route: TripRoute | null) => void;
}) {
  const { trip, pickup, destination } = view;
  const regions = useRegions();
  const pickups = useLoad(() => api.pickups(), []);
  const [stop, setStop] = useState<Location | null>(initialStop ?? (startEmpty ? null : destination));
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // A return leg heads back to campus, so the choices are campus drop-offs rather than a place search.
  const isReturn = !!pickups.data?.some((p) => p.id === destination.id);
  const returnChoices = pickups.data?.filter((p) => p.id !== pickup.id) ?? [];
  const checkable = !!stop && (isReturn || !!stop.regionId);

  const fit = useLoad<TripFit | null>(async () => (stop && checkable ? api.tripFit(trip.id, stop.id) : null), [trip.id, stop?.id, checkable]);
  const similar = `/create?destination=${stop?.id ?? destination.id}&name=${encodeURIComponent(stop?.name ?? destination.name)}&pickup=${pickup.id}`;
  const yours = fit.data?.route?.your;

  // Let the Route card at the top of the page show this stop, and clear it when the panel goes away.
  useEffect(() => {
    onPreview(fit.data?.fits ? fit.data.route : null);
    return () => onPreview(null);
  }, [fit.data, onPreview]);

  if (departed || trip.status === "completed" || trip.status === "in_progress") return <Notice>This trip has departed.</Notice>;
  if (trip.status === "full") {
    return (
      <Card className="grid gap-3 p-5">
        <h2 className="text-xl font-bold">This trip is full</h2>
        <p className="text-sm text-muted">Start your own trip to the same place and others can join you.</p>
        <ButtonLink href={similar}>Create a similar trip</ButtonLink>
      </Card>
    );
  }

  async function join() {
    if (!terms || !stop) return;
    setPending(true);
    setError(null);
    try {
      onJoined(await api.joinTrip(trip.id, terms.version, stop.id));
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("INTERNAL_ERROR", "Could not join.", 500));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="grid gap-4 p-5">
      <div>
        <h2 className="text-xl font-bold">Join this trip</h2>
        <p className="mt-1 text-sm text-muted">Meet at {pickup.name} at {formatTime(trip.departureTime)}.</p>
      </div>

      {startEmpty && !stop && (
        <Notice tone="warn">We couldn&apos;t reopen the place you searched for. Search for your stop below, and the route above will update.</Notice>
      )}

      <Field label="Where are you getting out?" htmlFor="stop" hint={isReturn ? undefined : startEmpty ? "Search for the place where you want to get out." : "Defaults to this trip's destination. Pick another place on the way if you like."}>
        {isReturn ? (
          <select id="stop" className={inputClass} value={stop?.id ?? ""} onChange={(e) => setStop(pickups.data?.find((p) => p.id === e.target.value) ?? null)}>
            {[destination, ...returnChoices.filter((p) => p.id !== destination.id)].map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <LocationSearch id="stop" value={stop} onChange={setStop} regionNames={regions} placeholder="Search a place in LA" />
        )}
      </Field>

      {stop && !checkable && <Notice tone="warn">{stop.name} isn&apos;t inside a ride region, so this trip can&apos;t take you there.</Notice>}
      {checkable && fit.loading && !fit.data && <p className="text-sm text-muted" role="status">Checking the route…</p>}
      {checkable && fit.error && <Notice tone="error">{fit.error.message}</Notice>}
      {fit.data && !fit.data.fits && (
        <Notice tone="error">
          {fit.data.message ?? "That stop doesn't fit this trip."}{" "}
          <Link href={similar} className="font-semibold underline">Start a trip to {stop?.name}</Link>
        </Notice>
      )}
      {fit.data?.fits && fit.data.route && yours && (
        <div className="grid gap-3">
          <Notice tone="ok">
            <b>This fits.</b> You&apos;d ride about {Math.round(yours.rideMinutes)} min, {detourLabel(yours.detourMinutes)}.
            {fit.data.route.pricing?.yourShare != null && (
              <span className="mt-1 block">
                Your share: about <b>{money(fit.data.route.pricing.yourShare)}</b>
                {(fit.data.route.pricing.yourSavings ?? 0) > 0.005 && ` (riding alone: ${money(fit.data.route.pricing.yourSoloPrice!)}, you save ${money(fit.data.route.pricing.yourSavings!)})`}.
              </span>
            )}
            <span className="mt-1 block text-[13px] text-muted">Your stop is shown in the route above.</span>
          </Notice>
        </div>
      )}

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-cardinal" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        <span><b>Billing agreement.</b> {terms?.text ?? "Loading terms…"} {terms && <span className="block text-xs text-muted">Version {terms.version}</span>}</span>
      </label>
      {error && (
        <Notice tone="error">
          {error.message}{" "}
          {error.code === "ROUTE_DETOUR_EXCEEDED" && <Link href={similar} className="font-semibold underline">Start a trip to {stop?.name}</Link>}
          {error.code === "TRIP_FULL" && <Link href={similar} className="font-semibold underline">Create a similar trip</Link>}
          {error.code === "ACTIVE_TRIP_EXISTS" && <Link href="/my-trips" className="font-semibold underline">Go to My trips</Link>}
        </Notice>
      )}
      <Button onClick={join} disabled={!accepted || pending || !terms || !fit.data?.fits}>{pending ? "Joining…" : "Join trip"}</Button>
    </Card>
  );
}

function LeavePanel({ view, terms, onLeft }: { view: TripView; terms: AgreementTerms; onLeft: (v: TripView) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const cutoff = Date.parse(view.trip.departureTime) - terms.leaveCutoffMinutes * 60000;
  const locked = Date.now() >= cutoff;

  async function leave() {
    setPending(true);
    setError("");
    try {
      onLeft(await api.leaveTrip(view.trip.id));
      setOpen(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not leave.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button variant="danger" onClick={() => setOpen(true)} disabled={locked}>{locked ? "Leaving is closed" : "Leave trip"}</Button>
      <p className="text-xs text-muted">
        {locked
          ? `You can't leave within ${terms.leaveCutoffMinutes} minutes of departure. Message your party if plans change; a no-show can be reported.`
          : `You can leave until ${formatTime(new Date(cutoff).toISOString())}. A cancellation fee may apply under the agreement.`}
      </p>
      <Dialog open={open} onClose={() => setOpen(false)} title="Leave this trip?">
        <p className="text-sm text-muted">Your seat reopens for other riders and the route is re-planned without your stop. A cancellation fee may apply under the billing agreement.</p>
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-5 grid gap-2">
          <Button onClick={leave} disabled={pending}>{pending ? "Leaving…" : "Leave trip"}</Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>Stay</Button>
        </div>
      </Dialog>
    </div>
  );
}

function CancelPanel({ view, onCancelled }: { view: TripView; onCancelled: (v: TripView) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function cancel() {
    setPending(true);
    setError("");
    try {
      onCancelled(await api.cancelTrip(view.trip.id));
      setOpen(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not cancel.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button variant="danger" onClick={() => setOpen(true)}>Cancel trip</Button>
      <p className="text-xs text-muted">As the Booker you cancel the trip instead of leaving it. {view.trip.returnTripId && "The return trip is cancelled separately."}</p>
      <Dialog open={open} onClose={() => setOpen(false)} title="Cancel this trip?">
        <p className="text-sm text-muted">It will be removed from search, nobody can join, and party chat closes for everyone.</p>
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-5 grid gap-2">
          <Button onClick={cancel} disabled={pending}>{pending ? "Cancelling…" : "Cancel trip"}</Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>Keep trip</Button>
        </div>
      </Dialog>
    </div>
  );
}
