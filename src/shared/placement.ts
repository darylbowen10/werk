// Furniture placement rules, shared by the in-game editor (preview) and the API (authoritative validation).
import { furnitureDef } from "./furniture";
import { PROPS, ROOMS } from "./map";

const ROOM = ROOMS.find((r) => r.key === "ceo")!;
const KEEP_CLEAR = [{ x: 32, y: 10 }, { x: 33, y: 10 }, { x: 32, y: 6 }, { x: 33, y: 6 }];

export type Placed = { itemType: string; x: number; y: number; variant?: number };

const rects = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Returns an error string, or null if the single item can be placed among `others`. */
export function canPlace(item: Placed, others: Placed[]): string | null {
  const d = furnitureDef(item.itemType);
  if (!d) return `Unknown item ${item.itemType}`;
  const r = { x: item.x, y: item.y, w: d.w, h: d.h };
  if (r.x < ROOM.x || r.y < ROOM.y || r.x + r.w > ROOM.x + ROOM.w || r.y + r.h > ROOM.y + ROOM.h) return "Outside the room";
  if (d.wall && r.y !== ROOM.y) return "Wall items go on the back wall";
  if (d.layer === "floor") return null;
  const wall = Boolean(d.wall);
  for (const p of PROPS.filter((p) => p.room === "ceo" && Boolean(p.wall) === wall)) if (rects(r, p)) return `Overlaps the ${p.sprite.replace(/_/g, " ")}`;
  if (d.solid && !wall) for (const k of KEEP_CLEAR) if (rects(r, { ...k, w: 1, h: 1 })) return "Keep the doorway and desk approach clear";
  for (const o of others) {
    const od = furnitureDef(o.itemType);
    if (!od || od.layer === "floor" || Boolean(od.wall) !== wall) continue;
    if (rects(r, { x: o.x, y: o.y, w: od.w, h: od.h })) return `Overlaps the ${od.name.toLowerCase()}`;
  }
  return null;
}

export function validateLayout(items: Placed[]): string | null {
  for (let i = 0; i < items.length; i++) {
    const err = canPlace(items[i], items.slice(0, i));
    if (err) return `${items[i].itemType} at ${items[i].x},${items[i].y}: ${err}`;
  }
  return null;
}
