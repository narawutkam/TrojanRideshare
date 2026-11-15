"use client";

import Link from "next/link";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ApiError } from "@/lib/client/api";
import type { ParticipantStatus, TripStatus } from "@/types";

/** Shared pieces of the SC ride design (README §2): cardinal actions, gold selection and information, thin-bordered white cards. */

// ---------- buttons ----------

type Variant = "primary" | "secondary" | "danger" | "gold";
const variants: Record<Variant, string> = {
  primary: "border border-cardinal bg-cardinal text-white hover:bg-cardinal-dark active:bg-cardinal-dark",
  secondary: "border border-field-border bg-white text-ink hover:bg-field active:bg-field",
  danger: "border border-cardinal bg-white text-cardinal hover:bg-[#fbeeee] active:bg-[#fbeeee]",
  gold: "border border-gold bg-gold text-ink hover:brightness-95",
};
const base = "inline-flex min-h-[52px] items-center justify-center gap-2 rounded-lg px-5 text-base font-semibold transition-colors";

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...props} className={`${base} disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${className}`} />;
}

export function ButtonLink({ href, variant = "primary", children, className = "" }: { href: string; variant?: Variant; children: ReactNode; className?: string }) {
  return <Link href={href} className={`${base} ${variants[variant]} ${className}`}>{children}</Link>;
}

// ---------- headings ----------

/** The small red uppercase label above a headline. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-cardinal">{children}</p>;
}

/** Eyebrow, big headline (use <br /> for the two-line break), and a grey line under it. */
export function Heading({ eyebrow, title, subtitle }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-6">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1 className={`${eyebrow ? "mt-3" : ""} text-[28px] font-bold leading-[1.15]`}>{title}</h1>
      {subtitle && <div className="mt-3 text-[15px] leading-snug text-muted">{subtitle}</div>}
    </div>
  );
}

// ---------- surfaces ----------

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface ${className}`}>{children}</div>;
}

/** The gold information box: a bold title and a line or two under it. */
export function Callout({ title, children, className = "", right }: { title?: ReactNode; children?: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <div className={`rounded-xl bg-gold px-4 py-4 text-ink ${className}`}>
      {(title || right) && (
        <div className="flex items-baseline justify-between gap-3">
          {title && <p className="text-[15px] font-bold leading-snug">{title}</p>}
          {right}
        </div>
      )}
      {children && <div className={`${title ? "mt-1" : ""} text-[13px] leading-snug`}>{children}</div>}
    </div>
  );
}

/** A tappable card. Selected is gold with a cardinal border; otherwise white with a thin border. */
export function SelectCard({ selected, onSelect, disabled, children, className = "" }: {
  selected: boolean; onSelect?: () => void; disabled?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`block w-full min-w-0 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        selected ? "border-cardinal bg-gold" : "border-line bg-white hover:bg-field"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** A small outlined filter chip. */
export function Chip({ children, onClick, selected = false }: { children: ReactNode; onClick?: () => void; selected?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 rounded-lg border px-3.5 text-sm font-medium ${selected ? "border-cardinal bg-gold" : "border-field-border bg-white"}`}
    >
      {children}
    </button>
  );
}

// ---------- icons ----------

export function PinIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" />
    </svg>
  );
}

export function CheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function ShieldIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="M8.8 12l2.2 2.2L15.4 9.8" />
    </svg>
  );
}

/** The radio circle on a SelectCard: filled cardinal with a check when selected. */
export function RadioMark({ selected }: { selected: boolean }) {
  return selected ? (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cardinal text-white"><CheckIcon className="h-3.5 w-3.5" /></span>
  ) : (
    <span className="h-6 w-6 shrink-0 rounded-full border-2 border-field-border bg-white" />
  );
}

// ---------- status ----------

const tripStatusText: Record<TripStatus, string> = { open: "Open", full: "Full", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };
const tripStatusStyle: Record<TripStatus, string> = {
  open: "bg-[#e6f3ea] text-ok",
  full: "bg-[#fdeedd] text-warn",
  in_progress: "bg-field text-ink",
  completed: "bg-field text-muted",
  cancelled: "bg-[#f8e3e3] text-cardinal",
};

export function TripStatusLabel({ status }: { status: TripStatus }) {
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${tripStatusStyle[status]}`}>{tripStatusText[status]}</span>;
}

export function MembershipLabel({ status, isBooker }: { status: ParticipantStatus | null; isBooker?: boolean }) {
  if (status !== "confirmed") return null;
  return <span className="inline-block rounded-md bg-gold px-2 py-0.5 text-xs font-semibold text-ink">{isBooker ? "You're the Booker" : "You're in"}</span>;
}

/** A note. Information is grey, success green, a warning gold, an error red. */
export function Notice({ tone = "info", children, role }: { tone?: "info" | "ok" | "warn" | "error"; children: ReactNode; role?: "status" | "alert" }) {
  const styles = {
    info: "bg-field",
    ok: "bg-[#e6f3ea] text-[#0a5a2b]",
    warn: "bg-gold-soft",
    error: "bg-[#fbe9e9] text-[#7a0000]",
  };
  return <div role={role ?? (tone === "error" ? "alert" : "status")} className={`rounded-xl px-4 py-3 text-sm leading-snug ${styles[tone]}`}>{children}</div>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="py-10 text-center text-sm text-muted" role="status">{label}</p>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-field px-5 py-10 text-center">
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
    <dialog ref={ref} onClose={onClose} className="m-auto w-[min(92vw,26rem)] rounded-2xl border-0 bg-surface p-0 text-ink backdrop:bg-black/50">
      <div className="p-6">
        <h2 className="mb-2 text-xl font-bold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

/** Label above a field. */
export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={htmlFor} className="text-[13px] font-bold">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs font-semibold text-cardinal" role="alert">{error}</p>}
    </div>
  );
}

/** White field with a thin grey border; the border turns cardinal when focused. */
export const inputClass = "w-full min-h-[52px] rounded-xl border border-field-border bg-white px-4 py-2 text-base text-ink placeholder:text-muted focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20";
