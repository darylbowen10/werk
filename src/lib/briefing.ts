// Executive Assistant briefings. Built ONLY from persisted company activity + connected/demo data.
import { db } from "./db";
import * as data from "./data";
import { money, pct } from "./data";
import { aiEnabled, quickText } from "./agents/llm";
import { INJECTION } from "./agents/offline";
import { routeToAgentKey } from "./agents/roster";
import { createTask, notify, todayKey } from "./ops";
import { publish } from "./realtime";

export type DecisionItem = { kind: "approval" | "idea" | "project"; id: string; title: string; agent: string; agentKey: string; details: string };

const SHORT: Record<string, string> = { ea: "Assistant", cfo: "CFO", coo: "COO", cmo: "CMO", cro: "CRO", cto: "CTO", hr: "Head of People" };

export async function gatherMorning(companyId: string, since: Date) {
  const agents = await db.agent.findMany({ where: { companyId } });
  const short = (id: string | null) => { const a = agents.find((x) => x.id === id); return a ? SHORT[a.key] ?? a.title : ""; };
  const A = (id: string | null) => agents.find((a) => a.id === id);
  const fin = await data.financials(companyId);
  const proj = await data.projects(companyId);
  const pipe = await data.pipeline(companyId);
  const camp = await data.campaigns(companyId);
  const cal = await data.calendar(companyId);
  const box = await data.inbox(companyId);

  const completed = await db.task.findMany({ where: { companyId, status: { in: ["complete", "awaiting_approval"] }, completedAt: { gte: since } }, orderBy: { completedAt: "asc" } });
  const awaiting = await db.task.findMany({ where: { companyId, status: "awaiting_approval", createdAt: { gte: since } } });
  const doneOvernight = [...completed, ...awaiting.filter((t) => !completed.find((c) => c.id === t.id))];
  const working = await db.task.findMany({ where: { companyId, status: { in: ["working", "queued"] } }, orderBy: { createdAt: "asc" }, take: 10 });
  const failed = await db.task.findMany({ where: { companyId, status: "failed", createdAt: { gte: since } } });
  const approvals = await db.approval.findMany({ where: { companyId, status: { in: ["pending", "postponed"] } }, orderBy: { createdAt: "asc" } });
  const ideas = await db.idea.findMany({ where: { companyId, status: "new" }, orderBy: { createdAt: "desc" }, take: 5 });
  const latestReport = async (key: string) => {
    const a = agents.find((x) => x.key === key);
    if (!a) return null;
    const r = await db.report.findFirst({ where: { companyId, agentId: a.id }, orderBy: { createdAt: "desc" } });
    return r ? { id: r.id, title: r.title, recommendation: extractRecommendation(r.content) } : null;
  };

  const L = fin.latest, P = fin.previous;
  const over = data.varianceVsBudget(fin, "previous").filter((v) => v.variancePct > 10);
  const newOpps = pipe.open.filter((d) => d.createdAt >= since || Date.now() - d.createdAt.getTime() < 24 * 3600_000);

  const decisions: DecisionItem[] = [
    ...approvals.map((a) => ({ kind: "approval" as const, id: a.id, title: a.summary, agent: A(a.agentId)?.title ?? "Agent", agentKey: A(a.agentId)?.key ?? "", details: a.details })),
    ...ideas.map((i) => ({ kind: "idea" as const, id: i.id, title: i.title, agent: A(i.agentId)?.title ?? "Agent", agentKey: A(i.agentId)?.key ?? "", details: i.body })),
    ...proj.delayed.map((p) => ({ kind: "project" as const, id: p.id, title: `${p.name} is past due — intervene?`, agent: agents.find((a) => a.key === p.ownerKey)?.title ?? p.ownerKey.toUpperCase(), agentKey: p.ownerKey, details: p.blockers || "Blocked" })),
  ];

  return {
    since: since.toISOString(),
    financial: {
      source: fin.source,
      month: L?.month, revenue: L?.revenue ?? null, expenses: L?.expenses ?? null, profit: L?.profit ?? null, cash: L?.cash ?? null,
      revenueChangePct: L && P ? ((L.revenue - P.revenue) / P.revenue) * 100 : null,
      expensesChangePct: L && P ? ((L.expenses - P.expenses) / P.expenses) * 100 : null,
      flags: over.map((v) => `${v.category} ${pct(v.variancePct)} over budget (${v.month})`),
      cfo: await latestReport("cfo"),
    },
    operations: {
      source: proj.source,
      completed: doneOvernight.map((t) => ({ id: t.id, title: t.title, agent: A(t.agentId)?.title ?? "", short: short(t.agentId), agentKey: A(t.agentId)?.key ?? "", reportId: t.reportId, status: t.status })),
      delayed: proj.delayed.map((p) => ({ name: p.name, owner: p.ownerKey.toUpperCase(), blockers: p.blockers, due: p.dueDate.toISOString().slice(0, 10) })),
      atRisk: proj.atRisk.map((p) => ({ name: p.name, owner: p.ownerKey.toUpperCase(), blockers: p.blockers })),
      coo: await latestReport("coo"),
    },
    sales: {
      source: data.sourceLabel([pipe.source, camp.source]),
      newOpportunities: newOpps.map((d) => ({ account: d.account, name: d.name, value: d.value, leadSource: d.leadSource })),
      openPipeline: pipe.total, weighted: pipe.weighted,
      campaigns: camp.campaigns.filter((c) => c.status === "active").map((c) => ({ name: c.name, acceptanceRate: c.acceptanceRate, replyRate: c.replyRate, meetings: c.meetings })),
      cro: await latestReport("cro"),
    },
    calendar: {
      source: data.sourceLabel([cal.source, box.source]),
      events: cal.events.map((e) => ({ title: e.title, start: e.start.toISOString(), end: e.end.toISOString(), attendees: e.attendees })),
      conflicts: cal.conflicts,
      important: box.messages.filter((m) => m.important && !INJECTION.test(m.snippet)).map((m) => ({ from: m.sender, subject: m.subject })),
      pendingResponses: box.needsResponse.length,
      suspicious: box.messages.filter((m) => INJECTION.test(m.snippet)).map((m) => ({ from: m.sender, subject: m.subject })),
    },
    workforce: {
      completed: doneOvernight.length,
      working: working.map((t) => ({ title: t.title, agent: A(t.agentId)?.title ?? "", status: t.status })),
      failed: failed.map((t) => ({ title: t.title, agent: A(t.agentId)?.title ?? "", error: t.error })),
      pendingApprovals: approvals.length,
      ideas: ideas.map((i) => ({ id: i.id, title: i.title, agent: A(i.agentId)?.title ?? "" })),
    },
    strategic: {
      recommendations: [
        ...(over.length ? [`Review ${over.map((o) => o.category).join(", ")} spend with the CFO — over budget last month.`] : []),
        ...(proj.delayed.length ? [`${proj.delayed.length} delayed project${proj.delayed.length > 1 ? "s" : ""} need a recovery plan from the COO.`] : []),
        ...(newOpps.length ? [`Follow up on ${newOpps.length} new opportunit${newOpps.length > 1 ? "ies" : "y"} while they're warm.`] : []),
        ...(cal.conflicts.length ? [`Resolve ${cal.conflicts.length} calendar conflict${cal.conflicts.length > 1 ? "s" : ""} today.`] : []),
      ],
    },
    decisions,
    isQuiet: doneOvernight.length === 0 && newOpps.length === 0 && approvals.length === 0 && failed.length === 0,
  };
}

