"use client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Patient = {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone?: string | null;
  emergencyContact?: string | null;
};

type Report = {
  bloodGroup: string;
  conditions: string[];
  medications: Array<{ name: string; dose: string; frequency: string }>;
  allergies: string[];
  criticalAllergies?: string[];
  ecgNotes?: string | null;
};

type Props = {
  patient: Patient;
  report?: Report | null;
  triage?: { priority: "P1" | "P2" | "P3"; priorityLabel: string; aiSummary?: string | null } | null;
  compact?: boolean;
};

const PRIORITY_STYLES = {
  P1: "bg-red-500 text-white",
  P2: "bg-amber-500 text-black",
  P3: "bg-green-500 text-black",
};

export function PatientCard({ patient, report, triage, compact }: Props) {
  const contact = patient.emergencyContact
    ? (() => { try { return JSON.parse(patient.emergencyContact); } catch { return null; } })()
    : null;

  return (
    <div className="card-surface p-4 space-y-4">
      {/* Identity */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-white text-lg leading-tight">{patient.name}</h3>
            {triage && (
              <span className={cn("text-xs font-black px-2 py-0.5 rounded", PRIORITY_STYLES[triage.priority])}>
                {triage.priority}
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-400 mt-0.5">
            {patient.age}y · {patient.gender === "M" ? "Male" : patient.gender === "F" ? "Female" : "Other"}
            {report?.bloodGroup && <span className="ml-2 text-red-400 font-semibold">{report.bloodGroup}</span>}
          </p>
          <p className="mono text-xs text-zinc-600 mt-0.5">{patient.id}</p>
        </div>
        {patient.phone && (
          <a href={`tel:${patient.phone}`}
            className="text-xs text-blue-400 hover:text-blue-300 border border-blue-500/20 rounded px-2 py-1">
            📞 Call
          </a>
        )}
      </div>

      {/* Triage label + AI summary */}
      {triage && (
        <div className="bg-[#0a0a0b] rounded-lg p-3 border border-[#27272a]">
          <p className="text-xs font-semibold text-zinc-300 mb-1">{triage.priorityLabel}</p>
          {triage.aiSummary && (
            <p className="text-xs text-zinc-400 leading-relaxed">{triage.aiSummary}</p>
          )}
        </div>
      )}

      {compact ? null : (
        <>
          {/* Critical allergies — shown prominently */}
          {report?.criticalAllergies && report.criticalAllergies.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-xs font-bold text-red-400 uppercase tracking-wide mb-1">⚠ Critical Allergies</p>
              <div className="flex flex-wrap gap-1">
                {report.criticalAllergies.map((a) => (
                  <Badge key={a} className="bg-red-500/20 text-red-300 border-red-500/30">{a}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Conditions & Medications */}
          {report && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-zinc-600 uppercase tracking-wide mb-1">Conditions</p>
                <div className="space-y-1">
                  {report.conditions.slice(0, 4).map((c) => (
                    <p key={c} className="text-xs text-zinc-300">• {c}</p>
                  ))}
                  {report.conditions.length === 0 && <p className="text-xs text-zinc-600">None on record</p>}
                </div>
              </div>
              <div>
                <p className="text-xs text-zinc-600 uppercase tracking-wide mb-1">Medications</p>
                <div className="space-y-1">
                  {report.medications.slice(0, 4).map((m) => (
                    <p key={m.name} className="text-xs text-zinc-300">• {m.name} {m.dose}</p>
                  ))}
                  {report.medications.length === 0 && <p className="text-xs text-zinc-600">None on record</p>}
                </div>
              </div>
            </div>
          )}

          {/* Emergency contact */}
          {contact && (
            <div className="flex items-center justify-between border-t border-[#27272a] pt-3">
              <div>
                <p className="text-xs text-zinc-600">Emergency Contact</p>
                <p className="text-sm text-zinc-300">{contact.name}</p>
              </div>
              <a href={`tel:${contact.phone}`} className="text-xs text-blue-400 hover:text-blue-300">
                {contact.phone}
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}