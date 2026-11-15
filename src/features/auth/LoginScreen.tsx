"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";

export interface DemoIdentity {
  id: string;
  displayName: string;
  email: string;
}

/**
 * Home + sign-in (README R01), laid out in the USC single sign-on style the
 * campus login uses (centered wordmark, white card with a cardinal top rule,
 * Sign-in ID + Password, full-width button). This is a labeled DEMO: the
 * password is not checked and no real USC credentials are used. Live mode
 * replaces this screen with real USC SSO (Shibboleth).
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
    <div className="min-h-dvh bg-white text-[#1b1b1b]">
      <div className="mx-auto w-full max-w-xl px-5 pb-16 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        {/* Demo banner, in USC's info-banner style but honest about being simulated. */}
        <div className="mb-10 flex gap-3 border-l-4 border-[#2a6ebb] bg-[#f3f6fb] px-4 py-3 text-sm text-[#1b1b1b]">
          <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#2a6ebb] text-xs font-bold text-white">i</span>
          <p>
            <b>Demo sign-in.</b> This is a student project, not a USC service. Sign-in is simulated for the two demo
            accounts below and no real USC credentials are used. Live mode would use USC single sign-on.
          </p>
        </div>

        {/* Wordmark */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <svg viewBox="0 0 48 56" className="h-12 w-auto" aria-hidden fill="none">
            <path d="M24 2 4 9v20c0 12 9 20 20 25 11-5 20-13 20-25V9L24 2Z" fill="none" stroke="#990000" strokeWidth="2.5" />
            <path d="M18 20v10M24 18v14M30 20v10" stroke="#990000" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span className="text-5xl font-bold tracking-tight text-[#990000]" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>USC</span>
        </div>

        {/* Sign-in card */}
        <div className="mx-auto max-w-md border border-[#e3e0db] border-t-[6px] border-t-[#990000] bg-white p-7 shadow-sm">
          <h1 className="text-2xl font-bold">Welcome! Please sign in to continue.</h1>

          {mockMode ? (
            <form onSubmit={submit} className="mt-6 grid gap-5" noValidate>
              <div>
                <label htmlFor="signin-id" className="block text-lg font-semibold">
                  Sign-in ID <span className="font-normal text-[#5f5f5f]">(netid@usc.edu)</span>
                </label>
                <input
                  id="signin-id" type="email" autoComplete="username" value={signInId} onChange={(e) => setSignInId(e.target.value)}
                  className="mt-2 w-full min-h-12 border border-[#8a8a8a] bg-[#eef1f7] px-3 text-base outline-none focus:border-[#990000] focus:ring-2 focus:ring-[#990000]/30"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-lg font-semibold">Password</label>
                <div className="relative mt-2">
                  <input
                    id="password" type={showPw ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Not checked in demo"
                    className="w-full min-h-12 border border-[#8a8a8a] bg-[#eef1f7] px-3 pr-11 text-base outline-none focus:border-[#990000] focus:ring-2 focus:ring-[#990000]/30"
                  />
                  <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center text-[#5f5f5f] hover:text-[#1b1b1b]">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
                      {!showPw && <path d="M4 4l16 16" />}
                    </svg>
                  </button>
                </div>
              </div>

              {error && <p className="text-sm font-semibold text-[#990000]" role="alert">{error}</p>}

              <button type="submit" disabled={pending}
                className="min-h-12 w-full bg-[#990000] px-4 text-base font-semibold text-white transition hover:bg-[#7a0000] disabled:opacity-60">
                {pending ? "Signing in…" : "Sign in"}
              </button>
            </form>
          ) : (
            <p className="mt-4 text-sm text-[#5f5f5f]">USC single sign-on is not configured for this deployment yet.</p>
          )}
        </div>

        {mockMode && (
          <div className="mx-auto mt-5 max-w-md">
            <p className="text-center text-sm text-[#5f5f5f]">Demo accounts — tap to fill and sign in:</p>
            <div className="mt-2 grid gap-2">
              {identities.map((u) => (
                <button key={u.id} onClick={() => { setSignInId(u.email); setError(""); }}
                  className="flex min-h-12 items-center justify-between border border-[#e3e0db] bg-white px-4 text-left text-sm hover:bg-[#f7f6f3]">
                  <span className="font-semibold">{u.displayName}</span>
                  <span className="text-[#2a6ebb]">{u.email}</span>
                </button>
              ))}
            </div>

            {/* Helper links, matching USC's row (demo equivalents). */}
            <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-[#2a6ebb]">
              <button onClick={reset} className="hover:underline">Reset demo data</button>
              <a href="https://github.com/" target="_blank" rel="noopener noreferrer" className="hover:underline">About this project</a>
            </div>
            {resetMsg && <p className="mt-2 text-center text-sm text-[#5f5f5f]" role="status">{resetMsg}</p>}

            <p className="mt-8 text-center text-xs leading-relaxed text-[#5f5f5f]">
              Not affiliated with or endorsed by the University of Southern California. Built for a hackathon demo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
