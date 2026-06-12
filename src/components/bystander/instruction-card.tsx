// components/bystander/instruction-card.tsx
// Large-text instruction card for the bystander copilot.
// Designed to be readable at arm's length in a panic situation.
// Urgent steps pulse red; normal steps show in white.

"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface InstructionCardProps {
  instruction: string;
  stepNumber: number;
  isUrgent: boolean;
  emergencyType: string;
  isLoading?: boolean;
  className?: string;
}

const EMERGENCY_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  cardiac_arrest: { label: "Cardiac Arrest", color: "text-red-400 border-red-500/40" },
  choking:        { label: "Choking",        color: "text-orange-400 border-orange-500/40" },
  bleeding:       { label: "Severe Bleeding", color: "text-red-400 border-red-500/40" },
  stroke:         { label: "Stroke",         color: "text-purple-400 border-purple-500/40" },
  seizure:        { label: "Seizure",        color: "text-yellow-400 border-yellow-500/40" },
  unconscious:    { label: "Unconscious",    color: "text-red-400 border-red-500/40" },
  breathing_difficulty: { label: "Breathing Difficulty", color: "text-blue-400 border-blue-500/40" },
  unknown:        { label: "Emergency",      color: "text-slate-400 border-slate-500/40" },
};

export function InstructionCard({
  instruction,
  stepNumber,
  isUrgent,
  emergencyType,
  isLoading = false,
  className,
}: InstructionCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const meta = EMERGENCY_TYPE_LABELS[emergencyType] ?? EMERGENCY_TYPE_LABELS.unknown!;

  // Scroll into view on new instruction
  useEffect(() => {
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [instruction]);

  return (
    <div
      ref={cardRef}
      className={cn(
        "relative rounded-2xl border-2 p-6 transition-all duration-300",
        isUrgent
          ? "border-red-500/70 bg-red-950/30 shadow-[0_0_30px_rgba(239,68,68,0.15)]"
          : "border-slate-700/60 bg-slate-900/80",
        isLoading && "opacity-60",
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={`Step ${stepNumber}: ${instruction}`}
    >
      {/* Urgent pulse ring */}
      {isUrgent && !isLoading && (
        <span className="absolute inset-0 rounded-2xl border-2 border-red-500/40 animate-ping pointer-events-none" />
      )}

      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className={cn("flex items-center gap-2 text-xs font-semibold uppercase tracking-widest border rounded-full px-3 py-1", meta.color)}>
          <span>{meta.label}</span>
        </div>

        <div className={cn(
          "flex items-center gap-1.5 text-xs font-mono",
          isUrgent ? "text-red-400" : "text-slate-500"
        )}>
          {isUrgent && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />}
          <span>STEP {stepNumber}</span>
        </div>
      </div>

      {/* Main instruction — large text for easy reading */}
      {isLoading ? (
        <div className="space-y-3">
          <div className="h-7 bg-slate-800 rounded-lg animate-pulse w-3/4" />
          <div className="h-7 bg-slate-800 rounded-lg animate-pulse w-full" />
          <div className="h-7 bg-slate-800 rounded-lg animate-pulse w-1/2" />
        </div>
      ) : (
        <p className={cn(
          "text-2xl font-medium leading-snug tracking-tight",
          isUrgent ? "text-red-100" : "text-white"
        )}>
          {instruction}
        </p>
      )}

      {/* Urgent warning strip */}
      {isUrgent && !isLoading && (
        <div className="mt-4 flex items-center gap-2 text-xs text-red-400 bg-red-950/50 rounded-lg px-3 py-2">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>ACT NOW — ambulance is on the way</span>
        </div>
      )}
    </div>
  );
}
