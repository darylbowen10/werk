// Browser demo: the game's REST API implemented in-page on top of the real server modules.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db";
import { createCompanyDefaults } from "@/lib/demo";
import { chat, greeting } from "@/lib/agents/engine";
import { ALL_TOOLS, BASE_TOOLS } from "@/lib/agents/roster";
import { createTask, notify, todayKey } from "@/lib/ops";
import { enqueue } from "@/lib/jobs/queue";
import { prepareMorning, prepareEod, scheduleNextDayInstructions } from "@/lib/briefing";
import { decide } from "@/lib/approvals";
import { audit } from "@/lib/audit";
import * as data from "@/lib/data";
import { listConnectors } from "@/lib/connectors";
import { DEFAULT_AVATAR, sanitizeAvatar } from "@/shared/avatar";
import { ROOMS, VACANT_ROOMS } from "@/shared/map";
import { validateLayout } from "@/shared/placement";

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const SESSION_KEY = "exechq-demo-session";
let session: { userId: string; companyId: string } | null = null;
try { session = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null"); } catch { session = null; }
const setSession = (s: typeof session) => { session = s; try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } };

export function hasSession() { return Boolean(session); }
export function clearSession() { setSession(null); }

async function me() {
  if (!session) throw new HttpError(401, "Not signed in");
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) { setSession(null); throw new HttpError(401, "Not signed in"); }
  return { user, companyId: user.companyId as string };
}

type H = (m: RegExpMatchArray, body: any, q: URLSearchParams) => Promise<unknown>;
const routes: [string, RegExp, H][] = [];
const r = (method: string, pattern: string, h: H) => routes.push([method, new RegExp("^" + pattern.replace(/:\w+/g, "([^/]+)") + "$"), h]);

// ---------------- auth ----------------
r("POST", "/api/auth/signup", async (_m, b) => {
  const email = String(b.email ?? "").toLowerCase();
  if (!b.name || !b.companyName || !email) throw new HttpError(400, "Please fill in every field");
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) { setSession({ userId: existing.id, companyId: existing.companyId }); return { ok: true }; }
  const company = await db.company.create({ data: { name: b.companyName, logo: { symbol: String(b.companyName).slice(0, 2).toUpperCase(), color: "#f2c14e", bg: "#262035" }, settings: { autoBriefing: true, endOfDayRecap: true, interruptionLevel: "important", onboarded: false } } });
  const user = await db.user.create({ data: { email, name: b.name, passwordHash: "browser-demo", avatar: DEFAULT_AVATAR, companyId: company.id } });
  await createCompanyDefaults(company.id);
  setSession({ userId: user.id, companyId: company.id });
  return { ok: true };
});
r("POST", "/api/auth/login", async (_m, b) => {
  const user = await db.user.findUnique({ where: { email: String(b.email ?? "").toLowerCase() } });
  if (!user) throw new HttpError(401, "No headquarters with that email in this browser. Found a company instead.");
  setSession({ userId: user.id, companyId: user.companyId });
  return { ok: true };
});
r("POST", "/api/auth/logout", async () => { const { user } = await me(); await db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }); return { ok: true }; });

