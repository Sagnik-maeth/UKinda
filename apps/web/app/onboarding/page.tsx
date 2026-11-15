"use client";

// Client component: import only browser-safe subpaths, never the @campus/core barrel
// (it pulls in Prisma and the embedding model).
import { AVAILABILITY, LOOKING_FOR, SLIDERS, TAG_GROUPS } from "@campus/core/constants";
import type { ProfileInput } from "@campus/core/schemas";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { ChipPicker } from "@/components/ChipPicker";
import { Navigation } from "@/components/Navigation";
import { Slider } from "@/components/Slider";
import { StepShell } from "@/components/StepShell";

const initialProfile: ProfileInput = {
  year: 1,
  sliders: [3, 3, 3, 3, 3, 3],
  tags: [],
  lookingFor: [],
  availability: [],
  weekend: "",
  talkAbout: "",
  lookingForText: "",
  unpopularOpinion: "",
  favorites: "",
};

const STEPS = [
  { title: "Vibe check", hint: "No right answers. Just slide to where you usually land." },
  { title: "Interests", hint: "Pick 3–10 things that feel like you." },
  { title: "Tell us more", hint: "A sentence or two is plenty. This is what matching reads most." },
  { title: "Looking for", hint: "What kind of people do you want to meet?" },
] as const;

type Me = { alias: string; avatarEmoji: string; year: number | null };
type ListKey = "tags" | "lookingFor" | "availability";

