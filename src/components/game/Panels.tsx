"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import { ago, api, time } from "@/lib/client";
import { bus } from "@/game/bus";
import { Badge, ModalFrame, Portrait, statusTone } from "./ui";
import { ReportView } from "./Desk";
import CharacterCreator from "../CharacterCreator";
import { DEFAULT_AVATAR, sanitizeAvatar, type Avatar } from "@/shared/avatar";
import { FURNITURE, furnitureDef } from "@/shared/furniture";
import { drawProp } from "@/game/textures";
import { ROOMS } from "@/shared/map";
import type { Ctx } from "./types";

export function ReportModal({ ctx, id }: { ctx: Ctx; id: string }) {
  return <ModalFrame wide title="📑 REPORT" onClose={ctx.close}><div className="p-4"><ReportView id={id} ctx={ctx} /></div></ModalFrame>;
}

export function ApprovalModal({ ctx, id }: { ctx: Ctx; id: string }) {
  const [d, setD] = useState<any>(null);
  const [note, setNote] = useState(""); const [delegate, setDelegate] = useState("coo"); const [busy, setBusy] = useState(false);
  useEffect(() => { api(`/api/approvals/${id}`).then(setD); }, [id]);
  const decide = async (decision: string) => {
    setBusy(true);
    try { await api(`/api/approvals/${id}`, { body: { decision, note: note || undefined, delegateTo: decision === "delegated" ? delegate : undefined } }); ctx.toast({ title: `Request ${decision}`, body: d.approval.summary, tone: decision === "approved" ? "good" : "warn" }); ctx.close(); ctx.refreshWorld(); }
    catch (e) { ctx.toast({ title: "Couldn't record decision", body: (e as Error).message, tone: "bad" }); setBusy(false); }
  };
  if (!d) return null;
  const a = d.approval; const open = ["pending", "postponed"].includes(a.status);
  return (
    <ModalFrame title="🔐 APPROVAL REQUEST" onClose={ctx.close}>
      <div className="p-4 ui-font text-sm space-y-2" data-testid="approval-modal">
        <div className="flex items-center gap-2"><b className="text-base flex-1">{a.summary}</b><Badge tone={statusTone(a.status)}>{a.status}</Badge></div>
        <p className="text-hq-mute">Requested by {d.agent?.name}, {d.agent?.title} · {ago(a.createdAt)} · action <code>{a.action}</code> · risk {a.risk}</p>
        <pre className="bg-[#1b1726] rounded p-2 whitespace-pre-wrap text-xs max-h-60 overflow-auto scroll-thin">{a.details}</pre>
        <p className="text-xs text-hq-mute">Approving lets Executive HQ carry out the action only through connected, authorised integrations. Actions without a connected integration are recorded (e.g. saved as a draft) — never silently claimed as done.</p>
        {a.executionLog && <p className="bg-[#1f3b3a] rounded p-2">Execution: {a.executionLog}</p>}
        {open && <>
          <input className="px-input" placeholder="Optional note to the agent" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2 flex-wrap items-center">
            <button className="px-btn px-btn-teal" disabled={busy} onClick={() => decide("approved")}>APPROVE</button>
            <button className="px-btn px-btn-rose" disabled={busy} onClick={() => decide("rejected")}>REJECT</button>
            <button className="px-btn" disabled={busy} onClick={() => decide("postponed")}>POSTPONE</button>
            <select className="px-input !w-auto" value={delegate} onChange={(e) => setDelegate(e.target.value)}>{ctx.world.agents.map((x) => <option key={x.id} value={x.key}>{x.title}</option>)}</select>
            <button className="px-btn" disabled={busy} onClick={() => decide("delegated")}>DELEGATE</button>
          </div>
        </>}
      </div>
    </ModalFrame>
  );
}

