"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { ago, api, money, pct } from "@/lib/client";
import { Badge, DemoBadge, ModalFrame, statusTone } from "./ui";
import AvatarPreview from "../AvatarPreview";
import Markdown from "../Markdown";
import type { Ctx } from "./types";

const TABS = [
  ["overview", "🏢 Company Overview"], ["workforce", "🤖 AI Workforce"], ["tasks", "📋 Assignments"], ["finance", "💰 Financial Command"],
  ["operations", "⚙ Operations"], ["sales", "📈 Sales & Marketing"], ["reports", "📑 Executive Reports"], ["briefings", "☀ Briefings"],
  ["approvals", "🔐 Approvals"], ["settings", "🛠 Company Settings"],
] as const;

// ---------- tiny accessible SVG charts ----------
function Bars({ data, height = 140, color = "#4fc1b0", fmt = money, second, secondColor = "#e8697d", labels }: { data: number[]; height?: number; color?: string; fmt?: (n: number) => string; second?: number[]; secondColor?: string; labels: string[] }) {
  const max = Math.max(1, ...data, ...(second ?? []));
  const w = 100 / data.length;
  return (
    <svg viewBox={`0 0 100 ${height / 3}`} className="w-full" style={{ height }} role="img" aria-label="bar chart">
      {data.map((v, i) => {
        const h = (v / max) * (height / 3 - 6); const h2 = second ? (second[i] / max) * (height / 3 - 6) : 0;
        return <g key={i}><title>{`${labels[i]}: ${fmt(v)}${second ? ` / ${fmt(second[i])}` : ""}`}</title>
          <rect x={i * w + w * 0.12} y={height / 3 - 4 - h} width={second ? w * 0.36 : w * 0.76} height={h} fill={color} rx="0.4" />
          {second && <rect x={i * w + w * 0.52} y={height / 3 - 4 - h2} width={w * 0.36} height={h2} fill={secondColor} rx="0.4" />}
          <text x={i * w + w / 2} y={height / 3 - 0.5} fontSize="2.2" textAnchor="middle" fill="#a89cc0">{labels[i]}</text></g>;
      })}
    </svg>
  );
}
function Line({ series, height = 150, labels }: { series: { values: (number | null)[]; color: string; dashed?: boolean }[]; height?: number; labels: string[] }) {
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const max = Math.max(...all), min = Math.min(0, ...all);
  const n = labels.length, H = height / 3;
  const pt = (v: number, i: number) => `${(i / (n - 1)) * 96 + 2},${H - 5 - ((v - min) / (max - min || 1)) * (H - 9)}`;
  return (
    <svg viewBox={`0 0 100 ${H}`} className="w-full" style={{ height }} role="img" aria-label="line chart">
      {series.map((s, k) => <polyline key={k} fill="none" stroke={s.color} strokeWidth="0.6" strokeDasharray={s.dashed ? "1.5 1" : undefined} points={s.values.map((v, i) => (v == null ? null : pt(v, i))).filter(Boolean).join(" ")} />)}
      {labels.map((l, i) => (i % 2 === 0 ? <text key={i} x={(i / (n - 1)) * 96 + 2} y={H - 0.5} fontSize="2.2" textAnchor="middle" fill="#a89cc0">{l}</text> : null))}
    </svg>
  );
}
const Kpi = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) => (
  <div className="bg-[#1b1726] rounded-lg p-3 border border-[#3a3150]"><div className="text-[11px] uppercase tracking-wide text-hq-mute">{label}</div><div className="text-2xl font-bold mt-0.5" style={{ color: tone }}>{value}</div>{sub && <div className="text-xs text-hq-mute mt-0.5">{sub}</div>}</div>
);
const Card = ({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="bg-[#221c2e] rounded-lg p-3 border border-[#3a3150]"><div className="flex items-center gap-2 mb-2"><h3 className="font-semibold text-sm text-hq-cream flex-1">{title}</h3>{right}</div>{children}</div>
);

export default function Desk({ ctx, tab: initialTab }: { ctx: Ctx; tab?: string }) {
  const [tab, setTab] = useState(initialTab ?? "overview");
  const [d, setD] = useState<any>(null);
  const [report, setReport] = useState<string | null>(null);
  const load = useCallback(() => api("/api/dashboard").then(setD), []);
  useEffect(() => { load(); const iv = setInterval(load, 8000); return () => clearInterval(iv); }, [load]);
  const A = (id?: string | null) => d?.agents.find((a: any) => a.id === id);

  return (
    <ModalFrame full title={<>🖥 {ctx.world.company.name.toUpperCase()} · EXECUTIVE OS</>} onClose={ctx.close}>
      <div className="flex h-full min-h-0 ui-font os">
        <nav className="w-52 shrink-0 border-r-[3px] border-[#120e18] p-2 space-y-1 bg-[#1e1829] overflow-auto scroll-thin hidden md:block">
          {TABS.map(([k, l]) => <button key={k} onClick={() => { setTab(k); setReport(null); }} className={`w-full text-left px-3 py-2 rounded text-sm ${tab === k ? "bg-hq-gold text-hq-ink font-semibold" : "hover:bg-[#30283f]"}`}>{l}</button>)}
          <div className="pt-3 text-[11px] text-hq-mute px-2">AI engine: {ctx.world.ai === "claude" ? "Claude API" : "Offline simulation"}</div>
        </nav>
        <div className="flex-1 min-w-0 overflow-auto scroll-thin p-4 text-[14px]">
          <select className="md:hidden px-input mb-3" value={tab} onChange={(e) => setTab(e.target.value)}>{TABS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          {!d ? <p>Loading…</p> : report ? <ReportView id={report} ctx={ctx} onBack={() => setReport(null)} /> : (
            <>
              {tab === "overview" && <Overview d={d} ctx={ctx} openReport={setReport} />}
              {tab === "workforce" && <Workforce d={d} ctx={ctx} reload={load} />}
              {tab === "tasks" && <Tasks d={d} A={A} reload={load} openReport={setReport} ctx={ctx} />}
              {tab === "finance" && <Finance d={d} />}
              {tab === "operations" && <Operations d={d} ctx={ctx} />}
              {tab === "sales" && <Sales d={d} />}
              {tab === "reports" && <Reports d={d} A={A} openReport={setReport} />}
              {tab === "briefings" && <Briefings d={d} ctx={ctx} />}
              {tab === "approvals" && <Approvals d={d} A={A} ctx={ctx} />}
              {tab === "settings" && <Settings d={d} ctx={ctx} reload={load} />}
            </>
          )}
        </div>
      </div>
    </ModalFrame>
  );
}

function Overview({ d, ctx, openReport }: any) {
  const L = d.fin.latest;
  const months = d.fin.months.slice(-12);
  const runwayMonths = L && L.profit < 0 ? Math.floor(L.cash / -L.profit) : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><h2 className="text-lg font-bold flex-1">Company Overview</h2><DemoBadge source={d.fin.source} /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={`Revenue · ${L?.month}`} value={money(L?.revenue)} sub={`${pct(d.fin.previous ? ((L.revenue - d.fin.previous.revenue) / d.fin.previous.revenue) * 100 : null)} MoM`} tone="#4fc1b0" />
        <Kpi label="Expenses" value={money(L?.expenses)} sub={`${pct(d.fin.previous ? ((L.expenses - d.fin.previous.expenses) / d.fin.previous.expenses) * 100 : null)} MoM`} tone="#e8697d" />
        <Kpi label="Profit" value={money(L?.profit)} sub={`${L ? Math.round((L.profit / L.revenue) * 100) : 0}% margin`} tone={L?.profit >= 0 ? "#f2c14e" : "#e8697d"} />
        <Kpi label="Cash position" value={money(L?.cash)} sub={runwayMonths ? `${runwayMonths} months runway` : "Cash-flow positive"} tone="#6fa8ff" />
      </div>
      <div className="grid lg:grid-cols-3 gap-3">
        <Card title="Revenue vs. expenses (12 mo)"><Bars data={months.map((m: any) => m.revenue)} second={months.map((m: any) => m.expenses)} labels={months.map((m: any) => m.month.slice(5))} /><div className="text-xs text-hq-mute"><span className="text-hq-teal">■</span> revenue <span className="text-hq-rose">■</span> expenses</div></Card>
        <Card title="Critical alerts" right={<Badge tone="rose">{d.alerts.length}</Badge>}>
          <ul className="space-y-1 max-h-48 overflow-auto scroll-thin">{d.alerts.length ? d.alerts.map((a: any, i: number) => <li key={i} className={a.level === "critical" ? "text-hq-rose" : a.level === "high" ? "text-hq-gold" : ""}>• {a.text}</li>) : <li className="text-hq-mute">All clear.</li>}</ul>
        </Card>
        <Card title="Company goals" right={<DemoBadge source={d.goals.source} />}>
          {d.goals.goals.map((g: any) => { const p = Math.min(100, Math.round((g.current / g.target) * 100)); return <div key={g.id} className="mb-2"><div className="flex justify-between text-xs"><span>{g.title}</span><span>{g.unit === "$" ? money(g.current) : g.current} / {g.unit === "$" ? money(g.target) : g.target}</span></div><div className="h-2 bg-[#1b1726] rounded mt-1"><div className="h-2 rounded bg-hq-gold" style={{ width: `${p}%` }} /></div></div>; })}
        </Card>
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        <Card title="AI workforce right now">{d.agents.map((a: any) => <div key={a.id} className="flex items-center gap-2 py-1"><AvatarPreview avatar={a.avatar} scale={1.5} /><b className="w-20">{a.name}</b><span className="text-hq-mute flex-1 truncate">{a.title}</span><Badge tone={a.status === "working" ? "sky" : a.status === "finished" ? "teal" : a.status === "waiting" ? "gold" : "mute"}>{a.status}</Badge></div>)}</Card>
        <Card title="Latest reports">{d.reports.slice(0, 8).map((r: any) => <button key={r.id} onClick={() => openReport(r.id)} className="w-full text-left flex gap-2 py-1 hover:text-hq-gold"><span className="flex-1 truncate">{r.title}</span><span className="text-hq-mute text-xs">{ago(r.createdAt)}</span></button>)}{!d.reports.length && <p className="text-hq-mute">No reports yet — assign some work!</p>}</Card>
      </div>
      <button className="px-btn" onClick={() => ctx.open({ t: "meetingSetup" })}>📅 SCHEDULE A MEETING</button>
    </div>
  );
}

function Workforce({ d, ctx, reload }: any) {
  const [agents, setAgents] = useState<any[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [edit, setEdit] = useState<string | null>(null);
  const load = useCallback(() => api("/api/agents").then((r) => { setAgents(r.agents); setTools(r.tools); }), []);
  useEffect(() => { load(); }, [load]);
  const totalCost = agents.reduce((s, a) => s + a.metrics.costUsd, 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><h2 className="text-lg font-bold flex-1">AI Workforce</h2><span className="text-hq-mute text-sm">AI spend to date: ${totalCost.toFixed(2)}</span><button className="px-btn px-btn-gold" onClick={() => ctx.open({ t: "hire" })}>+ HIRE</button></div>
      <table>
        <thead><tr><th></th><th>Employee</th><th>Status</th><th>Current assignment</th><th>Done</th><th>Open</th><th>Success</th><th>Cost</th><th></th></tr></thead>
        <tbody>{agents.map((a) => {
          const cur = d.tasks.find((t: any) => t.agentId === a.id && ["working", "queued"].includes(t.status));
          return <tr key={a.id}><td><AvatarPreview avatar={a.avatar} scale={1.5} /></td><td><b>{a.name}</b><div className="text-hq-mute text-xs">{a.title}</div></td><td><Badge tone={a.status === "working" ? "sky" : a.status === "finished" ? "teal" : "mute"}>{a.status}</Badge></td><td className="max-w-[220px] truncate">{cur?.title ?? "—"}</td><td>{a.metrics.completed}</td><td>{a.metrics.open}</td><td>{a.metrics.successRate ?? "—"}{a.metrics.successRate != null && "%"}</td><td>${a.metrics.costUsd.toFixed(2)}</td><td><button className="px-btn !text-[8px]" onClick={() => setEdit(edit === a.id ? null : a.id)}>CONFIGURE</button></td></tr>;
        })}</tbody>
      </table>
      {edit && <AgentConfig agent={agents.find((a) => a.id === edit)} tools={tools} ctx={ctx} onSaved={() => { load(); reload(); ctx.refreshWorld(); setEdit(null); }} />}
    </div>
  );
}

function AgentConfig({ agent, tools, ctx, onSaved }: any) {
  const [f, setF] = useState({ name: agent.name, title: agent.title, roleDescription: agent.roleDescription, personality: agent.personality, permissions: agent.permissions as string[] });
  const [detail, setDetail] = useState<any>(null);
  useEffect(() => { api(`/api/agents/${agent.id}`).then(setDetail); }, [agent.id]);
  const HIGH = ["send_external_message", "spend_money", "delete_data", "modify_system", "launch_campaign"];
  const save = async () => { try { await api(`/api/agents/${agent.id}`, { method: "PATCH", body: f }); ctx.toast({ title: `${f.name} updated`, tone: "good" }); onSaved(); } catch (e) { ctx.toast({ title: "Save failed", body: (e as Error).message, tone: "bad" }); } };
  const remove = async () => { if (!confirm(`Remove ${agent.name}? Their queued work is cancelled; history is kept.`)) return; try { await api(`/api/agents/${agent.id}`, { method: "DELETE" }); ctx.toast({ title: `${agent.name} has left the company`, tone: "warn" }); onSaved(); } catch (e) { ctx.toast({ title: "Can't remove", body: (e as Error).message, tone: "bad" }); } };
  return (
    <Card title={`Configure ${agent.name}`}>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="block text-xs text-hq-mute">Name<input className="px-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="block text-xs text-hq-mute">Title<input className="px-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="block text-xs text-hq-mute">Role<textarea className="px-input min-h-[80px]" value={f.roleDescription} onChange={(e) => setF({ ...f, roleDescription: e.target.value })} /></label>
          <label className="block text-xs text-hq-mute">Personality<input className="px-input" value={f.personality} onChange={(e) => setF({ ...f, personality: e.target.value })} /></label>
        </div>
        <div>
          <div className="text-xs text-hq-mute mb-1">Tool permissions (server-enforced). 🔐 = always requires your approval.</div>
          <div className="grid grid-cols-2 gap-1">{tools.map((t: string) => <label key={t} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.permissions.includes(t)} onChange={(e) => setF({ ...f, permissions: e.target.checked ? [...f.permissions, t] : f.permissions.filter((x) => x !== t) })} />{HIGH.includes(t) && "🔐"}{t}</label>)}</div>
        </div>
      </div>
      {detail && <div className="grid md:grid-cols-2 gap-3 mt-3">
        <div><div className="text-xs text-hq-mute mb-1">Memory ({detail.memories.length})</div><ul className="text-xs space-y-1 max-h-40 overflow-auto scroll-thin">{detail.memories.map((m: any) => <li key={m.id}>• <Badge>{m.kind}</Badge> {m.content}</li>)}</ul></div>
        <div><div className="text-xs text-hq-mute mb-1">Activity log</div><ul className="text-xs space-y-1 max-h-40 overflow-auto scroll-thin">{detail.activity.map((a: any) => <li key={a.id}><span className="text-hq-mute">{ago(a.createdAt)}</span> {a.action}: {a.detail}</li>)}</ul></div>
      </div>}
      <div className="flex gap-2 mt-3"><button className="px-btn px-btn-gold" onClick={save}>SAVE</button><span className="flex-1" />{agent.key !== "ea" && <button className="px-btn px-btn-rose" onClick={remove}>REMOVE EMPLOYEE</button>}</div>
    </Card>
  );
}

function Tasks({ d, A, reload, openReport, ctx }: any) {
  const [filter, setFilter] = useState("all");
  const tasks = d.tasks.filter((t: any) => filter === "all" || t.status === filter);
  const act = async (id: string, action: string) => { try { await api(`/api/tasks/${id}`, { method: "PATCH", body: { action } }); reload(); } catch (e) { ctx.toast({ title: "Couldn't update task", body: (e as Error).message, tone: "bad" }); } };
  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center flex-wrap"><h2 className="text-lg font-bold flex-1">Assignments</h2>{["all", "queued", "working", "awaiting_approval", "complete", "failed"].map((s) => <button key={s} className={`px-btn !text-[8px] ${filter === s ? "px-btn-gold" : ""}`} onClick={() => setFilter(s)}>{s.replace("_", " ")}</button>)}</div>
      <table><thead><tr><th>Assignment</th><th>Owner</th><th>Priority</th><th>Source</th><th>Status</th><th>Created</th><th></th></tr></thead>
        <tbody>{tasks.map((t: any) => <tr key={t.id}><td className="max-w-[320px]"><b>{t.title}</b>{t.error && <div className="text-hq-rose text-xs">{t.error}</div>}{t.deadline && <div className="text-xs text-hq-mute">due {new Date(t.deadline).toLocaleDateString()}</div>}{new Date(t.runAfter) > new Date() && <div className="text-xs text-hq-sky">starts {new Date(t.runAfter).toLocaleString()}</div>}</td><td>{A(t.agentId)?.title ?? "—"}</td><td>{t.priority}</td><td>{t.source}</td><td><Badge tone={statusTone(t.status)}>{t.status.replace("_", " ")}</Badge></td><td className="text-xs">{ago(t.createdAt)}</td>
          <td className="whitespace-nowrap">{t.reportId && <button className="px-btn !text-[8px]" onClick={() => openReport(t.reportId)}>VIEW</button>} {["queued", "awaiting_approval"].includes(t.status) && <button className="px-btn !text-[8px]" onClick={() => act(t.id, "cancel")}>CANCEL</button>} {["failed", "cancelled"].includes(t.status) && <button className="px-btn !text-[8px]" onClick={() => act(t.id, "retry")}>RETRY</button>}</td></tr>)}</tbody></table>
      {!tasks.length && <p className="text-hq-mute">No assignments.</p>}
    </div>
  );
}

