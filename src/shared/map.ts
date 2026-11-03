// Executive HQ building layout. Grid of 16px tiles. Generated procedurally from room rects so it stays consistent.

export const TILE = 16;
export const MAP_W = 58;
export const MAP_H = 43;

export const T = {
  VOID: 0,
  WALL: 1,
  HALL: 2,
  WOOD: 3,
  CARPET: 4,
  TILEF: 5,
  LOBBY: 6,
  DOOR: 7,
  EXEC: 8,
  BREAK: 9,
  VACANT: 10,
  EXIT: 11,
} as const;

export type RoomKind = "office" | "common" | "vacant" | "hall";
export type Room = {
  key: string;
  name: string;
  x: number; y: number; w: number; h: number;
  floor: number;
  kind: RoomKind;
  doors: { x: number; y: number }[];
  accent: string;
  /** Seat tile where the occupant works (NPC home). */
  seat?: { x: number; y: number };
};

const door = (x: number, y: number) => ({ x, y });

export const ROOMS: Room[] = [
  // ---- top row (y 1..10), doors on wall y=11 ----
  { key: "cfo", name: "CFO Office", x: 1, y: 1, w: 8, h: 10, floor: T.WOOD, kind: "office", doors: [door(5, 11)], accent: "#4fc1b0", seat: { x: 4, y: 4 } },
  { key: "coo", name: "COO Office", x: 10, y: 1, w: 8, h: 10, floor: T.CARPET, kind: "office", doors: [door(14, 11)], accent: "#f2c14e", seat: { x: 13, y: 4 } },
  { key: "ea", name: "Executive Assistant", x: 19, y: 1, w: 6, h: 10, floor: T.WOOD, kind: "office", doors: [door(22, 11)], accent: "#e8697d", seat: { x: 21, y: 4 } },
  { key: "ceo", name: "CEO Executive Suite", x: 26, y: 1, w: 14, h: 10, floor: T.EXEC, kind: "office", doors: [door(32, 11), door(33, 11)], accent: "#f2c14e" },
  { key: "cmo", name: "CMO Office", x: 41, y: 1, w: 8, h: 10, floor: T.CARPET, kind: "office", doors: [door(45, 11)], accent: "#e8697d", seat: { x: 44, y: 4 } },
  { key: "cro", name: "CRO Office", x: 50, y: 1, w: 7, h: 10, floor: T.WOOD, kind: "office", doors: [door(53, 11)], accent: "#6fa8ff", seat: { x: 53, y: 4 } },
  // ---- middle row (y 16..25), doors on y=15 (top) and/or y=26 (bottom) ----
  { key: "cto", name: "CTO Office", x: 1, y: 16, w: 8, h: 10, floor: T.TILEF, kind: "office", doors: [door(5, 15)], accent: "#6fa8ff", seat: { x: 4, y: 19 } },
  { key: "hr", name: "HR Office", x: 10, y: 16, w: 8, h: 10, floor: T.CARPET, kind: "office", doors: [door(14, 15)], accent: "#7b5aa6", seat: { x: 13, y: 19 } },
  { key: "conference", name: "Conference Room", x: 23, y: 16, w: 12, h: 10, floor: T.CARPET, kind: "common", doors: [door(28, 15), door(29, 15)], accent: "#f2c14e" },
  { key: "break", name: "Break Room", x: 36, y: 16, w: 10, h: 10, floor: T.BREAK, kind: "common", doors: [door(40, 15), door(40, 26)], accent: "#4fc1b0" },
  { key: "vacant1", name: "Vacant Office A", x: 51, y: 16, w: 6, h: 10, floor: T.VACANT, kind: "vacant", doors: [door(53, 15)], accent: "#a89cc0", seat: { x: 53, y: 19 } },
  // ---- bottom row (y 31..41), doors on y=30 ----
  { key: "vacant2", name: "Vacant Office B", x: 1, y: 31, w: 8, h: 11, floor: T.VACANT, kind: "vacant", doors: [door(5, 30)], accent: "#a89cc0", seat: { x: 4, y: 34 } },
  { key: "vacant3", name: "Vacant Office C", x: 10, y: 31, w: 8, h: 11, floor: T.VACANT, kind: "vacant", doors: [door(14, 30)], accent: "#a89cc0", seat: { x: 13, y: 34 } },
  { key: "lobby", name: "Lobby", x: 19, y: 31, w: 20, h: 11, floor: T.LOBBY, kind: "common", doors: [door(27, 30), door(28, 30), door(29, 30), door(30, 30)], accent: "#f2c14e" },
  { key: "vacant4", name: "Vacant Office D", x: 40, y: 31, w: 8, h: 11, floor: T.VACANT, kind: "vacant", doors: [door(44, 30)], accent: "#a89cc0", seat: { x: 43, y: 34 } },
  { key: "vacant5", name: "Vacant Office E", x: 49, y: 31, w: 8, h: 11, floor: T.VACANT, kind: "vacant", doors: [door(53, 30)], accent: "#a89cc0", seat: { x: 52, y: 34 } },
];

