"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Navigation } from "@/components/Navigation";
import { useChat, type ChatStatus } from "@/lib/useChat";

const STATUS_LABEL: Record<ChatStatus, string> = {
  loading: "Loading…",
  connecting: "Connecting…",
  live: "Live",
  offline: "Reconnecting…",
  "not-found": "Unavailable",
};

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ChatPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const router = useRouter();
  const { me, other, messages, icebreakers, status, peerTyping, send, typing } = useChat(matchId);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [blockError, setBlockError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to the newest message (and the typing indicator).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, peerTyping]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (send(draft)) setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    } else {
      typing();
    }
  }

  async function block() {
    if (!other) return;
    setBlocking(true);
    setBlockError("");
    try {
      const response = await fetch("/api/block", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetId: other.id }),
      });
      if (!response.ok) throw new Error();
      router.replace("/chats");
    } catch {
      setBlockError("Couldn't block right now, try again.");
    } finally {
      setBlocking(false);
    }
  }

  if (status === "not-found") {
    return (
      <>
        <Navigation />
        <main className="page-shell">
          <section className="content-width card p-8 text-center">
            <p className="text-4xl">🫥</p>
            <h1 className="mt-3 text-xl font-bold">This chat isn&apos;t available</h1>
            <p className="muted mt-2">It may have been removed, or you aren&apos;t part of this match.</p>
            <Link href="/chats" className="primary-button mt-6 inline-block">Back to chats</Link>
          </section>
        </main>
      </>
    );
  }

  const canSend = status === "live" && draft.trim().length > 0;

  return (
    <>
      <Navigation />
      <main className="flex h-[100dvh] flex-col pb-[60px]">
        <header className="border-b border-[#e4e9e5] bg-white">
          <div className="content-width flex items-center gap-3 px-4 py-3">
            <Link href="/chats" className="rounded-lg px-2 py-1 text-xl text-slate-500" aria-label="Back to chats">←</Link>
            <span className="text-3xl" aria-hidden>{other?.avatarEmoji ?? "💬"}</span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-bold">{other?.alias ?? "Chat"}</h1>
              <p className={`text-xs ${status === "live" ? "text-[#2b765c]" : "muted"}`}>
                {peerTyping ? "typing…" : STATUS_LABEL[status]}
              </p>
            </div>
            <div className="relative">
              <button
                className="rounded-lg px-3 py-1 text-xl text-slate-500"
                aria-label="Chat options"
                aria-expanded={menuOpen}
                onClick={() => { setMenuOpen((open) => !open); setConfirmBlock(false); }}
              >⋯</button>
              {menuOpen && (
                <div className="card absolute right-0 top-full z-20 mt-2 w-60 p-3">
                  {!confirmBlock ? (
                    <button className="w-full rounded-lg px-3 py-2 text-left font-semibold text-red-700 hover:bg-red-50" onClick={() => setConfirmBlock(true)}>
                      🚫 Block {other?.alias ?? "this person"}
                    </button>
                  ) : (
                    <div>
                      <p className="text-sm">They won&apos;t be able to message you, and this chat will disappear for both of you.</p>
                      <div className="mt-3 flex gap-2">
                        <button className="secondary-button flex-1 !py-2" onClick={() => { setConfirmBlock(false); setMenuOpen(false); }}>Cancel</button>
                        <button className="primary-button flex-1 !bg-red-700 !py-2" disabled={blocking} onClick={block}>
                          {blocking ? "Blocking…" : "Block"}
                        </button>
                      </div>
                      {blockError && <p role="alert" className="mt-2 text-sm text-red-700">{blockError}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <section className="flex-1 overflow-y-auto" aria-live="polite">
          <div className="content-width flex flex-col gap-2 px-4 py-5">
            {status === "loading" && <p className="muted text-center">Loading messages…</p>}

            {status !== "loading" && messages.length === 0 && (
              <div className="card mx-auto my-6 max-w-md p-6 text-center">
                <p className="text-3xl">👋</p>
                <h2 className="mt-2 font-bold">You matched! Break the ice</h2>
                <p className="muted mt-1 text-sm">Tap one to start, then make it yours.</p>
                {icebreakers.length > 0 && (
                  <div className="mt-4 flex flex-col gap-2">
                    {icebreakers.map((icebreaker) => (
                      <button
                        key={icebreaker}
                        className="chip text-left text-sm"
                        onClick={() => { setDraft(icebreaker); inputRef.current?.focus(); }}
                      >
                        {icebreaker}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((message) => {
              const mine = message.senderId === me;
              return (
                <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 ${
                      mine ? "rounded-br-md bg-[var(--green)] text-white" : "rounded-bl-md border border-[#e4e9e5] bg-white"
                    }`}
                  >
                    {/* Plain text only: React escapes it. Never use dangerouslySetInnerHTML here. */}
                    {message.text}
                    <span className={`mt-1 block text-right text-[11px] ${mine ? "text-white/70" : "muted"}`}>
                      {timeLabel(message.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}

            {peerTyping && (
              <div className="flex justify-start">
                <div className="muted rounded-2xl rounded-bl-md border border-[#e4e9e5] bg-white px-4 py-2 text-sm">typing…</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </section>

        <form onSubmit={submit} className="border-t border-[#e4e9e5] bg-white">
          <div className="content-width flex items-end gap-2 px-4 py-3">
            <textarea
              ref={inputRef}
              className="field max-h-32 min-h-[46px] flex-1 resize-none"
              rows={1}
              maxLength={1000}
              placeholder={status === "live" ? "Say something nice…" : STATUS_LABEL[status]}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Message"
            />
            <button type="submit" className="primary-button" disabled={!canSend}>Send</button>
          </div>
        </form>
      </main>
    </>
  );
}
