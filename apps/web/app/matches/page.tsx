"use client";

import type { Recommendation } from "@campus/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MatchCard } from "@/components/MatchCard";
import { MatchModal } from "@/components/MatchModal";
import { Navigation } from "@/components/Navigation";

type NewMatch = { matchId: string; alias: string; avatarEmoji: string };

export default function MatchesPage() {
  const router = useRouter();
  const [cards, setCards] = useState<Recommendation[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [newMatch, setNewMatch] = useState<NewMatch | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const meRes = await fetch("/api/me");
      if (meRes.status === 401) return router.replace("/login");
      const me = await meRes.json();
      if (!me.onboarded) return router.replace("/onboarding");
      const res = await fetch("/api/matches/recommendations");
      if (!res.ok) throw new Error();
      setCards(await res.json());
    })().catch(() => setError("Couldn't load your matches. Refresh to try again."));
  }, [router]);

  async function act(card: Recommendation, action: "CONNECT" | "SKIP") {
    setPending(card.userId);
    setError("");
    // Optimistic: drop the card right away, put it back if the request fails.
    const index = cards?.indexOf(card) ?? 0;
    setCards((current) => current?.filter((item) => item.userId !== card.userId) ?? null);
    try {
      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetId: card.userId, action }),
      });
      if (res.status === 401) return router.replace("/login");
      if (!res.ok) throw new Error();
      const result: { matched: boolean; matchId?: string } = await res.json();
      if (result.matched && result.matchId) {
        setNewMatch({ matchId: result.matchId, alias: card.alias, avatarEmoji: card.avatarEmoji });
      }
    } catch {
      setCards((current) => {
        if (!current) return current;
        const next = [...current];
        next.splice(Math.min(index, next.length), 0, card);
        return next;
      });
      setError("Something went wrong, try again.");
    } finally {
      setPending(null);
    }
  }

  const closeModal = useCallback(() => setNewMatch(null), []);

  return (
    <>
      <Navigation />
      <main className="page-shell">
        <div className="content-width">
          <p className="text-sm font-bold uppercase tracking-widest text-[#2b765c]">For you</p>
          <h1 className="mt-2 text-3xl font-bold">People you might click with</h1>
          <p className="muted mt-2">Everyone stays anonymous until you both connect.</p>

          {error && <p role="alert" className="mt-5 text-sm text-red-700">{error}</p>}

          {cards === null && !error && (
            <div className="mt-8 grid gap-5 sm:grid-cols-2" aria-busy="true">
              {[0, 1, 2, 3].map((key) => <div key={key} className="card h-72 animate-pulse bg-slate-50" />)}
            </div>
          )}

          {cards?.length === 0 && (
            <div className="card mt-8 p-10 text-center">
              <p className="text-4xl" aria-hidden>👀</p>
              <p className="mt-3 text-lg font-semibold">You&apos;ve seen everyone for now. Check back later 👀</p>
            </div>
          )}

          {cards && cards.length > 0 && (
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {cards.map((card) => (
                <MatchCard
                  key={card.userId}
                  match={card}
                  busy={pending !== null}
                  onConnect={() => act(card, "CONNECT")}
                  onSkip={() => act(card, "SKIP")}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      {newMatch && <MatchModal {...newMatch} onClose={closeModal} />}
    </>
  );
}
