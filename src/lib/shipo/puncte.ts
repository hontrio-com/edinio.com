import type { PunctShipo } from "./client";

/**
 * Punctele Shipo (lockere si PUDO) → forma pe care o arata checkout-ul.
 *
 * ═══ ⚠ SPRE DEOSEBIRE DE SMARTSHIP, AICI NU SE GHICESTE NIMIC ═══
 *
 * La SmartShip, `/geolocation/easybox` si `/geolocation/fanbox` erau singurele
 * doua endpointuri din tot API-ul fara exemplu de raspuns, si a trebuit sa citim
 * tolerant, cu un buton de diagnostic care sa arate cheile reale.
 *
 * Aici documentatia lui `/points` are exemplu, tabel de campuri, si — lucru rar —
 * o sectiune numita „Diferente intre curieri" care spune ANUME care campuri pot
 * lipsi si la cine:
 *
 *   `street_no`        lipseste la Posta Romana si Sameday (la Posta, `street`
 *                      contine adresa completa)
 *   `accepted_payment` lipseste la FAN Courier si Posta Romana
 *   `opening_hours`    completat doar la punctele PUDO ale DPD si Posta Romana
 *
 * Garantate la TOTI: `id`, `name`, `city`, `county`, `postal_code`, `address`,
 * `lat`, `lng`. Deci normalizarea de mai jos cere exact cele garantate si trece
 * mai departe restul cand exista.
 */

export type PunctAratat = {
  /** Sir in afara, dar mereu format dintr-un INTREG: `recipient_address_id` e integer. */
  id: string;
  nume: string;
  adresa: string;
  oras: string;
  judet: string;
  codPostal: string;
  lat: number;
  lng: number;
  /** Programul, cand curierul il da. Gol la majoritatea. */
  program: string;
  /** Distanta, cand cautarea a fost dupa coordonate. */
  distantaKm: number | null;
};

/**
 * Adresa punctului, compusa din ce exista.
 *
 * ⚠ `address` e campul garantat si deja concatenat de ei, deci el e prima
 * alegere. `street` + `street_no` sunt rezerva pentru cazul in care `address` ar
 * veni gol — si se lipesc in ordinea romaneasca („Sos. Oltenitei, Nr. 2"), nu
 * invers.
 */
function adresaPunctului(p: PunctShipo): string {
  const intreaga = (p.address ?? "").trim();
  if (intreaga) return intreaga;
  const strada = (p.street ?? "").trim();
  const numar = (p.street_no ?? "").trim();
  return [strada, numar].filter(Boolean).join(", ");
}

/**
 * Randurile lor → puncte gata de aratat.
 *
 * ⚠ Randurile fara `id` intreg pozitiv se ARUNCA: id-ul pleaca mai tarziu in
 * `recipient_address_id`, iar un punct pe care cumparatorul il alege si care nu
 * se poate emite e mai rau decat o lista mai scurta.
 *
 * ⚠ Randurile fara coordonate NU se arunca. Harta din checkout are nevoie de ele,
 * dar lista are nevoie doar de nume si adresa — iar un punct real fara `lat`/`lng`
 * (posibil la punctele PUDO ale unor curieri) ramane alegibil.
 */
export function normalizeazaPuncte(brute: PunctShipo[]): PunctAratat[] {
  const iesire: PunctAratat[] = [];
  const vazute = new Set<string>();

  for (const p of brute ?? []) {
    if (!p || typeof p !== "object") continue;
    const id = Number(p.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    const cheie = String(id);
    if (vazute.has(cheie)) continue;
    vazute.add(cheie);

    const adresa = adresaPunctului(p);

    iesire.push({
      id: cheie,
      /* Fara nume, punctul ramane recognoscibil dupa adresa — un rand gol in
         lista de lockere e mai rau decat unul numit dupa strada lui. */
      nume: (p.name ?? "").trim() || adresa || `Punct ${cheie}`,
      adresa,
      oras: (p.city ?? "").trim(),
      judet: (p.county ?? "").trim(),
      codPostal: (p.postal_code ?? "").trim(),
      lat: Number.isFinite(p.lat) ? p.lat : 0,
      lng: Number.isFinite(p.lng) ? p.lng : 0,
      program: (p.opening_hours ?? "").trim(),
      distantaKm: typeof p.distance_km === "number" && Number.isFinite(p.distance_km) ? p.distance_km : null,
    });
  }

  return iesire;
}

/**
 * Raza implicita de cautare, in km.
 *
 * ⚠ Nu e zero, si nu poate fi: documentatia lor spune ca valorile din afara
 * intervalului sunt aduse la limita, deci `radius=0` inseamna 100 de metri, nu
 * „fara limita". Un zero scapat ar goli lista intr-un oras plin de lockere.
 *
 * 25 km acopera un oras romanesc cu suburbiile lui; peste atat, punctele sunt
 * mai departe decat merita drumul.
 */
export const RAZA_IMPLICITA_KM = 25;

/** Cate puncte se aduc cel mult. Lista din checkout nu se poate parcurge mai mult. */
export const MAX_PUNCTE = 200;
