// server/api/routers/bystander.ts
// Conversational first-aid guide — each message exchange is one turn

import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import {
  processBystanderReply,
  detectEmergencyType,
  getInitialInstruction,
  type EmergencyType,
} from "@/server/agents/bystander";
import type { AgentMessage } from "@/server/agents/base";

export const bystanderRouter = createTRPCRouter({

  // ─── Detect emergency type from free-text description ─────────────────────
  // Called once when SOS is triggered, result stored client-side
  detectType: publicProcedure
    .input(z.object({ description: z.string().min(3) }))
    .mutation(async ({ input }) => {
      const emergencyType = await detectEmergencyType(input.description);
      const initialInstruction = getInitialInstruction(emergencyType);
      return { emergencyType, initialInstruction };
    }),

  // ─── Get initial instruction without AI call ──────────────────────────────
  // Uses pre-written prompts — instant, no token cost
  getInitial: publicProcedure
    .input(
      z.object({
        emergencyType: z.enum([
          "cardiac_arrest",
          "choking",
          "bleeding",
          "stroke",
          "seizure",
          "unconscious",
          "breathing_difficulty",
          "unknown",
        ]),
      })
    )
    .query(({ input }) => {
      return getInitialInstruction(input.emergencyType as EmergencyType);
    }),

  // ─── Process bystander reply — returns next AI instruction ────────────────
  // Conversational: client passes full message history each turn
  reply: publicProcedure
    .input(
      z.object({
        emergencyId: z.string(),
        emergencyType: z.enum([
          "cardiac_arrest",
          "choking",
          "bleeding",
          "stroke",
          "seizure",
          "unconscious",
          "breathing_difficulty",
          "unknown",
        ]),
        bystanderMessage: z.string().min(1),
        // Full conversation history — client maintains this
        conversationHistory: z.array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string(),
          })
        ),
        stepNumber: z.number().int().min(1),
        ambulanceEtaMinutes: z.number().min(0),
      })
    )
    .mutation(async ({ input }) => {
      return processBystanderReply({
        emergencyId: input.emergencyId,
        emergencyType: input.emergencyType as EmergencyType,
        bystanderMessage: input.bystanderMessage,
        conversationHistory: input.conversationHistory as AgentMessage[],
        stepNumber: input.stepNumber,
        ambulanceEtaMinutes: input.ambulanceEtaMinutes,
      });
    }),
});