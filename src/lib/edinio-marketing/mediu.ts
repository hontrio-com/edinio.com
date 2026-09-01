/*
  ═══════════════════════════════════════════════════════════════════════════════
  UNDE ARE VOIE SA PLECE O MASURATOARE ADEVARATA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE EXISTA PAZA ASTA. Datele din `localhost`, din desfasurarile de
  previzualizare si din CI ajung in ACEEASI proprietate GA4 ca traficul adevarat,
  daca nu le opreste nimeni. Iar ele nu se pot scoate dupa aceea: GA4 nu are
  „sterge sesiunile din data cutare de la gazda cutare". Un raport murdarit ramane
  murdarit.

  ⚠ SI E MAI SUBTIL DECAT PARE: `vercel env pull` scrie `VERCEL_ENV="production"`
  in `.env.local` de pe masina de lucru. Deci variabila aia SINGURA nu deosebeste
  productia de calculatorul cuiva — am invatat-o azi, cand o paza scrisa asa a
  oprit `npm run build` local. Vezi nota din `next.config.ts`.

  De aceea hotararea se ia dupa GAZDA din browser, care nu poate fi imprumutata
  dintr-un fisier de mediu.
*/

/** Gazdele pe care traieste site-ul nostru adevarat. */
export const GAZDE_PRODUCTIE = ["edinio.com", "www.edinio.com"] as const;

/**
 * Aici plecam masuratori adevarate?
 *
 * ⚠ Se cheama in browser. Pe server intoarce `false` — nu fiindca serverul n-ar
 * fi productie, ci fiindca modulul asta apara TRIMITERILE DIN BROWSER, si acolo
 * nu se trimite nimic de pe server.
 */
export function eProductieMarketing(): boolean {
  if (typeof window === "undefined") return false;
  const gazda = window.location.hostname;
  return (GAZDE_PRODUCTIE as readonly string[]).includes(gazda);
}

/**
 * Scriem in consola ce s-ar fi trimis?
 *
 * ⚠ NUMAI IN AFARA PRODUCTIEI. Un jurnal de evenimente pornit pe productie ar
 * scrie in consola fiecarui vizitator ce urmarim despre el — nu e o scurgere de
 * date, dar e o purtare pe care n-o vrea nimeni.
 */
export function eDepanare(): boolean {
  if (typeof window === "undefined") return false;
  if (eProductieMarketing()) return false;
  try {
    return window.localStorage.getItem("edinio_marketing_debug") === "1";
  } catch {
    return false;
  }
}

/**
 * Codul de masurare GA4 al EDINIO.
 *
 * ⚠ AL NOSTRU, nu al vreunui comerciant. Codurile lor stau in configuratia
 * fiecarui magazin (`MarketingConfig.google_tag_ids`) si nu au voie sa se
 * intalneasca niciodata cu asta.
 */
export function codGa4(): string | null {
  const cod = process.env.NEXT_PUBLIC_EDINIO_GA4_MEASUREMENT_ID?.trim();
  return cod && /^G-[A-Z0-9]{6,}$/i.test(cod) ? cod : null;
}
