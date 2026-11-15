"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "@/lib/client/api";
import { useCurrentUser } from "@/lib/client/hooks";

const NAV = [
  { href: "/trips", label: "Find trips" },
  { href: "/create", label: "Create trip" },
  { href: "/my-trips", label: "My trips" },
];

/** Shared navigation and page frame. */
export function AppShell({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { data: user } = useCurrentUser();

  async function signOut() {
    await api.logout().catch(() => {});
    router.replace("/login");
  }

  return (
    <div className="min-h-dvh">
      <div className="bg-gold px-4 py-1 text-center text-xs font-semibold text-[#3a0000]">
        Demo mode · simulated USC sign-in, places and agreement · no payments
      </div>
      <header className="bg-cardinal text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/trips" className="flex items-center gap-2 font-extrabold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-sm bg-gold font-black text-cardinal">T</span>
            Trojan Rideshare
          </Link>
          <nav aria-label="Main" className="order-3 flex w-full gap-4 text-sm sm:order-none sm:w-auto sm:flex-1">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={path.startsWith(n.href) ? "page" : undefined}
                className={`py-1 ${path.startsWith(n.href) ? "font-bold underline underline-offset-8" : "opacity-85 hover:opacity-100"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          {user && (
            <div className="ml-auto flex items-center gap-3 text-sm">
              <span className="hidden sm:inline">{user.displayName}</span>
              <button onClick={signOut} className="rounded-sm border border-white/40 px-2 py-1 text-xs hover:bg-white/10">Sign out</button>
            </div>
          )}
        </div>
        {title && (
          <div className="mx-auto max-w-5xl px-4 pb-6 pt-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            {subtitle && <div className="mt-1 text-sm opacity-90">{subtitle}</div>}
          </div>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
