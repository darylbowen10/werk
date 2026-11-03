import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, requireSession, HttpError } from "@/lib/auth";
import { enqueue } from "@/lib/jobs/queue";
import { publish } from "@/lib/realtime";

const Body = z.object({ action: z.enum(["cancel", "retry"]) });

export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { companyId } = await requireSession();
  const { id } = await params;
  const task = await db.task.findFirst({ where: { id, companyId } });
  if (!task) throw new HttpError(404, "Not found");
  const { action } = Body.parse(await req.json());
  if (action === "cancel" && ["queued", "awaiting_approval"].includes(task.status)) await db.task.update({ where: { id }, data: { status: "cancelled" } });
  else if (action === "retry" && ["failed", "cancelled"].includes(task.status)) { await db.task.update({ where: { id }, data: { status: "queued", error: null, runAfter: new Date() } }); await enqueue(companyId, "task.execute", { taskId: id }); }
  else throw new HttpError(400, `Can't ${action} a ${task.status} task`);
  const t = await db.task.findUnique({ where: { id } });
  await publish(companyId, { type: "task", id, status: t!.status, agentId: t!.agentId });
  return NextResponse.json({ task: t });
});
