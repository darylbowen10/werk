import Redis from "ioredis";

// Realtime fan-out. Worker + API publish company events; the SSE endpoint subscribes.
// Redis is optional: without REDIS_URL the SSE endpoint falls back to polling the database.
let pub: Redis | null | undefined;

function publisher(): Redis | null {
  if (pub !== undefined) return pub;
  if (!process.env.REDIS_URL) return (pub = null);
  pub = new Redis(process.env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 1, enableOfflineQueue: false });
  pub.on("error", () => {});
  return pub;
}

export type HQEvent =
  | { type: "notification"; id: string }
  | { type: "task"; id: string; status: string; agentId: string }
  | { type: "agent"; id: string; status: string; note?: string }
  | { type: "approval"; id: string }
  | { type: "briefing"; id: string }
  | { type: "meeting"; id: string }
  | { type: "message"; conversationId: string };

export async function publish(companyId: string, ev: HQEvent) {
  const p = publisher();
  if (!p) return;
  try { await p.publish(`hq:${companyId}`, JSON.stringify(ev)); } catch { /* realtime is best-effort; data is durable in Postgres */ }
}

export function subscriber(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
  r.on("error", () => {});
  return r;
}
