import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  SENTRY: CE SE TRIMITE SI CE NU (18.09.2026)
  ═══════════════════════════════════════════════════════════════════════════════

  De ce exista: pana azi, `error.tsx` si `global-error.tsx` primeau eroarea si o
  aruncau. O cadere a dashboardului in browserul unui comerciant nu lasa nicio
  urma nicaieri. `error_logs` prinde doar ce scriem noi de mana, si numai pe server.

  DSN-ul NU e secret: ajunge oricum in browser, e facut sa fie public. Sta aici, nu
  intr-o variabila de mediu, ca sa nu existe o cheie noua in Vercel de care sa
  atarne desfasurarea (vezi `CHEI_OBLIGATORII` din next.config.ts). Singurul secret
  e `SENTRY_AUTH_TOKEN`, folosit numai la build, pentru source maps.

  Regiunea e UE (`ingest.de.sentry.io`), fiindca prin erori pot trece date din
  comenzi: nume, telefoane, adrese. Din acelasi motiv:
    - `sendDefaultPii: false`: fara IP, fara cookie-uri, fara antete de autentificare;
    - adresele pierd query string-ul (acolo stau jetoane de resetare, coduri OAuth,
      id-uri de plata), si in eveniment, si in firimituri;
    - firimiturile din consola nu pleaca deloc: `console.log` al cuiva poate
      contine o comanda intreaga;
    - fara Session Replay si fara tracing: doar erori.
*/
export const SENTRY_DSN =
  "https://80d7a49272135220fb0075a880fb7e39@o4511605053325312.ingest.de.sentry.io/4511605059878992";

/*
  ⚠ ACEEASI EROARE, REPETATA, POATE ARDE COTA PE O LUNA.

  Sunt 47 de cronuri, unele pornesc in fiecare minut. Unul care cade la fiecare
  rulare trimite 60 de evenimente pe ora, adica ~43.000 pe luna, de noua ori cota
  planului gratuit, si toate spun acelasi lucru. Sentry le grupeaza intr-o singura
  problema, dar le NUMARA pe fiecare.

  Plafonul e pe instanta (o harta in memorie): pe Vercel instantele se refolosesc,
  deci taie grosul, fara sa fie o garantie. Prima aparitie trece intotdeauna, deci
  nicio eroare noua nu se pierde; se taie doar repetarile ei.
*/
const FEREASTRA_MS = 10 * 60 * 1000;
const MAX_IN_FEREASTRA = 5;
const MAX_CHEI = 500;
const vazute = new Map<string, { de_la: number; cate: number }>();

function amprenta(event: ErrorEvent): string {
  const exceptie = event.exception?.values?.[0];
  if (exceptie) return `${exceptie.type ?? ""}:${(exceptie.value ?? "").slice(0, 200)}`;
  return `mesaj:${(event.message ?? "").slice(0, 200)}`;
}

export function treceDePlafon(event: ErrorEvent, acum = Date.now()): boolean {
  const cheie = amprenta(event);
  const stare = vazute.get(cheie);
  if (!stare || acum - stare.de_la > FEREASTRA_MS) {
    if (vazute.size >= MAX_CHEI) vazute.clear();
    vazute.set(cheie, { de_la: acum, cate: 1 });
    return true;
  }
  stare.cate += 1;
  return stare.cate <= MAX_IN_FEREASTRA;
}

/** Adresa fara query string si fara fragment. Ce nu se poate citi ca adresa ramane neatins. */
export function faraQuery(adresa: string): string {
  const i = adresa.search(/[?#]/);
  return i === -1 ? adresa : adresa.slice(0, i);
}

export function curataEvenimentul(event: ErrorEvent): ErrorEvent | null {
  if (!treceDePlafon(event)) return null;
  if (event.request) {
    if (event.request.url) event.request.url = faraQuery(event.request.url);
    delete event.request.query_string;
    delete event.request.cookies;
    delete event.request.data;
  }
  return event;
}

export function curataFirimitura(firimitura: Breadcrumb): Breadcrumb | null {
  if (firimitura.category === "console") return null;
  const date = firimitura.data;
  if (date) {
    for (const camp of ["url", "from", "to"] as const) {
      if (typeof date[camp] === "string") date[camp] = faraQuery(date[camp]);
    }
  }
  return firimitura;
}
