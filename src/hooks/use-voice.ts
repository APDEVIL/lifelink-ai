// hooks/use-voice.ts
// Web Speech API wrapper — speak() for TTS, startListening() for STT.
// Used by bystander copilot to read instructions aloud and accept voice replies.

"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface VoiceState {
  isSpeaking: boolean;
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  error: string | null;
}

// ─── Web Speech API types ─────────────────────────────────────────────────────
// SpeechRecognition is not in every TS lib config.
// We declare a minimal local interface so the hook compiles without
// requiring @types/dom-speech-recognition or a custom tsconfig lib entry.

interface SpeechRecognitionResult {
  readonly 0: { readonly transcript: string };
  readonly isFinal: boolean;
}

interface SpeechRecognitionResultList {
  readonly 0: SpeechRecognitionResult | undefined;
  readonly length: number;
}

interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:  ((event: SpeechRecognitionEvent) => void) | null;
  onerror:   ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend:     (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

// Constructor shape
interface SpeechRecognitionConstructor {
  new (): ISpeechRecognition;
}

// Augment Window so TS knows about the vendor-prefixed API
interface SpeechRecognitionWindow {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoice() {
  const [state, setState] = useState<VoiceState>({
    isSpeaking: false,
    isListening: false,
    isSupported: false,
    transcript: "",
    error: null,
  });

  const synthRef      = useRef<SpeechSynthesis | null>(null);
  // FIX: typed against our local ISpeechRecognition instead of the missing global
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const hasSynth = "speechSynthesis" in window;
    const hasRecog =
      "SpeechRecognition" in window || "webkitSpeechRecognition" in window;

    setState((prev) => ({ ...prev, isSupported: hasSynth || hasRecog }));

    if (hasSynth) synthRef.current = window.speechSynthesis;

    if (hasRecog) {
      // FIX: cast window through our augmented interface to resolve vendor prefix
      const win = window as unknown as SpeechRecognitionWindow;
      const API = win.SpeechRecognition ?? win.webkitSpeechRecognition;

      if (API) {
        const rec = new API();
        rec.continuous      = false;
        rec.interimResults  = false;
        rec.lang            = "en-IN"; // Indian English for Bangalore context

        rec.onresult = (event: SpeechRecognitionEvent) => {
          const text = event.results[0]?.[0]?.transcript ?? "";
          setState((prev) => ({ ...prev, transcript: text, isListening: false }));
        };

        rec.onerror = (event: SpeechRecognitionErrorEvent) => {
          setState((prev) => ({
            ...prev,
            error: `Voice error: ${event.error}`,
            isListening: false,
          }));
        };

        rec.onend = () => {
          setState((prev) => ({ ...prev, isListening: false }));
        };

        recognitionRef.current = rec;
      }
    }

    return () => {
      synthRef.current?.cancel();
      recognitionRef.current?.abort();
    };
  }, []);

  // ── Speak (TTS) ──────────────────────────────────────────────────────────
  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!synthRef.current) return;

    synthRef.current.cancel(); // stop any current speech

    const utterance    = new SpeechSynthesisUtterance(text);
    utterance.lang     = "en-IN";
    utterance.rate     = 0.9;  // slightly slower for emergency context
    utterance.pitch    = 1.0;
    utterance.volume   = 1.0;

    // Prefer a clear female voice if available
    const voices    = synthRef.current.getVoices();
    const preferred =
      voices.find((v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("female")) ??
      voices.find((v) => v.lang.startsWith("en")) ??
      null;

    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setState((prev) => ({ ...prev, isSpeaking: true }));
    utterance.onend   = () => {
      setState((prev) => ({ ...prev, isSpeaking: false }));
      onEnd?.();
    };
    utterance.onerror = () => setState((prev) => ({ ...prev, isSpeaking: false }));

    synthRef.current.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    synthRef.current?.cancel();
    setState((prev) => ({ ...prev, isSpeaking: false }));
  }, []);

  // ── Listen (STT) ─────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    setState((prev) => ({ ...prev, transcript: "", isListening: true, error: null }));
    try {
      recognitionRef.current.start();
    } catch {
      // Already started — ignore duplicate-start errors
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setState((prev) => ({ ...prev, isListening: false }));
  }, []);

  const clearTranscript = useCallback(() => {
    setState((prev) => ({ ...prev, transcript: "" }));
  }, []);

  return {
    ...state,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    clearTranscript,
  };
}