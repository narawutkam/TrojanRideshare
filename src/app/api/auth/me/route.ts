import { handle, ok } from "@/lib/api/http";
import { requireActor } from "@/lib/auth/session";

/** GET /api/auth/me → 200 User (private self view). */
export async function GET() {
  return handle(async () => ok(await requireActor()));
}
