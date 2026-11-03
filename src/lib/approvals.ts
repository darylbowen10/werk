// CEO decisions on high-impact actions. Execution happens in the worker and only within authorised scopes.
import { db } from "./db";
import { audit } from "./audit";
import { enqueue } from "./jobs/queue";
import { createTask, logActivity, notify, setAgentStatus } from "./ops";
import { publish } from "./realtime";
import { getConnector } from "./connectors";

export async function decide(companyId: string, userId: string, approvalId: string, decision: "approved" | "rejected" | "postponed" | "delegated", note?: string, delegateTo?: string) {
  const a = await db.approval.findFirst({ where: { id: approvalId, companyId } });
  if (!a) throw new Error("Approval not found");
  if (!["pending", "postponed"].includes(a.status)) throw new Error(`Approval already ${a.status}`);
  await db.approval.update({ where: { id: a.id }, data: { status: decision, decisionNote: note ?? null, decidedAt: new Date() } });
  await audit(companyId, `user:${userId}`, `approval.${decision}`, a.id, { action: a.action, summary: a.summary });
  if (decision === "approved") await enqueue(companyId, "approval.execute", { approvalId: a.id });
  if (decision === "delegated") {
    const target = await db.agent.findFirst({ where: { companyId, key: delegateTo ?? "coo", isActive: true } });
    if (target) await createTask(companyId, { agentId: target.id, title: `Review request: ${a.summary.slice(0, 120)}`, description: `The CEO delegated this decision to you. Assess it and recommend approve/reject with reasoning. Original request details:\n${a.details}\n\nCEO note: ${note ?? "(none)"}`, source: "briefing" });
  }
  if (decision === "rejected" || decision === "delegated") await settleTask(a.taskId);
  await publish(companyId, { type: "approval", id: a.id });
  return db.approval.findUnique({ where: { id: a.id } });
}

async function settleTask(taskId: string | null) {
  if (!taskId) return;
  const pending = await db.approval.count({ where: { taskId, status: { in: ["pending", "postponed"] } } });
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!pending && task?.status === "awaiting_approval") {
    await db.task.update({ where: { id: taskId }, data: { status: "complete", completedAt: new Date() } });
    await setAgentStatus(task.companyId, task.agentId, "finished", task.title);
    await publish(task.companyId, { type: "task", id: taskId, status: "complete", agentId: task.agentId });
  }
}

/** Worker: carry out an approved action. Never claims success for actions no integration can perform. */
export async function executeApproval(approvalId: string) {
  const a = await db.approval.findUnique({ where: { id: approvalId } });
  if (!a || a.status !== "approved" || a.executionLog) return;
  const p = a.payload as Record<string, unknown>;
  let log = "";
  switch (a.action) {
    case "send_external_message": {
      const provider = p.channel === "slack" ? "slack" : "gmail";
      const conn = getConnector(provider);
      const integ = await db.integration.findUnique({ where: { companyId_provider: { companyId: a.companyId, provider } } });
      if (conn?.send && integ?.status === "connected") {
        try { log = await conn.send(a.companyId, { to: String(p.to ?? ""), subject: String(p.subject ?? ""), body: String(p.body ?? p.request ?? "") }); }
        catch (e) { log = `Send failed: ${(e as Error).message}`; }
      } else {
        await db.report.create({ data: { companyId: a.companyId, agentId: a.agentId, title: `Draft message to ${p.to ?? "recipient"}`, type: "general", content: `**Approved draft — not sent.** No ${provider} integration is connected, so nothing was sent automatically.\n\n**To:** ${p.to ?? "(unspecified)"}\n**Subject:** ${p.subject ?? ""}\n\n${p.body ?? p.request ?? ""}`, dataSource: "agent draft" } });
        log = `Approved. No ${provider} integration is connected, so the message was saved as a draft report instead of being sent.`;
      }
      break;
    }
    case "spend_money":
      log = `Approved spend recorded in the audit log. Executive HQ does not move money automatically — complete the payment of ${p.amount ?? "the approved amount"} to ${p.vendor ?? "the vendor"} through your finance system.`;
      break;
    case "launch_campaign": {
      const name = String(p.campaign ?? "");
      const c = name ? await db.campaign.findFirst({ where: { companyId: a.companyId, name: { contains: name.slice(0, 40), mode: "insensitive" } } }) : null;
      if (c) { await db.campaign.update({ where: { id: c.id }, data: { status: "active" } }); log = `Campaign "${c.name}" marked active in Executive HQ (${c.source} record). No external ad platform is connected, so nothing was launched externally.`; }
      else log = "Approved. No matching campaign record was found and no marketing platform is connected; the plan is recorded for manual launch.";
      break;
    }
    case "delete_data": {
      const id = String(p.id ?? "");
      const ent = String(p.entity ?? "");
      const where = { id, companyId: a.companyId };
      const n = ent === "report" ? (await db.report.deleteMany({ where })).count : ent === "task" ? (await db.task.deleteMany({ where })).count : ent === "campaign" ? (await db.campaign.deleteMany({ where })).count : ent === "project" ? (await db.project.deleteMany({ where })).count : 0;
      log = n ? `Deleted ${ent} ${id}.` : `No ${ent} with id ${id} found; nothing deleted.`;
      break;
    }
    case "modify_system":
      log = `Change approved and recorded for implementation: ${p.change ?? p.request ?? ""}. Executive HQ agents cannot modify external infrastructure directly; implement through your change-management process.`;
      break;
    default:
      log = "Approved; no automated execution path for this action.";
  }
  await db.approval.update({ where: { id: a.id }, data: { executionLog: log } });
  await audit(a.companyId, "system", "approval.executed", a.id, { log });
  await logActivity(a.companyId, a.agentId, "approval.executed", log.slice(0, 300));
  await notify(a.companyId, { agentId: a.agentId, kind: "info", priority: "low", title: "Approved action processed", body: log.slice(0, 300), link: { type: "approval", id: a.id } });
  await settleTask(a.taskId);
}
