// Type-only import: erased at build time, so the server-only barrel never reaches the browser.
import type { Recommendation } from "@campus/core";
import { yearLabel } from "@/lib/format";

type Props = {
  match: Recommendation;
  busy: boolean;
  onConnect: () => void;
  onSkip: () => void;
};

export function MatchCard({ match, busy, onConnect, onSkip }: Props) {
  const year = yearLabel(match.year);
  return (
    <article className="card flex flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-5xl leading-none" aria-hidden>{match.avatarEmoji}</span>
          <div>
            <h2 className="text-lg font-bold">{match.alias}</h2>
            {year && <p className="muted text-sm">{year}</p>}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-[#e8f4ed] px-3 py-1 text-sm font-bold text-[#205942]" title="Match score">
          {match.score}% match
        </span>
      </div>

      {match.vibe && <p className="mt-4 italic text-slate-700">“{match.vibe}”</p>}

      {match.reasons.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-slate-700">
          {match.reasons.map((reason) => (
            <li key={reason} className="flex gap-2"><span className="text-[#2b765c]">✓</span>{reason}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {match.tags.slice(0, 5).map((tag) => (
          <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{tag}</span>
        ))}
      </div>

      <div className="mt-auto flex gap-2 pt-6">
        <button type="button" className="secondary-button flex-1" disabled={busy} onClick={onSkip} aria-label={`Skip ${match.alias}`}>
          Skip ✖
        </button>
        <button type="button" className="primary-button flex-1" disabled={busy} onClick={onConnect} aria-label={`Connect with ${match.alias}`}>
          Connect 💚
        </button>
      </div>
    </article>
  );
}
