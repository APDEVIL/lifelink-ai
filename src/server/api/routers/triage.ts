// server/api/routers/triage.ts
// Paramedic assigns triage on scene, pushes live vitals to hospital

import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { triages } from "@/server/db/schema";
import { assignTriage, updateVitals } from "@/server/agents/triage";

// ─── Shared vitals schema ─────────────────────────────────────────────────────
const vitalsSchema = z.object({
  bpSystolic: z.number().int().min(0).max(300).optional(),
  bpDiastolic: z.number().int().min(0).max(200).optional(),
  heartRate: z.number().int().min(0).max(300).optional(),
  spo2: z.number().int().min(0).max(100).optional(),
  gcs: z.number().int().min(3).max(15).optional(),
  temperature: z.number().min(30).max(45).optional(),
  glucoseLevel: z.number().min(0).max(50).optional(),
  stepsTaken: z.array(z.string()).optional(),
});

export const triageRouter = createTRPCRouter({

  // ─── Assign triage on scene ────────────────────────────────────────────────
  // Paramedic enters vitals → Claude classifies P1/P2/P3 → pushes to hospital
  assign: publicProcedure
    .input(
      z.object({
        emergencyId: z.string(),
        vitals: vitalsSchema,
        likelyCause: z.string(),
        recordedBy: z.string(), // paramedic name
        hospitalId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return assignTriage({
        emergencyId: input.emergencyId,
        vitals: input.vitals,
        likelyCause: input.likelyCause,
        recordedBy: input.recordedBy,
        hospitalId: input.hospitalId,
      });
    }),

  // ─── Push live vitals update (called every 2 min during transport) ─────────
  updateVitals: publicProcedure
    .input(
      z.object({
        emergencyId: z.string(),
        triageId: z.string(),
        vitals: vitalsSchema,
        hospitalId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await updateVitals({
        emergencyId: input.emergencyId,
        triageId: input.triageId,
        vitals: input.vitals,
        hospitalId: input.hospitalId,
      });
      return { success: true };
    }),

  // ─── Get latest triage for an emergency ───────────────────────────────────
  getLatest: publicProcedure
    .input(z.object({ emergencyId: z.string() }))
    .query(async ({ input }) => {
      const [triage] = await db
        .select()
        .from(triages)
        .where(eq(triages.emergencyId, input.emergencyId))
        .orderBy(desc(triages.createdAt))
        .limit(1);

      if (!triage) return null;

      return {
        ...triage,
        stepsTaken: JSON.parse(triage.stepsTaken as string) as string[],
      };
    }),

  // ─── Get all triage records for an emergency (history) ────────────────────
  getHistory: publicProcedure
    .input(z.object({ emergencyId: z.string() }))
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(triages)
        .where(eq(triages.emergencyId, input.emergencyId))
        .orderBy(desc(triages.createdAt));

      return rows.map((t) => ({
        ...t,
        stepsTaken: JSON.parse(t.stepsTaken as string) as string[],
      }));
    }),
});