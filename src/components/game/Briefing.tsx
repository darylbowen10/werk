"use client";
import { useEffect, useRef, useState } from "react";
import { api, money, pct, time } from "@/lib/client";
import { bus } from "@/game/bus";
import { Badge, DemoBadge, ModalFrame, Portrait } from "./ui";
import { Typewriter } from "./Dialogue";
import type { Ctx } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type BriefingRow = { id: string; kind: string; date: string; greeting: string; content: any; status: string; generatedBy: string; createdAt: string };

/** Speech panel shown when the Executive Assistant reaches the CEO on arrival. */
export function BriefingGreeting({ ctx, briefing, eaId, onChoose }: { ctx: Ctx; briefing: BriefingRow; eaId: string; onChoose: (c: "full" | "urgent" | "walk" | "office" | "later" | "disable") => void }) {
  const ea = ctx.agentById(eaId);
  useEffect(() => { bus.emit("bubble", { agentId: eaId, text: briefing.greeting, ms: 0 }); return () => bus.emit("bubble:clear", eaId); }, [eaId, briefing.greeting]);
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-4 z-40 w-[min(860px,calc(100vw-24px))] pop" data-testid="briefing-greeting">
      <div className="px-panel p-3 flex gap-3">
        <Portrait agent={ea} size={4} />
        <div className="flex-1">
          <div className="flex items-center gap-2"><span className="pixel-title text-[11px] text-hq-gold">{ea?.name.toUpperCase()}</span><span className="text-hq-mute">Executive Assistant</span>{briefing.generatedBy === "offline" && <Badge tone="rose">OFFLINE SIM</Badge>}</div>
          <div className="text-[22px] leading-6 mt-1 min-h-[52px]"><Typewriter text={briefing.greeting} /></div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
            <button className="px-btn px-btn-gold" onClick={() => onChoose("full")}>▸ GIVE ME THE BRIEFING</button>
            <button className="px-btn px-btn-rose" onClick={() => onChoose("urgent")}>▸ WHAT&apos;S URGENT?</button>
            <button className="px-btn px-btn-teal" onClick={() => onChoose("walk")}>▸ WALK WITH ME</button>
            <button className="px-btn" onClick={() => onChoose("office")}>▸ LET&apos;S MEET IN MY OFFICE</button>
            <button className="px-btn" onClick={() => onChoose("later")}>▸ LATER</button>
            <button className="px-btn !text-[8px] opacity-80" onClick={() => onChoose("disable")}>TURN OFF AUTO-BRIEFINGS</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, source, children }: { title: string; source?: string; children: React.ReactNode }) {
  return (
    <section className="px-panel !shadow-none p-3">
      <div className="flex items-center gap-2 mb-1"><h3 className="pixel-title text-[10px] text-hq-gold">{title}</h3>{source && <DemoBadge source={source} />}</div>
      <div className="ui-font text-[14px] leading-relaxed space-y-1">{children}</div>
    </section>
  );
}

