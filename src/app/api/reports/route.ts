import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, requireSession } from "@/lib/auth";

export const GET = handle(async (req: Request) => {
  const { companyId } = await requireSession();
  const type = new URL(req.url).searchParams.get("type");
  const reports = await db.report.findMany({ where: { companyId, ...(type ? { type } : {}) }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, title: true, type: true, agentId: true, dataSource: true, createdAt: true, taskId: true } });
  return NextResponse.json({ reports });
});
