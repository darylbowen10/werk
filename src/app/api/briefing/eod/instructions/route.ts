import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireSession } from "@/lib/auth";
import { scheduleNextDayInstructions } from "@/lib/briefing";

export const maxDuration = 120;
const Body = z.object({ text: z.string().min(3).max(4000) });
export const POST = handle(async (req: Request) => {
  const { companyId } = await requireSession();
  const { text } = Body.parse(await req.json());
  return NextResponse.json({ created: await scheduleNextDayInstructions(companyId, text) });
});
