// agents/bystander.ts
// Guides bystanders through CPR, bleeding, choking, stroke, seizure via voice
// Conversational — maintains message history for the session

import { callClaude, logTokenUsage, type AgentMessage } from "./base";
import { logSessionEvent } from "../realtime/digitalTwin";
import { pusher } from "../realtime/pusher";

export type EmergencyType =
  | "cardiac_arrest"
  | "choking"
  | "bleeding"
  | "stroke"
  | "seizure"
  | "unconscious"
  | "breathing_difficulty"
  | "unknown";

export interface BystanderResponse {
  instruction: string;
  spokenText: string;
  nextPrompt: string;
  emergencyType: EmergencyType;
  stepNumber: number;
  isUrgent: boolean;
}

const SYSTEM_PROMPTS: Record<EmergencyType, string> = {
  cardiac_arrest: `You are a calm emergency CPR guide for a bystander in Bangalore, India.
The ambulance is on the way. Guide them through CPR step by step.
Rules:
- One instruction at a time. Short sentences. Maximum 2 sentences per turn.
- Always end with a question to confirm they completed the step.
- Count rhythms aloud: "1, 2, 3, push down hard..."
- If they say the patient is breathing, adjust to recovery position.
- Never say you are an AI. You are the emergency dispatcher.`,

  choking: `You are a calm emergency guide for a choking situation.
The ambulance is on the way. Guide through back blows and Heimlich manoeuvre.
Rules: One step at a time. Ask for confirmation. Be calm but urgent.`,

  bleeding: `You are a calm emergency guide for severe bleeding.
The ambulance is on the way. Guide through direct pressure and tourniquet if needed.
Rules: One step at a time. Never tell them to remove clothing — just press over it.`,

  stroke: `You are a calm emergency guide for a suspected stroke (FAST check).
The ambulance is on the way. Guide through keeping patient still, checking FAST signs.
Rules: Do not give water or food. Keep patient calm and lying down.`,

  seizure: `You are a calm emergency guide for a seizure.
The ambulance is on the way. Guide through seizure first aid.
Rules: Do NOT restrain the patient. Time the seizure. Clear the area. Recovery position after.`,

  unconscious: `You are a calm emergency guide for an unconscious patient.
Check for breathing first, then guide through recovery position or CPR as needed.`,

  breathing_difficulty: `You are a calm emergency guide for breathing difficulty.
Guide through sitting upright, loosening clothing, and checking for inhalers.`,

  unknown: `You are a calm emergency dispatcher guide.
First assess the situation by asking what you can see, then guide appropriately.
Be calm, clear, and directive.`,
};

const INITIAL_MESSAGES: Record<EmergencyType, string> = {
  cardiac_arrest: "I'm here to help. The ambulance is on the way. Is the person breathing? Tap their shoulder firmly and call out their name.",
  choking: "I'm here to help. The ambulance is coming. Can the person cough at all or make any sound?",
  bleeding: "I'm here to help. The ambulance is coming. Where is the bleeding? Can you see the wound?",
  stroke: "I'm here to help. The ambulance is coming. Ask the person to smile — does one side of their face droop?",
  seizure: "I'm here to help. The ambulance is coming. Is the person still shaking, or has the shaking stopped?",
  unconscious: "I'm here to help. The ambulance is coming. Tap the person's shoulder firmly — do they respond at all?",
  breathing_difficulty: "I'm here to help. The ambulance is coming. Can the person speak in full sentences or only a few words?",
  unknown: "I'm here to help. The ambulance is on the way. Tell me — what do you see right now? What happened?",
};

export function getInitialInstruction(emergencyType: EmergencyType): BystanderResponse {
  const instruction = INITIAL_MESSAGES[emergencyType];
  return {
    instruction,
    spokenText: instruction,
    nextPrompt: instruction,
    emergencyType,
    stepNumber: 1,
    isUrgent: emergencyType === "cardiac_arrest" || emergencyType === "bleeding",
  };
}

