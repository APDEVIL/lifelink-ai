// server/api/routers/session.ts
// Digital twin — live session timeline, state snapshot, close session

import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
  sessionLogs,
  emergencies,
  ambulances,
  triages,
  hospitals,
  patients,
} from "@/server/db/schema";
import {
  closeSession,
  getSessionTimeline,
  logSessionEvent,
} from "@/server/realtime/digitalTwin";
import { closeCorridor } from "@/server/agents/corridor";

export const sessionRouter = createTRPCRouter({

  // ─── Get full session state (used on page load / reconnect) ───────────────
  getState: publicProcedure
    .input(z.object({ emergencyId: z.string() }))
    .query(async ({ input }) => {
      const [emergency] = await db
        .select()
        .from(emergencies)
        .where(eq(emergencies.id, input.emergencyId))
        .limit(1);

      if (!emergency) return null;

      // Parallel fetch everything
      const [ambulance, triage, hospital, patient, logs] = await Promise.all([
        emergency.assignedAmbulanceId
          ? db
              .select()
              .from(ambulances)
              .where(eq(ambulances.id, emergency.assignedAmbulanceId))
              .limit(1)
              .then((r) => r[0] ?? null)
          : null,

        db
          .select()
          .from(triages)
          .where(eq(triages.emergencyId, input.emergencyId))
          .orderBy(desc(triages.createdAt))
          .limit(1)
          .then((r) => r[0] ?? null),

        emergency.assignedHospitalId
          ? db
              .select()
              .from(hospitals)
              .where(eq(hospitals.id, emergency.assignedHospitalId))
              .limit(1)
              .then((r) => r[0] ?? null)
          : null,

        emergency.patientId
          ? db
              .select()
              .from(patients)
              .where(eq(patients.id, emergency.patientId))
              .limit(1)
              .then((r) => r[0] ?? null)
          : null,

        db
          .select()
          .from(sessionLogs)
          .where(eq(sessionLogs.emergencyId, input.emergencyId))
          .orderBy(sessionLogs.createdAt)
          .limit(100),
      ]);

      return {
        emergency,
        ambulance: ambulance
          ? {
              id: ambulance.id,
              vehicleNo: ambulance.vehicleNo,
              driverName: ambulance.driverName,
              paramedicName: ambulance.paramedicName,
              lat: ambulance.lat,
              lng: ambulance.lng,
              status: ambulance.status,
              phone: ambulance.phone,
            }
          : null,
        triage: triage
          ? {
              ...triage,
              stepsTaken: JSON.parse(triage.stepsTaken as string) as string[],
            }
          : null,
        hospital: hospital
          ? {
              id: hospital.id,
              name: hospital.name,
              address: hospital.address,
              phone: hospital.phone,
              lat: hospital.lat,
              lng: hospital.lng,
              icuAvailable: hospital.icuAvailable,
              generalAvailable: hospital.generalAvailable,
              specialistsOnDuty: JSON.parse(
                hospital.specialistsOnDuty as string
              ) as string[],
            }
          : null,
        patient: patient
          ? {
              id: patient.id,
              name: patient.name,
              age: patient.age,
              gender: patient.gender,
              phone: patient.phone,
              emergencyContact: patient.emergencyContact,
            }
          : null,
        logs,
      };
    }),

  // ─── Get session timeline (log entries only) ───────────────────────────────
  getTimeline: publicProcedure
    .input(z.object({ emergencyId: z.string() }))
    .query(async ({ input }) => {
      return getSessionTimeline(input.emergencyId);
    }),

  // ─── Manually log an event (paramedic notes, manual updates) ──────────────
  log: publicProcedure
    .input(
      z.object({
        emergencyId: z.string(),
        role: z.enum([
          "system",
          "commander",
          "ambulance",
          "hospital",
          "paramedic",
          "bystander",
          "traffic",
          "family",
        ]),
        eventType: z.string(),
        message: z.string().min(1),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      await logSessionEvent({
        emergencyId: input.emergencyId,
        role: input.role,
        eventType: input.eventType as Parameters<typeof logSessionEvent>[0]["eventType"],
        message: input.message,
        metadata: input.metadata,
      });
      return { success: true };
    }),

  // ─── Close the session (called by ambulance driver on arrival) ────────────
  close: publicProcedure
    .input(
      z.object({
        emergencyId: z.string(),
        closedBy: z.string(),
        hospitalName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // 1. Update emergency status in DB
      await db
        .update(emergencies)
        .set({
          status: "closed",
          closedAt: new Date().toISOString(),
        })
        .where(eq(emergencies.id, input.emergencyId));

      // 2. Reset any active corridor signals
      if (input.hospitalName) {
        await closeCorridor({
          emergencyId: input.emergencyId,
          hospitalName: input.hospitalName,
        });
      }

      // 3. Free up the ambulance
      const [emergency] = await db
        .select()
        .from(emergencies)
        .where(eq(emergencies.id, input.emergencyId))
        .limit(1);

      if (emergency?.assignedAmbulanceId) {
        await db
          .update(ambulances)
          .set({
            status: "available",
            currentEmergencyId: null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(ambulances.id, emergency.assignedAmbulanceId));
      }

      // 4. Close session + broadcast to all stakeholders
      await closeSession(input.emergencyId, input.closedBy);

      return { success: true };
    }),

  // ─── Get recent closed sessions (history view) ────────────────────────────
  listRecent: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      return db
        .select()
        .from(emergencies)
        .orderBy(desc(emergencies.createdAt))
        .limit(input.limit);
    }),
});