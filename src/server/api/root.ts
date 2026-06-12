// server/api/root.ts
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { sosRouter } from "@/server/api/routers/sos";
import { ambulanceRouter } from "@/server/api/routers/ambulance";
import { hospitalRouter } from "@/server/api/routers/hospital";
import { patientRouter } from "@/server/api/routers/patient";
import { reportRouter } from "@/server/api/routers/report";
import { triageRouter } from "@/server/api/routers/triage";
import { bystanderRouter } from "@/server/api/routers/bystander";
import { corridorRouter } from "@/server/api/routers/corridor";
import { sessionRouter } from "@/server/api/routers/session";

export const appRouter = createTRPCRouter({
  sos: sosRouter,
  ambulance: ambulanceRouter,
  hospital: hospitalRouter,
  patient: patientRouter,
  report: reportRouter,
  triage: triageRouter,
  bystander: bystanderRouter,
  corridor: corridorRouter,
  session: sessionRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);