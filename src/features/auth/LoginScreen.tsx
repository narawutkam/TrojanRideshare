"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Notice } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

export interface DemoIdentity {
  id: string;
  displayName: string;
  email: string;
}

/** Home + USC login (README R01). Mock mode offers two labeled demo identities. */
export function LoginScreen({ identities, mockMode }: { identities: DemoIdentity[]; mockMode: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [resetMsg, setResetMsg] = useState("");

  async function signIn(id: string) {
    setPending(id);
    setError("");
    try {
      await api.login(id);
      router.replace("/trips");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sign-in failed.");
      setPending(null);
    }
  }

  async function reset() {
    setResetMsg("");
    try {
      const r = await api.resetDemo();
      setResetMsg(`Demo data reset (${r.trips} seeded trips).`);
    } catch (e) {
      setResetMsg(e instanceof ApiError ? e.message : "Reset failed.");
    }
  }

  return (
    <div className="min-h-dvh bg-cardinal text-white">
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-14 md:grid-cols-[1.2fr_1fr] md:items-center">
        <div>
          <div className="mb-4 flex items-center gap-2 text-lg font-extrabold">
            <span className="grid h-8 w-8 place-items-center rounded-sm bg-gold font-black text-cardinal">T</span>
            Trojan Rideshare
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Split an Uber anywhere in LA with other Trojans.</h1>
          <p className="mt-4 max-w-md text-white/90">
            Find a trip headed your way, join solo, and coordinate in party chat. Meet at the Village, Everybody&apos;s Kitchen or Webb. The Booker books the ride and everyone splits the fare.
          </p>
        </div>

        <Card className="p-6 text-ink">
          <h2 className="text-xl font-bold">Sign in with USC</h2>
          {mockMode ? (
            <>
              <p className="mt-1 text-sm text-muted">Demo mode: choose a simulated USC student. Real USC single sign-on replaces this in live mode.</p>
              <div className="mt-4 grid gap-2">
                {identities.map((u) => (
                  <Button key={u.id} onClick={() => signIn(u.id)} disabled={!!pending} className="justify-between">
                    <span>Continue as {u.displayName}</span>
                    <span className="text-xs font-normal opacity-80">{pending === u.id ? "Signing in…" : u.email}</span>
                  </Button>
                ))}
              </div>
              {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
              <div className="mt-6 border-t border-line pt-4 text-sm">
                <button onClick={reset} className="font-semibold text-cardinal hover:underline">Reset demo data</button>
                {resetMsg && <p className="mt-1 text-muted" role="status">{resetMsg}</p>}
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">USC single sign-on is not configured for this deployment yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
