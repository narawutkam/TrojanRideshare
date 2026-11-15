"use client";

import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import type { ParticipantSummary } from "@/types";

/**
 * Pending no-show report (README R09, §8). The Booker can flag a rider after
 * departure. Reports stay pending: no strike or ban is issued while the
 * honor-system policy is open.
 */
export function NoShowReport({ tripId, roster, actorId }: { tripId: string; roster: ParticipantSummary[]; actorId: string }) {
  const [state, setState] = useState<Record<string, string>>({});
  const riders = roster.filter((r) => r.userId !== actorId);
  if (!riders.length) return null;

  async function report(subjectId: string) {
    setState((s) => ({ ...s, [subjectId]: "Sending…" }));
    try {
      await api.reportNoShow(tripId, subjectId);
      setState((s) => ({ ...s, [subjectId]: "Reported · pending review" }));
    } catch (e) {
      setState((s) => ({ ...s, [subjectId]: e instanceof ApiError ? (e.code === "ALREADY_REPORTED" ? "Already reported · pending review" : e.message) : "Report failed" }));
    }
  }

  return (
    <section className="grid gap-3 rounded-xl border border-line bg-surface p-4" aria-label="Attendance">
      <h2 className="font-bold">Attendance</h2>
      <Notice>Report a rider who didn&apos;t show up. Reports stay <b>pending</b>; strikes aren&apos;t issued until the honor-system policy is approved.</Notice>
      <ul className="grid gap-2">
        {riders.map((r) => (
          <li key={r.userId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{r.displayName}</span>
            {state[r.userId] ? <span className="text-xs text-muted" role="status">{state[r.userId]}</span>
              : <Button variant="danger" onClick={() => report(r.userId)}>Report no-show</Button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
