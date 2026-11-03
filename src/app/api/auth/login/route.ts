import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, HttpError, audit } from "@/lib/auth";
import { SESSION_COOKIE, signSession } from "@/lib/session";

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export const POST = handle(async (req: Request) => {
  const b = Body.parse(await req.json());
  const user = await db.user.findUnique({ where: { email: b.email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(b.password, user.passwordHash))) throw new HttpError(401, "Invalid email or password");
  await audit(user.companyId, `user:${user.id}`, "auth.login", user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await signSession({ userId: user.id, companyId: user.companyId }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 14 * 86400 });
  return res;
});
