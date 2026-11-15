import { assertSameOrigin, handle, ok, rateLimit, readJson, readQuery } from "@/lib/api/http";
import { requireActor } from "@/lib/auth/session";
import { getServices } from "@/lib/services";
import { cursorOnlySchema, idSchema, sendMessageSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/trips/:id/messages → 200 ChatMessage[] newest first, meta.nextCursor for older */
export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const actor = await requireActor();
    const id = idSchema.parse((await params).id);
    const { cursor } = readQuery(req, cursorOnlySchema);
    const { items, nextCursor } = getServices().messages.getMessages(actor.id, id, cursor);
    return ok(items, { nextCursor });
  }, { readOnly: true });
}

/** POST /api/trips/:id/messages { content } → 201 ChatMessage */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requireActor();
    rateLimit(`msg:${actor.id}`, 30);
    const id = idSchema.parse((await params).id);
    const { content } = await readJson(req, sendMessageSchema);
    return ok(getServices().messages.sendMessage(actor.id, id, content), { status: 201 });
  });
}
