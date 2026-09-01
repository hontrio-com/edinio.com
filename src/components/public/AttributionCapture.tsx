"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/storefront/attribution";

// Records where a storefront visit came from (utm / referrer / ad click id), so
// the order carries its origin. First-party only — runs once per full page load.
/*
  ⚠ `basePath` NU E DE PODOABA. El spune CARE magazin e acesta, iar de el atarna
  doua lucruri: cheia sub care se scrie atributia (altfel toate magazinele de pe
  `www.edinio.com` scriu peste aceeasi valoare) si ce inseamna „referer intern".
  Vezi notele din `lib/storefront/attribution.ts`.
*/
export function AttributionCapture({ basePath }: { basePath: string }) {
  useEffect(() => { captureAttribution(basePath); }, [basePath]);
  return null;
}
