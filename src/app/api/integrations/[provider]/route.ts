import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, requireSession, HttpError, audit } from "@/lib/auth";
import { getConnector, saveCreds } from "@/lib/connectors";
import { enqueue } from "@/lib/jobs/queue";

const Body = z.object({ apiKey: z.string().min(8).max(500) });
type P = { params: Promise<{ provider: string }> };

/** Connect an API-key connector. The key is validated against the provider before being stored (encrypted). */
export const POST = handle(async (req: Request, { params }: P) => {
  const { user, companyId } = await requireSession();
  const { provider } = await params;
  const c = getConnector(provider);
  if (!c || c.authType !== "api_key") throw new HttpError(400, "Unsupported connector");
  const { apiKey } = Body.parse(await req.json());
  const v = await c.validate!({ api_key: apiKey });
  if (!v.ok) throw new HttpError(400, `Could not verify credentials: ${v.error}`);
  await saveCreds(companyId, provider, { api_key: apiKey }, v.meta, c.scopes);
  await audit(companyId, `user:${user.id}`, "integration.connected", provider);
  if (c.sync) await enqueue(companyId, "integration.sync", { provider });
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_: Request, { params }: P) => {
  const { user, companyId } = await requireSession();
  const { provider } = await params;
  await db.integration.updateMany({ where: { companyId, provider }, data: { status: "disconnected", encryptedCreds: null } });
  await audit(companyId, `user:${user.id}`, "integration.disconnected", provider);
  return NextResponse.json({ ok: true });
});
