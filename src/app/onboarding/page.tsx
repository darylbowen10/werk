"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CharacterCreator from "@/components/CharacterCreator";
import { api } from "@/lib/client";
import { DEFAULT_AVATAR, sanitizeAvatar, type Avatar } from "@/shared/avatar";

const LOGO_COLORS = ["#f2c14e", "#4fc1b0", "#e8697d", "#6fa8ff", "#f7ecd5", "#7b5aa6"];
const LOGO_BGS = ["#262035", "#1f3b3a", "#3b1f2a", "#1f2a3b", "#2b2438", "#3a2a1a"];

export default function Onboarding() {
  const r = useRouter();
  const [step, setStep] = useState(0);
  const [avatar, setAvatar] = useState<Avatar>(DEFAULT_AVATAR);
  const [name, setName] = useState(""); const [company, setCompany] = useState("");
  const [logo, setLogo] = useState({ symbol: "HQ", color: LOGO_COLORS[0], bg: LOGO_BGS[0] });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("/api/me").then((m) => { setAvatar(sanitizeAvatar(m.user.avatar)); setName(m.user.name); setCompany(m.company.name); setLogo(m.company.logo); }).catch(() => r.push("/login")); }, [r]);
  const finish = async () => {
    setBusy(true);
    await api("/api/me", { method: "PUT", body: { name, avatar, companyName: company, logo, settings: { onboarded: true } } });
    r.push("/play");
  };
  return (
    <main className="min-h-screen p-6 flex items-center justify-center" style={{ background: "radial-gradient(circle at 50% 20%, #2b2140, #141019 70%)" }}>
      <div className="px-panel p-6 w-full max-w-3xl pop">
        <div className="flex items-center justify-between mb-4">
          <h1 className="pixel-title text-sm text-hq-gold">{step === 0 ? "CREATE YOUR CEO" : "BRAND YOUR HEADQUARTERS"}</h1>
          <span className="text-hq-mute">Step {step + 1} / 2</span>
        </div>
        {step === 0 ? (
          <>
            <label className="block mb-4"><span className="text-hq-mute">Character name</span><input className="px-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
            <CharacterCreator value={avatar} onChange={setAvatar} />
          </>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="block"><span className="text-hq-mute">Company name</span><input className="px-input" value={company} maxLength={60} onChange={(e) => setCompany(e.target.value)} /></label>
              <label className="block"><span className="text-hq-mute">Logo mark (1–3 characters)</span><input className="px-input" value={logo.symbol} maxLength={3} onChange={(e) => setLogo({ ...logo, symbol: e.target.value.toUpperCase() || "HQ" })} /></label>
              <div><span className="text-hq-mute">Logo color</span><div className="flex gap-2 mt-1">{LOGO_COLORS.map((c) => <button key={c} className="w-8 h-8 border-[3px]" style={{ background: c, borderColor: logo.color === c ? "#fff" : "#120e18" }} onClick={() => setLogo({ ...logo, color: c })} />)}</div></div>
              <div><span className="text-hq-mute">Sign background</span><div className="flex gap-2 mt-1">{LOGO_BGS.map((c) => <button key={c} className="w-8 h-8 border-[3px]" style={{ background: c, borderColor: logo.bg === c ? "#fff" : "#120e18" }} onClick={() => setLogo({ ...logo, bg: c })} />)}</div></div>
            </div>
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="w-48 h-24 flex items-center justify-center border-4 border-[#120e18]" style={{ background: logo.bg, boxShadow: "inset 0 0 0 3px #c79b52" }}>
                <span className="pixel-title text-3xl" style={{ color: logo.color }}>{logo.symbol}</span>
              </div>
              <p className="text-hq-mute text-center">Shown on your lobby sign and in your executive suite.</p>
              <p className="text-hq-cream text-center text-2xl">{company}</p>
            </div>
          </div>
        )}
        <div className="flex justify-between mt-6">
          <button className="px-btn" disabled={step === 0} onClick={() => setStep(0)}>BACK</button>
          {step === 0 ? <button className="px-btn px-btn-gold" disabled={!name.trim()} onClick={() => setStep(1)}>NEXT ▶</button>
            : <button className="px-btn px-btn-gold" disabled={busy || !company.trim()} onClick={finish}>{busy ? "..." : "ENTER THE OFFICE ▶"}</button>}
        </div>
      </div>
    </main>
  );
}
