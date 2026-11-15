import { cookies } from "next/headers";
import { assertSameOrigin, handle, ok } from "@/lib/api/http";
import { SESSION_COOKIE } from "@/lib/auth/session";

/** POST /api/auth/logout */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    (await cookies()).delete(SESSION_COOKIE);
    return ok({ signedOut: true });
  });
}