// ---------------- profile / world ----------------
r("GET", "/api/me", async () => { const { user, companyId } = await me(); return { user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar }, company: await db.company.findUnique({ where: { id: companyId } }), ai: "offline" }; });
r("PUT", "/api/me", async (_m, b) => {
  const { user, companyId } = await me();
  if (b.name || b.avatar) await db.user.update({ where: { id: user.id }, data: { ...(b.name ? { name: b.name } : {}), ...(b.avatar ? { avatar: sanitizeAvatar(b.avatar) } : {}) } });
  if (b.companyName || b.logo || b.settings) {
    const c = await db.company.findUnique({ where: { id: companyId } });
    await db.company.update({ where: { id: companyId }, data: { ...(b.companyName ? { name: b.companyName } : {}), ...(b.logo ? { logo: b.logo } : {}), ...(b.settings ? { settings: { ...c.settings, ...b.settings } } : {}) } });
  }
  return { ok: true };
});
r("GET", "/api/world", async () => {
  const { user, companyId } = await me();
  const agents = await db.agent.findMany({ where: { companyId, isActive: true }, orderBy: { createdAt: "asc" } });
  return {
    user: { id: user.id, name: user.name, avatar: user.avatar }, company: await db.company.findUnique({ where: { id: companyId } }),
    agents: agents.map((a: any) => ({ id: a.id, key: a.key, name: a.name, title: a.title, department: a.department, office: a.office, avatar: a.avatar, status: a.status, statusNote: a.statusNote })),
    furniture: await db.furnitureItem.findMany({ where: { companyId } }),
    unread: await db.notification.count({ where: { companyId, read: false } }), approvals: await db.approval.count({ where: { companyId, status: "pending" } }), ai: "offline",
  };
});

// ---------------- agents ----------------
r("GET", "/api/agents", async () => {
  const { companyId } = await me();
  const agents = await db.agent.findMany({ where: { companyId, isActive: true }, orderBy: { createdAt: "asc" } });
  const tasks = await db.task.groupBy({ by: ["agentId", "status"], where: { companyId }, _count: true });
  return {
    tools: ALL_TOOLS, vacant: VACANT_ROOMS.filter((v) => !agents.some((a: any) => a.office === v)),
    agents: agents.map((a: any) => { const c = (s: string) => tasks.filter((t: any) => t.agentId === a.id && t.status === s).reduce((n: number, t: any) => n + t._count, 0); const done = c("complete"), failed = c("failed"); return { ...a, metrics: { completed: done, failed, open: c("queued") + c("working") + c("awaiting_approval"), successRate: done + failed ? Math.round((done / (done + failed)) * 100) : null, costUsd: 0 } }; }),
  };
});
r("POST", "/api/agents", async (_m, b) => {
  const { user, companyId } = await me();
  if (!VACANT_ROOMS.includes(b.office)) throw new HttpError(400, "Choose a vacant office");
  if (await db.agent.findFirst({ where: { companyId, office: b.office, isActive: true } })) throw new HttpError(409, "That office is already occupied");
  const permissions = [...new Set([...BASE_TOOLS, ...(b.permissions ?? []).filter((p: string) => (ALL_TOOLS as readonly string[]).includes(p))])];
  const agent = await db.agent.create({ data: { companyId, key: `custom-${String(b.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)}-${Math.random().toString(36).slice(2, 6)}`, name: b.name, title: b.title, department: b.department, roleDescription: b.roleDescription, responsibilities: b.responsibilities ?? [], objectives: b.objectives ?? [], personality: b.personality ?? "", avatar: sanitizeAvatar(b.avatar), office: b.office, permissions } });
  await audit(companyId, `user:${user.id}`, "agent.hired", agent.id, { title: agent.title });
  await notify(companyId, { agentId: agent.id, kind: "info", title: `${agent.name} joined as ${agent.title}`, body: `Now working from ${ROOMS.find((x) => x.key === b.office)?.name ?? b.office}.` });
  return { agent };
});
r("GET", "/api/agents/:id", async (m) => {
  const { companyId } = await me(); const id = m[1];
  const agent = await db.agent.findFirst({ where: { id, companyId } }); if (!agent) throw new HttpError(404, "Not found");
  return { agent, tasks: await db.task.findMany({ where: { companyId, agentId: id }, orderBy: { createdAt: "desc" }, take: 30 }), memories: await db.agentMemory.findMany({ where: { companyId, agentId: id }, orderBy: { createdAt: "desc" }, take: 30 }), activity: await db.activityLog.findMany({ where: { companyId, agentId: id }, orderBy: { createdAt: "desc" }, take: 40 }) };
});
r("PATCH", "/api/agents/:id", async (m, b) => {
  const { user, companyId } = await me();
  if (!(await db.agent.findFirst({ where: { id: m[1], companyId } }))) throw new HttpError(404, "Not found");
  const { avatar, permissions, ...rest } = b;
  const agent = await db.agent.update({ where: { id: m[1] }, data: { ...rest, ...(avatar ? { avatar: sanitizeAvatar(avatar) } : {}), ...(permissions ? { permissions: permissions.filter((p: string) => (ALL_TOOLS as readonly string[]).includes(p)) } : {}) } });
  await audit(companyId, `user:${user.id}`, "agent.configured", m[1], b);
  return { agent };
});
r("DELETE", "/api/agents/:id", async (m) => {
  const { user, companyId } = await me();
  const agent = await db.agent.findFirst({ where: { id: m[1], companyId } }); if (!agent) throw new HttpError(404, "Not found");
  if (agent.key === "ea") throw new HttpError(400, "The Executive Assistant runs your briefings and can't be removed.");
  await db.agent.update({ where: { id: agent.id }, data: { isActive: false, office: `former:${agent.office}` } });
  await db.task.updateMany({ where: { agentId: agent.id, status: { in: ["queued"] } }, data: { status: "cancelled" } });
  await audit(companyId, `user:${user.id}`, "agent.removed", agent.id, { title: agent.title });
  return { ok: true };
});
r("GET", "/api/agents/:id/greeting", async (m) => { const { companyId } = await me(); return greeting(companyId, m[1]); });
r("GET", "/api/agents/:id/conversation", async (m, _b, q) => {
  const { companyId } = await me(); const kind = q.get("kind") ?? "direct";
  const agent = await db.agent.findFirst({ where: { id: m[1], companyId } }); if (!agent) throw new HttpError(404, "Not found");
  let conversation = await db.conversation.findFirst({ where: { companyId, agentId: m[1], kind }, orderBy: { updatedAt: "desc" } });
  if (!conversation) conversation = await db.conversation.create({ data: { companyId, agentId: m[1], kind, title: `${agent.title} — ${kind}` } });
  return { conversation, messages: await db.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "asc" }, take: 200 }) };
});
r("POST", "/api/agents/:id/chat", async (m, b) => { const { companyId } = await me(); await sleep(500 + Math.random() * 600); return chat(companyId, m[1], b.conversationId, String(b.text).slice(0, 4000), b.mode ?? "chat"); });