export function InboxModal({ ctx }: { ctx: Ctx }) {
  const [n, setN] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  useEffect(() => { api("/api/notifications").then((r) => setN(r.notifications)); }, []);
  const openLink = async (x: any) => {
    await api("/api/notifications/read", { body: { ids: [x.id] } }); ctx.refreshWorld();
    if (x.link?.type === "report") ctx.open({ t: "report", id: x.link.id });
    else if (x.link?.type === "approval") ctx.open({ t: "approval", id: x.link.id });
    else if (x.link?.type === "briefing") ctx.open({ t: "briefing", view: "full", id: x.link.id });
    else if (x.link?.type === "task") ctx.open({ t: "desk", tab: "tasks" });
  };
  const readAll = async () => { await api("/api/notifications/read", { body: { all: true } }); setN((l) => l.map((x) => ({ ...x, read: true }))); ctx.refreshWorld(); };
  const list = n.filter((x) => filter === "all" || (filter === "unread" ? !x.read : x.kind === filter));
  return (
    <ModalFrame side title="📬 INBOX" onClose={ctx.close}>
      <div className="p-3 ui-font text-sm" data-testid="inbox">
        <div className="flex gap-1 flex-wrap mb-2">{["all", "unread", "task_complete", "approval", "alert", "briefing", "idea"].map((f) => <button key={f} className={`px-btn !text-[7px] !px-2 ${filter === f ? "px-btn-gold" : ""}`} onClick={() => setFilter(f)}>{f.replace("_", " ")}</button>)}<span className="flex-1" /><button className="px-btn !text-[7px]" onClick={readAll}>MARK ALL READ</button></div>
        <ul className="space-y-1.5">{list.map((x) => (
          <li key={x.id} className={`rounded p-2 cursor-pointer border ${x.read ? "border-[#2b2438] bg-[#1e1829]" : "border-hq-gold/50 bg-[#2a2238]"}`} onClick={() => openLink(x)}>
            <div className="flex items-center gap-2"><Badge tone={x.priority === "critical" || x.priority === "high" ? "rose" : x.kind === "task_complete" ? "teal" : "mute"}>{x.priority}</Badge><b className="flex-1">{x.title}</b><span className="text-xs text-hq-mute">{ago(x.createdAt)}</span></div>
            <p className="text-hq-mute mt-0.5 line-clamp-2">{x.body}</p>
          </li>))}</ul>
        {!list.length && <p className="text-hq-mute">Nothing here.</p>}
      </div>
    </ModalFrame>
  );
}

export function MeetingSetup({ ctx, onStart }: { ctx: Ctx; onStart: (id: string, ids: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(ctx.world.agents.filter((a) => ["cfo", "coo", "cro"].includes(a.key)).map((a) => a.id));
  const [topic, setTopic] = useState("Next quarter's growth strategy");
  const [busy, setBusy] = useState(false);
  const start = async () => { setBusy(true); try { const r = await api("/api/meetings", { body: { agentIds: sel, topic } }); onStart(r.meeting.id, sel); } catch (e) { ctx.toast({ title: "Couldn't start meeting", body: (e as Error).message, tone: "bad" }); setBusy(false); } };
  return (
    <ModalFrame title="📅 CALL A MEETING" onClose={ctx.close}>
      <div className="p-4 space-y-3">
        <label className="block"><span className="text-hq-mute">Topic</span><input className="px-input" value={topic} onChange={(e) => setTopic(e.target.value)} /></label>
        <div className="text-hq-mute">Who should attend?</div>
        <div className="grid grid-cols-2 gap-2">{ctx.world.agents.map((a) => (
          <label key={a.id} className={`flex items-center gap-2 p-2 rounded cursor-pointer border-2 ${sel.includes(a.id) ? "border-hq-gold bg-[#30283f]" : "border-transparent bg-[#1b1726]"}`}>
            <input type="checkbox" checked={sel.includes(a.id)} onChange={(e) => setSel(e.target.checked ? [...sel, a.id] : sel.filter((x) => x !== a.id))} />
            <Portrait agent={a} size={2} /><span>{a.name}<br /><span className="text-hq-mute text-base">{a.title}</span></span>
          </label>))}</div>
        <button className="px-btn px-btn-gold w-full" disabled={busy || !sel.length || topic.length < 3} onClick={start}>BRING THEM TO THE CONFERENCE ROOM</button>
      </div>
    </ModalFrame>
  );
}

export function MeetingRoom({ ctx, id, onEnd }: { ctx: Ctx; id: string; onEnd: (reportId?: string) => void }) {
  const [d, setD] = useState<any>(null);
  const [text, setText] = useState(""); const [ending, setEnding] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const seen = useRef(0);
  const endRef = useRef(onEnd); endRef.current = onEnd;
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const r = await api(`/api/meetings/${id}`).catch(() => null);
      if (!alive || !r) return;
      setD(r);
      const fresh = r.messages.slice(seen.current);
      seen.current = r.messages.length;
      fresh.filter((m: any) => m.role === "agent").forEach((m: any) => bus.emit("bubble", { agentId: m.agentId, text: m.content, ms: 7000 }));
      if (r.meeting.notesReportId) { alive = false; endRef.current(r.meeting.notesReportId); }
    };
    tick(); const iv = setInterval(tick, 1800);
    return () => { alive = false; clearInterval(iv); };
  }, [id]);
  useEffect(() => { box.current?.scrollTo(0, 1e9); }, [d?.messages.length]);
  const say = async (e: React.FormEvent) => { e.preventDefault(); if (!text.trim()) return; const t = text; setText(""); await api(`/api/meetings/${id}/message`, { body: { text: t } }); };
  const end = async () => { setEnding(true); await api(`/api/meetings/${id}/end`, { body: {} }); };
  return (
    <ModalFrame side title={`🗣 MEETING · ${d?.meeting.topic ?? ""}`} onClose={() => (ending ? null : end())}>
      <div className="p-3 flex flex-col h-full ui-font text-sm" data-testid="meeting">
        <div ref={box} className="flex-1 overflow-auto scroll-thin space-y-2 mb-2">
          {d?.messages.map((m: any) => { const a = ctx.agentById(m.agentId); return (
            <div key={m.id} className="flex gap-2">{m.role === "ceo" ? <div className="w-10 text-center text-hq-gold font-bold">You</div> : <Portrait agent={a} size={2} />}
              <div className="flex-1"><b className={m.role === "ceo" ? "text-hq-gold" : "text-hq-teal"}>{m.role === "ceo" ? "CEO" : `${a?.name} (${a?.title})`}</b><p className="whitespace-pre-wrap">{m.content}</p></div></div>); })}
          {d?.busy && <p className="text-hq-mute">{ending ? "Writing up notes and action items…" : "Someone is about to speak…"}</p>}
        </div>
        {!ending ? <>
          <form onSubmit={say} className="flex gap-2"><input className="px-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Steer the discussion…" /><button className="px-btn px-btn-gold">SAY</button></form>
          <button className="px-btn px-btn-rose mt-2" onClick={end}>END MEETING &amp; GENERATE NOTES</button>
        </> : <p className="text-hq-gold">Ending meeting — notes, decisions and action items will open when ready.</p>}
      </div>
    </ModalFrame>
  );
}

