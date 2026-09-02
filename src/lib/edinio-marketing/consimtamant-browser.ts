"use client";

import { useSyncExternalStore } from "react";
import {
  parseaza, serializeaza, validVid, VERSIUNE,
  type Stare, type Metoda, type Categorie,
} from "./consimtamant/stare";
import { NUME_COOKIE, atributeCookie, eCookieDeMaturat } from "./consimtamant/cookie";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  HOTARAREA, DIN BROWSER
  ═══════════════════════════════════════════════════════════════════════════════
*/

export const EVENIMENT_SCHIMBAT = "edinio-consimtamant-schimbat";
export const EVENIMENT_DESCHIDE_SETARI = "edinio-deschide-setari-cookie";

function acum(): number {
  return Math.floor(Date.now() / 1000);
}

export function citesteCookie(nume: string): string | null {
  if (typeof document === "undefined") return null;
  for (const bucata of document.cookie.split(";")) {
    const i = bucata.indexOf("=");
    if (i < 0) continue;
    if (bucata.slice(0, i).trim() === nume) return decodeURIComponent(bucata.slice(i + 1));
  }
  return null;
}

export function citesteStarea(): Stare | null {
  return parseaza(citesteCookie(NUME_COOKIE), acum());
}

/**
 * Naste un id de vizitator.
 *
 * ⚠ SE NASTE LA APASAREA CARE ACORDA MARKETING, niciodata la incarcarea paginii.
 * Un identificator publicitar scris pe terminal inainte de acord e chiar fapta
 * pentru care s-au dat amenzi in Romania. Deci: fara acord, nu exista.
 */
function nasteVid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "");
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Sterge cookie-urile furnizorilor.
 *
 * ⚠ PE AMBELE VARIANTE DE DOMENIU. Un cookie scris de Meta pe `.edinio.com` nu se
 * sterge cu o comanda fara `Domain` — browserul le tine ca pe doua lucruri
 * deosebite. Sters doar pe unul, celalalt ramane, iar retragerea pare facuta.
 */
function maturaCookieFurnizori(): void {
  if (typeof document === "undefined") return;
  const gazda = location.hostname;
  const domenii = ["", `; Domain=${gazda}`, `; Domain=.${gazda.replace(/^www\./, "")}`];
  for (const bucata of document.cookie.split(";")) {
    const nume = bucata.split("=")[0]?.trim();
    if (!nume || !eCookieDeMaturat(nume)) continue;
    for (const d of domenii) {
      document.cookie = `${nume}=; Path=/; Max-Age=0${d}`;
    }
  }
}

/** Spune furnizorilor, cu propriile lor unelte, ca nu mai au voie. */
function spuneFurnizorilor(s: Stare): void {
  const w = window as unknown as {
    gtag?: (...a: unknown[]) => void;
    fbq?: (...a: unknown[]) => void;
    ttq?: { revokeConsent?: () => void; grantConsent?: () => void; disableCookie?: () => void };
  };
  w.gtag?.("consent", "update", {
    analytics_storage: s.statistici ? "granted" : "denied",
    ad_storage: s.marketing ? "granted" : "denied",
    ad_user_data: s.marketing ? "granted" : "denied",
    ad_personalization: s.marketing ? "granted" : "denied",
  });
  if (s.marketing) {
    w.fbq?.("consent", "grant");
    w.ttq?.grantConsent?.();
  } else {
    w.fbq?.("consent", "revoke");
    w.ttq?.revokeConsent?.();
    w.ttq?.disableCookie?.();
  }
}

/**
 * Scrie hotararea.
 *
 * ⚠ SE SCRIE INTAI IN BROWSER, SI ABIA APOI SE ANUNTA SERVERUL. Apasarea omului
 * n-are voie sa astepte reteaua noastra: daca serverul e lent sau picat, alegerea
 * lui trebuie sa fie deja in vigoare. Serverul reconfirma cookie-ul cu `Set-Cookie`
 * — fara asta, Safari taie la 7 zile un cookie scris din JS, si „refuz pastrat 180
 * de zile" ar deveni tacut „banner saptamanal".
 */
