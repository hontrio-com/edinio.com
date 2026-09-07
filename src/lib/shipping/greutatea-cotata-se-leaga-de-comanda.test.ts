import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * COTATIA DE TRANSPORT E LEGATA DE GREUTATEA COSULUI, CAP LA CAP.
 *
 * ═══ ⚠ CE S-A INCHIS, SI DE CE ABIA ACUM ═══
 *
 * Amprenta cotatiei nu lega cosul. Se cerea un pret pentru un cos usor, se primea un token valid,
 * si se comanda apoi unul greu la acelasi pret. Decizia de a lasa asa, luata pe 04.08.2026 dupa
 * auditul de securitate, era intemeiata ATUNCI si e scrisa pe fata in `quote-token.ts`: gaura se
 * putea folosi la UN SINGUR magazin, cu produse de cel mult un kilogram, in timp ce o legare
 * GRESITA trimite comenzi reale pe `max(suma ceruta, tarif implicit)`, adica pe „Ridicare
 * personala" omul vede 0,00 lei si plateste intre 18 si 45.
 *
 * Premisa s-a schimbat, si s-a masurat pe 08.09.2026: 16 magazine cu curier activ (erau 3), 16
 * magazine cu produse cantarite, 5.064 de produse cu greutate, pana la 40 de kilograme bucata.
 *
 * ═══ ⚠ DE CE PROBELE ASTEA CITESC SURSA ═══
 *
 * Regula insasi (semnat, comparat, „mai usor trece") e pura si se probeaza in `quote-token.test.ts`.
 * Ce se apara aici e CABLAREA ei prin trei fisiere care nu pot fi rulate fara sesiune, baza si
 * furnizori de curierat. Masurat cu un mutant care semneaza rezerva de un kilogram in loc de
 * greutatea reala: toate probele pure au trecut verzi, fiindca niciuna nu se uita la cotare.
 */

const RAD = process.cwd();

/** ⚠ Comentariile se taie: fisierele astea isi explica pe larg propriile reguli, cu cuvintele cautate in text. */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const COTARE = "src/lib/actions/shipping.actions.ts";
const COMANDA = "src/lib/actions/order.actions.ts";
const TOKEN = "src/lib/shipping/quote-token.ts";

/* ═══════════════════════════════════════════════════════════════════════════
   1. LA COTARE SE SEMNEAZA GREUTATEA REALA
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ se semneaza greutatea BRUTA, nu rezerva de un kilogram", () => {
  /*
   * ═══ ⚠ DEOSEBIREA CARE CONTEAZA ═══
   *
   * `weight` (cu rezerva de 1 kg) e o alegere despre cum se CERE pretul curierului: un cos fara
   * greutati completate tot trebuie cotat cumva. `cartWeightKg` e cat cantareste cosul cu adevarat,
   * dupa catalog, si numai el se poate reconstrui exact din liniile comenzii.
   *
   * Semnata rezerva, un magazin cu produse de 300 de grame ar avea mereu 1000 semnate, deci un cos
   * de 900 de grame ar trece drept „mai usor". Poarta ar fi parut pusa si n-ar fi aparat nimic.
   */
  const s = sursa(COTARE);
  assert.match(s, /const grameCotate = Math\.round\(cartWeightKg \* 1000\);/,
    "gramele semnate nu mai sunt greutatea bruta a cosului");
  assert.doesNotMatch(s, /const grameCotate = Math\.round\(weight \* 1000\)/,
    "se semneaza rezerva de cotare in loc de greutatea reala");
});

