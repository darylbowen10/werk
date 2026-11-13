// Browser demo: no API key is ever shipped to the browser, so agents always use offline simulation mode.
export const MODEL = "offline";
export const aiEnabled = () => false;
export class RefusalError extends Error {}
export async function agentLoop(): Promise<{ text: string; inputTokens: number; outputTokens: number }> { throw new Error("AI disabled in browser demo"); }
export async function quickText(): Promise<string> { throw new Error("AI disabled in browser demo"); }
export function claude() { throw new Error("AI disabled in browser demo"); }
