import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, requireSession, HttpError } from "@/lib/auth";

export const GET = handle(async (_: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { companyId } = await requireSession();
  const report = await db.report.findFirst({ where: { id: (await params).id, companyId } });
  if (!report) throw new HttpError(404, "Not found");
  const agent = report.agentId ? await db.agent.findUnique({ where: { id: report.agentId }, select: { name: true, title: true } }) : null;
  const approvals = report.taskId ? await db.approval.findMany({ where: { taskId: report.taskId, companyId } }) : [];
  return NextResponse.json({ report, agent, approvals });
});
