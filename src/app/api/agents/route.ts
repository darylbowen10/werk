import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, requireSession, HttpError, audit } from "@/lib/auth";
import { ALL_TOOLS, BASE_TOOLS } from "@/lib/agents/roster";
import { sanitizeAvatar } from "@/shared/avatar";
import { ROOMS, VACANT_ROOMS } from "@/shared/map";
import { notify } from "@/lib/ops";

export const GET = handle(async () => {
  const { companyId } = await requireSession();
  const agents = await db.agent.findMany({ where: { companyId, isActive: true }, orderBy: { createdAt: "asc" } });
  const tasks = await db.task.groupBy({ by: ["agentId", "status"], where: { companyId }, _count: true });
  const vacant = VACANT_ROOMS.filter((r) => !agents.some((a) => a.office === r));
  return NextResponse.json({
    tools: ALL_TOOLS, vacant,
    agents: agents.map((a) => {
      const c = (s: string) => tasks.filter((t) => t.agentId === a.id && t.status === s).reduce((n, t) => n + t._count, 0);
      const done = c("complete"), failed = c("failed");
      return { ...a, metrics: { completed: done, failed, open: c("queued") + c("working") + c("awaiting_approval"), successRate: done + failed ? Math.round((done / (done + failed)) * 100) : null, costUsd: a.costMicros / 1e6 } };
    }),
  });
});

const Hire = z.object({
  name: z.string().min(1).max(40), title: z.string().min(2).max(60), department: z.string().min(2).max(40),
  roleDescription: z.string().min(10).max(1000), responsibilities: z.array(z.string().max(200)).max(10).default([]), objectives: z.array(z.string().max(200)).max(6).default([]),
  personality: z.string().max(300).default(""), avatar: z.record(z.string(), z.number()).optional(), office: z.string(), permissions: z.array(z.string()).default([]),
});

export const POST = handle(async (req: Request) => {
  const { user, companyId } = await requireSession();
  const b = Hire.parse(await req.json());
  if (!VACANT_ROOMS.includes(b.office)) throw new HttpError(400, "Choose a vacant office");
  if (await db.agent.findFirst({ where: { companyId, office: b.office, isActive: true } })) throw new HttpError(409, "That office is already occupied");
  const permissions = [...new Set([...BASE_TOOLS, ...b.permissions.filter((p) => (ALL_TOOLS as readonly string[]).includes(p))])];
  const key = `custom-${b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)}-${Math.random().toString(36).slice(2, 6)}`;
  const agent = await db.agent.create({ data: { companyId, key, name: b.name, title: b.title, department: b.department, roleDescription: b.roleDescription, responsibilities: b.responsibilities, objectives: b.objectives, personality: b.personality, avatar: sanitizeAvatar(b.avatar), office: b.office, permissions } });
  await audit(companyId, `user:${user.id}`, "agent.hired", agent.id, { title: agent.title, permissions });
  await notify(companyId, { agentId: agent.id, kind: "info", priority: "normal", title: `${agent.name} joined as ${agent.title}`, body: `Now working from ${ROOMS.find((r) => r.key === b.office)?.name ?? b.office}.` });
  return NextResponse.json({ agent });
});
