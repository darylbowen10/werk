import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { handle, requireSession, HttpError, audit } from "@/lib/auth";
import { getConnector, saveCreds } from "@/lib/connectors";
import { enqueue } from "@/lib/jobs/queue";

export const GET = handle(async (req: Request, { params }: { params: Promise<{ provider: string }> }) => {
  const { companyId, user } = await requireSession();
  const { provider } = await params;
  const u = new URL(req.url).searchParams;
  const c = getConnector(provider);
  if (!c?.oauth) throw new HttpError(400, "Not an OAuth connector");
  const { payload } = await jwtVerify(u.get("state") ?? "", new TextEncoder().encode(process.env.AUTH_SECRET!)).catch(() => { throw new HttpError(400, "Invalid OAuth state"); });
  if (payload.companyId !== companyId || payload.provider !== provider) throw new HttpError(400, "OAuth state mismatch");
  if (u.get("error")) return NextResponse.redirect(new URL(`/play?integration=${provider}&error=${encodeURIComponent(u.get("error")!)}`, process.env.APP_URL));
  const body = new URLSearchParams({ grant_type: "authorization_code", code: u.get("code") ?? "", redirect_uri: `${process.env.APP_URL}/api/integrations/${provider}/callback`, client_id: process.env[c.oauth.clientIdEnv]!, client_secret: process.env[c.oauth.clientSecretEnv]! });
  const res = await fetch(c.oauth.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
  const tok = await res.json();
  if (!res.ok || !tok.access_token) throw new HttpError(400, `Token exchange failed: ${tok.error_description ?? tok.error ?? res.status}`);
  await saveCreds(companyId, provider, { access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: Date.now() + (tok.expires_in ?? 3600) * 1000, instance_url: tok.instance_url, realm_id: u.get("realmId") ?? undefined }, undefined, c.oauth.scopes);
  await audit(companyId, `user:${user.id}`, "integration.connected", provider);
  if (c.sync) await enqueue(companyId, "integration.sync", { provider });
  return NextResponse.redirect(new URL(`/play?integration=${provider}&connected=1`, process.env.APP_URL));
});