// ---------------- tasks, reports, approvals, notifications ----------------
r("GET", "/api/tasks", async (_m, _b, q) => { const { companyId } = await me(); return { tasks: await db.task.findMany({ where: { companyId, ...(q.get("agentId") ? { agentId: q.get("agentId") } : {}), ...(q.get("status") ? { status: q.get("status") } : {}) }, orderBy: { createdAt: "desc" }, take: 100 }) }; });
r("POST", "/api/tasks", async (_m, b) => {
  const { companyId } = await me();
  const agent = await db.agent.findFirst({ where: { id: b.agentId, companyId, isActive: true } }); if (!agent) throw new HttpError(404, "Employee not found");
  const deadline = b.deadline ? new Date(b.deadline) : null;
  return { task: await createTask(companyId, { agentId: agent.id, title: b.title, description: b.description || b.title, priority: b.priority, deadline: deadline && !isNaN(+deadline) ? deadline : null, source: "ceo" }) };
});
r("PATCH", "/api/tasks/:id", async (m, b) => {
  const { companyId } = await me();
  const task = await db.task.findFirst({ where: { id: m[1], companyId } }); if (!task) throw new HttpError(404, "Not found");
  if (b.action === "cancel" && ["queued", "awaiting_approval"].includes(task.status)) await db.task.update({ where: { id: task.id }, data: { status: "cancelled" } });
  else if (b.action === "retry" && ["failed", "cancelled"].includes(task.status)) { await db.task.update({ where: { id: task.id }, data: { status: "queued", error: null, runAfter: new Date() } }); await enqueue(companyId, "task.execute", { taskId: task.id }); }
  else throw new HttpError(400, `Can't ${b.action} a ${task.status} task`);
  return { task: await db.task.findUnique({ where: { id: task.id } }) };
});
r("GET", "/api/reports", async () => { const { companyId } = await me(); return { reports: await db.report.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 100 }) }; });
r("GET", "/api/reports/:id", async (m) => {
  const { companyId } = await me();
  const report = await db.report.findFirst({ where: { id: m[1], companyId } }); if (!report) throw new HttpError(404, "Not found");
  return { report, agent: report.agentId ? await db.agent.findUnique({ where: { id: report.agentId } }) : null, approvals: report.taskId ? await db.approval.findMany({ where: { taskId: report.taskId, companyId } }) : [] };
});
r("GET", "/api/approvals", async (_m, _b, q) => { const { companyId } = await me(); return { approvals: await db.approval.findMany({ where: { companyId, ...(q.get("status") ? { status: q.get("status") } : {}) }, orderBy: { createdAt: "desc" }, take: 100 }) }; });
r("GET", "/api/approvals/:id", async (m) => { const { companyId } = await me(); const a = await db.approval.findFirst({ where: { id: m[1], companyId } }); if (!a) throw new HttpError(404, "Not found"); return { approval: a, agent: await db.agent.findUnique({ where: { id: a.agentId } }) }; });
r("POST", "/api/approvals/:id", async (m, b) => { const { user, companyId } = await me(); try { return { approval: await decide(companyId, user.id, m[1], b.decision, b.note, b.delegateTo) }; } catch (e) { throw new HttpError(400, (e as Error).message); } });
r("GET", "/api/notifications", async (_m, _b, q) => {
  const { companyId } = await me(); const since = q.get("since");
  return { notifications: await db.notification.findMany({ where: { companyId, ...(since ? { createdAt: { gt: new Date(since) } } : {}) }, orderBy: { createdAt: "desc" }, take: 100 }), unread: await db.notification.count({ where: { companyId, read: false } }) };
});
r("POST", "/api/notifications/read", async (_m, b) => { const { companyId } = await me(); await db.notification.updateMany({ where: { companyId, ...(b.all ? {} : { id: { in: b.ids ?? [] } }) }, data: { read: true } }); return { ok: true }; });
r("POST", "/api/notifications/:id", async (m) => { const { companyId } = await me(); await db.notification.updateMany({ where: { id: m[1], companyId }, data: { approached: true } }); return { ok: true }; });
r("POST", "/api/ideas/:id", async (m, b) => {
  const { companyId } = await me(); const idea = await db.idea.findFirst({ where: { id: m[1], companyId } }); if (!idea) throw new HttpError(404, "Not found");
  await db.idea.update({ where: { id: idea.id }, data: { status: b.status } });
  if (b.status === "accepted") await createTask(companyId, { agentId: idea.agentId, title: `Implement idea: ${idea.title}`, description: idea.body, source: "briefing" });
  return { ok: true };
});
r("POST", "/api/projects/:id", async (m, b) => {
  const { companyId } = await me(); const p = await db.project.findFirst({ where: { id: m[1], companyId } }); if (!p) throw new HttpError(404, "Not found");
  if (b.action === "postpone") return { ok: true };
  const coo = await db.agent.findFirst({ where: { companyId, key: "coo", isActive: true } }); if (!coo) throw new HttpError(400, "No COO on staff");
  return { task: await createTask(companyId, { agentId: coo.id, title: `CEO intervention: unblock ${p.name}`, description: `The CEO wants ${p.name} unblocked. Current blockers: ${p.blockers}. Propose a new date and the decisions needed.`, priority: "high", source: "briefing" }) };
});

