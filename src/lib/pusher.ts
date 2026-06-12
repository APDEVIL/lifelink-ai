"use client";
import PusherClient from "pusher-js";
import { useEffect, useRef } from "react";

let pusherInstance: PusherClient | null = null;

export function getPusher() {
  if (!pusherInstance) {
    pusherInstance = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "ap2",
    });
  }
  return pusherInstance;
}

// ─── Hook: subscribe to a Pusher channel event ────────────────────────────────
export function usePusher<T = unknown>(
  channel: string,
  event: string,
  handler: (data: T) => void,
  enabled = true
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled || !channel) return;
    const pusher = getPusher();
    const ch = pusher.subscribe(channel);
    ch.bind(event, (data: T) => handlerRef.current(data));
    return () => {
      ch.unbind(event);
      pusher.unsubscribe(channel);
    };
  }, [channel, event, enabled]);
}

// ─── Typed event payloads ─────────────────────────────────────────────────────
export type AmbulanceLocationPayload = {
  ambulanceId: string;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  etaSeconds?: number;
};

export type SignalPayload = {
  signalId: string;
  state: "red" | "green" | "amber";
  junctionName: string;
};

export type TriageUpdatePayload = {
  emergencyId: string;
  priority: "P1" | "P2" | "P3";
  priorityLabel: string;
  aiSummary?: string;
};

export type SessionLogPayload = {
  role: string;
  eventType: string;
  message: string;
  createdAt: string;
};

export type PatientIdentifiedPayload = {
  patientId: string;
  name: string;
  age: number;
  bloodGroup?: string;
  conditions?: string[];
  criticalAllergies?: string[];
};