export function DecisionQueue({ ctx, items, onChanged }: { ctx: Ctx; items: any[]; onChanged: () => void }) {
  const [done, setDone] = useState<Record<string, string>>({});
  const [delegate, setDelegate] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const act = async (it: any, decision: string) => {
    setBusy(it.id);
    try {
      if (it.kind === "approval") await api(`/api/approvals/${it.id}`, { body: { decision, delegateTo: decision === "delegated" ? delegate[it.id] ?? "coo" : undefined } });
      if (it.kind === "idea") await api(`/api/ideas/${it.id}`, { body: { status: decision } });
      if (it.kind === "project") await api(`/api/projects/${it.id}`, { body: { action: decision } });
      setDone((d) => ({ ...d, [it.id]: decision }));
      ctx.toast({ title: `Decision recorded: ${decision}`, body: it.title, tone: decision === "rejected" || decision === "declined" ? "warn" : "good" });
      onChanged();
    } catch (e) { ctx.toast({ title: "Couldn't record decision", body: (e as Error).message, tone: "bad" }); }
    setBusy("");
  };
  if (!items.length) return <p className="text-hq-mute ui-font text-sm">Nothing needs your decision right now. 🎉</p>;
  return (
    <div className="space-y-2" data-testid="decision-queue">
      {items.map((it) => (
        <div key={it.kind + it.id} className="bg-[#1b1726] rounded p-2 ui-font text-[13px]">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={it.kind === "approval" ? "gold" : it.kind === "idea" ? "sky" : "rose"}>{it.kind === "approval" ? "APPROVAL" : it.kind === "idea" ? "IDEA" : "PROJECT"}</Badge>
            <b className="flex-1">{it.title}</b><span className="text-hq-mute">{it.agent}</span>
          </div>
          {it.details && <p className="text-hq-mute mt-1 whitespace-pre-wrap line-clamp-3">{String(it.details).slice(0, 300)}</p>}
          {done[it.id] ? <p className="text-hq-teal mt-1">✓ {done[it.id]}</p> : (
            <div className="flex gap-1.5 mt-2 flex-wrap items-center">
              {it.kind === "approval" && <>
                <button className="px-btn px-btn-teal !text-[8px]" disabled={busy === it.id} onClick={() => act(it, "approved")}>APPROVE</button>
                <button className="px-btn px-btn-rose !text-[8px]" disabled={busy === it.id} onClick={() => act(it, "rejected")}>REJECT</button>
                <select className="px-input !w-auto !text-base !py-0" value={delegate[it.id] ?? "coo"} onChange={(e) => setDelegate({ ...delegate, [it.id]: e.target.value })}>{ctx.world.agents.map((a) => <option key={a.id} value={a.key}>{a.title}</option>)}</select>
                <button className="px-btn !text-[8px]" disabled={busy === it.id} onClick={() => act(it, "delegated")}>DELEGATE</button>
                <button className="px-btn !text-[8px]" disabled={busy === it.id} onClick={() => act(it, "postponed")}>POSTPONE</button>
                <button className="px-btn !text-[8px]" onClick={() => ctx.open({ t: "approval", id: it.id })}>REVIEW</button>
              </>}
              {it.kind === "idea" && <><button className="px-btn px-btn-teal !text-[8px]" onClick={() => act(it, "accepted")}>ACCEPT</button><button className="px-btn !text-[8px]" onClick={() => act(it, "declined")}>DECLINE</button></>}
              {it.kind === "project" && <><button className="px-btn px-btn-gold !text-[8px]" onClick={() => act(it, "intervene")}>INTERVENE (ASSIGN COO)</button><button className="px-btn !text-[8px]" onClick={() => act(it, "postpone")}>NOT NOW</button></>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Follow-up chat with the EA, embedded in briefing / walk-and-talk. */
export function EaChat({ ctx, eaId, compact = false, lockOnFocus = false }: { ctx: Ctx; eaId: string; compact?: boolean; lockOnFocus?: boolean }) {
  const [conv, setConv] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<{ role: string; content: string }[]>([]);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { api(`/api/agents/${eaId}/conversation`).then((c) => { setConv(c.conversation.id); setMsgs(c.messages.slice(-8)); }); }, [eaId]);
  useEffect(() => { box.current?.scrollTo(0, 1e9); }, [msgs]);
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); if (!text.trim() || !conv) return;
    const t = text; setText(""); setBusy(true); setMsgs((m) => [...m, { role: "ceo", content: t }]);
    try {
      const r = await api(`/api/agents/${eaId}/chat`, { body: { text: t, conversationId: conv, mode: compact ? "walk" : "chat" } });
      setMsgs((m) => [...m, { role: "agent", content: r.reply }]);
      bus.emit("bubble", { agentId: eaId, text: r.reply, ms: 7000 });
      if (r.createdTasks.length) ctx.toast({ title: "Assignment created", body: r.createdTasks.map((x: any) => `${x.agent}: ${x.title}`).join("; "), tone: "good" });
    } catch (err) { setMsgs((m) => [...m, { role: "agent", content: `(error: ${(err as Error).message})` }]); }
    setBusy(false);
  };
  return (
    <div>
      <div ref={box} className={`space-y-1 overflow-auto scroll-thin ${compact ? "max-h-40" : "max-h-48"} mb-2`}>
        {msgs.map((m, i) => <div key={i} className={m.role === "ceo" ? "text-hq-gold" : ""}><b>{m.role === "ceo" ? "You" : ctx.agentById(eaId)?.name}:</b> {m.content}</div>)}
        {busy && <div className="text-hq-mute">…</div>}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input className="px-input" value={text} onChange={(e) => setText(e.target.value)} placeholder='Ask a follow-up or give an instruction ("Have the CFO dig into software spend")'
          onFocus={() => lockOnFocus && bus.emit("controls:lock", true)} onBlur={() => lockOnFocus && bus.emit("controls:lock", false)}
          onKeyDown={(e) => { if (e.key === "Escape") (e.target as HTMLInputElement).blur(); }} data-testid="ea-chat-input" />
        <button className="px-btn px-btn-gold" disabled={busy}>ASK</button>
      </form>
    </div>
  );
}

export function BriefingPanel({ ctx, briefing, view, eaId, onRefresh }: { ctx: Ctx; briefing: BriefingRow; view: "full" | "urgent"; eaId: string | null; onRefresh: () => void }) {
  const c = briefing.content;
  const [v, setV] = useState(view);
  if (briefing.kind === "eod") return null;
  const f = c.financial, o = c.operations, s = c.sales, cal = c.calendar, w = c.workforce;
  return (
    <ModalFrame wide title={<>☀ MORNING BRIEFING · {briefing.date}</>} onClose={ctx.close}>
      <div className="p-4 space-y-3" data-testid="briefing-panel">
        <div className="flex gap-2 items-center flex-wrap">
          <button className={`px-btn !text-[9px] ${v === "full" ? "px-btn-gold" : ""}`} onClick={() => setV("full")}>FULL BRIEFING</button>
          <button className={`px-btn !text-[9px] ${v === "urgent" ? "px-btn-rose" : ""}`} onClick={() => setV("urgent")}>URGENT ONLY</button>
          <span className="flex-1" />
          {briefing.generatedBy === "offline" && <Badge tone="rose">Prepared in offline simulation mode</Badge>}
          <span className="text-hq-mute text-base">Covers activity since {new Date(c.since).toLocaleString()}</span>
        </div>
        <p className="text-[22px] leading-6">“{briefing.greeting}”</p>
        {c.isQuiet && <p className="text-hq-mute ui-font text-sm">No new reports, opportunities or approvals came in since your last briefing — the overnight queue was quiet.</p>}

        <Section title={`DECISIONS NEEDING YOU (${c.decisions.length})`}><DecisionQueue ctx={ctx} items={c.decisions} onChanged={onRefresh} /></Section>
        {v === "urgent" ? (
          <>
            {(o.delayed.length > 0 || cal.conflicts.length > 0 || w.failed.length > 0 || f.flags.length > 0) ? (
              <Section title="NEEDS ATTENTION">
                {o.delayed.map((d: any) => <p key={d.name}>🔴 <b>{d.name}</b> ({d.owner}) past due {d.due} — {d.blockers}</p>)}
                {f.flags.map((x: string) => <p key={x}>💸 {x}</p>)}
                {cal.conflicts.map((x: any, i: number) => <p key={i}>📅 Conflict: {x.a} ↔ {x.b}</p>)}
                {w.failed.map((x: any, i: number) => <p key={i}>⚠ {x.agent} couldn&apos;t finish “{x.title}”: {x.error}</p>)}
                {cal.suspicious.map((x: any, i: number) => <p key={i}>🚩 Suspicious message from {x.from} (“{x.subject}”) — contains instructions aimed at AI; ignored.</p>)}
              </Section>
            ) : <p className="text-hq-mute ui-font text-sm">Nothing urgent beyond the decisions above.</p>}
          </>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            <Section title="FINANCIAL HEALTH" source={f.source}>
              <p>Revenue {f.month}: <b>{money(f.revenue)}</b> ({pct(f.revenueChangePct)} MoM)</p>
              <p>Expenses: <b>{money(f.expenses)}</b> ({pct(f.expensesChangePct)}) · Profit <b>{money(f.profit)}</b> · Cash <b>{money(f.cash)}</b></p>
              {f.flags.map((x: string) => <p key={x} className="text-hq-rose">⚠ {x}</p>)}
              {f.cfo?.recommendation && <p className="text-hq-teal">CFO: {f.cfo.recommendation} <a className="underline cursor-pointer" onClick={() => ctx.open({ t: "report", id: f.cfo.id })}>(report)</a></p>}
            </Section>
            <Section title="OPERATIONS" source={o.source}>
              {o.completed.length ? o.completed.map((t: any) => <p key={t.id}>✅ {t.agent}: <a className="underline cursor-pointer" onClick={() => t.reportId && ctx.open({ t: "report", id: t.reportId })}>{t.title}</a>{t.status === "awaiting_approval" && " (awaiting approval)"}</p>) : <p className="text-hq-mute">No assignments completed since the last briefing.</p>}
              {o.delayed.map((d: any) => <p key={d.name} className="text-hq-rose">🔴 Delayed: {d.name} ({d.owner}) — {d.blockers}</p>)}
              {o.atRisk.map((d: any) => <p key={d.name} className="text-hq-gold">🟡 At risk: {d.name} — {d.blockers}</p>)}
              {o.coo?.recommendation && <p className="text-hq-teal">COO: {o.coo.recommendation}</p>}
            </Section>
            <Section title="SALES & MARKETING" source={s.source}>
              <p>Open pipeline <b>{money(s.openPipeline)}</b> ({money(s.weighted)} weighted)</p>
              {s.newOpportunities.length ? s.newOpportunities.map((d: any, i: number) => <p key={i}>✨ New: {d.account} — {money(d.value)} <span className="text-hq-mute">({d.leadSource})</span></p>) : <p className="text-hq-mute">No new opportunities.</p>}
              {s.campaigns.map((x: any) => <p key={x.name}>📣 {x.name}: {x.acceptanceRate}% accept · {x.replyRate}% reply · {x.meetings} meetings</p>)}
              {s.cro?.recommendation && <p className="text-hq-teal">CRO: {s.cro.recommendation}</p>}
            </Section>
            <Section title="CALENDAR & COMMUNICATIONS" source={cal.source}>
              {cal.events.length ? cal.events.map((e: any, i: number) => <p key={i}>🕘 {time(e.start)} {e.title} <span className="text-hq-mute">({e.attendees})</span></p>) : <p className="text-hq-mute">No meetings today.</p>}
              {cal.conflicts.map((x: any, i: number) => <p key={i} className="text-hq-rose">📅 Conflict: {x.a} ↔ {x.b}</p>)}
              <p>✉ {cal.pendingResponses} messages awaiting a response{cal.important.length ? `; important: ${cal.important.map((m: any) => m.subject).join(", ")}` : ""}</p>
              {cal.suspicious.map((x: any, i: number) => <p key={i} className="text-hq-rose">🚩 Ignored suspicious message from {x.from} — it tried to instruct AI staff.</p>)}
            </Section>
            <Section title="AI WORKFORCE">
              <p>Completed since last briefing: <b>{w.completed}</b> · Pending approvals: <b>{w.pendingApprovals}</b></p>
              {w.working.map((t: any, i: number) => <p key={i}>⚙ {t.agent} {t.status === "working" ? "is working on" : "has queued"} “{t.title}”</p>)}
              {w.ideas.map((x: any) => <p key={x.id}>💡 {x.agent}: {x.title}</p>)}
              {w.failed.map((x: any, i: number) => <p key={i} className="text-hq-rose">⚠ {x.agent}: “{x.title}” failed — {x.error}</p>)}
            </Section>
            <Section title="STRATEGIC RECOMMENDATIONS">
              {c.strategic.recommendations.length ? c.strategic.recommendations.map((r: string) => <p key={r}>➜ {r}</p>) : <p className="text-hq-mute">No new recommendations.</p>}
            </Section>
          </div>
        )}
        {eaId && <Section title="FOLLOW-UP WITH YOUR ASSISTANT"><EaChat ctx={ctx} eaId={eaId} /></Section>}
        <div className="flex gap-2 justify-end">
          <button className="px-btn" onClick={() => ctx.open({ t: "desk", tab: "briefings" })}>OPEN BRIEFING HISTORY</button>
          <button className="px-btn px-btn-gold" onClick={() => ctx.open({ t: "desk", tab: "overview" })}>GO TO DASHBOARD ▶</button>
        </div>
      </div>
    </ModalFrame>
  );
}

/** Non-blocking walk-and-talk panel: the EA follows the CEO and the conversation persists across rooms. */
export function WalkTalk({ ctx, eaId, briefing, onEnd }: { ctx: Ctx; eaId: string; briefing: BriefingRow | null; onEnd: () => void }) {
  const [open, setOpen] = useState(true);
  const c = briefing?.content;
  return (
    <div className="fixed left-3 bottom-3 z-30 w-[min(440px,calc(100vw-24px))] px-panel p-3 ui-font text-[13px]" data-testid="walk-talk">
      <div className="flex items-center gap-2 mb-2">
        <Portrait agent={ctx.agentById(eaId)} size={2} />
        <div className="flex-1"><div className="pixel-title text-[9px] text-hq-gold">WALK &amp; TALK</div><div className="text-hq-mute">{ctx.agentById(eaId)?.name} is walking with you. Click the box to type; Esc to keep walking.</div></div>
        <button className="px-btn !px-2 !py-1 !text-[8px]" onClick={() => setOpen((o) => !o)}>{open ? "–" : "+"}</button>
        <button className="px-btn px-btn-rose !px-2 !py-1 !text-[8px]" onClick={onEnd}>END</button>
      </div>
      {open && <>
        {c && <div className="flex flex-wrap gap-1 mb-2">
          <Badge tone="teal">{c.workforce.completed} done</Badge><Badge tone="gold">{c.decisions.length} decisions</Badge>
          <Badge tone="rose">{c.operations.delayed.length} delayed</Badge><Badge tone="sky">{c.sales.newOpportunities.length} new opps</Badge>
          <button className="underline text-hq-teal" onClick={() => ctx.open({ t: "briefing", view: "full", id: briefing!.id })}>open briefing</button>
        </div>}
        <EaChat ctx={ctx} eaId={eaId} compact lockOnFocus />
      </>}
    </div>
  );
}
