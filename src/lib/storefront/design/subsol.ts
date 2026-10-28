import { schemaBlocurilor } from "./blocuri";
import { sanitizeColor } from "./curatare";
import { contrastOn } from "./css-vars";
import type { BlockInstance, SectionInstance } from "./types";

/**
 * Subsolul pe coloane-bloc (etapa 11 din `docs/editor-magazin/PLAN.md`): ce citesc magazinul si editorul despre el.
 *
 * Coloanele stau in `blocks` (schema in `blocuri.ts`); reglajele intregului subsol in `settings`. Fara React: probele
 * le ruleaza direct.
 */

type Subsol = Pick<SectionInstance, "variant" | "settings" | "blocks">;

/**
 * Coloanele subsolului. Un subsol fara lista (o miniatura din galerie, un design scris de mana) are coloanele lui
 * implicite, aceleasi pe care i le da parserul la citire.
 */
export function coloaneSubsol(subsol: Subsol): BlockInstance[] {
  if (subsol.blocks) return subsol.blocks;
  return schemaBlocurilor("footer", subsol.variant)?.implicite?.(subsol.settings) ?? [];
}

/** Coloanele care se vad: cele aprinse, in ordinea lor. */
export function coloaneVazute(subsol: Subsol): BlockInstance[] {
  return coloaneSubsol(subsol).filter((c) => c.enabled);
}

/**
 * Pagina trebuie sa citeasca lista categoriilor pentru subsol? Da, cand o coloana „Linkuri” aprinsa arata categorii.
 * Pana la etapa 11 o spunea designul (`needsCategories`), dar acum oricare design poate avea o astfel de coloana.
 */
export function subsolCereCategorii(subsol: Subsol): boolean {
  return coloaneVazute(subsol).some((c) => c.type === "linkuri" && c.settings.sursa === "categorii");
}

/** „Înapoi sus”: reglajul lui; nereglat, cum era pe design (doar subsolul centrat il avea). */
export function inapoiSusPornit(subsol: Subsol): boolean {
  return typeof subsol.settings.inapoiSus === "boolean" ? subsol.settings.inapoiSus : subsol.variant === "centered";
}

/** Textul de langa „©”: al lui, altfel numele magazinului. Anul il pune randul de copyright. */
export function textCopyright(subsol: Subsol, numeMagazin: string): string {
  const scris = typeof subsol.settings.copyright === "string" ? subsol.settings.copyright.trim() : "";
  return scris || numeMagazin;
}

/** Cat ia fiecare coloana din latime pe calculator: identitatea si contactul mai mult, ca pana acum. */
const LATIME_COLOANA: Record<string, string> = {
  identitate: "1.4fr",
  linkuri: "1fr",
  contact: "1.2fr",
  text: "1.4fr",
  newsletter: "1.6fr",
  imagine: "1fr",
  retele: "1fr",
};

/** `grid-template-columns` pentru coloanele vazute; cele de azi dau exact `1.4fr 1fr 1fr 1.2fr`. */
export function sablonColoane(coloane: readonly BlockInstance[]): string {
  return coloane.map((c) => LATIME_COLOANA[c.type] ?? "1fr").join(" ");
}

/**
 * Culorile alese pentru subsol, ca variabile CSS pe radacina lui; `undefined` cand n-a ales nimic, deci subsolul
 * ramane exact cum il deseneaza designul.
 *
 * Se pun variabilele pe care le citeste deja fiecare ton: inchis `--st-footer-bg` / `--st-footer-text`, deschis si
 * centrat `--st-bg` / `--st-surface` / `--st-text` / `--st-muted` / `--st-border`; toate cad pe radacina subsolului,
 * deci nu ies din el. Doar fundalul ales: textul se alege dupa contrast (alb sau negru, `contrastOn`), altfel ar fi
 * ramas textul designului pe un fundal pe care nu se mai citeste.
 */
export function culoriSubsol(subsol: Subsol): Record<string, string> | undefined {
  const fundal = sanitizeColor(subsol.settings.fundal);
  const ales = sanitizeColor(subsol.settings.culoareText);
  if (!fundal && !ales) return undefined;
  const text = ales ?? (fundal ? contrastOn(fundal) : undefined);
  const vars: Record<string, string> = {};
  if (fundal) {
    vars["--st-footer-bg"] = fundal;
    vars["--st-bg"] = fundal;
    vars["--st-surface"] = fundal;
  }
  if (text) {
    vars["--st-footer-text"] = text;
    vars["--st-text"] = text;
    vars["--st-muted"] = `color-mix(in srgb, ${text} 62%, transparent)`;
    vars["--st-border"] = `color-mix(in srgb, ${text} 14%, transparent)`;
  }
  return vars;
}

/** Numele unei coloane in editor: tipul si, cand are, titlul („Linkuri: Magazin”). */
export function etichetaColoanei(coloana: Pick<BlockInstance, "type" | "settings">): string {
  const tip = schemaBlocurilor("footer", "dark")?.tipuri[coloana.type]?.label ?? coloana.type;
  const titlu = typeof coloana.settings.titlu === "string" ? coloana.settings.titlu.trim() : "";
  return titlu ? `${tip}: ${titlu}` : tip;
}
