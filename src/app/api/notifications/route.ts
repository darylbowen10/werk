import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, requireSession } from "@/lib/auth";

export const GET = handle(async (req: Request) => {
  const { companyId } = await requireSession();
  const since = new URL(req.url).searchParams.get("since");
  const notifications = await db.notification.findMany({ where: { companyId, ...(since ? { createdAt: { gt: new Date(since) } } : {}) }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ notifications, unread: await db.notification.count({ where: { companyId, read: false } }) });
});
