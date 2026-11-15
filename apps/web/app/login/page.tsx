"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not sign in");
      router.replace(result.onboarded ? "/matches" : "/onboarding");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell flex items-center justify-center">
      <section className="card w-full max-w-[430px] p-8 sm:p-10">
        <p className="mb-3 text-sm font-bold uppercase tracking-[.18em] text-[#2b765c]">CampusMatch</p>
        <h1 className="text-3xl font-bold tracking-tight">Find your people.</h1>
        <p className="muted mt-2">Good friends can start with one small hello.</p>
        <form className="mt-8 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-semibold">
            Campus email
            <input className="field mt-2" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@iiitr.ac.in" />
          </label>
          <label className="block text-sm font-semibold">
            Demo code
            <input className="field mt-2" inputMode="numeric" autoComplete="one-time-code" required value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="123456" />
          </label>
          <p className="muted text-xs">Demo code: 123456</p>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button className="primary-button w-full" disabled={busy}>{busy ? "Signing you in…" : "Continue"}</button>
        </form>
        <p className="muted mt-6 text-xs">Your email stays private. Your profile starts anonymous.</p>
      </section>
    </main>
  );
}
