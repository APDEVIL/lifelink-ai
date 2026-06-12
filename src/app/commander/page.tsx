"use client";
import { useState } from "react";
import { api } from "@/trpc/react";
import { usePusher } from "@/lib/pusher";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { HospitalCard } from "@/components/HospitalCard";
import { EmergencyTimeline } from "@/components/EmergencyTimeline";
import { PatientCard } from "@/components/PatientCard";
import { cn, severityColor, statusLabel } from "@/lib/utils";
import dynamic from "next/dynamic";

const AmbulanceMap = dynamic(
  () => import("@/components/AmbulanceMap").then((m) => ({ default: m.AmbulanceMap })),
  { ssr: false },
);

type Emergency = {
  id: string;
  description: string;
  severity: string;
  status: string;
  lat: number;
  lng: number;
  address?: string | null;
  likelyCause?: string | null;
  survivalScore?: number | null;
  createdAt?: string | null;
  assignedAmbulanceId?: string | null;
  assignedHospitalId?: string | null;
};

export default function CommanderPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeQuery = api.sos.listActive.useQuery(undefined, { refetchInterval: 5000 });
  const ambulancesQuery = api.ambulance.list.useQuery(undefined, { refetchInterval: 6000 });
  const recentQuery = api.session.listRecent.useQuery({ limit: 5 });
  const sessionQuery = api.session.getState.useQuery(
    { emergencyId: selectedId! },
    { enabled: !!selectedId },
  );
  const hospitalScoreQuery = api.hospital.score.useQuery(
    {
      patientLat: sessionQuery.data?.emergency?.lat ?? 0,
      patientLng: sessionQuery.data?.emergency?.lng ?? 0,
      bloodGroup: null,
      likelyCause: sessionQuery.data?.emergency?.likelyCause ?? "unknown",
      needsIcu: false,
      needsOxygen: false,
    },
    { enabled: !!selectedId && !!sessionQuery.data },
  );

  // Live new emergencies
  usePusher<{ emergencyId: string; description: string }>(
    "corridor-alerts",
    "session:update",
    () => { void activeQuery.refetch(); },
    true,
  );

  const emergencies: Emergency[] = (activeQuery.data ?? []) as Emergency[];
  const selected = sessionQuery.data;
  const amb = ambulancesQuery.data ?? [];

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: "bg-red-500/20 text-red-400 border-red-500/30",
      ambulance_dispatched: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      on_scene: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      transporting: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      arrived: "bg-green-500/20 text-green-400 border-green-500/30",
    };
    return map[status] ?? "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  };

  return (
    <main className="flex min-h-screen bg-[#0a0a0b]">
      {/* LEFT SIDEBAR — emergency list */}
      <aside className="flex h-screen w-72 flex-shrink-0 flex-col border-r border-[#27272a]">
        <div className="border-b border-[#27272a] px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="font-bold text-white">Command Center</span>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">{emergencies.length} active incidents</p>
        </div>

        {/* Active emergencies */}
        <div className="flex-1 overflow-y-auto">
          {emergencies.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-zinc-500">No active emergencies</p>
              <p className="mt-1 text-xs text-zinc-700">All clear ✓</p>
            </div>
          ) : (
            emergencies.map((e) => (
              <button
                className={cn(
                  "w-full border-b border-[#1f1f22] px-4 py-3 text-left transition-colors",
                  selectedId === e.id ? "bg-zinc-800" : "hover:bg-[#18181b]",
                )}
                key={e.id}
                type="button"
                onClick={() => setSelectedId(e.id)}
              >
                <div className="mb-1 flex items-start justify-between">
                  <span className={cn("text-xs font-bold uppercase", severityColor(e.severity))}>
                    {e.severity}
                  </span>
                  <Badge
                    className={cn("px-1.5 py-0 text-[10px]", statusBadge(e.status))}
                    variant="outline"
                  >
                    {statusLabel(e.status)}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-sm leading-snug text-white">{e.description}</p>
                <p className="mono mt-1 text-xs text-zinc-600">{e.id}</p>
                {e.survivalScore && (
                  <p className="mt-0.5 text-xs text-green-400">
                    Survival: {Math.round(e.survivalScore * 100)}%
                  </p>
                )}
              </button>
            ))
          )}
        </div>

        {/* Ambulance status footer */}
        <div className="border-t border-[#27272a] px-4 py-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-zinc-600">Ambulances</p>
          <div className="space-y-1.5">
            {amb.slice(0, 4).map((a) => (
              <div className="flex items-center gap-2" key={a.id}>
                <span
                  className={cn(
                    "h-1.5 w-1.5 flex-shrink-0 rounded-full",
                    a.status === "available"
                      ? "bg-green-400"
                      : a.status === "on_scene"
                        ? "animate-pulse bg-amber-400"
                        : "animate-pulse bg-red-400",
                  )}
                />
                <span className="truncate text-xs text-zinc-400">{a.vehicleNo}</span>
                <span className="ml-auto text-[10px] text-zinc-600">{a.status}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 overflow-y-auto p-4">
        {!selectedId ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <span className="mb-4 text-5xl">🎖</span>
            <h2 className="mb-2 text-xl font-bold text-white">Select an Emergency</h2>
            <p className="text-sm text-zinc-500">Click any incident on the left to view details</p>

            {/* Recent closed */}
            {(recentQuery.data ?? []).filter((e) => e.status === "closed").length > 0 && (
              <div className="mt-8 w-full max-w-sm">
                <p className="mb-2 text-xs uppercase tracking-wide text-zinc-600">Recent Closed</p>
                <div className="space-y-2">
                  {(recentQuery.data ?? [])
                    .filter((e) => e.status === "closed")
                    .slice(0, 3)
                    .map((e) => (
                      <div className="card-surface px-3 py-2 text-left" key={e.id}>
                        <p className="line-clamp-1 text-xs text-zinc-400">{e.description}</p>
                        <p className="mono text-[10px] text-zinc-600">{e.id}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-3xl">
            {/* Emergency header */}
            {selected?.emergency && (
              <div className="card-surface mb-4 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className={cn(
                          "text-sm font-black uppercase",
                          severityColor(selected.emergency.severity),
                        )}
                      >
                        {selected.emergency.severity}
                      </span>
                      <Badge
                        className={cn("text-xs", statusBadge(selected.emergency.status))}
                        variant="outline"
                      >
                        {statusLabel(selected.emergency.status)}
                      </Badge>
                    </div>
                    <p className="font-semibold text-white">{selected.emergency.description}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {selected.emergency.address ??
                        `${selected.emergency.lat.toFixed(4)}, ${selected.emergency.lng.toFixed(4)}`}
                    </p>
                    {selected.emergency.likelyCause && (
                      <p className="mt-1 text-xs text-amber-400">
                        Likely: {selected.emergency.likelyCause}
                      </p>
                    )}
                  </div>
                  <p className="mono text-xs text-zinc-600">{selectedId}</p>
                </div>
              </div>
            )}

            <Tabs defaultValue="overview">
              <TabsList className="mb-4 w-full border border-[#27272a] bg-[#18181b]">
                <TabsTrigger className="flex-1 text-xs" value="overview">Overview</TabsTrigger>
                <TabsTrigger className="flex-1 text-xs" value="hospitals">Hospitals</TabsTrigger>
                <TabsTrigger className="flex-1 text-xs" value="map">Map</TabsTrigger>
                <TabsTrigger className="flex-1 text-xs" value="timeline">Timeline</TabsTrigger>
              </TabsList>

              {/* OVERVIEW */}
              <TabsContent className="space-y-4" value="overview">
                <div className="grid grid-cols-3 gap-3">
                  {/* Ambulance */}
                  <div className="card-surface col-span-1 p-3">
                    <p className="mb-2 text-xs text-zinc-600">🚑 Ambulance</p>
                    {selected?.ambulance ? (
                      <>
                        <p className="mono text-sm font-bold text-white">
                          {selected.ambulance.vehicleNo}
                        </p>
                        <p className="text-xs text-zinc-400">{selected.ambulance.driverName}</p>
                        <p className="text-xs text-zinc-400">{selected.ambulance.paramedicName}</p>
                        <Badge
                          className={cn("mt-2 text-[10px]", statusBadge(selected.ambulance.status))}
                          variant="outline"
                        >
                          {statusLabel(selected.ambulance.status)}
                        </Badge>
                      </>
                    ) : (
                      <p className="text-xs text-zinc-600">Not assigned</p>
                    )}
                  </div>

                  {/* Hospital */}
                  <div className="card-surface col-span-1 p-3">
                    <p className="mb-2 text-xs text-zinc-600">🏥 Hospital</p>
                    {selected?.hospital ? (
                      <>
                        <p className="text-sm font-bold leading-tight text-white">
                          {selected.hospital.name}
                        </p>
                        <p className="text-xs text-zinc-500">{selected.hospital.address}</p>
                        <div className="mt-2 flex gap-2">
                          <span className="text-xs text-zinc-400">
                            ICU:{" "}
                            <span
                              className={
                                selected.hospital.icuAvailable > 0
                                  ? "text-green-400"
                                  : "text-red-400"
                              }
                            >
                              {selected.hospital.icuAvailable}
                            </span>
                          </span>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-zinc-600">Not assigned</p>
                    )}
                  </div>

                  {/* Survival score */}
                  <div className="card-surface col-span-1 flex flex-col items-center justify-center p-3">
                    <p className="mb-1 text-xs text-zinc-600">Survival Score</p>
                    {selected?.emergency?.survivalScore ? (
                      <p
                        className={cn(
                          "mono text-3xl font-black",
                          selected.emergency.survivalScore > 0.7
                            ? "text-green-400"
                            : selected.emergency.survivalScore > 0.4
                              ? "text-amber-400"
                              : "text-red-400",
                        )}
                      >
                        {Math.round(selected.emergency.survivalScore * 100)}%
                      </p>
                    ) : (
                      <p className="text-2xl text-zinc-600">—</p>
                    )}
                  </div>
                </div>

                {/* Patient */}
                {selected?.patient && (
                  <PatientCard
                    compact
                    patient={selected.patient}
                    triage={
                      selected.triage
                        ? {
                            aiSummary: selected.triage.aiSummary,
                            priority: selected.triage.priority as "P1" | "P2" | "P3",
                            priorityLabel: selected.triage.priorityLabel,
                          }
                        : null
                    }
                  />
                )}
              </TabsContent>

              {/* HOSPITALS */}
              <TabsContent value="hospitals">
                {hospitalScoreQuery.isLoading && (
                  <div className="py-8 text-center text-sm text-zinc-500">
                    Scoring hospitals…
                  </div>
                )}
                <div className="space-y-3">
                  {(hospitalScoreQuery.data ?? []).map((h, i) => (
                    <HospitalCard
                      hospital={h}
                      key={h.hospitalId}
                      rank={i + 1}
                      selected={h.hospitalId === selected?.hospital?.id}
                    />
                  ))}
                </div>
              </TabsContent>

              {/* MAP */}
              <TabsContent value="map">
                <div className="card-surface h-96 overflow-hidden rounded-xl">
                  {selected?.emergency && (
                    <AmbulanceMap
                      ambulanceLat={selected.ambulance?.lat}
                      ambulanceLng={selected.ambulance?.lng}
                      emergencyId={selectedId}
                      emergencyLat={selected.emergency.lat}
                      emergencyLng={selected.emergency.lng}
                      hospitalLat={selected.hospital?.lat}
                      hospitalLng={selected.hospital?.lng}
                    />
                  )}
                </div>
              </TabsContent>

              {/* TIMELINE */}
              <TabsContent value="timeline">
                <div className="h-[560px]">
                  <EmergencyTimeline emergencyId={selectedId} />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </main>
  );
}