/*
  Citirea reglajelor bannerelor temelor 2-30 (etapa 24 din `docs/editor-magazin/PLAN.md`): „impartit”, „mozaic”,
  „panoramic”. Fara React, ca sa le poata proba `node --test`. Reglajele vin din design (JSON salvat), deci orice camp
  poate lipsi sau avea alt tip: totul trece prin `textSetare`.
*/

/** Un sir de caractere taiat la margini; orice altceva (lipsa, numar, obiect) = sir gol. */
export function textSetare(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export type FondPlaca = "inchis" | "principala" | "deschis";

export interface PlacaMozaic {
  titlu: string;
  text: string;
  imagine: string;
  link: string;
  fond: FondPlaca;
}

/** Cate placi are mozaicul: una mare, una inalta, doua mici. */
export const MAX_PLACI_MOZAIC = 4;

/** Fondul implicit dupa locul placii, ca un mozaic completat doar cu titluri sa arate tot ca un mozaic. */
const FOND_IMPLICIT: readonly FondPlaca[] = ["inchis", "principala", "deschis", "deschis"];

/** Placile mozaicului, in ordinea lor; una fara titlu nu apare (ca la cardurile bannerului). */
export function placileMozaic(setari: Record<string, unknown> | undefined): PlacaMozaic[] {
  const lista = Array.isArray(setari?.placi) ? setari.placi : [];
  return lista
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {}))
    .filter((p) => textSetare(p.titlu))
    .slice(0, MAX_PLACI_MOZAIC)
    .map((p, i) => {
      const fond = textSetare(p.fond);
      return {
        titlu: textSetare(p.titlu),
        text: textSetare(p.text),
        imagine: textSetare(p.imagine),
        link: textSetare(p.link),
        fond: fond === "inchis" || fond === "principala" || fond === "deschis" ? fond : FOND_IMPLICIT[i],
      };
    });
}

export interface CardVitrina {
  eticheta: string;
  titlu: string;
  text: string;
  imagine: string;
  link: string;
}

/** Cate carduri are vitrina: patru se vad pe desktop, al cincilea se deruleaza. */
export const MAX_CARDURI_VITRINA = 5;

/**
 * Cardurile bannerului „vitrina” (temele Procyon si Canopus, lotul 5), in ordinea lor. Unul fara titlu sau fara
 * imagine nu apare: cardul e o fotografie cu titlu peste ea, fara una din ele ar ramane o placa goala.
 */
export function cardurileVitrinei(setari: Record<string, unknown> | undefined): CardVitrina[] {
  const lista = Array.isArray(setari?.carduri) ? setari.carduri : [];
  return lista
    .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : {}))
    .filter((c) => textSetare(c.titlu) && textSetare(c.imagine))
    .slice(0, MAX_CARDURI_VITRINA)
    .map((c) => ({
      eticheta: textSetare(c.eticheta),
      titlu: textSetare(c.titlu),
      text: textSetare(c.text),
      imagine: textSetare(c.imagine),
      link: textSetare(c.link),
    }));
}

/**
 * Imaginea unui banner cu o singura poza: cea aleasa in reglaj, altfel prima din „Bannere” (`page_content`), altfel
 * nimic (bannerul ramane pe culoare).
 */
export function imagineaBannerului(setari: Record<string, unknown> | undefined, bannere: readonly string[]): string | null {
  return textSetare(setari?.imagine) || bannere[0] || null;
}