const TOOL_HELP: Record<string, string> = { get_financials: "Financial data", get_projects: "Projects", get_pipeline: "Sales pipeline", get_campaigns: "Campaigns", get_calendar: "Calendar", get_inbox: "Inbox (untrusted)", get_system_health: "Platform health", send_external_message: "🔐 Send external messages", spend_money: "🔐 Spend money", delete_data: "🔐 Delete data", modify_system: "🔐 Modify systems", launch_campaign: "🔐 Launch campaigns" };

export function HireModal({ ctx, office }: { ctx: Ctx; office?: string }) {
  const [vacant, setVacant] = useState<string[]>([]);
  const [f, setF] = useState({ name: "", title: "Partnerships Manager", department: "Partnerships", roleDescription: "Builds our referral ecosystem: identifies complementary professionals who encounter our ideal clients and develops long-term referral partnerships.", responsibilities: "Map referral partner categories\nReview partner campaign performance\nPropose partnership initiatives", personality: "Warm, relationship-first, organised.", office: office ?? "", permissions: ["get_pipeline", "get_campaigns"] as string[] });
  const [avatar, setAvatar] = useState<Avatar>({ ...DEFAULT_AVATAR, hair: 2, outfit: 1, outfitColor: 4 });
  const [step, setStep] = useState(0); const [busy, setBusy] = useState(false);
  useEffect(() => { api("/api/agents").then((r) => { setVacant(r.vacant); setF((x) => ({ ...x, office: office && r.vacant.includes(office) ? office : r.vacant[0] ?? "" })); }); }, [office]);
  const hire = async () => {
    setBusy(true);
    try {
      const r = await api("/api/agents", { body: { ...f, responsibilities: f.responsibilities.split("\n").map((s) => s.trim()).filter(Boolean), avatar } });
      ctx.toast({ title: `Welcome aboard, ${r.agent.name}!`, body: `${r.agent.title} is moving into their office.`, tone: "good" });
      await ctx.refreshWorld(); ctx.close();
    } catch (e) { ctx.toast({ title: "Couldn't hire", body: (e as Error).message, tone: "bad" }); setBusy(false); }
  };
  return (
    <ModalFrame wide title="🤝 HIRE AN AI EMPLOYEE" onClose={ctx.close}>
      <div className="p-4 space-y-3">
        {!vacant.length ? <p>All offices are occupied. Remove an employee from the AI Workforce screen to free one up.</p> : step === 0 ? (
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="block"><span className="text-hq-mute">Name</span><input className="px-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Jamie" /></label>
              <label className="block"><span className="text-hq-mute">Job title</span><input className="px-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
              <label className="block"><span className="text-hq-mute">Department</span><input className="px-input" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></label>
              <label className="block"><span className="text-hq-mute">Office</span><select className="px-input" value={f.office} onChange={(e) => setF({ ...f, office: e.target.value })}>{vacant.map((v) => <option key={v} value={v}>{ROOMS.find((r) => r.key === v)?.name}</option>)}</select></label>
              <label className="block"><span className="text-hq-mute">Personality</span><input className="px-input" value={f.personality} onChange={(e) => setF({ ...f, personality: e.target.value })} /></label>
            </div>
            <div className="space-y-2">
              <label className="block"><span className="text-hq-mute">Role description</span><textarea className="px-input min-h-[90px]" value={f.roleDescription} onChange={(e) => setF({ ...f, roleDescription: e.target.value })} /></label>
              <label className="block"><span className="text-hq-mute">Responsibilities (one per line)</span><textarea className="px-input min-h-[80px]" value={f.responsibilities} onChange={(e) => setF({ ...f, responsibilities: e.target.value })} /></label>
              <div><span className="text-hq-mute">Data &amp; tool access (always includes team, tasks, reports, goals, memory)</span>
                <div className="grid grid-cols-2 gap-1 mt-1">{Object.entries(TOOL_HELP).map(([t, l]) => <label key={t} className="flex gap-1 items-center text-base"><input type="checkbox" checked={f.permissions.includes(t)} onChange={(e) => setF({ ...f, permissions: e.target.checked ? [...f.permissions, t] : f.permissions.filter((x) => x !== t) })} />{l}</label>)}</div>
              </div>
            </div>
          </div>
        ) : <CharacterCreator value={avatar} onChange={(a) => setAvatar(sanitizeAvatar(a))} />}
        {vacant.length > 0 && <div className="flex justify-between"><button className="px-btn" disabled={step === 0} onClick={() => setStep(0)}>◀ ROLE</button>{step === 0 ? <button className="px-btn px-btn-gold" disabled={!f.name || f.roleDescription.length < 10} onClick={() => setStep(1)}>APPEARANCE ▶</button> : <button className="px-btn px-btn-gold" disabled={busy} onClick={hire}>HIRE {f.name.toUpperCase()}</button>}</div>}
      </div>
    </ModalFrame>
  );
}

