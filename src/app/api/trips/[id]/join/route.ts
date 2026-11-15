import { assertSameOrigin, handle, ok, rateLimit, readJson } from "@/lib/api/http";
import { requireActor } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { idSchema, joinTripSchema } from "@/lib/validation/schemas";

/** POST /api/trips/:id/join { agreementAccepted: true, agreementVersion } → 200 TripView */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requireActor();
    rateLimit(`join:${actor.id}`, 20);
    const id = idSchema.parse((await params).id);
    const input = await readJson(req, joinTripSchema);
    return ok(getServices().trips.joinTrip(actor.id, id, input));
  });
}
