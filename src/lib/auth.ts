import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "./db";
import { SESSION_COOKIE, verifySession } from "./session";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Resolve the signed-in CEO. All tenant data access must be scoped by the returned companyId. */
export async function requireSession() {
  const jar = await cookies();
  const s = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!s) throw new HttpError(401, "Not signed in");
  const user = await db.user.findUnique({ where: { id: s.userId } });
  if (!user || user.companyId !== s.companyId) throw new HttpError(401, "Session invalid");
  return { user, companyId: user.companyId };
}

export function handle<T extends unknown[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e && typeof e === "object" && "issues" in e) return NextResponse.json({ error: "Invalid input", details: (e as { issues: unknown }).issues }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}

export { audit } from "./audit";
