"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/trpc/react";
import { usePusher, type SessionLogPayload } from "@/lib/pusher";
import { formatTime, roleIcon } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

type LogEntry = {
  id: string;
  role: string;
  eventType: string;
  message: string;
  createdAt: string;
};

export function EmergencyTimeline({ emergencyId }: { emergencyId: string }) {
  const { data: initial } = api.session.getTimeline.useQuery({ emergencyId });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initial) setLogs(initial as LogEntry[]);
  }, [initial]);

  // Live updates via Pusher
  usePusher<SessionLogPayload>(
    `emergency-${emergencyId}`,
    "session:log",
    (data) => {
      setLogs((prev) => [
        ...prev,
        {
          id: `live-${Date.now()}`,
          role: data.role,
          eventType: data.eventType,
          message: data.message,
          createdAt: data.createdAt,
        },
      ]);
    },
    !!emergencyId
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  if (!emergencyId) return null;

  return (
    <div className="card-surface flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[#27272a] flex items-center gap-2">
        <span className="dot-red" />
        <span className="text-sm font-medium text-zinc-300">Live Timeline</span>
        <span className="ml-auto mono text-xs text-zinc-500">{logs.length} events</span>
      </div>
      <ScrollArea className="flex-1 px-4 py-2">
        <div className="space-y-1">
          {logs.map((log, i) => (
            <div key={log.id ?? i} className="flex gap-3 py-2 border-b border-[#1f1f22] last:border-0">
              <div className="flex-shrink-0 w-6 text-center text-base leading-tight mt-0.5">
                {roleIcon(log.role)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {log.role}
                  </span>
                  <span className="mono text-[10px] text-zinc-600">
                    {log.eventType}
                  </span>
                  <span className="ml-auto mono text-[10px] text-zinc-600 flex-shrink-0">
                    {formatTime(log.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-zinc-200 leading-snug">{log.message}</p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}