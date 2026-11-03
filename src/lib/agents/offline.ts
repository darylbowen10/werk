// OFFLINE SIMULATION MODE — used when no Claude API key is configured.
// Deterministic and data-driven: every number is computed from the company's stored data (labelled by source).
// Output is explicitly labelled so it is never mistaken for Claude-generated analysis.
import type { Agent, Task } from "@prisma/client";
import { db } from "../db";
import * as data from "../data";
import { money, pct } from "../data";

export const OFFLINE_BANNER = "> ⚙️ *Generated in offline simulation mode (no Claude API key configured). Analysis is rule-based and computed directly from stored company data.*";

const demoNote = (src: string) => (data.isDemo(src) ? `\n\n> ⚠️ **${data.DEMO_NOTICE}**` : "");
const INJECTION = /ignore (all )?(previous|prior) instructions|system note to ai|wire \$?[\d,]+|disregard your (rules|instructions)/i;

export function detectWorkRequest(text: string) {
  return /\b(prepare|create|draft|write|build|analy[sz]e|forecast|review|plan|put together|compile|research|investigate|summari[sz]e|look into|send|launch|need|can you|could you|please|generate|update|find|audit|assess|propose)\b/i.test(text) && text.trim().length > 12;
}

export function detectPriority(text: string) {
  if (/\b(urgent|asap|immediately|right away|critical)\b/i.test(text)) return "urgent";
  if (/\b(today|high priority|important|by end of day|eod)\b/i.test(text)) return "high";
  if (/\b(whenever|low priority|no rush)\b/i.test(text)) return "low";
  return "normal";
}

