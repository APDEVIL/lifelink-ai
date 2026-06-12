// agents/commander.ts
// Master orchestrator — reads SOS, classifies severity, dispatches resources,
// triggers all other agents, logs every decision to the digital twin

import { askClaude, extractJson, logTokenUsage, callClaude, type AgentMessage } from "./base";
import { db } from "../db/index";
import { emergencies, ambulances } from "../db/schema";
import { eq } from "drizzle-orm";
import { haversineKm, type Coord } from "../services/routing";
import { logSessionEvent, broadcastSessionState } from "../realtime/digitalTwin";

export interface ClassificationResult {
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  likelyCause: string;
  requiresIcu: boolean;
  requiresOxygen: boolean;
  requiredSpecialists: string[];
  immediateActions: string[];
  reasoning: string;
}

export interface DispatchResult {
  ambulanceId: string;
  vehicleNo: string;
  paramedicName: string;
  paramedicSkills: string[];
  distanceKm: number;
  etaMinutes: number;
}

export async function classifyEmergency(
  description: string,
  reporterContext?: string
): Promise<ClassificationResult> {
  const system = `You are an emergency medical dispatcher AI for Bangalore, India.
Classify the incoming emergency and return ONLY valid JSON — no explanation, no markdown.

JSON shape:
{
  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "likelyCause": "string — one of: cardiac arrest, stroke, trauma, respiratory distress, seizure, bleeding, fracture, unknown",
  "requiresIcu": boolean,
  "requiresOxygen": boolean,
  "requiredSpecialists": ["string"],
  "immediateActions": ["string — 3 to 5 short instructions for a bystander"],
  "reasoning": "string — one sentence"
}

Severity guide:
- CRITICAL: unconscious, not breathing, cardiac arrest, major trauma, stroke
- HIGH: conscious but in severe pain, heavy bleeding, breathing difficulty
- MEDIUM: alert, moderate pain, minor injury
- LOW: stable, minor complaint`;

  const userMsg = `Emergency report: "${description}"${reporterContext ? `\nContext: ${reporterContext}` : ""}`;

  const res = await callClaude({
    systemPrompt: system,
    messages: [{ role: "user", content: userMsg }],
    maxTokens: 512,
    temperature: 0.1,
  });

  logTokenUsage("commander", res);
  const parsed = extractJson<ClassificationResult>(res.content);

  if (!parsed) {
    return {
      severity: "HIGH",
      likelyCause: "unknown",
      requiresIcu: true,
      requiresOxygen: true,
      requiredSpecialists: ["Emergency Medicine"],
      immediateActions: [
        "Keep the person still and calm",
        "Do not give food or water",
        "Stay on the line — ambulance is coming",
      ],
      reasoning: "Could not classify — defaulting to HIGH severity",
    };
  }
  return parsed;
}

