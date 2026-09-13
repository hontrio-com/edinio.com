import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * „N-AM PUTUT AFLA" NU E „NICIUN REFUZ"                       (13.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ CE ERA. `refuzuriPeComanda` intorcea `RefuzOperatie[]`, iar pe ramura de eroare `[]`.
 * Panoul comenzii arata chenarul rosu doar cand lista avea elemente, deci TREI stari cu
 * intelesuri diferite ieseau identic pe ecran, ca tacere:
 *
 *   1. comanda e curata, chiar n-are niciun refuz;
 *   2. citirea din baza a CAZUT (`registru.ts`);
 *   3. omul nu detine magazinul (`operatii.actions.ts`);
 *   4. si a patra, in interfata: `.catch(() => {})`.
 *
 * Un refuz al furnizorului care nu se vede e chiar defectul pe care panoul acela a fost
 * construit sa-l inchida: masurat pe VetDepo, patru facturi refuzate intre 11.08 si
 * 01.09.2026, zero emise, iar comerciantul a aflat cand a scris el ca „nu merge Oblio".
 *
 * ⚠ MUTANTUL SE PUNE PE APELANT: se intoarce `[]` in loc de `{ ok: false }`, sau se scoate
 * `refuzuriNecitite` din conditia de iesire a componentei.
 *
 * ⚠ PROBA E PE SURSA fiindca `operatii.actions.ts` e „use server" si componenta cere DOM.
 * Se verifica CUSATURA: forma intoarsa, cele trei drumuri, si conditia de afisare.
 */

function sursa(relativ: string): string {
  return readFileSync(relativ, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const REGISTRU = "src/lib/operatii/registru.ts";
const ACTIUNE = "src/lib/actions/operatii.actions.ts";
const PANOU = "src/components/dashboard/OperatiiAtarnate.tsx";

test("⚠⚠ citirea cazuta din baza NU se mai intoarce ca lista goala", () => {
  const s = sursa(REGISTRU);

  assert.match(s, /export type RezultatRefuzuri\s*=\s*\|?\s*\{ ok: true; refuzuri: RefuzOperatie\[\] \}/,
    "tipul care deosebeste rezultatul incert de lipsa refuzurilor a disparut");
  assert.match(s, /Promise<RezultatRefuzuri>/,
    "`refuzuriPeComanda` s-a intors la lista simpla, deci eroarea arata iar ca lipsa de refuz");

  /*
   * ⚠ SE VERIFICA CHIAR RAMURA DE EROARE, nu doar tipul. Un `Promise<RezultatRefuzuri>` cu
   * `return { ok: true, refuzuri: [] }` pe eroare ar trece de afirmatia de mai sus si ar
   * pastra intreg defectul.
   */
  const iEroare = s.indexOf("nu am putut citi refuzurile");
  assert.ok(iEroare > 0, "nu se mai gaseste ramura de eroare a citirii");
  const dupaEroare = s.slice(iEroare, iEroare + 260);
  assert.match(dupaEroare, /return \{ ok: false \}/,
    "citirea cazuta se intoarce cu altceva decat `{ ok: false }`");
});

test("⚠ si lipsa dreptului pe magazin iese tot `{ ok: false }`", () => {
  const s = sursa(ACTIUNE);
  assert.match(s, /if \(!\(await detineMagazinul\(businessId\)\)\) return \{ ok: false \};/,
    "actiunea intoarce iar lista goala cand omul nu detine magazinul");
  assert.match(s, /Promise<RezultatRefuzuri>/, "actiunea si-a pierdut forma de rezultat");
});

test("⚠⚠ si panoul nu mai tace: starea a treia se VEDE", () => {
  const s = sursa(PANOU);

  assert.match(s, /setRefuzuriNecitite\(!r\.ok\)/,
    "panoul nu mai deosebeste rezultatul incert de unul gol");
  assert.match(s, /\.catch\(\(\) => \{ if \(activ\) setRefuzuriNecitite\(true\); \}\)/,
    "caderea de retea a redevenit `.catch(() => {})`, adica tacere");

  /*
   * ⚠ AFIRMATIA CARE APARA CEL MAI MULT. Fara `refuzuriNecitite` in conditia de iesire,
   * componenta intoarce `null` exact in starea pe care reparatia o face vizibila: totul de
   * mai sus ar fi corect si nimic nu s-ar vedea pe ecran.
   */
  assert.match(
    s, /if \(seIncarca \|\| \(operatii\.length === 0 && refuzuri\.length === 0 && !refuzuriNecitite\)\) return null;/,
    "starea incerta iese din componenta cu `null`, deci ramane tot tacere",
  );
  assert.match(s, /\{refuzuriNecitite \? \(/, "nu mai exista chenarul care spune ca nu stim");
});
