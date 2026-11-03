// Procedurally drawn original 16-bit style textures (tiles, props, icons). No external assets.
import { TILE } from "@/shared/map";

type Ctx = CanvasRenderingContext2D;

function mk(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}
const R = (ctx: Ctx, x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
function rng(seed: number) { let s = seed; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

// ---------------- tiles ----------------
export const TILE_INDEX = { VOID: 0, WALL_TOP: 1, WALL_FACE: 2, HALL: 3, WOOD: 4, CARPET: 5, TILEF: 6, LOBBY: 7, DOOR: 8, EXEC: 9, BREAK: 10, VACANT: 11, EXIT: 12, WALL_FACE_WIN: 13 };
const TILE_COUNT = 14;

function drawTile(ctx: Ctx, ox: number, idx: number) {
  const r = rng(idx * 77 + 3);
  const p = (x: number, y: number, w: number, h: number, c: string) => R(ctx, ox + x, y, w, h, c);
  switch (idx) {
    case 0: p(0, 0, 16, 16, "#141019"); break;
    case 1: p(0, 0, 16, 16, "#2b2438"); p(0, 0, 16, 1, "#3a3150"); p(0, 15, 16, 1, "#221c2e"); break;
    case 2: case 13:
      p(0, 0, 16, 16, "#e9dcc2"); p(0, 0, 16, 2, "#c9b796"); p(0, 2, 16, 1, "#f6ecd8");
      p(0, 12, 16, 4, "#7a5d44"); p(0, 12, 16, 1, "#9c7a58");
      for (let i = 0; i < 6; i++) p(Math.floor(r() * 16), 3 + Math.floor(r() * 8), 1, 1, "#e0d1b4");
      if (idx === 13) { p(3, 3, 10, 8, "#4b6b8a"); p(4, 4, 8, 6, "#8ec5e8"); p(4, 4, 3, 2, "#c6e6f7"); p(7, 3, 1, 8, "#e9dcc2"); }
      break;
    case 3: p(0, 0, 16, 16, "#a8977f"); p(0, 0, 16, 1, "#9a8a73");
      for (let i = 0; i < 5; i++) p(Math.floor(r() * 16), Math.floor(r() * 16), 1, 1, "#b5a58c"); break;
    case 4: // wood planks
      p(0, 0, 16, 16, "#b98252");
      for (let y = 0; y < 16; y += 4) { p(0, y, 16, 1, "#9c6a41"); p(((y * 5) % 16), y + 1, 1, 3, "#9c6a41"); p(2, y + 2, 4, 1, "#c79363"); }
      break;
    case 5: p(0, 0, 16, 16, "#56507a"); for (let i = 0; i < 10; i++) p(Math.floor(r() * 16), Math.floor(r() * 16), 1, 1, "#625b88"); p(0, 15, 16, 1, "#4f4970"); break;
    case 6: p(0, 0, 16, 16, "#c8ccd8"); p(0, 0, 16, 1, "#aeb3c2"); p(0, 0, 1, 16, "#aeb3c2"); p(8, 0, 1, 16, "#b9bdcb"); p(0, 8, 16, 1, "#b9bdcb"); p(2, 2, 2, 1, "#dfe2ea"); break;
    case 7: p(0, 0, 8, 8, "#e2d7c2"); p(8, 8, 8, 8, "#e2d7c2"); p(8, 0, 8, 8, "#cfc2a8"); p(0, 8, 8, 8, "#cfc2a8"); p(1, 1, 2, 1, "#efe7d8"); p(9, 9, 2, 1, "#efe7d8"); break;
    case 8: p(0, 0, 16, 16, "#8f7a62"); p(0, 0, 16, 2, "#5d4a3a"); p(0, 14, 16, 2, "#5d4a3a"); p(1, 4, 14, 8, "#a08a70"); break;
    case 9: // executive herringbone
      p(0, 0, 16, 16, "#7c4632");
      for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x += 8) { p(x + ((y / 4) % 2) * 4, y, 4, 2, "#8d5139"); p(x + ((y / 4) % 2) * 4, y + 3, 4, 1, "#69392a"); }
      break;
    case 10: p(0, 0, 16, 16, "#a7cdbf"); p(0, 0, 8, 8, "#93bcad"); p(8, 8, 8, 8, "#93bcad"); break;
    case 11: p(0, 0, 16, 16, "#8b857a"); for (let i = 0; i < 12; i++) p(Math.floor(r() * 16), Math.floor(r() * 16), 1, 1, i % 2 ? "#7f7a70" : "#958f84"); break;
    case 12: p(0, 0, 16, 16, "#2b2438"); p(1, 2, 14, 14, "#5a7f9e"); p(2, 3, 12, 12, "#9fd0ea"); p(2, 3, 5, 4, "#d2ecf7"); p(7, 2, 2, 14, "#3b3350"); break;
  }
}

export function tilesetCanvas() {
  const [c, ctx] = mk(TILE * TILE_COUNT, TILE);
  for (let i = 0; i < TILE_COUNT; i++) drawTile(ctx, i * TILE, i);
  return c;
}

// ---------------- props ----------------
const OUT = "#1b1420";
function box(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, top?: string) {
  R(ctx, x, y, w, h, OUT); R(ctx, x + 1, y + 1, w - 2, h - 2, fill);
  if (top) R(ctx, x + 1, y + 1, w - 2, 2, top);
}

export function drawProp(sprite: string, w: number, h: number, variant = 0, extra?: { logoColor?: string; logoBg?: string; logoSymbol?: string }): HTMLCanvasElement {
  const W = w * TILE, H = h * TILE;
  const [c, ctx] = mk(W, H);
  const p = (x: number, y: number, ww: number, hh: number, col: string) => R(ctx, x, y, ww, hh, col);
  const shadow = () => { ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(2, H - 3, W - 4, 3); };
  const v = variant;
  switch (sprite) {
    case "desk": {
      shadow(); const top = v === 1 ? "#d9d4cc" : "#9a6a45";
      box(ctx, 0, 2, W, H - 4, top, v === 1 ? "#efebe4" : "#b17d54");
      p(2, H - 4, 2, 3, OUT); p(W - 4, H - 4, 2, 3, OUT); p(4, 6, 6, 2, "#efe6d0"); break;
    }
    case "exec_desk": {
      shadow(); box(ctx, 0, 6, W, H - 8, "#5c3524", "#7a4a32"); p(2, 10, W - 4, 1, "#c79b52");
      p(8, H - 12, 12, 8, "#4c2b1d"); p(W - 20, H - 12, 12, 8, "#4c2b1d");
      // computer + keyboard
      box(ctx, 22, 0, 20, 12, "#20242e"); p(24, 2, 16, 8, "#4fc1b0"); p(26, 4, 8, 1, "#c9fff4"); p(26, 6, 10, 1, "#9fe8da"); p(30, 12, 4, 2, OUT);
      p(24, 15, 16, 3, "#3b3f4a"); p(46, 9, 4, 5, "#f7ecd5"); p(47, 8, 2, 1, "#c94040");
      break;
    }
    case "monitor": { box(ctx, 2, 2, 12, 9, "#20242e"); p(3, 3, 10, 7, "#6fa8ff"); p(4, 4, 5, 1, "#d4e6ff"); p(7, 11, 2, 2, OUT); p(5, 13, 6, 1, OUT); break; }
    case "chair": case "exec_chair": {
      const col = sprite === "exec_chair" ? "#3b2a22" : ["#3b4b6b", "#6b2f3a", "#2d6b6f"][v % 3];
      box(ctx, 3, 1, 10, 8, col); box(ctx, 2, 8, 12, 5, col); p(7, 13, 2, 2, OUT); p(4, 15, 8, 1, OUT); break;
    }
    case "bookshelf": {
      shadow(); box(ctx, 1, 0, W - 2, H - 2, "#7a5235", "#8f6443");
      const cols = ["#c94040", "#4fc1b0", "#f2c14e", "#6fa8ff", "#e8697d", "#7b5aa6", "#d8d2c4"];
      for (let row = 0; row < 3; row++) {
        const y = 4 + row * 9; p(3, y + 7, W - 6, 1, "#4c321f");
        for (let x = 4; x < W - 5; x += 3) p(x, y + (x % 2), 2, 7 - (x % 2), cols[(x + row * 3) % cols.length]);
      }
      break;
    }
    case "trophy_case": {
      shadow(); box(ctx, 1, 0, W - 2, H - 2, "#5c3524"); p(3, 2, W - 6, H - 8, "#bfe3f0");
      p(8, 10, 4, 6, "#f2c14e"); p(7, 9, 6, 2, "#f2c14e"); p(18, 12, 5, 4, "#d8d2c4"); p(9, 16, 2, 2, "#b58a22"); break;
    }
    case "plant": case "tall_plant": {
      shadow(); const tall = sprite === "tall_plant";
      p(4, 10, 8, 6, OUT); p(5, 10, 6, 5, "#b5651d"); p(5, 10, 6, 1, "#d27e34");
      const g = ["#3f8a4b", "#57a85f", "#2f6b3a"];
      const leaves = tall ? [[3, 0], [8, 1], [5, 3], [1, 4], [10, 4], [4, 6], [8, 6]] : [[4, 3], [8, 2], [2, 6], [10, 6], [6, 6]];
      leaves.forEach(([x, y], i) => { p(x, y, 4, 4, OUT); p(x + 1, y + 1, 3, 3, g[i % 3]); });
      break;
    }
    case "couch": {
      shadow(); const col = ["#7b5aa6", "#2d6b6f", "#a1453c"][v % 3];
      box(ctx, 0, 0, W, H - 2, col); p(2, 2, W - 4, 4, shadeHex(col, 0.12)); p(1, 7, 3, 6, shadeHex(col, -0.15)); p(W - 4, 7, 3, 6, shadeHex(col, -0.15));
      for (let x = 4; x < W - 4; x += 14) p(x + 12, 7, 1, 5, shadeHex(col, -0.2));
      break;
    }
    case "armchair": { shadow(); const col = ["#a1453c", "#2d6b6f", "#c79b52"][v % 3]; box(ctx, 1, 0, 14, 14, col); p(3, 2, 10, 4, shadeHex(col, 0.12)); p(2, 6, 2, 7, shadeHex(col, -0.15)); p(12, 6, 2, 7, shadeHex(col, -0.15)); break; }
    case "coffee_table": { shadow(); box(ctx, 1, 3, W - 2, 10, "#6b4a33", "#8a6447"); p(6, 5, 5, 3, "#f7ecd5"); p(20, 6, 3, 3, "#c94040"); break; }
    case "round_table": { shadow(); ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(W / 2, H / 2 - 1, W / 2 - 1, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#c79363"; ctx.beginPath(); ctx.arc(W / 2, H / 2 - 1, W / 2 - 2, 0, Math.PI * 2); ctx.fill(); p(10, 10, 4, 3, "#f7ecd5"); p(18, 16, 3, 3, "#f7ecd5"); break; }
    case "rug": case "rug_round": {
      const cols = [["#8e3b46", "#c9a14a"], ["#2f4f6b", "#d8d2c4"], ["#3f6b4a", "#e2c27a"]][v % 3];
      if (sprite === "rug_round") { ctx.fillStyle = cols[0]; ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 1, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = cols[1]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 5, 0, Math.PI * 2); ctx.stroke(); }
      else { p(1, 1, W - 2, H - 2, cols[0]); p(3, 3, W - 6, H - 6, cols[1]); p(5, 5, W - 10, H - 10, cols[0]); for (let x = 8; x < W - 8; x += 8) p(x, H / 2 - 1, 3, 2, cols[1]); }
      break;
    }
    case "globe": { shadow(); p(6, 13, 4, 2, "#5c3524"); ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(8, 7, 6, 0, 7); ctx.fill(); ctx.fillStyle = "#4f8fc9"; ctx.beginPath(); ctx.arc(8, 7, 5, 0, 7); ctx.fill(); p(5, 4, 3, 3, "#57a85f"); p(9, 8, 3, 2, "#57a85f"); break; }
    case "aquarium": { shadow(); box(ctx, 0, 0, W, H - 2, "#3a4256"); p(2, 2, W - 4, H - 7, "#58a9d6"); p(2, 2, W - 4, 2, "#8fd0ee"); p(8, 7, 3, 2, "#f2a33a"); p(20, 5, 3, 2, "#e8697d"); p(4, H - 7, W - 8, 2, "#e2d7a2"); p(26, 4, 1, 6, "#3f8a4b"); break; }
    case "floor_lamp": { shadow(); p(7, 5, 2, 9, "#2b2438"); p(5, 14, 6, 1, "#2b2438"); box(ctx, 3, 0, 10, 6, v === 1 ? "#4fc1b0" : "#f6dfa0"); ctx.fillStyle = "rgba(255,230,160,0.25)"; ctx.fillRect(1, 6, 14, 4); break; }
    case "painting": { const pal = [["#e8697d", "#f2c14e", "#6fa8ff"], ["#2d6b6f", "#f7ecd5", "#c94040"], ["#7b5aa6", "#4fc1b0", "#f2c14e"]][v % 3]; box(ctx, 2, 1, W - 4, H - 4, "#c79b52"); p(4, 3, W - 8, H - 8, pal[1]); p(5, 5, 8, 5, pal[0]); p(14, 4, 9, 7, pal[2]); break; }
    case "window": { box(ctx, 2, 1, W - 4, H - 4, "#e9dcc2"); p(4, 3, W - 8, H - 8, "#8ec5e8"); p(4, 3, 8, 3, "#c6e6f7"); p(W / 2 - 1, 3, 2, H - 8, "#e9dcc2"); break; }
    case "clock": { ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(8, 7, 6, 0, 7); ctx.fill(); ctx.fillStyle = "#f7ecd5"; ctx.beginPath(); ctx.arc(8, 7, 5, 0, 7); ctx.fill(); p(8, 3, 1, 4, OUT); p(8, 7, 3, 1, OUT); break; }
    case "logo_wall": {
      const bg = extra?.logoBg ?? "#262035", fg = extra?.logoColor ?? "#f2c14e";
      box(ctx, 1, 1, W - 2, H - 4, bg); ctx.fillStyle = fg; ctx.font = "bold 9px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText((extra?.logoSymbol ?? "HQ").slice(0, 3), W / 2, H / 2 - 1); break;
    }
    case "perf_display": {
      box(ctx, 0, 0, W, H - 4, "#14161d"); p(2, 2, W - 4, H - 8, "#0f2a2a");
      const bars = [6, 9, 7, 12, 10, 15, 14, 18]; bars.forEach((b, i) => p(5 + i * 5, H - 8 - b, 3, b, i % 2 ? "#4fc1b0" : "#2f8f80"));
      p(5, 5, 14, 1, "#f2c14e"); p(W / 2 - 2, H - 4, 4, 3, OUT); break;
    }
    case "finance_screen": case "ops_board": case "campaign_board": case "pipeline_board": case "calendar_board": {
      shadow(); box(ctx, 0, 0, W, H - 3, sprite === "finance_screen" ? "#14161d" : "#f4efe4");
      if (sprite === "finance_screen") { p(2, 2, W - 4, H - 8, "#0f2a2a"); let y = 18; for (let x = 3; x < W - 3; x += 2) { y += Math.round(Math.sin(x) * 2) - 1; y = Math.max(4, Math.min(20, y)); p(x, y, 2, 2, "#4fc1b0"); } p(4, 4, 8, 2, "#f2c14e"); }
      else if (sprite === "ops_board") { const cols = ["#4fc1b0", "#f2c14e", "#e8697d"]; for (let i = 0; i < 3; i++) { p(3 + i * 9, 3, 7, 2, "#3a3150"); for (let j = 0; j < 3 - (i === 2 ? 1 : 0); j++) p(3 + i * 9, 7 + j * 6, 7, 4, cols[i]); } }
      else if (sprite === "campaign_board") { p(3, 3, 12, 9, "#e8697d"); p(17, 3, 12, 6, "#6fa8ff"); p(3, 14, 26, 1, "#3a3150"); for (let i = 0; i < 5; i++) p(4 + i * 5, 17, 3, 6, "#f2c14e"); }
      else if (sprite === "pipeline_board") { [26, 20, 14, 8].forEach((w2, i) => p((W - w2) / 2, 3 + i * 5, w2, 4, ["#6fa8ff", "#4fc1b0", "#f2c14e", "#57a85f"][i])); }
      else { for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) p(3 + x * 5, 4 + y * 5, 4, 4, (x + y) % 3 === 0 ? "#e8697d" : "#d8d2c4"); p(3, 2, 24, 1, "#c94040"); }
      break;
    }
    case "server_rack": { shadow(); box(ctx, 2, 0, W - 4, H - 2, "#20242e"); for (let y = 3; y < H - 5; y += 4) { p(5, y, W - 10, 3, "#2f3542"); p(W - 9, y + 1, 1, 1, y % 8 ? "#4fc1b0" : "#f2c14e"); p(W - 7, y + 1, 1, 1, "#4fc1b0"); } break; }
    case "file_cabinet": { shadow(); box(ctx, 2, 0, W - 4, H - 2, "#8d8d96"); for (let y = 2; y < H - 4; y += 9) { p(4, y, W - 8, 8, "#a5a5ae"); p(W / 2 - 3, y + 3, 6, 1, OUT); } break; }
    case "conf_table": { shadow(); box(ctx, 0, 2, W, H - 4, "#5c3524", "#7a4a32"); p(4, 6, W - 8, 1, "#c79b52"); for (let x = 10; x < W - 8; x += 18) { p(x, 12, 8, 6, "#f7ecd5"); p(x + 2, 13, 4, 1, "#a89cc0"); } break; }
    case "whiteboard": { box(ctx, 1, 1, W - 2, H - 3, "#f7f7f2"); p(4, 4, 18, 1, "#6fa8ff"); p(4, 7, 26, 1, "#e8697d"); p(40, 4, 16, 7, "#c8f0e8"); break; }
    case "coffee_machine": { shadow(); box(ctx, 2, 0, 12, 14, "#3a3150"); p(4, 2, 8, 4, "#20242e"); p(5, 3, 2, 1, "#e8697d"); p(6, 9, 4, 4, "#f7ecd5"); break; }
    case "fridge": { shadow(); box(ctx, 1, 0, 14, H - 2, "#dfe3ea"); p(2, 12, 12, 1, "#a7adb9"); p(11, 4, 1, 5, "#a7adb9"); p(11, 15, 1, 5, "#a7adb9"); break; }
    case "water_cooler": { shadow(); box(ctx, 4, 6, 8, 9, "#dfe3ea"); box(ctx, 4, 0, 8, 7, "#8ec5e8"); p(6, 9, 1, 2, "#6fa8ff"); p(9, 9, 1, 2, "#e8697d"); break; }
    case "reception": { shadow(); box(ctx, 0, 4, W, H - 6, "#5c3524", "#c79b52"); p(4, 12, W - 8, 1, "#7a4a32"); box(ctx, W / 2 - 10, 0, 20, 8, "#20242e"); p(W / 2 - 8, 1, 16, 5, "#4fc1b0"); break; }
    case "exit_mat": { p(0, 4, W, H - 4, "#5d4a3a"); p(2, 6, W - 4, H - 8, "#7a5d44"); ctx.fillStyle = "#f2c14e"; ctx.font = "bold 7px monospace"; ctx.textAlign = "center"; ctx.fillText("EXIT", W / 2, 13); break; }
    case "directory": { box(ctx, 1, 1, W - 2, H - 3, "#3a3150"); p(4, 4, 10, 2, "#f2c14e"); p(4, 8, 22, 1, "#d8d2c4"); p(18, 4, 6, 2, "#e8697d"); break; }
    case "for_hire": { box(ctx, 1, 2, W - 2, H - 5, "#f2c14e"); ctx.fillStyle = OUT; ctx.font = "bold 6px monospace"; ctx.textAlign = "center"; ctx.fillText("HIRING", W / 2, 10); break; }
    case "door": { box(ctx, 0, 0, W, H, "#8a5a3a"); p(2, 2, W - 4, H - 4, "#9e6b47"); p(W - 4, H / 2, 2, 2, "#f2c14e"); break; }
    default: p(0, 0, W, H, "#ff00ff");
  }
  return c;
}

function shadeHex(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0")}`;
}

// ---------------- status icons (10x10) ----------------
export function iconCanvas(kind: "working" | "waiting" | "finished" | "alert" | "idle" | "talk"): HTMLCanvasElement {
  const [c, ctx] = mk(11, 11);
  const p = (x: number, y: number, w: number, h: number, col: string) => R(ctx, x, y, w, h, col);
  const bg = { working: "#6fa8ff", waiting: "#f2c14e", finished: "#4fc1b0", alert: "#e8697d", idle: "#a89cc0", talk: "#f7ecd5" }[kind];
  p(1, 0, 9, 9, OUT); p(0, 1, 11, 7, OUT); p(1, 1, 9, 7, bg); p(4, 9, 3, 1, OUT); p(5, 10, 1, 1, OUT); p(4, 8, 3, 1, bg);
  const fg = OUT;
  if (kind === "working") { p(2, 4, 1, 1, fg); p(5, 4, 1, 1, fg); p(8, 4, 1, 1, fg); }
  if (kind === "waiting") { p(4, 2, 3, 1, fg); p(6, 3, 1, 1, fg); p(5, 4, 1, 1, fg); p(5, 6, 1, 1, fg); }
  if (kind === "finished") { p(2, 4, 1, 1, fg); p(3, 5, 1, 1, fg); p(4, 6, 1, 1, fg); p(5, 5, 1, 1, fg); p(6, 4, 1, 1, fg); p(7, 3, 1, 1, fg); p(8, 2, 1, 1, fg); }
  if (kind === "alert") { p(5, 2, 1, 3, fg); p(5, 6, 1, 1, fg); }
  if (kind === "idle") { p(3, 3, 3, 1, fg); p(4, 4, 1, 1, fg); p(3, 5, 3, 1, fg); p(7, 5, 2, 1, fg); p(7, 6, 2, 1, fg); }
  if (kind === "talk") { p(2, 3, 7, 1, fg); p(2, 5, 5, 1, fg); }
  return c;
}
