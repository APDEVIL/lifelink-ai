"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TriageBadge, type TriagePriority } from "./triage-badge";
import { cn } from "@/lib/utils";
import { Activity, Droplets, Brain, Heart, Thermometer, TrendingDown, TrendingUp, Minus } from "lucide-react";

export interface Vitals {
  systolicBp?: number;
  diastolicBp?: number;
  heartRate?: number;
  spo2?: number;
  gcs?: number;
  temperature?: number;
  priority?: TriagePriority;
  recordedAt?: string;
}

interface VitalsDisplayProps {
  vitals: Vitals;
  previousVitals?: Vitals;
  className?: string;
}

function isCritical(vitals: Vitals): boolean {
  return (
    (vitals.spo2 !== undefined && vitals.spo2 < 90) ||
    (vitals.heartRate !== undefined && (vitals.heartRate > 140 || vitals.heartRate < 40)) ||
    (vitals.gcs !== undefined && vitals.gcs <= 8)
  );
}

function Trend({ current, previous }: { current?: number; previous?: number }) {
  if (!current || !previous) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 2) return <Minus className="w-3 h-3 text-zinc-500" />;
  return diff > 0
    ? <TrendingUp className="w-3 h-3 text-red-400" />
    : <TrendingDown className="w-3 h-3 text-sky-400" />;
}

interface MetricProps {
  icon: React.ElementType;
  label: string;
  value: string | undefined;
  unit: string;
  iconColor: string;
  critical?: boolean;
  previous?: number;
  current?: number;
}

function Metric({ icon: Icon, label, value, unit, iconColor, critical, previous, current }: MetricProps) {
  return (
    <div
      className={cn(
        "rounded-lg p-3 flex flex-col gap-1 border transition-colors",
        critical
          ? "bg-red-950/50 border-red-500/50 animate-pulse"
          : "bg-zinc-800/50 border-zinc-700/30"
      )}
    >
      <div className={cn("flex items-center justify-between")}>
        <div className={cn("flex items-center gap-1.5 text-xs text-zinc-400")}>
          <Icon className={cn("w-3 h-3", iconColor)} />
          {label}
        </div>
        <Trend current={current} previous={previous} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-xl font-bold tabular-nums", critical ? "text-red-300" : "text-white")}>
          {value ?? "—"}
        </span>
        <span className="text-xs text-zinc-500">{unit}</span>
      </div>
    </div>
  );
}

export function VitalsDisplay({ vitals, previousVitals, className }: VitalsDisplayProps) {
  const critical = isCritical(vitals);
  const [flash, setFlash] = useState(false);
  const prevRef = useRef(vitals);

  useEffect(() => {
    if (vitals !== prevRef.current) {
      setFlash(true);
      prevRef.current = vitals;
      const t = setTimeout(() => setFlash(false), 600);
      return () => clearTimeout(t);
    }
  }, [vitals]);

  const bpValue =
    vitals.systolicBp && vitals.diastolicBp
      ? `${vitals.systolicBp}/${vitals.diastolicBp}`
      : undefined;

  const bpCritical =
    !!vitals.systolicBp && (vitals.systolicBp > 180 || vitals.systolicBp < 80);

  return (
    <Card
      className={cn(
        "border transition-all duration-300",
        critical
          ? "bg-red-950/30 border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.15)]"
          : "bg-zinc-900/80 border-zinc-700/50",
        flash && "ring-2 ring-lime-400/60",
        className
      )}
    >
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Live Vitals
            </span>
            {critical && (
              <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded font-bold animate-pulse">
                CRITICAL
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {vitals.priority && (
              <TriageBadge priority={vitals.priority} pulse={vitals.priority === "P1"} size="sm" />
            )}
            {vitals.recordedAt && (
              <span className="text-xs text-zinc-600">
                {new Date(vitals.recordedAt).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}
          </div>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-2">
          <Metric
            icon={Activity}
            label="Blood Pressure"
            value={bpValue}
            unit="mmHg"
            iconColor="text-red-400"
            critical={bpCritical}
            current={vitals.systolicBp}
            previous={previousVitals?.systolicBp}
          />
          <Metric
            icon={Heart}
            label="Heart Rate"
            value={vitals.heartRate?.toString()}
            unit="bpm"
            iconColor="text-pink-400"
            critical={!!vitals.heartRate && (vitals.heartRate > 140 || vitals.heartRate < 40)}
            current={vitals.heartRate}
            previous={previousVitals?.heartRate}
          />
          <Metric
            icon={Droplets}
            label="SpO₂"
            value={vitals.spo2?.toString()}
            unit="%"
            iconColor="text-sky-400"
            critical={!!vitals.spo2 && vitals.spo2 < 90}
            current={vitals.spo2}
            previous={previousVitals?.spo2}
          />
          <Metric
            icon={Brain}
            label="GCS"
            value={vitals.gcs?.toString()}
            unit="/15"
            iconColor="text-violet-400"
            critical={!!vitals.gcs && vitals.gcs <= 8}
            current={vitals.gcs}
            previous={previousVitals?.gcs}
          />
          {vitals.temperature && (
            <Metric
              icon={Thermometer}
              label="Temperature"
              value={vitals.temperature.toFixed(1)}
              unit="°C"
              iconColor="text-amber-400"
              critical={vitals.temperature > 39 || vitals.temperature < 35}
              current={vitals.temperature}
              previous={previousVitals?.temperature}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
