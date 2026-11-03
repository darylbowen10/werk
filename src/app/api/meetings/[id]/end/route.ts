import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, requireSession, HttpError } from "@/lib/auth";
import { enqueue } from "@/lib/jobs/queue";

export const POST = handle(async (_: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { companyId } = await requireSession();
  const meeting = await db.meeting.findFirst({ where: { id: (await params).id, companyId } });
  if (!meeting) throw new HttpError(404, "Not found");
  await enqueue(companyId, "meeting.notes", { meetingId: meeting.id }, { dedupeKey: `notes:${meeting.id}` });
  return NextResponse.json({ ok: true });
});
