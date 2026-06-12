import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { TriagePriority } from "@/components/triage/triage-badge";

// ─── shadcn standard ──────────────────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── ETA formatting ───────────────────────────────────────────────────────────
/**
 * formatEta(8)   → "8 min"
 * formatEta(0)   → "Arriving"
 * formatEta(65)  → "1h 5min"
 */
export function formatEta(minutes: number): string {
  if (minutes <= 0) return "Arriving";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

/**
 * formatEtaSeconds(90)  → "1:30"
 * formatEtaSeconds(65)  → "1:05"
 */
export function formatEtaSeconds(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0:00";
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Triage priority helpers ──────────────────────────────────────────────────
const PRIORITY_COLORS: Record<TriagePriority, string> = {
  P1: "#f87171",   // red-400
  P2: "#fb923c",   // orange-400
  P3: "#facc15",   // yellow-400
  P4: "#71717a",   // zinc-500
};

const PRIORITY_BG: Record<TriagePriority, string> = {
  P1: "bg-red-950/80 text-red-300 border-red-500/60",
  P2: "bg-orange-950/80 text-orange-300 border-orange-500/60",
  P3: "bg-yellow-950/80 text-yellow-300 border-yellow-500/60",
  P4: "bg-zinc-900/80 text-zinc-400 border-zinc-600/60",
};

/** Returns hex color string for a priority.
 *  FIX: param narrowed to TriagePriority — Record<TriagePriority, string>
 *  is exhaustive, so the lookup always returns string. No ?? fallback needed.
 */
export function priorityColor(priority: TriagePriority): string {
  return PRIORITY_COLORS[priority];
}

/** Returns Tailwind class string for a priority badge.
 *  FIX: same exhaustive-Record pattern — fallback removed.
 */
export function priorityBgClass(priority: TriagePriority): string {
  return PRIORITY_BG[priority];
}

/** Derives triage priority from raw vitals */
export function deriveTriagePriority(vitals: {
  heartRate?: number;
  spo2?: number;
  gcs?: number;
  systolicBp?: number;
}): TriagePriority {
  const { heartRate: hr, spo2, gcs, systolicBp: sbp } = vitals;
  if (
    (spo2 !== undefined && spo2 < 90) ||
    (hr !== undefined && (hr > 140 || hr < 40)) ||
    (gcs !== undefined && gcs <= 8) ||
    (sbp !== undefined && (sbp > 200 || sbp < 70))
  ) return "P1";

  if (
    (spo2 !== undefined && spo2 < 94) ||
    (hr !== undefined && (hr > 120 || hr < 50)) ||
    (gcs !== undefined && gcs <= 12)
  ) return "P2";

  if (gcs !== undefined && gcs >= 13 && (spo2 === undefined || spo2 >= 94))
    return "P3";

  return "P2";
}

// ─── Distance / geo ───────────────────────────────────────────────────────────
/**
 * Haversine distance between two lat/lng points in km.
 */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/** Rough ETA in minutes given distance in km and average speed in km/h */
export function etaMinutes(distanceKm: number, avgSpeedKmh = 40): number {
  return Math.ceil((distanceKm / avgSpeedKmh) * 60);
}

// ─── Time helpers ─────────────────────────────────────────────────────────────
/** "2 min ago", "just now", "5h ago" */
export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 10) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString("en-IN");
}

/** HH:MM:SS */
export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Elapsed seconds → "4m 12s" */
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

// ─── String helpers ───────────────────────────────────────────────────────────
/** "TN09AB1234" → "TN·09·AB·1234" for readable display */
export function formatPlate(plate: string): string {
  return plate.replace(/([A-Z]{2})(\d{2})([A-Z]{1,3})(\d{1,4})/, "$1·$2·$3·$4");
}

/** Truncate with ellipsis */
export function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str;
}

/** Capitalize first letter of each word */
export function titleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Blood group helpers ──────────────────────────────────────────────────────
const COMPATIBLE_DONORS: Record<string, string[]> = {
  "O-":  ["O-"],
  "O+":  ["O-", "O+"],
  "A-":  ["O-", "A-"],
  "A+":  ["O-", "O+", "A-", "A+"],
  "B-":  ["O-", "B-"],
  "B+":  ["O-", "O+", "B-", "B+"],
  "AB-": ["O-", "A-", "B-", "AB-"],
  "AB+": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
};

/** Returns compatible donor blood groups for a recipient */
export function compatibleDonors(recipientGroup: string): string[] {
  return COMPATIBLE_DONORS[recipientGroup] ?? [];
}

/** Returns true if the hospital has enough compatible blood */
export function hasCompatibleBlood(
  bloodBank: Record<string, number>,
  recipientGroup: string,
  minUnits = 2
): boolean {
  const donors = compatibleDonors(recipientGroup);
  return donors.some((d) => (bloodBank[d] ?? 0) >= minUnits);
}