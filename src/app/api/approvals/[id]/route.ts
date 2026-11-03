import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireSession, HttpError } from "@/lib/auth";
import { decide } from "@/lib/approvals";
import { db } from "@/lib/db";

const Body = z.object({ decision: z.enum(["approved", "rejected", "postponed", "delegated"]), note: z.string().max(1000).optional(), delegateTo: z.string().optional() });

export const GET = handle(async (_: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { companyId } = await requireSession();
  const a = await db.approval.findFirst({ where: { id: (await params).id, companyId } });
  if (!a) throw new HttpError(404, "Not found");
  const agent = await db.agent.findUnique({ where: { id: a.agentId }, select: { name: true, title: true } });
  return NextResponse.json({ approval: a, agent });
});

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user, companyId } = await requireSession();
  const b = Body.parse(await req.json());
  try { return NextResponse.json({ approval: await decide(companyId, user.id, (await params).id, b.decision, b.note, b.delegateTo) }); }
  catch (e) { throw new HttpError(400, (e as Error).message); }
});
