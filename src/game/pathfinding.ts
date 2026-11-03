// A* on the tile grid (4-directional) for NPC navigation.
export type Pt = { x: number; y: number };

export function findPath(walkable: (x: number, y: number) => boolean, start: Pt, goal: Pt, w: number, h: number, maxNodes = 6000): Pt[] | null {
  const key = (x: number, y: number) => y * w + x;
  if (!walkable(goal.x, goal.y)) {
    const alt = nearestWalkable(walkable, goal, w, h);
    if (!alt) return null;
    goal = alt;
  }
  const open: { x: number; y: number; f: number; g: number }[] = [{ ...start, g: 0, f: 0 }];
  const came = new Map<number, number>();
  const gScore = new Map<number, number>([[key(start.x, start.y), 0]]);
  const closed = new Set<number>();
  let n = 0;
  while (open.length && n++ < maxNodes) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.x, cur.y);
    if (cur.x === goal.x && cur.y === goal.y) {
      const path: Pt[] = [{ x: cur.x, y: cur.y }];
      let k = ck;
      while (came.has(k)) { k = came.get(k)!; path.unshift({ x: k % w, y: Math.floor(k / w) }); }
      return path;
    }
    if (closed.has(ck)) continue;
    closed.add(ck);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !walkable(nx, ny)) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const g = cur.g + 1;
      if (g < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, g); came.set(nk, ck);
        open.push({ x: nx, y: ny, g, f: g + Math.abs(goal.x - nx) + Math.abs(goal.y - ny) });
      }
    }
  }
  return null;
}

export function nearestWalkable(walkable: (x: number, y: number) => boolean, p: Pt, w: number, h: number): Pt | null {
  for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = p.x + dx, y = p.y + dy;
    if (x >= 0 && y >= 0 && x < w && y < h && walkable(x, y)) return { x, y };
  }
  return null;
}
