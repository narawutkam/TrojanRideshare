import { handle, ok, readQuery } from "@/lib/api/http";
import { requireActor } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { fitQuerySchema, idSchema } from "@/lib/validation/schemas";

/** GET /api/trips/:id/fit?destinationLocationId=... → 200 TripFit (does this stop fit the route?) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireActor();
    const id = idSchema.parse((await params).id);
    const { destinationLocationId } = readQuery(req, fitQuerySchema);
    return ok(await getServices().trips.fitTrip(actor.id, id, destinationLocationId));
  });
}