/** Turns a saved Profile row (+ user year) back into form state. DB nulls become "" so zod accepts them. */
function fromSaved(saved: Record<string, unknown> | null, year: number | null): ProfileInput {
  const next = { ...initialProfile, year: year ?? initialProfile.year };
  if (!saved) return next;
  for (const key of Object.keys(initialProfile) as (keyof ProfileInput)[]) {
    const value = saved[key];
    if (value !== null && value !== undefined) (next as Record<string, unknown>)[key] = value;
  }
  return next;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<ProfileInput>(initialProfile);
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const [meRes, profileRes] = await Promise.all([fetch("/api/me"), fetch("/api/profile")]);
      if (meRes.status === 401) return router.replace("/login");
      const user: Me = await meRes.json();
      const saved = profileRes.ok ? await profileRes.json() : null;
      setMe(user);
      setProfile(fromSaved(saved, user.year));
    })().catch(() => setError("Couldn't load your profile. Refresh to try again."));
  }, [router]);

  function update<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function toggle(key: ListKey, value: string) {
    setProfile((current) => {
      const values = current[key] as string[];
      const next = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
      return { ...current, [key]: next };
    });
  }

  const stepValid =
    step === 1 ? profile.tags.length >= 3 && profile.tags.length <= 10
    : step === 3 ? profile.lookingFor.length > 0 && profile.availability.length > 0
    : true;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < STEPS.length - 1) {
      setStep((current) => current + 1);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (response.status === 401) return router.replace("/login");
      if (!response.ok) throw new Error();
      router.replace("/matches");
    } catch {
      // Form state is kept, so the user can just press the button again.
      setError("Couldn't save, try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <Navigation />
      <main className="page-shell">
        <section className="content-width card p-6 sm:p-10">
          <p className="text-sm font-bold uppercase tracking-widest text-[#2b765c]">Your profile</p>
          <h1 className="mt-2 text-3xl font-bold">A little more about you</h1>
          <p className="muted mt-2">
            {me ? <>You are <strong className="text-[var(--ink)]">{me.alias} {me.avatarEmoji}</strong>. Nobody sees your name or email.</> : "Your profile stays anonymous until you choose to connect."}
          </p>

          <form onSubmit={submit} className="mt-8">
            <StepShell step={step} total={STEPS.length} title={STEPS[step].title} hint={STEPS[step].hint}>
              {step === 0 && (
                <div className="space-y-6">
                  {SLIDERS.map(([low, high], index) => (
                    <Slider
                      key={low}
                      low={low}
                      high={high}
                      value={profile.sliders[index]}
                      onChange={(value) => update("sliders", profile.sliders.map((old, i) => (i === index ? value : old)))}
                    />
                  ))}
                  <label className="block text-sm font-semibold">Year of study
                    <select className="field mt-2" value={profile.year} onChange={(event) => update("year", Number(event.target.value))}>
                      {[1, 2, 3, 4, 5, 6].map((year) => (
                        <option key={year} value={year}>{year <= 4 ? `${year}${["st", "nd", "rd", "th"][year - 1]} year` : year === 5 ? "5th year / Dual" : "PG"}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-5">
                  {Object.entries(TAG_GROUPS).map(([group, tags]) => (
                    <ChipPicker key={group} label={group} options={tags} selected={profile.tags} onToggle={(tag) => toggle("tags", tag)} max={10} />
                  ))}
                  <p className={`text-sm ${stepValid ? "muted" : "text-amber-700"}`}>{profile.tags.length}/10 selected{profile.tags.length < 3 ? ` (pick ${3 - profile.tags.length} more)` : ""}</p>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <label className="block text-sm font-semibold">A perfect weekend looks like…
                    <textarea className="field mt-2 min-h-24" minLength={10} maxLength={300} required value={profile.weekend} onChange={(event) => update("weekend", event.target.value)} placeholder="Gaming marathon till 3am, then biryani with the squad" />
                  </label>
                  <label className="block text-sm font-semibold">I could talk for hours about…
                    <textarea className="field mt-2 min-h-20" minLength={5} maxLength={300} required value={profile.talkAbout} onChange={(event) => update("talkAbout", event.target.value)} placeholder="One Piece theories, or why tabs beat spaces" />
                  </label>
                  <label className="block text-sm font-semibold">Unpopular opinion <span className="font-normal text-slate-400">(optional)</span>
                    <textarea className="field mt-2 min-h-16" maxLength={200} value={profile.unpopularOpinion ?? ""} onChange={(event) => update("unpopularOpinion", event.target.value)} placeholder="Mess food on Sundays is actually good" />
                  </label>
                  <label className="block text-sm font-semibold">Current favourites <span className="font-normal text-slate-400">(optional)</span>
                    <input className="field mt-2" maxLength={200} value={profile.favorites ?? ""} onChange={(event) => update("favorites", event.target.value)} placeholder="Interstellar, Arijit Singh, Valorant" />
                  </label>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <ChipPicker label="I'm looking for" options={LOOKING_FOR} selected={profile.lookingFor} onToggle={(item) => toggle("lookingFor", item)} />
                  <label className="block text-sm font-semibold">In your own words…
                    <textarea className="field mt-2 min-h-20" minLength={5} maxLength={300} required value={profile.lookingForText} onChange={(event) => update("lookingForText", event.target.value)} placeholder="Someone to grind DSA with before placements, and grab chai after" />
                  </label>
                  <ChipPicker label="Usually free" options={AVAILABILITY} selected={profile.availability} onToggle={(item) => toggle("availability", item)} />
                </div>
              )}
            </StepShell>

            {error && <p className="mt-5 text-sm text-red-700" role="alert">{error}</p>}
            <div className="mt-8 flex justify-between">
              <Button type="button" variant="secondary" disabled={step === 0 || busy} onClick={() => setStep((current) => current - 1)}>Back</Button>
              <Button disabled={busy || !stepValid}>{step === STEPS.length - 1 ? "Find my people ✨" : "Continue"}</Button>
            </div>
          </form>
        </section>
      </main>

      {busy && (
        <div className="fixed inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-white/85 backdrop-blur-sm" role="status" aria-live="polite">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#cfe6da] border-t-[#2b765c]" />
          <p className="text-lg font-semibold">Finding your people… ✨</p>
        </div>
      )}
    </>
  );
}
