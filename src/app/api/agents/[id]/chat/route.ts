import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, requireSession, HttpError } from "@/lib/auth";
import { chat } from "@/lib/agents/engine";

const Body = z.object({ text: z.string().min(1).max(4000), conversationId: z.string(), mode: z.enum(["chat", "walk"]).default("chat") });

export const maxDuration = 300;

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { companyId } = await requireSession();
  const { id } = await params;
  const b = Body.parse(await req.json());
  const conv = await db.conversation.findFirst({ where: { id: b.conversationId, companyId } });
  if (!conv) throw new HttpError(404, "Conversation not found");
  return NextResponse.json(await chat(companyId, id, conv.id, b.text, b.mode));
});