export function EodModal({ ctx, eaId, onLogout }: { ctx: Ctx; eaId: string | null; onLogout: () => void }) {
  const [b, setB] = useState<any>(null);
  const [text, setText] = useState(""); const [created, setCreated] = useState<any[]>([]); const [busy, setBusy] = useState(false);
  useEffect(() => { api("/api/briefing/eod", { body: {} }).then((r) => { setB(r.briefing); if (eaId) bus.emit("bubble", { agentId: eaId, text: r.briefing.greeting, ms: 8000 }); }); }, [eaId]);
  const schedule = async () => { setBusy(true); try { const r = await api("/api/briefing/eod/instructions", { body: { text } }); setCreated(r.created); setText(""); } catch (e) { ctx.toast({ title: "Couldn't schedule", body: (e as Error).message, tone: "bad" }); } setBusy(false); };
  const c = b?.content;
  return (
    <ModalFrame wide title="🌙 END-OF-DAY RECAP" onClose={ctx.close}>
      <div className="p-4 space-y-3 ui-font text-sm" data-testid="eod">
        <div className="flex gap-3 items-start"><Portrait agent={ctx.agentById(eaId)} size={3} /><p className="text-[20px] leading-6 font-body">{b?.greeting ?? "…"}</p></div>
        {c && <div className="grid md:grid-cols-2 gap-3">
          <div className="bg-[#1b1726] rounded p-2"><b className="text-hq-gold">Accomplished today</b>{c.accomplished.length ? c.accomplished.map((t: any, i: number) => <p key={i}>✅ {t.agent}: {t.reportId ? <a className="underline cursor-pointer" onClick={() => ctx.open({ t: "report", id: t.reportId })}>{t.title}</a> : t.title}</p>) : <p className="text-hq-mute">Nothing completed today.</p>}{c.meetingsHeld > 0 && <p>🗣 {c.meetingsHeld} meeting(s) held</p>}</div>
          <div className="bg-[#1b1726] rounded p-2"><b className="text-hq-gold">Still in progress</b>{c.unfinished.length ? c.unfinished.map((t: any, i: number) => <p key={i}>⏳ {t.agent}: {t.title} <Badge tone={statusTone(t.status)}>{t.status.replace("_", " ")}</Badge></p>) : <p className="text-hq-mute">Nothing open.</p>}</div>
          <div className="bg-[#1b1726] rounded p-2"><b className="text-hq-gold">What agents work on next</b>{c.next.length ? c.next.slice(0, 8).map((t: any, i: number) => <p key={i}>➜ {t.who || "Team"}: {t.what} <span className="text-hq-mute">({new Date(t.when).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })})</span></p>) : <p className="text-hq-mute">Nothing scheduled.</p>}</div>
          <div className="bg-[#1b1726] rounded p-2"><b className="text-hq-gold">Expected tomorrow</b>{c.tomorrow.events.map((e: any, i: number) => <p key={i}>🕘 {time(e.start)} {e.title}</p>)}{c.tomorrow.deadlines.map((t: any, i: number) => <p key={i}>⏰ Due: {t.title} ({t.agent})</p>)}{c.tomorrow.risks.map((r: string, i: number) => <p key={i} className="text-hq-rose">⚠ {r}</p>)}{c.tomorrow.pendingApprovals > 0 && <p>🔐 {c.tomorrow.pendingApprovals} approval(s) still waiting</p>}{!c.tomorrow.events.length && !c.tomorrow.deadlines.length && !c.tomorrow.risks.length && <p className="text-hq-mute">A clear day so far.</p>}</div>
        </div>}
        <div><b>Instructions for tomorrow</b> <span className="text-hq-mute">(each instruction becomes an assignment that starts at 7:00 tomorrow)</span>
          <textarea className="px-input min-h-[80px] mt-1" value={text} onChange={(e) => setText(e.target.value)} placeholder={"Have the CFO prepare a cash-flow forecast.\nAsk the CMO to draft a CPA partner campaign."} />
          <button className="px-btn px-btn-teal mt-1" disabled={busy || text.trim().length < 3} onClick={schedule}>SCHEDULE FOR TOMORROW</button>
          {created.map((t) => <p key={t.id} className="text-hq-teal">📋 {t.agent}: {t.title}</p>)}
        </div>
        <div className="flex justify-end gap-2"><button className="px-btn" onClick={ctx.close}>STAY A BIT LONGER</button><button className="px-btn px-btn-gold" onClick={onLogout}>CLOCK OUT ▶</button></div>
      </div>
    </ModalFrame>
  );
}

