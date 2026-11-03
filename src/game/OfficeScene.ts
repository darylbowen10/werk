import * as Phaser from "phaser";
import { bus, type FurnitureRow, type WorldAgent } from "./bus";
import { buildGrid, CEO_SUITE_GREET, CONFERENCE_CEO_SEAT, CONFERENCE_SEATS, MAP_H, MAP_W, PROPS, ROOMS, roomAt, SPAWN, T, TILE, vacantDeskProps, WANDER_SPOTS, type Prop } from "@/shared/map";
import { iconCanvas, drawProp, tilesetCanvas, TILE_INDEX } from "./textures";
import { renderSheet, sanitizeAvatar, DIRS, type Dir, FRAME_W, FRAME_H } from "@/shared/avatar";
import { furnitureDef } from "@/shared/furniture";
import { canPlace } from "@/shared/placement";
import { findPath, nearestWalkable, type Pt } from "./pathfinding";

export type SceneInit = {
  user: { name: string; avatar: Record<string, number> };
  company: { name: string; logo: { symbol: string; color: string; bg: string } };
  agents: WorldAgent[];
  furniture: FurnitureRow[];
};

type NpcState = "seated" | "walking" | "idle" | "following" | "meeting" | "approaching" | "waiting";
type Npc = {
  agent: WorldAgent; sprite: Phaser.GameObjects.Sprite; icon: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; marker: Phaser.GameObjects.Arc;
  home: Pt; state: NpcState; path: Pt[]; dir: Dir; nextWander: number; onArrive?: () => void; returnAt?: number; alert?: boolean; facePlayer?: boolean;
};

const SPEED_PLAYER = 84, SPEED_NPC = 58;
const tileCenter = (p: Pt) => ({ x: p.x * TILE + 8, y: p.y * TILE + 14 });
const UI_FONT = { fontFamily: "VT323, monospace", resolution: 4 } as const;

export class OfficeScene extends Phaser.Scene {
  private data0!: SceneInit;
  private grid!: number[][];
  private blocked = new Set<number>();
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerDir: Dir = "down";
  private playerMarker!: Phaser.GameObjects.Arc;
  private autoPath: Pt[] = [];
  private autoArrive?: () => void;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private furnitureSolids!: Phaser.Physics.Arcade.StaticGroup;
  private furnitureObjs: Phaser.GameObjects.GameObject[] = [];
  private furniture: FurnitureRow[] = [];
  private npcs = new Map<string, Npc>();
  private doors: { img: Phaser.GameObjects.Image; x: number; y: number; open: boolean }[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private locked = false;
  private prompt!: Phaser.GameObjects.Container;
  private promptText!: Phaser.GameObjects.Text;
  private target: { kind: "npc" | "prop"; id: string; label: string } | null = null;
  private currentRoom = "";
  private mini!: Phaser.Cameras.Scene2D.Camera;
  private bubbles = new Map<string, Phaser.GameObjects.Container>();
  private decor = { on: false, type: null as string | null, variant: 0, ghost: null as Phaser.GameObjects.Image | null, grid: null as Phaser.GameObjects.Graphics | null, hover: -1 };
  private unsub: (() => void)[] = [];
  private lastTile = { x: -1, y: -1 };

  constructor() { super("office"); }

  init(d: SceneInit) { this.data0 = d; this.furniture = d.furniture.filter((f) => !f.room || f.room === "ceo"); }

  create() {
    this.grid = buildGrid();
    this.makeTextures();
    this.buildMap();
    this.buildProps();
    this.buildFurniture();
    this.createPlayer();
    for (const a of this.data0.agents) this.addNpc(a);
    this.setupCameras();
    this.setupInput();
    this.setupPrompt();
    this.setupLights();
    this.wireBus();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsub.forEach((u) => u()));
    bus.emit("scene:ready");
  }

