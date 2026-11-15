import { getConfig } from "@/config/env";
import { assertSameOrigin, handle, ok } from "@/lib/api/http";
import { resetMockDb } from "@/lib/mock/store";
import { AppError } from "@/lib/services/errors";

/** POST /api/demo/reset (mock only): restore the seeded starting dataset (README §7). */
export async function POST(req: Request) {
  return handle(async () => {
    if (getConfig().appMode !== "mock") throw new AppError("FORBIDDEN", "Reset is only available in mock mode.");
    assertSameOrigin(req);
    const db = resetMockDb();
    return ok({ trips: db.trips.length });
  });
}
