// agents/triage.ts
// Assigns triage priority (P1/P2/P3), generates AI clinical summary,
// pushes live vitals to digital twin and hospital ER

import { callClaude, logTokenUsage, extractJson } from "./base";
import { db } from "../db/index";
import { triages } from "../db/schema";
import { eq } from "drizzle-orm";
import { logSessionEvent, broadcastSessionState } from "../realtime/digitalTwin";
import { pusher } from "../realtime/pusher";

export interface VitalsInput {
  bpSystolic?: number;
  bpDiastolic?: number;
  heartRate?: number;
  spo2?: number;
  gcs?: number;
  temperature?: number;
  glucoseLevel?: number;
  stepsTaken?: string[];
}

export interface TriageResult {
  triageId: string;
  priority: "P1" | "P2" | "P3";
  priorityLabel: string;
  priorityColor: "red" | "yellow" | "green";
  aiSummary: string;
  criticalFindings: string[];
  recommendedActions: string[];
}

export interface TriageClassification {
  priority: "P1" | "P2" | "P3";
  priorityLabel: string;
  criticalFindings: string[];
  recommendedActions: string[];
  reasoning: string;
}

export async function assignTriage(params: {
  emergencyId: string;
  vitals: VitalsInput;
  likelyCause: string;
  recordedBy: string;
  hospitalId?: string;
}): Promise<TriageResult> {
  const classification = await classifyTriage(params.vitals, params.likelyCause);
  const aiSummary = await generateClinicalSummary(params.vitals, classification, params.likelyCause);
  const triageId = `TRI_${Date.now()}`;

  await db.insert(triages).values({
    id: triageId,
    emergencyId: params.emergencyId,
    priority: classification.priority,
    priorityLabel: classification.priorityLabel,
    bpSystolic: params.vitals.bpSystolic ?? null,
    bpDiastolic: params.vitals.bpDiastolic ?? null,
    heartRate: params.vitals.heartRate ?? null,
    spo2: params.vitals.spo2 ?? null,
    gcs: params.vitals.gcs ?? null,
    temperature: params.vitals.temperature ?? null,
    glucoseLevel: params.vitals.glucoseLevel ?? null,
    stepsTaken: JSON.stringify(params.vitals.stepsTaken ?? []),
    aiSummary,
    recordedBy: params.recordedBy,
  });

  await logSessionEvent({
    emergencyId: params.emergencyId,
    role: "paramedic",
    eventType: "TRIAGE_ASSIGNED",
    message: `Triage assigned: ${classification.priority} — ${classification.priorityLabel}. ${classification.criticalFindings.join(" | ")}`,
    metadata: { triageId, priority: classification.priority, vitals: params.vitals, criticalFindings: classification.criticalFindings },
  });

  const payload = {
    triageId,
    emergencyId: params.emergencyId,
    priority: classification.priority,
    priorityLabel: classification.priorityLabel,
    priorityColor: getPriorityColor(classification.priority),
    vitals: params.vitals,
    criticalFindings: classification.criticalFindings,
    recommendedActions: classification.recommendedActions,
    aiSummary,
    recordedBy: params.recordedBy,
    timestamp: new Date().toISOString(),
  };

  await pusher.trigger(`emergency-${params.emergencyId}`, "triage:update", payload);
  if (params.hospitalId) await pusher.trigger(`hospital-${params.hospitalId}`, "triage:update", payload);
  await broadcastSessionState(params.emergencyId);

  return {
    triageId,
    priority: classification.priority,
    priorityLabel: classification.priorityLabel,
    priorityColor: getPriorityColor(classification.priority),
    aiSummary,
    criticalFindings: classification.criticalFindings,
    recommendedActions: classification.recommendedActions,
  };
}

export async function updateVitals(params: {
  emergencyId: string;
  triageId: string;
  vitals: VitalsInput;
  hospitalId?: string;
}): Promise<void> {
  await db.update(triages).set({
    bpSystolic: params.vitals.bpSystolic ?? undefined,
    bpDiastolic: params.vitals.bpDiastolic ?? undefined,
    heartRate: params.vitals.heartRate ?? undefined,
    spo2: params.vitals.spo2 ?? undefined,
    gcs: params.vitals.gcs ?? undefined,
    temperature: params.vitals.temperature ?? undefined,
    glucoseLevel: params.vitals.glucoseLevel ?? undefined,
    updatedAt: new Date().toISOString(),
  }).where(eq(triages.id, params.triageId));

  const alerts = detectCriticalChange(params.vitals);
  const message = alerts.length > 0
    ? `⚠ VITALS UPDATE — CRITICAL: ${alerts.join(", ")}`
    : `Vitals update: BP ${params.vitals.bpSystolic}/${params.vitals.bpDiastolic}, HR ${params.vitals.heartRate}, SpO2 ${params.vitals.spo2}%`;

  await logSessionEvent({
    emergencyId: params.emergencyId,
    role: "ambulance",
    eventType: "VITALS_UPDATED",
    message,
    metadata: { vitals: params.vitals, alerts },
  });

  const payload = { triageId: params.triageId, vitals: params.vitals, alerts, timestamp: new Date().toISOString() };
  await pusher.trigger(`emergency-${params.emergencyId}`, "triage:update", payload);
  if (params.hospitalId) await pusher.trigger(`hospital-${params.hospitalId}`, "triage:update", payload);
}

