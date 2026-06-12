// server/api/routers/ambulance.ts
// Ambulance GPS updates, status changes, and dispatch queries

import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { ambulances } from "@/server/db/schema";
import { broadcastAmbulanceLocation, updateEmergencyStatus, logSessionEvent } from "@/server/realtime/digitalTwin";
import { tickCorridor } from "@/server/agents/corridor";

export const ambulanceRouter = createTRPCRouter({

  // ─── List all ambulances (commander dashboard) ─────────────────────────────
  list: publicProcedure.query(async () => {
    return db.select().from(ambulances).orderBy(desc(ambulances.updatedAt));
  }),

  // ─── Get single ambulance ──────────────────────────────────────────────────
  getById: publicProcedure
    .input(z.object({ ambulanceId: z.string() }))
    .query(async ({ input }) => {
      const [amb] = await db
        .select()
        .from(ambulances)
        .where(eq(ambulances.id, input.ambulanceId))
        .limit(1);
      return amb ?? null;
    }),

  // ─── GPS location ping (called every 3s from ambulance app) ───────────────
  // Also triggers corridor tick — clears signals 500m ahead, resets passed ones
  updateLocation: publicProcedure
    .input(
      z.object({
        ambulanceId: z.string(),
        lat: z.number(),
        lng: z.number(),
        speed: z.number().optional(),
        heading: z.number().optional(),
        etaSeconds: z.number().optional(),
        // Corridor state (passed from client, set during planCorridor)
        routeSignalIds: z.array(z.string()).optional(),
        corridorRoads: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      // 1. Update ambulance GPS in DB
      await db
        .update(ambulances)
        .set({
          lat: input.lat,
          lng: input.lng,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(ambulances.id, input.ambulanceId));

      // 2. Get current emergency for this ambulance
      const [amb] = await db
        .select()
        .from(ambulances)
        .where(eq(ambulances.id, input.ambulanceId))
        .limit(1);

      if (!amb?.currentEmergencyId) {
        return { success: true, corridorTick: null };
      }

      const emergencyId = amb.currentEmergencyId;

      // 3. Broadcast location to all stakeholders
      await broadcastAmbulanceLocation({
        emergencyId,
        ambulanceId: input.ambulanceId,
        lat: input.lat,
        lng: input.lng,
        speed: input.speed,
        heading: input.heading,
        etaSeconds: input.etaSeconds,
      });

      // 4. Tick the green corridor if signal IDs are provided
      let corridorTick = null;
      if (input.routeSignalIds && input.routeSignalIds.length > 0) {
        corridorTick = await tickCorridor({
          emergencyId,
          ambulanceId: input.ambulanceId,
          ambulanceLocation: { lat: input.lat, lng: input.lng },
          routeSignalIds: input.routeSignalIds,
          corridorRoads: input.corridorRoads ?? [],
          etaSeconds: input.etaSeconds ?? 300,
        });
      }

      return { success: true, corridorTick };
    }),

  // ─── Update ambulance status ───────────────────────────────────────────────
  updateStatus: publicProcedure
    .input(
      z.object({
        ambulanceId: z.string(),
        status: z.enum(["available", "dispatched", "on_scene", "transporting", "returning"]),
        emergencyId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await db
        .update(ambulances)
        .set({
          status: input.status,
          updatedAt: new Date().toISOString(),
          // Clear emergency link when returning to available
          currentEmergencyId: input.status === "available" ? null : undefined,
        })
        .where(eq(ambulances.id, input.ambulanceId));

      // Mirror to emergency status
      if (input.emergencyId) {
        const statusMap = {
          on_scene: "on_scene",
          transporting: "transporting",
          available: "arrived", // ambulance returned = patient handed over
        } as const;

        const emergencyStatus = statusMap[input.status as keyof typeof statusMap];
        if (emergencyStatus) {
          await updateEmergencyStatus(
            input.emergencyId,
            emergencyStatus,
            "ambulance"
          );
        }

        await logSessionEvent({
          emergencyId: input.emergencyId,
          role: "ambulance",
          eventType:
            input.status === "on_scene"
              ? "AMBULANCE_ON_SCENE"
              : input.status === "transporting"
              ? "EN_ROUTE_TO_HOSPITAL"
              : input.status === "available"
              ? "ARRIVED_AT_HOSPITAL"
              : "AMBULANCE_DISPATCHED",
          message:
            input.status === "on_scene"
              ? `Ambulance ${input.ambulanceId} arrived on scene. Paramedic attending patient.`
              : input.status === "transporting"
              ? `Patient loaded. Ambulance en route to hospital.`
              : input.status === "available"
              ? `Ambulance returned to base. Patient handed over to ER team.`
              : `Ambulance status updated: ${input.status}`,
          metadata: { ambulanceId: input.ambulanceId, status: input.status },
        });
      }

      return { success: true };
    }),

  // ─── Get available ambulances (for manual dispatch override) ──────────────
  listAvailable: publicProcedure.query(async () => {
    return db
      .select()
      .from(ambulances)
      .where(eq(ambulances.status, "available"));
  }),
});