function Finance({ d }: any) {
  const m = d.fin.months.slice(-12);
  const labels = [...m.map((x: any) => x.month.slice(5)), ...d.forecast.revenue.map((_: number, i: number) => `+${i + 1}`)];
  const L = d.fin.latest;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><h2 className="text-lg font-bold flex-1">Financial Command Center</h2><DemoBadge source={d.fin.source} /></div>
      <div className="grid lg:grid-cols-2 gap-3">
        <Card title="Revenue trend + 6-month linear forecast"><Line labels={labels} series={[{ values: [...m.map((x: any) => x.revenue), ...d.forecast.revenue.map(() => null)], color: "#4fc1b0" }, { values: [...m.map(() => null).slice(0, -1), m.at(-1).revenue, ...d.forecast.revenue], color: "#4fc1b0", dashed: true }, { values: [...m.map((x: any) => x.expenses), ...d.forecast.expenses.map(() => null)], color: "#e8697d" }, { values: [...m.map(() => null).slice(0, -1), m.at(-1).expenses, ...d.forecast.expenses], color: "#e8697d", dashed: true }]} /><p className="text-xs text-hq-mute">Dashed = least-squares trend projection. Ask your CFO for a full forecast with assumptions.</p></Card>
        <Card title={`Budget vs. actual (${d.variance[0]?.month ?? ""})`}><table><thead><tr><th>Category</th><th>Budget</th><th>Actual</th><th>Variance</th></tr></thead><tbody>{d.variance.map((v: any) => <tr key={v.category}><td className="capitalize">{v.category}</td><td>{money(v.budget)}</td><td>{money(v.actual)}</td><td className={v.variancePct > 10 ? "text-hq-rose" : v.variancePct < -5 ? "text-hq-teal" : ""}>{pct(v.variancePct)}</td></tr>)}</tbody></table></Card>
      </div>
      <Card title="Profit & loss"><div className="overflow-auto scroll-thin"><table><thead><tr><th>Month</th><th>Revenue</th>{Object.keys(L?.breakdown ?? {}).map((k) => <th key={k} className="capitalize">{k}</th>)}<th>Expenses</th><th>Profit</th><th>Cash</th><th>Source</th></tr></thead><tbody>{[...m].reverse().map((x: any) => <tr key={x.month}><td>{x.month}</td><td>{money(x.revenue)}</td>{Object.keys(L?.breakdown ?? {}).map((k) => <td key={k}>{money(x.breakdown[k])}</td>)}<td>{money(x.expenses)}</td><td className={x.profit < 0 ? "text-hq-rose" : ""}>{money(x.profit)}</td><td>{money(x.cash)}</td><td className="text-xs">{x.sources.join("+")}</td></tr>)}</tbody></table></div></Card>
      <div className="grid lg:grid-cols-3 gap-3">
        <Kpi label="Balance sheet · cash" value={money(L?.cash)} sub="Assets beyond cash require QuickBooks" />
        <Kpi label="Operating cash flow (mo)" value={money(L?.profit)} sub="Approximated as revenue − expenses" />
        <Kpi label="Customers" value={String(L?.customers ?? "—")} sub={`ARPA ${money(L ? L.revenue / Math.max(1, L.customers) : null)}`} />
      </div>
    </div>
  );
}

