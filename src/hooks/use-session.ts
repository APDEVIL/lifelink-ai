// hooks/use-session.ts
// Subscribes to the digital twin for one emergency.
// Merges live Pusher events with the initial tRPC snapshot.
// Used by every role-specific page (commander, hospital, ambulance, family).

"use client";

import { useState, useCallback, useEffect } from "react";
import { usePusher } from "./use-pusher";
import { api } from "@/trpc/react";

// ─── Types mirroring digitalTwin.ts broadcast payload ────────────────────────

export interface AmbulanceState {
  id: string;
  vehicleNo: string;
  driverName: string;
  paramedicName: string;
  lat: number;
  lng: number;
  status: string;
}

export interface HospitalState {
  id: string;
  name: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  icuAvailable: number;
  // FIX: DB returns number, not missing from schema
  generalAvailable: number;
  // FIX: DB returns string[] (array of specialist names), not a joined string
  specialistsOnDuty: string[];
}

export interface TriageState {
  id: string;
  priority: "P1" | "P2" | "P3";
  priorityLabel: string;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  heartRate: number | null;
  spo2: number | null;
  gcs: number | null;
  temperature: number | null;
  glucoseLevel: number | null;
  aiSummary: string;
  criticalFindings?: string[];
  recordedBy: string;
  updatedAt: string;
}

export interface PatientState {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone: string | null;
  emergencyContact: string | null;
}

// FIX: role narrowed to the DB enum union (was loose `string`)
export type SessionLogRole =
  | "hospital"
  | "system"
  | "commander"
  | "ambulance"
  | "paramedic"
  | "bystander"
  | "traffic"
  | "family";

export interface SessionLogEntry {
  id: string;
  // FIX: added missing field that DB always returns
  emergencyId: string;
  role: SessionLogRole;
  eventType: string;
  message: string;
  // FIX: DB stores metadata as raw JSON string (or null), not a parsed object
  // Parse at point of use: JSON.parse(entry.metadata ?? "{}")
  metadata: string | null;
  // FIX: DB returns string | null (nullable timestamp), not always string
  createdAt: string | null;
}

export interface SignalState {
  signalId: string;
  junctionName: string;
  roadLinkId: string;
  state: "green" | "red";
  timestamp: string;
}

export interface EmergencyState {
  id: string;
  description: string;
  lat: number;
  lng: number;
  severity: string | null;
  likelyCause: string | null;
  status: string;
  survivalScore: number | null;
  assignedAmbulanceId: string | null;
  assignedHospitalId: string | null;
  patientId: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface SessionState {
  emergency: EmergencyState | null;
  ambulance: AmbulanceState | null;
  hospital: HospitalState | null;
  triage: TriageState | null;
  patient: PatientState | null;
  logs: SessionLogEntry[];
  signals: Record<string, SignalState>; // keyed by signalId
  isConnected: boolean;
  lastUpdated: string | null;
}

const INITIAL_STATE: SessionState = {
  emergency: null,
  ambulance: null,
  hospital: null,
  triage: null,
  patient: null,
  logs: [],
  signals: {},
  isConnected: false,
  lastUpdated: null,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSession(emergencyId: string | null) {
  const [state, setState] = useState<SessionState>(INITIAL_STATE);

  // ── Initial snapshot from tRPC ──────────────────────────────────────────────
  const { data: snapshot } = api.session.getState.useQuery(
    { emergencyId: emergencyId ?? "" },
    { enabled: !!emergencyId, refetchOnWindowFocus: false }
  );

  useEffect(() => {
    if (!snapshot) return;
    setState((prev) => ({
      ...prev,
      // FIX: double-cast through unknown first — types now match DB shape above
      emergency: (snapshot.emergency as unknown as EmergencyState) ?? null,
      ambulance: (snapshot.ambulance as unknown as AmbulanceState) ?? null,
      hospital:  (snapshot.hospital  as unknown as HospitalState)  ?? null,
      triage:    (snapshot.triage    as unknown as TriageState)    ?? null,
      patient:   (snapshot.patient   as unknown as PatientState)   ?? null,
      logs:      (snapshot.logs      as unknown as SessionLogEntry[]) ?? [],
      isConnected: true,
      lastUpdated: new Date().toISOString(),
    }));
  }, [snapshot]);

  // ── Pusher handlers ─────────────────────────────────────────────────────────
  // usePusher types every handler as PusherEventHandler<unknown>.
  // Accept `unknown`, cast at the boundary — typed inside the closure.

  const onSessionUpdate = useCallback((raw: unknown) => {
    const data = raw as Partial<SessionState> & { timestamp: string; recentLogs?: SessionLogEntry[] };
    setState((prev) => ({
      ...prev,
      emergency: (data.emergency as EmergencyState) ?? prev.emergency,
      ambulance: (data.ambulance as AmbulanceState) ?? prev.ambulance,
      hospital:  (data.hospital  as HospitalState)  ?? prev.hospital,
      triage:    (data.triage    as TriageState)    ?? prev.triage,
      patient:   (data.patient   as PatientState)   ?? prev.patient,
      logs:      data.recentLogs ?? prev.logs,
      isConnected: true,
      lastUpdated: data.timestamp,
    }));
  }, []);

  const onSessionLog = useCallback((raw: unknown) => {
    const entry = raw as SessionLogEntry;
    setState((prev) => ({
      ...prev,
      logs: [...prev.logs, entry].slice(-100), // keep last 100
      lastUpdated: entry.createdAt,
    }));
  }, []);

  const onAmbulanceLocation = useCallback((raw: unknown) => {
    const data = raw as { lat: number; lng: number; etaSeconds: number | null; timestamp: string };
    setState((prev) => ({
      ...prev,
      ambulance: prev.ambulance
        ? { ...prev.ambulance, lat: data.lat, lng: data.lng }
        : null,
      lastUpdated: data.timestamp,
    }));
  }, []);

  const onTriageUpdate = useCallback((raw: unknown) => {
    const data = raw as Partial<TriageState> & { timestamp: string };
    setState((prev) => ({
      ...prev,
      triage: prev.triage ? { ...prev.triage, ...data } : (data as TriageState),
      lastUpdated: data.timestamp,
    }));
  }, []);

  const onSignalGreen = useCallback((raw: unknown) => {
    const data = raw as SignalState;
    setState((prev) => ({
      ...prev,
      signals: { ...prev.signals, [data.signalId]: { ...data, state: "green" } },
    }));
  }, []);

  const onSignalRed = useCallback((raw: unknown) => {
    const data = raw as SignalState;
    setState((prev) => ({
      ...prev,
      signals: { ...prev.signals, [data.signalId]: { ...data, state: "red" } },
    }));
  }, []);

  const onSessionClosed = useCallback((_raw: unknown) => {
    setState((prev) => ({
      ...prev,
      emergency: prev.emergency ? { ...prev.emergency, status: "closed" } : null,
    }));
  }, []);

  usePusher(
    emergencyId ? `emergency-${emergencyId}` : null,
    [
      { event: "session:update",     handler: onSessionUpdate },
      { event: "session:log",        handler: onSessionLog },
      { event: "ambulance:location", handler: onAmbulanceLocation },
      { event: "triage:update",      handler: onTriageUpdate },
      { event: "signal:green",       handler: onSignalGreen },
      { event: "signal:red",         handler: onSignalRed },
      { event: "session:closed",     handler: onSessionClosed },
    ],
    !!emergencyId
  );

  return state;
}