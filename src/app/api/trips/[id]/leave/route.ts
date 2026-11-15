import { assertSameOrigin, handle, ok, readJson } from "@/lib/api/http";
import { requireActor } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { idSchema, leaveTripSchema } from "@/lib/validation/schemas";

/** POST /api/trips/:id/leave {} → 200 TripView */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requireActor();
    const id = idSchema.parse((await params).id);
    await readJson(req, leaveTripSchema);
    return ok(getServices().trips.leaveTrip(actor.id, id));
  });
}