function Operations({ d, ctx }: any) {
  const intervene = async (id: string) => { await api(`/api/projects/${id}`, { body: { action: "intervene" } }); ctx.toast({ title: "COO assigned to unblock the project", tone: "good" }); };
  const open = d.tasks.filter((t: any) => ["queued", "working", "awaiting_approval"].includes(t.status));
  const done7 = d.tasks.filter((t: any) => t.status === "complete" && Date.now() - new Date(t.completedAt).getTime() < 7 * 86400e3);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><h2 className="text-lg font-bold flex-1">Operations</h2><DemoBadge source={d.proj.source} /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Projects on track" value={`${d.proj.projects.filter((p: any) => p.status === "on_track").length}/${d.proj.projects.length}`} tone="#4fc1b0" />
        <Kpi label="Delayed" value={String(d.proj.delayed.length)} tone="#e8697d" /><Kpi label="Open AI assignments" value={String(open.length)} /><Kpi label="Completed (7 days)" value={String(done7.length)} tone="#f2c14e" />
      </div>
      <Card title="Active projects"><table><thead><tr><th>Project</th><th>Owner</th><th>Status</th><th>Progress</th><th>Deadline</th><th>Bottleneck</th><th></th></tr></thead><tbody>{d.proj.projects.map((p: any) => <tr key={p.id}><td><b>{p.name}</b></td><td>{p.ownerKey.toUpperCase()}</td><td><Badge tone={p.status === "delayed" ? "rose" : p.status === "at_risk" ? "gold" : "teal"}>{p.status.replace("_", " ")}</Badge></td><td><div className="w-24 h-2 bg-[#1b1726] rounded"><div className="h-2 bg-hq-teal rounded" style={{ width: `${p.progress}%` }} /></div></td><td>{new Date(p.dueDate).toLocaleDateString()}</td><td className="text-xs max-w-[220px]">{p.blockers || "—"}</td><td>{p.status !== "on_track" && <button className="px-btn !text-[8px]" onClick={() => intervene(p.id)}>INTERVENE</button>}</td></tr>)}</tbody></table></Card>
      <Card title="Live platform health" right={<Badge tone="teal">LIVE</Badge>}><table><thead><tr><th>Service</th><th>Status</th><th>Latency</th><th>Note</th></tr></thead><tbody>{d.health.checks.map((c: any) => <tr key={c.id}><td>{c.service}</td><td><Badge tone={c.status === "healthy" ? "teal" : c.status === "down" ? "rose" : "gold"}>{c.status}</Badge></td><td>{c.latencyMs} ms</td><td className="text-xs">{c.note}</td></tr>)}</tbody></table></Card>
    </div>
  );
}

