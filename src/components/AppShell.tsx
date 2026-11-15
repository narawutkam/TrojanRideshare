"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BookerReminderBar } from "@/components/BookerReminder";
import { Heading } from "@/components/ui";
import { api } from "@/lib/client/api";
import { useCurrentUser } from "@/lib/client/hooks";
import type { HealthInfo, TripView } from "@/types";

/** One health lookup per browser tab session, shared by every page. */
let healthOnce: Promise<HealthInfo | null> | null = null;

const TABS = [
  { href: "/trips", label: "Find", icon: <path d="M10.5 18a7.5 7.5 0 1 1 5.3-2.2L21 21" /> },
  { href: "/create", label: "Create", icon: <path d="M12 5v14M5 12h14" /> },
  { href: "/my-trips", label: "My trips", icon: <path d="M4 7h16M4 12h16M4 17h10" /> },
];

/**
 * Mobile-first frame in the SC ride design (README §1): an "SC" mark with Back on top, a big headline with a small
 * red label above it, and a tab bar at the bottom.
 */
export function AppShell({ children, eyebrow, title, subtitle, back }: {
  children: ReactNode;
  eyebrow?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
}) {
  const path = usePathname();
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const [menu, setMenu] = useState(false);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [testing, setTesting] = useState(false);
  const [mine, setMine] = useState<TripView[]>([]);

  // The Booker's own trips, only to show the "time to book" reminder. Failing quietly is fine: it is a convenience.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    api.listTrips({ scope: "mine" }).then((r) => { if (alive) setMine(r.items); }).catch(() => {});
    return () => { alive = false; };
  }, [user]);

  // What this deployment is connected to. Loaded once per page so the demo line can warn when shared storage is off,
  // and shown in the account menu so a missing key is easy to spot.
  useEffect(() => {
    healthOnce ??= api.health().catch(() => null);
    healthOnce.then((h) => { if (h) setHealth(h); });
  }, []);

  async function testGoogle() {
    setTesting(true);
    try {
      setHealth(await api.health(true));
    } catch {
      /* the menu keeps showing the last status */
    } finally {
      setTesting(false);
    }
  }

  async function signOut() {
    await api.logout().catch(() => {});
    router.replace("/login");
  }

  const backNode = back && (
    <Link href={back.href} aria-label={back.label} className="flex min-h-11 items-center gap-1 text-[13px] font-medium text-muted hover:text-ink">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
      Back
    </Link>
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-canvas shadow-[0_0_0_1px_var(--color-line)]">
      <header className="sticky top-0 z-30 bg-white pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center justify-between px-5">
          <Link href="/trips" className="text-[24px] font-extrabold leading-none tracking-tight text-cardinal" aria-label="SC ride home">SC</Link>
          <div className="flex items-center gap-4">
            {backNode}
            {user && (
              <div className="relative">
                <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Account"
                  className="grid h-9 w-9 place-items-center rounded-full border border-field-border bg-white text-xs font-semibold">
                  {user.displayName.split(" ").map((s) => s[0]).join("").slice(0, 2)}
                </button>
                {menu && (
                  <div className="absolute right-0 top-11 z-40 w-64 rounded-xl border border-line bg-surface p-4 shadow-[0_6px_24px_rgba(0,0,0,0.14)]">
                    <p className="font-semibold">{user.displayName}</p>
                    <p className="truncate text-sm text-muted">{user.email}</p>
                    <div className="mt-3 border-t border-line pt-3 text-sm">
                      <p className="font-semibold">Status</p>
                      <p className="text-muted">Places and drive times: {health ? (health.googleKeyConfigured ? "Google" : "built-in list and estimates") : "checking"}</p>
                      <p className="text-muted">Demo data: {health ? (health.sharedDataConfigured ? "shared" : "this server only") : "checking"}</p>
                      {health?.googleKeyConfigured && (
                        <button onClick={testGoogle} disabled={testing} className="mt-2 min-h-11 w-full rounded-lg border border-field-border bg-white px-3 text-left font-medium hover:bg-field disabled:opacity-50">
                          {testing ? "Testing Google…" : "Test Google"}
                        </button>
                      )}
                      {health?.google?.configured && (
                        <div className="mt-2 break-words text-[13px] leading-snug">
                          <p><b className="font-semibold">Places:</b> {health.google.places?.detail}</p>
                          <p className="mt-1"><b className="font-semibold">Routes:</b> {health.google.routes?.detail}</p>
                        </div>
                      )}
                    </div>
                    <button onClick={signOut} className="mt-3 min-h-11 w-full rounded-lg border border-field-border bg-white px-3 text-left font-medium hover:bg-field">Sign out</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <p className="bg-field px-5 py-1 text-center text-[11px] text-muted">
          <b className="font-semibold text-ink">Demo.</b>{" "}
          {health && health.environment && !health.sharedDataConfigured
            ? "Shared storage is not set up on this site, so searches and joins can disappear between taps."
            : "Simulated sign-in and places. No payments."}
        </p>
        {user && <BookerReminderBar trips={mine} meId={user.id} />}
      </header>

      <main className="flex-1 px-5 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6">
        {title && <Heading eyebrow={eyebrow} title={title} subtitle={subtitle} />}
        {children}
      </main>

        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
          <ul className="grid grid-cols-3">
            {TABS.map((t) => {
              const active = path.startsWith(t.href);
              return (
                <li key={t.href}>
                  <Link href={t.href} aria-current={active ? "page" : undefined}
                    className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active ? "text-cardinal" : "text-muted"}`}>
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{t.icon}</svg>
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
    </div>
  );
}
