import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, requireSession } from "@/lib/auth";
import { prepareMorning } from "@/lib/briefing";
import { logActivity } from "@/lib/ops";

/**
 * Called on arrival. Returns today's morning briefing and whether the EA should walk over.
 * If the worker hasn't prepared it yet (e.g. first login of the day before BRIEFING_HOUR), it is prepared now.
 */
export const GET = handle(async (req: Request) => {
  const { companyId, user } = await requireSession();
  const company = await db.company.findUnique({ where: { id: companyId } });
  const settings = (company?.settings ?? {}) as { autoBriefing?: boolean };
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  const { todayKey } = await import("@/lib/ops");
  const existing = await db.briefing.findUnique({ where: { companyId_kind_date: { companyId, kind: "morning", date: todayKey() } } });
  // Refresh a not-yet-delivered briefing so it reflects work completed since the worker prepared it.
  const stale = existing?.status === "prepared" && Date.now() - existing.updatedAt.getTime() > 10 * 60_000;
  const b = await prepareMorning(companyId, { force: refresh || stale });
  const ea = await db.agent.findFirst({ where: { companyId, key: "ea", isActive: true } });
  const auto = settings.autoBriefing !== false;
  const show = auto && b.status === "prepared";
  if (show && ea) await logActivity(companyId, ea.id, "ceo.arrived", `${user.name} arrived — heading over with the morning briefing`);
  return NextResponse.json({ briefing: b, show, autoBriefing: auto, eaId: ea?.id ?? null });
});
