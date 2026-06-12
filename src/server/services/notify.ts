// services/notify.ts
// Broadcasts alerts to nearby drivers and bystanders via Pusher

import { pusher } from "../realtime/pusher";
import type { Coord } from "./routing";
import { haversineKm } from "./routing";

export interface DriverAlert {
  emergencyId: string;
  message: string;
  ambulanceLocation: Coord;
  ambulanceHeading: string; // e.g. "heading north on Hosur Road"
  etaSeconds: number;
  corridorRoads: string[]; // road names that need clearing
}

export interface BystanderAlert {
  emergencyId: string;
  location: Coord;
  instructionType: "CPR" | "BLEEDING" | "CHOKING" | "STROKE" | "SEIZURE" | "GENERAL";
  message: string;
}

// ─── Broadcast driver alert to all clients in the corridor ───────────────────
// In production: FCM push notification to driver apps in the zone
// In demo: Pusher broadcast — any open browser tab in the corridor sees it

export async function broadcastDriverAlert(alert: DriverAlert): Promise<void> {
  await pusher.trigger("corridor-alerts", "driver-alert", {
    emergencyId: alert.emergencyId,
    message: alert.message,
    ambulanceLat: alert.ambulanceLocation.lat,
    ambulanceLng: alert.ambulanceLocation.lng,
    heading: alert.ambulanceHeading,
    etaSeconds: alert.etaSeconds,
    corridorRoads: alert.corridorRoads,
    timestamp: new Date().toISOString(),
  });
}

// ─── Broadcast to police / traffic control room ───────────────────────────────

export async function notifyPoliceControl(params: {
  emergencyId: string;
  signalId: string;
  junctionName: string;
  roadLinkId: string;
  roadLinkDescription: string;
  action: "GREEN" | "RED";
  ambulanceEtaSeconds: number;
}): Promise<void> {
  await pusher.trigger("police-control", "signal-interruption", {
    ...params,
    timestamp: new Date().toISOString(),
    source: "RapidResponse AI Agent",
  });
}

// ─── Send bystander first-aid alert ──────────────────────────────────────────

export async function sendBystanderAlert(alert: BystanderAlert): Promise<void> {
  await pusher.trigger(`emergency-${alert.emergencyId}`, "bystander-instruction", {
    instructionType: alert.instructionType,
    message: alert.message,
    timestamp: new Date().toISOString(),
  });
}

// ─── Check if a coord is within the alert zone ───────────────────────────────

export function isInAlertZone(
  coord: Coord,
  ambulancePos: Coord,
  radiusKm = 0.5
): boolean {
  return haversineKm(coord, ambulancePos) <= radiusKm;
}

// ─── Build driver alert message ───────────────────────────────────────────────

export function buildDriverAlertMessage(
  ambulanceId: string,
  corridorRoads: string[]
): string {
  const roads = corridorRoads.slice(0, 2).join(" and ");
  return `🚨 AMBULANCE ${ambulanceId} APPROACHING on ${roads}. Please move to the left immediately and do not block the path.`;
}