export type MorningContent = Awaited<ReturnType<typeof gatherMorning>>;

function extractRecommendation(md: string) {
  const m = md.split(/\n## Recommendations\n/i)[1];
  if (!m) return null;
  const first = m.split("\n").find((l) => l.trim().startsWith("-"));
  return first ? first.replace(/^-\s*/, "").replace(/\*\*/g, "").slice(0, 220) : null;
}

const NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const n = (x: number) => NUM[x] ?? String(x);

export function templateGreeting(c: MorningContent, ceoFirst: string) {
  const h = new Date().getHours();
  const hello = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  if (c.isQuiet) {
    return `${hello}, ${ceoFirst}! It was a quiet stretch — no new reports or decisions since you were last in. You have ${n(c.calendar.events.length)} meeting${c.calendar.events.length === 1 ? "" : "s"} today. Want a quick rundown?`;
  }
  const bits: string[] = [];
  const first = c.operations.completed[0];
  if (first) bits.push(`your ${(first as { short?: string }).short || first.agent} finished "${first.title}"${c.operations.completed.length > 1 ? ` (plus ${n(c.operations.completed.length - 1)} more)` : ""}`);
  const flagged = c.operations.delayed.length + c.operations.atRisk.length;
  if (flagged) bits.push(`the COO flagged ${n(flagged)} project issue${flagged > 1 ? "s" : ""}`);
  if (c.sales.newOpportunities.length) bits.push(`sales found ${n(c.sales.newOpportunities.length)} new opportunit${c.sales.newOpportunities.length > 1 ? "ies" : "y"}`);
  if (c.workforce.pendingApprovals) bits.push(`${n(c.workforce.pendingApprovals)} decision${c.workforce.pendingApprovals > 1 ? "s are" : " is"} waiting on you`);
  const list = bits.length > 1 ? `${bits.slice(0, -1).join(", ")}, and ${bits.at(-1)}` : bits[0];
  return `${hello}, ${ceoFirst}! ${list.charAt(0).toUpperCase() + list.slice(1)}. Want the full briefing?`;
}

/** Prepare (or refresh) today's morning briefing. Idempotent per company per day. */
export async function prepareMorning(companyId: string, opts: { force?: boolean } = {}) {
  const date = todayKey();
  const existing = await db.briefing.findUnique({ where: { companyId_kind_date: { companyId, kind: "morning", date } } });
  if (existing && !opts.force) return existing;
  const prev = await db.briefing.findFirst({ where: { companyId, kind: "morning", date: { not: date } }, orderBy: { createdAt: "desc" } });
  const ceo = await db.user.findFirst({ where: { companyId } });
  const since = prev ? prev.createdAt : new Date(Date.now() - 24 * 3600_000);
  const content = await gatherMorning(companyId, since);
  const first = (ceo?.name ?? "boss").split(" ")[0];
  let greeting = templateGreeting(content, first), generatedBy = "offline";
  if (aiEnabled()) {
    try {
      const facts = {
        completed: content.operations.completed.map((c) => `${c.agent}: ${c.title}`), projectIssues: content.operations.delayed.length + content.operations.atRisk.length,
        newOpportunities: content.sales.newOpportunities.length, pendingDecisions: content.workforce.pendingApprovals, meetingsToday: content.calendar.events.length, quiet: content.isQuiet,
      };
      const g = await quickText(
        "You are Avery, a warm, upbeat Executive Assistant greeting the CEO as they arrive at the office. Use ONLY the facts given; never add numbers or events that are not listed. 1–2 short spoken sentences, ending by offering the full briefing. Plain text.",
        `CEO first name: ${first}. Time: ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.\nFacts: ${JSON.stringify(facts)}`,
      );
      if (g) { greeting = g; generatedBy = "claude"; }
    } catch (e) { console.error("[briefing] greeting fallback:", (e as Error).message); }
  }
  const row = await db.briefing.upsert({
    where: { companyId_kind_date: { companyId, kind: "morning", date } },
    create: { companyId, kind: "morning", date, greeting, content: content as object, generatedBy },
    update: { greeting, content: content as object, generatedBy },
  });
  await publish(companyId, { type: "briefing", id: row.id });
  return row;
}

export async function gatherEod(companyId: string) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const tomorrow = new Date(start); tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(tomorrow); dayAfter.setDate(dayAfter.getDate() + 1);
  const agents = await db.agent.findMany({ where: { companyId } });
  const A = (id: string) => agents.find((a) => a.id === id)?.title ?? "";
  const done = await db.task.findMany({ where: { companyId, status: "complete", completedAt: { gte: start } } });
  const open = await db.task.findMany({ where: { companyId, status: { in: ["queued", "working", "awaiting_approval"] } }, orderBy: { runAfter: "asc" } });
  const schedules = await db.schedule.findMany({ where: { companyId, enabled: true, nextRunAt: { lt: dayAfter } } });
  const events = await db.calendarEvent.findMany({ where: { companyId, start: { gte: tomorrow, lt: dayAfter } }, orderBy: { start: "asc" } });
  const due = await db.task.findMany({ where: { companyId, deadline: { gte: tomorrow, lt: dayAfter }, status: { notIn: ["complete", "cancelled"] } } });
  const proj = await data.projects(companyId);
  const approvals = await db.approval.count({ where: { companyId, status: "pending" } });
  const meetings = await db.meeting.count({ where: { companyId, createdAt: { gte: start } } });
  return {
    accomplished: done.map((t) => ({ title: t.title, agent: A(t.agentId), reportId: t.reportId })),
    meetingsHeld: meetings,
    unfinished: open.map((t) => ({ title: t.title, agent: A(t.agentId), status: t.status })),
    next: [
      ...open.filter((t) => t.status === "queued").map((t) => ({ what: t.title, who: A(t.agentId), when: t.runAfter.toISOString() })),
      ...schedules.map((s) => ({ what: s.name, who: s.agentId ? A(s.agentId) : "", when: s.nextRunAt.toISOString() })),
    ],
    tomorrow: {
      events: events.map((e) => ({ title: e.title, start: e.start.toISOString(), source: e.source })),
      deadlines: due.map((t) => ({ title: t.title, agent: A(t.agentId) })),
      risks: proj.delayed.map((p) => `${p.name} remains delayed (${p.ownerKey.toUpperCase()})`),
      pendingApprovals: approvals,
    },
    source: proj.source,
  };
}