// ---------------- briefings ----------------
r("GET", "/api/briefing/today", async (_m, _b, q) => {
  const { companyId } = await me();
  const company = await db.company.findUnique({ where: { id: companyId } });
  const existing = await db.briefing.findUnique({ where: { companyId_kind_date: { companyId, kind: "morning", date: todayKey() } } });
  const stale = existing?.status === "prepared" && Date.now() - new Date(existing.updatedAt).getTime() > 10 * 60_000;
  const b = await prepareMorning(companyId, { force: q.get("refresh") === "1" || stale });
  const ea = await db.agent.findFirst({ where: { companyId, key: "ea", isActive: true } });
  const auto = company.settings?.autoBriefing !== false;
  return { briefing: b, show: auto && b.status === "prepared", autoBriefing: auto, eaId: ea?.id ?? null };
});
r("GET", "/api/briefing/history", async () => { const { companyId } = await me(); return { briefings: await db.briefing.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 60 }) }; });
r("POST", "/api/briefing/eod", async () => { const { companyId } = await me(); return { briefing: await prepareEod(companyId) }; });
r("POST", "/api/briefing/eod/instructions", async (_m, b) => { const { companyId } = await me(); return { created: await scheduleNextDayInstructions(companyId, String(b.text)) }; });
r("GET", "/api/briefing/:id", async (m) => { const { companyId } = await me(); const b = await db.briefing.findFirst({ where: { id: m[1], companyId } }); if (!b) throw new HttpError(404, "Not found"); return { briefing: b }; });
r("POST", "/api/briefing/:id", async (m, body) => {
  const { companyId } = await me(); const b = await db.briefing.findFirst({ where: { id: m[1], companyId } }); if (!b) throw new HttpError(404, "Not found");
  await db.briefing.update({ where: { id: b.id }, data: { status: body.status, deliveredAt: body.status === "delivered" ? new Date() : b.deliveredAt } });
  if (body.status === "later") { const ea = await db.agent.findFirst({ where: { companyId, key: "ea" } }); await notify(companyId, { agentId: ea?.id, kind: "briefing", title: "Morning briefing saved for later", body: b.greeting, link: { type: "briefing", id: b.id } }); }
  return { ok: true };
});

