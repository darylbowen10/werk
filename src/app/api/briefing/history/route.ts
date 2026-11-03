import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, requireSession } from "@/lib/auth";

export const GET = handle(async () => {
  const { companyId } = await requireSession();
  const briefings = await db.briefing.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 60, select: { id: true, kind: true, date: true, greeting: true, status: true, generatedBy: true, createdAt: true, ceoNotes: true } });
  return NextResponse.json({ briefings });
});
