// hooks/use-ambulance-location.ts
// Reads device GPS and pushes to tRPC ambulance.updateLocation every 3 seconds.
// Only runs when role=ambulance and session is active.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/trpc/react";

export interface LocationState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  error: string | null;
  isTracking: boolean;
}

const INITIAL: LocationState = {
  lat: null,
  lng: null,
  accuracy: null,
  heading: null,
  speed: null,
  error: null,
  isTracking: false,
};

// FIX: module-level constant — stable reference across all renders, never a dep
const MOCK_ROUTE: ReadonlyArray<{ lat: number; lng: number }> = [
  { lat: 12.9352, lng: 77.6245 },
  { lat: 12.9365, lng: 77.622 },
  { lat: 12.938,  lng: 77.6198 },
  { lat: 12.9401, lng: 77.6175 },
  { lat: 12.9418, lng: 77.616 },
  { lat: 12.9435, lng: 77.6148 },
  { lat: 12.945,  lng: 77.6135 },
  { lat: 12.9465, lng: 77.6122 },
  { lat: 12.9478, lng: 77.611 },
  { lat: 12.949,  lng: 77.61 },
];

export function useAmbulanceLocation(params: {
  emergencyId: string | null; // kept for future use / logging — not sent to mutation
  ambulanceId: string | null;
  enabled: boolean;
  intervalMs?: number;
}) {
  const { emergencyId, ambulanceId, enabled, intervalMs = 3000 } = params;
  const [location, setLocation] = useState<LocationState>(INITIAL);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef = useRef<number | null>(null);
  const latestRef = useRef<{
    lat: number;
    lng: number;
    heading: number | null;
    speed: number | null;
  } | null>(null);

  const updateMutation = api.ambulance.updateLocation.useMutation();

  // Stabilize mutate so it can be safely listed as a dep without causing infinite re-renders
  const sendLocation = useCallback(
    (payload: Parameters<typeof updateMutation.mutate>[0]) => {
      updateMutation.mutate(payload);
    },
    [updateMutation.mutate],
  );

  useEffect(() => {
    if (!enabled || !emergencyId || !ambulanceId) return;

    if (!navigator.geolocation) {
      setLocation((prev) => ({
        ...prev,
        error: "Geolocation not supported on this device.",
      }));
      return;
    }

    // Watch position continuously (fast updates for local state)
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, heading, speed } = pos.coords;
        latestRef.current = { lat: latitude, lng: longitude, heading, speed };
        setLocation({
          lat: latitude,
          lng: longitude,
          accuracy,
          heading,
          speed,
          error: null,
          isTracking: true,
        });
      },
      (err) => {
        setLocation((prev) => ({
          ...prev,
          error: err.message,
          isTracking: false,
        }));
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 },
    );

    const safeAmbulanceId = ambulanceId; // narrowed by guard above

    // Push to server every intervalMs
    intervalRef.current = setInterval(() => {
      if (!latestRef.current) return;
      const { lat, lng, heading, speed } = latestRef.current;

      sendLocation({
        ambulanceId: safeAmbulanceId,
        lat,
        lng,
        heading: heading ?? undefined,
        speed: speed ?? undefined,
      });
    }, intervalMs);

    return () => {
      if (watchRef.current !== null)
        navigator.geolocation.clearWatch(watchRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, emergencyId, ambulanceId, intervalMs, sendLocation]);

  return location;
}

// ─── Mock location for demo (Bangalore coordinates) ──────────────────────────
// Use this during hackathon when running on a laptop without GPS

export function useMockAmbulanceLocation(params: {
  emergencyId: string | null; // kept for context — not sent to mutation
  ambulanceId: string | null;
  enabled: boolean;
}) {
  const { emergencyId, ambulanceId, enabled } = params;
  const [location, setLocation] = useState<LocationState>(INITIAL);
  const stepRef = useRef(0);

  const updateMutation = api.ambulance.updateLocation.useMutation();

  // Stabilize mutate so it can be safely listed as a dep without causing infinite re-renders
  const sendLocation = useCallback(
    (payload: Parameters<typeof updateMutation.mutate>[0]) => {
      updateMutation.mutate(payload);
    },
    [updateMutation.mutate],
  );

  useEffect(() => {
    if (!enabled || !emergencyId || !ambulanceId) return;

    const safeAmbulanceId = ambulanceId; // narrowed by guard above

    const interval = setInterval(() => {
      const point = MOCK_ROUTE[stepRef.current % MOCK_ROUTE.length];
      if (!point) return;

      setLocation({
        lat: point.lat,
        lng: point.lng,
        accuracy: 5,
        heading: 315,
        speed: 8.3,
        error: null,
        isTracking: true,
      });

      sendLocation({
        ambulanceId: safeAmbulanceId,
        lat: point.lat,
        lng: point.lng,
        heading: 315,
        speed: 8.3,
      });

      stepRef.current += 1;
    }, 3000);

    return () => clearInterval(interval);
  // MOCK_ROUTE is module-level — not a dep. sendLocation is stable via useCallback.
  }, [enabled, emergencyId, ambulanceId, sendLocation]);

  return location;
}