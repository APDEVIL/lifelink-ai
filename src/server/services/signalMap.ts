// services/signalMap.ts
// Manages the green corridor — 500m ahead green, resets 200m after passing

import { db } from "../db/index";
import { signals } from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import { haversineKm, type Coord } from "./routing";

export interface SignalStatus {
  id: string;
  junctionName: string;
  roadLinkId: string;
  roadLinkDescription: string;
  lat: number;
  lng: number;
  state: "red" | "green" | "amber";
  distanceFromAmbulance: number; // km
  controlledBy: string;
}

export interface CorridorUpdate {
  clearedSignals: string[]; // signal IDs that just turned green
  resetSignals: string[]; // signal IDs that just turned red
  activeGreenSignals: string[]; // all currently green
  driverAlertZone: Coord | null; // center of alert zone if any signal just flipped
}

// ─── Get all signals on a given route (by IDs) ────────────────────────────────

export async function getCorridorSignals(signalIds: string[]): Promise<SignalStatus[]> {
  if (signalIds.length === 0) return [];

  const rows = await db
    .select()
    .from(signals)
    .where(inArray(signals.id, signalIds));

  return rows.map((s) => ({
    ...s,
    state: s.state as "red" | "green" | "amber",
    distanceFromAmbulance: 0,
  }));
}

// ─── Update signal states based on ambulance position ────────────────────────
// Call this every 3 seconds from the realtime layer

export async function updateCorridorForAmbulance(
  ambulancePos: Coord,
  routeSignalIds: string[], // signals confirmed to be on this ambulance's route
  emergencyId: string
): Promise<CorridorUpdate> {
  const GREEN_TRIGGER_KM = 0.5; // 500m ahead → go green
  const RESET_TRIGGER_KM = 0.2; // 200m past → go red

  if (routeSignalIds.length === 0) {
    return { clearedSignals: [], resetSignals: [], activeGreenSignals: [], driverAlertZone: null };
  }

  const routeSignals = await db
    .select()
    .from(signals)
    .where(inArray(signals.id, routeSignalIds));

  const clearedSignals: string[] = [];
  const resetSignals: string[] = [];
  const activeGreenSignals: string[] = [];
  let driverAlertZone: Coord | null = null;

  for (const signal of routeSignals) {
    const sigCoord: Coord = { lat: signal.lat, lng: signal.lng };
    const dist = haversineKm(ambulancePos, sigCoord);

    if (dist <= GREEN_TRIGGER_KM && signal.state !== "green") {
      // Within 500m and not yet green → flip green
      await db
        .update(signals)
        .set({
          state: "green",
          controlledBy: "agent",
          activeEmergencyId: emergencyId,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(signals.id, signal.id));

      clearedSignals.push(signal.id);
      activeGreenSignals.push(signal.id);

      if (!driverAlertZone) {
        driverAlertZone = sigCoord; // alert zone center at first cleared signal
      }
    } else if (dist > GREEN_TRIGGER_KM + RESET_TRIGGER_KM && signal.state === "green") {
      // Ambulance has passed — reset to red
      await db
        .update(signals)
        .set({
          state: "red",
          controlledBy: "auto",
          activeEmergencyId: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(signals.id, signal.id));

      resetSignals.push(signal.id);
    } else if (signal.state === "green") {
      activeGreenSignals.push(signal.id);
    }
  }

  return { clearedSignals, resetSignals, activeGreenSignals, driverAlertZone };
}

// ─── Reset all signals for an emergency when it closes ───────────────────────

export async function resetCorridorSignals(emergencyId: string): Promise<void> {
  await db
    .update(signals)
    .set({
      state: "red",
      controlledBy: "auto",
      activeEmergencyId: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(signals.activeEmergencyId, emergencyId));
}

// ─── Get current signal statuses with ambulance distances ────────────────────

export async function getSignalStatuses(
  ambulancePos: Coord,
  signalIds?: string[]
): Promise<SignalStatus[]> {
  const all = signalIds
    ? await db.select().from(signals).where(inArray(signals.id, signalIds))
    : await db.select().from(signals);

  return all.map((s) => ({
    ...s,
    state: s.state as "red" | "green" | "amber",
    distanceFromAmbulance:
      Math.round(haversineKm(ambulancePos, { lat: s.lat, lng: s.lng }) * 100) / 100,
  }));
}

// ─── Police log helper — returns summary of recent agent interruptions ────────
// ─── Police log helper — returns summary of recent agent interruptions ────────

export interface PoliceLogEntry {
  id: string;
  junctionName: string;
  roadLinkId: string;
  roadLinkDescription: string;
  state: string;
  activeEmergencyId: string | null;
  updatedAt: string | null;
}

export async function getPoliceLog(limit = 50): Promise<PoliceLogEntry[]> {
  const all = await db.select().from(signals);
  return all
    .filter((s) => s.controlledBy === "agent")
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, limit)
    .map((s) => ({
      id: s.id,
      junctionName: s.junctionName,
      roadLinkId: s.roadLinkId,
      roadLinkDescription: s.roadLinkDescription,
      state: s.state,
      activeEmergencyId: s.activeEmergencyId ?? null,
      updatedAt: s.updatedAt ?? null,
    }));
}