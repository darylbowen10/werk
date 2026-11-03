// Tiny typed event bus bridging the Phaser world and the React UI.
type Handler = (payload: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
class Bus {
  private h = new Map<string, Set<Handler>>();
  on(ev: string, fn: Handler) { if (!this.h.has(ev)) this.h.set(ev, new Set()); this.h.get(ev)!.add(fn); return () => this.off(ev, fn); }
  off(ev: string, fn: Handler) { this.h.get(ev)?.delete(fn); }
  emit(ev: string, payload?: unknown) { this.h.get(ev)?.forEach((fn) => { try { fn(payload); } catch (e) { console.error(`[bus] ${ev}`, e); } }); }
}
export const bus = new Bus();

export type WorldAgent = { id: string; key: string; name: string; title: string; department: string; office: string; avatar: Record<string, number>; status: string; statusNote: string };
export type FurnitureRow = { id?: string; itemType: string; x: number; y: number; variant: number; room?: string };
