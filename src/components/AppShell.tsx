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
 * Mobile-first app frame (README §1 "mobile-first app"): a phone-width column on every
 * screen size, compact top bar, and a bottom tab bar within thumb reach.
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
      <header className="sticky top-0 z-30 bg-cardinal text-white pt-[env(safe-area-inset-top)]">
        <div className="bg-gold px-3 py-0.5 text-center text-[11px] font-semibold text-[#3a0000]">Demo · simulated USC sign-in, places and terms · no payments</div>
        <div className="flex h-12 items-center gap-2 px-3">
          {back ? (
            <Link href={back.href} aria-label={back.label} className="-ml-1 grid h-10 w-10 place-items-center rounded-sm hover:bg-white/10">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
            </Link>
          ) : (
            <span className="grid h-7 w-7 place-items-center rounded-sm bg-gold text-sm font-black text-cardinal" aria-hidden>T</span>
          )}
          <span className="flex-1 truncate font-bold">{back ? title : "Trojan Rideshare"}</span>
          {user && (
            <div className="relative">
              <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Account"
                className="grid h-9 w-9 place-items-center rounded-sm bg-gold text-xs font-bold text-[#3a0000]">
                {user.displayName.split(" ").map((s) => s[0]).join("").slice(0, 2)}
              </button>
              {menu && (
                <div className="absolute right-0 top-11 w-56 rounded-sm border border-line bg-surface p-3 text-sm text-ink shadow-lg">
                  <p className="font-semibold">{user.displayName}</p>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                  <button onClick={signOut} className="mt-3 w-full rounded-sm border border-line px-3 py-2 text-left font-semibold hover:bg-canvas">Sign out</button>
                </div>
              )}
            </div>
          )}
        </div>
        {title && !back && (
          <div className="px-4 pb-4">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <div className="mt-0.5 text-sm opacity-90">{subtitle}</div>}
          </div>
        )}
        {back && subtitle && <div className="px-4 pb-3 text-sm opacity-90">{subtitle}</div>}
      </header>

      <main className="flex-1 px-3 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <ul className="grid grid-cols-3">
          {TABS.map((t) => {
            const active = path.startsWith(t.href);
            return (
              <li key={t.href}>
                <Link href={t.href} aria-current={active ? "page" : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${active ? "text-cardinal" : "text-muted"}`}>
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={active ? 2.6 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{t.icon}</svg>
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
