// server/api/routers/report.ts
// Clinical report upload (doctor flow) + fetch for emergency use

import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { clinicalReports } from "@/server/db/schema";
import { fetchLatestReport, fetchAllReports } from "@/server/services/reportFetch";
import { shareReportToER } from "@/server/agents/hospital";

export const reportRouter = createTRPCRouter({

  // ─── Doctor uploads a clinical summary after a visit ──────────────────────
  upload: publicProcedure
    .input(
      z.object({
        patientId: z.string(),
        uploadedBy: z.string(), // doctor name
        hospital: z.string(),
        conditions: z.array(z.string()),
        medications: z.array(
          z.object({
            name: z.string(),
            dose: z.string(),
            frequency: z.string(),
          })
        ),
        allergies: z.array(z.string()),
        bloodGroup: z.enum(["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]),
        ecgNotes: z.string().optional(),
        additionalNotes: z.string().optional(),
        pdfUrl: z.string().optional(),
        visitDate: z.string(), // ISO date string
      })
    )
    .mutation(async ({ input }) => {
      const id = `RPT_${Date.now()}`;

      await db.insert(clinicalReports).values({
        id,
        patientId: input.patientId,
        uploadedBy: input.uploadedBy,
        hospital: input.hospital,
        conditions: JSON.stringify(input.conditions),
        medications: JSON.stringify(input.medications),
        allergies: JSON.stringify(input.allergies),
        bloodGroup: input.bloodGroup,
        ecgNotes: input.ecgNotes ?? null,
        additionalNotes: input.additionalNotes ?? null,
        pdfUrl: input.pdfUrl ?? null,
        visitDate: input.visitDate,
      });

      return { reportId: id };
    }),

  // ─── Get latest report for a patient ──────────────────────────────────────
  getLatest: publicProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ input }) => {
      return fetchLatestReport(input.patientId);
    }),

  // ─── Get all reports for a patient (timeline view) ────────────────────────
  getAll: publicProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ input }) => {
      return fetchAllReports(input.patientId);
    }),

  // ─── Get single report by ID ───────────────────────────────────────────────
  getById: publicProcedure
    .input(z.object({ reportId: z.string() }))
    .query(async ({ input }) => {
      const [report] = await db
        .select()
        .from(clinicalReports)
        .where(eq(clinicalReports.id, input.reportId))
        .limit(1);

      if (!report) return null;

      return {
        ...report,
        conditions: JSON.parse(report.conditions as string) as string[],
        medications: JSON.parse(report.medications as string) as Array<{
          name: string;
          dose: string;
          frequency: string;
        }>,
        allergies: JSON.parse(report.allergies as string) as string[],
      };
    }),

  // ─── Push report to ER (manual trigger from paramedic app) ────────────────
  // Usually auto-triggered by patient agent, but paramedic can force-push
  pushToER: publicProcedure
    .input(
      z.object({
        emergencyId: z.string(),
        patientId: z.string(),
        hospitalId: z.string(),
        etaMinutes: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const report = await fetchLatestReport(input.patientId);

      if (!report) {
        return { success: false, reason: "No clinical report found for this patient" };
      }

      await shareReportToER({
        emergencyId: input.emergencyId,
        hospitalId: input.hospitalId,
        patientName: report.patientName,
        patientAge: report.patientAge,
        bloodGroup: report.bloodGroup,
        conditions: report.conditions,
        medications: report.medications,
        allergies: report.allergies,
        criticalAllergies: report.criticalAllergies,
        ecgNotes: report.ecgNotes,
        pdfUrl: report.pdfUrl,
        etaMinutes: input.etaMinutes,
      });

      return { success: true, reportId: report.reportId };
    }),
});