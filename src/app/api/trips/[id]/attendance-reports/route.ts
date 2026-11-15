import { assertSameOrigin, handle, ok, readJson } from "@/lib/api/http";
import { requireActor } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { idSchema, reportNoShowSchema } from "@/lib/validation/schemas";

/** POST /api/trips/:id/attendance-reports { subjectId, reason: "no_show" } → 201 AttendanceReport (pending) */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requireActor();
    const id = idSchema.parse((await params).id);
    const { subjectId } = await readJson(req, reportNoShowSchema);
    return ok(getServices().attendance.reportNoShow(actor.id, id, subjectId), { status: 201 });
  });
}
