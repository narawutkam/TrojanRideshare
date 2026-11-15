import { handle, ok, rateLimit, readQuery } from "@/lib/api/http";
import { requireActor } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { searchLocationsSchema } from "@/lib/validation/schemas";

/** GET /api/locations/search?q= → 200 Location[] (persisted, with regionId) */
export async function GET(req: Request) {
  return handle(async () => {
    const actor = await requireActor();
    rateLimit(`search:${actor.id}`, 60);
    const { q, cursor } = readQuery(req, searchLocationsSchema);
    const { items, nextCursor } = await getServices().locations.searchLocations(q, cursor);
    return ok(items, { nextCursor });
  }); // not read-only: a search saves the places it finds, which later requests look up by id
}
