// services/reportFetch.ts
// Fetches and structures a patient's latest clinical report for sharing to ER

import { db } from "../db/index";
import { clinicalReports, patients } from "../db/schema";
import { eq, desc } from "drizzle-orm";

export interface ParsedReport {
  reportId: string;
  patientId: string;
  patientName: string;
  patientAge: number;
  bloodGroup: string;
  conditions: string[];
  medications: Array<{ name: string; dose: string; frequency: string }>;
  allergies: string[];
  criticalAllergies: string[]; // subset flagged as critical
  ecgNotes: string | null;
  additionalNotes: string | null;
  uploadedBy: string;
  hospital: string;
  visitDate: string;
  pdfUrl: string | null;
  // Pre-formatted for Claude AI summary
  summaryText: string;
}

// ─── Fetch latest report for a patient ───────────────────────────────────────

export async function fetchLatestReport(patientId: string): Promise<ParsedReport | null> {
  const [patient] = await db
    .select()
    .from(patients)
    .where(eq(patients.id, patientId))
    .limit(1);

  if (!patient) return null;

  const [report] = await db
    .select()
    .from(clinicalReports)
    .where(eq(clinicalReports.patientId, patientId))
    .orderBy(desc(clinicalReports.visitDate))
    .limit(1);

  if (!report) return null;

  const conditions: string[] = JSON.parse(report.conditions as string) as string[];
  const medications = JSON.parse(report.medications as string) as Array<{
    name: string;
    dose: string;
    frequency: string;
  }>;
  const allergies: string[] = JSON.parse(report.allergies as string) as string[];

  // Flag critical allergies — antibiotics, NSAIDs, contrast agents are high risk
  const criticalKeywords = [
    "penicillin", "amoxicillin", "aspirin", "nsaid", "ibuprofen",
    "contrast", "latex", "morphine", "codeine", "sulfa",
  ];
  const criticalAllergies = allergies.filter((a) =>
    criticalKeywords.some((k) => a.toLowerCase().includes(k))
  );

  // Build a text summary for Claude to work with
  const summaryText = buildSummaryText({
    name: patient.name,
    age: patient.age,
    bloodGroup: report.bloodGroup,
    conditions,
    medications,
    allergies,
    criticalAllergies,
    ecgNotes: report.ecgNotes,
  });

  return {
    reportId: report.id,
    patientId: patient.id,
    patientName: patient.name,
    patientAge: patient.age,
    bloodGroup: report.bloodGroup,
    conditions,
    medications,
    allergies,
    criticalAllergies,
    ecgNotes: report.ecgNotes ?? null,
    additionalNotes: report.additionalNotes ?? null,
    uploadedBy: report.uploadedBy,
    hospital: report.hospital,
    visitDate: report.visitDate,
    pdfUrl: report.pdfUrl ?? null,
    summaryText,
  };
}

// ─── Fetch all reports for a patient (timeline) ───────────────────────────────

export async function fetchAllReports(patientId: string): Promise<ParsedReport[]> {
  const [patient] = await db
    .select()
    .from(patients)
    .where(eq(patients.id, patientId))
    .limit(1);

  if (!patient) return [];

  const reports = await db
    .select()
    .from(clinicalReports)
    .where(eq(clinicalReports.patientId, patientId))
    .orderBy(desc(clinicalReports.visitDate));

  return reports.map((report) => {
    const conditions: string[] = JSON.parse(report.conditions as string) as string[];
    const medications = JSON.parse(report.medications as string) as Array<{
      name: string;
      dose: string;
      frequency: string;
    }>;
    const allergies: string[] = JSON.parse(report.allergies as string) as string[];
    const criticalKeywords = ["penicillin", "amoxicillin", "aspirin", "nsaid", "ibuprofen"];
    const criticalAllergies = allergies.filter((a) =>
      criticalKeywords.some((k) => a.toLowerCase().includes(k))
    );

    return {
      reportId: report.id,
      patientId: patient.id,
      patientName: patient.name,
      patientAge: patient.age,
      bloodGroup: report.bloodGroup,
      conditions,
      medications,
      allergies,
      criticalAllergies,
      ecgNotes: report.ecgNotes ?? null,
      additionalNotes: report.additionalNotes ?? null,
      uploadedBy: report.uploadedBy,
      hospital: report.hospital,
      visitDate: report.visitDate,
      pdfUrl: report.pdfUrl ?? null,
      summaryText: buildSummaryText({
        name: patient.name,
        age: patient.age,
        bloodGroup: report.bloodGroup,
        conditions,
        medications,
        allergies,
        criticalAllergies,
        ecgNotes: report.ecgNotes,
      }),
    };
  });
}

// ─── Build plain-text summary for Claude prompt ──────────────────────────────

function buildSummaryText(data: {
  name: string;
  age: number;
  bloodGroup: string;
  conditions: string[];
  medications: Array<{ name: string; dose: string; frequency: string }>;
  allergies: string[];
  criticalAllergies: string[];
  ecgNotes: string | null | undefined;
}): string {
  const medList = data.medications
    .map((m) => `${m.name} ${m.dose} ${m.frequency}`)
    .join(", ");

  const allergyWarning =
    data.criticalAllergies.length > 0
      ? `CRITICAL ALLERGY WARNING: ${data.criticalAllergies.join(", ")} — DO NOT ADMINISTER`
      : data.allergies.length > 0
      ? `Allergies: ${data.allergies.join(", ")}`
      : "No known allergies";

  return [
    `Patient: ${data.name}, Age ${data.age}`,
    `Blood Group: ${data.bloodGroup}`,
    `Known Conditions: ${data.conditions.join(", ") || "None"}`,
    `Current Medications: ${medList || "None"}`,
    allergyWarning,
    data.ecgNotes ? `ECG Notes: ${data.ecgNotes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}