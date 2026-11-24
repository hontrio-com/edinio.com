import { textSetare } from "./hero-teme";

/*
  ═══════════════════════════════════════════════════════════════════════════
  TEXTUL DE PESTE BANNERE (designul „Bannere cu text și buton peste”, 20.11.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut pentru un magazin real care si-a trimis macheta: caruselul de bannere, cu un titlu, un rand de text si un buton
  scrise PESTE prima poza. Pana acum, alegerea era intre „Doar imagini” (caruselul, fara nimic peste el: mesajul trebuia
  desenat in poza, deci pe telefon iesea de sase pixeli) si designurile cu text, care arata o singura imagine.

  Aici stau citirea reglajelor si implicitele, fara React, ca sa le poata proba `node --test`. Reglajele vin din design
  (JSON salvat), deci orice camp poate lipsi sau avea alt tip: totul trece prin `textSetare` si prin listele de mai jos.

  ⚠ LASATE GOALE, titlul e numele magazinului, textul e sloganul, iar butonul duce la produse: aceeasi regula ca la
  „Jumătate culoare, jumătate imagine” si la „Imagine panoramică cu titlu mare”. Cine nu vrea niciun text peste poze
  are „Doar imagini”.
*/

/** Ce scrie pe buton cand campul e gol. Text de vitrina, deci fara diacritice. */
export const BUTON_BANNERE_IMPLICIT = "Vezi produsele";

export const ALINIERI_TEXT_BANNERE = ["stanga", "centru", "dreapta"] as const;
export type AliniereTextBannere = (typeof ALINIERI_TEXT_BANNERE)[number];

export const CULORI_TEXT_BANNERE = ["deschis", "inchis", "principala"] as const;
export type CuloareTextBannere = (typeof CULORI_TEXT_BANNERE)[number];

/*
  ═══ LATIMEA BANNERELOR: CAT PAGINA SAU CAT ECRANUL (24.11.2026) ═══

  Cerut de acelasi magazin: „as vrea sa fie cat latimea ecranului”. Pana acum, de la 768 px in sus bannerele stateau
  intr-o coloana de cel mult 1120 px, cu colturi rotunjite (pe telefon ocupau deja tot ecranul). „Cât ecranul” scoate
  coloana, colturile si spatiul de deasupra, de la `md` in sus.

  ⚠ INALTIMEA SE PLAFONEAZA. Bannerul isi ia raportul din poza: unul 16:9 intins pe 1920 px ar avea 1080 px, adica mai
  mult decat tot ecranul, cu textul si butonul de peste el sub marginea de jos. De aceea, de la `md` in sus, locul nu
  trece de `INALTIME_MAX_BANNERE_ECRAN` la suta din inaltimea ferestrei, iar ce nu incape din poza se taie sus si jos
  (`object-cover`, centrat). Cat se taie tine de forma ferestrei: dintr-o poza 16:9, pe un ecran de 1920 x 1080 raman
  cam 62% din inaltime. O poza panoramica (in jur de 2,9:1, de exemplu 1920x660) nu se taie pe ecranele obisnuite.
  Pe telefon nu se schimba nimic: nici latimea, nici inaltimea.

  ⚠ Clasa din componenta (`md:max-h-[70vh]`) trebuie scrisa intreaga, altfel Tailwind nu o gaseste; proba o tine egala
  cu numarul de aici.
*/
export const LATIMI_BANNERE = ["pagina", "ecran"] as const;
export type LatimeBannere = (typeof LATIMI_BANNERE)[number];
/** Cat din inaltimea ferestrei pot ocupa bannerele intinse pe tot ecranul, in procente. */
export const INALTIME_MAX_BANNERE_ECRAN = 70;

export interface TextBannere {
  titlu: string;
  text: string;
  buton: string;
  /** Gol = produsele magazinului (hotaraste componenta, care stie unde sunt). */
  link: string;
  aliniere: AliniereTextBannere;
  culoare: CuloareTextBannere;
  /** Un strat discret intre poza si text, in partea unde sta textul. */
  estompare: boolean;
  cursiv: boolean;
  /** Textul ramane pe loc peste toate bannerele; altfel sta pe primul si pleaca odata cu el. */
  peToate: boolean;
  /** `ecran`: de la `md` in sus, bannerele ocupa toata latimea ferestrei, cu inaltimea plafonata. */
  latime: LatimeBannere;
}

function dinLista<T extends string>(v: unknown, lista: readonly T[], implicit: T): T {
  return (lista as readonly unknown[]).includes(v) ? (v as T) : implicit;
}

export function textulBannerelor(
  setari: Record<string, unknown> | undefined,
  magazin: { nume: string; slogan?: string | null },
): TextBannere {
  const s = setari ?? {};
  return {
    titlu: textSetare(s.titlu) || magazin.nume,
    text: textSetare(s.text) || textSetare(magazin.slogan),
    buton: textSetare(s.buton) || BUTON_BANNERE_IMPLICIT,
    link: textSetare(s.link),
    aliniere: dinLista(s.aliniere, ALINIERI_TEXT_BANNERE, "stanga"),
    culoare: dinLista(s.culoare, CULORI_TEXT_BANNERE, "deschis"),
    // Aprinsa cat timp nu s-a cerut altceva: pe o poza oarecare, textul fara strat se pierde.
    estompare: s.estompare !== false,
    cursiv: s.cursiv === true,
    peToate: s.peToate === true,
    // Orice altceva decat „ecran” ramane asezarea de pana acum.
    latime: dinLista(s.latime, LATIMI_BANNERE, "pagina"),
  };
}
