// Shared operations used by API routes, the agent engine and the worker.
import { db } from "./db";
import { publish } from "./realtime";
import { enqueue } from "./jobs/queue";

export type Priority = "low" | "normal" | "high" | "critical";

export async function logActivity(companyId: string, agentId: string | null, action: string, detail: string) {
  await db.activityLog.create({ data: { companyId, agentId, action, detail } });
}

export async function setAgentStatus(companyId: string, agentId: string, status: "idle" | "working" | "waiting" | "finished", note = "") {
  await db.agent.update({ where: { id: agentId }, data: { status, statusNote: note.slice(0, 140) } });
  await publish(companyId, { type: "agent", id: agentId, status, note });
}

export async function notify(companyId: string, n: { agentId?: string | null; kind: string; priority?: Priority; title: string; body: string; link?: { type: string; id: string } }) {
  const row = await db.notification.create({ data: { companyId, agentId: n.agentId ?? null, kind: n.kind, priority: n.priority ?? "normal", title: n.title, body: n.body, link: n.link } });
  await publish(companyId, { type: "notification", id: row.id });
  return row;
}

export async function createTask(companyId: string, t: { agentId: string; title: string; description: string; priority?: string; deadline?: Date | null; source?: string; requestedBy?: string | null; runAfter?: Date }) {
  const priority = ["low", "normal", "high", "urgent"].includes(t.priority ?? "") ? t.priority! : "normal";
  const task = await db.task.create({
    data: { companyId, agentId: t.agentId, title: t.title.slice(0, 200), description: t.description.slice(0, 4000), priority, deadline: t.deadline ?? null, source: t.source ?? "ceo", requestedBy: t.requestedBy ?? null, runAfter: t.runAfter ?? new Date() },
  });
  await enqueue(companyId, "task.execute", { taskId: task.id }, { runAt: task.runAfter });
  await logActivity(companyId, t.agentId, "task.created", `${task.title} (${task.source}, ${priority})`);
  await publish(companyId, { type: "task", id: task.id, status: task.status, agentId: task.agentId });
  return task;
}

export async function createApproval(companyId: string, a: { agentId: string; taskId?: string | null; action: string; summary: string; details: string; payload: object; risk?: string }) {
  const row = await db.approval.create({ data: { companyId, agentId: a.agentId, taskId: a.taskId ?? null, action: a.action, summary: a.summary.slice(0, 300), details: a.details.slice(0, 4000), payload: a.payload, risk: a.risk ?? "high" } });
  const agent = await db.agent.findUnique({ where: { id: a.agentId } });
  await notify(companyId, { agentId: a.agentId, kind: "approval", priority: "high", title: `${agent?.title ?? "Agent"} requests approval`, body: a.summary, link: { type: "approval", id: row.id } });
  await publish(companyId, { type: "approval", id: row.id });
  return row;
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
