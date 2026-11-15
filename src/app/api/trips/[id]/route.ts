import { assertSameOrigin, handle, ok, readJson } from "@/lib/api/http";
import { requireActor } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { cancelTripSchema, idSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/trips/:id → 200 TripView */
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const actor = await requireActor();
    const id = idSchema.parse((await params).id);
    return ok(getServices().trips.getTrip(actor.id, id));
  }, { readOnly: true });
}

/** PATCH /api/trips/:id { status: "cancelled" } → 200 TripView (Booker only) */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requireActor();
    const id = idSchema.parse((await params).id);
    await readJson(req, cancelTripSchema);
    return ok(getServices().trips.cancelTrip(actor.id, id));
  });
}
