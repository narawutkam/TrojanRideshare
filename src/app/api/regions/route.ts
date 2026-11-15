import { handle, ok, readQuery } from "@/lib/api/http";
import { requireActor } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { cursorOnlySchema } from "@/lib/validation/schemas";

/** GET /api/regions → 200 Region[] */
export async function GET(req: Request) {
  return handle(async () => {
    await requireActor();
    const { cursor } = readQuery(req, cursorOnlySchema);
    const { items, nextCursor } = getServices().locations.getRegions(cursor);
    return ok(items, { nextCursor });
  }, { readOnly: true });
}