export const HALLS = [
  { x: 1, y: 12, w: 56, h: 3 },   // north hallway
  { x: 1, y: 27, w: 56, h: 3 },   // south hallway
  { x: 19, y: 15, w: 3, h: 12 },  // west connector
  { x: 47, y: 15, w: 3, h: 12 },  // east connector
];

export const EXIT_TILES = [{ x: 28, y: 42 }, { x: 29, y: 42 }];
export const SPAWN = { x: 28.5, y: 38 };

export const OFFICE_ROOMS = ROOMS.filter((r) => r.kind === "office" && r.key !== "ceo").map((r) => r.key);
export const VACANT_ROOMS = ROOMS.filter((r) => r.kind === "vacant").map((r) => r.key);

export function roomAt(tx: number, ty: number): Room | null {
  for (const r of ROOMS) if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return r;
  return null;
}

export function buildGrid(): number[][] {
  const g: number[][] = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(T.WALL));
  const fill = (x: number, y: number, w: number, h: number, v: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j][i] = v;
  };
  for (const h of HALLS) fill(h.x, h.y, h.w, h.h, T.HALL);
  for (const r of ROOMS) {
    fill(r.x, r.y, r.w, r.h, r.floor);
    for (const d of r.doors) g[d.y][d.x] = T.DOOR;
  }
  for (const e of EXIT_TILES) g[e.y][e.x] = T.EXIT;
  return g;
}

export const isFloor = (v: number) => v !== T.WALL && v !== T.VOID && v !== T.EXIT;

// ---------- Fixed props (non-customizable). Coordinates in tiles. ----------
export type Prop = {
  id: string;
  sprite: string;
  x: number; y: number; w: number; h: number;
  solid?: boolean;
  wall?: boolean;         // mounted on the wall above row y (drawn one tile up, not solid)
  interact?: string;      // interaction id dispatched to the UI
  label?: string;         // prompt text
  room: string;
};

function officeProps(key: string, sx: number, sy: number, station: string, stationLabel: string, stationSprite: string): Prop[] {
  // seat at (sx, sy): desk sits directly below the seat, so the NPC faces down toward visitors.
  return [
    { id: `${key}-desk`, sprite: "desk", x: sx - 1, y: sy + 1, w: 3, h: 1, solid: true, room: key },
    { id: `${key}-pc`, sprite: "monitor", x: sx, y: sy + 1, w: 1, h: 1, room: key },
    { id: `${key}-chair`, sprite: "chair", x: sx, y: sy, w: 1, h: 1, room: key },
    { id: `${key}-station`, sprite: stationSprite, x: sx + 2, y: sy - 3, w: 2, h: 2, solid: true, interact: station, label: stationLabel, room: key },
    { id: `${key}-shelf`, sprite: "bookshelf", x: sx - 3, y: sy - 3, w: 2, h: 2, solid: true, room: key },
    { id: `${key}-plant`, sprite: "plant", x: sx - 3, y: sy + 4, w: 1, h: 1, solid: true, room: key },
  ];
}

