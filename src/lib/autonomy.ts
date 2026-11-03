// Event-driven autonomous behaviour. Deterministic detectors look at real stored data and, when they find
// something worth attention, open a task for the responsible agent (deduplicated per finding per day).
import { db } from "./db";
import * as data from "./data";
import { enqueue } from "./jobs/queue";
import { createTask, notify, todayKey } from "./ops";

async function once(companyId: string, key: string) {
  // Dedupe marker via the job table's unique dedupeKey; returns true the first time only.
  const dedupeKey = `finding:${companyId}:${key}:${todayKey()}`;
  const existing = await db.job.findUnique({ where: { dedupeKey } });
  if (existing) return false;
  await db.job.create({ data: { companyId, type: "marker", payload: {}, status: "done", dedupeKey } });
  return true;
}

export async function scan(companyId: string, agentKey: string) {
  const agent = await db.agent.findFirst({ where: { companyId, key: agentKey, isActive: true } });
  if (!agent) return;
  switch (agentKey) {
    case "cfo": {
      const f = await data.financials(companyId);
      const over = data.varianceVsBudget(f, "previous").filter((v) => v.variancePct > 15);
      for (const v of over) {
        if (!(await once(companyId, `variance:${v.category}:${v.month}`))) continue;
        await createTask(companyId, { agentId: agent.id, source: "autonomous", priority: "high", title: `Expense variance analysis: ${v.category} ${data.pct(v.variancePct)} vs budget`, description: `Autonomous scan detected ${v.category} spend of ${data.money(v.actual)} against a ${data.money(v.budget)} budget in ${v.month} (${data.pct(v.variancePct)}). Analyse the drivers, say whether it is one-off or recurring, and recommend actions. Data source: ${f.source}.` });
      }
      break;
    }
    case "coo": {
      const p = await data.projects(companyId);
      for (const pr of p.delayed) {
        if (!(await once(companyId, `delayed:${pr.id}`))) continue;
        await createTask(companyId, { agentId: agent.id, source: "autonomous", priority: "high", title: `Recovery plan: ${pr.name}`, description: `"${pr.name}" (owner ${pr.ownerKey.toUpperCase()}) is past its due date ${pr.dueDate.toDateString()} at ${pr.progress}% complete. Blockers: ${pr.blockers || "unknown"}. Produce a recovery plan and identify what CEO intervention is needed.` });
        await notify(companyId, { agentId: agent.id, kind: "alert", priority: "high", title: "COO identified a delayed project", body: `${pr.name} is past due (${pr.progress}% complete). Preparing a recovery plan — your intervention may be needed.` });
      }
      break;
    }
    case "cro": {
      if (!(await once(companyId, "pipeline-review"))) return;
      await createTask(companyId, { agentId: agent.id, source: "scheduled", priority: "normal", title: "Daily pipeline review", description: "Review the pipeline: new opportunities, stage movement, deals at risk, and referral-partner sourced opportunities. Recommend today's top three revenue actions." });
      break;
    }
    case "cmo": {
      const c = await data.campaigns(companyId);
      const weak = c.campaigns.filter((x) => x.status === "active" && x.acceptanceRate !== null && x.acceptanceRate < 20);
      if (!weak.length && !(await once(companyId, "campaign-check"))) return;
      for (const w of weak) {
        if (!(await once(companyId, `weak-campaign:${w.id}`))) continue;
        await createTask(companyId, { agentId: agent.id, source: "autonomous", priority: "normal", title: `Improve campaign: ${w.name}`, description: `Acceptance rate ${w.acceptanceRate}% is below the 20–35% benchmark. Diagnose targeting and messaging and propose changes.` });
      }
      break;
    }
    case "cto": {
      await enqueue(companyId, "health.check", {});
      break;
    }
  }
}

/** Real platform health checks (database, queue, realtime, integrations) — source "live". */
export async function healthCheck(companyId: string) {
  const results: { service: string; status: string; latencyMs: number; note: string }[] = [];
  let t = Date.now();
  try { await db.$queryRaw`SELECT 1`; results.push({ service: "database", status: "healthy", latencyMs: Date.now() - t, note: "PostgreSQL reachable" }); }
  catch (e) { results.push({ service: "database", status: "down", latencyMs: Date.now() - t, note: (e as Error).message.slice(0, 120) }); }
  const backlog = await db.job.count({ where: { status: "queued", runAt: { lte: new Date(Date.now() - 5 * 60_000) } } });
  const failed = await db.job.count({ where: { companyId, status: "failed", finishedAt: { gte: new Date(Date.now() - 24 * 3600_000) } } });
  results.push({ service: "job queue", status: backlog > 20 ? "degraded" : "healthy", latencyMs: 0, note: `${backlog} overdue jobs, ${failed} failed in 24h` });
  t = Date.now();
  if (process.env.REDIS_URL) {
    try {
      const { default: Redis } = await import("ioredis");
      const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 2000 });
      await r.connect(); await r.ping(); r.disconnect();
      results.push({ service: "realtime (redis)", status: "healthy", latencyMs: Date.now() - t, note: "pub/sub available" });
    } catch (e) { results.push({ service: "realtime (redis)", status: "degraded", latencyMs: Date.now() - t, note: "Redis unreachable — falling back to polling" }); }
  } else results.push({ service: "realtime (redis)", status: "degraded", latencyMs: 0, note: "REDIS_URL not set — using polling fallback" });
  results.push({ service: "ai engine", status: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "healthy" : "degraded", latencyMs: 0, note: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "Claude API configured" : "No API key — offline simulation mode" });
  const ints = await db.integration.findMany({ where: { companyId } });
  for (const i of ints.filter((x) => x.status !== "disconnected")) results.push({ service: `integration: ${i.provider}`, status: i.status === "connected" ? "healthy" : "degraded", latencyMs: 0, note: i.lastError ?? (i.lastSyncAt ? `last sync ${i.lastSyncAt.toISOString()}` : "connected") });
  await db.systemCheck.createMany({ data: results.map((r) => ({ ...r, companyId, source: "live" })) });
  const bad = results.filter((r) => r.status === "down" || (r.status === "degraded" && r.service.startsWith("integration")));
  const cto = await db.agent.findFirst({ where: { companyId, key: "cto", isActive: true } });
  if (cto) for (const b of bad) {
    if (!(await once(companyId, `health:${b.service}`))) continue;
    await createTask(companyId, { agentId: cto.id, source: "autonomous", priority: "high", title: `Investigate ${b.service} (${b.status})`, description: `Live health check reported ${b.service} as ${b.status}: ${b.note}. Diagnose and propose a fix. Any change to critical systems must go through modify_system (CEO approval).` });
  }
  return results;
}
