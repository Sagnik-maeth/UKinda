"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

export type Msg = { id: string; senderId: string; text: string; createdAt: string };
export type ChatPeer = { id: string; alias: string; avatarEmoji: string };
export type ChatStatus = "loading" | "connecting" | "live" | "offline" | "not-found";

type History = { me: string; other: ChatPeer; messages: Msg[]; icebreakers: string[] };

/** Merges by id and keeps chronological order, so history reloads and live events never duplicate. */
function merge(prev: Msg[], incoming: Msg[]) {
  const byId = new Map(prev.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
}

async function fetchToken(): Promise<string> {
  const response = await fetch("/api/auth/realtime-token");
  if (!response.ok) throw new Error("not signed in");
  return (await response.json()).token;
}

export function useChat(matchId: string) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [icebreakers, setIcebreakers] = useState<string[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [other, setOther] = useState<ChatPeer | null>(null);
  const [status, setStatus] = useState<ChatStatus>("loading");
  const [peerTyping, setPeerTyping] = useState(false);
  const sock = useRef<Socket | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastTypingSent = useRef(0);

  useEffect(() => {
    let alive = true;

    const loadHistory = async () => {
      const response = await fetch(`/api/chats/${matchId}/messages`);
      if (!alive) return false;
      if (response.status === 404) {
        setStatus("not-found");
        return false;
      }
      if (!response.ok) throw new Error(`history failed: ${response.status}`);
      const history: History = await response.json();
      if (!alive) return false;
      setMe(history.me);
      setOther(history.other);
      setIcebreakers(history.icebreakers ?? []);
      setMessages((prev) => merge(prev, history.messages));
      return true;
    };

    (async () => {
      try {
        if (!(await loadHistory())) return;
      } catch {
        if (alive) setStatus("offline");
        return;
      }
      if (!alive) return;
      setStatus("connecting");

      // `auth` as a callback fetches a fresh short-lived token on every (re)connect.
      const socket = io(process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4000", {
        auth: (cb) => { fetchToken().then((token) => cb({ token }), () => cb({})); },
      });
      sock.current = socket;

      socket.on("connect", () => {
        socket.emit("join", matchId, (result: { ok: boolean }) => {
          if (!alive) return;
          if (!result?.ok) {
            setStatus("not-found");
            socket.disconnect();
            return;
          }
          setStatus("live");
          // Catch anything sent while we were disconnected (or between the first load and joining).
          loadHistory().catch(() => undefined);
        });
      });
      socket.on("disconnect", () => { if (alive) setStatus((s) => (s === "not-found" ? s : "offline")); });
      socket.on("connect_error", () => { if (alive) setStatus("offline"); });
      socket.on("message:new", (message: Msg & { matchId: string }) => {
        if (message.matchId !== matchId) return;
        setMessages((prev) => merge(prev, [message]));
        setPeerTyping(false);
      });
      socket.on("typing", () => {
        setPeerTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setPeerTyping(false), 1500);
      });
    })();

    return () => {
      alive = false;
      clearTimeout(typingTimer.current);
      sock.current?.disconnect();
      sock.current = null;
    };
  }, [matchId]);

  const send = useCallback((text: string) => {
    const clean = text.trim().slice(0, 1000);
    const socket = sock.current;
    if (!clean || !socket?.connected) return false;
    socket.emit("message:send", { matchId, text: clean });
    return true;
  }, [matchId]);

  /** Throttled to one event per second. */
  const typing = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < 1000) return;
    lastTypingSent.current = now;
    sock.current?.emit("typing", matchId);
  }, [matchId]);

  return { me, other, messages, icebreakers, status, peerTyping, send, typing };
}
