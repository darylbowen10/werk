import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, requireSession, HttpError } from "@/lib/auth";
import { notify } from "@/lib/ops";

const Body = z.object({ status: z.enum(["delivered", "later", "dismissed"]) });

export const GET = handle(async (_: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { companyId } = await requireSession();
  const b = await db.briefing.findFirst({ where: { id: (await params).id, companyId } });
  if (!b) throw new HttpError(404, "Not found");
  return NextResponse.json({ briefing: b });
});

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { companyId } = await requireSession();
  const { id } = await params;
  const b = await db.briefing.findFirst({ where: { id, companyId } });
  if (!b) throw new HttpError(404, "Not found");
  const { status } = Body.parse(await req.json());
  await db.briefing.update({ where: { id }, data: { status, deliveredAt: status === "delivered" ? new Date() : b.deliveredAt } });
  if (status === "later") {
    const ea = await db.agent.findFirst({ where: { companyId, key: "ea" } });
    await notify(companyId, { agentId: ea?.id, kind: "briefing", priority: "normal", title: `${b.kind === "eod" ? "End-of-day recap" : "Morning briefing"} saved for later`, body: b.greeting, link: { type: "briefing", id } });
  }
  return NextResponse.json({ ok: true });
});
