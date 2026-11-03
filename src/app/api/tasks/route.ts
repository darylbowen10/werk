import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, requireSession, HttpError } from "@/lib/auth";
import { createTask } from "@/lib/ops";

export const GET = handle(async (req: Request) => {
  const { companyId } = await requireSession();
  const u = new URL(req.url).searchParams;
  const tasks = await db.task.findMany({ where: { companyId, ...(u.get("agentId") ? { agentId: u.get("agentId")! } : {}), ...(u.get("status") ? { status: u.get("status")! } : {}) }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ tasks });
});

const Body = z.object({ agentId: z.string(), title: z.string().min(3).max(200), description: z.string().max(4000).default(""), priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"), deadline: z.string().nullable().optional() });

export const POST = handle(async (req: Request) => {
  const { companyId } = await requireSession();
  const b = Body.parse(await req.json());
  const agent = await db.agent.findFirst({ where: { id: b.agentId, companyId, isActive: true } });
  if (!agent) throw new HttpError(404, "Employee not found");
  const deadline = b.deadline ? new Date(b.deadline) : null;
  const task = await createTask(companyId, { agentId: agent.id, title: b.title, description: b.description || b.title, priority: b.priority, deadline: deadline && !isNaN(+deadline) ? deadline : null, source: "ceo" });
  return NextResponse.json({ task });
});
