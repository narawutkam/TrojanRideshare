import { handle, ok } from "@/lib/api/http";
import { requireActor } from "@/lib/auth/session";
import { getServices } from "@/lib/services";

/** GET /api/locations/pickups → 200 Location[]: the campus pickup catalog (proposed addition, docs/integration-log.md). */
export async function GET() {
  return handle(async () => {
    await requireActor();
    return ok(getServices().locations.getPickups());
  }, { readOnly: true });
}
