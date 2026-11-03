import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, requireSession } from "@/lib/auth";
import * as data from "@/lib/data";

/** Everything the CEO desk computer needs, scoped to the tenant and labelled by source. */
export const GET = handle(async () => {
  const { companyId } = await requireSession();
  const [fin, pipe, camp, proj, goals, cal, agents, tasks, approvals, reports, ideas, integrations, health, activity, audit, briefings] = await Promise.all([
    data.financials(companyId), data.pipeline(companyId), data.campaigns(companyId), data.projects(companyId), data.goals(companyId), data.calendar(companyId, 7),
    db.agent.findMany({ where: { companyId, isActive: true }, orderBy: { createdAt: "asc" } }),
    db.task.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 150 }),
    db.approval.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.report.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 80, select: { id: true, title: true, type: true, agentId: true, dataSource: true, createdAt: true } }),
    db.idea.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.integration.findMany({ where: { companyId }, select: { provider: true, status: true, connectedAt: true, lastSyncAt: true, lastError: true, scopes: true } }),
    data.systemHealth(companyId),
    db.activityLog.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 60 }),
    db.auditLog.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 60 }),
    db.briefing.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const alerts = [
    ...proj.delayed.map((p) => ({ level: "high", text: `${p.name} is past due (${p.progress}%)` })),
    ...approvals.filter((a) => a.status === "pending").map((a) => ({ level: "high", text: `Approval needed: ${a.summary}` })),
    ...data.varianceVsBudget(fin, "previous").filter((v) => v.variancePct > 10).map((v) => ({ level: "medium", text: `${v.category} ${data.pct(v.variancePct)} over budget` })),
    ...health.checks.filter((c) => c.status === "down").map((c) => ({ level: "critical", text: `${c.service} is down` })),
  ];
  return NextResponse.json({ fin, variance: data.varianceVsBudget(fin, "previous"), forecast: { revenue: data.linearForecast(fin.months.map((m) => m.revenue), 6), expenses: data.linearForecast(fin.months.map((m) => m.expenses), 6) }, pipe, camp, proj, goals, cal, agents, tasks, approvals, reports, ideas, integrations, health, activity, audit, briefings, alerts });
});