  // ------------------------------------------------------------------ textures
  private makeTextures() {
    if (!this.textures.exists("tiles")) this.textures.addCanvas("tiles", tilesetCanvas());
    for (const k of ["working", "waiting", "finished", "alert", "idle", "talk"] as const) if (!this.textures.exists(`ic-${k}`)) this.textures.addCanvas(`ic-${k}`, iconCanvas(k));
    if (!this.textures.exists("door")) this.textures.addCanvas("door", drawProp("door", 1, 1));
    if (!this.textures.exists("light")) {
      const c = document.createElement("canvas"); c.width = c.height = 128;
      const g = c.getContext("2d")!; const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      grd.addColorStop(0, "rgba(255,214,140,0.9)"); grd.addColorStop(1, "rgba(255,214,140,0)");
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128); this.textures.addCanvas("light", c);
    }
    if (!this.textures.exists("ekey")) {
      const c = document.createElement("canvas"); c.width = 11; c.height = 11; const g = c.getContext("2d")!;
      g.fillStyle = "#1b1420"; g.fillRect(0, 0, 11, 11); g.fillStyle = "#f7ecd5"; g.fillRect(1, 1, 9, 8); g.fillStyle = "#c9b796"; g.fillRect(1, 9, 9, 1);
      g.fillStyle = "#1b1420"; g.fillRect(3, 2, 5, 1); g.fillRect(3, 2, 1, 5); g.fillRect(3, 4, 4, 1); g.fillRect(3, 6, 5, 1);
      this.textures.addCanvas("ekey", c);
    }
  }

  private propTexture(sprite: string, w: number, h: number, variant = 0) {
    const key = `prop:${sprite}:${w}x${h}:${variant}`;
    if (!this.textures.exists(key)) {
      const logo = this.data0.company.logo;
      this.textures.addCanvas(key, drawProp(sprite, w, h, variant, { logoColor: logo?.color, logoBg: logo?.bg, logoSymbol: logo?.symbol }));
    }
    return key;
  }

  private charTexture(key: string, avatar: Record<string, number>) {
    if (this.textures.exists(key)) { DIRS.forEach((d) => this.anims.remove(`${key}-walk-${d}`)); this.textures.remove(key); }
    const tex = this.textures.addCanvas(key, renderSheet(document.createElement("canvas"), sanitizeAvatar(avatar)))!;
    for (let i = 0; i < 12; i++) tex.add(i, 0, (i % 3) * FRAME_W, Math.floor(i / 3) * FRAME_H, FRAME_W, FRAME_H);
    DIRS.forEach((d, r) => this.anims.create({ key: `${key}-walk-${d}`, frames: [1, 0, 2, 0].map((f) => ({ key, frame: r * 3 + f })), frameRate: 8, repeat: -1 }));
    return key;
  }

  // ------------------------------------------------------------------ world
  private buildMap() {
    const floorIdx: Record<number, number> = { [T.HALL]: TILE_INDEX.HALL, [T.WOOD]: TILE_INDEX.WOOD, [T.CARPET]: TILE_INDEX.CARPET, [T.TILEF]: TILE_INDEX.TILEF, [T.LOBBY]: TILE_INDEX.LOBBY, [T.DOOR]: TILE_INDEX.DOOR, [T.EXEC]: TILE_INDEX.EXEC, [T.BREAK]: TILE_INDEX.BREAK, [T.VACANT]: TILE_INDEX.VACANT, [T.EXIT]: TILE_INDEX.EXIT };
    const data = this.grid.map((row, y) => row.map((v, x) => {
      if (v === T.WALL) {
        const below = this.grid[y + 1]?.[x];
        const isFaceFloor = below !== undefined && below !== T.WALL && below !== T.VOID;
        if (!isFaceFloor) return TILE_INDEX.WALL_TOP;
        return (y === 0 && x % 6 === 3) ? TILE_INDEX.WALL_FACE_WIN : TILE_INDEX.WALL_FACE;
      }
      return floorIdx[v] ?? TILE_INDEX.VOID;
    }));
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const ts = map.addTilesetImage("tiles", "tiles", TILE, TILE, 0, 0)!;
    const layer = map.createLayer(0, ts, 0, 0)!;
    layer.setDepth(-10);
    layer.setCollision([TILE_INDEX.VOID, TILE_INDEX.WALL_TOP, TILE_INDEX.WALL_FACE, TILE_INDEX.WALL_FACE_WIN, TILE_INDEX.EXIT]);
    this.physics.world.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    (this as unknown as { layer: Phaser.Tilemaps.TilemapLayer }).layer = layer;
    // Door panels (slide open when someone approaches)
    for (const r of ROOMS) for (const d of r.doors) {
      const img = this.add.image(d.x * TILE + 8, d.y * TILE + 8, "door").setDepth(d.y * TILE + 2);
      this.doors.push({ img, x: d.x * TILE + 8, y: d.y * TILE + 8, open: false });
    }
    // Room name plaques beside doors
    for (const r of ROOMS) {
      const d = r.doors[0]; const above = d.y === r.y + r.h; // door on room's bottom wall → plaque in hallway below
      const t = this.add.text(d.x * TILE + (r.doors.length > 1 ? 16 : 8), (above ? d.y + 1 : d.y) * TILE - (above ? -1 : 9), r.name.replace(" Office", ""), { ...UI_FONT, fontSize: "8px", color: "#f7ecd5", backgroundColor: "#2b2438", padding: { x: 2, y: 0 } }).setOrigin(0.5, 0).setDepth(5000).setAlpha(0.85);
      this.uiOnly(t);
    }
  }

  private propRect(p: { x: number; y: number; w: number; h: number }) { return { x: p.x * TILE, y: p.y * TILE, w: p.w * TILE, h: p.h * TILE }; }

  private allProps(): Prop[] {
    const occupied = new Set(this.data0.agents.map((a) => a.office));
    return [
      ...PROPS.filter((p) => !(p.interact?.startsWith("hire:") && occupied.has(p.room))),
      ...[...occupied].filter((o) => o.startsWith("vacant")).flatMap((o) => vacantDeskProps(o)),
    ];
  }

  private propObjs: Phaser.GameObjects.GameObject[] = [];
  private buildProps() {
    this.propObjs.forEach((o) => o.destroy()); this.propObjs = [];
    this.solids ??= this.physics.add.staticGroup();
    this.solids.clear(true, true);
    for (const p of this.allProps()) {
      const r = this.propRect(p);
      const y = p.wall ? r.y - TILE : r.y;
      const img = this.add.image(r.x, y, this.propTexture(p.sprite, p.w, p.h)).setOrigin(0, 0).setDepth(p.wall ? y + r.h - 8 : r.y + r.h - 1);
      this.propObjs.push(img);
      if (p.solid && !p.wall) this.addSolid(this.solids, r.x, r.y + 4, r.w, r.h - 4);
      if (p.sprite === "monitor" || p.sprite === "finance_screen" || p.sprite === "server_rack" || p.sprite === "perf_display") {
        const glow = this.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, 0x6fa8ff, 0.08).setDepth(img.depth + 1).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: glow, alpha: { from: 0.02, to: 0.14 }, duration: 900 + Math.random() * 1400, yoyo: true, repeat: -1 });
        this.propObjs.push(glow);
      }
    }
    this.recomputeBlocked();
  }

  private addSolid(group: Phaser.Physics.Arcade.StaticGroup, x: number, y: number, w: number, h: number) {
    const z = this.add.zone(x + w / 2, y + h / 2, w, h);
    group.add(z);
    (z.body as Phaser.Physics.Arcade.StaticBody).setSize(w, h).updateFromGameObject();
  }

  private buildFurniture() {
    this.furnitureObjs.forEach((o) => o.destroy()); this.furnitureObjs = [];
    this.furnitureSolids ??= this.physics.add.staticGroup();
    this.furnitureSolids.clear(true, true);
    this.furniture.forEach((f, i) => {
      const d = furnitureDef(f.itemType); if (!d) return;
      const x = f.x * TILE, y = (d.wall ? f.y - 1 : f.y) * TILE;
      const img = this.add.image(x, y, this.propTexture(f.itemType, d.w, d.h, f.variant)).setOrigin(0, 0)
        .setDepth(d.layer === "floor" ? -5 : d.wall ? y + d.h * TILE - 8 : y + d.h * TILE - 1);
      img.setData("idx", i);
      this.furnitureObjs.push(img);
      if (d.solid && !d.wall && d.layer !== "floor") this.addSolid(this.furnitureSolids, x, y + 4, d.w * TILE, d.h * TILE - 4);
      if (f.itemType === "floor_lamp") {
        const l = this.add.image(x + 8, y + 4, "light").setScale(0.6).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD).setDepth(9000);
        this.uiOnly(l); this.furnitureObjs.push(l);
      }
    });
    this.recomputeBlocked();
  }

  private recomputeBlocked() {
    this.blocked.clear();
    const mark = (x: number, y: number, w: number, h: number) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.blocked.add(j * MAP_W + i); };
    for (const p of this.allProps()) if (p.solid && !p.wall) mark(p.x, p.y, p.w, p.h);
    for (const f of this.furniture) { const d = furnitureDef(f.itemType); if (d?.solid && !d.wall && d.layer !== "floor") mark(f.x, f.y, d.w, d.h); }
  }

  walkable = (x: number, y: number) => {
    const v = this.grid[y]?.[x];
    return v !== undefined && v !== T.WALL && v !== T.VOID && v !== T.EXIT && !this.blocked.has(y * MAP_W + x);
  };

  private setupLights() {
    for (const r of ROOMS) {
      const n = Math.max(1, Math.round((r.w * r.h) / 60));
      for (let i = 0; i < n; i++) {
        const l = this.add.image((r.x + (r.w * (i + 0.5)) / n) * TILE, (r.y + r.h / 2) * TILE, "light").setScale((r.h * TILE) / 90).setAlpha(0.1).setBlendMode(Phaser.BlendModes.ADD).setDepth(9000);
        this.tweens.add({ targets: l, alpha: { from: 0.08, to: 0.13 }, duration: 2400 + Math.random() * 1600, yoyo: true, repeat: -1 });
        this.uiOnly(l);
      }
    }
  }

  // ------------------------------------------------------------------ characters
  private createPlayer() {
    const key = this.charTexture("ch-player", this.data0.user.avatar);
    const p = tileCenter({ x: Math.floor(SPAWN.x), y: Math.floor(SPAWN.y) });
    this.player = this.physics.add.sprite(p.x, p.y, key, 0).setOrigin(0.5, 1);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(10, 6).setOffset(3, 18);
    this.player.setCollideWorldBounds(true);
    const layer = (this as unknown as { layer: Phaser.Tilemaps.TilemapLayer }).layer;
    this.physics.add.collider(this.player, layer);
    this.physics.add.collider(this.player, this.solids);
    this.physics.add.collider(this.player, this.furnitureSolids);
    this.playerMarker = this.add.circle(p.x, p.y, 14, 0xf2c14e).setDepth(10001);
  }

  private homeFor(a: WorldAgent): Pt {
    const r = ROOMS.find((x) => x.key === a.office);
    return r?.seat ?? nearestWalkable(this.walkable, { x: 25, y: 13 }, MAP_W, MAP_H)!;
  }

  private addNpc(a: WorldAgent) {
    const key = this.charTexture(`ch-${a.id}`, a.avatar);
    const home = this.homeFor(a);
    const pos = tileCenter(home);
    const sprite = this.add.sprite(pos.x, pos.y, key, 0).setOrigin(0.5, 1);
    const icon = this.add.image(pos.x, pos.y - 28, "ic-idle").setDepth(9500).setVisible(false);
    const label = this.add.text(pos.x, pos.y + 1, `${a.name} · ${shortTitle(a)}`, { ...UI_FONT, fontSize: "8px", color: "#f7ecd5", backgroundColor: "#1b1726cc", padding: { x: 2, y: 0 } }).setOrigin(0.5, 0).setDepth(9600).setVisible(false);
    const marker = this.add.circle(pos.x, pos.y, 10, 0x4fc1b0).setDepth(10000);
    if (this.mini) { this.mini.ignore([sprite, icon, label]); this.cameras.main.ignore(marker); }
    const npc: Npc = { agent: a, sprite, icon, label, marker, home, state: "seated", path: [], dir: "down", nextWander: this.time.now + 20000 + Math.random() * 40000 };
    this.npcs.set(a.id, npc);
    this.applyStatus(npc);
  }

  private applyStatus(n: Npc) {
    const s = n.alert ? "alert" : n.agent.status;
    const show = ["working", "waiting", "finished", "alert"].includes(s);
    n.icon.setVisible(show);
    if (show) n.icon.setTexture(`ic-${s}`);
  }

  private walkTo(n: Npc, goal: Pt, state: NpcState, onArrive?: () => void) {
    const start = this.tileOf(n.sprite.x, n.sprite.y);
    const path = findPath(this.walkable, this.walkable(start.x, start.y) ? start : (nearestWalkable(this.walkable, start, MAP_W, MAP_H) ?? start), goal, MAP_W, MAP_H);
    if (!path) { onArrive?.(); return false; }
    n.path = path.slice(1); n.state = state; n.onArrive = onArrive;
    if (!n.path.length) { n.onArrive = undefined; onArrive?.(); }
    return true;
  }

  private tileOf(x: number, y: number): Pt { return { x: Math.floor(x / TILE), y: Math.floor((y - 4) / TILE) }; }

  private adjacentToPlayer(from: Pt): Pt {
    const p = this.tileOf(this.player.x, this.player.y);
    const opts = [{ x: p.x, y: p.y + 1 }, { x: p.x - 1, y: p.y }, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y - 1 }, { x: p.x - 1, y: p.y + 1 }, { x: p.x + 1, y: p.y + 1 }].filter((t) => this.walkable(t.x, t.y));
    opts.sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y));
    return opts[0] ?? p;
  }

  private stepNpc(n: Npc, dt: number) {
    const key = n.sprite.texture.key;
    if (n.path.length) {
      const t = tileCenter(n.path[0]);
      const dx = t.x - n.sprite.x, dy = t.y - n.sprite.y, dist = Math.hypot(dx, dy);
      const step = (SPEED_NPC * dt) / 1000;
      if (dist <= step) { n.sprite.setPosition(t.x, t.y); n.path.shift(); }
      else { n.sprite.x += (dx / dist) * step; n.sprite.y += (dy / dist) * step; }
      const dir: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      if (dir !== n.dir || !n.sprite.anims.isPlaying) { n.dir = dir; n.sprite.play(`${key}-walk-${dir}`, true); }
      if (!n.path.length) {
        n.sprite.anims.stop(); n.sprite.setFrame(DIRS.indexOf(n.dir) * 3);
        const cb = n.onArrive; n.onArrive = undefined;
        if (n.state === "walking") n.state = "seated";
        cb?.();
      }
    } else if (n.facePlayer || n.state === "following" || n.state === "waiting") {
      const dx = this.player.x - n.sprite.x, dy = this.player.y - n.sprite.y;
      const dir: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      n.dir = dir; n.sprite.setFrame(DIRS.indexOf(dir) * 3);
    }
    // ambient life: occasional trip to the break room / lobby
    if (n.state === "seated" && !n.path.length && this.time.now > n.nextWander && !this.locked) {
      n.nextWander = this.time.now + 45000 + Math.random() * 60000;
      if (Math.random() < 0.3 && n.agent.status !== "working" && this.currentRoom !== n.agent.office) {
        const spot = WANDER_SPOTS[Math.floor(Math.random() * WANDER_SPOTS.length)];
        this.walkTo(n, spot, "idle", () => { n.returnAt = this.time.now + 6000 + Math.random() * 6000; });
      }
    }
    if (n.state === "idle" && n.returnAt && this.time.now > n.returnAt && !n.path.length) {
      n.returnAt = undefined; this.walkTo(n, n.home, "walking", () => { n.state = "seated"; n.dir = "down"; n.sprite.setFrame(0); });
    }
    if (n.state === "following" && !n.path.length) {
      const me = this.tileOf(n.sprite.x, n.sprite.y), p = this.tileOf(this.player.x, this.player.y);
      if (Math.abs(me.x - p.x) + Math.abs(me.y - p.y) > 2) this.walkTo(n, this.adjacentToPlayer(me), "following");
    }
    if (n.state === "following" && n.path.length > 0 && Math.random() < 0.02) {
      // re-target as the player moves
      const me = this.tileOf(n.sprite.x, n.sprite.y);
      this.walkTo(n, this.adjacentToPlayer(me), "following");
    }
    n.sprite.setDepth(n.sprite.y);
    n.icon.setPosition(n.sprite.x, n.sprite.y - 27 + Math.round(Math.sin(this.time.now / 260) * 1.5));
    n.marker.setPosition(n.sprite.x, n.sprite.y - 8);
    const near = Phaser.Math.Distance.Between(n.sprite.x, n.sprite.y, this.player.x, this.player.y) < 70;
    n.label.setVisible(near).setPosition(n.sprite.x, n.sprite.y + 1);
    const b = this.bubbles.get(n.agent.id);
    if (b) b.setPosition(n.sprite.x, n.sprite.y - 30);
  }

  // ------------------------------------------------------------------ cameras & input
  private setupCameras() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE).setRoundPixels(true).setBackgroundColor("#141019");
    cam.startFollow(this.player, true, 0.15, 0.15);
    this.mini = this.cameras.add(0, 0, 200, Math.round((200 * MAP_H) / MAP_W)).setZoom(200 / (MAP_W * TILE)).setBackgroundColor("#0e0b13").setName("mini");
    this.mini.centerOn((MAP_W * TILE) / 2, (MAP_H * TILE) / 2);
    cam.ignore([this.playerMarker, ...[...this.npcs.values()].map((n) => n.marker)]);
    this.mini.ignore([...[...this.npcs.values()].flatMap((n) => [n.sprite, n.icon, n.label]), this.player, ...this.pendingUi]);
    this.pendingUi = [];
    const layout = () => {
      const w = this.scale.width, h = this.scale.height;
      cam.setSize(w, h);
      cam.setZoom(Math.max(2, Math.min(4, Math.floor(Math.min(w / (TILE * 20), h / (TILE * 13))))));
      this.mini.setPosition(w - 212, h - this.mini.height - 12);
    };
    layout();
    this.scale.on("resize", layout);
    this.tweens.add({ targets: this.playerMarker, alpha: { from: 1, to: 0.4 }, duration: 600, yoyo: true, repeat: -1 });
  }

  private pendingUi: Phaser.GameObjects.GameObject[] = [];
  private uiOnly(o: Phaser.GameObjects.GameObject) { if (this.mini) this.mini.ignore(o); else this.pendingUi.push(o); }

  private setupInput() {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE,SHIFT,R,DELETE,BACKSPACE,ESC", false) as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on("keydown-E", () => this.interact());
    kb.on("keydown-SPACE", () => this.interact());
    kb.on("keydown-R", () => { if (this.decor.on && this.decor.type) { const d = furnitureDef(this.decor.type); this.decor.variant = (this.decor.variant + 1) % (d?.variants ?? 1); this.refreshGhost(); } });
    const del = () => { if (this.decor.on && this.decor.hover >= 0) { this.furniture.splice(this.decor.hover, 1); this.decor.hover = -1; this.afterDecorChange(); } };
    kb.on("keydown-DELETE", del); kb.on("keydown-BACKSPACE", del);
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.decorPointer(p));
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.decorClick(p));
    this.input.mouse?.disableContextMenu();
  }

  private setupPrompt() {
    const key = this.add.image(0, 0, "ekey").setOrigin(0, 0.5);
    this.promptText = this.add.text(13, 0, "", { ...UI_FONT, fontSize: "9px", color: "#f7ecd5", backgroundColor: "#1b1726", padding: { x: 3, y: 1 } }).setOrigin(0, 0.5);
    this.prompt = this.add.container(0, 0, [key, this.promptText]).setDepth(9800).setVisible(false);
    this.uiOnly(this.prompt);
  }

  // ------------------------------------------------------------------ bus wiring
  private wireBus() {
    const on = (ev: string, fn: (p: any) => void) => this.unsub.push(bus.on(ev, fn)); // eslint-disable-line @typescript-eslint/no-explicit-any
    on("controls:lock", (v: boolean) => { this.locked = v; this.input.keyboard!.enabled = !v; if (v) { this.input.keyboard!.resetKeys(); this.player.setVelocity(0); } });
    on("agent:status", (p: { id: string; status: string; note?: string }) => { const n = this.npcs.get(p.id); if (n) { n.agent.status = p.status; n.agent.statusNote = p.note ?? ""; this.applyStatus(n); } });
    on("agents:sync", (list: WorldAgent[]) => this.syncAgents(list));
    on("player:avatar", (avatar: Record<string, number>) => { const k = this.charTexture("ch-player", avatar); this.player.setTexture(k, DIRS.indexOf(this.playerDir) * 3); });
    on("bubble", (p: { agentId: string; text: string; ms?: number }) => this.showBubble(p.agentId, p.text, p.ms));
    on("bubble:clear", (agentId: string) => { this.bubbles.get(agentId)?.destroy(); this.bubbles.delete(agentId); });
    on("npc:approach", (p: { agentId: string; reason?: string }) => this.npcApproach(p.agentId, p.reason));
    on("npc:follow", (p: { agentId: string; on: boolean }) => { const n = this.npcs.get(p.agentId); if (!n) return; if (p.on) { n.state = "following"; n.path = []; } else this.npcReturn(p.agentId); });
    on("npc:return", (agentId: string) => this.npcReturn(agentId));
    on("npc:face", (p: { agentId: string; on: boolean }) => { const n = this.npcs.get(p.agentId); if (n) n.facePlayer = p.on; });
    on("meet:office", (p: { agentId: string }) => this.meetInOffice(p.agentId));
    on("meeting:gather", (ids: string[]) => this.gatherMeeting(ids));
    on("meeting:disperse", (ids: string[]) => ids.forEach((id) => this.npcReturn(id)));
    on("player:walkTo", (p: Pt & { emit?: string }) => this.autoWalk(p, () => p.emit && bus.emit(p.emit)));
    on("decor:start", () => this.decorStart());
    on("decor:stop", () => this.decorStop());
    on("decor:select", (p: { type: string | null; variant?: number }) => { this.decor.type = p.type; this.decor.variant = p.variant ?? 0; this.refreshGhost(); });
    on("decor:reset", (items: FurnitureRow[]) => { this.furniture = items.map((i) => ({ ...i })); this.buildFurniture(); });
    on("company:logo", (logo: SceneInit["company"]["logo"]) => { this.data0.company.logo = logo; [...this.textures.getTextureKeys()].filter((k) => k.startsWith("prop:logo_wall")).forEach((k) => this.textures.remove(k)); this.buildProps(); this.buildFurniture(); });
  }

  private syncAgents(list: WorldAgent[]) {
    const ids = new Set(list.map((a) => a.id));
    for (const [id, n] of this.npcs) if (!ids.has(id)) { n.sprite.destroy(); n.icon.destroy(); n.label.destroy(); n.marker.destroy(); this.npcs.delete(id); }
    this.data0.agents = list;
    for (const a of list) {
      const n = this.npcs.get(a.id);
      if (!n) this.addNpc(a);
      else {
        const moved = n.agent.office !== a.office;
        if (JSON.stringify(n.agent.avatar) !== JSON.stringify(a.avatar)) n.sprite.setTexture(this.charTexture(`ch-${a.id}`, a.avatar), 0);
        n.agent = a; n.label.setText(`${a.name} · ${shortTitle(a)}`); this.applyStatus(n);
        if (moved) { n.home = this.homeFor(a); this.npcReturn(a.id); }
      }
    }
    this.buildProps();
  }

  private showBubble(agentId: string, text: string, ms = 6000) {
    const n = this.npcs.get(agentId); if (!n) return;
    this.bubbles.get(agentId)?.destroy();
    const short = text.length > 90 ? text.slice(0, 87) + "…" : text;
    const t = this.add.text(0, 0, short, { ...UI_FONT, fontSize: "9px", color: "#1b1726", wordWrap: { width: 120 }, lineSpacing: -2 }).setOrigin(0.5, 1);
    const w = t.width + 8, h = t.height + 5;
    const g = this.add.graphics();
    g.fillStyle(0x1b1420).fillRoundedRect(-w / 2 - 1, -h - 1, w + 2, h + 2, 3);
    g.fillStyle(0xf7ecd5).fillRoundedRect(-w / 2, -h, w, h, 3);
    g.fillStyle(0xf7ecd5).fillTriangle(-3, -1, 3, -1, 0, 4);
    t.setPosition(0, -3);
    const c = this.add.container(n.sprite.x, n.sprite.y - 30, [g, t]).setDepth(9900);
    this.uiOnly(c);
    this.bubbles.set(agentId, c);
    if (ms > 0) this.time.delayedCall(ms, () => { if (this.bubbles.get(agentId) === c) { c.destroy(); this.bubbles.delete(agentId); } });
  }

  private npcApproach(agentId: string, reason?: string) {
    const n = this.npcs.get(agentId); if (!n || n.state === "following" || n.state === "meeting") return;
    n.alert = true; this.applyStatus(n);
    const me = this.tileOf(n.sprite.x, n.sprite.y);
    const go = () => this.walkTo(n, this.adjacentToPlayer(me), "approaching", () => {
      // re-check distance (player may have moved); if close enough, announce arrival
      const d = Phaser.Math.Distance.Between(n.sprite.x, n.sprite.y, this.player.x, this.player.y);
      if (d > 40 && n.state === "approaching") { go(); return; }
      n.state = "waiting"; n.facePlayer = true;
      bus.emit("npc:arrived", { agentId, reason });
      n.returnAt = this.time.now + 30000;
    });
    go();
  }

  npcReturn(agentId: string) {
    const n = this.npcs.get(agentId); if (!n) return;
    n.alert = false; n.facePlayer = false; this.applyStatus(n);
    this.walkTo(n, n.home, "walking", () => { n.state = "seated"; n.dir = "down"; n.sprite.setFrame(0); });
  }

  private meetInOffice(agentId: string) {
    const n = this.npcs.get(agentId);
    let arrived = 0;
    const done = () => { if (++arrived === 2) bus.emit("meet:office:arrived", { agentId }); };
    this.autoWalk({ x: CEO_SUITE_GREET.x + 2, y: CEO_SUITE_GREET.y }, () => { this.playerDir = "left"; this.player.setFrame(3); done(); });
    if (n) this.walkTo(n, CEO_SUITE_GREET, "waiting", () => { n.dir = "right"; n.sprite.setFrame(6); done(); }); else done();
  }

  private gatherMeeting(ids: string[]) {
    ids.forEach((id, i) => { const n = this.npcs.get(id); const seat = CONFERENCE_SEATS[i % CONFERENCE_SEATS.length]; if (n) this.walkTo(n, seat, "meeting", () => { n.dir = seat.y < 20 ? "down" : seat.y > 21 ? "up" : seat.x < 28 ? "right" : "left"; n.sprite.setFrame(DIRS.indexOf(n.dir) * 3); }); });
    this.autoWalk(CONFERENCE_CEO_SEAT, () => { this.playerDir = "up"; this.player.setFrame(9); });
  }

  private autoWalk(goal: Pt, onArrive?: () => void) {
    const start = this.tileOf(this.player.x, this.player.y);
    const path = findPath(this.walkable, start, goal, MAP_W, MAP_H);
    if (!path) { onArrive?.(); return; }
    this.autoPath = path.slice(1); this.autoArrive = onArrive;
    if (!this.autoPath.length) { this.autoArrive = undefined; onArrive?.(); }
  }

  // ------------------------------------------------------------------ interaction
  private findTarget() {
    if (this.decor.on) return null;
    const px = this.player.x, py = this.player.y;
    let best: { kind: "npc" | "prop"; id: string; label: string; d: number; x: number; y: number } | null = null;
    for (const n of this.npcs.values()) {
      const d = Phaser.Math.Distance.Between(px, py, n.sprite.x, n.sprite.y);
      // seated NPCs are reached across their desk
      const reach = n.state === "seated" && !n.path.length ? 38 : 26;
      if (d < reach && (!best || d < best.d)) best = { kind: "npc", id: n.agent.id, label: `Talk to ${n.agent.name}`, d, x: n.sprite.x, y: n.sprite.y - 26 };
    }
    for (const p of this.allProps()) {
      if (!p.interact) continue;
      const r = this.propRect(p);
      const ry = p.wall ? r.y - TILE : r.y;
      const rh = p.wall ? TILE : r.h;
      // distance from the player's feet to the prop's rectangle
      const dx = Math.max(r.x - px, 0, px - (r.x + r.w)), dy = Math.max(ry - py, 0, py - (ry + rh));
      const reach = p.wall ? 22 : p.w * p.h >= 9 ? 34 : 20;
      const edge = Math.hypot(dx, dy);
      if (edge < reach) {
        const d = edge + 8;
        if (!best || d < best.d) best = { kind: "prop", id: p.interact, label: p.label ?? "Interact", d, x: r.x + r.w / 2, y: ry - 4 };
      }
    }
    return best;
  }

  private interact() {
    if (this.locked || !this.target) return;
    if (this.target.kind === "npc") {
      const n = this.npcs.get(this.target.id);
      if (n) { n.alert = false; this.applyStatus(n); n.facePlayer = true; n.path = n.state === "following" ? n.path : []; }
      bus.emit("interact", { kind: "npc", agentId: this.target.id });
    } else bus.emit("interact", { kind: "prop", id: this.target.id });
  }

  // ------------------------------------------------------------------ decor editor
  private decorStart() {
    this.decor.on = true;
    const r = ROOMS.find((x) => x.key === "ceo")!;
    const g = this.add.graphics().setDepth(9700);
    g.lineStyle(1, 0xf2c14e, 0.25);
    for (let x = r.x; x <= r.x + r.w; x++) g.lineBetween(x * TILE, (r.y - 1) * TILE, x * TILE, (r.y + r.h) * TILE);
    for (let y = r.y - 1; y <= r.y + r.h; y++) g.lineBetween(r.x * TILE, y * TILE, (r.x + r.w) * TILE, y * TILE);
    g.lineStyle(2, 0xf2c14e, 0.8).strokeRect(r.x * TILE, (r.y - 1) * TILE, r.w * TILE, (r.h + 1) * TILE);
    this.decor.grid = g; this.uiOnly(g);
    bus.emit("decor:changed", this.furniture);
  }
  private decorStop() {
    this.decor.on = false; this.decor.type = null;
    this.decor.grid?.destroy(); this.decor.grid = null;
    this.decor.ghost?.destroy(); this.decor.ghost = null;
    this.furnitureObjs.forEach((o) => (o as Phaser.GameObjects.Image).clearTint?.());
  }
  private refreshGhost() {
    this.decor.ghost?.destroy(); this.decor.ghost = null;
    if (!this.decor.type) return;
    const d = furnitureDef(this.decor.type); if (!d) return;
    this.decor.ghost = this.add.image(0, 0, this.propTexture(d.type, d.w, d.h, this.decor.variant)).setOrigin(0, 0).setAlpha(0.7).setDepth(9750);
    this.uiOnly(this.decor.ghost);
    this.decorPointer(this.input.activePointer);
  }
  private pointerTile(p: Phaser.Input.Pointer) { const w = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2; return { x: Math.floor(w.x / TILE), y: Math.floor(w.y / TILE) }; }
  private decorPointer(p: Phaser.Input.Pointer) {
    if (!this.decor.on) return;
    const t = this.pointerTile(p);
    if (this.decor.ghost && this.decor.type) {
      const d = furnitureDef(this.decor.type)!;
      const y = d.wall ? 1 : t.y; // wall items snap to the back wall
      const ok = !canPlace({ itemType: d.type, x: t.x, y }, this.furniture);
      this.decor.ghost.setPosition(t.x * TILE, (d.wall ? y - 1 : y) * TILE).setTint(ok ? 0xa8ffcf : 0xff8080);
      this.decor.ghost.setData("tile", { x: t.x, y, ok });
    }
    this.decor.hover = -1;
    this.furnitureObjs.forEach((o) => (o as Phaser.GameObjects.Image).clearTint?.());
    if (!this.decor.type) {
      for (let i = this.furniture.length - 1; i >= 0; i--) {
        const f = this.furniture[i], d = furnitureDef(f.itemType); if (!d) continue;
        const fy = d.wall ? f.y - 1 : f.y;
        if (t.x >= f.x && t.x < f.x + d.w && t.y >= fy && t.y < fy + d.h) { this.decor.hover = i; break; }
      }
      const obj = this.furnitureObjs.find((o) => o.getData("idx") === this.decor.hover) as Phaser.GameObjects.Image | undefined;
      obj?.setTint(0xffe28a);
    }
    bus.emit("decor:hover", this.decor.hover >= 0 ? this.furniture[this.decor.hover] : null);
  }
  private decorClick(p: Phaser.Input.Pointer) {
    if (!this.decor.on) return;
    if (p.rightButtonDown()) { this.decor.type = null; this.refreshGhost(); bus.emit("decor:selected", null); return; }
    if (this.decor.type && this.decor.ghost) {
      const t = this.decor.ghost.getData("tile") as { x: number; y: number; ok: boolean } | undefined;
      if (!t?.ok) { bus.emit("decor:error", canPlace({ itemType: this.decor.type, x: t?.x ?? 0, y: t?.y ?? 0 }, this.furniture)); return; }
      this.furniture.push({ itemType: this.decor.type, x: t.x, y: t.y, variant: this.decor.variant, room: "ceo" });
      this.afterDecorChange();
      if (this.decor.hover === -2) { this.decor.type = null; this.refreshGhost(); bus.emit("decor:selected", null); this.decor.hover = -1; }
    } else if (this.decor.hover >= 0) {
      // pick up an existing item to move it
      const [f] = this.furniture.splice(this.decor.hover, 1);
      this.decor.type = f.itemType; this.decor.variant = f.variant; this.decor.hover = -2;
      this.afterDecorChange(); this.refreshGhost();
      bus.emit("decor:selected", { type: f.itemType, variant: f.variant });
    }
  }
  private afterDecorChange() { this.buildFurniture(); bus.emit("decor:changed", this.furniture); }

  // ------------------------------------------------------------------ main loop
  update(_t: number, rawDt: number) {
    const dt = Math.min(rawDt, 100);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    let vx = 0, vy = 0;
    if (this.autoPath.length) {
      const t = tileCenter(this.autoPath[0]);
      const dx = t.x - this.player.x, dy = t.y - this.player.y, dist = Math.hypot(dx, dy);
      const step = (SPEED_PLAYER * dt) / 1000;
      if (dist <= Math.max(2, step)) {
        body.reset(t.x, t.y); this.autoPath.shift();
        if (!this.autoPath.length) { const cb = this.autoArrive; this.autoArrive = undefined; this.player.setVelocity(0); this.player.anims.stop(); this.player.setFrame(DIRS.indexOf(this.playerDir) * 3); cb?.(); }
        else { const n = tileCenter(this.autoPath[0]); const ddx = n.x - t.x, ddy = n.y - t.y, dd = Math.hypot(ddx, ddy) || 1; vx = (ddx / dd) * SPEED_PLAYER; vy = (ddy / dd) * SPEED_PLAYER; }
      } else { vx = (dx / dist) * SPEED_PLAYER; vy = (dy / dist) * SPEED_PLAYER; }
    } else if (!this.locked) {
      const k = this.keys;
      if (k.A.isDown || k.LEFT.isDown) vx -= 1;
      if (k.D.isDown || k.RIGHT.isDown) vx += 1;
      if (k.W.isDown || k.UP.isDown) vy -= 1;
      if (k.S.isDown || k.DOWN.isDown) vy += 1;
      const len = Math.hypot(vx, vy) || 1;
      const sp = SPEED_PLAYER * (k.SHIFT.isDown ? 1.5 : 1);
      vx = (vx / len) * sp; vy = (vy / len) * sp;
    }
    this.player.setVelocity(vx, vy);
    if (vx || vy) {
      const dir: Dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
      this.playerDir = dir;
      this.player.play(`ch-player-walk-${dir}`, true);
    } else if (this.player.anims.isPlaying) { this.player.anims.stop(); this.player.setFrame(DIRS.indexOf(this.playerDir) * 3); }
    this.player.setDepth(this.player.y);
    this.playerMarker.setPosition(this.player.x, this.player.y - 8);

    for (const n of this.npcs.values()) {
      this.stepNpc(n, dt);
      if (n.state === "waiting" && n.returnAt && this.time.now > n.returnAt && !n.path.length) { n.returnAt = undefined; this.npcReturn(n.agent.id); bus.emit("npc:left", { agentId: n.agent.id }); }
    }

    // doors
    const movers = [this.player as Phaser.GameObjects.Sprite, ...[...this.npcs.values()].map((n) => n.sprite)];
    for (const d of this.doors) {
      const near = movers.some((m) => Math.abs(m.x - d.x) < 14 && Math.abs(m.y - 6 - d.y) < 22);
      if (near !== d.open) { d.open = near; this.tweens.add({ targets: d.img, scaleX: near ? 0.12 : 1, alpha: near ? 0.5 : 1, duration: 140 }); }
    }

    // interaction prompt
    const t = this.findTarget();
    this.target = t ? { kind: t.kind, id: t.id, label: t.label } : null;
    if (t && !this.locked) { this.promptText.setText(t.label); this.prompt.setPosition(Math.round(t.x - (13 + this.promptText.width) / 2), Math.round(t.y)).setVisible(true); }
    else this.prompt.setVisible(false);

    // room tracking
    const tile = this.tileOf(this.player.x, this.player.y);
    if (tile.x !== this.lastTile.x || tile.y !== this.lastTile.y) {
      this.lastTile = tile;
      const r = roomAt(tile.x, tile.y);
      const key = r?.key ?? "hall";
      if (key !== this.currentRoom) {
        this.currentRoom = key; bus.emit("room", { key, name: r?.name ?? "Hallway" });
        // The occupant heads back to their desk when the CEO walks into their office.
        for (const n of this.npcs.values()) if (n.agent.office === key && n.state === "idle") { n.returnAt = undefined; this.walkTo(n, n.home, "walking", () => { n.state = "seated"; n.dir = "down"; n.sprite.setFrame(0); }); }
      }
      bus.emit("player:tile", tile);
    }
  }
}

function shortTitle(a: WorldAgent) {
  const map: Record<string, string> = { ea: "Assistant", cfo: "CFO", coo: "COO", cmo: "CMO", cro: "CRO", cto: "CTO", hr: "HR" };
  return map[a.key] ?? a.title;
}
