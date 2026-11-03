import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, requireSession } from "@/lib/auth";

export const GET = handle(async (req: Request) => {
  const { companyId } = await requireSession();
  const status = new URL(req.url).searchParams.get("status");
  const approvals = await db.approval.findMany({ where: { companyId, ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ approvals });
});
