import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { handle, requireSession, HttpError } from "@/lib/auth";
import { getConnector } from "@/lib/connectors";

/** Start an OAuth2 authorization-code flow. State is a short-lived signed token bound to the tenant. */
export const GET = handle(async (_: Request, { params }: { params: Promise<{ provider: string }> }) => {
  const { companyId, user } = await requireSession();
  const { provider } = await params;
  const c = getConnector(provider);
  if (!c?.oauth) throw new HttpError(400, "Not an OAuth connector");
  if (!c.configured()) throw new HttpError(400, `${c.name} is not configured on this server (set ${c.oauth.clientIdEnv} / ${c.oauth.clientSecretEnv}).`);
  const state = await new SignJWT({ companyId, userId: user.id, provider }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
  const url = new URL(c.oauth.authorizeUrl);
  url.search = new URLSearchParams({ client_id: process.env[c.oauth.clientIdEnv]!, response_type: "code", redirect_uri: `${process.env.APP_URL}/api/integrations/${provider}/callback`, scope: c.oauth.scopes.join(" "), state, ...(c.oauth.extra ?? {}) }).toString();
  return NextResponse.redirect(url);
});
