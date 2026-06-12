// components/bystander/reply-input.tsx
// Text input + voice button for bystander to reply to instructions.
// Sends reply to bystander.guide tRPC route.
// Shows mic animation while listening, send button while typing.

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useVoice } from "@/hooks/use-voice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ReplyInputProps {
  onSubmit: (message: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** After voice transcript is captured, auto-submit without manual send */
  autoSubmitVoice?: boolean;
}

export function ReplyInput({
  onSubmit,
  isLoading = false,
  disabled = false,
  placeholder = "Say what you see, or type your reply…",
  className,
  autoSubmitVoice = true,
}: ReplyInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { isListening, isSupported, transcript, startListening, stopListening, clearTranscript } = useVoice();

  // When voice transcript arrives, fill input and optionally auto-submit
  useEffect(() => {
    if (!transcript) return;
    setText(transcript);
    clearTranscript();
    if (autoSubmitVoice && transcript.trim()) {
      onSubmit(transcript.trim());
      setText("");
    }
  }, [transcript, autoSubmitVoice, onSubmit, clearTranscript]);

  const handleSubmit = useCallback(() => {
    const msg = text.trim();
    if (!msg || isLoading || disabled) return;
    onSubmit(msg);
    setText("");
    inputRef.current?.focus();
  }, [text, isLoading, disabled, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const toggleVoice = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return (
    <div className={cn("relative", className)}>
      {/* Listening indicator above input */}
      {isListening && (
        <div className="absolute -top-8 left-0 right-0 flex items-center justify-center gap-2 text-xs text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
          <span>Listening — speak now…</span>
        </div>
      )}

      <div className="flex gap-2">
        {/* Voice mic button */}
        {isSupported && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={toggleVoice}
            disabled={disabled || isLoading}
            className={cn(
              "w-11 h-11 flex-shrink-0 border-slate-700 transition-all",
              isListening
                ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30"
                : "bg-slate-800 text-slate-400 hover:text-white hover:border-slate-500"
            )}
            aria-label={isListening ? "Stop listening" : "Start voice input"}
          >
            {isListening ? (
              // Animated mic
              <span className="relative flex items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" />
                <MicIcon className="w-4 h-4" />
              </span>
            ) : (
              <MicIcon className="w-4 h-4" />
            )}
          </Button>
        )}

        {/* Text input */}
        <Input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isListening ? "Listening…" : placeholder}
          disabled={disabled || isLoading || isListening}
          className={cn(
            "flex-1 h-11 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500",
            "focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20",
            "transition-colors"
          )}
          aria-label="Your reply"
        />

        {/* Send button */}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || isLoading || disabled}
          className={cn(
            "w-11 h-11 flex-shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white",
            "disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          )}
          aria-label="Send reply"
        >
          {isLoading ? (
            <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <SendIcon className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Quick reply chips */}
      <div className="flex flex-wrap gap-2 mt-2">
        {QUICK_REPLIES.map((reply) => (
          <button
            key={reply}
            type="button"
            onClick={() => {
              if (!isLoading && !disabled) {
                onSubmit(reply);
              }
            }}
            disabled={isLoading || disabled}
            className="text-xs px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400
                       hover:border-slate-500 hover:text-slate-200 disabled:opacity-40
                       transition-colors cursor-pointer"
          >
            {reply}
          </button>
        ))}
      </div>
    </div>
  );
}

const QUICK_REPLIES = [
  "Done",
  "Not breathing",
  "Person is breathing",
  "They're responding",
  "No response",
  "I need help",
];

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  );
}
