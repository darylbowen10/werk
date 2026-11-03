// Claude API integration (official Anthropic TypeScript SDK).
import Anthropic from "@anthropic-ai/sdk";
import type { Agent } from "@prisma/client";
import { db } from "../db";
import { runTool, toolsFor, type ToolCtx } from "./tools";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let _client: Anthropic | null = null;
export function claude() {
  return (_client ??= new Anthropic({ maxRetries: 2, timeout: 5 * 60_000 }));
}

type Effort = "low" | "medium" | "high";
type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;

// Opus 5.5 list pricing, micro-dollars per token ($4 / $20 per MTok).
const IN_MICROS = 4, OUT_MICROS = 20;

export class RefusalError extends Error {}

/**
 * Manual agentic loop: we own the loop so every tool call passes through our permission + approval gate.
 * Returns the final assistant text.
 */
export async function agentLoop(opts: {
  agent: Agent; ctx: ToolCtx; system: string; messages: BetaMessageParam[];
  effort?: Effort; maxTurns?: number; maxTokens?: number; allowTools?: boolean;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const tools = opts.allowTools === false ? [] : toolsFor(opts.agent);
  const messages = [...opts.messages];
  let inputTokens = 0, outputTokens = 0;
  const texts: string[] = [];

  for (let turn = 0; turn < (opts.maxTurns ?? 10); turn++) {
    const res = await claude().beta.messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 16000,
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort ?? "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      ...(tools.length ? { tools: tools as Anthropic.Beta.Messages.BetaTool[] } : {}),
      messages,
    });
    inputTokens += res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
    outputTokens += res.usage.output_tokens;

    if (res.stop_reason === "refusal") throw new RefusalError("The model declined this request.");
    const turnText = res.content.filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    if (turnText) texts.push(turnText);

    messages.push({ role: "assistant", content: res.content as Anthropic.Beta.Messages.BetaContentBlockParam[] });
    if (res.stop_reason === "pause_turn") continue;
    if (res.stop_reason !== "tool_use") break;

    const uses = res.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
    const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      try {
        results.push({ type: "tool_result", tool_use_id: u.id, content: await runTool(opts.ctx, u.name, u.input) });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: u.id, content: `Tool error: ${(e as Error).message}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }

  await db.agent.update({
    where: { id: opts.agent.id },
    data: { tokensUsed: { increment: inputTokens + outputTokens }, costMicros: { increment: inputTokens * IN_MICROS + outputTokens * OUT_MICROS } },
  });
  // The last text block is the final answer; earlier ones are interim narration.
  return { text: texts.at(-1) ?? "", inputTokens, outputTokens };
}

/** Single structured call without tools (JSON out via instructions). */
export async function quickText(system: string, prompt: string, effort: Effort = "low", maxTokens = 4000) {
  const res = await claude().beta.messages.create({
    model: MODEL, max_tokens: maxTokens, system, thinking: { type: "adaptive" }, output_config: { effort },
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason === "refusal") throw new RefusalError("The model declined this request.");
  return res.content.filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
}