function Sales({ d }: any) {
  const stages = ["conversation", "meeting", "proposal", "negotiation"];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><h2 className="text-lg font-bold flex-1">Sales &amp; Marketing</h2><DemoBadge source={d.pipe.source} /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Open pipeline" value={money(d.pipe.total)} tone="#6fa8ff" /><Kpi label="Weighted" value={money(d.pipe.weighted)} tone="#4fc1b0" /><Kpi label="Win rate" value={d.pipe.winRate != null ? `${d.pipe.winRate}%` : "—"} /><Kpi label="Partner meetings booked" value={String(d.camp.campaigns.reduce((s: number, c: any) => s + c.meetings, 0))} tone="#f2c14e" />
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        <Card title="Pipeline by stage"><Bars data={stages.map((s) => d.pipe.byStage[s]?.value ?? 0)} labels={stages} color="#6fa8ff" /></Card>
        <Card title="Opportunities by lead source"><table><tbody>{Object.entries(d.pipe.bySource).sort((a: any, b: any) => b[1] - a[1]).map(([k, v]: any) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table></Card>
      </div>
      <Card title="Opportunities"><table><thead><tr><th>Account</th><th>Deal</th><th>Stage</th><th>Value</th><th>Prob.</th><th>Close</th><th>Source</th></tr></thead><tbody>{d.pipe.deals.map((x: any) => <tr key={x.id}><td>{x.account}</td><td>{x.name}</td><td>{x.stage}</td><td>{money(x.value)}</td><td>{x.probability}%</td><td>{new Date(x.closeDate).toLocaleDateString()}</td><td className="text-xs">{x.leadSource}</td></tr>)}</tbody></table></Card>
      <Card title="Campaigns (benchmarks: acceptance 20–35%, reply 5–15%)" right={<DemoBadge source={d.camp.source} />}><table><thead><tr><th>Campaign</th><th>Status</th><th>Sent</th><th>Acceptance</th><th>Reply</th><th>Meetings</th><th>Spend</th></tr></thead><tbody>{d.camp.campaigns.map((c: any) => <tr key={c.id}><td>{c.name}</td><td><Badge tone={c.status === "active" ? "teal" : "mute"}>{c.status}</Badge></td><td>{c.sent}</td><td className={c.acceptanceRate != null && c.acceptanceRate < 20 ? "text-hq-rose" : ""}>{c.acceptanceRate ?? "—"}%</td><td>{c.replyRate ?? "—"}%</td><td>{c.meetings}</td><td>{money(c.spend)}</td></tr>)}</tbody></table></Card>
    </div>
  );
}

function Reports({ d, A, openReport }: any) {
  const [type, setType] = useState("all");
  const types = ["all", ...new Set<string>(d.reports.map((r: any) => r.type))];
  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center flex-wrap"><h2 className="text-lg font-bold flex-1">Executive Reports</h2>{types.map((t) => <button key={t} className={`px-btn !text-[8px] ${type === t ? "px-btn-gold" : ""}`} onClick={() => setType(t)}>{t.replace("_", " ")}</button>)}</div>
      <table><thead><tr><th>Report</th><th>Author</th><th>Type</th><th>Data</th><th>Created</th></tr></thead><tbody>{d.reports.filter((r: any) => type === "all" || r.type === type).map((r: any) => <tr key={r.id} className="cursor-pointer hover:bg-[#30283f]" onClick={() => openReport(r.id)}><td><b>{r.title}</b></td><td>{A(r.agentId)?.title ?? "—"}</td><td>{r.type}</td><td><DemoBadge source={r.dataSource} /></td><td>{ago(r.createdAt)}</td></tr>)}</tbody></table>
      {!d.reports.length && <p className="text-hq-mute">No reports yet. Walk into an office and assign work, or wait for autonomous scans.</p>}
    </div>
  );
}

