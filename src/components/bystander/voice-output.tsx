// components/bystander/voice-output.tsx
// Text-to-speech control bar for the bystander copilot.
// Auto-speaks when a new instruction arrives if autoSpeak is true.

"use client";

import { useEffect, useRef } from "react";
import { useVoice } from "@/hooks/use-voice";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VoiceOutputProps {
  text: string;
  autoSpeak?: boolean;
  className?: string;
  onSpeakEnd?: () => void;
}

export function VoiceOutput({ text, autoSpeak = true, className, onSpeakEnd }: VoiceOutputProps) {
  const { isSpeaking, isSupported, speak, stopSpeaking } = useVoice();
  const lastTextRef = useRef<string>("");

  // Auto-speak when text changes
  useEffect(() => {
    if (!autoSpeak || !isSupported || !text || text === lastTextRef.current) return;
    lastTextRef.current = text;
    speak(text, onSpeakEnd);
  }, [text, autoSpeak, isSupported, speak, onSpeakEnd]);

  if (!isSupported) return null;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {isSpeaking ? (
        <>
          {/* Animated sound wave */}
          <div className="flex items-end gap-0.5 h-5" aria-hidden>
            {[1, 2, 3, 4, 3, 2, 1].map((h, i) => (
              <span
                key={i}
                className="w-0.5 bg-emerald-400 rounded-full"
                style={{
                  height: `${h * 4}px`,
                  animation: `soundwave 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                }}
              />
            ))}
          </div>
          <span className="text-xs text-emerald-400 font-medium">Speaking…</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={stopSpeaking}
            className="h-7 px-2 text-xs text-slate-400 hover:text-white"
            aria-label="Stop speaking"
          >
            Stop
          </Button>
        </>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => speak(text, onSpeakEnd)}
          disabled={!text}
          className="h-7 px-2 text-xs text-slate-400 hover:text-emerald-400 flex items-center gap-1.5"
          aria-label="Read instruction aloud"
        >
          {/* Speaker icon */}
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-3-3m3 3l3-3M6.343 9.343a8 8 0 000 5.314" />
          </svg>
          Read aloud
        </Button>
      )}

      <style>{`
        @keyframes soundwave {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
