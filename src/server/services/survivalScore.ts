// services/survivalScore.ts
// Scores each hospital 0–100 based on resource match for the patient's emergency

import type { Hospital } from "../db/schema";
import { haversineKm, type Coord } from "./routing";

export interface ScoredHospital {
  hospital: Hospital;
  score: number; // 0–100
  breakdown: {
    distance: number;
    icuAvailability: number;
    bloodMatch: number;
    specialistMatch: number;
    loadPenalty: number;
    oxygenAvailability: number;
  };
  distanceKm: number;
  etaMinutes: number;
  reasons: string[]; // human readable list shown in UI
  disqualified: boolean;
  disqualifyReason?: string;
}

export interface ScoringContext {
  patientLocation: Coord;
  bloodGroup: string | null; // "B+", "O-", etc.
  requiredSpecialists: string[]; // ["Cardiologist"], from emergency classification
  needsIcu: boolean;
  needsOxygen: boolean;
}

// ─── Main scoring function ────────────────────────────────────────────────────

export function scoreHospitals(
  hospitals: Hospital[],
  context: ScoringContext
): ScoredHospital[] {
  const scored = hospitals.map((h) => scoreOne(h, context));
  return scored.sort((a, b) => {
    // Disqualified always last
    if (a.disqualified && !b.disqualified) return 1;
    if (!a.disqualified && b.disqualified) return -1;
    return b.score - a.score;
  });
}

function scoreOne(h: Hospital, ctx: ScoringContext): ScoredHospital {
  const distanceKm = haversineKm(
    ctx.patientLocation,
    { lat: h.lat, lng: h.lng }
  );

  // Rough ETA: ~30 km/h in Bangalore traffic
  const etaMinutes = (distanceKm / 30) * 60;

  const reasons: string[] = [];
  let disqualified = false;
  let disqualifyReason: string | undefined;

  // Hard disqualification
  if (!h.isAcceptingEmergency) {
    disqualified = true;
    disqualifyReason = "Not accepting emergencies";
  }
  if (ctx.needsIcu && h.icuAvailable === 0) {
    disqualified = true;
    disqualifyReason = "No ICU beds available";
  }

  // ─── Score components (weights add to 100) ────────────────────────────────

  // 1. Distance score (25 pts) — closer is better, max 15km range
  const maxDistKm = 15;
  const distScore = Math.max(0, 25 * (1 - distanceKm / maxDistKm));

  // 2. ICU availability (20 pts)
  const icuScore = ctx.needsIcu
    ? h.icuAvailable > 0
      ? 20
      : 0
    : h.icuAvailable > 0
    ? 10
    : 5;
  if (h.icuAvailable > 0) reasons.push(`ICU: ${h.icuAvailable} beds free`);

  // 3. Blood match (15 pts)
  let bloodScore = 0;
  if (ctx.bloodGroup) {
    const available = getBloodStock(h, ctx.bloodGroup);
    if (available > 5) { bloodScore = 15; reasons.push(`Blood ${ctx.bloodGroup}: ${available} units`); }
    else if (available > 0) { bloodScore = 8; reasons.push(`Blood ${ctx.bloodGroup}: ${available} units (low)`); }
    else { bloodScore = 0; reasons.push(`Blood ${ctx.bloodGroup}: unavailable`); }
  } else {
    bloodScore = 10; // unknown blood group — neutral
  }

  // 4. Specialist match (25 pts)
  const specialists: string[] = JSON.parse(h.specialistsOnDuty as string) as string[];
  let specialistScore = 0;
  if (ctx.requiredSpecialists.length === 0) {
    specialistScore = 15; // no specific requirement
  } else {
    const matched = ctx.requiredSpecialists.filter((s) =>
      specialists.some((hs) => hs.toLowerCase().includes(s.toLowerCase()))
    );
    specialistScore = Math.round((matched.length / ctx.requiredSpecialists.length) * 25);
    if (matched.length > 0) {
      reasons.push(`On duty: ${matched.join(", ")}`);
    } else {
      reasons.push(`Missing: ${ctx.requiredSpecialists.join(", ")}`);
    }
  }

  // 5. Current load penalty (-10 to 0)
  const loadPenalty = -(h.currentLoad / 100) * 10;
  if (h.currentLoad > 80) reasons.push(`High load: ${h.currentLoad}%`);

  // 6. Oxygen availability (5 pts)
  const oxygenScore = !ctx.needsOxygen ? 5 : h.oxygenUnits > 10 ? 5 : h.oxygenUnits > 0 ? 2 : 0;
  if (ctx.needsOxygen && h.oxygenUnits > 0) reasons.push(`Oxygen: ${h.oxygenUnits} cylinders`);

  const total = Math.min(
    100,
    Math.max(0, Math.round(distScore + icuScore + bloodScore + specialistScore + loadPenalty + oxygenScore))
  );

  return {
    hospital: h,
    score: disqualified ? 0 : total,
    breakdown: {
      distance: Math.round(distScore),
      icuAvailability: icuScore,
      bloodMatch: bloodScore,
      specialistMatch: specialistScore,
      loadPenalty: Math.round(loadPenalty),
      oxygenAvailability: oxygenScore,
    },
    distanceKm: Math.round(distanceKm * 10) / 10,
    etaMinutes: Math.round(etaMinutes),
    reasons,
    disqualified,
    disqualifyReason,
  };
}

// ─── Blood group → column map ─────────────────────────────────────────────────

function getBloodStock(h: Hospital, bloodGroup: string): number {
  const map: Record<string, keyof Hospital> = {
    "A+": "bloodAPos", "A-": "bloodANeg",
    "B+": "bloodBPos", "B-": "bloodBNeg",
    "O+": "bloodOPos", "O-": "bloodONeg",
    "AB+": "bloodAbPos", "AB-": "bloodAbNeg",
  };
  const col = map[bloodGroup];
  if (!col) return 0;
  return (h[col] as number) ?? 0;
}

// ─── Required specialists from emergency type ─────────────────────────────────

export function getRequiredSpecialists(likelyCause: string): string[] {
  const cause = likelyCause.toLowerCase();
  if (cause.includes("cardiac") || cause.includes("heart")) return ["Cardiologist"];
  if (cause.includes("stroke") || cause.includes("brain")) return ["Neurologist", "Neurosurgeon"];
  if (cause.includes("trauma") || cause.includes("accident")) return ["Orthopedic", "General Surgeon"];
  if (cause.includes("breath") || cause.includes("asthma") || cause.includes("lung")) return ["Pulmonologist"];
  if (cause.includes("seizure") || cause.includes("epilepsy")) return ["Neurologist"];
  return ["Emergency Medicine"];
}
