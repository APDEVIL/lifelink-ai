import Pusher from "pusher-js";

// ─── Singleton ────────────────────────────────────────────────────────────────
let _client: Pusher | null = null;

export function getPusherClient(): Pusher {
  if (typeof window === "undefined") {
    throw new Error("getPusherClient() must be called client-side only");
  }

  if (!_client) {
    _client = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "ap2",
      forceTLS: true,
    });
  }

  return _client;
}

// ─── Channel name helpers ─────────────────────────────────────────────────────
/** Main digital-twin channel for an emergency session */
export const emergencyChannel   = (id: string) => `emergency-${id}`;

/** Hospital-specific inbound channel */
export const hospitalChannel    = (id: string) => `hospital-${id}`;

/** Family tracker channel */
export const familyChannel      = (id: string) => `family-${id}`;

/** Police / corridor control room channel */
export const policeChannel      = () => `police-control`;

// ─── Typed event names ────────────────────────────────────────────────────────
export const PusherEvent = {
  // Session lifecycle
  SESSION_UPDATE:       "session:update",
  SESSION_LOG:          "session:log",
  SESSION_CLOSED:       "session:closed",

  // Ambulance
  AMBULANCE_LOCATION:   "ambulance:location",

  // Triage
  TRIAGE_UPDATE:        "triage:update",

  // Signals
  SIGNAL_GREEN:         "signal:green",
  SIGNAL_RED:           "signal:red",

  // Hospital
  HOSPITAL_ALERT:       "hospital:alert",

  // Corridor / police
  CORRIDOR_ALERT:       "corridor:alert",

  // Family
  FAMILY_UPDATE:        "family:update",
} as const;

export type PusherEventName = (typeof PusherEvent)[keyof typeof PusherEvent];

// ─── Payload types ────────────────────────────────────────────────────────────
export interface AmbulanceLocationPayload {
  emergencyId: string;
  lat: number;
  lng: number;
  speedKmh?: number;
  heading?: number;
  timestamp: string;
}

export interface SessionUpdatePayload {
  emergencyId: string;
  status: string;
  etaMinutes?: number;
  distanceKm?: number;
  hospitalId?: string;
  hospitalName?: string;
  priority?: string;
  updatedAt: string;
}

export interface SessionLogPayload {
  id: string;
  type: string;
  message: string;
  detail?: string;
  actor?: string;
  timestamp: string;
}

export interface TriageUpdatePayload {
  emergencyId: string;
  priority: string;
  vitals: {
    systolicBp?: number;
    diastolicBp?: number;
    heartRate?: number;
    spo2?: number;
    gcs?: number;
    temperature?: number;
  };
  recordedAt: string;
}

export interface SignalPayload {
  signalId: string;
  emergencyId: string;
  junctionName: string;
  roadLink?: string;
  state: "green" | "red";
  triggeredAt: string;
}

export interface CorridorAlertPayload {
  emergencyId: string;
  ambulanceId: string;
  route: string;
  etaMinutes: number;
  message: string;
  triggeredAt: string;
}
