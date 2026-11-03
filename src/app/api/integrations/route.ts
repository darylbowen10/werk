import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, requireSession } from "@/lib/auth";
import { listConnectors } from "@/lib/connectors";

export const GET = handle(async () => {
  const { companyId } = await requireSession();
  const rows = await db.integration.findMany({ where: { companyId } });
  return NextResponse.json({
    connectors: listConnectors().map((c) => {
      const r = rows.find((x) => x.provider === c.id);
      return { id: c.id, name: c.name, category: c.category, description: c.description, authType: c.authType, scopes: c.scopes, keyHint: c.keyHint, configured: c.configured(), canSend: Boolean(c.send), status: r?.status ?? "disconnected", connectedAt: r?.connectedAt, lastSyncAt: r?.lastSyncAt, lastError: r?.lastError };
    }),
  });
});
