// Browser demo: the background worker, running in-page. Same job handlers as the server worker.
import { db } from "@/lib/db";
import { claim, complete, fail, recoverStale, enqueue } from "@/lib/jobs/queue";
import { executeTask, meetingNotes, meetingTurn } from "@/lib/agents/engine";
import { prepareMorning } from "@/lib/briefing";
import { scan, healthCheck } from "@/lib/autonomy";
import { executeApproval } from "@/lib/approvals";
import { setAgentStatus } from "@/lib/ops";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function handle(type: string, payload: Record<string, unknown>, companyId: string) {
  switch (type) {
    case "task.execute": {
      // Give the employee visible "working" time before the deliverable lands.
      const task = await db.task.findUnique({ where: { id: String(payload.taskId) } });
      if (task?.status === "queued") { await setAgentStatus(companyId, task.agentId, "working", task.title); await sleep(5000 + Math.random() * 4000); }
      return executeTask(String(payload.taskId));
    }
    case "briefing.prepare": return prepareMorning(companyId);
    case "autonomous.scan": return scan(companyId, String(payload.agentKey));
    case "health.check": return healthCheck(companyId);
    case "meeting.turn": return meetingTurn(String(payload.meetingId));
    case "meeting.notes": await sleep(2500); return meetingNotes(String(payload.meetingId));
    case "approval.execute": return executeApproval(String(payload.approvalId));
    case "marker": return;
    default: return;
  }
}

async function tickSchedules() {
  const due = await db.schedule.findMany({ where: { enabled: true, nextRunAt: { lte: new Date() } } });
  for (const s of due) {
    const next = new Date();
    if (s.intervalMinutes) next.setTime(Date.now() + s.intervalMinutes * 60_000);
    else { next.setHours(s.dailyHour ?? 6, 0, 0, 0); if (next <= new Date()) next.setDate(next.getDate() + 1); }
    await db.schedule.update({ where: { id: s.id }, data: { nextRunAt: next, lastRunAt: new Date() } });
    await enqueue(s.companyId, s.jobType, s.payload, { dedupeKey: `sched:${s.id}:${new Date(s.nextRunAt).toISOString()}` });
  }
}

let started = false;
export function startWorker() {
  if (started) return; started = true;
  let running = 0, lastMaint = 0;
  setInterval(async () => {
    try {
      if (Date.now() - lastMaint > 10_000) { lastMaint = Date.now(); await tickSchedules(); await recoverStale(2); }
      while (running < 3) {
        const job = await claim("browser");
        if (!job) break;
        running++;
        handle(job.type, job.payload, job.companyId)
          .then(() => complete(job.id))
          .catch((e) => { console.error("[demo worker]", job.type, e); return fail(job, e); })
          .finally(() => { running--; });
      }
    } catch (e) { console.error("[demo worker]", e); }
  }, 1000);
}
