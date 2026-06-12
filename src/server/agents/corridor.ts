// agents/corridor.ts
// Road-link aware green corridor — 500m ahead green, resets after passing
// Identifies exact signal heads on route, triggers driver alerts + police log

import { callClaude, logTokenUsage, extractJson } from "./base";
import { db } from "../db/index";
import { signals } from "../db/schema";
import { eq } from "drizzle-orm";
import { getRoute, signalsOnRoute, type Coord } from "../services/routing";
import { updateCorridorForAmbulance, resetCorridorSignals } from "../services/signalMap";
import { broadcastDriverAlert, notifyPoliceControl, buildDriverAlertMessage } from "../services/notify";
import { logSessionEvent, broadcastSignalChange } from "../realtime/digitalTwin";
import { pusher } from "../realtime/pusher";

export interface CorridorPlan {
  routeSignalIds: string[];
  routePolyline: Coord[];
  distanceKm: number;
  etaMinutes: number;
  corridorRoads: string[];
}

export interface CorridorTickResult {
  clearedSignals: string[];
  resetSignals: string[];
  activeGreenCount: number;
  driverAlertSent: boolean;
}

export async function planCorridor(params: {
  emergencyId: string;
  ambulanceLocation: Coord;
  hospitalLocation: Coord;
  hospitalName: string;
}): Promise<CorridorPlan> {
  const route = await getRoute(params.ambulanceLocation, params.hospitalLocation);
  const allSignals = await db.select().from(signals);

  const signalCoords = allSignals.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, roadLinkId: s.roadLinkId }));
  const routeSignalIds = signalsOnRoute(route.polyline, signalCoords, 0.1);
  const refinedIds = await refineSignalSelection(
    routeSignalIds,
    allSignals.filter((s) => routeSignalIds.includes(s.id)),
    route.polyline
  );

  const corridorRoads = extractRoadNames(route.polyline);

  await logSessionEvent({
    emergencyId: params.emergencyId,
    role: "traffic",
    eventType: "SIGNAL_CLEARED",
    message: `Green corridor planned: ${route.distanceKm.toFixed(1)}km to ${params.hospitalName}. ${refinedIds.length} signals identified on route. ETA: ${Math.round(route.durationMinutes)} min.`,
    metadata: { distanceKm: route.distanceKm, etaMinutes: route.durationMinutes, signalCount: refinedIds.length, signalIds: refinedIds },
  });

  return {
    routeSignalIds: refinedIds,
    routePolyline: route.polyline,
    distanceKm: route.distanceKm,
    etaMinutes: route.durationMinutes,
    corridorRoads,
  };
}

export async function tickCorridor(params: {
  emergencyId: string;
  ambulanceId: string;
  ambulanceLocation: Coord;
  routeSignalIds: string[];
  corridorRoads: string[];
  etaSeconds: number;
}): Promise<CorridorTickResult> {
  const update = await updateCorridorForAmbulance(
    params.ambulanceLocation,
    params.routeSignalIds,
    params.emergencyId
  );

  for (const signalId of update.clearedSignals) {
    const [sig] = await db.select().from(signals).where(eq(signals.id, signalId)).limit(1);
    if (!sig) continue;

    await broadcastSignalChange({
      emergencyId: params.emergencyId,
      signalId,
      junctionName: sig.junctionName,
      roadLinkId: sig.roadLinkId,
      state: "green",
    });

    await notifyPoliceControl({
      emergencyId: params.emergencyId,
      signalId,
      junctionName: sig.junctionName,
      roadLinkId: sig.roadLinkId,
      roadLinkDescription: sig.roadLinkDescription,
      action: "GREEN",
      ambulanceEtaSeconds: params.etaSeconds,
    });

    await logSessionEvent({
      emergencyId: params.emergencyId,
      role: "traffic",
      eventType: "SIGNAL_CLEARED",
      message: `🟢 Signal cleared: ${sig.junctionName} — ${sig.roadLinkDescription}`,
      metadata: { signalId, roadLinkId: sig.roadLinkId },
    });
  }

  for (const signalId of update.resetSignals) {
    const [sig] = await db.select().from(signals).where(eq(signals.id, signalId)).limit(1);
    if (!sig) continue;

    await broadcastSignalChange({
      emergencyId: params.emergencyId,
      signalId,
      junctionName: sig.junctionName,
      roadLinkId: sig.roadLinkId,
      state: "red",
    });

    await notifyPoliceControl({
      emergencyId: params.emergencyId,
      signalId,
      junctionName: sig.junctionName,
      roadLinkId: sig.roadLinkId,
      roadLinkDescription: sig.roadLinkDescription,
      action: "RED",
      ambulanceEtaSeconds: params.etaSeconds,
    });
  }

  let driverAlertSent = false;
  if (update.clearedSignals.length > 0 && update.driverAlertZone) {
    await broadcastDriverAlert({
      emergencyId: params.emergencyId,
      message: buildDriverAlertMessage(params.ambulanceId, params.corridorRoads),
      ambulanceLocation: params.ambulanceLocation,
      ambulanceHeading: "approaching",
      etaSeconds: params.etaSeconds,
      corridorRoads: params.corridorRoads,
    });
    driverAlertSent = true;
  }

  return {
    clearedSignals: update.clearedSignals,
    resetSignals: update.resetSignals,
    activeGreenCount: update.activeGreenSignals.length,
    driverAlertSent,
  };
}

