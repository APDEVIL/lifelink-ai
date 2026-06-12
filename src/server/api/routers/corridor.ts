// server/api/routers/corridor.ts
// Green corridor planning, signal status, police log

import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { signals } from "@/server/db/schema";
import { planCorridor, closeCorridor } from "@/server/agents/corridor";
import { getSignalStatuses, getPoliceLog } from "@/server/services/signalMap";

export const corridorRouter = createTRPCRouter({

  // ─── Plan the green corridor for an emergency ──────────────────────────────
  // Called once when ambulance is dispatched + hospital reserved
  plan: publicProcedure
    .input(
      z.object({
        emergencyId: z.string(),
        ambulanceLat: z.number(),
        ambulanceLng: z.number(),
        hospitalLat: z.number(),
        hospitalLng: z.number(),
        hospitalName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      return planCorridor({
        emergencyId: input.emergencyId,
        ambulanceLocation: { lat: input.ambulanceLat, lng: input.ambulanceLng },
        hospitalLocation: { lat: input.hospitalLat, lng: input.hospitalLng },
        hospitalName: input.hospitalName,
      });
    }),

  // ─── Close corridor when ambulance arrives at hospital ────────────────────
  close: publicProcedure
    .input(
      z.object({
        emergencyId: z.string(),
        hospitalName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      await closeCorridor({
        emergencyId: input.emergencyId,
        hospitalName: input.hospitalName,
      });
      return { success: true };
    }),

  // ─── Get all signal statuses with distance from ambulance ─────────────────
  // Used by map view to render green/red signals
  getSignalStatuses: publicProcedure
    .input(
      z.object({
        ambulanceLat: z.number(),
        ambulanceLng: z.number(),
        signalIds: z.array(z.string()).optional(),
      })
    )
    .query(async ({ input }) => {
      return getSignalStatuses(
        { lat: input.ambulanceLat, lng: input.ambulanceLng },
        input.signalIds
      );
    }),

  // ─── Get all signals (for map initialisation) ─────────────────────────────
  listAll: publicProcedure.query(async () => {
    return db.select().from(signals);
  }),

  // ─── Police control room — get recent agent interruptions ─────────────────
  getPoliceLog: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      return getPoliceLog(input.limit);
    }),
});