"use client";

import { useEffect, useState } from "react";
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

export function useConsimtamant(): Consimtamant {
  const [stare, setStare] = useState<Stare | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setStare(citesteStarea());
    setMounted(true);
    const laSchimbare = () => setStare(citesteStarea());
    window.addEventListener(EVENIMENT_SCHIMBAT, laSchimbare);
    return () => window.removeEventListener(EVENIMENT_SCHIMBAT, laSchimbare);
  }, []);

  return {
    mounted,
    stare,
    statistici: mounted && stare?.statistici === true,
    marketing: mounted && stare?.marketing === true,
  };
}

export function areCategorie(c: Categorie): boolean {
  return citesteStarea()?.[c] === true;
}
