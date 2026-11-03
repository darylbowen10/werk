import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, requireSession } from "@/lib/auth";

/** Mark that an agent has physically walked over to the CEO about this notification. */
export const POST = handle(async (_: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { companyId } = await requireSession();
  await db.notification.updateMany({ where: { id: (await params).id, companyId }, data: { approached: true } });
  return NextResponse.json({ ok: true });
});