export function DecorPanel({ ctx, original, onDone }: { ctx: Ctx; original: any[]; onDone: () => void }) {
  const [items, setItems] = useState<any[]>(original);
  const [sel, setSel] = useState<{ type: string; variant: number } | null>(null);
  const [err, setErr] = useState(""); const [hover, setHover] = useState<any>(null); const [busy, setBusy] = useState(false);
  const thumbs = useMemo(() => Object.fromEntries(FURNITURE.map((f) => [f.type, drawProp(f.type, f.w, f.h, 0, { logoColor: ctx.world.company.logo.color, logoBg: ctx.world.company.logo.bg, logoSymbol: ctx.world.company.logo.symbol }).toDataURL()])), [ctx.world.company.logo]);
  useEffect(() => {
    bus.emit("decor:start");
    const u = [bus.on("decor:changed", (l: any[]) => setItems([...l])), bus.on("decor:selected", (s: any) => setSel(s)), bus.on("decor:error", (e: string) => { setErr(e); setTimeout(() => setErr(""), 2500); }), bus.on("decor:hover", setHover)];
    return () => { u.forEach((f) => f()); bus.emit("decor:stop"); };
  }, []);
  const pick = (type: string | null) => { const s = type ? { type, variant: 0 } : null; setSel(s); bus.emit("decor:select", s ?? { type: null }); };
  const save = async () => {
    setBusy(true);
    try { await api("/api/furniture", { method: "PUT", body: { room: "ceo", items: items.map((i) => ({ itemType: i.itemType, x: i.x, y: i.y, variant: i.variant ?? 0 })) } }); ctx.toast({ title: "Office layout saved", tone: "good" }); await ctx.refreshWorld(); onDone(); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const cancel = () => { bus.emit("decor:reset", original); onDone(); };
  const cats = [...new Set(FURNITURE.map((f) => f.category))];
  return (
    <div className="fixed right-3 top-16 bottom-3 z-30 w-[300px] px-panel flex flex-col" data-testid="decor">
      <div className="p-2 border-b-[3px] border-[#120e18] pixel-title text-[10px] text-hq-gold">🛋 DECORATE YOUR SUITE</div>
      <div className="p-2 text-base text-hq-mute leading-5">Pick an item, then click a tile in your office. <b>R</b> changes style, <b>right-click</b> cancels. With nothing selected: click an item to move it, hover + <b>Delete</b> to remove.</div>
      {err && <div className="mx-2 p-1 bg-[#3b1f2a] text-hq-rose text-base rounded">{err}</div>}
      {hover && !sel && <div className="mx-2 text-base text-hq-gold">Hovering: {furnitureDef(hover.itemType)?.name} — click to move, Delete to remove</div>}
      <div className="flex-1 overflow-auto scroll-thin p-2 space-y-2">
        {cats.map((c) => <div key={c}><div className="text-hq-mute text-base">{c}</div><div className="grid grid-cols-3 gap-1.5">{FURNITURE.filter((f) => f.category === c).map((f) => (
          <button key={f.type} onClick={() => pick(sel?.type === f.type ? null : f.type)} title={f.name} className={`p-1 rounded border-2 flex flex-col items-center ${sel?.type === f.type ? "border-hq-gold bg-[#30283f]" : "border-[#3a3150] bg-[#1b1726]"}`}>
            <img src={thumbs[f.type]} alt={f.name} style={{ imageRendering: "pixelated", height: 32, maxWidth: "100%", objectFit: "contain" }} /><span className="text-[13px] leading-4 text-center">{f.name}</span></button>))}</div></div>)}
      </div>
      <div className="p-2 flex gap-2 border-t-[3px] border-[#120e18]"><span className="text-base text-hq-mute flex-1">{items.length} items</span><button className="px-btn" onClick={cancel}>CANCEL</button><button className="px-btn px-btn-gold" disabled={busy} onClick={save}>SAVE</button></div>
    </div>
  );
}

export function SettingsModal({ ctx, onLogout }: { ctx: Ctx; onLogout: () => void }) {
  const [avatar, setAvatar] = useState<Avatar>(sanitizeAvatar(ctx.world.user.avatar));
  const [name, setName] = useState(ctx.world.user.name);
  const save = async () => { await api("/api/me", { method: "PUT", body: { avatar, name } }); bus.emit("player:avatar", avatar); await ctx.refreshWorld(); ctx.toast({ title: "Character updated", tone: "good" }); ctx.close(); };
  return (
    <ModalFrame wide title="⚙ CHARACTER & ACCOUNT" onClose={ctx.close}>
      <div className="p-4 space-y-3">
        <label className="block"><span className="text-hq-mute">Name</span><input className="px-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <CharacterCreator value={avatar} onChange={setAvatar} />
        <div className="flex gap-2 justify-between"><button className="px-btn px-btn-rose" onClick={onLogout}>LOG OUT</button><div className="flex gap-2"><button className="px-btn" onClick={() => ctx.open({ t: "desk", tab: "settings" })}>COMPANY SETTINGS</button><button className="px-btn px-btn-gold" onClick={save}>SAVE CHARACTER</button></div></div>
      </div>
    </ModalFrame>
  );
}

export function HelpModal({ ctx }: { ctx: Ctx }) {
  return (
    <ModalFrame title="❓ HOW TO PLAY" onClose={ctx.close}>
      <div className="p-4 space-y-2 text-[20px] leading-6">
        <p><b className="text-hq-gold">WASD / Arrows</b> walk · <b className="text-hq-gold">Shift</b> hurry · <b className="text-hq-gold">E / Space</b> interact · <b className="text-hq-gold">Esc</b> close</p>
        <p>Walk into an office and press <b>E</b> near an employee to talk. Ask for work naturally (“I need a revenue forecast for the next six months”) — they queue it as a background assignment and notify you when it’s done.</p>
        <p>Your <b>executive desk</b> (CEO suite, top centre) opens the company OS. Department stations (screens and boards in each office) jump to their dashboards.</p>
        <p>The <b>conference room</b> table starts multi-agent meetings. <b>Hiring</b> signs in vacant offices let you hire custom AI employees. The <b>exit mat</b> in the lobby gives you an end-of-day recap.</p>
        <p>In your suite, press <b>🛋 Decorate</b> in the top bar to move furniture.</p>
      </div>
    </ModalFrame>
  );
}
