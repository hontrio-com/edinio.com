/*
  ═══════════════════════════════════════════════════════════════════════════════
  GENERATORUL DE CODURI DE REDUCERE CHEMAT DE THEMARKETER. Partea pura.
  ═══════════════════════════════════════════════════════════════════════════════

  theMarketer cheama adresa noastra cand o automatizare sau programul de fidelitate are nevoie de un cod
  unic pentru un om (developers.themarketer.com/reference/discount-codes-generator):

      <adresa>?key=<REST_KEY>&value=10&type=1&expiration_date=2026-12-31

  - `type`: 0 = valoare fixa, 1 = procent, 2 = transport gratuit;
  - `expiration_date`: optional. Pluginul lor o valideaza ca `Y-m-d`; documentatia publica arata si
    „2022-05-27 09:00” (intre ghilimele tipografice). Le primim pe amandoua;
  - raspunsul: `{"code": "…"}`.

  Codul: `MKTR-` + 10 caractere din A-Z0-9, exact forma pluginului lor (si a codurilor din exemplele lor
  de fidelitate, „MKTR-A8OKRQA8I4”), deci comerciantul il recunoaste in theMarketer si in comenzi.
  O SINGURA folosire, ca la ei (`set_usage_limit(1)`).

  ⚠ PLAFOANELE SUNT O PLASA, nu o regula de afaceri. Cheia REST poate scapa; cu ea, fara plafon, oricine
  ar putea cere un cod de 100.000 de lei sau unul care nu expira niciodata pentru tot magazinul. Un procent
  peste 100 nu exista, iar o valoare fixa peste `VALOARE_FIXA_MAXIMA` nu e un cupon de fidelitate.
*/

import { randomInt } from "node:crypto";
import { clipaRomaneasca, sfarsitulZilei, ziValida } from "@/lib/zi-romaneasca";

export const PREFIX_COD = "MKTR-";
const ALFABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const LUNGIME = 10;

/** Peste atat, o valoare fixa nu e un cupon de automatizare. Lei. */
export const VALOARE_FIXA_MAXIMA = 5000;

/** Tipul nostru (`discounts.type`) pentru fiecare tip theMarketer. */
const TIPURI = { 0: "fixed", 1: "percent", 2: "free_shipping" } as const;
export type TipCodTM = (typeof TIPURI)[keyof typeof TIPURI];

export type CerereCod = {
  tip: TipCodTM;
  valoare: number;
  /** Clipa expirarii (ISO), sau `null` = fara expirare. */
  expira: string | null;
};

/** Un cod nou. `randomInt` evita abaterea lui `% 36` pe un octet. */
export function codNou(): string {
  let s = PREFIX_COD;
  for (let i = 0; i < LUNGIME; i++) s += ALFABET[randomInt(ALFABET.length)];
  return s;
}

const ORA = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Data de expirare, in clipa romaneasca. O zi singura expira la SFARSITUL ei (23:59:59): „expira pe 31”
 * inseamna ca pe 31 inca merge. `null` = nu s-a dat nicio data; `"invalida"` = s-a dat una care nu se
 * poate citi (raspunsul e 400, nu un cod fara expirare: ar fi dat mai mult decat s-a cerut).
 */
export function expirareaCerute(brut: string | null): string | null | "invalida" {
  if (brut == null) return null;
  const s = brut.trim().replace(/^["'“”„]+|["'“”„]+$/g, "").trim();
  if (!s) return null;
  if (ziValida(s)) return sfarsitulZilei(s);
  const m = ORA.exec(s);
  if (!m) return "invalida";
  const [, zi, h, min, sec] = m;
  const ore = Number(h);
  const minute = Number(min);
  const secunde = sec ? Number(sec) : 0;
  if (!ziValida(zi) || ore > 23 || minute > 59 || secunde > 59) return "invalida";
  return clipaRomaneasca(zi, ore, minute, secunde, 0).toISOString();
}

/**
 * Parametrii cererii, verificati. `{ eroare }` cu mesajul pentru theMarketer (in engleza: il citeste
 * contul lor, nu comerciantul nostru).
 */
export function citesteCererea(p: URLSearchParams, acum: Date = new Date()): CerereCod | { eroare: string } {
  const tipBrut = (p.get("type") ?? "").trim();
  if (!/^[012]$/.test(tipBrut)) return { eroare: "Incorrect Rule Type" };
  const tip = TIPURI[Number(tipBrut) as 0 | 1 | 2];

  const valoareBruta = (p.get("value") ?? "").trim().replace(",", ".");
  const valoare = Number(valoareBruta);
  if (tip !== "free_shipping") {
    if (!valoareBruta || !Number.isFinite(valoare) || valoare <= 0) return { eroare: "Incorrect Value" };
    if (tip === "percent" && valoare > 100) return { eroare: "Incorrect Value" };
    if (tip === "fixed" && valoare > VALOARE_FIXA_MAXIMA) return { eroare: "Incorrect Value" };
  }

  const expira = expirareaCerute(p.get("expiration_date"));
  if (expira === "invalida") return { eroare: "Incorrect Date expiration_date" };
  if (expira && new Date(expira).getTime() <= acum.getTime()) return { eroare: "Incorrect Date expiration_date" };

  return {
    tip,
    /* Procentul si suma, la doua zecimale: atat tine si coloana. Transportul gratuit n-are valoare. */
    valoare: tip === "free_shipping" ? 0 : Math.round(valoare * 100) / 100,
    expira,
  };
}
