import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { subscriber } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/** Server-sent events: realtime company events via Redis pub/sub, with DB polling fallback. */
export async function GET(req: Request) {
  let companyId: string;
  try { ({ companyId } = await requireSession()); } catch { return new Response("Unauthorized", { status: 401 }); }
  const enc = new TextEncoder();
  let closed = false;
  const sub = subscriber();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: string, data: unknown) => { if (!closed) controller.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`)); };
      send("hello", { at: new Date().toISOString(), realtime: sub ? "redis" : "polling" });
      if (sub) {
        await sub.subscribe(`hq:${companyId}`).catch(() => {});
        sub.on("message", (_ch, msg) => send("hq", JSON.parse(msg)));
      }
      // Polling fallback + heartbeat (also catches events published while Redis was unavailable).
      let last = new Date();
      const iv = setInterval(async () => {
        if (closed) return clearInterval(iv);
        send("ping", {});
        if (!sub) {
          const n = await db.notification.findMany({ where: { companyId, createdAt: { gt: last } } });
          const t = await db.task.findMany({ where: { companyId, OR: [{ completedAt: { gt: last } }, { startedAt: { gt: last } }] } });
          last = new Date();
          n.forEach((x) => send("hq", { type: "notification", id: x.id }));
          t.forEach((x) => send("hq", { type: "task", id: x.id, status: x.status, agentId: x.agentId }));
          if (t.length) send("hq", { type: "agent", id: "*", status: "refresh" });
        }
      }, sub ? 20_000 : 3_000);
      req.signal.addEventListener("abort", () => { closed = true; clearInterval(iv); sub?.disconnect(); try { controller.close(); } catch {} });
    },
    cancel() { closed = true; sub?.disconnect(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
