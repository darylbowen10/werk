"use client";
import { useEffect } from "react";
import AvatarPreview from "../AvatarPreview";
import type { WorldAgent } from "@/game/bus";

export function ModalFrame({ title, onClose, children, wide = false, full = false, side = false }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean; full?: boolean; side?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const pos = full ? "inset-3 md:inset-6" : side ? "right-3 top-16 bottom-3 w-[min(520px,calc(100vw-24px))]" : `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(${wide ? "900px" : "620px"},calc(100vw-24px))] max-h-[calc(100vh-40px)]`;
  return (
    <div className={`fixed z-40 inset-0 ${side ? "pointer-events-none" : "bg-black/40"}`} onMouseDown={side ? undefined : (e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`absolute ${pos} px-panel flex flex-col pop pointer-events-auto`} style={!full && !side ? { width: `min(${wide ? 900 : 620}px, calc(100vw - 24px))` } : undefined} role="dialog">
        <div className="flex items-center justify-between px-4 py-2 border-b-[3px] border-[#120e18]">
          <div className="pixel-title text-[11px] text-hq-gold truncate">{title}</div>
          <button className="px-btn !px-2 !py-1" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="overflow-auto scroll-thin flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}

export function Portrait({ agent, size = 3 }: { agent?: Pick<WorldAgent, "avatar"> | null; size?: number }) {
  return (
    <div className="px-panel-light flex items-end justify-center overflow-hidden shrink-0" style={{ width: 16 * size + 16, height: 18 * size + 12, background: "#e9dcc2" }}>
      {agent && <AvatarPreview avatar={agent.avatar} scale={size} />}
    </div>
  );
}

export function Badge({ children, tone = "mute" }: { children: React.ReactNode; tone?: "mute" | "gold" | "teal" | "rose" | "sky" }) {
  const c = { mute: "#4a3f63", gold: "#f2c14e", teal: "#2f8f80", rose: "#b84a5c", sky: "#3f6fb8" }[tone];
  return <span className="inline-block px-1.5 py-0 text-[15px] leading-5 rounded" style={{ background: c, color: tone === "gold" ? "#1b1726" : "#f7ecd5" }}>{children}</span>;
}

export function DemoBadge({ source }: { source?: string | null }) {
  if (!source) return null;
  const demo = source.split("+").includes("demo");
  return <Badge tone={demo ? "rose" : "teal"}>{demo ? "DEMO DATA" : `LIVE: ${source}`}</Badge>;
}

export const statusTone = (s: string): "mute" | "gold" | "teal" | "rose" | "sky" => ({ queued: "mute", working: "sky", awaiting_approval: "gold", complete: "teal", failed: "rose", cancelled: "mute", pending: "gold", approved: "teal", rejected: "rose", postponed: "mute", delegated: "sky" } as const)[s as "queued"] ?? "mute";
