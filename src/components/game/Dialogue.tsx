"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { bus } from "@/game/bus";
import { Badge, Portrait } from "./ui";
import type { Ctx } from "./types";

type Msg = { id: string; role: string; content: string; agentId?: string | null; meta?: { mode?: string; createdTaskIds?: string[]; approvalIds?: string[] } | null; createdAt: string };
type Action = { label: string; action: string; payload?: string };

/** Typewriter text, skippable by clicking. */
export function Typewriter({ text, speed = 14 }: { text: string; speed?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => { setN(0); const iv = setInterval(() => setN((x) => { if (x >= text.length) { clearInterval(iv); return x; } return x + 2; }), speed); return () => clearInterval(iv); }, [text, speed]);
  return <span onClick={() => setN(text.length)}>{text.slice(0, n)}{n < text.length && <span className="blink">▌</span>}</span>;
}

export default function Dialogue({ ctx, agentId }: { ctx: Ctx; agentId: string }) {
  const agent = ctx.agentById(agentId);
  const [line, setLine] = useState("…");
  const [actions, setActions] = useState<Action[]>([]);
  const [conv, setConv] = useState<string | null>(null);
  const [history, setHistory] = useState<Msg[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"talk" | "assign">("talk");
  const [chips, setChips] = useState<string[]>([]);
  const [lastMode, setLastMode] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const histRef = useRef<HTMLDivElement>(null);
  const convPromise = useRef<Promise<string> | null>(null);

  useEffect(() => {
    bus.emit("npc:face", { agentId, on: true });
    api(`/api/agents/${agentId}/greeting`).then((g) => { setLine(g.line); setActions(g.actions); bus.emit("bubble", { agentId, text: g.line, ms: 5000 }); });
    convPromise.current = api(`/api/agents/${agentId}/conversation`).then((c) => { setConv(c.conversation.id); setHistory(c.messages); return c.conversation.id as string; });
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => { bus.emit("npc:face", { agentId, on: false }); bus.emit("bubble:clear", agentId); };
  }, [agentId]);
  useEffect(() => { histRef.current?.scrollTo(0, 1e9); }, [history, showHistory]);

  const send = async (msg: string) => {
    if (!msg.trim() || busy) return;
    setBusy(true); setText(""); setChips([]);
    const convId = conv ?? (await convPromise.current);
    setHistory((h) => [...h, { id: `tmp${Date.now()}`, role: "ceo", content: msg, createdAt: new Date().toISOString() }]);
    setLine("…");
    try {
      const r = await api(`/api/agents/${agentId}/chat`, { body: { text: msg, conversationId: convId } });
      setLine(r.reply); setLastMode(r.mode);
      bus.emit("bubble", { agentId, text: r.reply, ms: 6000 });
      setHistory((h) => [...h, { id: `r${Date.now()}`, role: "agent", agentId, content: r.reply, createdAt: new Date().toISOString(), meta: { mode: r.mode } }]);
      setChips([...r.createdTasks.map((t: { title: string; agent: string }) => `📋 Assignment queued → ${t.agent}: ${t.title}`), ...r.approvals.map(() => "🔐 Approval request filed")]);
      if (r.createdTasks.length) ctx.toast({ title: "Assignment created", body: r.createdTasks.map((t: { title: string }) => t.title).join(", "), tone: "good" });
    } catch (e) { setLine(`(Couldn't reach ${agent?.name}: ${(e as Error).message})`); }
    setBusy(false);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const doAction = (a: Action) => {
    if (a.action === "assign") setMode("assign");
    else if (a.action === "ask" && a.payload) send(a.payload);
    else if (a.action === "report" && a.payload) ctx.open({ t: "report", id: a.payload });
    else if (a.action === "approval" && a.payload) ctx.open({ t: "approval", id: a.payload });
  };

  if (!agent) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-4 z-40 w-[min(860px,calc(100vw-24px))] pop" role="dialog" aria-label={`Conversation with ${agent.name}`}>
      {showHistory && (
        <div ref={histRef} className="px-panel mb-2 p-3 max-h-[40vh] overflow-auto scroll-thin space-y-2">
          {history.length === 0 && <p className="text-hq-mute">No previous conversation.</p>}
          {history.map((m) => (
            <div key={m.id} className={m.role === "ceo" ? "text-right" : ""}>
              <span className={`inline-block px-2 py-1 rounded max-w-[85%] text-left ${m.role === "ceo" ? "bg-[#3a3150]" : "bg-[#1b1726]"}`}>
                <b className={m.role === "ceo" ? "text-hq-gold" : "text-hq-teal"}>{m.role === "ceo" ? "You" : agent.name}: </b>{m.content}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="px-panel p-3 flex gap-3">
        <Portrait agent={agent} size={4} />
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="pixel-title text-[11px] text-hq-gold">{agent.name.toUpperCase()}</span>
            <span className="text-hq-mute">{agent.title}</span>
            {(lastMode || ctx.world.ai) === "offline" && <Badge tone="rose">OFFLINE SIM</Badge>}
            <span className="flex-1" />
            <button className="px-btn !px-2 !py-1 !text-[8px]" onClick={() => setShowHistory((s) => !s)}>{showHistory ? "HIDE" : "HISTORY"}</button>
            <button className="px-btn !px-2 !py-1" onClick={ctx.close} aria-label="Close">✕</button>
          </div>
          {mode === "talk" ? (
            <>
              <div className="text-[22px] leading-6 mt-1 min-h-[52px] max-h-[30vh] overflow-auto scroll-thin"><Typewriter text={line} /></div>
              {chips.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{chips.map((c, i) => <Badge key={i} tone="teal">{c}</Badge>)}</div>}
              <div className="flex flex-wrap gap-2 mt-2">{actions.map((a, i) => <button key={i} className="px-btn !text-[9px]" onClick={() => doAction(a)}>▸ {a.label}</button>)}</div>
              <form className="flex gap-2 mt-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
                <input ref={inputRef} className="px-input" placeholder={`Talk to ${agent.name}… e.g. "I need a revenue forecast for the next six months"`} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
                <button className="px-btn px-btn-gold" disabled={busy || !text.trim()}>{busy ? "…" : "SAY"}</button>
              </form>
            </>
          ) : <AssignForm ctx={ctx} agentId={agentId} onDone={(title) => { setMode("talk"); setLine(`Got it — "${title}" is on my list. I'll let you know when it's done.`); }} onCancel={() => setMode("talk")} />}
        </div>
      </div>
    </div>
  );
}

export function AssignForm({ ctx, agentId, onDone, onCancel }: { ctx: Ctx; agentId: string; onDone: (title: string) => void; onCancel: () => void }) {
  const [f, setF] = useState({ title: "", description: "", priority: "normal", deadline: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await api("/api/tasks", { body: { agentId, title: f.title, description: f.description, priority: f.priority, deadline: f.deadline || null } });
      ctx.toast({ title: "Assignment created", body: f.title, tone: "good" });
      onDone(f.title);
    } catch (err) { ctx.toast({ title: "Couldn't create task", body: (err as Error).message, tone: "bad" }); }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="grid gap-2 mt-2">
      <input className="px-input" required minLength={3} placeholder="Assignment title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus />
      <textarea className="px-input min-h-[70px]" placeholder="Details, context, expected output…" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <div className="flex gap-2 items-center flex-wrap">
        <label className="text-hq-mute">Priority</label>
        <select className="px-input !w-auto" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{["low", "normal", "high", "urgent"].map((p) => <option key={p}>{p}</option>)}</select>
        <label className="text-hq-mute">Deadline</label>
        <input type="date" className="px-input !w-auto" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />
        <span className="flex-1" />
        <button type="button" className="px-btn" onClick={onCancel}>BACK</button>
        <button className="px-btn px-btn-gold" disabled={busy}>ASSIGN</button>
      </div>
    </form>
  );
}
