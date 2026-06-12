/** biome-ignore-all lint/a11y/noLabelWithoutControl: <explanation> */
"use client";
import { useState } from "react";
import { api } from "@/trpc/react";
import { usePusher, type PatientIdentifiedPayload, type TriageUpdatePayload, type AmbulanceLocationPayload } from "@/lib/pusher";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PatientCard } from "@/components/PatientCard";
import { EmergencyTimeline } from "@/components/EmergencyTimeline";
import { cn, priorityClass, formatTime } from "@/lib/utils";

export default function HospitalPage() {
  const [hospitalId, setHospitalId] = useState("");
  const [inputId, setInputId] = useState("");
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [liveTriage, setLiveTriage] = useState<{ priority: "P1"|"P2"|"P3"; priorityLabel: string; aiSummary?: string|null } | null>(null);
  const [livePatient, setLivePatient] = useState<PatientIdentifiedPayload | null>(null);
  const [resourceEdit, setResourceEdit] = useState(false);
  const [resources, setResources] = useState({ icuAvailable: 0, generalAvailable: 0, oxygenUnits: 0, currentLoad: 0 });

  const incomingQuery = api.hospital.getIncomingEmergency.useQuery(
    { hospitalId }, { enabled: !!hospitalId, refetchInterval: 8000 }
  );
  const hospitalQuery = api.hospital.getById.useQuery({ hospitalId }, { enabled: !!hospitalId });
  const updateResources = api.hospital.updateResources.useMutation();
  const resolveByPlate = api.patient.resolveByPlate.useMutation();

  const incoming = incomingQuery.data;
  const hospital = hospitalQuery.data;
  const emergencyId = incoming?.emergency?.id ?? "";
  const patientId = livePatient?.patientId ?? incoming?.emergency?.patientId ?? "";

  const patientQuery = api.patient.getById.useQuery({ patientId }, { enabled: !!patientId });
  const reportQuery = api.report.getLatest.useQuery({ patientId }, { enabled: !!patientId });

  // Real-time events
  usePusher<PatientIdentifiedPayload>(`hospital-${hospitalId}`, "patient:identified", (data) => {
    setLivePatient(data);
    toast.success(`Patient identified: ${data.name}`);
  }, !!hospitalId);

  usePusher<TriageUpdatePayload>(`hospital-${hospitalId}`, "triage:update", (data) => {
    setLiveTriage({ priority: data.priority, priorityLabel: data.priorityLabel, aiSummary: data.aiSummary });
    toast.warning(`Triage updated: ${data.priority} — ${data.priorityLabel}`);
  }, !!hospitalId);

  usePusher<AmbulanceLocationPayload>(`hospital-${hospitalId}`, "ambulance:location", ({ etaSeconds: eta }) => {
    if (eta) setEtaSeconds(eta);
  }, !!hospitalId);

  usePusher<{ message: string }>(`hospital-${hospitalId}`, "hospital:reservation", ({ message }) => {
    toast.info(message);
  }, !!hospitalId);

  async function saveResources() {
    await updateResources.mutateAsync({ hospitalId, ...resources });
    toast.success("Resources updated");
    setResourceEdit(false);
    hospitalQuery.refetch();
  }

  if (!hospitalId) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 max-w-sm mx-auto">
        <div className="text-4xl mb-4">🏥</div>
        <h1 className="text-2xl font-black text-white mb-2">Hospital ER</h1>
        <p className="text-zinc-400 text-sm text-center mb-8">Enter your Hospital ID</p>
        <div className="w-full flex gap-2">
          <Input placeholder="HOSP_XXXX" value={inputId}
            onChange={(e) => setInputId(e.target.value.toUpperCase())}
            className="bg-[#18181b] border-[#27272a] mono"
            onKeyDown={(e) => e.key === "Enter" && setHospitalId(inputId)} />
          <Button onClick={() => setHospitalId(inputId)} className="bg-blue-600 hover:bg-blue-700">
            Open
          </Button>
        </div>
      </main>
    );
  }

  const etaMins = etaSeconds ? Math.ceil(etaSeconds / 60) : null;
  const triage = liveTriage ?? (incoming?.triage ? {
    priority: incoming.triage.priority as "P1"|"P2"|"P3",
    priorityLabel: incoming.triage.priorityLabel,
    aiSummary: incoming.triage.aiSummary,
  } : null);

  return (
    <main className="min-h-screen bg-[#0a0a0b] p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="font-black text-white text-xl">{hospital?.name ?? "Hospital ER"}</h1>
          <p className="text-xs text-zinc-500 mono">{hospitalId}</p>
        </div>
        {incoming?.emergency && (
          <div className="text-right">
            <p className="text-xs text-zinc-500">Incoming ETA</p>
            <p className={cn("mono font-black text-2xl leading-tight", etaMins && etaMins <= 3 ? "text-red-400" : "text-amber-400")}>
              {etaMins ? `${etaMins}m` : "—"}
            </p>
          </div>
        )}
      </div>

      {/* Incoming alert banner */}
      {incoming?.emergency && triage && (
        <div className={cn("rounded-xl px-4 py-3 mb-4 flex items-center gap-3", priorityClass(triage.priority))}>
          <div className="flex-1">
            <p className="font-black">{triage.priority} · {triage.priorityLabel}</p>
            <p className="text-sm opacity-80 mt-0.5">{incoming.emergency.description}</p>
          </div>
          <span className="text-2xl">🚨</span>
        </div>
      )}

      {!incoming?.emergency && (
        <div className="card-surface p-6 text-center mb-4">
          <p className="text-zinc-400 text-sm">No active incoming emergency</p>
          <p className="text-xs text-zinc-600 mt-1">Waiting for dispatch assignment…</p>
        </div>
      )}

      <Tabs defaultValue="patient">
        <TabsList className="w-full bg-[#18181b] border border-[#27272a] mb-4">
          <TabsTrigger value="patient" className="flex-1 text-xs">Patient</TabsTrigger>
          <TabsTrigger value="resources" className="flex-1 text-xs">Resources</TabsTrigger>
          <TabsTrigger value="timeline" className="flex-1 text-xs">Timeline</TabsTrigger>
        </TabsList>

        {/* PATIENT TAB */}
        <TabsContent value="patient" className="space-y-4">
          {patientQuery.data ? (
            <PatientCard
              patient={patientQuery.data}
              report={reportQuery.data as Parameters<typeof PatientCard>[0]["report"]}
              triage={triage}
            />
          ) : livePatient ? (
            <div className="card-surface p-4">
              <p className="font-bold text-white">{livePatient.name}</p>
              <p className="text-sm text-zinc-400">{livePatient.age}y</p>
              {livePatient.bloodGroup && <p className="text-red-400 font-semibold">{livePatient.bloodGroup}</p>}
              {triage && <p className="text-xs mt-2 text-zinc-400">{triage.aiSummary}</p>}
            </div>
          ) : (
            <div className="card-surface p-4 space-y-3">
              <p className="text-sm text-zinc-400">Patient not yet identified.</p>
              <p className="text-xs text-zinc-600">
                The paramedic or commander will identify via face scan or vehicle plate.
                You'll see the patient card appear automatically.
              </p>
              {incoming?.emergency?.patientId && (
                <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400">
                  Patient ID linked: {incoming.emergency.patientId}
                </Badge>
              )}
            </div>
          )}
        </TabsContent>

        {/* RESOURCES TAB */}
        <TabsContent value="resources">
          <div className="card-surface p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white text-sm">Bed & Resource Status</h3>
              <Button size="sm" variant="outline"
                onClick={() => {
                  if (!resourceEdit && hospital) {
                    setResources({
                      icuAvailable: hospital.icuAvailable,
                      generalAvailable: hospital.generalAvailable,
                      oxygenUnits: hospital.oxygenUnits,
                      currentLoad: hospital.currentLoad,
                    });
                  }
                  setResourceEdit(!resourceEdit);
                }}
                className="text-xs border-[#27272a] text-zinc-400">
                {resourceEdit ? "Cancel" : "Edit"}
              </Button>
            </div>

            {hospital && !resourceEdit && (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "ICU Available", value: hospital.icuAvailable, total: hospital.icuBeds, danger: hospital.icuAvailable === 0 },
                  { label: "General Beds", value: hospital.generalAvailable, total: hospital.generalBeds, danger: hospital.generalAvailable < 3 },
                  { label: "Oxygen Cylinders", value: hospital.oxygenUnits, danger: hospital.oxygenUnits < 5 },
                  { label: "Load", value: `${hospital.currentLoad}%`, danger: hospital.currentLoad > 80 },
                ].map(({ label, value, total, danger }) => (
                  <div key={label} className="bg-[#0a0a0b] rounded-lg p-3 border border-[#1f1f22]">
                    <p className="text-xs text-zinc-600 mb-1">{label}</p>
                    <p className={cn("mono text-2xl font-black", danger ? "text-red-400" : "text-green-400")}>
                      {value}
                      {total !== undefined && <span className="text-sm text-zinc-600 font-normal">/{total}</span>}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {resourceEdit && (
              <div className="space-y-3">
                {[
                  { key: "icuAvailable", label: "ICU Available" },
                  { key: "generalAvailable", label: "General Beds Available" },
                  { key: "oxygenUnits", label: "Oxygen Cylinders" },
                  { key: "currentLoad", label: "Current Load %" },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="mb-1 block text-xs text-zinc-500">{label}</label>
                    <Input type="number"
                      value={resources[key as keyof typeof resources]}
                      onChange={(e) => setResources((r) => ({ ...r, [key]: Number(e.target.value) }))}
                      className="bg-[#0a0a0b] border-[#27272a]" />
                  </div>
                ))}
                <Button onClick={saveResources} className="w-full bg-blue-600 hover:bg-blue-700">
                  Save Resources
                </Button>
              </div>
            )}

            {/* Blood bank */}
            {hospital && (
              <div>
                <p className="text-xs text-zinc-600 uppercase tracking-wide mb-2">Blood Bank</p>
                <div className="flex flex-wrap gap-2">
                  {(["A+","A-","B+","B-","O+","O-","AB+","AB-"] as const).map((bg) => {
                    const key = `blood${bg.replace("+","Pos").replace("-","Neg").replace("AB","Ab")}` as keyof typeof hospital;
                    const count = hospital[key] as number;
                    return (
                      <div key={bg} className={cn(
                        "rounded px-2 py-1 text-center min-w-[44px]",
                        count > 0 ? "bg-red-500/10 border border-red-500/20" : "bg-zinc-800 border border-zinc-700 opacity-40"
                      )}>
                        <p className="mono text-xs font-bold text-white">{bg}</p>
                        <p className={cn("mono text-sm font-black", count > 0 ? "text-red-300" : "text-zinc-600")}>{count}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* TIMELINE TAB */}
        <TabsContent value="timeline">
          <div className="h-[520px]">
            {emergencyId ? (
              <EmergencyTimeline emergencyId={emergencyId} />
            ) : (
              <div className="card-surface h-full flex items-center justify-center">
                <p className="text-zinc-500 text-sm">No active emergency assigned</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}