export const PROPS: Prop[] = [
  ...officeProps("cfo", 4, 4, "station:cfo", "Financial dashboard", "finance_screen"),
  ...officeProps("coo", 13, 4, "station:coo", "Operations board", "ops_board"),
  { id: "ea-desk", sprite: "desk", x: 20, y: 5, w: 3, h: 1, solid: true, room: "ea" },
  { id: "ea-pc", sprite: "monitor", x: 21, y: 5, w: 1, h: 1, room: "ea" },
  { id: "ea-chair", sprite: "chair", x: 21, y: 4, w: 1, h: 1, room: "ea" },
  { id: "ea-station", sprite: "calendar_board", x: 22, y: 1, w: 2, h: 2, solid: true, interact: "station:ea", label: "Daily briefing station", room: "ea" },
  { id: "ea-plant", sprite: "plant", x: 19, y: 9, w: 1, h: 1, solid: true, room: "ea" },
  ...officeProps("cmo", 44, 4, "station:cmo", "Campaign wall", "campaign_board"),
  { id: "cro-desk", sprite: "desk", x: 52, y: 5, w: 3, h: 1, solid: true, room: "cro" },
  { id: "cro-pc", sprite: "monitor", x: 53, y: 5, w: 1, h: 1, room: "cro" },
  { id: "cro-chair", sprite: "chair", x: 53, y: 4, w: 1, h: 1, room: "cro" },
  { id: "cro-station", sprite: "pipeline_board", x: 54, y: 1, w: 2, h: 2, solid: true, interact: "station:cro", label: "Pipeline board", room: "cro" },
  { id: "cro-shelf", sprite: "bookshelf", x: 50, y: 1, w: 2, h: 2, solid: true, room: "cro" },
  ...officeProps("cto", 4, 19, "station:cto", "Infrastructure console", "server_rack"),
  ...officeProps("hr", 13, 19, "station:hr", "Recruitment & hiring", "file_cabinet"),
  // CEO suite fixed: executive desk + computer + performance display (other furniture is customizable)
  { id: "ceo-desk", sprite: "exec_desk", x: 31, y: 4, w: 4, h: 2, solid: true, interact: "ceo_desk", label: "Use computer", room: "ceo" },
  { id: "ceo-chair", sprite: "exec_chair", x: 32, y: 3, w: 1, h: 1, room: "ceo" },
  { id: "ceo-display", sprite: "perf_display", x: 36, y: 1, w: 3, h: 2, solid: true, interact: "ceo_display", label: "Company performance", room: "ceo" },
  { id: "ceo-logo", sprite: "logo_wall", x: 28, y: 1, w: 2, h: 1, wall: true, room: "ceo" },
  // Conference room
  { id: "conf-table", sprite: "conf_table", x: 26, y: 19, w: 6, h: 3, solid: true, interact: "conference", label: "Start a meeting", room: "conference" },
  { id: "conf-screen", sprite: "whiteboard", x: 30, y: 16, w: 4, h: 1, wall: true, room: "conference" },
  { id: "conf-plant1", sprite: "tall_plant", x: 23, y: 16, w: 1, h: 1, solid: true, room: "conference" },
  { id: "conf-plant2", sprite: "tall_plant", x: 34, y: 16, w: 1, h: 1, solid: true, room: "conference" },
  // Break room
  { id: "coffee", sprite: "coffee_machine", x: 37, y: 16, w: 1, h: 1, solid: true, interact: "coffee", label: "Grab a coffee", room: "break" },
  { id: "fridge", sprite: "fridge", x: 38, y: 16, w: 1, h: 2, solid: true, room: "break" },
  { id: "cooler", sprite: "water_cooler", x: 44, y: 16, w: 1, h: 1, solid: true, room: "break" },
  { id: "break-table", sprite: "round_table", x: 41, y: 20, w: 2, h: 2, solid: true, room: "break" },
  { id: "break-couch", sprite: "couch", x: 37, y: 23, w: 3, h: 1, solid: true, room: "break" },
  { id: "break-plant", sprite: "tall_plant", x: 45, y: 24, w: 1, h: 1, solid: true, room: "break" },
  // Lobby
  { id: "reception", sprite: "reception", x: 26, y: 33, w: 6, h: 2, solid: true, interact: "reception", label: "Reception — inbox", room: "lobby" },
  { id: "lobby-sign", sprite: "logo_wall", x: 33, y: 31, w: 2, h: 1, wall: true, room: "lobby" },
  { id: "lobby-couch1", sprite: "couch", x: 20, y: 36, w: 3, h: 1, solid: true, room: "lobby" },
  { id: "lobby-couch2", sprite: "couch", x: 35, y: 36, w: 3, h: 1, solid: true, room: "lobby" },
  { id: "lobby-plant1", sprite: "tall_plant", x: 19, y: 31, w: 1, h: 1, solid: true, room: "lobby" },
  { id: "lobby-plant2", sprite: "tall_plant", x: 38, y: 31, w: 1, h: 1, solid: true, room: "lobby" },
  { id: "lobby-plant3", sprite: "tall_plant", x: 25, y: 41, w: 1, h: 1, solid: true, room: "lobby" },
  { id: "lobby-plant4", sprite: "tall_plant", x: 32, y: 41, w: 1, h: 1, solid: true, room: "lobby" },
  { id: "exit", sprite: "exit_mat", x: 28, y: 41, w: 2, h: 1, interact: "exit", label: "Leave for the day", room: "lobby" },
  { id: "directory", sprite: "directory", x: 21, y: 31, w: 2, h: 1, wall: true, interact: "inbox", label: "Notice board — inbox", room: "lobby" },
  // Vacant offices: hiring signs
  ...["vacant1", "vacant2", "vacant3", "vacant4", "vacant5"].map((k) => {
    const r = ROOMS.find((x) => x.key === k)!;
    return { id: `${k}-sign`, sprite: "for_hire", x: r.x, y: r.y, w: 2, h: 1, wall: true, interact: `hire:${k}`, label: "Hire an AI employee here", room: k } as Prop;
  }),
];

