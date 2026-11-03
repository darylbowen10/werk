// Original procedural pixel-art character generator.
// Each avatar renders to a 3x4 sprite sheet (frames: stand, stepA, stepB × dirs: down, left, right, up).

export type Avatar = {
  skin: number;
  hair: number;
  hairColor: number;
  facial: number;
  outfit: number;
  outfitColor: number;
  accent: number;
  accessory: number;
};

export const FRAME_W = 16;
export const FRAME_H = 24;
export const DIRS = ["down", "left", "right", "up"] as const;
export type Dir = (typeof DIRS)[number];

export const SKIN = ["#fde0c5", "#f3c39b", "#e0a878", "#c98b5b", "#9c6440", "#6e4429"];
export const HAIR_COLORS = ["#2a1d1a", "#5a3825", "#9a6234", "#d9a95b", "#e9d9a8", "#a43b2b", "#8d8d96", "#3d4f8a"];
export const OUTFIT_COLORS = ["#2f3b59", "#3f4a46", "#6b2f3a", "#d8d2c4", "#2d6b6f", "#7b5aa6", "#b5651d", "#1f1f27"];
export const ACCENT_COLORS = ["#c94040", "#f2c14e", "#4fc1b0", "#6fa8ff", "#e8697d", "#f7ecd5"];

export const HAIR_STYLES = ["Short", "Side part", "Long", "Bun", "Buzz", "Curly", "Ponytail", "Swept"];
export const FACIAL = ["None", "Beard", "Mustache", "Stubble"];
export const OUTFITS = ["Suit & tie", "Blazer", "Sweater", "Button-up", "Dress", "Hoodie", "Vest"];
export const ACCESSORIES = ["None", "Glasses", "Shades", "Headset", "Earrings", "Lanyard"];

export const DEFAULT_AVATAR: Avatar = { skin: 1, hair: 1, hairColor: 1, facial: 0, outfit: 0, outfitColor: 0, accent: 0, accessory: 0 };

