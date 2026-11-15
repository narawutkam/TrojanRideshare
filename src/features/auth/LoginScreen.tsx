"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Callout, Eyebrow, inputClass, Notice, SelectCard } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

export interface DemoIdentity {
  id: string;
  displayName: string;
  email: string;
}

/**
 * Home + sign-in (README R01), in the SC ride look. This is a labeled DEMO: the password is not checked and no real
 * USC credentials are used. Live mode replaces this screen with real USC single sign-on.
 */
export function LoginScreen({ identities, mockMode }: { identities: DemoIdentity[]; mockMode: boolean }) {
  const router = useRouter();
  const [signInId, setSignInId] = useState(identities[0]?.email ?? "");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [resetMsg, setResetMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const match = identities.find((u) => u.email.toLowerCase() === signInId.trim().toLowerCase());
    if (!match) {
      setError(`Demo accounts only. Use ${identities.map((u) => u.email).join(" or ")}, or tap one below.`);
      return;
    }
    setPending(true);
    setError("");
    try {
      await api.login(match.id);
      router.replace("/trips");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed.");
      setPending(false);
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
    <div className="mx-auto min-h-dvh max-w-lg bg-white px-5 pb-16 pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center">
        <span className="text-[24px] font-extrabold leading-none tracking-tight text-cardinal">SC</span>
      </div>

      <Callout title="Demo sign-in" className="mt-2">
        This is a student project, not a USC service. Sign-in is simulated for the two demo accounts below and no real USC
        credentials are used. Live mode would use USC single sign-on.
      </Callout>

      <div className="mt-8">
        <Eyebrow>Sign in</Eyebrow>
        <h1 className="mt-3 text-[28px] font-bold leading-[1.15]">Welcome! Please sign in to continue.</h1>
      </div>

      {mockMode ? (
        <form onSubmit={submit} className="mt-6 grid gap-5" noValidate>
          <div className="grid gap-2">
            <label htmlFor="signin-id" className="text-[13px] font-bold">
              Sign-in ID <span className="font-normal text-muted">(netid@usc.edu)</span>
            </label>
            <input id="signin-id" type="email" autoComplete="username" value={signInId} onChange={(e) => setSignInId(e.target.value)} className={inputClass} />
          </div>

          <div className="grid gap-2">
            <label htmlFor="password" className="text-[13px] font-bold">Password</label>
            <div className="relative">
              <input id="password" type={showPw ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Not checked in demo" className={`${inputClass} pr-16`} />
              <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 min-h-11 -translate-y-1/2 px-1 text-[13px] font-semibold text-cardinal">{showPw ? "Hide" : "Show"}</button>
            </div>
          </div>

          {error && <Notice tone="error">{error}</Notice>}

          <Button type="submit" disabled={pending} className="w-full">{pending ? "Signing in…" : "Sign in"}</Button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-muted">USC single sign-on is not configured for this deployment yet.</p>
      )}

      {mockMode && (
        <div className="mt-8">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Demo accounts: tap to fill</p>
          <div className="grid gap-3">
            {identities.map((u) => (
              <SelectCard key={u.id} selected={signInId.trim().toLowerCase() === u.email.toLowerCase()} onSelect={() => { setSignInId(u.email); setError(""); }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[15px] font-semibold">{u.displayName}</span>
                  <span className="truncate text-[13px] text-muted">{u.email}</span>
                </div>
              </SelectCard>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-1 text-[13px] text-cardinal">
            <button type="button" onClick={reset} className="min-h-11 font-medium hover:underline">Reset demo data</button>
            <a href="https://github.com/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium hover:underline">About this project</a>
          </div>
          {resetMsg && <p className="text-center text-xs text-muted" role="status">{resetMsg}</p>}

          <p className="mt-8 text-center text-[11px] leading-relaxed text-muted">
            Not affiliated with or endorsed by the University of Southern California. Built for a hackathon demo.
          </p>
        </div>
      )}
    </div>
  );
}