// Desk props generated for hired agents occupying vacant offices.
export function vacantDeskProps(roomKey: string): Prop[] {
  const r = ROOMS.find((x) => x.key === roomKey);
  if (!r || !r.seat) return [];
  const { x, y } = r.seat;
  return [
    { id: `${roomKey}-desk`, sprite: "desk", x: x - 1, y: y + 1, w: 3, h: 1, solid: true, room: roomKey },
    { id: `${roomKey}-pc`, sprite: "monitor", x, y: y + 1, w: 1, h: 1, room: roomKey },
    { id: `${roomKey}-chair`, sprite: "chair", x, y, w: 1, h: 1, room: roomKey },
  ];
}

/** Spots in common areas NPCs wander to. */
export const WANDER_SPOTS = [
  { x: 39, y: 18, room: "break" }, { x: 43, y: 18, room: "break" }, { x: 40, y: 22, room: "break" },
  { x: 25, y: 13, room: "hall" }, { x: 9, y: 13, room: "hall" }, { x: 48, y: 28, room: "hall" },
  { x: 23, y: 37, room: "lobby" }, { x: 34, y: 38, room: "lobby" },
];

/** Seats around the conference table for meetings. */
export const CONFERENCE_SEATS = [
  { x: 26, y: 18 }, { x: 28, y: 18 }, { x: 30, y: 18 }, { x: 25, y: 20 }, { x: 32, y: 20 },
  { x: 26, y: 22 }, { x: 28, y: 22 }, { x: 30, y: 22 },
];
export const CONFERENCE_CEO_SEAT = { x: 29, y: 23 };
export const CEO_DESK_STAND = { x: 32, y: 6 };
export const CEO_SUITE_GREET = { x: 30, y: 8 };
