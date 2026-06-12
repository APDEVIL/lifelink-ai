// server/api/routers/patient.ts
// Patient profile CRUD + unknown patient resolution (face / plate / manual)

import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { patients } from "@/server/db/schema";
import { resolveByFace, resolveByPlate, resolveByManual } from "@/server/agents/patient";
import { storeFaceEncoding } from "@/server/services/faceId";

export const patientRouter = createTRPCRouter({

  // ─── Get patient profile ───────────────────────────────────────────────────
  getById: publicProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ input }) => {
      const [patient] = await db
        .select()
        .from(patients)
        .where(eq(patients.id, input.patientId))
        .limit(1);
      return patient ?? null;
    }),

  // ─── Create patient profile (registration flow) ────────────────────────────
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        age: z.number().int().min(0).max(120),
        gender: z.enum(["M", "F", "Other"]),
        phone: z.string().optional(),
        emergencyContact: z.string().optional(), // JSON {name, phone}
        vehiclePlate: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = `PAT_${Date.now()}`;
      await db.insert(patients).values({
        id,
        name: input.name,
        age: input.age,
        gender: input.gender,
        phone: input.phone ?? null,
        emergencyContact: input.emergencyContact ?? null,
        vehiclePlate: input.vehiclePlate ?? null,
      });
      return { patientId: id };
    }),

  // ─── Store face encoding (called after face-api.js runs in browser) ────────
  saveFaceEncoding: publicProcedure
    .input(
      z.object({
        patientId: z.string(),
        faceDescriptor: z.array(z.number()).length(128),
      })
    )
    .mutation(async ({ input }) => {
      await storeFaceEncoding(input.patientId, input.faceDescriptor);
      return { success: true };
    }),

  // ─── Resolve unknown patient by face descriptor ────────────────────────────
  // Browser runs face-api.js, sends the 128-float descriptor here
  resolveByFace: publicProcedure
    .input(
      z.object({
        emergencyId: z.string(),
        faceDescriptor: z.array(z.number()).length(128),
        ambulanceId: z.string(),
        hospitalId: z.string().optional(),
        etaMinutes: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return resolveByFace({
        emergencyId: input.emergencyId,
        faceDescriptor: input.faceDescriptor,
        ambulanceId: input.ambulanceId,
        hospitalId: input.hospitalId,
        etaMinutes: input.etaMinutes,
      });
    }),

  // ─── Resolve unknown patient by vehicle plate ──────────────────────────────
  resolveByPlate: publicProcedure
    .input(
      z.object({
        emergencyId: z.string(),
        plate: z.string().min(4),
        hospitalId: z.string().optional(),
        etaMinutes: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return resolveByPlate({
        emergencyId: input.emergencyId,
        plate: input.plate,
        hospitalId: input.hospitalId,
        etaMinutes: input.etaMinutes,
      });
    }),

  // ─── Manually link patient to emergency (if ID is known) ──────────────────
  resolveManual: publicProcedure
    .input(
      z.object({
        emergencyId: z.string(),
        patientId: z.string(),
        hospitalId: z.string().optional(),
        etaMinutes: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return resolveByManual({
        emergencyId: input.emergencyId,
        patientId: input.patientId,
        hospitalId: input.hospitalId,
        etaMinutes: input.etaMinutes,
      });
    }),

  // ─── List all patients (admin / search) ───────────────────────────────────
  list: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const all = await db.select().from(patients);
      if (!input.search) return all;
      const q = input.search.toLowerCase();
      return all.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.phone?.includes(q) ||
          p.vehiclePlate?.toLowerCase().includes(q)
      );
    }),
});