export async function findBestAmbulance(
  patientLocation: Coord,
  requiredSkills: string[]
): Promise<DispatchResult | null> {
  const available = await db
    .select()
    .from(ambulances)
    .where(eq(ambulances.status, "available"));

  if (available.length === 0) return null;

  const scored = available.map((amb) => {
    const distKm = haversineKm(patientLocation, { lat: amb.lat, lng: amb.lng });
    const skills: string[] = JSON.parse(amb.paramedicSkills as string) as string[];
    const skillMatch = requiredSkills.filter((s) =>
      skills.some((sk) => sk.toLowerCase().includes(s.toLowerCase()))
    ).length;
    const distScore = Math.max(0, 100 - distKm * 10);
    const skillScore = requiredSkills.length > 0 ? (skillMatch / requiredSkills.length) * 100 : 100;
    return { ambulance: amb, score: distScore * 0.7 + skillScore * 0.3, distKm, skills };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;

  return {
    ambulanceId: best.ambulance.id,
    vehicleNo: best.ambulance.vehicleNo,
    paramedicName: best.ambulance.paramedicName,
    paramedicSkills: best.skills,
    distanceKm: Math.round(best.distKm * 10) / 10,
    etaMinutes: Math.round((best.distKm / 30) * 60),
  };
}

export async function handleSOS(params: {
  emergencyId: string;
  description: string;
  lat: number;
  lng: number;
  reportedBy?: string;
}): Promise<{ classification: ClassificationResult; dispatch: DispatchResult | null }> {
  const patientLocation: Coord = { lat: params.lat, lng: params.lng };

  await logSessionEvent({
    emergencyId: params.emergencyId,
    role: "system",
    eventType: "SOS_TRIGGERED",
    message: `SOS received from ${params.reportedBy ?? "anonymous"}: "${params.description}"`,
    metadata: { lat: params.lat, lng: params.lng },
  });

  const classification = await classifyEmergency(params.description);

  await logSessionEvent({
    emergencyId: params.emergencyId,
    role: "commander",
    eventType: "AMBULANCE_DISPATCHED",
    message: `Emergency classified: ${classification.severity} — ${classification.likelyCause}. ${classification.reasoning}`,
    metadata: { classification },
  });

  await db.update(emergencies)
    .set({ severity: classification.severity, likelyCause: classification.likelyCause, status: "active" })
    .where(eq(emergencies.id, params.emergencyId));

  const skillsNeeded = getSkillsForCause(classification.likelyCause);
  const dispatch = await findBestAmbulance(patientLocation, skillsNeeded);

  if (dispatch) {
    await db.update(ambulances)
      .set({ status: "dispatched", currentEmergencyId: params.emergencyId, updatedAt: new Date().toISOString() })
      .where(eq(ambulances.id, dispatch.ambulanceId));

    await db.update(emergencies)
      .set({ assignedAmbulanceId: dispatch.ambulanceId, status: "ambulance_dispatched" })
      .where(eq(emergencies.id, params.emergencyId));

    await logSessionEvent({
      emergencyId: params.emergencyId,
      role: "commander",
      eventType: "AMBULANCE_DISPATCHED",
      message: `Ambulance ${dispatch.vehicleNo} dispatched. Paramedic: ${dispatch.paramedicName}. ETA: ${dispatch.etaMinutes} min (${dispatch.distanceKm} km away).`,
      metadata: { dispatch },
    });
  } else {
    await logSessionEvent({
      emergencyId: params.emergencyId,
      role: "commander",
      eventType: "AMBULANCE_DISPATCHED",
      message: "WARNING: No ambulances currently available. Searching for alternatives.",
      metadata: { error: "no_ambulances_available" },
    });
  }

  await broadcastSessionState(params.emergencyId);
  return { classification, dispatch };
}

export async function commanderDecide(params: {
  emergencyId: string;
  situation: string;
  conversationHistory: AgentMessage[];
}): Promise<string> {
  const system = `You are the Emergency Commander AI for RapidResponse, Bangalore.
You coordinate ambulances, hospitals, and traffic in real time.
Be concise, decisive, and specific. Use action language.
Always state WHAT you are doing and WHY in one sentence.`;

  const res = await callClaude({
    systemPrompt: system,
    messages: [...params.conversationHistory, { role: "user", content: params.situation }],
    maxTokens: 256,
    temperature: 0.2,
  });

  logTokenUsage("commander", res);

  await logSessionEvent({
    emergencyId: params.emergencyId,
    role: "commander",
    eventType: "AMBULANCE_DISPATCHED",
    message: res.content,
    metadata: { situation: params.situation },
  });

  return res.content;
}

function getSkillsForCause(cause: string): string[] {
  const c = cause.toLowerCase();
  if (c.includes("cardiac") || c.includes("heart")) return ["cardiac", "ALS"];
  if (c.includes("stroke")) return ["stroke", "ALS"];
  if (c.includes("trauma") || c.includes("accident")) return ["trauma"];
  if (c.includes("breath") || c.includes("respiratory")) return ["ALS"];
  if (c.includes("seizure") || c.includes("epilepsy")) return ["ALS"];
  return ["BLS"];
}