test("⚠ AMANDOUA iesirile din cotare semneaza greutatea", () => {
  /*
   * `getShippingOptions` are doua `return` cu optiuni semnate: ramura internationala, care taie
   * scurt, si cea de la final. Cat timp semnarea statea doar pe a doua, ramura internationala pleca
   * fara token deloc — defect real, reparat atunci cu `semneazaOptiuni`. Acelasi tipar se poate
   * repeta cu greutatea, deci se cere ca FIECARE apel sa o poarte.
   */
  const s = sursa(COTARE);
  const apeluri = s.match(/semneazaOptiuni\([^)]*/g) ?? [];
  assert.ok(apeluri.length >= 2, `nu mai gasesc cele doua iesiri semnate; gasite ${apeluri.length}`);
  for (const a of apeluri) {
    assert.match(a, /esteRamburs, grameCotate/, `o iesire semneaza fara greutate: ${a.slice(0, 80)}`);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. LA COMANDA SE SOCOTESTE DIN CATALOG SI SE COMPARA
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ greutatea comandata iese din CATALOG, pe amandoua drumurile de comanda", () => {
  /*
   * Luata de la client, ar fi fost chiar lucrul pe care poarta il verifica: cine coteaza un
   * kilogram si comanda cincisprezece ar declara mai departe un kilogram.
   */
  const s = sursa(COMANDA);
  assert.match(s, /function grameleLiniilor\(/, "ajutorul care cantareste liniile a disparut");
  assert.match(s, /\.select\("id, name, price, is_active, business_id, page_sections, weight_grams"\)/,
    "produsul din comanda directa nu mai aduce greutatea");
  assert.match(s, /\.select\("id, name, price, is_active, page_sections, weight_grams"\)\n\s*\.in\("id", productIds\)/,
    "produsele din cos nu mai aduc greutatea");

  /* ⚠ Fara declaratia insasi: se numara CHEMARILE, adica drumurile care chiar cantaresc. */
  const apeluri = s.match(/(?<!function )grameleLiniilor\(/g) ?? [];
  assert.equal(apeluri.length, 2, `greutatea se socoteste in ${apeluri.length} drumuri, nu in cele doua de comanda`);
});

test("⚠ GREUTATEA DEPASITA REFUZA COMANDA, nu cade pe tariful implicit", () => {
  /*
   * ═══ ⚠ ASTA E REGULA PE CARE NOTA VECHE O CEREA EXPLICIT ═══
   *
   * „Daca cineva reia asta: nu lega cosul cu esec pe tariful implicit. Esueaza in FAVOAREA
   * clientului (refuza comanda si cere recotare), altfel un caz de colt netestat se plateste din
   * buzunarul cumparatorului."
   *
   * Numeric: rezerva e `max(suma ceruta, tarif implicit)`, deci o cadere pe „Ridicare personala" la
   * 0,00 lei face transportul 18 pana la 45, fara ca omul sa fi vazut suma. Cinci magazine
   * publicate au ridicare personala langa curieri platiti.
   */
  const s = sursa(COMANDA);
  assert.match(s, /if \(verdict\.motiv === "greutate"\) return \{ recotare: true \};/,
    "greutatea depasita nu mai refuza comanda");

  /* ⚠ Si amandoua drumurile chiar opresc comanda, nu doar primesc verdictul. */
  const opriri = s.match(/if \("recotare" in verdictTransport\) \{/g) ?? [];
  assert.equal(opriri.length, 2, `doar ${opriri.length} din cele doua drumuri opresc comanda pe greutate`);
  assert.match(s, /shippingRequote/, "refuzul nu lasa nicio urma in jurnal");
});

test("⚠ SEMNATURA cazuta cade mai departe pe tarif, nu refuza", () => {
  /*
   * Cealalta jumatate, si la fel de importanta: o cotatie pierduta (token expirat, desfasurare la
   * mijloc, cheie rotita) n-are voie sa coste o vanzare. Confundate cele doua, fiecare desfasurare
   * ar fi oprit comenzile aflate in curs.
   */
  const s = sursa(COMANDA);
  const i = s.indexOf("function autoritativeShipping");
  const corp = s.slice(i, s.indexOf("\nfunction ", i + 10));
  assert.match(corp, /return \{ shipping: Math\.max\(claimed, Math\.max\(0, round2\(tarifImplicit\)\)\) \};/,
    "rezerva pe tariful implicit a disparut cu totul");
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. SI CA NUMELE VECHI NU SE POATE INTOARCE
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ `verifyShippingQuote` nu mai exista nicaieri", () => {
  /*
   * ═══ ⚠ DE CE S-A REDENUMIT ═══
   *
   * Verificarea intoarce acum un verdict cu motiv, nu un boolean. Un obiect e insa MEREU adevarat in
   * JavaScript: pastrat numele, fiecare `if (verifyShippingQuote(...))` din proiect ar fi devenit
   * „mereu da" fara ca `tsc` sa clipeasca — adica poarta s-ar fi deschis larg exact prin lucrarea
   * care o inchide.
   */
  for (const f of [TOKEN, COTARE, COMANDA]) {
    assert.doesNotMatch(sursa(f), /verifyShippingQuote/, `numele vechi s-a intors in ${f}`);
  }
  assert.match(sursa(TOKEN), /export function verificaCotatia\(/, "verificarea si-a schimbat iar numele");
});
