import { NextResponse } from "next/server";
import { handle, requireSession } from "@/lib/auth";
import { prepareEod } from "@/lib/briefing";

export const POST = handle(async () => {
  const { companyId } = await requireSession();
  return NextResponse.json({ briefing: await prepareEod(companyId) });
});
