import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN, curataEvenimentul, curataFirimitura } from "./optiuni";

/*
  Sentry pe server (runtime Node). Il incarca `src/instrumentation.ts` la pornire.

  ⚠ CAND E PORNIT. `VERCEL_ENV` NU e un discriminator bun: `vercel env pull` il
  scrie si in `.env.local` (vezi nota din next.config.ts), deci ar porni Sentry si
  pe masina de lucru. Ce ramane sigur:
    - `next dev` ruleaza cu NODE_ENV=development, probele cu NODE_ENV=test;
    - `next build` prerandeaza pagini in faza `phase-production-build`, iar o eroare
      de acolo se vede oricum in jurnalul de build, nu are ce cauta in Sentry.
  Ramane pornit doar serverul de productie adevarat, pe Vercel (productie si preview).
*/
const pornit =
  process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build";

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: pornit,
  environment: process.env.VERCEL_ENV ?? "development",
  sendDefaultPii: false,
  maxBreadcrumbs: 30,
  // Ramura din care vine desfasurarea: pe preview-ul redesignului, erorile se vad separat.
  initialScope: { tags: { ramura: process.env.VERCEL_GIT_COMMIT_REF ?? "necunoscuta" } },
  beforeSend: curataEvenimentul,
  beforeBreadcrumb: curataFirimitura,
});
