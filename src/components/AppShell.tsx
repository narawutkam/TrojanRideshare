"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/client/api";
import { useCurrentUser } from "@/lib/client/hooks";

const TABS = [
  { href: "/trips", label: "Find", icon: <path d="M10.5 18a7.5 7.5 0 1 1 5.3-2.2L21 21" /> },
  { href: "/create", label: "Create", icon: <path d="M12 5v14M5 12h14" /> },
  { href: "/my-trips", label: "My trips", icon: <path d="M4 7h16M4 12h16M4 17h10" /> },
];

/**
 * Mobile-first app frame (README §1): a phone-width column, a plain white bar under a cardinal
 * rule, a one-line demo note, and a flat tab bar within thumb reach. No fills, no shadows.
 */
export function AppShell({ children, title, subtitle, back }: {
  children: ReactNode; title?: string; subtitle?: ReactNode; back?: { href: string; label: string };
}) {
  const path = usePathname();
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const [menu, setMenu] = useState(false);

  async function signOut() {
    await api.logout().catch(() => {});
    router.replace("/login");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-canvas shadow-[0_0_0_1px_var(--color-line)]">
      <header className="sticky top-0 z-30 border-b border-line bg-white pt-[env(safe-area-inset-top)]">
        <div className="h-1.5 bg-cardinal" aria-hidden />
        <div className="flex h-14 items-center gap-2 px-4">
          {back && (
            <Link href={back.href} aria-label={back.label} className="-ml-2 grid h-11 w-11 place-items-center rounded-sm hover:bg-field">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
            </Link>
          )}
          <span className="flex-1 text-xl font-bold text-cardinal">Trojan Rideshare</span>
          {user && (
            <div className="relative">
              <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Account"
                className="grid h-9 w-9 place-items-center rounded-sm border border-field-border bg-white text-sm font-semibold">
                {user.displayName.split(" ").map((s) => s[0]).join("").slice(0, 2)}
              </button>
              {menu && (
                <div className="absolute right-0 top-11 z-40 w-60 rounded-sm border border-line border-t-[5px] border-t-cardinal bg-surface p-4 shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
                  <p className="font-semibold">{user.displayName}</p>
                  <p className="truncate text-sm text-muted">{user.email}</p>
                  <button onClick={signOut} className="mt-3 min-h-11 w-full rounded-sm border border-field-border bg-white px-3 text-left font-medium hover:bg-field">Sign out</button>
                </div>
              )}
            </div>
          )}
        </div>
        <p className="border-t border-l-4 border-t-line border-l-info bg-[#f3f6fb] px-4 py-1.5 text-[13px] text-ink">
          <b className="font-semibold">Demo.</b> Simulated sign-in and places. No payments.
        </p>
      </header>

      <main className="flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6">
        {title && (
          <div className="mb-6">
            <h1 className="text-[30px] font-bold leading-tight">{title}</h1>
            {subtitle && <div className="mt-1 text-[17px] text-muted">{subtitle}</div>}
          </div>
        )}
        {children}
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="grid grid-cols-3">
          {TABS.map((t) => {
            const active = path.startsWith(t.href);
            return (
              <li key={t.href}>
                <Link href={t.href} aria-current={active ? "page" : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-1 border-t-[3px] text-[13px] font-semibold ${active ? "border-cardinal text-cardinal" : "border-transparent text-muted"}`}>
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinecap="square" strokeLinejoin="miter" aria-hidden>{t.icon}</svg>
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
