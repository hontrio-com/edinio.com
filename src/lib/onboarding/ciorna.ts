/*
 * Ciorna inscrierii, in browser, pana se creeaza magazinul.
 *
 * ⚠ SI IN `localStorage`, NU DOAR IN `sessionStorage` (27.09.2026). Emailul
 * „te-ai oprit la plan" (`onboarding_stuck_24h`) duce la `/onboarding/plan`,
 * dar se deschide intr-o fila noua, unde `sessionStorage` e gol: pagina il
 * trimitea inapoi la pasul 1 si omul isi scria totul a doua oara. Acelasi lucru
 * dupa o fila inchisa din greseala.
 *
 * Cheia `onboarding_details` ramane aceeasi: o citesc si intoarcerea de la
 * Stripe, si fluxul Google, si oricine era la jumatatea inscrierii cand s-a
 * schimbat codul.
 */

export interface CiornaOnboarding {
  business_name: string;
  phone: string;
  slug: string;
  culoare?: string;
  stil?: string;
}

const CHEIE = "onboarding_details";

function citesteDin(s: Storage | undefined): Partial<CiornaOnboarding> | null {
  try {
    const brut = s?.getItem(CHEIE);
    if (!brut) return null;
    const v = JSON.parse(brut) as unknown;
    return v && typeof v === "object" ? (v as Partial<CiornaOnboarding>) : null;
  } catch {
    return null;
  }
}

export function citesteCiorna(): Partial<CiornaOnboarding> | null {
  if (typeof window === "undefined") return null;
  return citesteDin(window.sessionStorage) ?? citesteDin(window.localStorage);
}

/** Ciorna are tot ce cere pasul 1, deci pasii urmatori au pe ce sta. */
export function ciornaCompleta(c: Partial<CiornaOnboarding> | null): c is CiornaOnboarding {
  return !!c && typeof c.business_name === "string" && c.business_name.trim().length >= 2
    && typeof c.phone === "string" && c.phone.length > 0
    && typeof c.slug === "string" && c.slug.length >= 3;
}

export function scrieCiorna(parte: Partial<CiornaOnboarding>) {
  if (typeof window === "undefined") return;
  const noua = { ...(citesteCiorna() ?? {}), ...parte };
  const text = JSON.stringify(noua);
  for (const s of [window.sessionStorage, window.localStorage]) {
    try { s.setItem(CHEIE, text); } catch { /* navigare privata: ramane in cealalta */ }
  }
}

export function stergeCiorna() {
  if (typeof window === "undefined") return;
  for (const s of [window.sessionStorage, window.localStorage]) {
    try { s.removeItem(CHEIE); } catch { /* nimic de sters */ }
  }
}
