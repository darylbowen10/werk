import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, requireSession, HttpError } from "@/lib/auth";

/** Latest direct conversation with this agent (persistent history). */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { companyId } = await requireSession();
  const { id } = await params;
  const kind = new URL(req.url).searchParams.get("kind") ?? "direct";
  const agent = await db.agent.findFirst({ where: { id, companyId } });
  if (!agent) throw new HttpError(404, "Not found");
  let conv = await db.conversation.findFirst({ where: { companyId, agentId: id, kind }, orderBy: { updatedAt: "desc" } });
  if (!conv) conv = await db.conversation.create({ data: { companyId, agentId: id, kind, title: `${agent.title} — ${kind}` } });
  const messages = await db.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: "asc" }, take: 200 });
  return NextResponse.json({ conversation: conv, messages });
});
