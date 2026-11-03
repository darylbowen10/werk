// Durable Postgres-backed job queue. Jobs survive restarts and are processed by the worker process,
// completely independent of browser sessions or game animations.
import { Prisma, type Job } from "@prisma/client";
import { db } from "../db";

export type JobType = "task.execute" | "briefing.prepare" | "autonomous.scan" | "meeting.turn" | "meeting.notes" | "approval.execute" | "integration.sync" | "health.check";

export async function enqueue(companyId: string, type: JobType, payload: Prisma.InputJsonValue, opts: { runAt?: Date; dedupeKey?: string; maxAttempts?: number } = {}) {
  if (opts.dedupeKey) {
    const existing = await db.job.findUnique({ where: { dedupeKey: opts.dedupeKey } });
    if (existing) return existing;
  }
  try {
    return await db.job.create({ data: { companyId, type, payload, runAt: opts.runAt ?? new Date(), dedupeKey: opts.dedupeKey, maxAttempts: opts.maxAttempts ?? 3 } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && opts.dedupeKey) return db.job.findUnique({ where: { dedupeKey: opts.dedupeKey } });
    throw e;
  }
}

/** Atomically claim the next due job (FOR UPDATE SKIP LOCKED allows many workers). */
export async function claim(workerId: string): Promise<Job | null> {
  const rows = await db.$queryRaw<Job[]>`
    UPDATE "Job" SET status = 'running', "lockedAt" = now(), "lockedBy" = ${workerId}, attempts = attempts + 1
    WHERE id = (
      SELECT id FROM "Job" WHERE status = 'queued' AND "runAt" <= now()
      ORDER BY "runAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED
    ) RETURNING *`;
  return rows[0] ?? null;
}

export async function complete(id: string) {
  // updateMany: tolerate jobs removed while running (e.g. tenant deleted)
  await db.job.updateMany({ where: { id }, data: { status: "done", finishedAt: new Date(), lockedAt: null } });
}

export async function fail(job: Job, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  const retry = job.attempts < job.maxAttempts;
  await db.job.updateMany({
    where: { id: job.id },
    data: retry
      ? { status: "queued", lastError: msg, lockedAt: null, runAt: new Date(Date.now() + 2 ** job.attempts * 15_000) }
      : { status: "failed", lastError: msg, finishedAt: new Date(), lockedAt: null },
  });
  return retry;
}

/** Requeue jobs whose worker died mid-flight. */
export async function recoverStale(minutes = 10) {
  return db.job.updateMany({ where: { status: "running", lockedAt: { lt: new Date(Date.now() - minutes * 60_000) } }, data: { status: "queued", lockedAt: null } });
}
