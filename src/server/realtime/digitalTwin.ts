// realtime/digitalTwin.ts
// The shared live case — every update broadcasts to all stakeholders simultaneously

import { pusher } from "./pusher";
import { db } from "../db/index";
import { sessionLogs, emergencies, ambulances, triages } from "../db/schema";
import { eq, desc } from "drizzle-orm";

export type SessionEventType =
  | "SOS_TRIGGERED"
  | "AMBULANCE_DISPATCHED"
  | "BYSTANDER_GUIDED"
  | "PATIENT_IDENTIFIED"
  | "REPORT_FETCHED"
  | "REPORT_SHARED_TO_ER"
  | "HOSPITAL_SCORED"
  | "HOSPITAL_RESERVED"
  | "TRIAGE_ASSIGNED"
  | "VITALS_UPDATED"
  | "SIGNAL_CLEARED"
  | "SIGNAL_RESET"
  | "DRIVER_ALERT_SENT"
  | "AMBULANCE_ON_SCENE"
  | "PATIENT_LOADED"
  | "EN_ROUTE_TO_HOSPITAL"
  | "ARRIVED_AT_HOSPITAL"
  | "SESSION_CLOSED";

export type SessionRole =
  | "system"
  | "commander"
  | "ambulance"
  | "hospital"
  | "paramedic"
  | "bystander"
  | "traffic"
  | "family";

// ─── Log an event to DB + broadcast to all stakeholders ──────────────────────

export async function logSessionEvent(params: {
  emergencyId: string;
  role: SessionRole;
  eventType: SessionEventType;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const id = `LOG_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  // 1. Save to DB
  await db.insert(sessionLogs).values({
    id,
    emergencyId: params.emergencyId,
    role: params.role,
    eventType: params.eventType,
    message: params.message,
    metadata: JSON.stringify(params.metadata ?? {}),
  });

  // 2. Broadcast to all tabs watching this emergency
  await pusher.trigger(`emergency-${params.emergencyId}`, "session:log", {
    id,
    role: params.role,
    eventType: params.eventType,
    message: params.message,
    metadata: params.metadata ?? {},
    timestamp: new Date().toISOString(),
  });
}

// ─── Broadcast full session state snapshot ────────────────────────────────────
// Called after any major state change so all dashboards sync

export async function broadcastSessionState(emergencyId: string): Promise<void> {
  const [emergency] = await db
    .select()
    .from(emergencies)
    .where(eq(emergencies.id, emergencyId))
    .limit(1);

  if (!emergency) return;

  let ambulance: typeof ambulances.$inferSelect | null = null;
  if (emergency.assignedAmbulanceId) {
    const [amb] = await db
      .select()
      .from(ambulances)
      .where(eq(ambulances.id, emergency.assignedAmbulanceId))
      .limit(1);
    ambulance = amb ?? null;
  }

  const [triage] = await db
    .select()
    .from(triages)
    .where(eq(triages.emergencyId, emergencyId))
    .orderBy(desc(triages.createdAt))
    .limit(1);

  const recentLogs = await db
    .select()
    .from(sessionLogs)
    .where(eq(sessionLogs.emergencyId, emergencyId))
    .orderBy(desc(sessionLogs.createdAt))
    .limit(50);

  await pusher.trigger(`emergency-${emergencyId}`, "session:update", {
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
        }
      : null,
    triage: triage ?? null,
    recentLogs: recentLogs.reverse(), // oldest first
    timestamp: new Date().toISOString(),
  });
}

// ─── Broadcast ambulance GPS update (high frequency, every 3s) ───────────────

export async function broadcastAmbulanceLocation(params: {
  emergencyId: string;
  ambulanceId: string;
  lat: number;
  lng: number;
  speed?: number; // km/h
  heading?: number; // degrees
  etaSeconds?: number;
}): Promise<void> {
  await pusher.trigger(
    `emergency-${params.emergencyId}`,
    "ambulance:location",
    {
      ambulanceId: params.ambulanceId,
      lat: params.lat,
      lng: params.lng,
      speed: params.speed ?? null,
      heading: params.heading ?? null,
      etaSeconds: params.etaSeconds ?? null,
      timestamp: new Date().toISOString(),
    }
  );
}

// ─── Broadcast signal state change ───────────────────────────────────────────

export async function broadcastSignalChange(params: {
  emergencyId: string;
  signalId: string;
  junctionName: string;
  roadLinkId: string;
  state: "green" | "red";
}): Promise<void> {
  const event = params.state === "green" ? "signal:green" : "signal:red";

  // Broadcast to emergency channel (digital twin, map views)
  await pusher.trigger(`emergency-${params.emergencyId}`, event, {
    signalId: params.signalId,
    junctionName: params.junctionName,
    roadLinkId: params.roadLinkId,
    state: params.state,
    timestamp: new Date().toISOString(),
  });

  // Also broadcast to corridor-alerts channel (driver phones)
  await pusher.trigger("corridor-alerts", event, {
    signalId: params.signalId,
    junctionName: params.junctionName,
    roadLinkId: params.roadLinkId,
    state: params.state,
    timestamp: new Date().toISOString(),
  });
}

// ─── Close the session ───────────────────────────────────────────────────────

export async function closeSession(emergencyId: string, closedBy: string): Promise<void> {
  await logSessionEvent({
    emergencyId,
    role: "system",
    eventType: "SESSION_CLOSED",
    message: `Live session closed by ${closedBy}. Emergency resolved.`,
    metadata: { closedBy, closedAt: new Date().toISOString() },
  });

  await pusher.trigger(`emergency-${emergencyId}`, "session:closed", {
    emergencyId,
    closedBy,
    timestamp: new Date().toISOString(),
  });
}

// ─── Get full session timeline ────────────────────────────────────────────────

export async function getSessionTimeline(emergencyId: string) {
  return db
    .select()
    .from(sessionLogs)
    .where(eq(sessionLogs.emergencyId, emergencyId))
    .orderBy(sessionLogs.createdAt);
}

// ─── Update emergency status in DB + broadcast ────────────────────────────────

export async function updateEmergencyStatus(
  emergencyId: string,
  status: "dispatched" | "on_scene" | "transporting" | "arrived" | "closed",
  _updatedBy: SessionRole
): Promise<void> {
  await db
    .update(emergencies)
    .set({
      status,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(emergencies.id, emergencyId));

  // Broadcast the updated session state to all stakeholders
  await broadcastSessionState(emergencyId);
}