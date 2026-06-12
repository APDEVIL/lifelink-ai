"use client";
import { useState } from "react";
import { api } from "@/trpc/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Vitals = {
  bpSystolic?: number;
  bpDiastolic?: number;
  heartRate?: number;
  spo2?: number;
  gcs?: number;
  temperature?: number;
  glucoseLevel?: number;
  stepsTaken?: string[];
};

type Props = {
  emergencyId: string;
  paramedicName: string;
  likelyCause: string;
  hospitalId?: string;
  triageId?: string;
  onDone?: (result: { priority: string; aiSummary?: string | null }) => void;
};

const GCS_LABELS = [
  "None", "None", "None", "Severe", "Severe", "Severe", "Severe", "Severe",
  "Moderate", "Moderate", "Moderate", "Moderate", "Mild", "Mild", "Normal", "Normal",
];
const STEPS = [
  "Airway cleared", "O₂ applied", "IV access", "CPR started",
  "Bleeding controlled", "Defibrillation", "Immobilization", "Glucose given",
];

export function VitalsForm({
  emergencyId, paramedicName, likelyCause, hospitalId, triageId, onDone,
}: Props) {
  const [vitals, setVitals] = useState<Vitals>({});
  const [steps, setSteps] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const assignMutation = api.triage.assign.useMutation();
  const updateMutation = api.triage.updateVitals.useMutation();

  const num = (v: string) => (v === "" ? undefined : Number(v));

  function toggleStep(s: string) {
    setSteps((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function submit() {
    setLoading(true);
    try {
      const payload = { ...vitals, stepsTaken: steps };
      if (triageId) {
        await updateMutation.mutateAsync({ emergencyId, triageId, vitals: payload, hospitalId });
        toast.success("Vitals updated and pushed to hospital");
        onDone?.({ priority: "—" });
      } else {
        const result = await assignMutation.mutateAsync({
          emergencyId, vitals: payload, likelyCause, recordedBy: paramedicName, hospitalId,
        });
        toast.success(`Triage assigned: ${result.priority} — ${result.priorityLabel}`);
        onDone?.(result);
      }
    } catch {
      toast.error("Failed to submit vitals");
    } finally {
      setLoading(false);
    }
  }

  const gcsVal = vitals.gcs ?? 0;

  return (
    <div className="space-y-5">
      {/* BP + HR row */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500" htmlFor="bp-systolic">
            BP Systolic
          </label>
          <Input
            className="border-[#27272a] bg-[#0a0a0b]"
            id="bp-systolic"
            placeholder="120"
            onChange={(e) => setVitals((v) => ({ ...v, bpSystolic: num(e.target.value) }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500" htmlFor="bp-diastolic">
            BP Diastolic
          </label>
          <Input
            className="border-[#27272a] bg-[#0a0a0b]"
            id="bp-diastolic"
            placeholder="80"
            onChange={(e) => setVitals((v) => ({ ...v, bpDiastolic: num(e.target.value) }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500" htmlFor="heart-rate">
            Heart Rate
          </label>
          <Input
            className="border-[#27272a] bg-[#0a0a0b]"
            id="heart-rate"
            placeholder="72"
            onChange={(e) => setVitals((v) => ({ ...v, heartRate: num(e.target.value) }))}
          />
        </div>
      </div>

      {/* SpO2 + Temp + Glucose */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500" htmlFor="spo2">
            SpO₂ %
          </label>
          <Input
            className="border-[#27272a] bg-[#0a0a0b]"
            id="spo2"
            placeholder="98"
            onChange={(e) => setVitals((v) => ({ ...v, spo2: num(e.target.value) }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500" htmlFor="temperature">
            Temp °C
          </label>
          <Input
            className="border-[#27272a] bg-[#0a0a0b]"
            id="temperature"
            placeholder="37.0"
            onChange={(e) => setVitals((v) => ({ ...v, temperature: num(e.target.value) }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500" htmlFor="glucose">
            Glucose mmol/L
          </label>
          <Input
            className="border-[#27272a] bg-[#0a0a0b]"
            id="glucose"
            placeholder="5.5"
            onChange={(e) => setVitals((v) => ({ ...v, glucoseLevel: num(e.target.value) }))}
          />
        </div>
      </div>

      {/* GCS slider */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs text-zinc-500" htmlFor="gcs">
            GCS Score
          </label>
          <span
            className={cn(
              "mono text-sm font-bold",
              gcsVal >= 13 ? "text-green-400" : gcsVal >= 9 ? "text-amber-400" : "text-red-400",
            )}
          >
            {gcsVal || "—"}{" "}
            {gcsVal > 0 && (
              <span className="font-normal text-zinc-500">
                / 15 · {GCS_LABELS[gcsVal]}
              </span>
            )}
          </span>
        </div>
        <input
          className="w-full accent-red-500"
          id="gcs"
          max={15}
          min={3}
          type="range"
          value={vitals.gcs ?? 3}
          onChange={(e) => setVitals((v) => ({ ...v, gcs: Number(e.target.value) }))}
        />
      </div>

      {/* Steps taken */}
      <div>
        <p className="mb-2 block text-xs text-zinc-500">Steps Taken On Scene</p>
        <div className="flex flex-wrap gap-2">
          {STEPS.map((s) => (
            <button
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                steps.includes(s)
                  ? "border-blue-500/40 bg-blue-500/20 text-blue-300"
                  : "border-[#27272a] bg-transparent text-zinc-500 hover:border-zinc-500",
              )}
              key={s}
              type="button"
              onClick={() => toggleStep(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <Button
        className="w-full bg-red-600 font-semibold text-white hover:bg-red-700"
        disabled={loading}
        type="button"
        onClick={submit}
      >
        {loading
          ? "Submitting to AI…"
          : triageId
            ? "Push Vitals Update"
            : "Assign Triage (AI Classification)"}
      </Button>
    </div>
  );
}