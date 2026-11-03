import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, requireSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";

export const POST = handle(async () => {
  const { user } = await requireSession();
  await db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
