// hooks/use-pusher.ts
// Low-level hook: subscribe to a Pusher channel + bind events
// All other hooks build on top of this one

"use client";

import { useEffect, useRef, useCallback } from "react";
import { getPusherClient } from "@/lib/pusher-client";
import type { Channel } from "pusher-js";

export type PusherEventHandler<T = unknown> = (data: T) => void;

export interface PusherBinding<T = unknown> {
  event: string;
  handler: PusherEventHandler<T>;
}

/**
 * Subscribe to a Pusher channel and bind multiple events.
 * Automatically unbinds and unsubscribes on unmount.
 *
 * @param channelName  e.g. "emergency-EMR_001" or "police-control"
 * @param bindings     array of { event, handler } pairs
 * @param enabled      set false to skip subscribing (e.g. no emergencyId yet)
 */
export function usePusher(
  channelName: string | null,
  bindings: PusherBinding[],
  enabled = true
): void {
  const channelRef = useRef<Channel | null>(null);
  // Keep bindings in a ref so the effect doesn't re-run on every render
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    if (!enabled || !channelName) return;

    const pusher = getPusherClient();
    const channel = pusher.subscribe(channelName);
    channelRef.current = channel;

    bindingsRef.current.forEach(({ event, handler }) => {
      channel.bind(event, handler);
    });

    return () => {
      bindingsRef.current.forEach(({ event, handler }) => {
        channel.unbind(event, handler);
      });
      pusher.unsubscribe(channelName);
      channelRef.current = null;
    };
  }, [channelName, enabled]);
}

/**
 * One-shot Pusher trigger helper for when you need to send
 * client events (not used often — most triggers go through tRPC).
 */
export function usePusherTrigger() {
  return useCallback((channelName: string, event: string, data: unknown) => {
    const pusher = getPusherClient();
    const channel = pusher.channel(channelName);
    if (channel) {
      channel.trigger(event, data);
    }
  }, []);
}