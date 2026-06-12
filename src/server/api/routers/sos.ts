// server/api/routers/sos.ts
// Triggers a new emergency: creates DB record, runs commander agent, kicks off all agents

import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { emergencies } from "@/server/db/schema";
import { handleSOS } from "@/server/agents/commander";
import { reserveHospital } from "@/server/agents/hospital";
import { planCorridor } from "@/server/agents/corridor";
import { detectEmergencyType, getInitialInstruction } from "@/server/agents/bystander";

export const sosRouter = createTRPCRouter({

  // ─── Trigger a new SOS ─────────────────────────────────────────────────────
  // Called when bystander hits the SOS button
  trigger: publicProcedure
    .input(
      z.object({
        description: z.string().min(3).default("Emergency SOS Triggered"),
        lat: z.number().default(0),
        lng: z.number().default(0),
        reportedBy: z.string().optional().default("anonymous"),
        address: z.string().optional(),
      })
      .partial() // Makes all fields optional so an empty object {} won't crash validation
      .default({}) // Handles cases where no input object is passed at all
    )
    .mutation(async ({ input }) => {
      // 1. Create emergency record
      const emergencyId = `EMG_${Date.now()}`;

      // Ensure we provide fallbacks if partial inputs are parsed
      const description = input.description ?? "Emergency SOS Triggered";
      const lat = input.lat ?? 0;
      const lng = input.lng ?? 0;
      const reportedBy = input.reportedBy ?? "anonymous";

      await db.insert(emergencies).values({
        id: emergencyId,
        description: description,
        reportedBy: reportedBy,
        lat: lat,
        lng: lng,
        address: input.address ?? null,
        severity: "HIGH",
        status: "active",
      });

      // 2. Commander classifies + dispatches ambulance
      const { classification, dispatch } = await handleSOS({
        emergencyId,
        description: description,
        lat: lat,
        lng: lng,
        reportedBy: reportedBy,
      });

      // 3. Reserve best hospital (run in parallel with bystander detection)
      const [reservation, emergencyType] = await Promise.all([
        reserveHospital({
          emergencyId,
          patientLocation: { lat: lat, lng: lng },
          bloodGroup: null, // unknown until patient identified
          likelyCause: classification.likelyCause,
          requiresIcu: classification.requiresIcu,
          requiresOxygen: classification.requiresOxygen,
        }),
        detectEmergencyType(description),
      ]);

      // 4. Plan green corridor if ambulance + hospital assigned
      let corridor = null;
      if (dispatch && reservation) {
        // Get ambulance location from dispatch result — we stored it during handleSOS
        // Use the patient location as proxy for corridor planning start
        // (ambulance actual location is updated via GPS pings)
        corridor = await planCorridor({
          emergencyId,
          ambulanceLocation: { lat: lat, lng: lng }, // refined on first GPS ping
          hospitalLocation: { lat: 0, lng: 0 }, // placeholder — filled from hospital record
          hospitalName: reservation.hospitalName,
        }).catch(() => null); // non-fatal if routing fails
      }

      // 5. Get initial bystander instruction
      const bystanderInstruction = getInitialInstruction(emergencyType);

      return {
        emergencyId,
        classification,
        dispatch,
        reservation,
        bystanderInstruction,
        corridor: corridor
          ? {
              routeSignalIds: corridor.routeSignalIds,
              distanceKm: corridor.distanceKm,
              etaMinutes: corridor.etaMinutes,
              corridorRoads: corridor.corridorRoads,
            }
          : null,
      };
    }),

  // ─── Get emergency by ID ───────────────────────────────────────────────────
  getById: publicProcedure
    .input(z.object({ emergencyId: z.string() }))
    .query(async ({ input }) => {
      const [emergency] = await db
        .select()
        .from(emergencies)
        .where(
          (await import("drizzle-orm")).eq(emergencies.id, input.emergencyId)
        )
        .limit(1);

      return emergency ?? null;
    }),

  // ─── List active emergencies (commander dashboard) ─────────────────────────
  listActive: publicProcedure.query(async () => {
    const { ne } = await import("drizzle-orm");
    return db
      .select()
      .from(emergencies)
      .where(ne(emergencies.status, "closed"))
      .orderBy(
        (await import("drizzle-orm")).desc(emergencies.createdAt)
      );
  }),
});