import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatRelative(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function severityColor(s: string) {
  return s === "CRITICAL" ? "text-red-400"
    : s === "HIGH" ? "text-orange-400"
    : s === "MEDIUM" ? "text-amber-400"
    : "text-green-400";
}

export function statusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function priorityClass(p: "P1" | "P2" | "P3") {
  return p === "P1" ? "p1" : p === "P2" ? "p2" : "p3";
}

export function roleIcon(role: string) {
  const icons: Record<string, string> = {
    system: "⚙", commander: "🎖", ambulance: "🚑",
    hospital: "🏥", paramedic: "💊", bystander: "👤",
    traffic: "🚦", family: "👨‍👩‍👧",
  };
  return icons[role] ?? "•";
}