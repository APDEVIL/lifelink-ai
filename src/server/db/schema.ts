import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// ─── PATIENTS ────────────────────────────────────────────────────────────────

export const patients = pgTable("patients", {
  id: text("id").primaryKey(), // PAT_XXXX
  name: text("name").notNull(),
  age: integer("age").notNull(),
  gender: text("gender", { enum: ["M", "F", "Other"] }).notNull(),
  phone: text("phone"),
  emergencyContact: text("emergency_contact"), // name + phone JSON
  faceEncoding: text("face_encoding"), // JSON face descriptor from face-api.js
  vehiclePlate: text("vehicle_plate"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .defaultNow(),
});

// ─── CLINICAL REPORTS ─────────────────────────────────────────────────────────

export const clinicalReports = pgTable("clinical_reports", {
  id: text("id").primaryKey(), // RPT_XXXX
  patientId: text("patient_id")
    .notNull()
    .references(() => patients.id),
  uploadedBy: text("uploaded_by").notNull(), // doctor name
  hospital: text("hospital").notNull(), // where it was uploaded
  conditions: text("conditions").notNull(), // JSON array: ["Type 2 Diabetes", "Hypertension"]
  medications: text("medications").notNull(), // JSON array: [{name, dose, frequency}]
  allergies: text("allergies").notNull(), // JSON array: ["Penicillin"]
  bloodGroup: text("blood_group").notNull(), // "B+"
  ecgNotes: text("ecg_notes"), // free text
  additionalNotes: text("additional_notes"),
  pdfUrl: text("pdf_url"), // path to stored PDF
  visitDate: text("visit_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .defaultNow(),
});

// ─── HOSPITALS ───────────────────────────────────────────────────────────────

export const hospitals = pgTable("hospitals", {
  id: text("id").primaryKey(), // HOSP_XXXX
  name: text("name").notNull(),
  address: text("address").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  phone: text("phone").notNull(),

  // Bed availability
  icuBeds: integer("icu_beds").notNull().default(0),
  icuAvailable: integer("icu_available").notNull().default(0),
  generalBeds: integer("general_beds").notNull().default(0),
  generalAvailable: integer("general_available").notNull().default(0),

  // Resources
  oxygenUnits: integer("oxygen_units").notNull().default(0), // cylinders
  bloodAPos: integer("blood_a_pos").notNull().default(0),
  bloodANeg: integer("blood_a_neg").notNull().default(0),
  bloodBPos: integer("blood_b_pos").notNull().default(0),
  bloodBNeg: integer("blood_b_neg").notNull().default(0),
  bloodOPos: integer("blood_o_pos").notNull().default(0),
  bloodONeg: integer("blood_o_neg").notNull().default(0),
  bloodAbPos: integer("blood_ab_pos").notNull().default(0),
  bloodAbNeg: integer("blood_ab_neg").notNull().default(0),

  // Specialists on duty (JSON array of specializations)
  specialistsOnDuty: text("specialists_on_duty").notNull().default("[]"),

  // Scores
  currentLoad: integer("current_load").notNull().default(0), // 0-100
  isAcceptingEmergency: boolean("is_accepting_emergency")
    .notNull()
    .default(true),

  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .defaultNow(),
});

// ─── AMBULANCES ──────────────────────────────────────────────────────────────

export const ambulances = pgTable("ambulances", {
  id: text("id").primaryKey(), // AMB_XX
  vehicleNo: text("vehicle_no").notNull(), // KA-01-AB-1234
  driverName: text("driver_name").notNull(),
  paramedicName: text("paramedic_name").notNull(),
  paramedicSkills: text("paramedic_skills").notNull().default("[]"), // JSON: ["cardiac","trauma"]
  phone: text("phone").notNull(),

  // Live location
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),

  status: text("status", {
    enum: ["available", "dispatched", "on_scene", "transporting", "returning"],
  })
    .notNull()
    .default("available"),

  currentEmergencyId: text("current_emergency_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .defaultNow(),
});

// ─── EMERGENCIES ─────────────────────────────────────────────────────────────

export const emergencies = pgTable("emergencies", {
  id: text("id").primaryKey(), // EMG_XXXX
  description: text("description").notNull(),
  reportedBy: text("reported_by"), // bystander name or "anonymous"

  // Location
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  address: text("address"),

  // Classification (filled by commander agent)
  severity: text("severity", { enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] })
    .notNull()
    .default("HIGH"),
  likelyCause: text("likely_cause"), // "cardiac arrest", "trauma", etc.

  // Assigned resources
  assignedAmbulanceId: text("assigned_ambulance_id"),
  assignedHospitalId: text("assigned_hospital_id"),
  patientId: text("patient_id"), // null until identified

  // Status
  status: text("status", {
    enum: [
      "active",
      "ambulance_dispatched",
      "on_scene",
      "transporting",
      "arrived",
      "closed",
    ],
  })
    .notNull()
    .default("active"),

  // Survival score chosen hospital received
  survivalScore: real("survival_score"),

  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true, mode: "string" }),
});

