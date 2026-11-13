// Browser demo: realtime events are dispatched in-page to the fake EventSource.
export type HQEvent = { type: string; [k: string]: unknown };
export const hqEvents = new EventTarget();
export async function publish(_companyId: string, ev: HQEvent) {
  setTimeout(() => hqEvents.dispatchEvent(new CustomEvent("hq", { detail: ev })), 0);
}
export function subscriber() { return null; }