export async function closeCorridor(params: {
  emergencyId: string;
  hospitalName: string;
}): Promise<void> {
  await resetCorridorSignals(params.emergencyId);

  await logSessionEvent({
    emergencyId: params.emergencyId,
    role: "traffic",
    eventType: "SIGNAL_RESET",
    message: `Green corridor closed. All signals restored to normal operation. Patient arrived at ${params.hospitalName}.`,
    metadata: {},
  });

  await pusher.trigger("police-control", "corridor-closed", {
    emergencyId: params.emergencyId,
    message: `Corridor for emergency ${params.emergencyId} closed. All signals restored.`,
    timestamp: new Date().toISOString(),
  });
}

async function refineSignalSelection(
  candidateIds: string[],
  candidateSignals: Array<{ id: string; junctionName: string; roadLinkId: string; roadLinkDescription: string; lat: number; lng: number }>,
  polyline: Coord[]
): Promise<string[]> {
  if (candidateSignals.length === 0) return [];
  if (candidateSignals.length <= 2) return candidateIds;

  const start = polyline[0];
  const end = polyline[polyline.length - 1];
  if (!start || !end) return candidateIds;

  const system = `You are a traffic management AI for Bangalore.
Given a route direction and a list of signal heads at junctions,
identify which signal heads are on the ambulance's path (direction of travel).
Each junction may have multiple signal heads for different road directions.
Return ONLY a JSON array of signal IDs that should be cleared.
Example: ["SIG_001", "SIG_003", "SIG_005"]`;

  const signalList = candidateSignals
    .map((s) => `${s.id}: ${s.junctionName} — ${s.roadLinkDescription} (lat:${s.lat}, lng:${s.lng})`)
    .join("\n");

  const res = await callClaude({
    systemPrompt: system,
    messages: [{ role: "user", content: `Route: from (${start.lat}, ${start.lng}) to (${end.lat}, ${end.lng})\nCandidate signals:\n${signalList}\n\nWhich signal IDs are on the ambulance's direction of travel? Return JSON array only.` }],
    maxTokens: 128,
    temperature: 0,
  });

  logTokenUsage("corridor", res);
  const parsed = extractJson<string[]>(res.content);
  if (!parsed || !Array.isArray(parsed)) return candidateIds;
  return parsed.filter((id) => candidateIds.includes(id));
}

function extractRoadNames(polyline: Coord[]): string[] {
  const roads: string[] = [];
  const start = polyline[0];
  if (!start) return ["current road"];

  if (start.lat < 12.92 && start.lng > 77.62) roads.push("Hosur Road");
  if (start.lat > 12.95) roads.push("Old Airport Road");
  if (start.lng < 77.60) roads.push("Bannerghatta Road");
  if (start.lat > 12.93 && start.lat < 12.96) roads.push("Intermediate Ring Road");

  return roads.length > 0 ? roads : ["main corridor route"];
}