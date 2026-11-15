"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button, ButtonLink, Card, Dialog, ErrorState, Loading, MembershipLabel, Notice, TripStatusLabel } from "@/components/ui";
import { NoShowReport } from "@/features/attendance/NoShowReport";
import { PartyChat } from "@/features/party-chat/PartyChat";
import { api, ApiError } from "@/lib/client/api";
import { useCurrentUser, useLoad, useRegions } from "@/lib/client/hooks";
import { formatDateTime, formatTime } from "@/lib/time";
import type { AgreementTerms, TripView } from "@/types";

/** Trip Detail and Signup (README R04, R05, R06): agreement, join, leave/cancel, roster and chat. */
export function TripDetailScreen({ tripId }: { tripId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const regions = useRegions();
  const { data: me } = useCurrentUser();
  const view = useLoad(() => api.getTrip(tripId), [tripId]);
  const terms = useLoad(() => api.terms(), []);
  const returnLeg = useLoad(async () => (view.data?.trip.returnTripId ? api.getTrip(view.data.trip.returnTripId).catch(() => null) : null), [view.data?.trip.returnTripId]);
  const [showPosted, setShowPosted] = useState(params.has("created"));

  if (view.loading && !view.data) return <AppShell title="Trip" back={{ href: "/trips", label: "Back to Find" }}><Loading /></AppShell>;
  if (view.error || !view.data) {
    return (
      <AppShell title="Trip" back={{ href: "/trips", label: "Back to Find" }}>
        {view.error?.code === "TRIP_NOT_FOUND" ? <Notice tone="warn">This trip doesn&apos;t exist or is no longer available. <Link href="/trips" className="font-semibold underline">Find another trip</Link></Notice>
          : view.error ? <ErrorState error={view.error} onRetry={view.reload} /> : null}
      </AppShell>
    );
  }

  const v = view.data;
  const { trip, pickup, destination, viewerMembership, roster } = v;
  const isBooker = me?.id === trip.bookerId;
  const isMember = viewerMembership === "confirmed";
  const departed = Date.parse(trip.departureTime) <= Date.now();
  const regionName = destination.regionId ? regions.get(destination.regionId) : undefined;
  const seatsLeft = Math.max(0, trip.maxParticipants - trip.participantCount);
  const setView = (nv: TripView) => view.setData(nv);

  return (
    <AppShell
      back={{ href: isMember ? "/my-trips" : "/trips", label: isMember ? "Back to My trips" : "Back to Find" }}
      title={destination.name}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span>{formatDateTime(trip.departureTime)}</span>
          <span>From {pickup.name}</span>
          {regionName && <span>{regionName}</span>}
        </span>
      }
    >
      <div className="grid gap-4">
        <div className="contents">
          {showPosted && isBooker && (
            <div role="status" className="flex items-start gap-3 rounded-sm border-2 border-gold bg-surface p-4">
              <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-gold text-lg">🔔</span>
              <div className="flex-1">
                <p className="font-bold">Your trip is posted!</p>
                <p className="text-sm text-muted">
                  You&apos;ll get notified when more riders join. It&apos;s listed for other Trojans heading to {regionName ?? destination.name}, with {seatsLeft} open seat{seatsLeft === 1 ? "" : "s"}.
                  {trip.returnTripId && " Your return trip is listed separately."}
                </p>
              </div>
              <Button variant="secondary" onClick={() => { setShowPosted(false); router.replace(`/trips/${trip.id}`); }}>Got it</Button>
            </div>
          )}

          <Card className="grid gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <TripStatusLabel status={trip.status} />
              <MembershipLabel status={viewerMembership} isBooker={isBooker} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Route</dt><dd>{pickup.name} → {destination.name}</dd>
              <dt className="text-muted">Address</dt><dd>{destination.address}</dd>
              <dt className="text-muted">Departure</dt><dd>{formatDateTime(trip.departureTime)} (Los Angeles)</dd>
              <dt className="text-muted">Riders</dt><dd>{trip.participantCount} of {trip.maxParticipants} · {trip.status === "full" ? "full" : `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left`}</dd>
              <dt className="text-muted">Booker</dt><dd>{isBooker ? "You" : roster?.find((r) => r.userId === trip.bookerId)?.displayName ?? "Trip creator"} · books and pays for the Uber</dd>
            </dl>
            {returnLeg.data && (
              <p className="border-t border-line pt-3 text-sm">
                <b>Return trip:</b> {formatDateTime(returnLeg.data.trip.departureTime)} back to {returnLeg.data.destination.name}. It has its own seats and signup.{" "}
                <Link href={`/trips/${returnLeg.data.trip.id}`} className="font-semibold text-link hover:underline">
                  {returnLeg.data.viewerMembership === "confirmed" ? "Open return trip" : "View and join return"} →
                </Link>
              </p>
            )}
          </Card>

          {trip.status === "cancelled" && <Notice tone="warn">This trip was cancelled. Chat is closed and it no longer appears in search.</Notice>}

          {!isMember && trip.status !== "cancelled" && (
            <JoinPanel view={v} terms={terms.data} onJoined={setView} departed={departed} />
          )}
        </div>

        <div className="contents">
          {isMember && roster ? (
            <Card className="p-4">
              <h2 className="mb-2 font-bold">Party</h2>
              <ul className="grid gap-2 text-sm">
                {roster.map((r) => (
                  <li key={r.userId} className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-sm bg-gold text-xs font-bold text-[#3a0000]">{r.displayName.split(" ").map((s) => s[0]).join("").slice(0, 2)}</span>
                    <span>{r.displayName}</span>
                    {r.userId === trip.bookerId && <span className="text-xs font-semibold text-cardinal">Booker</span>}
                    {r.userId === me?.id && <span className="text-xs text-muted">(you)</span>}
                  </li>
                ))}
              </ul>
              {roster.length === 1 && isBooker && <p className="mt-3 text-xs text-muted">🔔 Waiting for riders. You&apos;ll get notified when someone joins.</p>}
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
      </div>
    </AppShell>
  );
}

function JoinPanel({ view, terms, onJoined, departed }: { view: TripView; terms: AgreementTerms | null; onJoined: (v: TripView) => void; departed: boolean }) {
  const { trip, pickup, destination } = view;
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const similar = `/create?destination=${destination.id}&name=${encodeURIComponent(destination.name)}&pickup=${pickup.id}`;

  if (departed || trip.status === "completed" || trip.status === "in_progress") return <Notice>This trip has departed.</Notice>;
  if (trip.status === "full") {
    return (
      <Card className="grid gap-3 p-4">
        <h2 className="font-bold">This trip is full</h2>
        <p className="text-sm text-muted">Start your own trip to the same place and others can join you.</p>
        <ButtonLink href={similar}>Create a similar trip</ButtonLink>
      </Card>
    );
  }

  async function join() {
    if (!terms) return;
    setPending(true);
    setError(null);
    try {
      onJoined(await api.joinTrip(trip.id, terms.version));
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("INTERNAL_ERROR", "Could not join.", 500));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="grid gap-3 p-4">
      <h2 className="font-bold">Join this trip</h2>
      <p className="text-sm text-muted">You&apos;ll meet at {pickup.name} at {formatTime(trip.departureTime)}. The Booker books the Uber and adds you to the fare split.</p>
      <label className="flex items-start gap-2 rounded-sm border border-line p-3 text-sm">
        <input type="checkbox" className="mt-1 accent-cardinal" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        <span><b>Billing agreement.</b> {terms?.text ?? "Loading terms…"} {terms && <span className="block text-xs text-muted">Version {terms.version}</span>}</span>
      </label>
      {error && (
        <Notice tone="error">
          {error.message}{" "}
          {error.code === "TRIP_FULL" && <Link href={similar} className="font-semibold underline">Create a similar trip</Link>}
          {error.code === "ACTIVE_TRIP_EXISTS" && <Link href="/my-trips" className="font-semibold underline">Go to My trips</Link>}
        </Notice>
      )}
      <Button onClick={join} disabled={!accepted || pending || !terms}>{pending ? "Joining…" : "Join trip"}</Button>
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
    <Card className="grid gap-2 p-4">
      <Button variant="danger" onClick={() => setOpen(true)} disabled={locked}>{locked ? "Leaving is closed" : "Leave trip"}</Button>
      <p className="text-xs text-muted">
        {locked
          ? `You can't leave within ${terms.leaveCutoffMinutes} minutes of departure. Message your party if plans change; a no-show can be reported.`
          : `You can leave until ${formatTime(new Date(cutoff).toISOString())}. A cancellation fee may apply under the agreement.`}
      </p>
      <Dialog open={open} onClose={() => setOpen(false)} title="Leave this trip?">
        <p className="text-sm text-muted">Your seat reopens for other riders. A cancellation fee may apply under the billing agreement.</p>
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Stay</Button>
          <Button onClick={leave} disabled={pending}>{pending ? "Leaving…" : "Leave trip"}</Button>
        </div>
      </Dialog>
    </Card>
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
    <Card className="grid gap-2 p-4">
      <Button variant="danger" onClick={() => setOpen(true)}>Cancel trip</Button>
      <p className="text-xs text-muted">As the Booker you cancel the trip instead of leaving it. {view.trip.returnTripId && "The return trip is cancelled separately."}</p>
      <Dialog open={open} onClose={() => setOpen(false)} title="Cancel this trip?">
        <p className="text-sm text-muted">It will be removed from search, nobody can join, and party chat closes for everyone.</p>
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Keep trip</Button>
          <Button onClick={cancel} disabled={pending}>{pending ? "Cancelling…" : "Cancel trip"}</Button>
        </div>
      </Dialog>
    </Card>
  );
}
