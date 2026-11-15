import { newId } from "@/lib/ids";
import type { ServiceContext } from "@/lib/services/context";
import { AppError } from "@/lib/services/errors";
import { CHAT_MAX_LENGTH, PAGE_SIZE, type ChatMessage } from "@/types";

/**
 * MessageService (README §5). Chat is restricted to current confirmed members
 * of a non-cancelled trip, on both read and write.
 */
export class MessageService {
  constructor(private readonly ctx: ServiceContext) {}

  private assertAccess(actorId: string, tripId: string) {
    const trip = this.ctx.db.trips.find((t) => t.id === tripId);
    const m = this.ctx.db.participants.find((p) => p.tripId === tripId && p.userId === actorId);
    if (!trip || (trip.status === "cancelled" && !m)) throw new AppError("TRIP_NOT_FOUND", "Trip not found.");
    if (!m || m.status !== "confirmed" || trip.status === "cancelled") {
      throw new AppError("FORBIDDEN", "Only current members can use this trip's chat.");
    }
  }

  /** Newest first by timestamp then ID. Cursor is an opaque keyset of the last message returned. */
  getMessages(actorId: string, tripId: string, cursor?: string): { items: ChatMessage[]; nextCursor: string | null } {
    this.assertAccess(actorId, tripId);
    let after: { t: string; id: string } | null = null;
    if (cursor) {
      try {
        after = JSON.parse(Buffer.from(cursor, "base64url").toString()) as { t: string; id: string };
        if (typeof after.t !== "string" || typeof after.id !== "string") throw new Error();
      } catch {
        throw new AppError("VALIDATION_ERROR", "Invalid or expired cursor.");
      }
    }
    const newestFirst = (a: ChatMessage, b: ChatMessage) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
    const all = this.ctx.db.messages.filter((m) => m.tripId === tripId).sort(newestFirst);
    const rest = after ? all.filter((m) => m.createdAt < after.t || (m.createdAt === after.t && m.id < after.id)) : all;
    const items = rest.slice(0, PAGE_SIZE);
    const last = items[items.length - 1];
    const nextCursor = rest.length > PAGE_SIZE && last ? Buffer.from(JSON.stringify({ t: last.createdAt, id: last.id })).toString("base64url") : null;
    return { items, nextCursor };
  }

  sendMessage(actorId: string, tripId: string, content: string): ChatMessage {
    this.assertAccess(actorId, tripId);
    const text = content.trim();
    if (text.length < 1 || text.length > CHAT_MAX_LENGTH) {
      throw new AppError("VALIDATION_ERROR", `Messages must be 1–${CHAT_MAX_LENGTH} characters.`);
    }
    const msg: ChatMessage = { id: newId(), tripId, senderId: actorId, content: text, createdAt: this.ctx.clock.now().toISOString() };
    this.ctx.db.messages.push(msg);
    return msg;
  }
}
