import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, requireSession, HttpError } from "@/lib/auth";

export const GET = handle(async (_: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { companyId } = await requireSession();
  const meeting = await db.meeting.findFirst({ where: { id: (await params).id, companyId } });
  if (!meeting) throw new HttpError(404, "Not found");
  const messages = await db.message.findMany({ where: { conversationId: meeting.conversationId }, orderBy: { createdAt: "asc" } });
  const pending = await db.job.count({ where: { companyId, type: { in: ["meeting.turn", "meeting.notes"] }, status: { in: ["queued", "running"] }, payload: { path: ["meetingId"], equals: meeting.id } } });
  return NextResponse.json({ meeting, messages, busy: pending > 0 });
});
