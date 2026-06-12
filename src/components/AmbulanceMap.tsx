"use client";
import { useEffect, useRef } from "react";
import { usePusher, type AmbulanceLocationPayload, type SignalPayload } from "@/lib/pusher";

// Leaflet loaded dynamically (SSR-safe)
type LeafletMap = {
  setView: (latlng: [number, number], zoom: number) => void;
  remove: () => void;
};

type Props = {
  emergencyId: string;
  emergencyLat: number;
  emergencyLng: number;
  hospitalLat?: number;
  hospitalLng?: number;
  ambulanceLat?: number;
  ambulanceLng?: number;
  signals?: Array<{ id: string; lat: number; lng: number; state: string; junctionName: string }>;
};

export function AmbulanceMap({
  emergencyId,
  emergencyLat,
  emergencyLng,
  hospitalLat,
  hospitalLng,
  ambulanceLat,
  ambulanceLng,
  signals = [],
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const ambulanceMarkerRef = useRef<unknown>(null);
  const signalMarkersRef = useRef<Record<string, unknown>>({});

  // ─── Effect 1: One-time map init ───────────────────────────────────────────
  // Creates the map, tile layer, zoom control, and static markers
  // (emergency + hospital). Re-runs only if the core location props change.
  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;
    let destroyed = false;

    import("leaflet").then((L) => {
      if (destroyed || !containerRef.current) return;

      // Fix default icon path
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current!, { zoomControl: false }).setView(
        [emergencyLat, emergencyLng],
        14
      );
      mapRef.current = map as unknown as LeafletMap;

      // Dark tile layer
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "©OpenStreetMap ©CartoDB",
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Emergency marker (pulsing red dot)
      const emgIcon = L.divIcon({
        html: `<div style="width:16px;height:16px;background:#ef4444;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 3px #ef444460;animation:ping 1.5s ease-in-out infinite;"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        className: "",
      });
      L.marker([emergencyLat, emergencyLng], { icon: emgIcon })
        .addTo(map)
        .bindPopup("🆘 Emergency Location");

      // Hospital marker
      if (hospitalLat && hospitalLng) {
        const hospIcon = L.divIcon({
          html: `<div style="width:20px;height:20px;background:#3b82f6;border-radius:4px;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;">🏥</div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
          className: "",
        });
        L.marker([hospitalLat, hospitalLng], { icon: hospIcon })
          .addTo(map)
          .bindPopup("🏥 Assigned Hospital");
      }
    });

    return () => {
      destroyed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      ambulanceMarkerRef.current = null;
      signalMarkersRef.current = {};
    };
  }, [emergencyLat, emergencyLng, hospitalLat, hospitalLng]);

  // ─── Effect 2: Initial ambulance marker ────────────────────────────────────
  // Places the ambulance marker when coords first become available.
  // Live GPS movement is handled by the usePusher hook below.
  useEffect(() => {
    if (!ambulanceLat || !ambulanceLng) return;
    if (typeof window === "undefined") return;

    import("leaflet").then((L) => {
      if (!mapRef.current) return;

      const ambIcon = L.divIcon({
        html: `<div style="width:24px;height:24px;background:#22c55e;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:13px;">🚑</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        className: "",
      });

      if (ambulanceMarkerRef.current) {
        // Update existing marker position instead of recreating
        (
          ambulanceMarkerRef.current as { setLatLng: (ll: [number, number]) => void }
        ).setLatLng([ambulanceLat, ambulanceLng]);
      } else {
        ambulanceMarkerRef.current = L.marker([ambulanceLat, ambulanceLng], { icon: ambIcon })
          .addTo(mapRef.current as unknown as import("leaflet").Map)
          .bindPopup("🚑 Ambulance");
      }
    });
  }, [ambulanceLat, ambulanceLng]);

  // ─── Effect 3: Signal markers ───────────────────────────────────────────────
  // Adds/refreshes traffic signal markers whenever the signals array changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!signals.length) return;

    import("leaflet").then((L) => {
      if (!mapRef.current) return;

      signals.forEach((sig) => {
        const color =
          sig.state === "green" ? "#22c55e" : sig.state === "amber" ? "#f59e0b" : "#ef4444";

        // If marker already exists, just update its icon color
        if (signalMarkersRef.current[sig.id]) {
          const marker = signalMarkersRef.current[sig.id] as {
            getElement?: () => HTMLElement | null;
          };
          const el = marker.getElement?.()?.querySelector("div") as HTMLElement | null;
          if (el) el.style.background = color;
          return;
        }

        // Otherwise create a new marker
        const sigIcon = L.divIcon({
          html: `<div style="width:10px;height:10px;background:${color};border-radius:50%;border:2px solid #fff;"></div>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
          className: "",
        });

        signalMarkersRef.current[sig.id] = L.marker([sig.lat, sig.lng], { icon: sigIcon })
          .addTo(mapRef.current as unknown as import("leaflet").Map)
          .bindPopup(`🚦 ${sig.junctionName}`);
      });
    });
  }, [signals]);

  // ─── Live ambulance GPS updates (Pusher) ───────────────────────────────────
  usePusher<AmbulanceLocationPayload>(
    `emergency-${emergencyId}`,
    "ambulance:location",
    async ({ lat, lng }) => {
      const L = await import("leaflet");
      if (ambulanceMarkerRef.current) {
        (ambulanceMarkerRef.current as { setLatLng: (ll: [number, number]) => void }).setLatLng([
          lat,
          lng,
        ]);
      } else if (mapRef.current) {
        const ambIcon = L.divIcon({
          html: `<div style="width:24px;height:24px;background:#22c55e;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:13px;">🚑</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
          className: "",
        });
        ambulanceMarkerRef.current = L.marker([lat, lng], { icon: ambIcon }).addTo(
          mapRef.current as unknown as import("leaflet").Map
        );
      }
    },
    !!emergencyId
  );

  // ─── Signal state updates (Pusher) ─────────────────────────────────────────
  usePusher<SignalPayload>(
    `emergency-${emergencyId}`,
    "signal:green",
    async ({ signalId }) => {
      const marker = signalMarkersRef.current[signalId] as
        | { getElement?: () => HTMLElement | null }
        | undefined;
      const el = marker?.getElement?.()?.querySelector("div") as HTMLElement | null;
      if (el) el.style.background = "#22c55e";
    },
    !!emergencyId
  );

  usePusher<SignalPayload>(
    `emergency-${emergencyId}`,
    "signal:red",
    async ({ signalId }) => {
      const marker = signalMarkersRef.current[signalId] as
        | { getElement?: () => HTMLElement | null }
        | undefined;
      const el = marker?.getElement?.()?.querySelector("div") as HTMLElement | null;
      if (el) el.style.background = "#ef4444";
    },
    !!emergencyId
  );

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>{`@keyframes ping{0%,100%{box-shadow:0 0 0 3px #ef444460}50%{box-shadow:0 0 0 8px #ef444420}}`}</style>
      <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden" />
    </>
  );
}