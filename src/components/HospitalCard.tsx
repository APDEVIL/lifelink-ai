"use client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type ScoredHospital = {
  hospitalId: string;
  name: string;
  address: string;
  score: number;
  distanceKm: number;
  etaMinutes: number;
  icuAvailable: number;
  generalAvailable: number;
  currentLoad: number;
  specialistsOnDuty: string[];
  reasons: string[];
  disqualified: boolean;
  disqualifyReason?: string | null;
};

type Props = {
  hospital: ScoredHospital;
  rank: number;
  selected?: boolean;
  onSelect?: () => void;
};

export function HospitalCard({ hospital: h, rank, selected, onSelect }: Props) {
  const scoreColor =
    h.score >= 70 ? "text-green-400" : h.score >= 40 ? "text-amber-400" : "text-red-400";
  const loadColor =
    h.currentLoad > 80
      ? "text-red-400"
      : h.currentLoad > 50
        ? "text-amber-400"
        : "text-green-400";

  return (
    <button
      className={cn(
        "card-surface w-full p-4 text-left transition-all",
        selected && "border-blue-500/50 bg-blue-500/5",
        h.disqualified && "cursor-not-allowed opacity-40",
        !h.disqualified && "cursor-pointer hover:border-zinc-600",
      )}
      disabled={h.disqualified}
      type="button"
      onClick={onSelect}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="mono text-xs font-bold text-zinc-600">#{rank}</span>
          <div>
            <p className="text-sm font-semibold leading-tight text-white">{h.name}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{h.address}</p>
          </div>
        </div>
        <div className="ml-3 flex-shrink-0 text-right">
          <div className={cn("mono text-2xl font-black leading-none", scoreColor)}>
            {Math.round(h.score)}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-600">score</div>
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-3 grid grid-cols-4 gap-2">
        <Stat label="ETA" value={`${h.etaMinutes}m`} />
        <Stat label="Dist" value={`${h.distanceKm.toFixed(1)}km`} />
        <Stat
          color={h.icuAvailable > 0 ? "text-green-400" : "text-red-400"}
          label="ICU"
          value={String(h.icuAvailable)}
        />
        <Stat color={loadColor} label="Load" value={`${h.currentLoad}%`} />
      </div>

      {/* Specialists */}
      {h.specialistsOnDuty.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {h.specialistsOnDuty.slice(0, 4).map((s) => (
            <Badge
              className="border-zinc-700 px-1.5 py-0 text-[10px] text-zinc-400"
              key={s}
              variant="outline"
            >
              {s}
            </Badge>
          ))}
        </div>
      )}

      {/* Reasons / disqualify */}
      {h.disqualified ? (
        <p className="text-xs text-red-400">{h.disqualifyReason}</p>
      ) : (
        <div className="space-y-0.5">
          {h.reasons.slice(0, 2).map((r, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static list, no reorder
            <p className="text-xs text-zinc-500" key={i}>
              ✓ {r}
            </p>
          ))}
        </div>
      )}
    </button>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <div className={cn("mono text-sm font-bold text-white", color)}>{value}</div>
      <div className="text-[10px] uppercase text-zinc-600">{label}</div>
    </div>
  );
}