export function ReportView({ id, ctx, onBack }: { id: string; ctx: Ctx; onBack?: () => void }) {
  const [r, setR] = useState<any>(null);
  useEffect(() => { api(`/api/reports/${id}`).then(setR).catch((e) => ctx.toast({ title: "Report unavailable", body: e.message, tone: "bad" })); }, [id, ctx]);
  if (!r) return <p className="p-4">Loading…</p>;
  return (
    <div className="ui-font p-1" data-testid="report-view">
      {onBack && <button className="px-btn !text-[8px] mb-2" onClick={onBack}>◀ BACK</button>}
      <h2 className="text-xl font-bold">{r.report.title}</h2>
      <div className="flex gap-2 items-center text-sm text-hq-mute my-1 flex-wrap">{r.agent && <span>By {r.agent.name}, {r.agent.title}</span>}<span>· {new Date(r.report.createdAt).toLocaleString()}</span><DemoBadge source={r.report.dataSource} /></div>
      {r.approvals.length > 0 && <div className="bg-[#3b2a14] border border-hq-gold rounded p-2 my-2 text-sm">{r.approvals.map((a: any) => <div key={a.id} className="flex items-center gap-2">🔐 {a.summary} <Badge tone={statusTone(a.status)}>{a.status}</Badge>{a.status === "pending" && <button className="px-btn !text-[8px]" onClick={() => ctx.open({ t: "approval", id: a.id })}>REVIEW</button>}</div>)}</div>}
      <Markdown text={r.report.content} className="text-[14px]" />
    </div>
  );
}

