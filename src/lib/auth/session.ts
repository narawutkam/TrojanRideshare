import { cookies } from "next/headers";
import { getConfig } from "@/config/env";
import { getMockDb } from "@/lib/mock/store";
import { AppError } from "@/lib/services/errors";
import type { User } from "@/types";

/**
 * Session resolution. The actor is always derived from the session, never from
 * request bodies (AGENTS.md). Mock mode uses a labeled demo cookie; live mode
 * will use Supabase Auth with the approved USC flow (README §8 "USC eligibility").
 */
export const SESSION_COOKIE = "hacksc_demo_session";

export async function getSessionUser(): Promise<User | null> {
  if (getConfig().appMode !== "mock") return null;
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return getMockDb().users.find((u) => u.id === id) ?? null;
}

/** Require an eligible (verified USC) student. 401 without a session, 403 if ineligible. */
export async function requireActor(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new AppError("UNAUTHORIZED", "Sign in with your USC account.");
  if (!user.verifiedUSC) throw new AppError("FORBIDDEN", "Rideshare is only available to verified USC students.");
  return user;
}
