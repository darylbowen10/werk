import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, requireSession, HttpError } from "@/lib/auth";
import { createTask } from "@/lib/ops";

const Body = z.object({ status: z.enum(["accepted", "declined"]) });
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { companyId } = await requireSession();
  const idea = await db.idea.findFirst({ where: { id: (await params).id, companyId } });
  if (!idea) throw new HttpError(404, "Not found");
  const { status } = Body.parse(await req.json());
  await db.idea.update({ where: { id: idea.id }, data: { status } });
  if (status === "accepted") await createTask(companyId, { agentId: idea.agentId, title: `Implement idea: ${idea.title}`, description: `The CEO accepted your idea. Produce an implementation plan.\n\n${idea.body}`, source: "briefing" });
  return NextResponse.json({ ok: true });
});
