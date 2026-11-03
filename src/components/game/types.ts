import type { WorldAgent } from "@/game/bus";
export type Modal =
  | { t: "dialogue"; agentId: string }
  | { t: "desk"; tab?: string }
  | { t: "report"; id: string }
  | { t: "approval"; id: string }
  | { t: "meetingSetup" }
  | { t: "meeting"; id: string }
  | { t: "briefing"; view: "full" | "urgent"; id?: string }
  | { t: "inbox" }
  | { t: "hire"; office?: string }
  | { t: "eod" }
  | { t: "settings" }
  | { t: "help" }
  | null;
export type World = {
  user: { id: string; name: string; avatar: Record<string, number> };
  company: { id: string; name: string; logo: { symbol: string; color: string; bg: string }; settings: { autoBriefing?: boolean; endOfDayRecap?: boolean; interruptionLevel?: string } };
  agents: WorldAgent[]; furniture: { id: string; itemType: string; x: number; y: number; variant: number; room: string }[];
  unread: number; approvals: number; ai: "claude" | "offline";
};
export type Ctx = {
  world: World;
  open: (m: Modal) => void;
  close: () => void;
  toast: (t: { title: string; body?: string; tone?: "info" | "good" | "warn" | "bad"; link?: { type: string; id: string } }) => void;
  refreshWorld: () => Promise<void>;
  agentById: (id?: string | null) => WorldAgent | undefined;
};
