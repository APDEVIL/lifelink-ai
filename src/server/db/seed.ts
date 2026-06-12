import { db } from "./index";
import {
  patients,
  clinicalReports,
  hospitals,
  ambulances,
  signals,
} from "./schema";

export async function seed() {
  console.log("🌱 Seeding RapidResponse database...");

  // ── PATIENTS ──────────────────────────────────────────────────────────────

  await db.insert(patients).values([
    {
      id: "PAT_2847",
      name: "Ravi Kumar",
      age: 58,
      gender: "M",
      phone: "+91-98765-43210",
      emergencyContact: JSON.stringify({ name: "Meena Kumar", phone: "+91-98765-11111" }),
      vehiclePlate: "KA-01-MF-4892",
      faceEncoding: null, // face-api.js fills this at runtime
    },
    {
      id: "PAT_1033",
      name: "Anitha Reddy",
      age: 45,
      gender: "F",
      phone: "+91-98765-22222",
      emergencyContact: JSON.stringify({ name: "Suresh Reddy", phone: "+91-98765-33333" }),
      vehiclePlate: "KA-03-AB-2211",
      faceEncoding: null,
    },
    {
      id: "PAT_0712",
      name: "Mohammed Farooq",
      age: 34,
      gender: "M",
      phone: "+91-98765-44444",
      emergencyContact: JSON.stringify({ name: "Fatima Farooq", phone: "+91-98765-55555" }),
      vehiclePlate: "KA-05-XY-7890",
      faceEncoding: null,
    },
  ]).onConflictDoNothing();

  // ── CLINICAL REPORTS ──────────────────────────────────────────────────────

  await db.insert(clinicalReports).values([
    {
      id: "RPT_001",
      patientId: "PAT_2847",
      uploadedBy: "Dr. Mehta",
      hospital: "Fortis Hospital Bangalore",
      conditions: JSON.stringify(["Type 2 Diabetes", "Stage 2 Hypertension", "Mild LVH"]),
      medications: JSON.stringify([
        { name: "Metformin", dose: "500mg", frequency: "twice daily" },
        { name: "Amlodipine", dose: "5mg", frequency: "once daily" },
        { name: "Atorvastatin", dose: "10mg", frequency: "once daily" },
      ]),
      allergies: JSON.stringify(["Penicillin"]),
      bloodGroup: "B+",
      ecgNotes: "Mild left ventricular hypertrophy noted. Sinus rhythm. No ST changes at rest.",
      additionalNotes: "Patient advised to reduce sodium intake. Follow-up in 4 weeks.",
      pdfUrl: "/reports/PAT_2847_may24.pdf",
      visitDate: "2024-05-10",
    },
    {
      id: "RPT_002",
      patientId: "PAT_1033",
      uploadedBy: "Dr. Sharma",
      hospital: "Apollo Hospital Bangalore",
      conditions: JSON.stringify(["Asthma", "Anxiety Disorder"]),
      medications: JSON.stringify([
        { name: "Salbutamol Inhaler", dose: "100mcg", frequency: "as needed" },
        { name: "Montelukast", dose: "10mg", frequency: "once daily" },
      ]),
      allergies: JSON.stringify(["Aspirin", "NSAIDs"]),
      bloodGroup: "O+",
      ecgNotes: null,
      additionalNotes: "Carry inhaler at all times. Avoid dust and smoke.",
      pdfUrl: "/reports/PAT_1033_apr24.pdf",
      visitDate: "2024-04-22",
    },
    {
      id: "RPT_003",
      patientId: "PAT_0712",
      uploadedBy: "Dr. Rao",
      hospital: "Manipal Hospital Bangalore",
      conditions: JSON.stringify(["Epilepsy"]),
      medications: JSON.stringify([
        { name: "Levetiracetam", dose: "500mg", frequency: "twice daily" },
      ]),
      allergies: JSON.stringify([]),
      bloodGroup: "AB+",
      ecgNotes: null,
      additionalNotes: "Do not restrain during seizure. Turn on side. Time the episode.",
      pdfUrl: "/reports/PAT_0712_mar24.pdf",
      visitDate: "2024-03-15",
    },
  ]).onConflictDoNothing();

  // ── HOSPITALS ─────────────────────────────────────────────────────────────

  await db.insert(hospitals).values([
    {
      id: "HOSP_001",
      name: "Manipal Hospital Old Airport Road",
      address: "98, HAL Airport Road, Bangalore 560017",
      lat: 12.9592,
      lng: 77.6477,
      phone: "+91-80-2502-4444",
      icuBeds: 20,
      icuAvailable: 4,
      generalBeds: 80,
      generalAvailable: 22,
      oxygenUnits: 50,
      bloodAPos: 10, bloodANeg: 2,
      bloodBPos: 8,  bloodBNeg: 1,
      bloodOPos: 12, bloodONeg: 3,
      bloodAbPos: 4, bloodAbNeg: 1,
      specialistsOnDuty: JSON.stringify([
        "Cardiologist", "Neurosurgeon", "Orthopedic", "Emergency Medicine"
      ]),
      currentLoad: 45,
      isAcceptingEmergency: true,
    },
    {
      id: "HOSP_002",
      name: "Fortis Hospital Bannerghatta",
      address: "154/9, Bannerghatta Road, Bangalore 560076",
      lat: 12.8899,
      lng: 77.5954,
      phone: "+91-80-6621-4444",
      icuBeds: 15,
      icuAvailable: 0, // ICU FULL
      generalBeds: 60,
      generalAvailable: 5,
      oxygenUnits: 20,
      bloodAPos: 5, bloodANeg: 0,
      bloodBPos: 3, bloodBNeg: 0,
      bloodOPos: 7, bloodONeg: 1,
      bloodAbPos: 2, bloodAbNeg: 0,
      specialistsOnDuty: JSON.stringify([
        "General Surgeon", "Emergency Medicine"
      ]),
      currentLoad: 90,
      isAcceptingEmergency: true,
    },
    {
      id: "HOSP_003",
      name: "Apollo Hospital Jayanagar",
      address: "21/1, 9th Main, Jayanagar, Bangalore 560069",
      lat: 12.9271,
      lng: 77.5936,
      phone: "+91-80-4609-4444",
      icuBeds: 12,
      icuAvailable: 2,
      generalBeds: 50,
      generalAvailable: 10,
      oxygenUnits: 35,
      bloodAPos: 8, bloodANeg: 1,
      bloodBPos: 6, bloodBNeg: 1,
      bloodOPos: 10, bloodONeg: 2,
      bloodAbPos: 3, bloodAbNeg: 0,
      specialistsOnDuty: JSON.stringify([
        "Pulmonologist", "Emergency Medicine", "Orthopedic"
      ]),
      currentLoad: 60,
      isAcceptingEmergency: true,
    },
    {
      id: "HOSP_004",
      name: "Narayana Health City",
      address: "258/A, Bommasandra Industrial Area, Bangalore 560099",
      lat: 12.8346,
      lng: 77.6782,
      phone: "+91-80-7122-2200",
      icuBeds: 30,
      icuAvailable: 8,
      generalBeds: 120,
      generalAvailable: 40,
      oxygenUnits: 80,
      bloodAPos: 15, bloodANeg: 4,
      bloodBPos: 12, bloodBNeg: 3,
      bloodOPos: 20, bloodONeg: 5,
      bloodAbPos: 6,  bloodAbNeg: 2,
      specialistsOnDuty: JSON.stringify([
        "Cardiologist", "Cardiac Surgeon", "Neurosurgeon", "Orthopedic",
        "Emergency Medicine", "Pulmonologist"
      ]),
      currentLoad: 55,
      isAcceptingEmergency: true,
    },
    {
      id: "HOSP_005",
      name: "St. John's Medical College Hospital",
      address: "Sarjapur Road, Koramangala, Bangalore 560034",
      lat: 12.9352,
      lng: 77.6245,
      phone: "+91-80-2206-5000",
      icuBeds: 18,
      icuAvailable: 3,
      generalBeds: 70,
      generalAvailable: 15,
      oxygenUnits: 40,
      bloodAPos: 9, bloodANeg: 2,
      bloodBPos: 7, bloodBNeg: 1,
      bloodOPos: 11, bloodONeg: 3,
      bloodAbPos: 4, bloodAbNeg: 1,
      specialistsOnDuty: JSON.stringify([
        "Cardiologist", "Emergency Medicine", "General Surgeon", "Neurologist"
      ]),
      currentLoad: 50,
      isAcceptingEmergency: true,
    },
  ]).onConflictDoNothing();

  // ── AMBULANCES ────────────────────────────────────────────────────────────

  await db.insert(ambulances).values([
    {
      id: "AMB_07",
      vehicleNo: "KA-01-G-7777",
      driverName: "Ramesh Naik",
      paramedicName: "Suresh R.",
      paramedicSkills: JSON.stringify(["cardiac", "trauma", "ALS"]),
      phone: "+91-98765-07070",
      lat: 12.9165, // Near Silk Board
      lng: 77.6220,
      status: "available",
      currentEmergencyId: null,
    },
    {
      id: "AMB_03",
      vehicleNo: "KA-01-G-3333",
      driverName: "Prakash M.",
      paramedicName: "Divya K.",
      paramedicSkills: JSON.stringify(["trauma", "BLS", "pediatric"]),
      phone: "+91-98765-03030",
      lat: 12.9352,
      lng: 77.6105, // Near Koramangala
      status: "available",
      currentEmergencyId: null,
    },
    {
      id: "AMB_11",
      vehicleNo: "KA-01-G-1111",
      driverName: "Venkatesh T.",
      paramedicName: "Anand S.",
      paramedicSkills: JSON.stringify(["cardiac", "stroke", "ALS"]),
      phone: "+91-98765-11110",
      lat: 12.9719,
      lng: 77.6412, // Near Indiranagar
      status: "available",
      currentEmergencyId: null,
    },
    {
      id: "AMB_05",
      vehicleNo: "KA-01-G-5555",
      driverName: "Manjunath B.",
      paramedicName: "Rekha P.",
      paramedicSkills: JSON.stringify(["trauma", "BLS"]),
      phone: "+91-98765-05050",
      lat: 12.9063,
      lng: 77.5857, // Near JP Nagar
      status: "available",
      currentEmergencyId: null,
    },
  ]).onConflictDoNothing();

  // ── TRAFFIC SIGNALS ───────────────────────────────────────────────────────
  // Real Bangalore junctions with road-link IDs
  // road_link_id format: JUNCTION_CODE_DIRECTION

  await db.insert(signals).values([
    // Silk Board
    {
      id: "SIG_001",
      junctionName: "Silk Board Junction",
      roadLinkId: "SB_04",
      roadLinkDescription: "Hosur Road inbound → Koramangala direction",
      lat: 12.9176,
      lng: 77.6228,
      state: "red",
      controlledBy: "auto",
    },
    {
      id: "SIG_002",
      junctionName: "Silk Board Junction",
      roadLinkId: "SB_06",
      roadLinkDescription: "Hosur Road → Bommanahalli direction",
      lat: 12.9172,
      lng: 77.6231,
      state: "red",
      controlledBy: "auto",
    },
    // Intermediate Ring Road (IRR)
    {
      id: "SIG_003",
      junctionName: "Agara Junction (IRR)",
      roadLinkId: "IRR_11",
      roadLinkDescription: "Intermediate Ring Road → BTM direction",
      lat: 12.9252,
      lng: 77.6340,
      state: "red",
      controlledBy: "auto",
    },
    {
      id: "SIG_004",
      junctionName: "HSR Layout Junction",
      roadLinkId: "HSR_03",
      roadLinkDescription: "HSR Layout Sector 2 → Outer Ring Road",
      lat: 12.9122,
      lng: 77.6440,
      state: "red",
      controlledBy: "auto",
    },
    // Old Airport Road
    {
      id: "SIG_005",
      junctionName: "Old Airport Road Junction",
      roadLinkId: "OAR_02",
      roadLinkDescription: "Old Airport Road → HAL direction",
      lat: 12.9560,
      lng: 77.6470,
      state: "red",
      controlledBy: "auto",
    },
    {
      id: "SIG_006",
      junctionName: "Domlur Junction",
      roadLinkId: "DOM_01",
      roadLinkDescription: "Domlur Flyover → Indiranagar",
      lat: 12.9608,
      lng: 77.6387,
      state: "red",
      controlledBy: "auto",
    },
    // Outer Ring Road
    {
      id: "SIG_007",
      junctionName: "Marathahalli Junction",
      roadLinkId: "MRT_05",
      roadLinkDescription: "Outer Ring Road → Marathahalli Bridge",
      lat: 12.9591,
      lng: 77.6971,
      state: "red",
      controlledBy: "auto",
    },
    {
      id: "SIG_008",
      junctionName: "Bellandur Junction",
      roadLinkId: "BEL_02",
      roadLinkDescription: "Sarjapur Road → Bellandur Gate",
      lat: 12.9253,
      lng: 77.6759,
      state: "red",
      controlledBy: "auto",
    },
    // Koramangala
    {
      id: "SIG_009",
      junctionName: "Koramangala 5th Block",
      roadLinkId: "KRM_07",
      roadLinkDescription: "80 Feet Road Koramangala → Sony World Junction",
      lat: 12.9347,
      lng: 77.6205,
      state: "red",
      controlledBy: "auto",
    },
    {
      id: "SIG_010",
      junctionName: "Sony World Junction",
      roadLinkId: "SW_01",
      roadLinkDescription: "Sony World → St John's Hospital Road",
      lat: 12.9365,
      lng: 77.6248,
      state: "red",
      controlledBy: "auto",
    },
  ]).onConflictDoNothing();

  console.log("✅ Seed complete:");
  console.log("   → 3 patients");
  console.log("   → 3 clinical reports");
  console.log("   → 5 hospitals (Bangalore)");
  console.log("   → 4 ambulances");
  console.log("   → 10 traffic signals");
}

// Run if called directly
seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
