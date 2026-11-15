import { assertSameOrigin, handle, ok, rateLimit, readJson, readQuery } from "@/lib/api/http";
import { requireActor } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { createTripSchema, listTripsQuerySchema } from "@/lib/validation/schemas";

/** GET /api/trips → 200 TripView[] with meta.nextCursor */
export async function GET(req: Request) {
  return handle(async () => {
    const actor = await requireActor();
    const query = readQuery(req, listTripsQuerySchema);
    const { items, nextCursor } = await getServices().trips.searchTrips(actor.id, query);
    return ok(items, { nextCursor });
  });
}

/** POST /api/trips → 201 TripView (Booker is the session user) */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requireActor();
    rateLimit(`create:${actor.id}`, 10);
    const input = await readJson(req, createTripSchema);
    return ok(await getServices().trips.createTrip(actor.id, input), { status: 201 });
  });
}
