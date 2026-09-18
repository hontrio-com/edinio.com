import * as Sentry from "@sentry/nextjs";

/*
  Punctul de intrare pe server al instrumentarii (Next.js il cheama o data, la
  pornirea fiecarei instante).

  Doar runtime-ul Node: aplicatia n-are nicio ruta pe edge (verificat la
  18.09.2026, zero `runtime = "edge"`), iar `proxy.ts` ruleaza si el pe Node in
  Next 16. O configurare de edge fara nicio ruta care s-o foloseasca ar fi cod mort.

  ⚠ Ce NU prinde: erorile din `proxy.ts`. Sub Turbopack, Sentry nu initializeaza
  instanta separata a proxy-ului (getsentry/sentry-javascript#21713). Acolo raman
  jurnalele Vercel.
*/
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/sentry/server");
  }
}

/** Erorile din componentele de server, rutele API si actiunile de server. */
export const onRequestError = Sentry.captureRequestError;
