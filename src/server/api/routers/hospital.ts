// server/api/routers/hospital.ts
// Hospital bed/resource queries, reservation status, ER dashboard data

import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { hospitals, emergencies, triages } from "@/server/db/schema";
import { scoreHospitals, getRequiredSpecialists } from "@/server/services/survivalScore";

export const hospitalRouter = createTRPCRouter({

  // ─── List all hospitals with live resource counts ──────────────────────────
  list: publicProcedure.query(async () => {
    const rows = await db.select().from(hospitals);
    return rows.map((h) => ({
      ...h,
      specialistsOnDuty: JSON.parse(h.specialistsOnDuty as string) as string[],
    }));
  }),

  // ─── Get single hospital ───────────────────────────────────────────────────
  getById: publicProcedure
    .input(z.object({ hospitalId: z.string() }))
    .query(async ({ input }) => {
      const [h] = await db
        .select()
        .from(hospitals)
        .where(eq(hospitals.id, input.hospitalId))
        .limit(1);

      if (!h) return null;
      return {
        ...h,
        specialistsOnDuty: JSON.parse(h.specialistsOnDuty as string) as string[],
      };
    }),

  // ─── Score hospitals for a given emergency (used by commander dashboard) ───
  score: publicProcedure
    .input(
      z.object({
        patientLat: z.number(),
        patientLng: z.number(),
        bloodGroup: z.string().nullable(),
        likelyCause: z.string(),
        needsIcu: z.boolean(),
        needsOxygen: z.boolean(),
      })
    )
    .query(async ({ input }) => {
      const allHospitals = await db.select().from(hospitals);

      const scored = scoreHospitals(allHospitals, {
        patientLocation: { lat: input.patientLat, lng: input.patientLng },
        bloodGroup: input.bloodGroup,
        requiredSpecialists: getRequiredSpecialists(input.likelyCause),
        needsIcu: input.needsIcu,
        needsOxygen: input.needsOxygen,
      });

      return scored.map((s) => ({
        hospitalId: s.hospital.id,
        name: s.hospital.name,
        address: s.hospital.address,
        lat: s.hospital.lat,
        lng: s.hospital.lng,
        phone: s.hospital.phone,
        score: s.score,
        distanceKm: s.distanceKm,
        etaMinutes: s.etaMinutes,
        breakdown: s.breakdown,
        reasons: s.reasons,
        disqualified: s.disqualified,
        disqualifyReason: s.disqualifyReason,
        icuAvailable: s.hospital.icuAvailable,
        generalAvailable: s.hospital.generalAvailable,
        currentLoad: s.hospital.currentLoad,
        specialistsOnDuty: JSON.parse(s.hospital.specialistsOnDuty as string) as string[],
      }));
    }),

  // ─── ER dashboard: get active incoming emergency for this hospital ─────────
  getIncomingEmergency: publicProcedure
    .input(z.object({ hospitalId: z.string() }))
    .query(async ({ input }) => {
      const { ne } = await import("drizzle-orm");

      const [emergency] = await db
        .select()
        .from(emergencies)
        .where(eq(emergencies.assignedHospitalId, input.hospitalId))
        .orderBy((await import("drizzle-orm")).desc(emergencies.createdAt))
        .limit(1);

      if (!emergency) return null;

      // Get triage if available
      let triage = null;
      if (emergency.id) {
        const [t] = await db
          .select()
          .from(triages)
          .where(eq(triages.emergencyId, emergency.id))
          .orderBy((await import("drizzle-orm")).desc(triages.createdAt))
          .limit(1);
        triage = t ?? null;
      }

      return {
        emergency,
        triage: triage
          ? {
              ...triage,
              stepsTaken: JSON.parse(triage.stepsTaken as string) as string[],
            }
          : null,
      };
    }),

  // ─── Update hospital resources (admin / seed use) ──────────────────────────
  updateResources: publicProcedure
    .input(
      z.object({
        hospitalId: z.string(),
        icuAvailable: z.number().min(0).optional(),
        generalAvailable: z.number().min(0).optional(),
        oxygenUnits: z.number().min(0).optional(),
        currentLoad: z.number().min(0).max(100).optional(),
        isAcceptingEmergency: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { hospitalId, ...updates } = input;
      await db
        .update(hospitals)
        .set(updates)
        .where(eq(hospitals.id, hospitalId));
      return { success: true };
    }),
});