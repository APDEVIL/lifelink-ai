"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TriageBadge, type TriagePriority } from "./triage-badge";
import { cn } from "@/lib/utils";
import { Activity, Thermometer, Droplets, Brain, Heart } from "lucide-react";

interface VitalsFormProps {
  emergencyId: string;
  patientId?: string;
  currentPriority?: TriagePriority;
  onSubmit?: () => void;
}

interface VitalsState {
  systolic: string;
  diastolic: string;
  heartRate: string;
  spo2: string;
  gcs: string;
  temperature: string;
}

const INITIAL: VitalsState = {
  systolic: "",
  diastolic: "",
  heartRate: "",
  spo2: "",
  gcs: "",
  temperature: "",
};

function deriveAutoTriage(v: VitalsState): TriagePriority | null {
  const hr = Number(v.heartRate);
  const spo2 = Number(v.spo2);
  const gcs = Number(v.gcs);
  if (!hr || !spo2 || !gcs) return null;
  if (spo2 < 90 || hr > 140 || hr < 40 || gcs <= 8) return "P1";
  if (spo2 < 94 || hr > 120 || gcs <= 12) return "P2";
  if (gcs >= 13 && spo2 >= 94 && hr <= 120) return "P3";
  return "P2";
}

const FIELD_META = [
  {
    group: "Blood Pressure",
    icon: Activity,
    color: "text-red-400",
    fields: [
      { key: "systolic" as keyof VitalsState, label: "Systolic", unit: "mmHg", placeholder: "120", min: 40, max: 250 },
      { key: "diastolic" as keyof VitalsState, label: "Diastolic", unit: "mmHg", placeholder: "80", min: 20, max: 150 },
    ],
  },
  {
    group: "Heart Rate",
    icon: Heart,
    color: "text-pink-400",
    fields: [
      { key: "heartRate" as keyof VitalsState, label: "HR", unit: "bpm", placeholder: "72", min: 0, max: 300 },
    ],
  },
  {
    group: "Oxygen Saturation",
    icon: Droplets,
    color: "text-sky-400",
    fields: [
      { key: "spo2" as keyof VitalsState, label: "SpO₂", unit: "%", placeholder: "98", min: 0, max: 100 },
    ],
  },
  {
    group: "Glasgow Coma Scale",
    icon: Brain,
    color: "text-violet-400",
    fields: [
      { key: "gcs" as keyof VitalsState, label: "GCS", unit: "/15", placeholder: "15", min: 3, max: 15 },
    ],
  },
  {
    group: "Temperature",
    icon: Thermometer,
    color: "text-amber-400",
    fields: [
      { key: "temperature" as keyof VitalsState, label: "Temp", unit: "°C", placeholder: "37.0", min: 30, max: 44 },
    ],
  },
];

export function VitalsForm({ emergencyId, patientId, currentPriority, onSubmit }: VitalsFormProps) {
  const [vitals, setVitals] = useState<VitalsState>(INITIAL);
  const [selectedPriority, setSelectedPriority] = useState<TriagePriority | undefined>(currentPriority);

  const updateVitals = api.triage.updateVitals.useMutation();
  const assignTriage = api.triage.assign.useMutation();

  const autoTriage = deriveAutoTriage(vitals);
  const effectivePriority = selectedPriority ?? autoTriage ?? undefined;

  const handleChange = (key: keyof VitalsState, value: string) => {
    setVitals((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    const payload = {
      emergencyId,
      ...(patientId && { patientId }),
      systolicBp: Number(vitals.systolic),
      diastolicBp: Number(vitals.diastolic),
      heartRate: Number(vitals.heartRate),
      spo2: Number(vitals.spo2),
      gcs: Number(vitals.gcs),
      temperature: vitals.temperature ? Number(vitals.temperature) : undefined,
    };

    await updateVitals.mutateAsync(payload);

    if (effectivePriority) {
      await assignTriage.mutateAsync({ emergencyId, priority: effectivePriority });
    }

    onSubmit?.();
  };

  const isLoading = updateVitals.isPending || assignTriage.isPending;

  return (
    <Card className="bg-zinc-900/90 border-zinc-700/50 text-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-zinc-300 tracking-widest uppercase">
            Vitals Entry
          </CardTitle>
          {effectivePriority && (
            <div className="flex items-center gap-2">
              {autoTriage && !selectedPriority && (
                <span className="text-xs text-zinc-500">Auto</span>
              )}
              <TriageBadge priority={effectivePriority} showLabel size="sm" pulse={effectivePriority === "P1"} />
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Vitals grid */}
        <div className="grid grid-cols-2 gap-3">
          {FIELD_META.map(({ group, icon: Icon, color, fields }) => (
            <div
              key={group}
              className={cn(
                "rounded-lg bg-zinc-800/60 border border-zinc-700/40 p-3",
                fields.length > 1 && "col-span-2"
              )}
            >
              <div className={cn("flex items-center gap-1.5 mb-2 text-xs font-medium", color)}>
                <Icon className="w-3 h-3" />
                {group}
              </div>
              <div className={cn("flex gap-2", fields.length > 1 && "grid grid-cols-2")}>
                {fields.map((f) => (
                  <div key={f.key} className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder={f.placeholder}
                      min={f.min}
                      max={f.max}
                      value={vitals[f.key]}
                      onChange={(e) => handleChange(f.key, e.target.value)}
                      className="bg-zinc-900 border-zinc-600 text-white placeholder:text-zinc-600 h-9 text-sm w-full"
                    />
                    <span className="text-xs text-zinc-500 whitespace-nowrap">{f.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Manual triage override */}
        <div>
          <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Override Triage</p>
          <div className="flex gap-2">
            {(["P1", "P2", "P3", "P4"] as TriagePriority[]).map((p) => (
              <button
                key={p}
                onClick={() => setSelectedPriority(selectedPriority === p ? undefined : p)}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-xs font-mono font-bold border transition-all",
                  selectedPriority === p
                    ? "border-white/40 bg-white/10"
                    : "border-zinc-700 bg-transparent opacity-50 hover:opacity-80"
                )}
              >
                <TriageBadge priority={p} size="sm" />
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={isLoading}
          className="w-full bg-lime-400 hover:bg-lime-300 text-black font-semibold h-10"
        >
          {isLoading ? "Saving…" : "Record Vitals & Assign Triage"}
        </Button>

        {(updateVitals.isSuccess || assignTriage.isSuccess) && (
          <p className="text-xs text-lime-400 text-center">✓ Vitals recorded</p>
        )}
      </CardContent>
    </Card>
  );
}
