"use client";
import { useState } from "react";
import { api } from "@/trpc/react";
import { usePusher } from "@/lib/pusher";
import { Badge } from "@/components/ui/badge";
import { cn, formatTime } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

type PoliceLogEntry = {
  id: string;
  junctionName: string;
  roadLinkDescription: string;
  emergencyId: string;
  action: string;
  timestamp: string;
};

type SignalInterruptionPayload = {
  junctionName: string;
  roadLinkDescription: string;
  emergencyId: string;
  action: string;
  timestamp: string;
};

export default function PolicePage() {
  const [liveInterruptions, setLiveInterruptions] = useState<PoliceLogEntry[]>([]);

  const policeLogQuery = api.corridor.getPoliceLog.useQuery({ limit: 50 }, { refetchInterval: 10000 });
  const signalsQuery = api.corridor.listAll.useQuery(undefined, { refetchInterval: 5000 });

  // Live signal interruptions
  usePusher<SignalInterruptionPayload>(
    "police-control",
    "signal-interruption",
    (data) => {
      setLiveInterruptions((prev) => [{
        id: `live-${Date.now()}`,
        junctionName: data.junctionName,
        roadLinkDescription: data.roadLinkDescription,
        emergencyId: data.emergencyId,
        action: data.action,
        timestamp: data.timestamp,
      }, ...prev]);
    },
    true
  );

  const allLogs: PoliceLogEntry[] = [
    ...liveInterruptions,
    ...((policeLogQuery.data ?? []) as unknown as PoliceLogEntry[]),
  ];

  const signals = signalsQuery.data ?? [];
  const greenSignals = signals.filter((s) => s.state === "green");
  const agentControlled = signals.filter((s) => s.controlledBy === "agent");

  return (
    <main className="min-h-screen bg-[#0a0a0b] p-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🚦</span>
        <div>
          <h1 className="font-black text-white text-xl">Traffic Control Room</h1>
          <p className="text-xs text-zinc-500">Police corridor log · Signal override status</p>
        </div>
        <div className="ml-auto flex gap-3">
          <StatChip label="Active Green" value={greenSignals.length} color="text-green-400" />
          <StatChip label="Agent Control" value={agentControlled.length} color="text-amber-400" />
        </div>
      </div>

      {/* Live alert banner */}
      {liveInterruptions[0] && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
          <span className="text-xl">🚨</span>
          <div>
            <p className="text-sm font-bold text-amber-300">Signal Override — {liveInterruptions[0].junctionName}</p>
            <p className="text-xs text-zinc-400">{liveInterruptions[0].roadLinkDescription}</p>
          </div>
          <span className="mono text-xs text-zinc-500 ml-auto">{formatTime(liveInterruptions[0].timestamp)}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Signal grid */}
        <div className="card-surface">
          <div className="px-4 py-3 border-b border-[#27272a]">
            <p className="text-sm font-semibold text-white">Signal Status</p>
            <p className="text-xs text-zinc-500">{signals.length} junctions</p>
          </div>
          <ScrollArea className="h-80">
            <div className="p-3 space-y-1.5">
              {signals.map((sig) => (
                <div key={sig.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg border",
                    sig.state === "green"
                      ? "bg-green-500/5 border-green-500/20"
                      : sig.controlledBy === "agent"
                      ? "bg-amber-500/5 border-amber-500/20"
                      : "bg-transparent border-[#1f1f22]"
                  )}>
                  <div className={cn("w-3 h-3 rounded-full flex-shrink-0",
                    sig.state === "green" ? "bg-green-400" :
                    sig.state === "amber" ? "bg-amber-400 animate-pulse" :
                    "bg-red-500"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-200 truncate">{sig.junctionName}</p>
                    <p className="text-[10px] text-zinc-600 truncate">{sig.roadLinkDescription}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {sig.controlledBy === "agent" && (
                      <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 px-1">
                        AGENT
                      </Badge>
                    )}
                    {sig.activeEmergencyId && (
                      <p className="mono text-[9px] text-zinc-600 mt-0.5 truncate max-w-[80px]">
                        {sig.activeEmergencyId}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {signals.length === 0 && (
                <p className="text-center text-zinc-600 text-sm py-6">No signals configured</p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Police log */}
        <div className="card-surface">
          <div className="px-4 py-3 border-b border-[#27272a] flex items-center gap-2">
            <span className="dot-red" />
            <p className="text-sm font-semibold text-white">Intervention Log</p>
            <span className="ml-auto mono text-xs text-zinc-500">{allLogs.length} entries</span>
          </div>
          <ScrollArea className="h-80">
            <div className="divide-y divide-[#1f1f22]">
              {allLogs.map((log, i) => (
                <div key={log.id ?? i} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold text-white leading-tight">{log.junctionName}</p>
                    <span className="mono text-[10px] text-zinc-600 flex-shrink-0">{formatTime(log.timestamp)}</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-snug mb-1">{log.roadLinkDescription}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0",
                      log.action.includes("green") || log.action.includes("GREEN")
                        ? "border-green-500/30 text-green-400"
                        : "border-zinc-700 text-zinc-500"
                    )}>
                      {log.action}
                    </Badge>
                    <span className="mono text-[10px] text-zinc-600">{log.emergencyId}</span>
                  </div>
                </div>
              ))}
              {allLogs.length === 0 && (
                <p className="text-center text-zinc-600 text-sm py-8">No interventions yet</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Stats bar */}
      <div className="card-surface mt-4 p-4 grid grid-cols-3 gap-4">
        <div className="text-center">
          <p className="mono text-2xl font-black text-green-400">{greenSignals.length}</p>
          <p className="text-xs text-zinc-600">Signals Green Now</p>
        </div>
        <div className="text-center border-x border-[#27272a]">
          <p className="mono text-2xl font-black text-amber-400">{agentControlled.length}</p>
          <p className="text-xs text-zinc-600">Agent Controlled</p>
        </div>
        <div className="text-center">
          <p className="mono text-2xl font-black text-white">{allLogs.length}</p>
          <p className="text-xs text-zinc-600">Total Interventions</p>
        </div>
      </div>
    </main>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card-surface px-3 py-2 text-center">
      <p className={cn("mono text-lg font-black leading-tight", color)}>{value}</p>
      <p className="text-[10px] text-zinc-600">{label}</p>
    </div>
  );
}