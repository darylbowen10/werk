import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { enqueue } from "@/lib/jobs/queue";

export const POST = handle(async (_: Request, { params }: { params: Promise<{ provider: string }> }) => {
  const { companyId } = await requireSession();
  await enqueue(companyId, "integration.sync", { provider: (await params).provider });
  return NextResponse.json({ ok: true, queued: true });
});
