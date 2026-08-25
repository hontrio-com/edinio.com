import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   MARCA SE SCRIE DIN ECRANUL eMAG, NU DIN FISA PRODUSULUI (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   eMAG cere marca la ORICE produs nou (`ceLipseste`), iar fara ea publicarea se opreste cu
   „Produsul n-are marcă". Mesajul era corect, dar drumul era lung: omul inchidea ecranul
   eMAG, deschidea fisa produsului, cauta sectiunea Google, scria un cuvant, salva, se
   intorcea. Pentru zece produse, de zece ori.

   ⚠ SI NU E CA LA TRENDYOL. Acolo marca e un ID din CATALOGUL lor, deci trebuie ales dintr-o
   lista cautata la ei (`TrendyolListingEditor` are `brandQuery`, `brandResults`). eMAG
   primeste text liber, deci un camp de scris e de ajuns — un selector ar fi fost o unealta
   pentru o problema pe care eMAG n-o are.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const act = viu("src/lib/actions/emag.actions.ts");

test("⚠ marca se scrie in ACELASI loc ca din fisa produsului", () => {
  /*
   * Doua locuri pentru aceeasi valoare se despart, iar despartirea s-ar fi vazut abia cand
   * eMAG ar fi primit alta marca decat cea de pe site. `page_sections.google.brand` e locul
   * din care citeste si `amprentaContinutului`, si cartografierea.
   */
  assert.match(act, /export async function salveazaMarcaEmag\(/);
  assert.match(act, /google: \{ \.\.\.google, brand: curata \}/);
});

test("⚠ nu sterge restul fisei", () => {
  /*
   * Cea mai importanta proba din fisier. Scris de-a gata, obiectul ar fi sters specificatii,
   * dimensiuni si variante — un camp de un cuvant ar fi taiat fisa produsului.
   */
  assert.match(act, /\.from\("products"\)\.select\("page_sections"\)/);
  assert.match(act, /page_sections: \{ \.\.\.ps, google:/);
});

test("⚠ o citire picata nu se citeste ca „fisa e goala”", () => {
  /* Altfel s-ar fi sters restul sectiunilor exact in clipa in care baza nu e in apele ei. */
  assert.match(act, /if \(eCitire\) return \{ error: "Nu am putut citi fișa produsului/);
  assert.match(act, /if \(!rand\) return \{ error: "Produsul nu există/);
});

test("⚠ se pune la coada pe calea OMULUI, nu pe cea a plaselor", () => {
  /*
   * Omul tocmai a atins produsul: atingerea lui chiar inseamna date noi, deci un element
   * abandonat pe motiv de marca trebuie REAPRINS. Cu `reluaAutomatEmagMany` ar fi ramas
   * abandonat, si reparatia lui n-ar fi plecat niciodata.
   */
  const i = act.indexOf("export async function salveazaMarcaEmag(");
  const f = act.slice(i, act.indexOf("export async function publicaProduseleEmag(", i));
  assert.match(f, /await enqueueEmagSyncMany\(businessId, \[productId\]\);/);
  assert.doesNotMatch(f, /reluaAutomatEmagMany/);
});

test("⚠ si magazinul se verifica, ca la orice actiune de server", () => {
  /* Actiunile de server se pot chema cu orice argumente, printr-un POST direct. Fara garda,
     cineva ar fi putut scrie marca pe produsele altui magazin. */
  const i = act.indexOf("export async function salveazaMarcaEmag(");
  const f = act.slice(i, i + 900);
  assert.match(f, /const g = await guard\(businessId\);/);
  assert.match(f, /\.eq\("business_id", businessId\)/);
});

test("⚠ campul apare NUMAI la produsele fara marca", () => {
  const ui = viu("src/components/dashboard/EmagDePublicat.tsx");
  assert.match(ui, /\{!p\.marca && <CampMarca businessId=\{businessId\} produsId=\{p\.id\} \/>\}/);
  /* ⚠ Lista poarta marca de la server, altfel ecranul n-ar avea de unde sti cine n-are. */
  assert.match(act, /marca: string \| null;/);
});
