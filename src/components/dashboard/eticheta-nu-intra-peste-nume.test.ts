import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * ETICHETA DE STARE NU INTRA PESTE NUMELE LUNG                  (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ DEFECTUL PE CARE IL APARA PROBA. Pe cardul de telefon al Ofertelor, numele
 * ofertei e un `<button>` cu `truncate`, iar eticheta „Activa"/„Expirata" sta in
 * dreapta lui, intr-un rand `flex`. Aratat de el pe captura: numele lung trecea
 * PESTE eticheta.
 *
 * ⚠ CAUZA, SI DE-AIA PROBA CERE `w-full`, NU ALTCEVA. `truncate` inseamna
 * `overflow:hidden` + `text-overflow:ellipsis` + `white-space:nowrap`. Un
 * `<button>` e `inline-block` din foaia de baza, deci latimea lui e „shrink to
 * fit": maximul dintre latimea minima a continutului si spatiul liber. Cu
 * `nowrap`, latimea minima a continutului E CHIAR TOT TEXTUL. Asa ca butonul
 * iese din parintele `min-w-0`, `overflow:hidden` nu taie nimic (butonul e destul
 * de lat pentru textul lui), iar textul se deseneaza peste eticheta vecina.
 *
 * `block w-full` il leaga de latimea parintelui, si abia atunci `truncate` taie.
 *
 * ⚠ ACEEASI GRESEALA ERA SI LA DISCOUNTURI, pe codul cuponului. Un cod lung
 * intra peste eticheta la fel. Reparata odata cu asta; de-aia proba cauta in TOT
 * dosarul panoului, nu in cele doua fisiere stiute.
 *
 * ⚠ RESTUL PANOULUI FACEA DEJA BINE, in alta forma: `<button className="w-full">`
 * cu un `<span className="block truncate">` inauntru. Si aceea trece proba, caci
 * `truncate` e atunci pe un `<span>`, nu pe buton.
 */

const DOSAR = join(process.cwd(), "src", "components");

function toateFisierele(dir: string): string[] {
  const iesire: string[] = [];
  for (const intrare of readdirSync(dir, { withFileTypes: true })) {
    const cale = join(dir, intrare.name);
    if (intrare.isDirectory()) iesire.push(...toateFisierele(cale));
    else if (intrare.name.endsWith(".tsx")) iesire.push(cale);
  }
  return iesire;
}

/**
 * Fiecare `<button …>` din fisier, ca text, de la `<button` pana la `>`-ul care
 * inchide eticheta de deschidere.
 *
 * ⚠ PE ELEMENT, NU PE FISIER. Cautat cu un `includes("truncate")` peste tot
 * fisierul, un singur buton corect dintr-o mie ar fi ascuns unul gresit, iar o
 * proba care trece pe fisier nu prinde nimic. Vezi memoria
 * `proba-pe-fisier-trece-proba-pe-element-prinde`.
 */
function butoaneleDin(sursa: string): { text: string; rand: number }[] {
  const gasite: { text: string; rand: number }[] = [];
  const re = /<button\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sursa)) !== null) {
    /* Numaram acoladele ca sa nu ne oprim la un `>` din `() => ceva`. */
    let i = m.index;
    let acolade = 0;
    let inSir: string | null = null;
    for (; i < sursa.length; i++) {
      const c = sursa[i];
      if (inSir) { if (c === inSir && sursa[i - 1] !== "\\") inSir = null; continue; }
      if (c === '"' || c === "'" || c === "`") { inSir = c; continue; }
      if (c === "{") acolade++;
      else if (c === "}") acolade--;
      else if (c === ">" && acolade === 0) break;
    }
    gasite.push({
      text: sursa.slice(m.index, i + 1),
      rand: sursa.slice(0, m.index).split("\n").length,
    });
  }
  return gasite;
}

test("⚠⚠ un buton care TAIE textul are si latime marginita, altfel iese peste vecin", () => {
  const vinovate: string[] = [];

  for (const fisier of toateFisierele(DOSAR)) {
    const sursa = readFileSync(fisier, "utf8");
    if (!sursa.includes("truncate")) continue;

    for (const b of butoaneleDin(sursa)) {
      /* `truncate` chiar pe buton, nu pe un copil de-al lui. */
      if (!/className=[^>]*\btruncate\b/.test(b.text)) continue;

      /*
        Orice il leaga de latimea parintelui e bun: `w-full`, o latime pe
        praguri (`sm:w-64`), `flex-1` intr-un rand flex, sau `max-w-`.
        `min-w-0` singur NU e de ajuns: coboara doar podeaua, nu pune tavan.
      */
      const marginit = /\b(w-full|w-\[|max-w-|flex-1|basis-0)\b|\bw-\d/.test(b.text);
      if (!marginit) {
        vinovate.push(`${fisier.replace(process.cwd(), "").replace(/\\/g, "/")}:${b.rand}`);
      }
    }
  }

  assert.deepEqual(
    vinovate,
    [],
    "butoane cu `truncate` dar fara latime marginita (textul lung iese peste eticheta vecina):\n  " +
      vinovate.join("\n  "),
  );
});

test("⚠ eticheta de stare nu se lasa stramtata de numele de langa ea", () => {
  /*
   * Cealalta jumatate a aceleiasi reguli. Daca butonul s-ar fi lipit de latimea
   * parintelui dar eticheta ar fi putut sa se stranga, numele ar fi impins-o si
   * ea si-ar fi rupt textul pe doua randuri in loc sa fie acoperita. Tot urat.
   */
  const sursa = readFileSync(join(process.cwd(), "src", "components", "ui", "eticheta-stare.tsx"), "utf8");
  assert.match(sursa, /whitespace-nowrap/, "eticheta si-a pierdut `whitespace-nowrap`");
});
