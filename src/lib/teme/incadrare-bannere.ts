/*
  ═══════════════════════════════════════════════════════════════════════════
  INCADRAREA PE TELEFON A BANNERELOR DEMO (etapa 25.17-25.18, 11.11.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Gasit la proba de dinaintea lansarii: bannerele demo au raportul 2,14:1 si textul scris in poza; pe un telefon de 390 px
  bannerul are 358 x 167 px, deci textul ajungea la 6-9 px (Rigel, Deneb, Antares), iar la Vega si Mira subiectul fotografiei
  iesea din cadru. Pe telefon, aceste bannere se arata acum mai inalte (4:3, `max-sm`) si incadrate pe partea cu textul sau
  cu subiectul (`object-position`): se vede ~62% din latime, deci textul iese de ~1,6 ori mai mare.

  Doar pozele demo ale temelor, dupa adresa (`/teme/<cheie>/...`): bannerele comerciantilor raman exact cum erau, fiindca o
  incadrare aleasa pentru o poza anume nu se poate ghici pentru alta. Pe calculator nu se schimba nimic.
*/

/** Pozitia (CSS `object-position`) pe telefon, pentru fiecare banner demo care o cere. */
const INCADRARE_MOBIL: Readonly<Record<string, string>> = {
  // Textul in cardul alb din dreapta.
  "/teme/rigel/bannere/parfumuri.webp": "100% 50%",
  // Textul in stanga (verificat pe fiecare poza, nu dupa tema: al doilea banner Rigel il are in stanga).
  "/teme/rigel/bannere/ingrijire.webp": "0% 50%",
  "/teme/deneb/bannere/colectia.webp": "0% 50%",
  "/teme/antares/poze/hero.webp": "0% 50%",
  // Bannerul panoramic (fotografie peste toata placa): subiectul in dreapta, taiat de decuparea centrata pe telefon.
  "/teme/vega/poze/hero.webp": "82% 50%",
  "/teme/mira/poze/hero.webp": "86% 50%",
};

/** Incadrarea pe telefon a bannerului (`object-position`), sau `null` cand nu are una (orice banner al comerciantului). */
export function incadrareMobil(src: string | null | undefined): string | null {
  if (!src) return null;
  // Fara domeniu si fara varianta de latime: `/teme/x/a.w640.webp` e tot `/teme/x/a.webp`.
  const cale = src.replace(/^https?:\/\/[^/]+/, "").replace(/\.w\d+\.webp$/, ".webp").split("?")[0];
  return INCADRARE_MOBIL[cale] ?? null;
}

/** Clasa slotului pe telefon cand macar un banner din carusel are incadrare (toate slide-urile au aceeasi inaltime). */
export const SLOT_INCADRAT_MOBIL = "max-sm:aspect-[4/3]";

export const BANNERE_INCADRATE = Object.keys(INCADRARE_MOBIL);
