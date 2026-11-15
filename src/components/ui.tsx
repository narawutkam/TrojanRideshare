"use client";

import Link from "next/link";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ApiError } from "@/lib/client/api";
import type { ParticipantStatus, TripStatus } from "@/types";

/** Shared controls: rectangular, minimally rounded, text paired with color (README §2). */

type Variant = "primary" | "secondary" | "danger" | "gold";
const variants: Record<Variant, string> = {
  primary: "bg-cardinal text-white hover:bg-cardinal-dark border border-cardinal",
  secondary: "bg-surface text-ink border border-line hover:bg-canvas",
  danger: "bg-surface text-cardinal border border-cardinal/50 hover:bg-cardinal/5",
  gold: "bg-gold text-[#3a0000] border border-gold hover:brightness-95",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

export function ButtonLink({ href, variant = "primary", children, className = "" }: { href: string; variant?: Variant; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm font-semibold transition ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-sm border border-line bg-surface ${className}`}>{children}</div>;
}

const tripStatusText: Record<TripStatus, string> = { open: "Open", full: "Full", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };
const tripStatusStyle: Record<TripStatus, string> = {
  open: "border-ok/40 text-ok",
  full: "border-warn/40 text-warn",
  in_progress: "border-line text-ink",
  completed: "border-line text-muted",
  cancelled: "border-cardinal/40 text-cardinal",
};

export function TripStatusLabel({ status }: { status: TripStatus }) {
  return <span className={`inline-block rounded-sm border px-2 py-0.5 text-xs font-semibold ${tripStatusStyle[status]}`}>{tripStatusText[status]}</span>;
}

export function MembershipLabel({ status, isBooker }: { status: ParticipantStatus | null; isBooker?: boolean }) {
  if (status !== "confirmed") return null;
  return (
    <span className="inline-block rounded-sm border border-gold bg-gold/20 px-2 py-0.5 text-xs font-semibold text-ink">
      {isBooker ? "You're the Booker" : "You're in"}
    </span>
  );
}

export function Notice({ tone = "info", children, role }: { tone?: "info" | "ok" | "warn" | "error"; children: ReactNode; role?: "status" | "alert" }) {
  const styles = {
    info: "border-line bg-surface text-ink",
    ok: "border-ok/40 bg-ok/10 text-ok",
    warn: "border-warn/40 bg-warn/10 text-warn",
    error: "border-cardinal/40 bg-cardinal/10 text-cardinal",
  };
  return <div role={role ?? (tone === "error" ? "alert" : "status")} className={`rounded-sm border px-3 py-2 text-sm ${styles[tone]}`}>{children}</div>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="py-8 text-center text-sm text-muted" role="status">{label}</p>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-sm border border-dashed border-line px-4 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-3 flex flex-wrap justify-center gap-2 text-sm text-muted">{children}</div>}
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
    <dialog ref={ref} onClose={onClose} className="m-auto w-[min(92vw,28rem)] rounded-sm border border-line bg-surface p-0 text-ink backdrop:bg-black/50">
      <div className="p-5">
        <h2 className="mb-3 text-lg font-bold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs font-semibold text-cardinal" role="alert">{error}</p>}
    </div>
  );
}

export const inputClass = "w-full min-h-11 rounded-sm border border-line bg-canvas px-3 py-2 text-base text-ink";
