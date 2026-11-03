import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, requireSession } from "@/lib/auth";
import { aiEnabled } from "@/lib/agents/llm";

/** Initial game state for the office scene. */
export const GET = handle(async () => {
  const { user, companyId } = await requireSession();
  const [company, agents, furniture, unread, approvals] = await Promise.all([
    db.company.findUnique({ where: { id: companyId } }),
    db.agent.findMany({ where: { companyId, isActive: true }, orderBy: { createdAt: "asc" } }),
    db.furnitureItem.findMany({ where: { companyId } }),
    db.notification.count({ where: { companyId, read: false } }),
    db.approval.count({ where: { companyId, status: "pending" } }),
  ]);
  return NextResponse.json({
    user: { id: user.id, name: user.name, avatar: user.avatar },
    company,
    agents: agents.map((a) => ({ id: a.id, key: a.key, name: a.name, title: a.title, department: a.department, office: a.office, avatar: a.avatar, status: a.status, statusNote: a.statusNote })),
    furniture,
    unread, approvals,
    ai: aiEnabled() ? "claude" : "offline",
  });
});
