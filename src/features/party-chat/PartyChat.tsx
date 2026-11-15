"use client";

import { useEffect, useRef, useState } from "react";
import { Button, ErrorState, inputClass, Notice } from "@/components/ui";
import { ApiError } from "@/lib/client/api";
import { formatTime } from "@/lib/time";
import { CHAT_MAX_LENGTH, type ParticipantSummary } from "@/types";
import { useChatSubscription } from "./useChatSubscription";

/** Party chat (README R07): roster-aware history and send for current confirmed members. */
export function PartyChat({ tripId, actorId, roster, bookerId, onRosterStale }: {
  tripId: string; actorId: string; roster: ParticipantSummary[]; bookerId: string;
  /** Called when a message arrives from someone not in the roster (e.g. a rider who just joined). */
  onRosterStale?: () => void;
}) {
  const { messages, send, loadOlder, hasOlder, error, closed } = useChatSubscription(tripId, true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const askedFor = useRef(new Set<string>());
  const names = new Map(roster.map((r) => [r.userId, r.displayName]));

  // A message from someone outside the roster means the roster may be stale (a rider just
  // joined). Re-check once per such message; if they're still absent they're a former member.
  useEffect(() => {
    const unknown = messages.filter((m) => !names.has(m.senderId) && !askedFor.current.has(m.id));
    if (unknown.length && onRosterStale) {
      unknown.forEach((m) => askedFor.current.add(m.id));
      onRosterStale();
    }
  });

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setSendError("");
    try {
      await send(content);
      setText("");
    } catch (err) {
      // Outcome unknown on network errors: the next refresh shows whether it landed (README §4).
      setSendError(err instanceof ApiError ? err.message : "Message failed. Check the chat before resending.");
    } finally {
      setSending(false);
    }
  }

  if (closed) return <Notice tone="warn">Chat is closed for this trip.</Notice>;

  return (
    <section aria-label="Party chat" className="flex h-[min(34rem,65dvh)] min-h-80 flex-col rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-bold">Party chat</h2>
        <span className="text-xs text-muted">{roster.length} member{roster.length === 1 ? "" : "s"}</span>
      </div>
      <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
        {hasOlder && <button onClick={loadOlder} className="self-center text-xs font-semibold text-link hover:underline">Load older messages</button>}
        {!messages.length && <p className="m-auto text-sm text-muted">No messages yet. Say hi and confirm where to meet.</p>}
        {messages.map((m) => {
          const mine = m.senderId === actorId;
          const name = names.get(m.senderId) ?? (askedFor.current.has(m.id) ? "Former member" : "New member");
          return (
            <div key={m.id} className={`max-w-[80%] ${mine ? "self-end text-right" : "self-start"}`}>
              {!mine && <p className="mb-0.5 text-xs font-semibold text-muted">{name}{m.senderId === bookerId ? " · Booker" : ""}</p>}
              <p className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-left text-[15px] ${mine ? "bg-cardinal text-white" : "bg-field"}`}>{m.content}</p>
              <p className="mt-0.5 text-[11px] text-muted">{formatTime(m.createdAt)}</p>
            </div>
          );
        })}
      </div>
      {error && !closed && <div className="px-4 pb-2"><ErrorState error={error} /></div>}
      <form onSubmit={submit} className="flex gap-2 border-t border-line p-3">
        <label htmlFor="chat-input" className="sr-only">Message your party</label>
        <input id="chat-input" className={inputClass} value={text} maxLength={CHAT_MAX_LENGTH} placeholder="Message your party…" onChange={(e) => setText(e.target.value)} autoComplete="off" />
        <Button type="submit" disabled={!text.trim() || sending}>{sending ? "Sending…" : "Send"}</Button>
      </form>
      {sendError && <p className="px-4 pb-3 text-xs font-semibold text-cardinal" role="alert">{sendError}</p>}
    </section>
  );
}
