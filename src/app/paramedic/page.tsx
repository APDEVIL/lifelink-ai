"use client";
import { useState, useEffect, useRef } from "react";
import { api } from "@/trpc/react";
import { usePusher, type PatientIdentifiedPayload, type TriageUpdatePayload } from "@/lib/pusher";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { VitalsForm } from "@/components/VitalsForm";
import { PatientCard } from "@/components/PatientCard";
import { EmergencyTimeline } from "@/components/EmergencyTimeline";
import { cn, statusLabel, priorityClass } from "@/lib/utils";
import dynamic from "next/dynamic";

const AmbulanceMap = dynamic(() => import("@/components/AmbulanceMap").then(m => ({ default: m.AmbulanceMap })), { ssr: false });

const PARAMEDIC_NAME = "Paramedic"; // In real app, from auth

export default function ParamedicPage() {
  const [emergencyId, setEmergencyId] = useState("");
  const [inputId, setInputId] = useState("");
  const [triage, setTriage] = useState<{ priority: "P1"|"P2"|"P3"; priorityLabel: string; aiSummary?: string|null } | null>(null);
  const [triageId, setTriageId] = useState("");
  const [patient, setPatient] = useState<PatientIdentifiedPayload | null>(null);
  const [plate, setPlate] = useState("");
  const [gpsWatchId, setGpsWatchId] = useState<number | null>(null);

  const sessionQuery = api.session.getState.useQuery(
    { emergencyId }, { enabled: !!emergencyId }
  );
  const session = sessionQuery.data;

  const patientReport = api.report.getLatest.useQuery(
    { patientId: patient?.patientId ?? session?.patient?.id ?? "" },
    { enabled: !!(patient?.patientId ?? session?.patient?.id) }
  );

  const updateLocation = api.ambulance.updateLocation.useMutation();
  const updateStatus = api.ambulance.updateStatus.useMutation();
  const resolveByPlate = api.patient.resolveByPlate.useMutation();
  const closeSession = api.session.close.useMutation();

  // Real-time: patient identified remotely
  usePusher<PatientIdentifiedPayload>(
    `emergency-${emergencyId}`,
    "patient:identified",
    (data) => {
      setPatient(data);
      toast.success(`Patient identified: ${data.name}`);
    },
    !!emergencyId
  );

  // Real-time: triage update from hospital
  usePusher<TriageUpdatePayload>(
    `emergency-${emergencyId}`,
    "triage:update",
    (data) => {
      setTriage({ priority: data.priority, priorityLabel: data.priorityLabel, aiSummary: data.aiSummary });
    },
    !!emergencyId
  );

  // Sync triage from session
  useEffect(() => {
    if (session?.triage) {
      setTriage({
        priority: session.triage.priority as "P1"|"P2"|"P3",
        priorityLabel: session.triage.priorityLabel,
        aiSummary: session.triage.aiSummary,
      });
      setTriageId(session.triage.id);
    }
  }, [session]);

  // GPS tracking
  function startGPS() {
    if (!emergencyId || !session?.ambulance?.id) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        updateLocation.mutate({
          ambulanceId: session.ambulance!.id,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed: pos.coords.speed ?? undefined,
          heading: pos.coords.heading ?? undefined,
          routeSignalIds: [], // populated after corridor planning
        });
      },
      () => toast.error("GPS unavailable"),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 5000 }
    );
    setGpsWatchId(id);
    toast.success("GPS tracking started");
  }

  function stopGPS() {
    if (gpsWatchId !== null) {
      navigator.geolocation.clearWatch(gpsWatchId);
      setGpsWatchId(null);
    }
  }

  async function setStatusOnScene() {
    if (!session?.ambulance?.id) return;
    await updateStatus.mutateAsync({ ambulanceId: session.ambulance.id, status: "on_scene", emergencyId });
    toast.success("Status: On Scene");
  }

  async function setStatusTransporting() {
    if (!session?.ambulance?.id) return;
    await updateStatus.mutateAsync({ ambulanceId: session.ambulance.id, status: "transporting", emergencyId });
    toast.success("Status: Transporting");
  }

  async function handleClose() {
    await closeSession.mutateAsync({ emergencyId, closedBy: PARAMEDIC_NAME, hospitalName: session?.hospital?.name });
    stopGPS();
    toast.success("Session closed — patient handed over");
  }

  async function handleResolvePlate() {
    if (!plate.trim()) return;
    const res = await resolveByPlate.mutateAsync({
      emergencyId, plate, hospitalId: session?.hospital?.id, etaMinutes: session?.ambulance ? 5 : undefined,
    });
    if (res.found) toast.success(`Patient found: ${res.patientName}`);
    else toast.warning("No patient record found for this plate");
  }

  if (!emergencyId) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 max-w-sm mx-auto">
        <div className="text-4xl mb-4">🚑</div>
        <h1 className="text-2xl font-black text-white mb-2">Paramedic View</h1>
        <p className="text-zinc-400 text-sm text-center mb-8">Enter the Emergency ID from dispatch</p>
        <div className="w-full flex gap-2">
          <Input placeholder="EMG_1234567890" value={inputId}
            onChange={(e) => setInputId(e.target.value.toUpperCase())}
            className="bg-[#18181b] border-[#27272a] mono"
            onKeyDown={(e) => e.key === "Enter" && setEmergencyId(inputId)} />
          <Button onClick={() => setEmergencyId(inputId)} className="bg-green-600 hover:bg-green-700">
            Join
          </Button>
        </div>
      </main>
    );
  }

  const emg = session?.emergency;
  const amb = session?.ambulance;

  return (
    <main className="min-h-screen bg-[#0a0a0b] p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="dot-red" />
            <span className="font-bold text-white">Paramedic Dashboard</span>
          </div>
          <p className="mono text-xs text-zinc-500">{emergencyId}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline"
            onClick={gpsWatchId ? stopGPS : startGPS}
            className={cn("text-xs border-[#27272a]", gpsWatchId ? "border-green-500/40 text-green-400" : "text-zinc-400")}>
            {gpsWatchId ? "📍 GPS On" : "📍 GPS Off"}
          </Button>
        </div>
      </div>

      {/* Emergency summary */}
      {emg && (
        <div className="card-surface p-3 mb-4 flex items-start gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-white">{emg.description}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{emg.address ?? `${emg.lat.toFixed(4)}, ${emg.lng.toFixed(4)}`}</p>
          </div>
          <Badge className={cn("text-xs", priorityClass(triage?.priority ?? "P3"))}>
            {emg.severity}
          </Badge>
        </div>
      )}

      {/* Status buttons */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "On Scene", fn: setStatusOnScene, color: "bg-amber-600 hover:bg-amber-700" },
          { label: "Transporting", fn: setStatusTransporting, color: "bg-blue-600 hover:bg-blue-700" },
          { label: "Close Session", fn: handleClose, color: "bg-zinc-700 hover:bg-zinc-600" },
        ].map(({ label, fn, color }) => (
          <Button key={label} size="sm" onClick={fn} className={cn("text-xs font-semibold text-white", color)}>
            {label}
          </Button>
        ))}
      </div>

      <Tabs defaultValue="triage">
        <TabsList className="w-full bg-[#18181b] border border-[#27272a] mb-4">
          <TabsTrigger value="triage" className="flex-1 text-xs">Triage</TabsTrigger>
          <TabsTrigger value="patient" className="flex-1 text-xs">Patient</TabsTrigger>
          <TabsTrigger value="map" className="flex-1 text-xs">Map</TabsTrigger>
          <TabsTrigger value="timeline" className="flex-1 text-xs">Timeline</TabsTrigger>
        </TabsList>

        {/* TRIAGE TAB */}
        <TabsContent value="triage">
          {triage && (
            <div className={cn("rounded-xl px-4 py-3 mb-4", priorityClass(triage.priority))}>
              <p className="font-black text-lg">{triage.priority} — {triage.priorityLabel}</p>
              {triage.aiSummary && <p className="text-sm mt-1 opacity-80">{triage.aiSummary}</p>}
            </div>
          )}
          <div className="card-surface p-4">
            <h3 className="font-semibold text-white mb-4 text-sm">
              {triageId ? "Update Vitals" : "Assign Triage"}
            </h3>
            <VitalsForm
              emergencyId={emergencyId}
              paramedicName={PARAMEDIC_NAME}
              likelyCause={emg?.likelyCause ?? "unknown"}
              hospitalId={session?.hospital?.id}
              triageId={triageId || undefined}
              onDone={(r) => {
                if (!triageId) {
                  setTriage({ priority: r.priority as "P1"|"P2"|"P3", priorityLabel: r.priority, aiSummary: null });
                }
              }}
            />
          </div>
        </TabsContent>

        {/* PATIENT TAB */}
        <TabsContent value="patient" className="space-y-4">
          {session?.patient || patient ? (
            <PatientCard
              patient={session?.patient ?? { id: patient!.patientId, name: patient!.name, age: patient!.age, gender: "—" }}
              report={patientReport.data as Parameters<typeof PatientCard>[0]["report"]}
              triage={triage}
            />
          ) : (
            <div className="card-surface p-4 space-y-3">
              <p className="text-sm font-semibold text-white">Identify Patient</p>
              <div className="flex gap-2">
                <Input placeholder="Vehicle plate, e.g. KA01AB1234"
                  value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  className="bg-[#0a0a0b] border-[#27272a] mono text-sm" />
                <Button onClick={handleResolvePlate} size="sm"
                  className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap">
                  Search
                </Button>
              </div>
              <p className="text-xs text-zinc-600">
                Or have the hospital scan the patient's face via their dashboard
              </p>
            </div>
          )}
        </TabsContent>

        {/* MAP TAB */}
        <TabsContent value="map">
          <div className="h-72 card-surface overflow-hidden rounded-xl">
            {emg && (
              <AmbulanceMap
                emergencyId={emergencyId}
                emergencyLat={emg.lat}
                emergencyLng={emg.lng}
                hospitalLat={session?.hospital?.lat}
                hospitalLng={session?.hospital?.lng}
                ambulanceLat={amb?.lat}
                ambulanceLng={amb?.lng}
              />
            )}
          </div>
          {session?.hospital && (
            <div className="card-surface p-3 mt-3 flex items-center gap-3">
              <span className="text-xl">🏥</span>
              <div>
                <p className="font-semibold text-white text-sm">{session.hospital.name}</p>
                <p className="text-xs text-zinc-500">{session.hospital.address}</p>
              </div>
              <a href={`tel:${session.hospital.phone}`} className="ml-auto text-xs text-blue-400">
                📞 Call ER
              </a>
            </div>
          )}
        </TabsContent>

        {/* TIMELINE TAB */}
        <TabsContent value="timeline">
          <div className="h-[480px]">
            <EmergencyTimeline emergencyId={emergencyId} />
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}