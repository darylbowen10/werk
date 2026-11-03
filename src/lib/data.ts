// Tenant-scoped business data access. Every result carries its data source so nothing is passed off as real.
import { db } from "./db";

export const DEMO_NOTICE = "DEMONSTRATION DATA — not real company figures. Connect integrations for live data.";

export function sourceLabel(sources: Iterable<string>) {
  const s = [...new Set(sources)];
  return s.length ? s.join("+") : "none";
}
export const isDemo = (src: string) => src.split("+").includes("demo");

export async function financials(companyId: string) {
  const rows = await db.financialPeriod.findMany({ where: { companyId }, orderBy: { month: "asc" } });
  // Prefer live sources per month: stripe revenue / quickbooks P&L override demo values.
  const byMonth = new Map<string, { month: string; revenue: number; expenses: number; breakdown: Record<string, number>; cash: number; customers: number; sources: Set<string> }>();
  const rank = (s: string) => (s === "demo" ? 0 : 1);
  for (const r of [...rows].sort((a, b) => rank(a.source) - rank(b.source))) {
    const cur = byMonth.get(r.month);
    if (!cur) { byMonth.set(r.month, { month: r.month, revenue: r.revenue, expenses: r.expenses, breakdown: r.breakdown as Record<string, number>, cash: r.cash, customers: r.customers, sources: new Set([r.source]) }); continue; }
    if (r.source === "stripe") { cur.revenue = r.revenue; cur.customers = r.customers || cur.customers; cur.sources.add("stripe"); }
    else if (r.source === "quickbooks") { cur.revenue = r.revenue || cur.revenue; cur.expenses = r.expenses; cur.breakdown = r.breakdown as Record<string, number>; cur.cash = r.cash || cur.cash; cur.sources.add("quickbooks"); }
  }
  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  const budgets = await db.budget.findMany({ where: { companyId } });
  const latest = months.at(-1), prev = months.at(-2);
  const allSources = new Set<string>();
  months.forEach((m) => m.sources.forEach((s) => allSources.add(s)));
  budgets.forEach((b) => allSources.add(b.source));
  return {
    source: sourceLabel(allSources),
    months: months.map((m) => ({ ...m, profit: m.revenue - m.expenses, sources: [...m.sources] })),
    latest: latest ? { ...latest, profit: latest.revenue - latest.expenses, sources: [...latest.sources] } : null,
    previous: prev ? { ...prev, profit: prev.revenue - prev.expenses, sources: [...prev.sources] } : null,
    budgets: budgets.map((b) => ({ category: b.category, monthly: b.monthly })),
  };
}

export function varianceVsBudget(fin: Awaited<ReturnType<typeof financials>>, which: "latest" | "previous" = "previous") {
  const m = fin[which];
  if (!m) return [];
  return fin.budgets.map((b) => {
    const actual = m.breakdown[b.category] ?? 0;
    return { category: b.category, budget: b.monthly, actual, variancePct: b.monthly ? ((actual - b.monthly) / b.monthly) * 100 : 0, month: m.month };
  }).sort((a, b) => b.variancePct - a.variancePct);
}

/** Simple least-squares trend forecast. */
export function linearForecast(values: number[], periods: number) {
  const n = values.length;
  const xs = values.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = values.reduce((a, b) => a + b, 0) / n;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (values[i] - my), 0) / Math.max(1, xs.reduce((s, x) => s + (x - mx) ** 2, 0));
  const icpt = my - slope * mx;
  return Array.from({ length: periods }, (_, k) => Math.round(icpt + slope * (n + k)));
}

export async function pipeline(companyId: string) {
  const deals = await db.deal.findMany({ where: { companyId }, orderBy: { value: "desc" } });
  const open = deals.filter((d) => !["won", "lost"].includes(d.stage));
  const weighted = open.reduce((s, d) => s + (d.value * d.probability) / 100, 0);
  const total = open.reduce((s, d) => s + d.value, 0);
  const byStage: Record<string, { count: number; value: number }> = {};
  for (const d of open) { byStage[d.stage] ??= { count: 0, value: 0 }; byStage[d.stage].count++; byStage[d.stage].value += d.value; }
  const bySource: Record<string, number> = {};
  for (const d of deals) bySource[d.leadSource] = (bySource[d.leadSource] ?? 0) + 1;
  const won = deals.filter((d) => d.stage === "won").length, lost = deals.filter((d) => d.stage === "lost").length;
  return { source: sourceLabel(deals.map((d) => d.source)), deals, open, total, weighted: Math.round(weighted), byStage, bySource, winRate: won + lost ? Math.round((won / (won + lost)) * 100) : null };
}

export async function campaigns(companyId: string) {
  const c = await db.campaign.findMany({ where: { companyId } });
  return {
    source: sourceLabel(c.map((x) => x.source)),
    campaigns: c.map((x) => ({ ...x, acceptanceRate: x.sent ? Math.round((x.accepted / x.sent) * 1000) / 10 : null, replyRate: x.accepted ? Math.round((x.replies / x.accepted) * 1000) / 10 : null })),
  };
}

export async function projects(companyId: string) {
  const p = await db.project.findMany({ where: { companyId }, orderBy: { dueDate: "asc" } });
  return { source: sourceLabel(p.map((x) => x.source)), projects: p, delayed: p.filter((x) => x.status === "delayed"), atRisk: p.filter((x) => x.status === "at_risk") };
}

export async function calendar(companyId: string, days = 1) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + days);
  const ev = await db.calendarEvent.findMany({ where: { companyId, start: { gte: start, lt: end } }, orderBy: { start: "asc" } });
  const conflicts: { a: string; b: string }[] = [];
  for (let i = 0; i < ev.length; i++) for (let j = i + 1; j < ev.length; j++) if (ev[j].start < ev[i].end && ev[j].start.toDateString() === ev[i].start.toDateString()) conflicts.push({ a: ev[i].title, b: ev[j].title });
  return { source: sourceLabel(ev.map((e) => e.source)), events: ev, conflicts };
}

export async function inbox(companyId: string) {
  const m = await db.inboxMessage.findMany({ where: { companyId }, orderBy: { receivedAt: "desc" }, take: 25 });
  return { source: sourceLabel(m.map((x) => x.source)), messages: m, needsResponse: m.filter((x) => x.needsResponse) };
}

export async function systemHealth(companyId: string) {
  const checks = await db.systemCheck.findMany({ where: { companyId }, orderBy: { checkedAt: "desc" }, take: 20 });
  const latest = new Map<string, (typeof checks)[number]>();
  for (const c of checks) if (!latest.has(c.service)) latest.set(c.service, c);
  return { source: "live platform checks", checks: [...latest.values()] };
}

export async function goals(companyId: string) {
  const g = await db.goal.findMany({ where: { companyId } });
  return { source: sourceLabel(g.map((x) => x.source)), goals: g };
}

export const money = (n: number) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
export const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
