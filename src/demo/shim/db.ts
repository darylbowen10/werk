// Browser demo: an in-memory, Prisma-compatible stand-in for the subset of the client API Executive HQ uses.
// Tables persist to localStorage so a player's company survives reloads.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const STORE_KEY = "exechq-demo-v1";
const NOW = () => new Date();

const DEFAULTS: Record<string, () => Row> = {
  agent: () => ({ status: "idle", statusNote: "", isActive: true, isCore: false, tokensUsed: 0, costMicros: 0, personality: "" }),
  task: () => ({ priority: "normal", status: "queued", source: "ceo", progress: 0, runAfter: NOW(), requestedBy: null, output: null, reportId: null, error: null, deadline: null, startedAt: null, completedAt: null }),
  approval: () => ({ risk: "high", status: "pending", decisionNote: null, executionLog: null, decidedAt: null, taskId: null }),
  notification: () => ({ priority: "normal", read: false, approached: false, link: null, agentId: null }),
  job: () => ({ status: "queued", runAt: NOW(), attempts: 0, maxAttempts: 3, lockedAt: null, lockedBy: null, lastError: null, dedupeKey: null, finishedAt: null }),
  briefing: () => ({ status: "prepared", generatedBy: "offline", ceoNotes: null, deliveredAt: null }),
  meeting: () => ({ status: "active", notesReportId: null }),
  idea: () => ({ status: "new" }),
  furnitureItem: () => ({ variant: 0 }),
  message: () => ({ meta: null, agentId: null }),
  conversation: () => ({ kind: "direct", title: "", agentId: null }),
  agentMemory: () => ({ kind: "fact", importance: 1 }),
  project: () => ({ blockers: "" }),
  integration: () => ({ status: "disconnected", encryptedCreds: null, scopes: null, meta: null, connectedAt: null, lastSyncAt: null, lastError: null }),
  activityLog: () => ({ agentId: null }),
  auditLog: () => ({ meta: null }),
  financialPeriod: () => ({ arr: 0, customers: 0 }),
  systemCheck: () => ({ note: "", checkedAt: NOW() }),
  schedule: () => ({ enabled: true, lastRunAt: null, agentId: null, intervalMinutes: null, dailyHour: null }),
  report: () => ({ agentId: null, taskId: null }),
  user: () => ({ role: "ceo", lastSeenAt: null }),
};
const UPDATED_AT = new Set(["conversation", "project", "briefing"]);
const UNIQUE: Record<string, string[][]> = {
  job: [["dedupeKey"]], user: [["email"]], agent: [["companyId", "key"]], briefing: [["companyId", "kind", "date"]],
  financialPeriod: [["companyId", "month", "source"]], integration: [["companyId", "provider"]],
};

let tables: Record<string, Row[]> = {};
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) tables = JSON.parse(raw, (_k, v) => (typeof v === "string" && v.startsWith("\u0000D:") ? new Date(v.slice(3)) : v));
  } catch { tables = {}; }
}
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(tables, function (this: any, k, v) { const raw = this[k]; return raw instanceof Date ? "\u0000D:" + raw.toISOString() : v; }));
    } catch { /* storage unavailable: the demo still works for this visit */ }
  }, 300);
}
export function resetDemoStore() { tables = {}; try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ } }
load();

let seq = 0;
const cuid = () => "c" + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 8);
const clone = <T,>(v: T): T => (v instanceof Date ? (new Date(v.getTime()) as any) : Array.isArray(v) ? (v.map(clone) as any) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) as any : v);
const val = (v: any) => (v instanceof Date ? v.getTime() : v);
const cmp = (a: any, b: any) => { const x = val(a), y = val(b); if (x == null && y == null) return 0; if (x == null) return -1; if (y == null) return 1; return x < y ? -1 : x > y ? 1 : 0; };

function matchField(v: any, cond: any): boolean {
  if (cond === null) return v === null || v === undefined;
  if (cond instanceof Date || typeof cond !== "object") return val(v) === val(cond);
  if ("path" in cond) { let x = v; for (const p of cond.path) x = x?.[p]; return x === cond.equals; }
  for (const [op, c] of Object.entries(cond)) {
    if (op === "mode") continue;
    if (op === "equals" && val(v) !== val(c)) return false;
    if (op === "in" && !(c as any[]).some((x) => val(x) === val(v))) return false;
    if (op === "notIn" && (c as any[]).some((x) => val(x) === val(v))) return false;
    if (op === "not") { if (c === null ? v === null || v === undefined : typeof c === "object" && !(c instanceof Date) ? matchField(v, c) : val(v) === val(c)) return false; }
    if (op === "gt" && !(v != null && cmp(v, c) > 0)) return false;
    if (op === "gte" && !(v != null && cmp(v, c) >= 0)) return false;
    if (op === "lt" && !(v != null && cmp(v, c) < 0)) return false;
    if (op === "lte" && !(v != null && cmp(v, c) <= 0)) return false;
    if (op === "contains") { const s = String(v ?? ""), n = String(c); if (!(cond.mode === "insensitive" ? s.toLowerCase().includes(n.toLowerCase()) : s.includes(n))) return false; }
  }
  return true;
}
function matches(row: Row, where: any = {}): boolean {
  for (const [k, cond] of Object.entries(where ?? {})) {
    if (cond === undefined) continue;
    if (k === "OR") { if (!(cond as any[]).some((w) => matches(row, w))) return false; continue; }
    if (k === "AND") { if (!(cond as any[]).every((w) => matches(row, w))) return false; continue; }
    // compound unique key, e.g. companyId_kind_date: { companyId, kind, date }
    if (k.includes("_") && cond && typeof cond === "object" && !(cond instanceof Date) && !("in" in cond) && Object.keys(cond).every((f) => k.split("_").includes(f))) { if (!matches(row, cond)) return false; continue; }
    if (!matchField(row[k], cond)) return false;
  }
  return true;
}
function order(rows: Row[], orderBy: any) {
  if (!orderBy) return rows;
  const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((o) => Object.entries(o)) as [string, "asc" | "desc"][];
  return [...rows].sort((a, b) => { for (const [k, d] of keys) { const c = cmp(a[k], b[k]); if (c) return d === "desc" ? -c : c; } return 0; });
}