export function sanitizeAvatar(a: Partial<Avatar> | null | undefined): Avatar {
  const clamp = (v: unknown, n: number, d: number) => (typeof v === "number" && v >= 0 && v < n ? Math.floor(v) : d);
  const x = a ?? {};
  return {
    skin: clamp(x.skin, SKIN.length, 1),
    hair: clamp(x.hair, HAIR_STYLES.length, 1),
    hairColor: clamp(x.hairColor, HAIR_COLORS.length, 1),
    facial: clamp(x.facial, FACIAL.length, 0),
    outfit: clamp(x.outfit, OUTFITS.length, 0),
    outfitColor: clamp(x.outfitColor, OUTFIT_COLORS.length, 0),
    accent: clamp(x.accent, ACCENT_COLORS.length, 0),
    accessory: clamp(x.accessory, ACCESSORIES.length, 0),
  };
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

const OUTLINE = "#1b1420";

/** Draw one character frame at (ox, oy). frame: 0 stand, 1 stepA, 2 stepB. */
export function drawCharacter(ctx: CanvasRenderingContext2D, ox: number, oy: number, av: Avatar, dir: Dir, frame: number) {
  const p = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, w, h); };
  const skin = SKIN[av.skin], skinD = shade(skin, -0.12);
  const hair = HAIR_COLORS[av.hairColor], hairD = shade(hair, -0.12), hairL = shade(hair, 0.1);
  const cloth = OUTFIT_COLORS[av.outfitColor], clothD = shade(cloth, -0.14), clothL = shade(cloth, 0.12);
  const accent = ACCENT_COLORS[av.accent];
  const pants = av.outfit === 4 ? cloth : av.outfit === 5 ? "#3a3a48" : shade(cloth, -0.22);
  const side = dir === "left" || dir === "right";
  const flip = dir === "left";
  const sx = (x: number, w = 1) => (flip ? 16 - x - w : x); // mirror for left
  const ps = (x: number, y: number, w: number, h: number, c: string) => p(sx(x, w), y, w, h, c);

  const bob = frame === 0 ? 0 : 1; // body bob on steps
  const legA = frame === 1 ? -1 : frame === 2 ? 1 : 0;

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(ox + 4, oy + 22, 8, 2);

  // ---- legs ----
  if (av.outfit === 4) {
    // dress: skirt then legs
    if (!side) {
      p(5, 19, 2, 3 + Math.min(0, legA), skinD); p(9, 19, 2, 3 + Math.min(0, -legA), skinD);
      p(5, 22 + Math.min(0, legA), 2, 1, OUTLINE); p(9, 22 + Math.min(0, -legA), 2, 1, OUTLINE);
    } else {
      ps(6 + legA, 19, 2, 3, skinD); ps(8 - legA, 19, 2, 3, skinD);
      ps(6 + legA, 22, 3, 1, OUTLINE); ps(8 - legA, 22, 3, 1, OUTLINE);
    }
  } else if (!side) {
    const lY = legA < 0 ? -1 : 0, rY = legA > 0 ? -1 : 0;
    p(4, 18, 4, 4 + lY, OUTLINE); p(8, 18, 4, 4 + rY, OUTLINE);
    p(5, 18, 2, 3 + lY, pants); p(9, 18, 2, 3 + rY, pants);
    p(5, 21 + lY, 3, 1, "#2a2230"); p(8, 21 + rY, 3, 1, "#2a2230");
  } else {
    ps(5 + legA, 18, 4, 4, OUTLINE); ps(7 - legA, 18, 4, 4, OUTLINE);
    ps(6 + legA, 18, 2, 3, pants); ps(8 - legA, 18, 2, 3, shade(pants, -0.08));
    ps(6 + legA, 21, 3, 1, "#2a2230"); ps(8 - legA, 21, 3, 1, "#2a2230");
  }

  const by = bob ? 1 : 0; // upper body offset
  // ---- torso ----
  const torsoX = side ? 4 : 3, torsoW = side ? 8 : 10;
  ps(torsoX, 10 + by, torsoW, 9, OUTLINE);
  const bodyTop = 11 + by;
  const skirt = av.outfit === 4;
  ps(torsoX + 1, bodyTop, torsoW - 2, skirt ? 9 : 7, cloth);
  ps(torsoX + 1, bodyTop + (skirt ? 8 : 6), torsoW - 2, 1, clothD);
  if (!side && dir === "down") {
    switch (av.outfit) {
      case 0: // suit & tie
        p(7, bodyTop, 2, 3, "#f4f1ea"); p(7, bodyTop + 1, 2, 4, accent); p(6, bodyTop, 1, 3, clothL); p(9, bodyTop, 1, 3, clothL); break;
      case 1: // blazer over tee
        p(6, bodyTop, 4, 6, accent); p(5, bodyTop, 1, 6, clothL); p(10, bodyTop, 1, 6, clothL); break;
      case 2: // sweater
        p(6, bodyTop, 4, 1, "#f4f1ea"); p(4, bodyTop + 3, 8, 1, clothL); break;
      case 3: // button-up
        p(7, bodyTop, 2, 1, skin); for (let i = 1; i < 6; i += 2) p(8, bodyTop + i, 1, 1, clothD); break;
      case 4: // dress
        p(6, bodyTop, 4, 1, skin); p(4, bodyTop + 4, 8, 1, accent); break;
      case 5: // hoodie
        p(6, bodyTop + 3, 4, 2, clothD); p(7, bodyTop, 1, 3, accent); p(9, bodyTop, 1, 3, accent); break;
      case 6: // vest
        p(5, bodyTop, 2, 6, "#f4f1ea"); p(9, bodyTop, 2, 6, "#f4f1ea"); p(7, bodyTop + 1, 2, 3, accent); break;
    }
    if (av.accessory === 5) { p(5, bodyTop, 1, 3, accent); p(10, bodyTop, 1, 3, accent); p(6, bodyTop + 3, 4, 1, accent); p(7, bodyTop + 4, 2, 2, "#f4f1ea"); }
  } else if (dir === "up") {
    if (av.outfit === 5) p(5, bodyTop, 6, 3, clothD);
    else p(7, bodyTop + 1, 2, 5, clothD);
  } else {
    if (av.outfit === 0 || av.outfit === 1) ps(10, bodyTop, 1, 6, clothL);
  }

  // ---- arms ----
  const swing = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  if (!side) {
    p(2, 11 + by, 2, 6 + swing, OUTLINE); p(12, 11 + by, 2, 6 - swing, OUTLINE);
    p(2, 11 + by, 1, 5 + swing, clothD); p(13, 11 + by, 1, 5 - swing, clothD);
    p(2, 16 + by + swing, 2, 1, skin); p(12, 16 + by - swing, 2, 1, skin);
  } else {
    ps(7 + swing, 11 + by, 3, 6, OUTLINE); ps(7 + swing, 11 + by, 2, 5, clothD); ps(7 + swing, 16 + by, 2, 1, skin);
  }

  // ---- head ----
  const hy = by;
  ps(3, 1 + hy, 10, 10, OUTLINE);
  ps(4, 2 + hy, 8, 8, skin);
  ps(4, 9 + hy, 8, 1, skinD);
  // eyes / face
  if (dir === "down") {
    p(5, 6 + hy, 1, 2, OUTLINE); p(10, 6 + hy, 1, 2, OUTLINE);
    p(5, 8 + hy, 1, 1, shade(skin, -0.06)); p(10, 8 + hy, 1, 1, shade(skin, -0.06));
    p(7, 8 + hy, 2, 1, shade(skin, -0.2));
  } else if (side) {
    ps(10, 6 + hy, 1, 2, OUTLINE); ps(11, 7 + hy, 1, 1, skinD);
  }
  // facial hair
  if (av.facial && dir !== "up") {
    const fc = hairD;
    if (dir === "down") {
      if (av.facial === 1) { p(4, 8 + hy, 8, 2, fc); p(5, 7 + hy, 1, 1, fc); p(10, 7 + hy, 1, 1, fc); p(7, 8 + hy, 2, 1, shade(skin, -0.2)); }
      if (av.facial === 2) p(6, 8 + hy, 4, 1, fc);
      if (av.facial === 3) { ctx.globalAlpha = 0.35; p(4, 8 + hy, 8, 2, fc); ctx.globalAlpha = 1; }
    } else {
      if (av.facial === 1) ps(7, 8 + hy, 5, 2, fc);
      if (av.facial === 2) ps(10, 8 + hy, 2, 1, fc);
      if (av.facial === 3) { ctx.globalAlpha = 0.35; ps(7, 8 + hy, 5, 2, fc); ctx.globalAlpha = 1; }
    }
  }
  // hair
  const H = (x: number, y: number, w: number, h: number, c = hair) => ps(x, y + hy, w, h, c);
  const st = av.hair;
  if (dir === "up") {
    if (st !== 4) { H(3, 1, 10, 9, OUTLINE); H(4, 1, 8, 8); H(5, 2, 2, 1, hairL); }
    else { H(4, 2, 8, 3); }
    if (st === 2) { H(3, 8, 10, 4, OUTLINE); H(4, 8, 8, 3); }
    if (st === 3) { H(6, -1, 4, 3, OUTLINE); H(7, -1, 2, 2, hairD); }
    if (st === 6) { H(7, 9, 2, 4, hairD); }
    if (st === 5) { H(2, 1, 12, 7, OUTLINE); H(3, 1, 10, 6); }
  } else {
    // common top
    if (st === 4) { H(4, 2, 8, 2); }
    else if (st === 5) { H(2, 0, 12, 5, OUTLINE); H(3, 0, 10, 4); H(3, 4, 2, 2); H(11, 4, 2, 2); H(5, 1, 2, 1, hairL); H(9, 1, 2, 1, hairL); }
    else {
      H(3, 1, 10, 3, OUTLINE); H(4, 1, 8, 3); H(5, 1, 3, 1, hairL);
      if (dir === "down") {
        if (st === 0) { H(4, 4, 1, 1); H(11, 4, 1, 1); }
        if (st === 1) { H(4, 4, 4, 1); H(4, 5, 1, 1); H(11, 4, 1, 2); }
        if (st === 2) { H(3, 3, 2, 8, OUTLINE); H(11, 3, 2, 8, OUTLINE); H(3, 3, 2, 7); H(11, 3, 2, 7); }
        if (st === 3) { H(6, -1, 4, 3, OUTLINE); H(7, -1, 2, 2, hairD); H(4, 4, 1, 1); H(11, 4, 1, 1); }
        if (st === 6) { H(4, 4, 2, 1); H(10, 4, 2, 1); }
        if (st === 7) { H(4, 4, 6, 1); H(4, 3, 8, 1, hairL); }
      } else {
        // side views: hair covers the back of the head
        H(3, 2, 4, 6, OUTLINE); H(4, 2, 3, 5);
        if (st === 2) { H(3, 3, 3, 9, OUTLINE); H(4, 3, 2, 8); }
        if (st === 3) { H(3, 0, 3, 3, OUTLINE); H(3, 0, 2, 2, hairD); }
        if (st === 6) { H(2, 4, 2, 5, hairD); }
        if (st === 7 || st === 1) { H(8, 3, 4, 1); }
      }
    }
  }
  // accessories
  if (dir !== "up") {
    const acc = av.accessory;
    if (acc === 1 || acc === 2) {
      const lens = acc === 2 ? "#141018" : "#bfe8ff";
      if (dir === "down") { p(4, 6 + hy, 3, 2, OUTLINE); p(9, 6 + hy, 3, 2, OUTLINE); p(5, 6 + hy, 1, 1, lens); p(10, 6 + hy, 1, 1, lens); p(7, 6 + hy, 2, 1, OUTLINE); }
      else { ps(9, 6 + hy, 3, 2, OUTLINE); ps(10, 6 + hy, 1, 1, lens); ps(6, 6 + hy, 3, 1, OUTLINE); }
    }
    if (acc === 3) {
      if (dir === "down") { p(3, 3 + hy, 10, 1, "#2a2a33"); p(3, 6 + hy, 1, 3, "#2a2a33"); p(12, 6 + hy, 1, 3, "#2a2a33"); p(4, 9 + hy, 2, 1, accent); }
      else { ps(6, 2 + hy, 1, 6, "#2a2a33"); ps(6, 6 + hy, 2, 2, "#2a2a33"); ps(8, 9 + hy, 3, 1, accent); }
    }
    if (acc === 4) {
      if (dir === "down") { p(3, 8 + hy, 1, 1, ACCENT_COLORS[1]); p(12, 8 + hy, 1, 1, ACCENT_COLORS[1]); }
      else ps(6, 8 + hy, 1, 1, ACCENT_COLORS[1]);
    }
  }
}

/** Render a full sheet (48x96). Works on any 2D canvas context (browser). */
export function renderSheet(canvas: HTMLCanvasElement, av: Avatar) {
  canvas.width = FRAME_W * 3;
  canvas.height = FRAME_H * 4;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  DIRS.forEach((d, row) => { for (let f = 0; f < 3; f++) drawCharacter(ctx, f * FRAME_W, row * FRAME_H, av, d, f); });
  return canvas;
}
