import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN, curataEvenimentul, curataFirimitura } from "./optiuni";

/*
  Sentry in browser. Modulul NU se importa static de nicaieri: il aduce
  `instrumentation-client.ts` (sau o granita de eroare) cu `import()`, ca sa ajunga
  intr-o bucata separata, descarcata doar cand e nevoie. Vezi acolo de ce.
*/
let pornit = false;

/** Mediul, citit din gazda: in browser nu exista `VERCEL_ENV`. */
function mediu(): string {
  const gazda = window.location.hostname;
  if (gazda === "localhost" || gazda === "127.0.0.1") return "development";
  if (gazda.endsWith(".vercel.app")) return "preview";
  return "production";
}

export function porneste(): void {
  if (pornit) return;
  pornit = true;
  const m = mediu();
  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: process.env.NODE_ENV === "production" && m !== "development",
    environment: m,
    sendDefaultPii: false,
    maxBreadcrumbs: 30,
    beforeSend: curataEvenimentul,
    beforeBreadcrumb: curataFirimitura,
  });
}

export function captureaza(eroare: unknown): void {
  porneste();
  Sentry.captureException(eroare);
}
