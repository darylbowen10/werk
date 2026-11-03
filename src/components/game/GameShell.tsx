"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { bus } from "@/game/bus";
import GameCanvas from "./GameCanvas";
import Dialogue from "./Dialogue";
import Desk from "./Desk";
import { BriefingGreeting, BriefingPanel, WalkTalk, type BriefingRow } from "./Briefing";
import { ApprovalModal, DecorPanel, EodModal, HelpModal, HireModal, InboxModal, MeetingRoom, MeetingSetup, ReportModal, SettingsModal } from "./Panels";
import { Badge, Portrait } from "./ui";
import type { Ctx, Modal, World } from "./types";

type Toast = { id: number; title: string; body?: string; tone?: string; link?: { type: string; id: string } };
const PRIORITY_RANK: Record<string, number> = { low: 0, normal: 1, high: 2, critical: 3 };
const THRESHOLD: Record<string, number> = { all: 1, important: 2, critical: 3, none: 99 };

export default function GameShell() {
  const router = useRouter();
  const [world, setWorld] = useState<World | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [room, setRoom] = useState({ key: "lobby", name: "Lobby" });
  const [banner, setBanner] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<BriefingRow | null>(null);
  const [eaId, setEaId] = useState<string | null>(null);
  const [greeting, setGreeting] = useState(false);
  const [greetPending, setGreetPending] = useState(false);
  const [walk, setWalk] = useState(false);
  const [autoWalking, setAutoWalking] = useState(false);
  const [approach, setApproach] = useState<{ agentId: string; title: string } | null>(null);
  const [decor, setDecor] = useState(false);
  const [meeting, setMeeting] = useState<{ id: string; ids: string[] } | null>(null);
  const [clock, setClock] = useState("");
  const lastApproach = useRef(0);
  const seenNotif = useRef<string>(new Date().toISOString());
  const stateRef = useRef({ modal, greeting, walk, world, eaId, greetPending, meeting });
  stateRef.current = { modal, greeting, walk, world, eaId, greetPending, meeting };

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((l) => [...l.slice(-4), { ...t, id }]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), 7000);
  }, []);

  const refreshWorld = useCallback(async () => {
    const w = await api<World>("/api/world");
    setWorld(w);
    bus.emit("agents:sync", w.agents);
  }, []);

  const open = useCallback((m: Modal) => setModal(m), []);
  const close = useCallback(() => {
    const prev = stateRef.current.modal;
    setModal(null);
    if (prev?.t === "briefing" && stateRef.current.eaId && !stateRef.current.walk) bus.emit("npc:return", stateRef.current.eaId);
    if (prev?.t === "eod" && stateRef.current.eaId) bus.emit("npc:return", stateRef.current.eaId);
  }, []);

  const ctx: Ctx | null = useMemo(() => (world ? { world, open, close, toast, refreshWorld, agentById: (id) => world.agents.find((a) => a.id === id) } : null), [world, open, close, toast, refreshWorld]);

  // ---- initial load
  useEffect(() => {
    api<World>("/api/world").then((w) => {
      if ((w.company.settings as any)?.onboarded === false) { router.push("/onboarding"); return; }
      setWorld(w);
    }).catch(() => router.push("/login"));
    const q = new URLSearchParams(window.location.search);
    if (q.get("integration")) { toast({ title: q.get("connected") ? `${q.get("integration")} connected` : `${q.get("integration")} connection failed`, body: q.get("error") ?? undefined, tone: q.get("connected") ? "good" : "bad" }); window.history.replaceState(null, "", "/play"); }
    const iv = setInterval(() => setClock(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })), 1000);
    return () => clearInterval(iv);
  }, [router, toast]);

  // ---- lock movement while a blocking UI is open
  useEffect(() => { bus.emit("controls:lock", Boolean(modal && modal.t !== "inbox") || greeting || autoWalking || Boolean(meeting)); }, [modal, greeting, autoWalking, meeting]);

  // ---- arrival: morning briefing
  const startArrival = useCallback(async () => {
    try {
      const r = await api("/api/briefing/today");
      setBriefing(r.briefing); setEaId(r.eaId);
      if (r.show && r.eaId) {
        setGreetPending(true);
        setTimeout(() => bus.emit("npc:approach", { agentId: r.eaId, reason: "briefing" }), 1200);
      }
    } catch (e) { console.error(e); }
  }, []);

  // ---- bus wiring
  useEffect(() => {
    const offs = [
      bus.on("scene:ready", () => startArrival()),
      bus.on("room", (r: { key: string; name: string }) => { setRoom(r); setBanner(r.name); setTimeout(() => setBanner((b) => (b === r.name ? null : b)), 2200); }),
      bus.on("npc:arrived", ({ agentId, reason }: { agentId: string; reason?: string }) => {
        const s = stateRef.current;
        if (reason === "briefing" && s.greetPending) { if (!s.modal) setGreeting(true); return; }
        if (reason === "eod") return;
        if (reason) {
          const a = s.world?.agents.find((x) => x.id === agentId);
          api(`/api/notifications`).then((r) => { const n = r.notifications.find((x: any) => x.id === reason); setApproach({ agentId, title: n?.title ?? `${a?.title} wants a word` }); });
          bus.emit("bubble", { agentId, text: "Got a minute? Press E.", ms: 8000 });
          api(`/api/notifications/${reason}`, { body: {} }).catch(() => {});
        }
      }),
      bus.on("npc:left", ({ agentId }: { agentId: string }) => setApproach((a) => (a?.agentId === agentId ? null : a))),
      bus.on("meet:office:arrived", () => { setAutoWalking(false); setModal({ t: "briefing", view: "full" }); }),
      bus.on("interact", (e: { kind: string; agentId?: string; id?: string }) => {
        const s = stateRef.current;
        if (e.kind === "npc" && e.agentId) {
          if (e.agentId === s.eaId && s.greetPending) { setGreeting(true); return; }
          setApproach((a) => (a?.agentId === e.agentId ? null : a));
          setModal({ t: "dialogue", agentId: e.agentId });
          return;
        }
        const id = e.id ?? "";
        if (id === "ceo_desk") setModal({ t: "desk", tab: "overview" });
        else if (id === "ceo_display") setModal({ t: "desk", tab: "overview" });
        else if (id === "station:cfo") setModal({ t: "desk", tab: "finance" });
        else if (id === "station:coo") setModal({ t: "desk", tab: "operations" });
        else if (id === "station:cmo" || id === "station:cro") setModal({ t: "desk", tab: "sales" });
        else if (id === "station:cto") setModal({ t: "desk", tab: "settings" });
        else if (id === "station:hr") setModal({ t: "desk", tab: "workforce" });
        else if (id === "station:ea") setModal({ t: "briefing", view: "full" });
        else if (id === "conference") setModal({ t: "meetingSetup" });
        else if (id === "inbox" || id === "reception") setModal({ t: "inbox" });
        else if (id.startsWith("hire:")) setModal({ t: "hire", office: id.slice(5) });
        else if (id === "coffee") toast({ title: "☕ Fresh coffee", body: "Focus restored. The break room smells great.", tone: "good" });
        else if (id === "exit") {
          if ((s.world?.company.settings as any)?.endOfDayRecap !== false) { setModal({ t: "eod" }); if (s.eaId && !s.walk) bus.emit("npc:approach", { agentId: s.eaId, reason: "eod" }); }
          else if (confirm("Clock out for the day?")) logout();
        }
      }),
    ];
    return () => offs.forEach((o) => o());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startArrival, toast]);

  // ---- realtime events (SSE)
  useEffect(() => {
    if (!world) return;
    const es = new EventSource("/api/events");
    let pending: ReturnType<typeof setTimeout> | null = null;
    const pullNotifications = async () => {
      const r = await api(`/api/notifications?since=${encodeURIComponent(seenNotif.current)}`).catch(() => null);
      if (!r) return;
      setWorld((w) => (w ? { ...w, unread: r.unread } : w));
      const fresh = [...r.notifications].reverse();
      if (fresh.length) seenNotif.current = fresh.at(-1).createdAt;
      const s = stateRef.current;
      const level = THRESHOLD[(s.world?.company.settings as any)?.interruptionLevel ?? "important"] ?? 2;
      for (const n of fresh) {
        toast({ title: n.title, body: n.body, tone: n.kind === "alert" ? "warn" : n.kind === "task_complete" ? "good" : "info", link: n.link ?? undefined });
        const busy = s.modal || s.greeting || s.meeting || s.greetPending;
        if (n.agentId && n.agentId !== s.eaId && !n.approached && PRIORITY_RANK[n.priority] >= level && !busy && Date.now() - lastApproach.current > 90_000) {
          lastApproach.current = Date.now();
          bus.emit("npc:approach", { agentId: n.agentId, reason: n.id });
        }
      }
    };
    es.addEventListener("hq", (ev) => {
      const e = JSON.parse((ev as MessageEvent).data);
      if (e.type === "agent" && e.id !== "*") { bus.emit("agent:status", e); setWorld((w) => (w ? { ...w, agents: w.agents.map((a) => (a.id === e.id ? { ...a, status: e.status, statusNote: e.note ?? "" } : a)) } : w)); }
      if (e.type === "agent" && e.id === "*") refreshWorld();
      if (e.type === "notification" || e.type === "approval") { if (pending) clearTimeout(pending); pending = setTimeout(pullNotifications, 400); }
      if (e.type === "approval") api("/api/approvals?status=pending").then((r) => setWorld((w) => (w ? { ...w, approvals: r.approvals.length } : w)));
    });
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world?.company.id]);

  const markBriefing = async (status: string) => { if (briefing) await api(`/api/briefing/${briefing.id}`, { body: { status } }).catch(() => {}); };
  const choose = async (c: "full" | "urgent" | "walk" | "office" | "later" | "disable") => {
    setGreeting(false); setGreetPending(false);
    if (eaId) bus.emit("bubble:clear", eaId);
    if (c === "full" || c === "urgent") { await markBriefing("delivered"); setModal({ t: "briefing", view: c }); }
    if (c === "walk") { await markBriefing("delivered"); setWalk(true); if (eaId) bus.emit("npc:follow", { agentId: eaId, on: true }); toast({ title: "Walk & talk", body: "Your assistant will follow you. Ask questions or give instructions any time." }); }
    if (c === "office") { await markBriefing("delivered"); setAutoWalking(true); if (eaId) bus.emit("meet:office", { agentId: eaId }); }
    if (c === "later") { await markBriefing("later"); if (eaId) bus.emit("npc:return", eaId); toast({ title: "Briefing saved to your inbox" }); }
    if (c === "disable") { await markBriefing("dismissed"); await api("/api/me", { method: "PUT", body: { settings: { autoBriefing: false } } }); await refreshWorld(); if (eaId) bus.emit("npc:return", eaId); toast({ title: "Automatic briefings turned off", body: "Re-enable any time in Company Settings. Your briefing is still at the EA's briefing station." }); }
  };
  const endWalk = () => { setWalk(false); if (eaId) bus.emit("npc:follow", { agentId: eaId, on: false }); };
  const logout = async () => { await api("/api/auth/logout", { body: {} }).catch(() => {}); router.push("/login"); };

  const reloadBriefing = useCallback(async (id?: string) => {
    if (id) { const r = await api(`/api/briefing/${id}`); setBriefing(r.briefing); return; }
    const r = await api("/api/briefing/today?refresh=1"); setBriefing(r.briefing);
  }, []);
  useEffect(() => { if (modal?.t === "briefing" && modal.id && modal.id !== briefing?.id) reloadBriefing(modal.id); }, [modal, briefing?.id, reloadBriefing]);

  if (!world || !ctx) return <div className="h-screen flex items-center justify-center pixel-title text-hq-gold text-xs">LOADING HEADQUARTERS…</div>;

  return (
    <div className="fixed inset-0 overflow-hidden select-none">
      <GameCanvas init={{ user: world.user, company: world.company, agents: world.agents, furniture: world.furniture }} />

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center gap-2 px-3 py-2 pointer-events-none">
        <div className="px-panel flex items-center gap-2 px-2 py-1 pointer-events-auto">
          <div className="w-8 h-8 flex items-center justify-center border-2 border-[#120e18] pixel-title text-[9px]" style={{ background: world.company.logo.bg, color: world.company.logo.color }}>{world.company.logo.symbol}</div>
          <div className="leading-5"><div className="pixel-title text-[9px] text-hq-gold">{world.company.name}</div><div className="text-hq-mute">{room.name}</div></div>
        </div>
        <div className="px-panel px-3 py-1 pixel-title text-[10px] text-hq-cream">{clock}</div>
        <span className="flex-1" />
        <div className="px-panel flex items-center gap-1.5 px-2 py-1 pointer-events-auto">
          {world.ai === "offline" ? <span title="No ANTHROPIC_API_KEY configured: agents run in deterministic offline simulation mode."><Badge tone="rose">OFFLINE SIM</Badge></span> : <Badge tone="teal">CLAUDE</Badge>}
          {room.key === "ceo" && !decor && <button className="px-btn !text-[8px]" onClick={() => setDecor(true)} data-testid="decorate">🛋 DECORATE</button>}
          {eaId && !walk && !greetPending && <button className="px-btn !text-[8px]" title="Ask your assistant to walk with you" onClick={() => { setWalk(true); bus.emit("npc:follow", { agentId: eaId, on: true }); }}>🚶 CALL ASSISTANT</button>}
          <button className="px-btn !text-[8px] relative" onClick={() => setModal({ t: "inbox" })} data-testid="inbox-btn">📬 {world.unread > 0 && <span className="ml-1 text-hq-gold">{world.unread}</span>}</button>
          <button className="px-btn !text-[8px]" onClick={() => setModal({ t: "desk", tab: "approvals" })} title="Approvals">🔐 {world.approvals > 0 && <span className="text-hq-gold">{world.approvals}</span>}</button>
          <button className="px-btn !text-[8px]" onClick={() => setModal({ t: "help" })}>?</button>
          <button className="px-btn !text-[8px]" onClick={() => setModal({ t: "settings" })}>⚙</button>
        </div>
      </div>

      {/* Room banner */}
      {banner && <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 px-panel px-4 py-1 pixel-title text-[11px] text-hq-gold pop pointer-events-none">{banner}</div>}

      {/* Minimap frame (the map itself is a Phaser camera) */}
      <div className="absolute z-10 pointer-events-none border-[3px] border-[#120e18] rounded" style={{ right: 9, bottom: 9, width: 206, height: Math.round((200 * 43) / 58) + 6, boxShadow: "inset 0 0 0 2px #4a3f63" }} />

      {/* Controls hint */}
      <div className="absolute left-3 bottom-3 z-10 text-hq-mute text-base pointer-events-none hidden md:block" style={{ display: walk ? "none" : undefined }}>WASD/Arrows move · E interact · Shift hurry</div>

      {/* Agent approached */}
      {approach && !modal && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-30 px-panel px-3 py-2 flex items-center gap-2 pop">
          <Portrait agent={ctx.agentById(approach.agentId)} size={2} />
          <div><b className="text-hq-gold">{ctx.agentById(approach.agentId)?.name}</b> came to see you: {approach.title}<div className="text-hq-mute">Press E to talk</div></div>
          <button className="px-btn !text-[8px]" onClick={() => { bus.emit("npc:return", approach.agentId); setApproach(null); }}>NOT NOW</button>
        </div>
      )}

      {/* Toasts */}
      <div className="absolute right-3 top-16 z-50 space-y-2 w-[min(340px,calc(100vw-24px))]">
        {toasts.map((t) => (
          <div key={t.id} className={`px-panel p-2 pop cursor-pointer ${t.tone === "good" ? "!bg-[#1f3b3a]" : t.tone === "warn" ? "!bg-[#3b331f]" : t.tone === "bad" ? "!bg-[#3b1f2a]" : ""}`} data-testid="toast"
            onClick={() => { setToasts((l) => l.filter((x) => x.id !== t.id)); if (t.link?.type === "report") setModal({ t: "report", id: t.link.id }); else if (t.link?.type === "approval") setModal({ t: "approval", id: t.link.id }); else if (t.link?.type === "briefing") setModal({ t: "briefing", view: "full", id: t.link.id }); }}>
            <div className="text-hq-gold leading-5">{t.title}</div>{t.body && <div className="text-base leading-5 text-hq-cream/90 line-clamp-3">{t.body}</div>}
            {t.link && <div className="text-hq-teal text-base">▸ click to open</div>}
          </div>
        ))}
      </div>

      {greeting && briefing && eaId && <BriefingGreeting ctx={ctx} briefing={briefing} eaId={eaId} onChoose={choose} />}
      {walk && eaId && !modal && <WalkTalk ctx={ctx} eaId={eaId} briefing={briefing} onEnd={endWalk} />}
      {decor && <DecorPanel ctx={ctx} original={world.furniture} onDone={() => setDecor(false)} />}
      {autoWalking && <div className="absolute top-28 left-1/2 -translate-x-1/2 z-20 px-panel px-3 py-1 text-hq-gold">Heading to your office…</div>}

      {modal?.t === "dialogue" && <Dialogue key={modal.agentId} ctx={ctx} agentId={modal.agentId} />}
      {modal?.t === "desk" && <Desk ctx={ctx} tab={modal.tab} />}
      {modal?.t === "report" && <ReportModal ctx={ctx} id={modal.id} />}
      {modal?.t === "approval" && <ApprovalModal ctx={ctx} id={modal.id} />}
      {modal?.t === "inbox" && <InboxModal ctx={ctx} />}
      {modal?.t === "hire" && <HireModal ctx={ctx} office={modal.office} />}
      {modal?.t === "settings" && <SettingsModal ctx={ctx} onLogout={logout} />}
      {modal?.t === "help" && <HelpModal ctx={ctx} />}
      {modal?.t === "eod" && <EodModal ctx={ctx} eaId={eaId} onLogout={logout} />}
      {modal?.t === "meetingSetup" && <MeetingSetup ctx={ctx} onStart={(id, ids) => { setMeeting({ id, ids }); setModal(null); bus.emit("meeting:gather", ids); }} />}
      {meeting && !modal && <MeetingRoom ctx={ctx} id={meeting.id} onEnd={(reportId) => { bus.emit("meeting:disperse", meeting.ids); setMeeting(null); if (reportId) setModal({ t: "report", id: reportId }); }} />}
      {modal?.t === "briefing" && briefing && <BriefingPanel key={briefing.id + modal.view} ctx={ctx} briefing={briefing} view={modal.view} eaId={eaId} onRefresh={() => reloadBriefing(briefing.id)} />}
    </div>
  );
}