class KnownRequestError extends Error { code: string; meta?: object; constructor(message: string, code: string, meta?: object) { super(message); this.code = code; this.meta = meta; this.name = "PrismaClientKnownRequestError"; } }
export { KnownRequestError };

function model(name: string) {
  const t = () => (tables[name] ??= []);
  const checkUnique = (row: Row, ignore?: Row) => {
    for (const fields of UNIQUE[name] ?? []) {
      if (fields.some((f) => row[f] == null)) continue;
      if (t().some((r) => r !== ignore && fields.every((f) => val(r[f]) === val(row[f])))) throw new KnownRequestError(`Unique constraint failed on ${fields.join(",")}`, "P2002");
    }
  };
  const build = (data: Row) => {
    const row: Row = { id: cuid(), createdAt: NOW(), ...(DEFAULTS[name]?.() ?? {}), ...clone(data) };
    if (UPDATED_AT.has(name)) row.updatedAt = NOW();
    return row;
  };
  const apply = (row: Row, data: Row) => {
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (v && typeof v === "object" && !(v instanceof Date) && "increment" in v) row[k] = (row[k] ?? 0) + (v as any).increment;
      else row[k] = clone(v);
    }
    if (UPDATED_AT.has(name)) row.updatedAt = NOW();
  };
  return {
    async findMany(a: any = {}) { let rows = order(t().filter((r) => matches(r, a.where)), a.orderBy); if (a.take) rows = rows.slice(0, a.take); return rows.map(clone); },
    async findFirst(a: any = {}) { return (await this.findMany({ ...a, take: 1 }))[0] ?? null; },
    async findUnique(a: any) { const r = t().find((x) => matches(x, a.where)); return r ? clone(r) : null; },
    async findFirstOrThrow(a: any) { const r = await this.findFirst(a); if (!r) throw new KnownRequestError("No record found", "P2025"); return r; },
    async findUniqueOrThrow(a: any) { const r = await this.findUnique(a); if (!r) throw new KnownRequestError("No record found", "P2025"); return r; },
    async count(a: any = {}) { return t().filter((r) => matches(r, a.where)).length; },
    async create(a: any) { const row = build(a.data); checkUnique(row); t().push(row); persist(); return clone(row); },
    async createMany(a: any) { for (const d of a.data) { const row = build(d); checkUnique(row); t().push(row); } persist(); return { count: a.data.length }; },
    async update(a: any) {
      const row = t().find((x) => matches(x, a.where));
      if (!row) throw new KnownRequestError("No record was found for an update.", "P2025");
      apply(row, a.data); persist(); return clone(row);
    },
    async updateMany(a: any) { const rows = t().filter((x) => matches(x, a.where)); rows.forEach((r) => apply(r, a.data)); persist(); return { count: rows.length }; },
    async upsert(a: any) {
      const row = t().find((x) => matches(x, a.where));
      if (row) { apply(row, a.update); persist(); return clone(row); }
      return this.create({ data: a.create });
    },
    async delete(a: any) { const i = t().findIndex((x) => matches(x, a.where)); if (i < 0) throw new KnownRequestError("Not found", "P2025"); const [r] = t().splice(i, 1); persist(); return r; },
    async deleteMany(a: any = {}) { const before = t().length; tables[name] = t().filter((x) => !matches(x, a.where)); persist(); return { count: before - t().length }; },
    async groupBy(a: any) {
      const groups = new Map<string, { key: Row; n: number }>();
      for (const r of t().filter((x) => matches(x, a.where))) {
        const key = Object.fromEntries(a.by.map((b: string) => [b, r[b]]));
        const k = JSON.stringify(key);
        const g = groups.get(k) ?? { key, n: 0 }; g.n++; groups.set(k, g);
      }
      return [...groups.values()].map((g) => ({ ...g.key, _count: g.n }));
    },
  };
}

const models = ["company", "user", "agent", "agentMemory", "conversation", "message", "task", "report", "approval", "notification", "activityLog", "auditLog", "job", "schedule", "briefing", "meeting", "idea", "furnitureItem", "integration", "financialPeriod", "budget", "goal", "project", "deal", "campaign", "calendarEvent", "inboxMessage", "systemCheck"] as const;

/** Atomically claim the next due job (single-threaded JS, so a simple scan is atomic). */
function claimJob(workerId: string) {
  const due = order((tables.job ?? []).filter((j) => j.status === "queued" && val(j.runAt) <= Date.now()), { runAt: "asc" })[0];
  if (!due) return [];
  Object.assign(due, { status: "running", lockedAt: NOW(), lockedBy: workerId, attempts: due.attempts + 1 });
  persist();
  return [clone(due)];
}

export const db: any = {
  ...Object.fromEntries(models.map((m) => [m, model(m)])),
  async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
    const sql = strings.join("?");
    if (sql.includes('UPDATE "Job"')) return claimJob(String(values[0]));
    return [{ "?column?": 1 }];
  },
  async $transaction(ops: Promise<unknown>[]) { return Promise.all(ops); },
  async $disconnect() { /* nothing to close */ },
};
