import { cookies } from "next/headers";
import { z } from "zod";
import { getConfig } from "@/config/env";
import { assertSameOrigin, handle, ok, readJson } from "@/lib/api/http";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { DEMO_IDENTITIES, USER } from "@/lib/mock/fixtures";
import { getMockDb } from "@/lib/mock/store";
import { AppError } from "@/lib/services/errors";

/**
 * POST /api/auth/login (mock only). Simulated USC sign-in for the labeled demo
 * identities. Live mode signs in through the authentication provider instead.
 */
const allowed: string[] = [...DEMO_IDENTITIES, USER.guest];

export async function POST(req: Request) {
  return handle(async () => {
    if (getConfig().appMode !== "mock") throw new AppError("FORBIDDEN", "Demo sign-in is disabled outside mock mode.");
    assertSameOrigin(req);
    const { userId } = await readJson(req, z.object({ userId: z.string() }).strict());
    if (!allowed.includes(userId)) throw new AppError("FORBIDDEN", "Unknown demo identity.");
    const user = getMockDb().users.find((u) => u.id === userId)!;
    (await cookies()).set(SESSION_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
    return ok(user);
  });
}
