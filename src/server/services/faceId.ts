// services/faceId.ts
// Server-side patient lookup after face-api.js match runs in the browser.
// The browser sends a face descriptor (128-float array) → we compare against DB.

import { db } from "../db/index";
import { patients } from "../db/schema";

export interface FaceMatchResult {
  found: boolean;
  patientId?: string;
  confidence?: number; // 0–1 (1 = perfect match)
  message: string;
}

export interface PlateMatchResult {
  found: boolean;
  patientId?: string;
  message: string;
}

// ─── Match by face descriptor (Euclidean distance) ───────────────────────────
// face-api.js descriptors are Float32Array of length 128
// Distance < 0.6 is a match (face-api.js default threshold)

export async function matchByFaceDescriptor(
  incomingDescriptor: number[]
): Promise<FaceMatchResult> {
  const allPatients = await db.select().from(patients);

  let bestMatch: { patientId: string; distance: number } | null = null;

  for (const patient of allPatients) {
    if (!patient.faceEncoding) continue;

    let stored: number[];
    try {
      stored = JSON.parse(patient.faceEncoding as string) as number[];
    } catch {
      continue;
    }

    if (stored.length !== incomingDescriptor.length) continue;

    const distance = euclideanDistance(incomingDescriptor, stored);

    if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = { patientId: patient.id, distance };
    }
  }

  const THRESHOLD = 0.6;

  if (bestMatch && bestMatch.distance < THRESHOLD) {
    const confidence = Math.round((1 - bestMatch.distance / THRESHOLD) * 100) / 100;
    return {
      found: true,
      patientId: bestMatch.patientId,
      confidence,
      message: `Match found with ${Math.round(confidence * 100)}% confidence`,
    };
  }

  return {
    found: false,
    message: "No matching patient found in registry",
  };
}

// ─── Match by vehicle plate ───────────────────────────────────────────────────

export async function matchByPlate(plate: string): Promise<PlateMatchResult> {
  const normalized = normalizePlate(plate);

  const allPatients = await db.select().from(patients);

  const match = allPatients.find(
    (p) => p.vehiclePlate && normalizePlate(p.vehiclePlate) === normalized
  );

  if (match) {
    return {
      found: true,
      patientId: match.id,
      message: `Patient found via plate ${plate}`,
    };
  }

  return {
    found: false,
    message: `No patient registered with plate ${plate}`,
  };
}

// ─── Store face encoding for a patient ───────────────────────────────────────

export async function storeFaceEncoding(
  patientId: string,
  descriptor: number[]
): Promise<void> {
  const { eq } = await import("drizzle-orm");
  await db
    .update(patients)
    .set({ faceEncoding: JSON.stringify(descriptor) })
    .where(eq(patients.id, patientId));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function normalizePlate(plate: string): string {
  // "KA-01-MF-4892" → "KA01MF4892"
  return plate.replace(/[\s\-]/g, "").toUpperCase();
}