// ---------------- dashboard ----------------
r("GET", "/api/dashboard", async () => {
  const { companyId } = await me();
  const [fin, pipe, camp, proj, goals, cal, health] = await Promise.all([data.financials(companyId), data.pipeline(companyId), data.campaigns(companyId), data.projects(companyId), data.goals(companyId), data.calendar(companyId, 7), data.systemHealth(companyId)]);
  const approvals = await db.approval.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 50 });
  const alerts = [
    ...proj.delayed.map((p: any) => ({ level: "high", text: `${p.name} is past due (${p.progress}%)` })),
    ...approvals.filter((a: any) => a.status === "pending").map((a: any) => ({ level: "high", text: `Approval needed: ${a.summary}` })),
    ...data.varianceVsBudget(fin, "previous").filter((v) => v.variancePct > 10).map((v) => ({ level: "medium", text: `${v.category} ${data.pct(v.variancePct)} over budget` })),
  ];
  return {
    fin, variance: data.varianceVsBudget(fin, "previous"), forecast: { revenue: data.linearForecast(fin.months.map((m) => m.revenue), 6), expenses: data.linearForecast(fin.months.map((m) => m.expenses), 6) },
    pipe, camp, proj, goals, cal, health, alerts, approvals,
    agents: await db.agent.findMany({ where: { companyId, isActive: true }, orderBy: { createdAt: "asc" } }),
    tasks: await db.task.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 150 }),
    reports: await db.report.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 80 }),
    ideas: await db.idea.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 20 }),
    integrations: [], activity: await db.activityLog.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 60 }),
    audit: await db.auditLog.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 60 }),
    briefings: await db.briefing.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 30 }),
  };
});