// ─── TRIAGE ──────────────────────────────────────────────────────────────────

export const triages = pgTable("triages", {
  id: text("id").primaryKey(), // TRI_XXXX
  emergencyId: text("emergency_id")
    .notNull()
    .references(() => emergencies.id),

  // Priority: P1 = Immediate, P2 = Urgent, P3 = Non-urgent
  priority: text("priority", { enum: ["P1", "P2", "P3"] }).notNull(),
  priorityLabel: text("priority_label").notNull(), // "Immediate - Cardiac"

  // Vitals (null if not measured yet)
  bpSystolic: integer("bp_systolic"),
  bpDiastolic: integer("bp_diastolic"),
  heartRate: integer("heart_rate"),
  spo2: integer("spo2"), // oxygen saturation %
  gcs: integer("gcs"), // Glasgow Coma Scale 3-15
  temperature: real("temperature"), // celsius
  glucoseLevel: real("glucose_level"), // mmol/L

  // Steps taken on scene (JSON array of strings)
  stepsTaken: text("steps_taken").notNull().default("[]"),

  // Claude AI summary for paramedic
  aiSummary: text("ai_summary"),

  recordedBy: text("recorded_by").notNull(), // paramedic name
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .defaultNow(),
});

// ─── TRAFFIC SIGNALS ─────────────────────────────────────────────────────────

export const signals = pgTable("signals", {
  id: text("id").primaryKey(), // SIG_XXXX
  junctionName: text("junction_name").notNull(), // "Silk Board Junction"
  roadLinkId: text("road_link_id").notNull(), // "SB_04" — unique per direction
  roadLinkDescription: text("road_link_description").notNull(), // "Hosur Road inbound → Koramangala"

  lat: real("lat").notNull(),
  lng: real("lng").notNull(),

  // Current state
  state: text("state", { enum: ["red", "green", "amber"] })
    .notNull()
    .default("red"),
  controlledBy: text("controlled_by", { enum: ["auto", "agent", "manual"] })
    .notNull()
    .default("auto"),

  // Which emergency triggered the last green
  activeEmergencyId: text("active_emergency_id"),

  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .defaultNow(),
});

// ─── SESSION LOG (Digital Twin) ───────────────────────────────────────────────

export const sessionLogs = pgTable("session_logs", {
  id: text("id").primaryKey(), // LOG_XXXX
  emergencyId: text("emergency_id")
    .notNull()
    .references(() => emergencies.id),

  // Who triggered this log entry
  role: text("role", {
    enum: [
      "system",
      "commander",
      "ambulance",
      "hospital",
      "paramedic",
      "bystander",
      "traffic",
      "family",
    ],
  }).notNull(),

  eventType: text("event_type").notNull(),
  // e.g. "SOS_TRIGGERED", "AMBULANCE_DISPATCHED", "PATIENT_IDENTIFIED",
  //      "HOSPITAL_RESERVED", "SIGNAL_CLEARED", "VITALS_UPDATED",
  //      "REPORT_SHARED", "SESSION_CLOSED"

  message: text("message").notNull(), // Human readable description
  metadata: text("metadata").default("{}"), // JSON extra data

  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .defaultNow(),
});

// ─── TYPE EXPORTS ─────────────────────────────────────────────────────────────

export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;

export type ClinicalReport = typeof clinicalReports.$inferSelect;
export type NewClinicalReport = typeof clinicalReports.$inferInsert;

export type Hospital = typeof hospitals.$inferSelect;
export type NewHospital = typeof hospitals.$inferInsert;

export type Ambulance = typeof ambulances.$inferSelect;
export type NewAmbulance = typeof ambulances.$inferInsert;

export type Emergency = typeof emergencies.$inferSelect;
export type NewEmergency = typeof emergencies.$inferInsert;

export type Triage = typeof triages.$inferSelect;
export type NewTriage = typeof triages.$inferInsert;

export type Signal = typeof signals.$inferSelect;
export type NewSignal = typeof signals.$inferInsert;

export type SessionLog = typeof sessionLogs.$inferSelect;
export type NewSessionLog = typeof sessionLogs.$inferInsert;