"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import AvatarPreview from "./AvatarPreview";
import { CORE_PREVIEW } from "./corePreview";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const r = useRouter();
  const [f, setF] = useState({ email: "", password: "", name: "", companyName: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await api(`/api/auth/${mode}`, { body: mode === "login" ? { email: f.email, password: f.password } : f });
      r.push(mode === "signup" ? "/onboarding" : "/play");
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "radial-gradient(circle at 50% 30%, #2b2140, #141019 70%)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="pixel-title text-hq-gold text-2xl leading-relaxed">EXECUTIVE HQ</h1>
          <p className="text-hq-mute mt-2 text-xl">Your company. Your headquarters. Your AI leadership team.</p>
          <div className="flex justify-center gap-2 mt-4">{CORE_PREVIEW.map((a, i) => <AvatarPreview key={i} avatar={a} scale={3} walk />)}</div>
        </div>
        <form onSubmit={submit} className="px-panel p-6 space-y-3">
          <h2 className="pixel-title text-xs text-hq-cream mb-2">{mode === "login" ? "CLOCK IN" : "FOUND YOUR COMPANY"}</h2>
          {mode === "signup" && <>
            <label className="block"><span className="text-hq-mute">Your name</span><input className="px-input" required value={f.name} onChange={set("name")} /></label>
            <label className="block"><span className="text-hq-mute">Company name</span><input className="px-input" required value={f.companyName} onChange={set("companyName")} /></label>
          </>}
          <label className="block"><span className="text-hq-mute">Email</span><input className="px-input" type="email" required value={f.email} onChange={set("email")} /></label>
          <label className="block"><span className="text-hq-mute">Password {mode === "signup" && "(8+ characters)"}</span><input className="px-input" type="password" required minLength={mode === "signup" ? 8 : 1} value={f.password} onChange={set("password")} /></label>
          {err && <p className="text-hq-rose">{err}</p>}
          <button className="px-btn px-btn-gold w-full" disabled={busy}>{busy ? "..." : mode === "login" ? "ENTER HQ" : "CREATE HEADQUARTERS"}</button>
          <p className="text-center text-hq-mute">
            {mode === "login" ? <>New here? <Link className="text-hq-teal underline" href="/signup">Found a company</Link></> : <>Already have an HQ? <Link className="text-hq-teal underline" href="/login">Sign in</Link></>}
          </p>
        </form>
      </div>
    </main>
  );
}
