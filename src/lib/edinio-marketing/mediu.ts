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
 * ═══ ⚠ MERGE SI PE PRODUCTIE, SI ASTA E O SCHIMBARE DIN 02.09.2026 ═══
 *
 * Randul de dinainte era `if (eProductieMarketing()) return false;`, cu motivul
 * scris alaturi: „un jurnal pornit pe productie ar scrie in consola FIECARUI
 * vizitator ce urmarim despre el".
 *
 * Motivul era gresit, si l-am prins abia scriind documentul de configurare. Nu
 * scrie in consola fiecarui vizitator: scrie numai la cine si-a pus el insusi
 * cheia in `localStorage`. Un om care face asta isi vede propriile evenimente,
 * despre el — nici urma de scurgere.
 *
 * Iar pretul opririi era mare: tocmai PE PRODUCTIE ai nevoie sa vezi ce pleaca.
 * Documentul spunea „aprinde cheia pe edinio.com si te uiti in consola", si era
 * o instructiune care nu functiona.
 *
 * ⚠ CE RAMANE ADEVARAT: nu se aprinde singur nicaieri. Fara cheia pusa de mana,
 * consola tace peste tot.
 */
export function eDepanare(): boolean {
  if (typeof window === "undefined") return false;
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
