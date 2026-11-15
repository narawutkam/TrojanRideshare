"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import type { ChatMessage } from "@/types";

const POLL_MS = 3000;

/**
 * The single chat subscription adapter (README §2). Mock mode polls the
 * persisted history; a live adapter swaps in Supabase Realtime behind the same
 * hook. On reconnect or tab focus it refetches history and de-duplicates by ID.
 */
export function useChatSubscription(tripId: string, enabled: boolean) {
  const [byId, setById] = useState<Map<string, ChatMessage>>(new Map());
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [closed, setClosed] = useState(false);
  const firstLoad = useRef(true);

  const merge = useCallback((items: ChatMessage[]) => {
    setById((prev) => {
      const next = new Map(prev);
      items.forEach((m) => next.set(m.id, m));
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await api.messages(tripId);
      merge(r.items);
      if (firstLoad.current) { setOlderCursor(r.nextCursor); firstLoad.current = false; }
      setError(null);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("INTERNAL_ERROR", "Chat failed to load.", 500);
      if (err.code === "FORBIDDEN" || err.code === "TRIP_NOT_FOUND") setClosed(true); // access revoked: stop listening
      setError(err);
    }
  }, [tripId, merge]);

  useEffect(() => {
    if (!enabled || closed) return;
    refresh();
    const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, POLL_MS);
    const onWake = () => refresh();
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [enabled, closed, refresh]);

  const loadOlder = useCallback(async () => {
    if (!olderCursor) return;
    const r = await api.messages(tripId, olderCursor);
    merge(r.items);
    setOlderCursor(r.nextCursor);
  }, [olderCursor, tripId, merge]);

  const send = useCallback(async (content: string) => {
    const msg = await api.sendMessage(tripId, content);
    merge([msg]);
  }, [tripId, merge]);

  const messages = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return { messages, send, loadOlder, hasOlder: !!olderCursor, error, closed, refresh };
}