function Briefings({ d, ctx }: any) {
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-bold">Briefing history</h2>
      <table><thead><tr><th>Date</th><th>Type</th><th>Greeting</th><th>Status</th><th></th></tr></thead><tbody>{d.briefings.map((b: any) => <tr key={b.id}><td>{b.date}</td><td>{b.kind === "eod" ? "End of day" : "Morning"}</td><td className="max-w-[420px]">{b.greeting}{b.ceoNotes && <div className="text-xs text-hq-teal">Your notes: {b.ceoNotes}</div>}</td><td><Badge>{b.status}</Badge></td><td>{b.kind === "morning" && <button className="px-btn !text-[8px]" onClick={() => ctx.open({ t: "briefing", view: "full", id: b.id })}>OPEN</button>}</td></tr>)}</tbody></table>
    </div>
  );
}

function Approvals({ d, A, ctx }: any) {
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-bold">Approvals</h2>
      <p className="text-hq-mute text-sm">AI employees must request approval before sending external messages, spending money, deleting data, modifying critical systems, or launching campaigns. Enforced server-side.</p>
      <table><thead><tr><th>Request</th><th>From</th><th>Action</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>{d.approvals.map((a: any) => <tr key={a.id}><td className="max-w-[360px]">{a.summary}{a.executionLog && <div className="text-xs text-hq-mute">{a.executionLog}</div>}</td><td>{A(a.agentId)?.title}</td><td>{a.action}</td><td><Badge tone={statusTone(a.status)}>{a.status}</Badge></td><td>{ago(a.createdAt)}</td><td><button className="px-btn !text-[8px]" onClick={() => ctx.open({ t: "approval", id: a.id })}>{["pending", "postponed"].includes(a.status) ? "DECIDE" : "VIEW"}</button></td></tr>)}</tbody></table>
    </div>
  );
}

