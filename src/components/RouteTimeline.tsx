import { formatTime } from "@/lib/time";
import type { TripRoute } from "@/types";

const mins = (n: number) => `${Math.max(1, Math.round(n))} min`;

/** What a rider's extra time reads like: "no extra time" or "+4 min vs going direct". */
export function detourLabel(detourMinutes: number): string {
  return detourMinutes < 1 ? "no extra time" : `+${Math.round(detourMinutes)} min vs going direct`;
}

/**
 * The car-train route as a vertical list, pickup at the top and the final stop at the bottom.
 * Times are estimates for the departure time. Riders' names appear only for members.
 */
export function RouteTimeline({ pickupName, departureTime, route, youId }: {
  pickupName: string; departureTime: string; route: TripRoute; youId?: string;
}) {
  const clock = (rideMinutes: number) => formatTime(new Date(Date.parse(departureTime) + rideMinutes * 60000).toISOString());
  const rows = [
    { key: "pickup", kind: "pickup" as const, name: pickupName, sub: "Pickup", time: formatTime(departureTime), riders: null, yours: false },
    ...route.stops.map((s) => ({
      key: s.location.id + s.order, kind: s.isFinal ? ("final" as const) : ("stop" as const), name: s.location.name,
      sub: `${s.isFinal ? "Final stop" : `Stop ${s.order}`} · about ${mins(s.rideMinutes)}`, time: clock(s.rideMinutes), riders: s.riders,
      yours: route.your?.order === s.order,
    })),
  ];

  return (
    <ol aria-label="Route">
      {rows.map((r, i) => (
        <li key={r.key} className={`relative flex gap-4 ${i < rows.length - 1 ? "pb-6" : ""}`}>
          {i < rows.length - 1 && <span aria-hidden className="absolute left-[8px] top-5 h-full w-0.5 bg-[#cfcfcf]" />}
          <span aria-hidden className="relative z-10 mt-1 grid h-[18px] w-[18px] shrink-0 place-items-center">
            {r.kind === "pickup" && <span className="h-3.5 w-3.5 rounded-full border-[3px] border-ink bg-white" />}
            {r.kind === "stop" && <span className={`h-3.5 w-3.5 rounded-full bg-ink ${r.yours ? "ring-[3px] ring-gold" : ""}`} />}
            {r.kind === "final" && <span className={`h-3.5 w-3.5 rounded-[3px] bg-cardinal ${r.yours ? "ring-[3px] ring-gold" : ""}`} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-4">
              <p className="min-w-0 text-[17px] font-semibold leading-snug">{r.name}</p>
              <p className="shrink-0 text-[15px] font-semibold tabular-nums">{r.time}</p>
            </div>
            <p className="text-sm text-muted">{r.sub}</p>
            {r.riders && r.riders.length > 0 && (
              <p className="mt-0.5 text-sm">
                {r.riders.map((p, j) => (
                  <span key={p.userId}>{j > 0 && ", "}<span className={p.userId === youId ? "font-semibold" : ""}>{p.userId === youId ? "You" : p.displayName}</span></span>
                ))}
              </p>
            )}
            {r.yours && route.your && (
              <p className="mt-1 inline-block rounded-[2px] bg-gold px-2 py-px text-[13px] font-semibold text-ink">
                Your stop · {mins(route.your.rideMinutes)} ride, {detourLabel(route.your.detourMinutes)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