export function scrieHotararea(alegere: { statistici: boolean; marketing: boolean }, metoda: Metoda): Stare {
  const veche = citesteStarea();
  const vid = alegere.marketing ? (validVid(veche?.vid) ? veche!.vid! : nasteVid()) : undefined;

  const noua: Stare = { ...alegere, cand: acum(), metoda, ...(vid ? { vid } : {}) };
  document.cookie = `${NUME_COOKIE}=${encodeURIComponent(serializeaza(noua))}; ${atributeCookie(location.protocol === "https:")}`;

  spuneFurnizorilor(noua);
  if (!noua.marketing || !noua.statistici) maturaCookieFurnizori();

  /* ⚠ Memoria pozei se goleste INAINTE de anunt, altfel ascultatorii citesc valoarea veche. */
  memoGol = true;
  window.dispatchEvent(new CustomEvent(EVENIMENT_SCHIMBAT, { detail: noua }));

  /*
    ⚠ `keepalive`: hotararea poate fi ultima apasare inainte de a inchide fila.
    Fara el, cererea moare odata cu pagina si dovada nu se scrie niciodata.
    ⚠ Si `catch` gol: o retea picata nu are voie sa strice alegerea deja in vigoare.
  */
  void fetch("/api/consimtamant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ v: VERSIUNE, statistici: noua.statistici, marketing: noua.marketing, metoda, vid: noua.vid ?? null }),
    keepalive: true,
  }).catch(() => {});

  return noua;
}

/** Retragerea: aceeasi cale, cu totul stins si fara id. */
export function retrage(): Stare {
  return scrieHotararea({ statistici: false, marketing: false }, "w");
}

export function deschideSetari(): void {
  window.dispatchEvent(new Event(EVENIMENT_DESCHIDE_SETARI));
}

export type Consimtamant = {
  /**
   * ⚠ FALS PANA DUPA PRIMA RANDARE DIN BROWSER, si asta e miezul.
   *
   * Serverul nu stie ce scrie in cookie la randare (si nici n-are voie sa afle —
   * ar face paginile dinamice). Deci prima randare din browser trebuie sa arate
   * IDENTIC cu cea de pe server, altfel React strica hidratarea. Hotararea se
   * afla abia in efect.
   */
  mounted: boolean;
  stare: Stare | null;
  statistici: boolean;
  marketing: boolean;
};

/*
  ⚠ `useSyncExternalStore`, NU `useEffect` + `useState`.

  Cookie-ul e o sursa din afara React-ului, care se poate schimba oricand. Citit
  intr-un efect, ar fi insemnat `setState` sincron la montare — adica o a doua
  randare imediata pentru fiecare componenta pazita, la fiecare incarcare.

  Mai important, hook-ul asta cere EXPLICIT o poza pentru server (`null`) si una
  pentru browser. React stie atunci sa randeze cu cea de pe server si sa treaca la
  cealalta dupa hidratare — exact ce ne trebuie ca sa nu se strice hidratarea.

  ⚠ POZA E SIRUL BRUT, nu obiectul. `getSnapshot` trebuie sa intoarca ceva stabil
  ca referinta; un obiect nou la fiecare apel ar pune React intr-o bucla fara
  sfarsit. Dezlegarea se face abia in `useMemo`.
*/
function abonare(la: () => void): () => void {
  window.addEventListener(EVENIMENT_SCHIMBAT, la);
  return () => window.removeEventListener(EVENIMENT_SCHIMBAT, la);
}

/*
  ⚠ POZA E MEMORATA DUPA SIRUL BRUT, si nu doar ca sa fie iute.

  `getSnapshot` trebuie sa intoarca aceeasi REFERINTA cat timp sursa nu s-a
  schimbat, altfel React randeaza la nesfarsit. Si dezlegarea trebuie sa se
  intample aici, nu intr-un `useMemo`: ea cheama `Date.now()` (verificarea
  vechimii), iar un ceas citit in timpul randarii face rezultatul imprevizibil de
  la o randare la alta. Aici, in schimb, e chiar rostul carligului — o sursa
  mutabila din afara React-ului, citita o data si tinuta minte.
*/
let memoBrut: string | null = null;
let memoStare: Stare | null = null;
let memoGol = true;

function pozaBrowser(): Stare | null {
  const brut = citesteCookie(NUME_COOKIE);
  if (!memoGol && brut === memoBrut) return memoStare;
  memoBrut = brut;
  memoStare = parseaza(brut, Math.floor(Date.now() / 1000));
  memoGol = false;
  return memoStare;
}

const pozaServer = (): Stare | null => null;

export function useConsimtamant(): Consimtamant {
  const stare = useSyncExternalStore(abonare, pozaBrowser, pozaServer);
  const montat = useSyncExternalStore(abonare, () => true, () => false);

  return {
    mounted: montat,
    stare,
    statistici: montat && stare?.statistici === true,
    marketing: montat && stare?.marketing === true,
  };
}

export function areCategorie(c: Categorie): boolean {
  return citesteStarea()?.[c] === true;
}