function Settings({ d, ctx, reload }: any) {
  const [ints, setInts] = useState<any[]>([]);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [s, setS] = useState(ctx.world.company.settings);
  const load = useCallback(() => api("/api/integrations").then((r) => setInts(r.connectors)), []);
  useEffect(() => { load(); }, [load]);
  const connect = async (c: any) => {
    if (c.authType === "oauth2") { window.location.href = `/api/integrations/${c.id}/connect`; return; }
    try { await api(`/api/integrations/${c.id}`, { body: { apiKey: keys[c.id] } }); ctx.toast({ title: `${c.name} connected`, body: "Credentials verified and encrypted. Initial sync queued.", tone: "good" }); load(); reload(); }
    catch (e) { ctx.toast({ title: `${c.name} not connected`, body: (e as Error).message, tone: "bad" }); }
  };
  const disconnect = async (c: any) => { await api(`/api/integrations/${c.id}`, { method: "DELETE" }); load(); };
  const sync = async (c: any) => { await api(`/api/integrations/${c.id}/sync`, { body: {} }); ctx.toast({ title: `${c.name} sync queued` }); };
  const saveSettings = async (patch: any) => { const n = { ...s, ...patch }; setS(n); await api("/api/me", { method: "PUT", body: { settings: patch } }); ctx.refreshWorld(); };
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Company Settings</h2>
      <Card title="Integrations">
        <p className="text-xs text-hq-mute mb-2">Connectors only show as connected after credentials are verified with the provider. Credentials are encrypted (AES-256-GCM) and never shown to AI employees. Until connected, agents use clearly-labelled demo data.</p>
        <div className="grid md:grid-cols-2 gap-2">{ints.map((c) => (
          <div key={c.id} className="bg-[#1b1726] rounded p-2 border border-[#3a3150]">
            <div className="flex items-center gap-2"><b className="flex-1">{c.name}</b><Badge>{c.category}</Badge><Badge tone={c.status === "connected" ? "teal" : c.status === "error" ? "rose" : "mute"}>{c.status}</Badge></div>
            <p className="text-xs text-hq-mute my-1">{c.description} Scopes: {c.scopes.join(", ")}</p>
            {c.lastError && <p className="text-xs text-hq-rose">Last error: {c.lastError}</p>}
            {c.lastSyncAt && <p className="text-xs text-hq-mute">Last sync {ago(c.lastSyncAt)}</p>}
            {c.status === "connected" ? <div className="flex gap-2 mt-1"><button className="px-btn !text-[8px]" onClick={() => sync(c)}>SYNC NOW</button><button className="px-btn px-btn-rose !text-[8px]" onClick={() => disconnect(c)}>DISCONNECT</button></div>
              : c.authType === "api_key" ? <div className="flex gap-2 mt-1"><input className="px-input !text-sm" type="password" placeholder={c.keyHint} value={keys[c.id] ?? ""} onChange={(e) => setKeys({ ...keys, [c.id]: e.target.value })} /><button className="px-btn px-btn-teal !text-[8px]" disabled={!keys[c.id]} onClick={() => connect(c)}>CONNECT</button></div>
              : c.configured ? <button className="px-btn px-btn-teal !text-[8px] mt-1" onClick={() => connect(c)}>CONNECT WITH OAUTH</button>
              : <p className="text-xs text-hq-gold mt-1">Not configured on this server — an administrator must set the OAuth client credentials (see README).</p>}
          </div>))}</div>
      </Card>
      <div className="grid md:grid-cols-2 gap-3">
        <Card title="Briefings & interruptions">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.autoBriefing !== false} onChange={(e) => saveSettings({ autoBriefing: e.target.checked })} /> Automatic morning briefing on arrival</label>
          <label className="flex items-center gap-2 text-sm mt-1"><input type="checkbox" checked={s.endOfDayRecap !== false} onChange={(e) => saveSettings({ endOfDayRecap: e.target.checked })} /> Offer an end-of-day recap when leaving</label>
          <label className="block text-sm mt-2">Agents may walk over to interrupt me for:
            <select className="px-input mt-1" value={s.interruptionLevel ?? "important"} onChange={(e) => saveSettings({ interruptionLevel: e.target.value })}><option value="all">Anything (normal and above)</option><option value="important">Important (high and critical)</option><option value="critical">Critical only</option><option value="none">Never — inbox only</option></select></label>
        </Card>
        <Card title="Security">
          <ul className="text-sm space-y-1 list-disc pl-4">
            <li>Tenant isolation: every query is scoped to your company.</li>
            <li>High-impact agent actions require your approval (server-enforced).</li>
            <li>External emails/documents are wrapped as untrusted content; agents are instructed never to follow embedded instructions.</li>
            <li>Integration credentials encrypted at rest; sessions are signed, httpOnly cookies.</li>
          </ul>
        </Card>
      </div>
      <Card title="Audit log">
        <table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead><tbody>{d.audit.map((a: any) => <tr key={a.id}><td className="text-xs">{ago(a.createdAt)}</td><td className="text-xs">{a.actor}</td><td>{a.action}</td><td className="text-xs">{a.target}</td></tr>)}</tbody></table>
      </Card>
      <Card title="Agent activity">
        <ul className="text-xs space-y-1 max-h-60 overflow-auto scroll-thin">{d.activity.map((a: any) => <li key={a.id}><span className="text-hq-mute">{ago(a.createdAt)}</span> <b>{d.agents.find((x: any) => x.id === a.agentId)?.title ?? "system"}</b> {a.action}: {a.detail}</li>)}</ul>
      </Card>
    </div>
  );
}
