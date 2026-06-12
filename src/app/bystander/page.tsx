"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/trpc/react";
import { usePusher } from "@/lib/pusher";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Phase = "idle" | "locating" | "triggered" | "chatting";
type Msg = { role: "user" | "assistant"; content: string };
type EmergencyType =
  | "cardiac_arrest"
  | "choking"
  | "bleeding"
  | "stroke"
  | "seizure"
  | "unconscious"
  | "breathing_difficulty"
  | "unknown";

export default function BystanderPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [emergencyId, setEmergencyId] = useState("");
  const [emergencyType, setEmergencyType] = useState<EmergencyType>("unknown");
  const [ambulanceEta, setAmbulanceEta] = useState(8);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [userInput, setUserInput] = useState("");
  const [step, setStep] = useState(1);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sosTrigger = api.sos.trigger.useMutation();
  const replyMutation = api.bystander.reply.useMutation();

  // Live bystander instructions from commander
  usePusher<{ instruction: string }>(
    `emergency-${emergencyId}`,
    "bystander-instruction",
    ({ instruction }) => {
      setMessages((prev) => [...prev, { role: "assistant", content: instruction }]);
    },
    !!emergencyId,
  );

  // Ambulance ETA updates
  usePusher<{ etaSeconds: number }>(
    `emergency-${emergencyId}`,
    "ambulance:location",
    ({ etaSeconds }) => {
      if (etaSeconds) setAmbulanceEta(Math.ceil(etaSeconds / 60));
    },
    !!emergencyId,
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  async function getLocation(): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({ lat: 12.9716, lng: 77.5946 }), // Bangalore fallback
      );
    });
  }

  async function triggerSOS() {
    if (!description.trim()) { toast.error("Describe what's happening"); return; }
    setPhase("locating");
    const loc = await getLocation();
    setLocation(loc);

    try {
      const res = await sosTrigger.mutateAsync({
        description,
        lat: loc.lat,
        lng: loc.lng,
        reportedBy: "anonymous",
      });

      setEmergencyId(res.emergencyId);
      setEmergencyType((res.classification?.likelyCause as EmergencyType) ?? "unknown");
      if (res.corridor?.etaMinutes) setAmbulanceEta(res.corridor.etaMinutes);

      if (res.bystanderInstruction && typeof res.bystanderInstruction === "string") {
        setMessages([{ role: "assistant", content: res.bystanderInstruction as string }]);
      }
      setPhase("chatting");
      toast.success(`Emergency reported · ID: ${res.emergencyId}`);
    } catch {
      toast.error("Failed to send SOS. Try again.");
      setPhase("idle");
    }
  }

  async function sendReply() {
    if (!userInput.trim() || sending) return;
    const userMsg = userInput.trim();
    setUserInput("");
    setSending(true);

    const newMessages: Msg[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);

    try {
      const res = await replyMutation.mutateAsync({
        emergencyId,
        emergencyType,
        bystanderMessage: userMsg,
        conversationHistory: newMessages,
        stepNumber: step,
        ambulanceEtaMinutes: ambulanceEta,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: res.instruction }]);
      setStep((s) => s + 1);
    } catch {
      toast.error("Connection issue. Keep following the last instruction.");
    } finally {
      setSending(false);
    }
  }

  // ─── IDLE / LOCATING STATE ───────────────────────────────────────────────────
  if (phase === "idle" || phase === "locating") {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center p-6">
        {/* Big SOS ring */}
        <div className="relative mb-10">
          <div className="flex h-32 w-32 items-center justify-center rounded-full border-2 border-red-500/30 bg-red-500/10">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-red-500/40 bg-red-500/20">
              <span className="text-4xl">🆘</span>
            </div>
          </div>
          {phase === "locating" && (
            <div className="absolute inset-0 animate-ping rounded-full border-2 border-red-500 opacity-30" />
          )}
        </div>

        <h1 className="mb-2 text-center text-3xl font-black text-white">Emergency?</h1>
        <p className="mb-8 text-center text-sm text-zinc-400">
          Describe what&apos;s happening. Help is on the way.
        </p>

        <Textarea
          className="mb-4 w-full resize-none border-[#27272a] bg-[#18181b] text-white placeholder:text-zinc-600"
          placeholder="e.g. Person collapsed, not breathing, chest pains..."
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <Button
          className="h-14 w-full rounded-xl bg-red-600 text-lg font-black text-white hover:bg-red-700"
          disabled={phase === "locating"}
          type="button"
          onClick={triggerSOS}
        >
          {phase === "locating" ? "Locating…" : "SEND SOS"}
        </Button>

        <p className="mt-4 text-center text-xs text-zinc-600">
          Your location will be shared with emergency services
        </p>
      </main>
    );
  }

  // ─── CHAT STATE ──────────────────────────────────────────────────────────────
  return (
    <main className="mx-auto flex h-screen max-w-lg flex-col">
      {/* Header bar */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-[#27272a] bg-[#18181b] px-4 py-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="text-sm font-bold text-white">Emergency Active</span>
          </div>
          <p className="mono text-xs text-zinc-500">{emergencyId}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500">Ambulance ETA</p>
          <p className="mono text-lg font-bold leading-tight text-amber-400">{ambulanceEta}m</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((msg, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: append-only chat list
          <div
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            key={i}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "rounded-br-sm bg-zinc-800 text-zinc-200"
                  : "rounded-bl-sm border border-red-500/30 bg-red-600/20 text-white"
              }`}
            >
              {msg.role === "assistant" && (
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-red-400">
                  AI First-Aid Guide
                </p>
              )}
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm border border-red-500/20 bg-red-600/10 px-4 py-3">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-red-400 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-red-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-red-400 [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-[#27272a] bg-[#0a0a0b] px-4 pb-6 pt-2">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl border border-[#27272a] bg-[#18181b] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-red-500/50"
            placeholder="Reply to the guide…"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendReply()}
          />
          <button
            className="rounded-xl bg-red-600 px-4 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            disabled={sending}
            type="button"
            onClick={sendReply}
          >
            →
          </button>
        </div>
      </div>
    </main>
  );
}