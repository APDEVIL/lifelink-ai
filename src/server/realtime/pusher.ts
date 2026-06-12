// realtime/pusher.ts
// Pusher server client — one instance shared across all server code

import PusherServer from "pusher";

export const pusher = new PusherServer({
  appId: process.env.PUSHER_APP_ID ?? "",
  key: process.env.NEXT_PUBLIC_PUSHER_KEY ?? "",
  secret: process.env.PUSHER_SECRET ?? "",
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "ap2", // ap2 = Asia Pacific
  useTLS: true,
});

// ─── Channel naming conventions ───────────────────────────────────────────────
//
// emergency-{id}        → all stakeholders for one emergency (digital twin)
// corridor-alerts       → all drivers in the city (public)
// police-control        → traffic control room only
// hospital-{id}         → specific hospital ER team
// ambulance-{id}        → specific ambulance crew
// family-{emergencyId}  → patient family view
//
// ─── Event naming conventions ─────────────────────────────────────────────────
//
// session:update        → digital twin state changed
// session:log           → new timeline entry added
// ambulance:location    → GPS position update
// signal:green          → signal flipped green
// signal:red            → signal reset to red
// driver-alert          → move aside notification
// signal-interruption   → police control room log
// bystander-instruction → CPR / first-aid guide step
// hospital:reservation  → bed reserved at hospital
// patient:identified    → face/plate match result
// triage:update         → vitals or priority changed
// session:closed        → emergency resolved

export type PusherChannel =
  | `emergency-${string}`
  | "corridor-alerts"
  | "police-control"
  | `hospital-${string}`
  | `ambulance-${string}`
  | `family-${string}`;
