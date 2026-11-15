"use client";

import { AVAILABILITY, LOOKING_FOR, SLIDERS, TAG_GROUPS, type ProfileInput } from "@campus/core";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Navigation } from "@/components/Navigation";

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

type Me = { alias: string; avatarEmoji: string; year: number | null };

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<ProfileInput>(initialProfile);
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/me").then((response) => response.json()),
      fetch("/api/profile").then((response) => response.json()),
    ]).then(([user, saved]) => {
      setMe(user);
      if (saved && !saved.error) setProfile({ ...initialProfile, ...saved });
    }).catch(() => setError("Could not load your profile."));
  }, []);

  function update<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function toggle(key: "tags" | "lookingFor" | "availability", value: string) {
    setProfile((current) => {
      const values = current[key];
      return {
        ...current,
        [key]: values.includes(value)
          ? values.filter((item) => item !== value)
          : [...values, value],
      };
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 3) {
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
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Please check your answers.");
      router.replace("/matches");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your profile");
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
          <p className="muted mt-2">{me ? `You are ${me.alias} ${me.avatarEmoji}` : "Your profile is private until you choose to connect."}</p>
          <div className="mt-7 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[#2b765c] transition-all" style={{ width: `${((step + 1) / 4) * 100}%` }} />
          </div>
          <form onSubmit={submit} className="mt-8">
            {step === 0 && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold">Vibe check</h2>
                {SLIDERS.map(([low, high], index) => (
                  <label key={low} className="block text-sm font-semibold">
                    <span>{low} <span className="font-normal text-slate-400">↔</span> {high}</span>
                    <input className="mt-3 w-full accent-[#2b765c]" type="range" min="1" max="5" value={profile.sliders[index]} onChange={(event) => update("sliders", profile.sliders.map((value, i) => i === index ? Number(event.target.value) : value))} />
                  </label>
                ))}
                <label className="block text-sm font-semibold">Year of study
                  <select className="field mt-2" value={profile.year} onChange={(event) => update("year", Number(event.target.value))}>
                    {[1, 2, 3, 4, 5, 6].map((year) => <option key={year} value={year}>{year <= 4 ? `${year}${["st", "nd", "rd", "th"][year - 1]} year` : "PG"}</option>)}
                  </select>
                </label>
              </div>
            )}
            {step === 1 && (
              <div>
                <h2 className="text-xl font-bold">What are you into?</h2>
                <p className="muted mt-1 text-sm">Choose 3–10 things that feel like you.</p>
                <div className="mt-5 space-y-5">
                  {Object.entries(TAG_GROUPS).map(([group, tags]) => (
                    <fieldset key={group}>
                      <legend className="mb-2 text-sm font-bold">{group}</legend>
                      <div className="flex flex-wrap gap-2">{tags.map((tag) => (
                        <button key={tag} type="button" className="chip text-sm" aria-pressed={profile.tags.includes(tag)} onClick={() => toggle("tags", tag)}>{tag}</button>
                      ))}</div>
                    </fieldset>
                  ))}
                </div>
                <p className="muted mt-4 text-sm">{profile.tags.length}/10 selected</p>
              </div>
            )}
            {step === 2 && (
              <div className="space-y-5">
                <h2 className="text-xl font-bold">Tell us more</h2>
                <label className="block text-sm font-semibold">A perfect weekend looks like…
                  <textarea className="field mt-2 min-h-24" minLength={10} maxLength={300} required value={profile.weekend} onChange={(event) => update("weekend", event.target.value)} placeholder="A slow morning, a good meal, and…" />
                </label>
                <label className="block text-sm font-semibold">I could talk for hours about…
                  <textarea className="field mt-2 min-h-20" minLength={5} maxLength={300} required value={profile.talkAbout} onChange={(event) => update("talkAbout", event.target.value)} placeholder="The tiny details in my favourite films…" />
                </label>
                <label className="block text-sm font-semibold">Unpopular opinion <span className="font-normal text-slate-400">(optional)</span>
                  <textarea className="field mt-2 min-h-16" maxLength={200} value={profile.unpopularOpinion ?? ""} onChange={(event) => update("unpopularOpinion", event.target.value)} />
                </label>
                <label className="block text-sm font-semibold">Current favourites <span className="font-normal text-slate-400">(optional)</span>
                  <input className="field mt-2" maxLength={200} value={profile.favorites ?? ""} onChange={(event) => update("favorites", event.target.value)} placeholder="Music, shows, games…" />
                </label>
              </div>
            )}
            {step === 3 && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold">What kind of connection?</h2>
                <fieldset>
                  <legend className="mb-2 text-sm font-bold">I’m looking for</legend>
                  <div className="flex flex-wrap gap-2">{LOOKING_FOR.map((item) => (
                    <button key={item} type="button" className="chip text-sm" aria-pressed={profile.lookingFor.includes(item)} onClick={() => toggle("lookingFor", item)}>{item}</button>
                  ))}</div>
                </fieldset>
                <label className="block text-sm font-semibold">I’m looking for someone to…
                  <textarea className="field mt-2 min-h-20" minLength={5} maxLength={300} required value={profile.lookingForText} onChange={(event) => update("lookingForText", event.target.value)} placeholder="Study with, hit the gym with, or just hang out…" />
                </label>
                <fieldset>
                  <legend className="mb-2 text-sm font-bold">Usually free</legend>
                  <div className="flex flex-wrap gap-2">{AVAILABILITY.map((item) => (
                    <button key={item} type="button" className="chip text-sm" aria-pressed={profile.availability.includes(item)} onClick={() => toggle("availability", item)}>{item}</button>
                  ))}</div>
                </fieldset>
              </div>
            )}
            {error && <p className="mt-5 text-sm text-red-700" role="alert">{error}</p>}
            <div className="mt-8 flex justify-between">
              <button type="button" className="secondary-button" disabled={step === 0 || busy} onClick={() => setStep((current) => current - 1)}>Back</button>
              <button className="primary-button" disabled={busy || (step === 1 && (profile.tags.length < 3 || profile.tags.length > 10)) || (step === 3 && (!profile.lookingFor.length || !profile.availability.length))}>
                {busy ? "Finding your people…" : step === 3 ? "Find my people ✨" : "Continue"}
              </button>
            </div>
          </form>
        </section>
      </main>
    </>
  );
}
