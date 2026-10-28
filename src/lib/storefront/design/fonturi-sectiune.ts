import { esteFontPagina, FONTURI_PAGINA, stivaFont, type CheieFont } from "@/lib/pages/fonturi";
import { sectionMeta, type Field } from "./registry";
import type { SectionKind } from "./types";

/*
  ═══════════════════════════════════════════════════════════════════════════
  FONTUL UNEI SECTIUNI (etapa 14 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el (28.10.2026): „cineva poate vrea un anume font la o anumita sectiune”, de exemplu la randurile de
  produse, la antet sau la banner. Raspunsul lui la intrebare: fonturile gazduite de noi (33; in intrebare scrisesem
  36, numarat gresit), separat pentru titluri si pentru text, implicit „Ca în Stil”.

  ⚠ CUM SE APLICA. Fontul magazinului sta pe radacina vitrinei (`StorefrontThemeScope`), in variabile pe care le
  citesc utilitarele Tailwind si regula titlurilor (`--font-heading: var(--font-app-heading, var(--font-app, ...))`
  in `stil-comun.css`). Un invelis care le suprascrie schimba fontul exact pe portiunea lui, fara sa atinga vreo
  varianta de design.
*/

export const CHEI_FONT_SECTIUNE = ["fontTitluri", "fontText"] as const;
export type CheieFontSectiune = (typeof CHEI_FONT_SECTIUNE)[number];

const OPTIUNI = FONTURI_PAGINA.map((f) => ({ value: f.cheie, label: f.nume }));

/**
 * Campurile comune, curatate la citire impreuna cu ale variantelor (`parseSection`). Nu apar in lista de reglaje a
 * variantei: panoul sectiunii le are in grupul lor, „Fonturi”, cu alegatorul pe familii.
 */
export const CAMPURI_FONT_SECTIUNE: Field[] = [
  { key: "fontTitluri", type: "select", label: "Fontul titlurilor", options: OPTIUNI },
  { key: "fontText", type: "select", label: "Fontul textului", options: OPTIUNI },
];

/**
 * Sectiunile care pot avea fontul lor: cele ale paginii principale, plus antetul, subsolul si bara de anunt. Pagina
 * de produs, Pagina Magazin, cosul si comanda sunt pagini intregi: acolo fontul vine din Stil.
 */
export function areFonturiProprii(kind: SectionKind): boolean {
  const scope = sectionMeta(kind)?.scope;
  return scope === "home" || scope === "chrome";
}

/** Fontul ales pe sectiune, sau `null` pentru „Ca în Stil” (si pentru orice valoare necunoscuta). */
export function fontulSectiunii(setari: Record<string, unknown> | undefined, cheie: CheieFontSectiune): CheieFont | null {
  const v = setari?.[cheie];
  return esteFontPagina(v) ? v : null;
}

/**
 * Clasele de font si variabilele invelisului unei sectiuni, sau `null` cand n-are niciun font al ei (atunci nu se
 * pune niciun element in plus, deci magazinele de azi raman neatinse pana la ultimul atribut).
 *
 * ⚠ Cand e ales DOAR textul, titlurile se tin anume pe fontul magazinului: altfel `--font-heading` ar fi cazut pe
 * `--font-app`, adica pe textul nou, la magazinele pe Geist (unde radacina nu pune `--font-app-heading`).
 */
export function stilFontSectiune(setari: Record<string, unknown> | undefined): { chei: CheieFont[]; style: Record<string, string> } | null {
  const titluri = fontulSectiunii(setari, "fontTitluri");
  const text = fontulSectiunii(setari, "fontText");
  if (!titluri && !text) return null;
  const style: Record<string, string> = {};
  if (text) {
    const stiva = stivaFont(text);
    style["--st-font-body"] = stiva;
    style["--font-app"] = stiva;
    style.fontFamily = stiva;
  }
  if (titluri) {
    const stiva = stivaFont(titluri);
    style["--st-font-heading"] = stiva;
    style["--font-app-heading"] = stiva;
  } else {
    style["--font-app-heading"] = "var(--st-font-heading)";
  }
  const chei = [...new Set([titluri, text].filter((k): k is CheieFont => k !== null))];
  return { chei, style };
}
