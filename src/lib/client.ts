"use client";
export async function api<T = any>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(url, { method: opts.method ?? (opts.body ? "POST" : "GET"), headers: opts.body ? { "Content-Type": "application/json" } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}
export const money = (n: number | null | undefined) => (n == null ? "—" : (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US"));
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);
export const ago = (d: string | Date) => { const s = (Date.now() - new Date(d).getTime()) / 1000; if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`; };
export const time = (d: string | Date) => new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const isDemo = (src?: string | null) => !!src && src.split("+").includes("demo");
