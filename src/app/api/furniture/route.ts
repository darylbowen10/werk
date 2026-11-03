import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, requireSession, HttpError } from "@/lib/auth";
import { validateLayout } from "@/shared/placement";

export const GET = handle(async () => {
  const { companyId } = await requireSession();
  return NextResponse.json({ items: await db.furnitureItem.findMany({ where: { companyId } }) });
});

const Body = z.object({ room: z.literal("ceo"), items: z.array(z.object({ itemType: z.string(), x: z.number().int(), y: z.number().int(), variant: z.number().int().min(0).max(5).default(0) })).max(60) });

/** Replace the CEO suite layout. Server re-validates bounds and collisions. */
export const PUT = handle(async (req: Request) => {
  const { companyId } = await requireSession();
  const b = Body.parse(await req.json());
  const err = validateLayout(b.items);
  if (err) throw new HttpError(400, err);
  await db.$transaction([
    db.furnitureItem.deleteMany({ where: { companyId, room: "ceo" } }),
    db.furnitureItem.createMany({ data: b.items.map((i) => ({ ...i, companyId, room: "ceo" })) }),
  ]);
  return NextResponse.json({ items: await db.furnitureItem.findMany({ where: { companyId } }) });
});
