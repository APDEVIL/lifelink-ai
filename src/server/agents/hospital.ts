// agents/hospital.ts
// Scores all hospitals, picks the best one, and reserves a bed

import { callClaude, logTokenUsage } from "./base";
import { db } from "../db/index";
import { hospitals, emergencies } from "../db/schema";
import { eq } from "drizzle-orm";
import { scoreHospitals, getRequiredSpecialists, type ScoredHospital, type ScoringContext } from "../services/survivalScore";
import { logSessionEvent, broadcastSessionState } from "../realtime/digitalTwin";
import { pusher } from "../realtime/pusher";
import type { Coord } from "../services/routing";

export interface ReservationResult {
  hospitalId: string;
  hospitalName: string;
  address: string;
  phone: string;
  icuBedReserved: boolean;
  survivalScore: number;
  distanceKm: number;
  etaMinutes: number;
  specialistsReady: string[];
  aiReasoning: string;
  allScores: Array<{ name: string; score: number; distanceKm: number; disqualified: boolean; disqualifyReason?: string }>;
}

export async function reserveHospital(params: {
  emergencyId: string;
  patientLocation: Coord;
  bloodGroup: string | null;
  likelyCause: string;
  requiresIcu: boolean;
  requiresOxygen: boolean;
}): Promise<ReservationResult | null> {
  const allHospitals = await db.select().from(hospitals);
  if (allHospitals.length === 0) return null;

  const context: ScoringContext = {
    patientLocation: params.patientLocation,
    bloodGroup: params.bloodGroup,
    requiredSpecialists: getRequiredSpecialists(params.likelyCause),
    needsIcu: params.requiresIcu,
    needsOxygen: params.requiresOxygen,
  };

  const scored = scoreHospitals(allHospitals, context);
  const best = scored.find((s) => !s.disqualified);

  if (!best) {
    await logSessionEvent({
      emergencyId: params.emergencyId,
      role: "hospital",
      eventType: "HOSPITAL_SCORED",
      message: "WARNING: All hospitals disqualified. Expanding search criteria.",
      metadata: { scored: scored.map((s) => ({ name: s.hospital.name, reason: s.disqualifyReason })) },
    });
    return null;
  }

  const reasoning = await explainHospitalChoice(best, scored.slice(0, 3), params.likelyCause);

  await db.update(hospitals).set({
    icuAvailable: params.requiresIcu ? Math.max(0, best.hospital.icuAvailable - 1) : best.hospital.icuAvailable,
    generalAvailable: !params.requiresIcu ? Math.max(0, best.hospital.generalAvailable - 1) : best.hospital.generalAvailable,
    currentLoad: Math.min(100, best.hospital.currentLoad + 5),
  }).where(eq(hospitals.id, best.hospital.id));

  await db.update(emergencies)
    .set({ assignedHospitalId: best.hospital.id, survivalScore: best.score })
    .where(eq(emergencies.id, params.emergencyId));

  const specialists: string[] = JSON.parse(best.hospital.specialistsOnDuty as string) as string[];

  await logSessionEvent({
    emergencyId: params.emergencyId,
    role: "hospital",
    eventType: "HOSPITAL_RESERVED",
    message: `Hospital reserved: ${best.hospital.name} — Survival score ${best.score}%. ${params.requiresIcu ? "ICU bed secured." : "General bed secured."} ETA: ${best.etaMinutes} min.`,
    metadata: { hospitalId: best.hospital.id, score: best.score, distanceKm: best.distanceKm, specialists },
  });

  await pusher.trigger(`hospital-${best.hospital.id}`, "hospital:reservation", {
    emergencyId: params.emergencyId,
    likelyCause: params.likelyCause,
    requiresIcu: params.requiresIcu,
    etaMinutes: best.etaMinutes,
    message: `Incoming emergency patient. ETA: ${best.etaMinutes} min. Likely: ${params.likelyCause}.`,
    timestamp: new Date().toISOString(),
  });

  await broadcastSessionState(params.emergencyId);

  return {
    hospitalId: best.hospital.id,
    hospitalName: best.hospital.name,
    address: best.hospital.address,
    phone: best.hospital.phone,
    icuBedReserved: params.requiresIcu,
    survivalScore: best.score,
    distanceKm: best.distanceKm,
    etaMinutes: best.etaMinutes,
    specialistsReady: specialists,
    aiReasoning: reasoning,
    allScores: scored.map((s) => ({ name: s.hospital.name, score: s.score, distanceKm: s.distanceKm, disqualified: s.disqualified, disqualifyReason: s.disqualifyReason })),
  };
}

async function explainHospitalChoice(best: ScoredHospital, topThree: ScoredHospital[], likelyCause: string): Promise<string> {
  const system = `You are a medical AI explaining hospital selection to an ER team.
Be direct and clinical. Two sentences maximum.
Focus on why this hospital is better than alternatives for this specific emergency.`;

  const comparison = topThree.map((s) => `${s.hospital.name}: score ${s.score}%, ${s.distanceKm}km${s.disqualified ? ` (DISQUALIFIED: ${s.disqualifyReason})` : ""}`).join(" | ");

  const res = await callClaude({
    systemPrompt: system,
    messages: [{ role: "user", content: `Emergency: ${likelyCause}\nBest: ${best.hospital.name} (${best.score}%, ${best.distanceKm}km, ETA ${best.etaMinutes}min)\nComparison: ${comparison}\nReasons: ${best.reasons.join(", ")}\n\nExplain in 2 sentences.` }],
    maxTokens: 128,
    temperature: 0.2,
  });

  logTokenUsage("hospital", res);
  return res.content;
}

export async function shareReportToER(params: {
  emergencyId: string;
  hospitalId: string;
  patientName: string;
  patientAge: number;
  bloodGroup: string;
  conditions: string[];
  medications: Array<{ name: string; dose: string; frequency: string }>;
  allergies: string[];
  criticalAllergies: string[];
  ecgNotes: string | null;
  pdfUrl: string | null;
  etaMinutes: number;
}): Promise<void> {
  await pusher.trigger(`hospital-${params.hospitalId}`, "patient:report", {
    emergencyId: params.emergencyId,
    patient: {
      name: params.patientName,
      age: params.patientAge,
      bloodGroup: params.bloodGroup,
      conditions: params.conditions,
      medications: params.medications,
      allergies: params.allergies,
      criticalAllergies: params.criticalAllergies,
      ecgNotes: params.ecgNotes,
      pdfUrl: params.pdfUrl,
    },
    etaMinutes: params.etaMinutes,
    timestamp: new Date().toISOString(),
  });

  await logSessionEvent({
    emergencyId: params.emergencyId,
    role: "hospital",
    eventType: "REPORT_SHARED_TO_ER",
    message: `Clinical report shared to ER. Patient: ${params.patientName}, ${params.patientAge}. ${params.criticalAllergies.length > 0 ? `⚠ CRITICAL ALLERGIES: ${params.criticalAllergies.join(", ")}` : "No critical allergies."}`,
    metadata: { hospitalId: params.hospitalId, patientName: params.patientName, criticalAllergies: params.criticalAllergies },
  });
}