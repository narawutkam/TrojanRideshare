import { handle, ok, readQuery } from "@/lib/api/http";
import { requireActor } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { idSchema, mapQuerySchema } from "@/lib/validation/schemas";

/**
 * GET /api/trips/:id/map[?destinationLocationId=] → 200 TripMap: the stops in driving order with coordinates and the
 * road path through them. With a destination, the route as it would be if the viewer joined with that stop.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const id = idSchema.parse((await params).id);
    const { destinationLocationId } = readQuery(req, mapQuerySchema);
    return ok(await getServices().trips.mapFor(actor.id, id, destinationLocationId));
  }, { readOnly: true });
}