export async function prepareEod(companyId: string) {
  const date = todayKey();
  const content = await gatherEod(companyId);
  const ceo = await db.user.findFirst({ where: { companyId } });
  const first = (ceo?.name ?? "boss").split(" ")[0];
  const greeting = content.accomplished.length
    ? `Heading out, ${first}? The team wrapped ${n(content.accomplished.length)} assignment${content.accomplished.length > 1 ? "s" : ""} today${content.unfinished.length ? ` and ${n(content.unfinished.length)} ${content.unfinished.length > 1 ? "are" : "is"} still in progress` : ""}. Want the recap before you go?`
    : `Heading out, ${first}? It was a lighter day — nothing new was completed${content.unfinished.length ? `, though ${n(content.unfinished.length)} assignment${content.unfinished.length > 1 ? "s are" : " is"} still in progress` : ""}. Want the recap?`;
  return db.briefing.upsert({
    where: { companyId_kind_date: { companyId, kind: "eod", date } },
    create: { companyId, kind: "eod", date, greeting, content: content as object },
    update: { greeting, content: content as object },
  });
}

/** CEO's instructions for tomorrow → scheduled assignments that start next morning. */
export async function scheduleNextDayInstructions(companyId: string, text: string) {
  const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(7, 0, 0, 0);
  let items: { assignee: string; title: string; description: string; priority?: string }[] = [];
  if (aiEnabled()) {
    try {
      const raw = await quickText(
        "Split the CEO's end-of-day instructions into discrete assignments for an AI leadership team. Keys: ea (assistant), cfo, coo, cmo, cro, cto, hr. Output strict JSON array only.",
        `Instructions:\n${text}\n\nReturn: [{"assignee": key, "title": short title, "description": full instruction, "priority": "low"|"normal"|"high"|"urgent"}]`,
      );
      items = JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim());
    } catch (e) { console.error("[eod] parse fallback:", (e as Error).message); }
  }
  if (!items.length) {
    items = text.split(/\n+|(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter((s) => s.length > 6)
      .map((s) => ({ assignee: routeToAgentKey(s), title: s.replace(/[.!?]+$/, "").slice(0, 80), description: s }));
  }
  const created = [];
  for (const it of items) {
    const agent = await db.agent.findFirst({ where: { companyId, key: it.assignee, isActive: true } }) ?? await db.agent.findFirst({ where: { companyId, key: "ea" } });
    if (!agent) continue;
    const t = await createTask(companyId, { agentId: agent.id, title: it.title, description: it.description, priority: it.priority, source: "briefing", runAfter: start });
    created.push({ id: t.id, title: t.title, agent: agent.title, runAfter: start.toISOString() });
  }
  await db.briefing.updateMany({ where: { companyId, kind: "eod", date: todayKey() }, data: { ceoNotes: text } });
  if (created.length) await notify(companyId, { kind: "info", priority: "low", title: "Tomorrow's assignments scheduled", body: `${created.length} assignment${created.length > 1 ? "s" : ""} will start at 7:00 tomorrow.` });
  return created;
}

export { money };
