import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrid, MAP_H, MAP_W, PROPS, ROOMS, SPAWN, T, CONFERENCE_SEATS, WANDER_SPOTS, CEO_DESK_STAND } from "../src/shared/map";
import { findPath } from "../src/game/pathfinding";
import { canPlace, validateLayout } from "../src/shared/placement";
import { DEFAULT_CEO_LAYOUT, furnitureDef } from "../src/shared/furniture";
import { encrypt, decrypt } from "../src/lib/crypto";
import { detectHighImpact, detectWorkRequest, detectPriority } from "../src/lib/agents/offline";
import { routeToAgentKey } from "../src/lib/agents/roster";

const grid = buildGrid();
const blocked = new Set<number>();
for (const p of PROPS) if (p.solid && !p.wall) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) blocked.add(y * MAP_W + x);
for (const f of DEFAULT_CEO_LAYOUT) { const d = furnitureDef(f.itemType)!; if (d.solid && !d.wall && d.layer !== "floor") for (let y = f.y; y < f.y + d.h; y++) for (let x = f.x; x < f.x + d.w; x++) blocked.add(y * MAP_W + x); }
const walkable = (x: number, y: number) => { const v = grid[y]?.[x]; return v !== undefined && v !== T.WALL && v !== T.EXIT && !blocked.has(y * MAP_W + x); };
const spawn = { x: Math.floor(SPAWN.x), y: Math.floor(SPAWN.y) };

test("every office seat, meeting seat and wander spot is reachable from the lobby", () => {
  const targets = [...ROOMS.filter((r) => r.seat).map((r) => ({ ...r.seat!, name: r.name })), ...CONFERENCE_SEATS.map((s) => ({ ...s, name: "conference" })), ...WANDER_SPOTS.map((s) => ({ ...s, name: s.room })), { ...CEO_DESK_STAND, name: "ceo desk" }];
  for (const t of targets) {
    assert.ok(walkable(t.x, t.y), `${t.name} target ${t.x},${t.y} must be walkable`);
    assert.ok(findPath(walkable, spawn, t, MAP_W, MAP_H), `path from lobby to ${t.name} (${t.x},${t.y})`);
  }
});

test("rooms are enclosed: doors are the only openings", () => {
  for (const r of ROOMS) {
    for (let x = r.x - 1; x <= r.x + r.w; x++) for (const y of [r.y - 1, r.y + r.h]) {
      const v = grid[y]?.[x];
      const isDoor = r.doors.some((d) => d.x === x && d.y === y);
      if (!isDoor && v !== undefined) assert.ok(v === T.WALL || v === T.EXIT || v === T.DOOR, `${r.name} wall gap at ${x},${y}`);
    }
  }
});

test("default CEO layout is valid and collisions are rejected", () => {
  assert.equal(validateLayout(DEFAULT_CEO_LAYOUT), null);
  assert.match(canPlace({ itemType: "couch", x: 31, y: 4 }, []) ?? "", /Overlaps/);       // on top of the executive desk
  assert.match(canPlace({ itemType: "plant", x: 32, y: 10 }, []) ?? "", /doorway/);         // blocks the doorway
  assert.match(canPlace({ itemType: "painting", x: 27, y: 5 }, []) ?? "", /back wall/);     // wall item on the floor
  assert.match(canPlace({ itemType: "desk", x: 45, y: 5 }, []) ?? "", /Outside/);
  assert.equal(canPlace({ itemType: "rug_round", x: 31, y: 4 }, []), null);                 // rugs sit under furniture
  assert.equal(canPlace({ itemType: "plant", x: 36, y: 8 }, []), null);
});

test("credential encryption round-trips and is non-deterministic", () => {
  const a = encrypt("sk_live_secret"), b = encrypt("sk_live_secret");
  assert.notEqual(a, b);
  assert.equal(decrypt(a), "sk_live_secret");
  assert.throws(() => decrypt(a.replace(/.$/, (c) => (c === "A" ? "B" : "A"))));
});

test("offline intent detection", () => {
  assert.ok(detectWorkRequest("I need a revenue forecast for the next six months."));
  assert.ok(!detectWorkRequest("hi"));
  assert.equal(detectPriority("urgent: fix billing"), "urgent");
  assert.equal(detectHighImpact("Expense variance analysis: software spend of $9,100 vs budget"), null);
  assert.equal(detectHighImpact("Analyse marketing spend and recommend actions"), null);
  assert.equal(detectHighImpact("Pay $2,000 for the conference booth")?.tool, "spend_money");
  assert.equal(detectHighImpact("Launch the estate attorney campaign next week")?.tool, "launch_campaign");
  assert.equal(detectHighImpact("Email the partner at Northline the revised agreement")?.tool, "send_external_message");
  assert.equal(routeToAgentKey("Draft a LinkedIn campaign for CPAs"), "cmo");
  assert.equal(routeToAgentKey("Review the sales pipeline"), "cro");
  assert.equal(routeToAgentKey("Have the CMO draft a CPA referral partner campaign"), "cmo");
  assert.equal(routeToAgentKey("Ask the CFO about partner payouts"), "cfo");
});
