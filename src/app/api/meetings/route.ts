import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, requireSession, HttpError } from "@/lib/auth";
import { enqueue } from "@/lib/jobs/queue";

const Body = z.object({ agentIds: z.array(z.string()).min(1).max(6), topic: z.string().min(3).max(300) });

export const GET = handle(async () => {
  const { companyId } = await requireSession();
  return NextResponse.json({ meetings: await db.meeting.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 20 }) });
});

export const POST = handle(async (req: Request) => {
  const { companyId } = await requireSession();
  const b = Body.parse(await req.json());
  const agents = await db.agent.findMany({ where: { id: { in: b.agentIds }, companyId, isActive: true } });
  if (!agents.length) throw new HttpError(400, "No valid participants");
  const conv = await db.conversation.create({ data: { companyId, kind: "meeting", title: b.topic } });
  await db.message.create({ data: { companyId, conversationId: conv.id, role: "ceo", content: `Thanks for joining. Today's topic: ${b.topic}` } });
  const meeting = await db.meeting.create({ data: { companyId, topic: b.topic, agentIds: agents.map((a) => a.id), conversationId: conv.id } });
  await enqueue(companyId, "meeting.turn", { meetingId: meeting.id });
  return NextResponse.json({ meeting });
});
