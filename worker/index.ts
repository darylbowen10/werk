// Executive HQ worker: runs AI employees' work in the background, independent of any browser session.
import os from "node:os";
import { db } from "@/lib/db";
import { claim, complete, fail, recoverStale, enqueue } from "@/lib/jobs/queue";
import { executeTask, meetingNotes, meetingTurn } from "@/lib/agents/engine";
import { prepareMorning } from "@/lib/briefing";
import { scan, healthCheck } from "@/lib/autonomy";
import { executeApproval } from "@/lib/approvals";
import { runSync } from "@/lib/connectors";
import { aiEnabled } from "@/lib/agents/llm";
import { setAgentStatus } from "@/lib/ops";

const WORKER_ID = `${os.hostname()}:${process.pid}`;
const POLL = Number(process.env.WORKER_POLL_MS ?? 1500);
const CONCURRENCY = 4;
let running = 0, stopping = false;

async function handle(type: string, payload: Record<string, unknown>, companyId: string) {
  switch (type) {
    case "task.execute": return executeTask(String(payload.taskId));
    case "briefing.prepare": return prepareMorning(companyId);
    case "autonomous.scan": return scan(companyId, String(payload.agentKey));
    case "health.check": return healthCheck(companyId);
    case "meeting.turn": return meetingTurn(String(payload.meetingId));
    case "meeting.notes": return meetingNotes(String(payload.meetingId));
    case "approval.execute": return executeApproval(String(payload.approvalId));
    case "integration.sync": return runSync(companyId, String(payload.provider));
    default: throw new Error(`Unknown job type ${type}`);
  }
}

async function tickSchedules() {
  const due = await db.schedule.findMany({ where: { enabled: true, nextRunAt: { lte: new Date() } }, take: 50 });
  for (const s of due) {
    const next = new Date();
    if (s.intervalMinutes) next.setTime(Date.now() + s.intervalMinutes * 60_000);
    else { next.setHours(s.dailyHour ?? 6, 0, 0, 0); if (next <= new Date()) next.setDate(next.getDate() + 1); }
    // Optimistic lock: only the worker that advances nextRunAt enqueues the job.
    const upd = await db.schedule.updateMany({ where: { id: s.id, nextRunAt: s.nextRunAt }, data: { nextRunAt: next, lastRunAt: new Date() } });
    if (upd.count) await enqueue(s.companyId, s.jobType as never, s.payload as object, { dedupeKey: `sched:${s.id}:${s.nextRunAt.toISOString()}` });
  }
}

async function relaxStatuses() {
  // "finished" check-marks fade back to idle after 20 minutes; agents with no active work go idle.
  const stale = await db.agent.findMany({ where: { status: { in: ["finished", "working"] }, isActive: true } });
  for (const a of stale) {
    const active = await db.task.count({ where: { agentId: a.id, status: "working" } });
    if (a.status === "working" && !active) await setAgentStatus(a.companyId, a.id, "idle");
    if (a.status === "finished") {
      const last = await db.task.findFirst({ where: { agentId: a.id, completedAt: { not: null } }, orderBy: { completedAt: "desc" } });
      if (!last?.completedAt || Date.now() - last.completedAt.getTime() > 20 * 60_000) await setAgentStatus(a.companyId, a.id, "idle");
    }
  }
}

async function loop() {
  console.log(`[worker ${WORKER_ID}] started — AI engine: ${aiEnabled() ? "Claude API" : "OFFLINE SIMULATION (no ANTHROPIC_API_KEY)"}`);
  let lastMaint = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastMaint > 15_000) { lastMaint = Date.now(); await tickSchedules(); await recoverStale(); await relaxStatuses(); }
      while (running < CONCURRENCY) {
        const job = await claim(WORKER_ID);
        if (!job) break;
        if (job.type === "marker") { await complete(job.id); continue; }
        running++;
        const t0 = Date.now();
        handle(job.type, job.payload as Record<string, unknown>, job.companyId)
          .then(async () => { await complete(job.id).catch(() => {}); console.log(`[worker] ✓ ${job.type} ${job.id} (${Date.now() - t0} ms)`); })
          .catch(async (e) => { const retry = await fail(job, e).catch(() => false); console.error(`[worker] ✗ ${job.type} ${job.id}: ${(e as Error).message}${retry ? " (will retry)" : ""}`); })
          .finally(() => { running--; });
      }
    } catch (e) {
      console.error("[worker] loop error:", (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, POLL));
  }
}

process.on("unhandledRejection", (e) => console.error("[worker] unhandled rejection:", (e as Error)?.message ?? e));
process.on("uncaughtException", (e) => console.error("[worker] uncaught exception:", e.message));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { stopping = true; setTimeout(() => process.exit(0), 3000); });
loop();
