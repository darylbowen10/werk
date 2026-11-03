import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, requireSession, audit } from "@/lib/auth";
import { sanitizeAvatar } from "@/shared/avatar";
import { aiEnabled } from "@/lib/agents/llm";

export const GET = handle(async () => {
  const { user, companyId } = await requireSession();
  const company = await db.company.findUnique({ where: { id: companyId } });
  return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar }, company, ai: aiEnabled() ? "claude" : "offline" });
});

const Body = z.object({
  name: z.string().min(1).max(60).optional(),
  avatar: z.record(z.string(), z.number()).optional(),
  companyName: z.string().min(1).max(60).optional(),
  logo: z.object({ symbol: z.string().min(1).max(3), color: z.string().regex(/^#[0-9a-f]{6}$/i), bg: z.string().regex(/^#[0-9a-f]{6}$/i) }).optional(),
  settings: z.object({ autoBriefing: z.boolean().optional(), endOfDayRecap: z.boolean().optional(), interruptionLevel: z.enum(["all", "important", "critical", "none"]).optional(), onboarded: z.boolean().optional() }).optional(),
});

export const PUT = handle(async (req: Request) => {
  const { user, companyId } = await requireSession();
  const b = Body.parse(await req.json());
  if (b.name || b.avatar) await db.user.update({ where: { id: user.id }, data: { ...(b.name ? { name: b.name } : {}), ...(b.avatar ? { avatar: sanitizeAvatar(b.avatar) } : {}) } });
  if (b.companyName || b.logo || b.settings) {
    const c = await db.company.findUnique({ where: { id: companyId } });
    await db.company.update({ where: { id: companyId }, data: { ...(b.companyName ? { name: b.companyName } : {}), ...(b.logo ? { logo: b.logo } : {}), ...(b.settings ? { settings: { ...(c!.settings as object), ...b.settings } } : {}) } });
    if (b.settings) await audit(companyId, `user:${user.id}`, "settings.updated", companyId, b.settings);
  }
  return NextResponse.json({ ok: true });
});