export async function processBystanderReply(params: {
  emergencyId: string;
  emergencyType: EmergencyType;
  bystanderMessage: string;
  conversationHistory: AgentMessage[];
  stepNumber: number;
  ambulanceEtaMinutes: number;
}): Promise<BystanderResponse> {
  const systemPrompt =
    SYSTEM_PROMPTS[params.emergencyType] +
    `\n\nAmbulance ETA: ${params.ambulanceEtaMinutes} minutes. Keep them engaged and acting.

Return ONLY a JSON object:
{
  "instruction": "full instruction to show on screen",
  "spokenText": "shorter version optimised for text-to-speech, no symbols",
  "nextPrompt": "question to ask after they complete this step",
  "isUrgent": boolean
}`;

  const res = await callClaude({
    systemPrompt,
    messages: [...params.conversationHistory, { role: "user", content: params.bystanderMessage }],
    maxTokens: 256,
    temperature: 0.3,
  });

  logTokenUsage("bystander", res);

  let parsed: { instruction: string; spokenText: string; nextPrompt: string; isUrgent: boolean } | null = null;

  try {
    parsed = JSON.parse(res.content) as typeof parsed;
  } catch {
    parsed = {
      instruction: res.content,
      spokenText: res.content.replace(/[*_#\[\]]/g, ""),
      nextPrompt: "Are you able to do that?",
      isUrgent: false,
    };
  }

  const response: BystanderResponse = {
    instruction: parsed?.instruction ?? res.content,
    spokenText: parsed?.spokenText ?? res.content,
    nextPrompt: parsed?.nextPrompt ?? "Are you able to do that?",
    emergencyType: params.emergencyType,
    stepNumber: params.stepNumber + 1,
    isUrgent: parsed?.isUrgent ?? false,
  };

  await logSessionEvent({
    emergencyId: params.emergencyId,
    role: "bystander",
    eventType: "BYSTANDER_GUIDED",
    message: `Bystander step ${params.stepNumber}: "${params.bystanderMessage}" → AI: "${response.instruction}"`,
    metadata: { stepNumber: params.stepNumber, emergencyType: params.emergencyType },
  });

  await pusher.trigger(`emergency-${params.emergencyId}`, "bystander-instruction", {
    ...response,
    timestamp: new Date().toISOString(),
  });

  return response;
}

export async function detectEmergencyType(description: string): Promise<EmergencyType> {
  const lower = description.toLowerCase();

  if (lower.includes("not breathing") || lower.includes("collapsed") || lower.includes("cardiac") || lower.includes("heart")) return "cardiac_arrest";
  if (lower.includes("chok")) return "choking";
  if (lower.includes("bleed") || lower.includes("blood") || lower.includes("cut")) return "bleeding";
  if (lower.includes("stroke") || lower.includes("face droop") || lower.includes("can't speak")) return "stroke";
  if (lower.includes("seizure") || lower.includes("fit") || lower.includes("convuls")) return "seizure";
  if (lower.includes("unconscious") || lower.includes("fainted") || lower.includes("unresponsive")) return "unconscious";
  if (lower.includes("breath") || lower.includes("asthma") || lower.includes("wheez")) return "breathing_difficulty";

  const res = await callClaude({
    systemPrompt: `Classify this emergency into exactly one of:
cardiac_arrest, choking, bleeding, stroke, seizure, unconscious, breathing_difficulty, unknown
Return ONLY the type string, nothing else.`,
    messages: [{ role: "user", content: description }],
    maxTokens: 20,
    temperature: 0,
  });

  logTokenUsage("bystander", res);
  const typeStr = res.content.trim().toLowerCase() as EmergencyType;
  const validTypes: EmergencyType[] = ["cardiac_arrest", "choking", "bleeding", "stroke", "seizure", "unconscious", "breathing_difficulty", "unknown"];
  return validTypes.includes(typeStr) ? typeStr : "unknown";
}