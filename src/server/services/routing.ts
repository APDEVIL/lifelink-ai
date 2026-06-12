// services/routing.ts
// Free tier: 2000 requests/day — enough for a hackathon
// Sign up at: https://openrouteservice.org/dev/#/signup

const ORS_BASE = "https://api.openrouteservice.org/v2";
const ORS_API_KEY = process.env.ORS_API_KEY ?? "";

export interface Coord {
  lat: number;
  lng: number;
}

export interface RouteResult {
  distanceKm: number;
  durationMinutes: number;
  polyline: Coord[]; // decoded GPS points along the route
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

// ─── Get driving route between two points ────────────────────────────────────

export async function getRoute(from: Coord, to: Coord): Promise<RouteResult> {
  const body = {
    coordinates: [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
    profile: "driving-car",
    format: "geojson",
    instructions: false,
    geometry: true,
  };

  const res = await fetch(`${ORS_BASE}/directions/driving-car/geojson`, {
    method: "POST",
    headers: {
      Authorization: ORS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ORS routing error: ${res.status} — ${text}`);
  }

  const data = (await res.json()) as {
    features: Array<{
      geometry: { coordinates: [number, number][] };
      properties: {
        summary: { distance: number; duration: number };
        bbox: [number, number, number, number];
      };
    }>;
  };

  const feature = data.features[0];
  if (!feature) throw new Error("No route found");

  const coords: Coord[] = feature.geometry.coordinates.map(([lng, lat]) => ({
    lat,
    lng,
  }));

  return {
    distanceKm: feature.properties.summary.distance / 1000,
    durationMinutes: feature.properties.summary.duration / 60,
    polyline: coords,
    bbox: feature.properties.bbox,
  };
}

// ─── Get straight-line distance (Haversine) ──────────────────────────────────

export function haversineKm(a: Coord, b: Coord): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const c =
    2 *
    Math.asin(
      Math.sqrt(
        sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng
      )
    );
  return R * c;
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

// ─── Find which signals lie within Xm of a route polyline ───────────────────

export function signalsOnRoute(
  polyline: Coord[],
  signalCoords: Array<{ id: string; lat: number; lng: number; roadLinkId: string }>,
  thresholdKm = 0.1 // 100m
): string[] {
  const onRoute: string[] = [];

  for (const signal of signalCoords) {
    const sig: Coord = { lat: signal.lat, lng: signal.lng };
    const onPath = polyline.some((point) => haversineKm(point, sig) <= thresholdKm);
    if (onPath) {
      onRoute.push(signal.id);
    }
  }

  return onRoute;
}

// ─── Check if ambulance is within Xm of a coord ─────────────────────────────

export function isWithinRadius(
  ambulance: Coord,
  target: Coord,
  radiusKm: number
): boolean {
  return haversineKm(ambulance, target) <= radiusKm;
}

// ─── ETA string formatter ────────────────────────────────────────────────────

export function formatEta(minutes: number): string {
  if (minutes < 1) return "< 1 min";
  const m = Math.round(minutes);
  return `${m} min`;
}