async function classifyTriage(vitals: VitalsInput, likelyCause: string): Promise<TriageClassification> {
  const system = `You are an emergency triage AI. Classify the patient into:
P1 (Immediate - life threatening), P2 (Urgent - serious), P3 (Non-urgent - stable)

Return ONLY valid JSON:
{
  "priority": "P1" | "P2" | "P3",
  "priorityLabel": "string e.g. Immediate - Cardiac Arrest",
  "criticalFindings": ["string"],
  "recommendedActions": ["string — max 3 actions for paramedic"],
  "reasoning": "one sentence"
}`;

  const res = await callClaude({
    systemPrompt: system,
    messages: [{ role: "user", content: `Emergency type: ${likelyCause}\nVitals: ${formatVitals(vitals)}\nSteps already taken: ${vitals.stepsTaken?.join(", ") ?? "none"}` }],
    maxTokens: 300,
    temperature: 0.1,
  });

  logTokenUsage("triage", res);
  const parsed = extractJson<TriageClassification>(res.content);

  if (!parsed) {
    return {
      priority: "P1",
      priorityLabel: "Immediate — Unknown",
      criticalFindings: ["Unable to classify — defaulting to P1"],
      recommendedActions: ["Monitor vitals", "Maintain airway", "Rapid transport"],
      reasoning: "Classification failed — P1 assigned as precaution",
    };
  }
  return parsed;
}

async function generateClinicalSummary(vitals: VitalsInput, classification: TriageClassification, likelyCause: string): Promise<string> {
  const system = `You are a medical AI generating a pre-arrival clinical summary for the ER head.
Write 2–3 sentences. Include: priority, likely condition, current vitals, immediate prep needed.
Be clinical and direct. No bullet points.`;

  const res = await callClaude({
    systemPrompt: system,
    messages: [{ role: "user", content: `Priority: ${classification.priority} — ${classification.priorityLabel}\nLikely cause: ${likelyCause}\nVitals: ${formatVitals(vitals)}\nCritical findings: ${classification.criticalFindings.join(", ")}` }],
    maxTokens: 150,
    temperature: 0.2,
  });

  logTokenUsage("triage", res);
  return res.content;
}

function formatVitals(v: VitalsInput): string {
  const parts: string[] = [];
  if (v.bpSystolic && v.bpDiastolic) parts.push(`BP ${v.bpSystolic}/${v.bpDiastolic} mmHg`);
  if (v.heartRate) parts.push(`HR ${v.heartRate} bpm`);
  if (v.spo2) parts.push(`SpO2 ${v.spo2}%`);
  if (v.gcs) parts.push(`GCS ${v.gcs}/15`);
  if (v.temperature) parts.push(`Temp ${v.temperature}°C`);
  if (v.glucoseLevel) parts.push(`Glucose ${v.glucoseLevel} mmol/L`);
  return parts.length > 0 ? parts.join(", ") : "Not yet measured";
}

function getPriorityColor(priority: "P1" | "P2" | "P3"): "red" | "yellow" | "green" {
  if (priority === "P1") return "red";
  if (priority === "P2") return "yellow";
  return "green";
}

function detectCriticalChange(vitals: VitalsInput): string[] {
  const alerts: string[] = [];
  if (vitals.spo2 && vitals.spo2 < 90) alerts.push(`SpO2 critically low: ${vitals.spo2}%`);
  if (vitals.heartRate && vitals.heartRate > 150) alerts.push(`Tachycardia: ${vitals.heartRate} bpm`);
  if (vitals.heartRate && vitals.heartRate < 40) alerts.push(`Bradycardia: ${vitals.heartRate} bpm`);
  if (vitals.bpSystolic && vitals.bpSystolic < 80) alerts.push(`Hypotension: ${vitals.bpSystolic} mmHg`);
  if (vitals.bpSystolic && vitals.bpSystolic > 200) alerts.push(`Hypertensive crisis: ${vitals.bpSystolic} mmHg`);
  if (vitals.gcs && vitals.gcs < 8) alerts.push(`GCS critically low: ${vitals.gcs}/15 — airway at risk`);
  if (vitals.glucoseLevel && vitals.glucoseLevel < 3.0) alerts.push(`Hypoglycaemia: ${vitals.glucoseLevel} mmol/L`);
  return alerts;
}