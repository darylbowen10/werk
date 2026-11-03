import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, HttpError, audit } from "@/lib/auth";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { createCompanyDefaults } from "@/lib/demo";
import { DEFAULT_AVATAR } from "@/shared/avatar";

const Body = z.object({ email: z.string().email().max(200), password: z.string().min(8).max(200), name: z.string().min(1).max(60), companyName: z.string().min(1).max(60) });

export const POST = handle(async (req: Request) => {
  const b = Body.parse(await req.json());
  const email = b.email.toLowerCase();
  if (await db.user.findUnique({ where: { email } })) throw new HttpError(409, "An account with that email already exists");
  const company = await db.company.create({ data: { name: b.companyName, logo: { symbol: b.companyName.slice(0, 2).toUpperCase(), color: "#f2c14e", bg: "#262035" }, settings: { autoBriefing: true, endOfDayRecap: true, interruptionLevel: "important", onboarded: false } } });
  const user = await db.user.create({ data: { email, name: b.name, passwordHash: await bcrypt.hash(b.password, 12), avatar: DEFAULT_AVATAR, companyId: company.id } });
  await createCompanyDefaults(company.id);
  await audit(company.id, `user:${user.id}`, "company.created", company.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await signSession({ userId: user.id, companyId: company.id }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 14 * 86400 });
  return res;
});
