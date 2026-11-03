import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { greeting } from "@/lib/agents/engine";

export const GET = handle(async (_: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { companyId } = await requireSession();
  return NextResponse.json(await greeting(companyId, (await params).id));
});
