import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, requireSession } from "@/lib/auth";

const Body = z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() });
export const POST = handle(async (req: Request) => {
  const { companyId } = await requireSession();
  const b = Body.parse(await req.json());
  await db.notification.updateMany({ where: { companyId, ...(b.all ? {} : { id: { in: b.ids ?? [] } }) }, data: { read: true } });
  return NextResponse.json({ ok: true });
});
