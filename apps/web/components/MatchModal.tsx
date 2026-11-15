"use client";

import Link from "next/link";
import { useEffect } from "react";

type Props = {
  alias: string;
  avatarEmoji: string;
  matchId: string;
  onClose: () => void;
};

export function MatchModal({ alias, avatarEmoji, matchId, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-title"
        className="card w-full max-w-sm p-8 text-center"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-6xl" aria-hidden>{avatarEmoji}</p>
        <h2 id="match-title" className="mt-4 text-2xl font-bold">It&apos;s a match! 🎉</h2>
        <p className="muted mt-2">You and <strong className="text-[var(--ink)]">{alias}</strong> both want to connect.</p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href={`/chats/${matchId}`} className="primary-button block">Say hi 👋</Link>
          <button type="button" className="secondary-button" onClick={onClose}>Keep browsing</button>
        </div>
      </div>
    </div>
  );
}
