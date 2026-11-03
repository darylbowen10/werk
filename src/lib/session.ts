import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "hq_session";
export type SessionPayload = { userId: string; companyId: string };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (>= 32 chars)");
  return new TextEncoder().encode(s);
}

export async function signSession(p: SessionPayload) {
  return new SignJWT(p).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("14d").sign(secret());
}

export async function verifySession(token?: string | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.userId !== "string" || typeof payload.companyId !== "string") return null;
    return { userId: payload.userId, companyId: payload.companyId };
  } catch {
    return null;
  }
}