// ---------------- meetings ----------------
r("GET", "/api/meetings", async () => { const { companyId } = await me(); return { meetings: await db.meeting.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 20 }) }; });
r("POST", "/api/meetings", async (_m, b) => {
  const { companyId } = await me();
  const agents = await db.agent.findMany({ where: { id: { in: b.agentIds }, companyId, isActive: true } }); if (!agents.length) throw new HttpError(400, "No valid participants");
  const conv = await db.conversation.create({ data: { companyId, kind: "meeting", title: b.topic } });
  await db.message.create({ data: { companyId, conversationId: conv.id, role: "ceo", content: `Thanks for joining. Today's topic: ${b.topic}` } });
  const meeting = await db.meeting.create({ data: { companyId, topic: b.topic, agentIds: agents.map((a: any) => a.id), conversationId: conv.id } });
  await enqueue(companyId, "meeting.turn", { meetingId: meeting.id }, { runAt: new Date(Date.now() + 4000) });
  return { meeting };
});
r("GET", "/api/meetings/:id", async (m) => {
  const { companyId } = await me(); const meeting = await db.meeting.findFirst({ where: { id: m[1], companyId } }); if (!meeting) throw new HttpError(404, "Not found");
  const busy = await db.job.count({ where: { companyId, type: { in: ["meeting.turn", "meeting.notes"] }, status: { in: ["queued", "running"] }, payload: { path: ["meetingId"], equals: meeting.id } } });
  return { meeting, messages: await db.message.findMany({ where: { conversationId: meeting.conversationId }, orderBy: { createdAt: "asc" } }), busy: busy > 0 };
});
r("POST", "/api/meetings/:id/message", async (m, b) => {
  const { companyId } = await me(); const meeting = await db.meeting.findFirst({ where: { id: m[1], companyId, status: "active" } }); if (!meeting) throw new HttpError(404, "Meeting not active");
  await db.message.create({ data: { companyId, conversationId: meeting.conversationId, role: "ceo", content: b.text } });
  await enqueue(companyId, "meeting.turn", { meetingId: meeting.id });
  return { ok: true };
});
r("POST", "/api/meetings/:id/end", async (m) => { const { companyId } = await me(); await enqueue(companyId, "meeting.notes", { meetingId: m[1] }, { dedupeKey: `notes:${m[1]}` }); return { ok: true }; });

// ---------------- furniture & integrations ----------------
r("GET", "/api/furniture", async () => { const { companyId } = await me(); return { items: await db.furnitureItem.findMany({ where: { companyId } }) }; });
r("PUT", "/api/furniture", async (_m, b) => {
  const { companyId } = await me();
  const err = validateLayout(b.items); if (err) throw new HttpError(400, err);
  await db.furnitureItem.deleteMany({ where: { companyId, room: "ceo" } });
  await db.furnitureItem.createMany({ data: b.items.map((i: any) => ({ ...i, companyId, room: "ceo" })) });
  return { items: await db.furnitureItem.findMany({ where: { companyId } }) };
});
r("GET", "/api/integrations", async () => ({ connectors: listConnectors().map((c) => ({ ...c, configured: false, canSend: false, status: "disconnected" })) }));

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function handleApi(method: string, url: string, rawBody?: string): Promise<{ status: number; body: unknown }> {
  const u = new URL(url, "http://demo.local");
  const body = rawBody ? JSON.parse(rawBody) : {};
  for (const [m, re, h] of routes) {
    if (m !== method) continue;
    const match = u.pathname.match(re);
    if (match) {
      try { return { status: 200, body: await h(match, body, u.searchParams) }; }
      catch (e) { return e instanceof HttpError ? { status: e.status, body: { error: e.message } } : (console.error(e), { status: 500, body: { error: (e as Error).message } }); }
    }
  }
  if (u.pathname.startsWith("/api/integrations")) return { status: 400, body: { error: "Integrations need the full server version of Executive HQ." } };
  return { status: 404, body: { error: `No demo route for ${method} ${u.pathname}` } };
}
