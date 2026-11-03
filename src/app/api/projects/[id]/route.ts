import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, requireSession, HttpError } from "@/lib/auth";
import { createTask } from "@/lib/ops";

const Body = z.object({ action: z.enum(["intervene", "postpone"]), note: z.string().max(1000).optional() });
/** CEO intervention on a delayed project: hands the COO a recovery assignment. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { companyId } = await requireSession();
  const p = await db.project.findFirst({ where: { id: (await params).id, companyId } });
  if (!p) throw new HttpError(404, "Not found");
  const b = Body.parse(await req.json());
  if (b.action === "postpone") return NextResponse.json({ ok: true });
  const coo = await db.agent.findFirst({ where: { companyId, key: "coo", isActive: true } });
  if (!coo) throw new HttpError(400, "No COO on staff");
  const task = await createTask(companyId, { agentId: coo.id, title: `CEO intervention: unblock ${p.name}`, description: `The CEO wants ${p.name} unblocked. Current blockers: ${p.blockers}. Coordinate with the owner (${p.ownerKey.toUpperCase()}), propose a new date and the decisions needed.${b.note ? `\nCEO note: ${b.note}` : ""}`, priority: "high", source: "briefing" });
  return NextResponse.json({ task });
});
