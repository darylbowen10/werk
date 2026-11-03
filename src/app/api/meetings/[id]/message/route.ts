import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, requireSession, HttpError } from "@/lib/auth";
import { enqueue } from "@/lib/jobs/queue";

const Body = z.object({ text: z.string().min(1).max(3000) });
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { companyId } = await requireSession();
  const meeting = await db.meeting.findFirst({ where: { id: (await params).id, companyId, status: "active" } });
  if (!meeting) throw new HttpError(404, "Meeting not active");
  const { text } = Body.parse(await req.json());
  await db.message.create({ data: { companyId, conversationId: meeting.conversationId, role: "ceo", content: text } });
  await enqueue(companyId, "meeting.turn", { meetingId: meeting.id });
  return NextResponse.json({ ok: true });
});