export function detectDeadline(text: string): Date | null {
  const t = text.toLowerCase(), d = new Date();
  if (/\btomorrow\b/.test(t)) { d.setDate(d.getDate() + 1); d.setHours(17, 0, 0, 0); return d; }
  if (/\b(today|end of day|eod)\b/.test(t)) { d.setHours(17, 0, 0, 0); return d; }
  if (/\bnext week\b/.test(t)) { d.setDate(d.getDate() + 7); return d; }
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const m = t.match(/\bby (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (m) { const target = days.indexOf(m[1]); let diff = (target - d.getDay() + 7) % 7; if (diff === 0) diff = 7; d.setDate(d.getDate() + diff); d.setHours(17, 0, 0, 0); return d; }
  return null;
}

export function titleFromRequest(text: string) {
  let t = text.trim().replace(/^(hey|hi|ok|okay)[,!\s]+/i, "").replace(/^(i need|i'd like|i want|can you|could you|please|would you)( you to)?\s*/i, "").replace(/^(a|an|the) /i, "").replace(/[.?!]+$/, "");
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.length > 80 ? t.slice(0, 77) + "…" : t;
}

export function detectHighImpact(text: string): { tool: string; summary: string } | null {
  // Only clear imperative requests count; analysis of e.g. "software spend" must not trigger an approval.
  const t = text.toLowerCase();
  if (/\b(send|email|reply to|message)\b[^.]*\b(client|customer|partner|them|vendor|prospect|@)/.test(t) && !/\bdraft\b/.test(t)) return { tool: "send_external_message", summary: "Send external correspondence" };
  if (/\b(launch|start|resume)\b[^.]*\bcampaign\b/.test(t)) return { tool: "launch_campaign", summary: "Launch campaign" };
  if (/\b(spend|purchase|buy|pay|wire)\s+(\$|\d|for\b|on\b|the\b|a\b|an\b)/.test(t)) return { tool: "spend_money", summary: "Commit company funds" };
  if (/\b(delete|remove|purge)\s+(the|all|our|this|that|old)\b/.test(t)) return { tool: "delete_data", summary: "Delete company records" };
  if (/\b(deploy|change the config|modify|migrate|patch)\s+(the|our|production|prod)\b/.test(t)) return { tool: "modify_system", summary: "Modify a critical system" };
  return null;
}

// ------------------------------------------------------------------ snapshots
export async function departmentSnapshot(agent: Agent): Promise<{ line: string; source: string }> {
  const c = agent.companyId;
  switch (agent.key) {
    case "cfo": {
      const f = await data.financials(c);
      if (!f.latest || !f.previous) return { line: "I don't have enough financial history yet to comment.", source: f.source };
      const rev = ((f.latest.revenue - f.previous.revenue) / f.previous.revenue) * 100;
      const exp = ((f.latest.expenses - f.previous.expenses) / f.previous.expenses) * 100;
      const top = data.varianceVsBudget(f, "previous")[0];
      return { line: `Revenue is ${money(f.latest.revenue)} this month (${pct(rev)} vs last month) and expenses are ${money(f.latest.expenses)} (${pct(exp)}).${top && top.variancePct > 5 ? ` ${cap(top.category)} ran ${pct(top.variancePct)} over budget last month.` : ""} Cash on hand is ${money(f.latest.cash)}.`, source: f.source };
    }
    case "coo": {
      const p = await data.projects(c);
      return { line: `${p.projects.length} active projects: ${p.delayed.length} delayed and ${p.atRisk.length} at risk.${p.delayed[0] ? ` Most urgent: ${p.delayed[0].name} — ${p.delayed[0].blockers || "blocked"}.` : ""}`, source: p.source };
    }
    case "cro": {
      const p = await data.pipeline(c);
      const fresh = p.open.filter((d) => Date.now() - d.createdAt.getTime() < 2 * 86400_000);
      return { line: `Open pipeline is ${money(p.total)} (${money(p.weighted)} weighted) across ${p.open.length} opportunities; ${fresh.length} came in over the last two days.${p.winRate !== null ? ` Win rate sits at ${p.winRate}%.` : ""}`, source: p.source };
    }
    case "cmo": {
      const cs = await data.campaigns(c);
      const active = cs.campaigns.filter((x) => x.status === "active");
      const best = [...active].sort((a, b) => (b.replyRate ?? 0) - (a.replyRate ?? 0))[0];
      return { line: `${active.length} campaigns are live.${best ? ` "${best.name}" leads with a ${best.acceptanceRate}% acceptance rate and ${best.replyRate}% reply rate — ${best.meetings} partner meetings booked.` : ""}`, source: cs.source };
    }
    case "cto": {
      const h = await data.systemHealth(c);
      const bad = h.checks.filter((x) => x.status !== "healthy");
      return { line: h.checks.length ? `${h.checks.length - bad.length}/${h.checks.length} platform checks are healthy.${bad.length ? ` Attention needed: ${bad.map((b) => `${b.service} (${b.status})`).join(", ")}.` : ""}` : "I haven't run a platform health check yet — it's scheduled.", source: "live" };
    }
    case "hr": {
      const agents = await db.agent.findMany({ where: { companyId: c, isActive: true } });
      return { line: `We have ${agents.length} AI employees on staff. ${5 - agents.filter((a) => a.office.startsWith("vacant")).length} vacant offices are ready if you want to hire.`, source: "live" };
    }
    default: {
      const cal = await data.calendar(c);
      const pending = await db.approval.count({ where: { companyId: c, status: "pending" } });
      return { line: `You have ${cal.events.length} meetings today${cal.conflicts.length ? ` with ${cal.conflicts.length} scheduling conflict${cal.conflicts.length > 1 ? "s" : ""}` : ""}, and ${pending} approval${pending === 1 ? "" : "s"} waiting on you.`, source: cal.source };
    }
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ------------------------------------------------------------------ reports
export async function taskReport(agent: Agent, task: Task): Promise<{ content: string; type: string; sources: string[] }> {
  const c = agent.companyId;
  const text = `${task.title} ${task.description}`.toLowerCase();
  const parts: string[] = [];
  const sources = new Set<string>();
  let type = "general";

  const finance = async () => {
    type = "financial";
    const f = await data.financials(c); sources.add(f.source);
    const L = f.latest!, P = f.previous!;
    const last6 = f.months.slice(-6);
    if (/variance/.test(text)) {
      const vv = data.varianceVsBudget(f, "previous").filter((x) => text.includes(x.category));
      for (const x of vv) {
        const hist = f.months.slice(-6).map((m) => m.breakdown[x.category] ?? 0);
        const avgPrior = hist.slice(0, -2).reduce((a, b) => a + b, 0) / Math.max(1, hist.length - 2);
        const oneOff = x.actual > avgPrior * 1.25;
        parts.push(`## Variance focus: ${x.category}\n**${cap(x.category)}** spend in ${x.month} was **${money(x.actual)}** against a **${money(x.budget)}** budget (${pct(x.variancePct)}). The prior four-month average was ${money(avgPrior)}, so this looks like a **${oneOff ? "one-off spike" : "recurring run-rate increase"}**.\n\n| Month | ${cap(x.category)} |\n|---|---:|\n${f.months.slice(-6).map((m) => `| ${m.month} | ${money(m.breakdown[x.category] ?? 0)} |`).join("\n")}\n\n${oneOff ? "Recommend identifying the specific invoices behind the spike (e.g. annual renewals or usage overages) and confirming they won't recur." : "Recommend re-baselining the budget or negotiating vendor terms, since the higher level is persisting."}`);
      }
    }
    const avgGrowth = last6.slice(1).reduce((s, m, i) => s + (m.revenue - last6[i].revenue) / last6[i].revenue, 0) / Math.max(1, last6.length - 1) * 100;
    parts.push(`## Executive summary\nRevenue for ${L.month} is **${money(L.revenue)}** (${pct(((L.revenue - P.revenue) / P.revenue) * 100)} MoM; ${avgGrowth.toFixed(1)}% average monthly growth over six months). Expenses are **${money(L.expenses)}** (${pct(((L.expenses - P.expenses) / P.expenses) * 100)} MoM), giving a profit of **${money(L.profit)}**. Cash position: **${money(L.cash)}**.`);
    parts.push(`## Last six months\n| Month | Revenue | Expenses | Profit | Cash |\n|---|---:|---:|---:|---:|\n${last6.map((m) => `| ${m.month} | ${money(m.revenue)} | ${money(m.expenses)} | ${money(m.profit)} | ${money(m.cash)} |`).join("\n")}`);
    if (/forecast|projection|outlook|next (six|6|three|3|12)|predict/.test(text)) {
      const n = /twelve|12/.test(text) ? 12 : /three|3/.test(text) ? 3 : 6;
      const rf = data.linearForecast(f.months.map((m) => m.revenue), n), ef = data.linearForecast(f.months.map((m) => m.expenses), n);
      const base = new Date(L.month + "-01");
      let cash = L.cash;
      const rows = rf.map((r, i) => { const d = new Date(base.getFullYear(), base.getMonth() + i + 1, 1); cash += r - ef[i]; return `| ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")} | ${money(r)} | ${money(ef[i])} | ${money(r - ef[i])} | ${money(cash)} |`; });
      parts.push(`## ${n}-month forecast (linear trend)\nMethod: least-squares trend fitted to ${f.months.length} months of history. Treat as a baseline, not a commitment.\n\n| Month | Revenue | Expenses | Profit | Projected cash |\n|---|---:|---:|---:|---:|\n${rows.join("\n")}\n\nProjected revenue in month ${n}: **${money(rf.at(-1)!)}** (${pct(((rf.at(-1)! - L.revenue) / L.revenue) * 100)} vs today).`);
    }
    const v = data.varianceVsBudget(f, "previous");
    parts.push(`## Budget vs. actual (${v[0]?.month})\n| Category | Budget | Actual | Variance |\n|---|---:|---:|---:|\n${v.map((x) => `| ${cap(x.category)} | ${money(x.budget)} | ${money(x.actual)} | ${pct(x.variancePct)} |`).join("\n")}`);
    const over = v.filter((x) => x.variancePct > 10);
    parts.push(`## Recommendations\n${[
      ...over.map((x) => `- Review **${x.category}** spend: ${pct(x.variancePct)} over budget (${money(x.actual - x.budget)} above plan). Identify one-off vs. recurring drivers.`),
      L.profit > 0 ? "- Profitability is positive; consider reinvesting part of the margin in the highest-performing referral-partner campaigns." : "- Operating at a loss this month; tighten discretionary spend until revenue catches up.",
      "- Connect QuickBooks and Stripe so future analysis runs on live figures.",
    ].join("\n")}`);
  };
  const ops = async () => {
    type = "operations";
    const p = await data.projects(c); sources.add(p.source);
    parts.push(`## Executive summary\n${p.projects.length} projects tracked: **${p.delayed.length} delayed**, **${p.atRisk.length} at risk**, ${p.projects.filter((x) => x.status === "on_track").length} on track.`);
    parts.push(`## Project status\n| Project | Owner | Status | Progress | Due | Blockers |\n|---|---|---|---:|---|---|\n${p.projects.map((x) => `| ${x.name} | ${x.ownerKey.toUpperCase()} | ${x.status.replace("_", " ")} | ${x.progress}% | ${x.dueDate.toISOString().slice(0, 10)} | ${x.blockers || "—"} |`).join("\n")}`);
    parts.push(`## Recommendations\n${[...p.delayed, ...p.atRisk].map((x) => `- **${x.name}** (${x.ownerKey.toUpperCase()}): resolve "${x.blockers || "unspecified blocker"}" — propose a new date and a single accountable owner.`).join("\n") || "- No intervention needed."}`);
  };
  const sales = async () => {
    type = "sales";
    const p = await data.pipeline(c); sources.add(p.source);
    const fresh = p.open.filter((d) => Date.now() - d.createdAt.getTime() < 7 * 86400_000);
    const partner = p.deals.filter((d) => /referral partner/i.test(d.leadSource)).length;
    parts.push(`## Executive summary\nOpen pipeline: **${money(p.total)}** across ${p.open.length} opportunities, **${money(p.weighted)}** probability-weighted. ${fresh.length} new opportunities in the last 7 days. ${partner} of ${p.deals.length} deals were sourced through referral partners.`);
    parts.push(`## Pipeline by stage\n| Stage | Deals | Value |\n|---|---:|---:|\n${Object.entries(p.byStage).map(([s, v]) => `| ${cap(s)} | ${v.count} | ${money(v.value)} |`).join("\n")}`);
    if (/forecast/.test(text)) {
      const by30 = p.open.filter((d) => d.closeDate.getTime() - Date.now() < 30 * 86400_000).reduce((s, d) => s + d.value * d.probability / 100, 0);
      parts.push(`## Revenue forecast\nWeighted bookings expected within 30 days: **${money(by30)}**. Remaining weighted pipeline beyond 30 days: **${money(p.weighted - by30)}**.`);
    }
    parts.push(`## Top opportunities\n${p.open.slice(0, 5).map((d) => `- **${d.account}** — ${d.name}: ${money(d.value)} at ${d.probability}% (${d.stage}, closes ${d.closeDate.toISOString().slice(0, 10)}; source: ${d.leadSource})`).join("\n")}`);
    parts.push(`## Recommendations\n- Prioritise the two negotiation/proposal deals closing within 14 days.\n- Referral-partner sourced deals are the strongest channel — ask each active partner for one introduction this month.\n- Move stalled "conversation" stage deals to a meeting within 10 days or close them out.`);
  };
  const marketing = async () => {
    type = "marketing";
    const cs = await data.campaigns(c); sources.add(cs.source);
    parts.push(`## Executive summary\n${cs.campaigns.filter((x) => x.status === "active").length} active campaigns. Benchmarks: acceptance 20–35%, reply 5–15%.`);
    parts.push(`## Campaign performance\n| Campaign | Status | Sent | Acceptance | Reply | Meetings | Spend |\n|---|---|---:|---:|---:|---:|---:|\n${cs.campaigns.map((x) => `| ${x.name} | ${x.status} | ${x.sent} | ${x.acceptanceRate ?? "—"}% | ${x.replyRate ?? "—"}% | ${x.meetings} | ${money(x.spend)} |`).join("\n")}`);
    parts.push(`## Recommendations\n${cs.campaigns.map((x) => x.acceptanceRate === null ? `- **${x.name}** is in ${x.status}; finalise messaging before launch (launch requires CEO approval).` : x.acceptanceRate < 20 ? `- **${x.name}**: acceptance ${x.acceptanceRate}% is below benchmark — tighten targeting toward professionals who encounter our ideal clients.` : `- **${x.name}**: performing at benchmark (${x.acceptanceRate}% / ${x.replyRate}%). Keep the relationship-first messaging.`).join("\n")}`);
  };
  const tech = async () => {
    type = "technical";
    const h = await data.systemHealth(c); sources.add("live");
    const ints = await db.integration.findMany({ where: { companyId: c } });
    parts.push(`## Executive summary\nLatest live platform checks: ${h.checks.filter((x) => x.status === "healthy").length}/${h.checks.length} healthy. ${ints.filter((i) => i.status === "connected").length} business integrations connected.`);
    parts.push(`## Platform checks\n| Service | Status | Latency | Note |\n|---|---|---:|---|\n${h.checks.map((x) => `| ${x.service} | ${x.status} | ${x.latencyMs} ms | ${x.note || "—"} |`).join("\n") || "| — | no checks yet | | |"}`);
    const p = await data.projects(c); sources.add(p.source);
    const mine = p.projects.filter((x) => x.ownerKey === "cto");
    if (mine.length) parts.push(`## Technical projects\n${mine.map((x) => `- **${x.name}** — ${x.status.replace("_", " ")}, ${x.progress}%${x.blockers ? `; blocker: ${x.blockers}` : ""}`).join("\n")}`);
    parts.push(`## Recommendations\n- Connect business integrations (Settings → Integrations) so agents can work on live data.\n- Keep high-impact system changes behind CEO approval (currently enforced).`);
  };
  const people = async () => {
    type = "hr";
    const agents = await db.agent.findMany({ where: { companyId: c, isActive: true } });
    const tasks = await db.task.groupBy({ by: ["agentId", "status"], where: { companyId: c }, _count: true });
    sources.add("live");
    parts.push(`## Workforce overview\n| Employee | Title | Completed | Open | Failed |\n|---|---|---:|---:|---:|\n${agents.map((a) => { const t = (s: string[]) => tasks.filter((x) => x.agentId === a.id && s.includes(x.status)).reduce((n, x) => n + x._count, 0); return `| ${a.name} | ${a.title} | ${t(["complete"])} | ${t(["queued", "working", "awaiting_approval"])} | ${t(["failed"])} |`; }).join("\n")}`);
    parts.push(`## Recommendations\n- Vacant offices are available for specialised hires (e.g. a Partnerships Manager to grow the referral ecosystem).\n- Review tool permissions quarterly: each agent should only access the data its role needs.`);
  };
  const assistant = async () => {
    type = "briefing";
    const cal = await data.calendar(c, 2); sources.add(cal.source);
    const ib = await data.inbox(c); sources.add(ib.source);
    parts.push(`## Calendar (next 48h)\n${cal.events.map((e) => `- ${e.start.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })} — ${e.title} (${e.attendees})`).join("\n") || "- No events."}${cal.conflicts.length ? `\n\n**Conflicts:** ${cal.conflicts.map((x) => `${x.a} ↔ ${x.b}`).join("; ")}` : ""}`);
    parts.push(`## Correspondence triage\n${ib.messages.map((m) => INJECTION.test(m.snippet) ? `- 🚩 **Suspicious** — ${m.sender}: "${m.subject}". Contains instructions aimed at AI assistants (possible phishing / prompt injection). Not acted on.` : `- ${m.needsResponse ? "**Needs response** — " : ""}${m.sender}: "${m.subject}"`).join("\n")}`);
  };

  const handlers: Record<string, () => Promise<void>> = { cfo: finance, coo: ops, cro: sales, cmo: marketing, cto: tech, hr: people, ea: assistant };
  // Pick the handler by topic first (delegated work), then by the agent's department.
  const topical = /forecast|revenue|expense|budget|cash|financ/.test(text) && agent.permissions && (agent.permissions as string[]).includes("get_financials") ? "cfo"
    : /pipeline|deal|opportunit/.test(text) && (agent.permissions as string[]).includes("get_pipeline") ? "cro"
    : null;
  await (handlers[topical ?? agent.key] ?? handlers[agent.key] ?? assistant)();

  const src = data.sourceLabel(sources);
  const content = `${OFFLINE_BANNER}${demoNote(src)}\n\n**Assignment:** ${task.title}\n**Prepared by:** ${agent.name}, ${agent.title}\n\n${parts.join("\n\n")}\n\n---\n*Data sources: ${src}.*`;
  return { content, type, sources: [...sources] };
}

export { INJECTION };
