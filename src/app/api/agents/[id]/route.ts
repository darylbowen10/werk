import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, requireSession, HttpError, audit } from "@/lib/auth";
import { ALL_TOOLS } from "@/lib/agents/roster";
import { sanitizeAvatar } from "@/shared/avatar";

type P = { params: Promise<{ id: string }> };

export const GET = handle(async (_: Request, { params }: P) => {
  const { companyId } = await requireSession();
  const { id } = await params;
  const agent = await db.agent.findFirst({ where: { id, companyId } });
  if (!agent) throw new HttpError(404, "Not found");
  const [tasks, memories, activity] = await Promise.all([
    db.task.findMany({ where: { companyId, agentId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.agentMemory.findMany({ where: { companyId, agentId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.activityLog.findMany({ where: { companyId, agentId: id }, orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  return NextResponse.json({ agent, tasks, memories, activity });
});

const Patch = z.object({
  name: z.string().min(1).max(40).optional(), title: z.string().min(2).max(60).optional(), roleDescription: z.string().min(10).max(1000).optional(),
  responsibilities: z.array(z.string().max(200)).max(10).optional(), personality: z.string().max(300).optional(), avatar: z.record(z.string(), z.number()).optional(),
  permissions: z.array(z.string()).optional(),
});

export const PATCH = handle(async (req: Request, { params }: P) => {
  const { user, companyId } = await requireSession();
  const { id } = await params;
  const agent = await db.agent.findFirst({ where: { id, companyId } });
  if (!agent) throw new HttpError(404, "Not found");
  const b = Patch.parse(await req.json());
  const permissions = b.permissions?.filter((p) => (ALL_TOOLS as readonly string[]).includes(p));
  const { avatar, permissions: _p, ...rest } = b;
  const updated = await db.agent.update({ where: { id }, data: { ...rest, ...(avatar ? { avatar: sanitizeAvatar(avatar) } : {}), ...(permissions ? { permissions } : {}) } });
  await audit(companyId, `user:${user.id}`, "agent.configured", id, b);
  return NextResponse.json({ agent: updated });
});

export const DELETE = handle(async (_: Request, { params }: P) => {
  const { user, companyId } = await requireSession();
  const { id } = await params;
  const agent = await db.agent.findFirst({ where: { id, companyId } });
  if (!agent) throw new HttpError(404, "Not found");
  if (agent.key === "ea") throw new HttpError(400, "The Executive Assistant runs your briefings and can't be removed.");
  await db.agent.update({ where: { id }, data: { isActive: false, office: `former:${agent.office}` } });
  await db.task.updateMany({ where: { agentId: id, status: { in: ["queued"] } }, data: { status: "cancelled" } });
  await audit(companyId, `user:${user.id}`, "agent.removed", id, { title: agent.title });
  return NextResponse.json({ ok: true });
});
