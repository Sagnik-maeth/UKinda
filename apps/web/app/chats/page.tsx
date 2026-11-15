"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Navigation } from "@/components/Navigation";
import { timeAgo } from "@/lib/format";

type ChatItem = {
  matchId: string;
  other: { id: string; alias: string; avatarEmoji: string };
  lastMessage: { text: string; createdAt: string } | null;
};

export default function ChatsPage() {
  const router = useRouter();
  const [chats, setChats] = useState<ChatItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/chats");
      if (res.status === 401) return router.replace("/login");
      if (!res.ok) throw new Error();
      setChats(await res.json());
    })().catch(() => setError("Couldn't load your chats. Refresh to try again."));
  }, [router]);

  return (
    <>
      <Navigation />
      <main className="page-shell">
        <div className="content-width max-w-[640px]">
          <h1 className="text-3xl font-bold">Chats</h1>
          <p className="muted mt-2">Your matches. Say hi, it&apos;s less awkward than you think.</p>

          {error && <p role="alert" className="mt-5 text-sm text-red-700">{error}</p>}
          {chats === null && !error && <p className="muted mt-8">Loading…</p>}

          {chats?.length === 0 && (
            <div className="card mt-8 p-10 text-center">
              <p className="text-4xl" aria-hidden>💬</p>
              <p className="mt-3 font-semibold">No matches yet.</p>
              <Link href="/matches" className="primary-button mt-5 inline-block">Find your people ✨</Link>
            </div>
          )}

          {chats && chats.length > 0 && (
            <ul className="card mt-8 divide-y divide-[#eef2ef] overflow-hidden">
              {chats.map((chat) => (
                <li key={chat.matchId}>
                  <Link href={`/chats/${chat.matchId}`} className="flex items-center gap-4 px-5 py-4 hover:bg-[#f6faf7]">
                    <span className="text-3xl" aria-hidden>{chat.other.avatarEmoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{chat.other.alias}</span>
                      <span className="muted block truncate text-sm">
                        {chat.lastMessage ? chat.lastMessage.text : "New match! Say hi 👋"}
                      </span>
                    </span>
                    {chat.lastMessage && <span className="muted shrink-0 text-xs">{timeAgo(chat.lastMessage.createdAt)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}
