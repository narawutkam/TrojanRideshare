"use client";

import Link from "next/link";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ApiError } from "@/lib/client/api";
import type { ParticipantStatus, TripStatus } from "@/types";

/** Shared controls, in the style of the USC sign-in card: flat, near-square, regular-weight text (README §2). */

type Variant = "primary" | "secondary" | "danger" | "gold";
const variants: Record<Variant, string> = {
  primary: "border border-cardinal bg-cardinal text-white hover:bg-cardinal-dark active:bg-cardinal-dark",
  secondary: "border border-field-border bg-white text-ink hover:bg-field active:bg-field",
  danger: "border border-cardinal bg-white text-cardinal hover:bg-[#fbeeee] active:bg-[#fbeeee]",
  gold: "border border-gold bg-gold text-ink hover:brightness-95",
};
const base = "inline-flex min-h-12 items-center justify-center gap-2 rounded-sm px-5 text-[17px] font-medium transition-colors";

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...props} className={`${base} disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${className}`} />;
}

export function ButtonLink({ href, variant = "primary", children, className = "" }: { href: string; variant?: Variant; children: ReactNode; className?: string }) {
  return <Link href={href} className={`${base} ${variants[variant]} ${className}`}>{children}</Link>;
}

/** A panel with the cardinal rule across its top, like the sign-in card. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-sm border border-line border-t-[5px] border-t-cardinal bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.12)] ${className}`}>{children}</div>;
}

const tripStatusText: Record<TripStatus, string> = { open: "Open", full: "Full", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };
const tripStatusStyle: Record<TripStatus, string> = {
  open: "border-ok text-ok",
  full: "border-warn text-warn",
  in_progress: "border-ink text-ink",
  completed: "border-line text-muted",
  cancelled: "border-cardinal text-cardinal",
};

/** Flat outlined tag: a status reads as text with a thin rule, not a filled badge. */
export function TripStatusLabel({ status }: { status: TripStatus }) {
  return <span className={`inline-block rounded-[2px] border bg-white px-2 py-px text-[13px] font-semibold ${tripStatusStyle[status]}`}>{tripStatusText[status]}</span>;
}

export function MembershipLabel({ status, isBooker }: { status: ParticipantStatus | null; isBooker?: boolean }) {
  if (status !== "confirmed") return null;
  return <span className="inline-block rounded-[2px] border border-gold bg-gold px-2 py-px text-[13px] font-semibold text-ink">{isBooker ? "You're the Booker" : "You're in"}</span>;
}

/** A note with a bar down its left side, like the info banner on the sign-in page. */
export function Notice({ tone = "info", children, role }: { tone?: "info" | "ok" | "warn" | "error"; children: ReactNode; role?: "status" | "alert" }) {
  const styles = {
    info: "border-info bg-[#f3f6fb]",
    ok: "border-ok bg-[#eef6f0]",
    warn: "border-warn bg-[#fbf3e8]",
    error: "border-cardinal bg-[#fbeeee]",
  };
  return <div role={role ?? (tone === "error" ? "alert" : "status")} className={`border-l-4 px-4 py-3 text-[15px] leading-snug text-ink ${styles[tone]}`}>{children}</div>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="py-10 text-center text-[15px] text-muted" role="status">{label}</p>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-sm border border-line bg-field px-5 py-10 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <Notice tone="error">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{error.message}</span>
        {onRetry && <Button variant="secondary" onClick={onRetry}>Retry</Button>}
      </div>
    </Notice>
  );
}

/** Accessible modal dialog using the native <dialog> element. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[min(92vw,26rem)] rounded-sm border-0 border-t-[5px] border-t-cardinal bg-surface p-0 text-ink backdrop:bg-black/50">
      <div className="p-6">
        <h2 className="mb-2 text-xl font-bold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

/** Label above a field, in regular weight like the sign-in form. */
export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-lg">{label}</label>
      {children}
      {hint && !error && <p className="text-sm text-muted">{hint}</p>}
      {error && <p className="text-sm font-semibold text-cardinal" role="alert">{error}</p>}
    </div>
  );
}

/** White field with a thin dark border, as on the sign-in card. */
export const inputClass = "w-full min-h-12 rounded-[2px] border border-field-border bg-white px-3.5 py-2 text-[17px] text-ink placeholder:text-muted focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/25";
