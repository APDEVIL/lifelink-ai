// agents/patient.ts
// Resolves unknown patient identity via face/plate, fetches report,
// generates AI paramedic brief, shares to ER

import { callClaude, logTokenUsage } from "./base";
import { matchByFaceDescriptor, matchByPlate } from "../services/faceId";
import { fetchLatestReport, type ParsedReport } from "../services/reportFetch";
import { db } from "../db/index";
import { patients, emergencies } from "../db/schema";
import { eq } from "drizzle-orm";
import { logSessionEvent, broadcastSessionState } from "../realtime/digitalTwin";
import { shareReportToER } from "./hospital";
import { pusher } from "../realtime/pusher";

export interface PatientResolutionResult {
  found: boolean;
  resolved: boolean;
  method: "face" | "plate" | "manual" | "not_found";
  patientId?: string;
  patientName?: string;
  confidence?: number;
  report?: ParsedReport;
  paramedicBrief?: string;
}

export async function resolveByFace(params: {
  emergencyId: string;
  faceDescriptor: number[];
  ambulanceId: string;
  hospitalId?: string;
  etaMinutes?: number;
}): Promise<PatientResolutionResult> {
  const match = await matchByFaceDescriptor(params.faceDescriptor);

  if (!match.found || !match.patientId) {
    await logSessionEvent({
      emergencyId: params.emergencyId,
      role: "paramedic",
      eventType: "PATIENT_IDENTIFIED",
      message: "Face scan: no matching patient found in registry. Patient remains unknown.",
      metadata: { method: "face", found: false },
    });
    return { found: false, resolved: false, method: "face" };
  }

  return resolveAndFetchReport({
    emergencyId: params.emergencyId,
    patientId: match.patientId,
    method: "face",
    confidence: match.confidence,
    hospitalId: params.hospitalId,
    etaMinutes: params.etaMinutes,
  });
}

export async function resolveByPlate(params: {
  emergencyId: string;
  plate: string;
  hospitalId?: string;
  etaMinutes?: number;
}): Promise<PatientResolutionResult> {
  const match = await matchByPlate(params.plate);

  if (!match.found || !match.patientId) {
    await logSessionEvent({
      emergencyId: params.emergencyId,
      role: "paramedic",
      eventType: "PATIENT_IDENTIFIED",
      message: `Plate scan "${params.plate}": no matching patient found in registry.`,
      metadata: { method: "plate", plate: params.plate, found: false },
    });
    return { found: false, resolved: false, method: "plate" };
  }

  return resolveAndFetchReport({
    emergencyId: params.emergencyId,
    patientId: match.patientId,
    method: "plate",
    hospitalId: params.hospitalId,
    etaMinutes: params.etaMinutes,
  });
}

export async function resolveByManual(params: {
  emergencyId: string;
  patientId: string;
  hospitalId?: string;
  etaMinutes?: number;
}): Promise<PatientResolutionResult> {
  return resolveAndFetchReport({
    emergencyId: params.emergencyId,
    patientId: params.patientId,
    method: "manual",
    hospitalId: params.hospitalId,
    etaMinutes: params.etaMinutes,
  });
}

async function resolveAndFetchReport(params: {
  emergencyId: string;
  patientId: string;
  method: "face" | "plate" | "manual";
  confidence?: number;
  hospitalId?: string;
  etaMinutes?: number;
}): Promise<PatientResolutionResult> {
  const [patient] = await db
    .select()
    .from(patients)
    .where(eq(patients.id, params.patientId))
    .limit(1);

  if (!patient) return { found: false, resolved: false, method: params.method };

  const report = await fetchLatestReport(params.patientId);

  await db.update(emergencies)
    .set({ patientId: params.patientId })
    .where(eq(emergencies.id, params.emergencyId));

  const paramedicBrief = report
    ? await generateParamedicBrief(report)
    : `Patient: ${patient.name}, ${patient.age}. No clinical records found in system.`;

  const confidenceStr = params.confidence ? ` (${Math.round(params.confidence * 100)}% confidence)` : "";

  await logSessionEvent({
    emergencyId: params.emergencyId,
    role: "paramedic",
    eventType: "PATIENT_IDENTIFIED",
    message: `Patient identified via ${params.method}${confidenceStr}: ${patient.name}, ${patient.age}${patient.gender}. ${report ? "Clinical record found and loaded." : "No clinical record found."}`,
    metadata: { patientId: params.patientId, method: params.method, hasReport: !!report },
  });

  if (report) {
    await logSessionEvent({
      emergencyId: params.emergencyId,
      role: "paramedic",
      eventType: "REPORT_FETCHED",
      message: `Report loaded: ${report.conditions.join(", ")}. ${report.criticalAllergies.length > 0 ? `⚠ CRITICAL ALLERGIES: ${report.criticalAllergies.join(", ")}` : "No critical allergies."}`,
      metadata: { reportId: report.reportId },
    });
  }

  await pusher.trigger(`emergency-${params.emergencyId}`, "patient:identified", {
    patientId: params.patientId,
    patientName: patient.name,
    patientAge: patient.age,
    method: params.method,
    confidence: params.confidence,
    paramedicBrief,
    report: report ? {
      bloodGroup: report.bloodGroup,
      conditions: report.conditions,
      medications: report.medications,
      allergies: report.allergies,
      criticalAllergies: report.criticalAllergies,
      ecgNotes: report.ecgNotes,
      pdfUrl: report.pdfUrl,
    } : null,
    timestamp: new Date().toISOString(),
  });

  if (report && params.hospitalId) {
    await shareReportToER({
      emergencyId: params.emergencyId,
      hospitalId: params.hospitalId,
      patientName: report.patientName,
      patientAge: report.patientAge,
      bloodGroup: report.bloodGroup,
      conditions: report.conditions,
      medications: report.medications,
      allergies: report.allergies,
      criticalAllergies: report.criticalAllergies,
      ecgNotes: report.ecgNotes,
      pdfUrl: report.pdfUrl,
      etaMinutes: params.etaMinutes ?? 5,
    });
  }

  await broadcastSessionState(params.emergencyId);

  return {
    found: true,
    resolved: true,
    method: params.method,
    patientId: params.patientId,
    patientName: patient.name,
    confidence: params.confidence,
    report: report ?? undefined,
    paramedicBrief,
  };
}

async function generateParamedicBrief(report: ParsedReport): Promise<string> {
  const system = `You are a medical AI briefing a paramedic in an emergency.
Generate exactly 3 bullet points — the 3 most critical things to know RIGHT NOW.
Format: "• [point]" — one per line.
Flag allergies with ⚠. Be clinical, direct, specific. No intro sentence.`;

  const res = await callClaude({
    systemPrompt: system,
    messages: [{ role: "user", content: report.summaryText }],
    maxTokens: 150,
    temperature: 0.1,
  });

  logTokenUsage("patient", res);
  return res.content;
}