import { handle, ok } from "@/lib/api/http";
import { requireActor } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { idSchema } from "@/lib/validation/schemas";

/** GET /api/locations/:id → 200 Location. Lets a trip page reopen a place the rider searched for. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireActor();
    const id = idSchema.parse((await params).id);
    return ok(getServices().locations.requireLocation(id, "place"));
  }, { readOnly: true });
}
