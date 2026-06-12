// agents/base.ts
// Shared Claude API wrapper used by every agent
// Use claude-haiku-3 during dev, claude-sonnet-4-20250514 for demo

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

export type AgentRole =
  | "commander"
  | "hospital"
  | "bystander"
  | "patient"
  | "triage"
  | "corridor";

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentCallOptions {
  systemPrompt: string;
  messages: AgentMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AgentResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

// ─── Core Claude call ─────────────────────────────────────────────────────────

export async function callClaude(options: AgentCallOptions): Promise<AgentResponse> {
  const model = options.model ?? getDefaultModel();

  const response = await client.messages.create({
    model,
    max_tokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.3,
    system: options.systemPrompt,
    messages: options.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const content = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  return {
    content,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    model,
  };
}

// ─── Single-shot call (no conversation history) ───────────────────────────────

export async function askClaude(
  systemPrompt: string,
  userMessage: string,
  options?: Partial<AgentCallOptions>
): Promise<string> {
  const res = await callClaude({
    systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    ...options,
  });
  return res.content;
}

// ─── JSON extraction helper ───────────────────────────────────────────────────

export function extractJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match?.[1]) {
      try { return JSON.parse(match[1].trim()) as T; } catch { /* ignore */ }
    }
    const objMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (objMatch?.[1]) {
      try { return JSON.parse(objMatch[1]) as T; } catch { /* ignore */ }
    }
    return null;
  }
}

// ─── Model selection ──────────────────────────────────────────────────────────

function getDefaultModel(): string {
  const isDemoMode = process.env.DEMO_MODE === "true";
  return isDemoMode
    ? "claude-sonnet-4-20250514"
    : "claude-haiku-3-20240307";
}

// ─── Token cost logger ────────────────────────────────────────────────────────

let totalInputTokens = 0;
let totalOutputTokens = 0;

export function logTokenUsage(agent: AgentRole, res: AgentResponse): void {
  totalInputTokens += res.inputTokens;
  totalOutputTokens += res.outputTokens;
  const cost = (totalInputTokens / 1_000_000) * 0.25 + (totalOutputTokens / 1_000_000) * 1.25;
  if (process.env.NODE_ENV !== "production") {
    console.log(`[${agent}] in:${res.inputTokens} out:${res.outputTokens} | session total: $${cost.toFixed(4)}`);
  }
}