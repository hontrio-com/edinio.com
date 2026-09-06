import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Greutatea configuratiei ajunge la CURIER?
 *
 * ═══ ⚠ CE SE INTAMPLA CAND NU AJUNGE ═══
 *
 * O cana cu cutie de lemn cantareste 300 de grame in catalog si un kilogram in realitate. Curierul
 * nu crede declaratia: cantareste coletul la depozit si refactureaza banda adevarata. Diferenta o
 * plateste comerciantul pe fiecare colet, si nu apare nicaieri in panou — nici in comanda, nici in
 * cotatie, nici pe AWB. Exact tiparul cu care a inceput `awb-weight.ts`, cand toate cele sase
 * formulare porneau de la un kilogram fix.
 *
 * ═══ ⚠ DE CE O PROBA PE SURSA ═══
 *
 * Drumul are patru bucati scrise in patru fisiere: verdictul liniei socoteste gramele, comanda le
 * SCRIE in instantaneu, cititorul le ia inapoi din jsonb, si adunarea de greutate le inmulteste cu
 * cantitatea. Fiecare bucata isi are probele ei de comportament. Ce nu poate prinde niciuna dintre
 * ele e o VERIGA SCOASA: un al patrulea loc care scrie instantaneul fara `grame`, sau o adunare de
 * greutate care nu se mai uita la configuratie. Nimic nu cade atunci — coletul pleaca doar mai
 * usor decat este.
 *
 * ═══ CE PAZESTE ═══
 *
 *   1. TOATE locurile care scriu instantaneul scriu si `grame`.
 *   2. Verdictul liniei chiar socoteste gramele, si nu le ia de la client.
 *   3. Adunarea de greutate a cosului le citeste, si le inmulteste cu cantitatea.
 *   4. Emiterea AWB-ului le aduce din instantaneul comenzii, cu cititorul defensiv.
 */

const SRC = path.resolve(process.cwd(), "src");

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF, iar potrivirile pe rand cad tacut. */
function sursa(relativ: string): string {
  return readFileSync(path.join(SRC, relativ), "utf8").replace(/\r\n/g, "\n");
}

/** Corpul unei functii, de la semnatura pana la urmatorul export de nivel zero. */
function corpul(relativ: string, nume: string): string {
  const s = sursa(relativ);
  const start = s.search(new RegExp(`export (?:async )?function ${nume}\\(`));
  assert.ok(start > 0, `nu am gasit ${nume} in ${relativ}`);
  const urmator = s.indexOf("\nexport ", start + 10);
  const corp = s.slice(start, urmator > 0 ? urmator : s.length);
  // ⚠ Garda de marime: un cititor rupt ar fi intors cateva randuri, si toate potrivirile de mai jos
  // ar fi cazut pe gol — adica proba ar fi trecut fara sa se uite la nimic.
  assert.ok(corp.length > 300, `am citit doar ${corp.length} caractere din ${nume} — cititorul s-a rupt`);
  return corp;
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. TOATE locurile care scriu instantaneul
   ═══════════════════════════════════════════════════════════════════════════ */

const MARCA = "configuratie: {";

/**
 * Fiecare obiect `configuratie: { ... }`, taiat la randul care il inchide.
 *
 * ⚠ Se taie fiecare bloc, nu se cauta `grame:` in tot fisierul: un singur loc reparat ar fi
 * multumit o cautare globala, si celelalte doua ar fi plecat mai departe fara greutate.
 */
function blocurileInstantaneului(s: string): string[] {
  const out: string[] = [];
  for (let i = s.indexOf(MARCA); i >= 0; i = s.indexOf(MARCA, i + 1)) {
    const rest = s.slice(i);
    const inchidere = rest.match(/\n\s*\},/);
    assert.ok(inchidere?.index !== undefined, "un instantaneu nu se inchide — cititorul s-a rupt");
    out.push(rest.slice(0, inchidere.index));
  }
  return out;
}

/*
 * ⚠ CATE LOCURI SCRIU INSTANTANEUL, azi.
 *
 * Trei: produsul din formularul de comanda directa, liniile purtate din cos odata cu el, si calea
 * cosului. Numarul se pironeste ca sa nu poata aparea un al patrulea in tacere — vezi si
 * `actions/comanda-repretuieste-configuratia.test.ts`, care pironeste aceleasi trei pe cai.
 */
const CATE_SCRIERI = 3;

test("TOATE locurile care scriu instantaneul scriu si greutatea", () => {
  const blocuri = blocurileInstantaneului(sursa("lib/actions/order.actions.ts"));
  assert.equal(
    blocuri.length, CATE_SCRIERI,
    `instantaneul se scrie in ${blocuri.length} locuri, nu in ${CATE_SCRIERI}: daca e unul nou, ` +
    "trebuie sa poarte si `grame`, altfel coletul lui pleaca cu greutatea produsului gol",
  );
  for (const [i, bloc] of blocuri.entries()) {
    assert.match(
      bloc, /\bgrame: cfg(?:Principal)?\.grame\b/,
      `locul ${i + 1} scrie instantaneul fara greutate: coletul pleaca la curier cu greutatea ` +
      "produsului din catalog, iar diferenta o refactureaza curierul dupa cantarirea din depozit",
    );
  }
});

test("greutatea sta pe verdictul liniei, langa pret", () => {
  /*
   * ⚠ Cele doua se hotarasc din aceleasi alegeri si in aceeasi clipa. Socotita pe alt drum,
   * greutatea ar fi iesit din alta stare decat pretul — si coletul ar fi cantarit cat o
   * configuratie pe care n-a cumparat-o nimeni.
   */
  const c = corpul("lib/configurators/repretuire.ts", "verdictulLiniei");
  assert.match(c, /grame: grameleConfiguratiei\(compilat, v\.valori\)/,
    "verdictul nu mai socoteste gramele configuratiei");
  assert.ok(
    sursa("lib/configurators/repretuire.ts").includes("grame: number;"),
    "`InstantaneuConfiguratie` nu mai cere greutatea, deci un loc de scriere o poate uita fara ca tsc sa cada",
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. Cele DOUA socoteli de greutate
   ═══════════════════════════════════════════════════════════════════════════ */

test("adunarea greutatii cosului citeste configuratia, si o inmulteste cu bucatile", () => {
  /*
   * ⚠ E singura adunare de greutate din proiect: si cotarea, si emiterea AWB-ului trec prin ea.
   * Scoasa de aici, greutatea configuratiei s-ar pierde in amandoua deodata.
   *
   * Inmultirea se cere pe fata: `grame` e PER BUCATA, iar adunata o singura data, o comanda de
   * zece cani cu cutie ar fi declarat 3,75 kg in loc de 10,5.
   */
  const c = corpul("lib/shipping/cart-weight.ts", "contextulCosului");
  assert.match(c, /linie\.grameConfiguratie/, "greutatea configuratiei nu mai intra in colet");

  /*
   * ⚠ FIECARE adunare de greutate se inmulteste cu bucatile, nu doar prima.
   *
   * Se cer toate, nu se cauta o potrivire undeva: `grame` e PER BUCATA, iar o adunare lasata fara
   * `* qty` ar fi declarat 3,75 kg pentru zece cani cu cutie in loc de 10,5 — banda de tarif a unui
   * colet de patru kilograme pentru unul de zece. Aceeasi greseala e cu putinta si pe randul
   * greutatii din catalog, si e chiar cea care a inceput fisierul.
   */
  const adunari = c.match(/^[^\n]*\bgrame \+=[^\n]*$/gm) ?? [];
  assert.ok(adunari.length >= 2,
    `am gasit ${adunari.length} adunari de greutate, asteptam cel putin doua (catalog + configuratie)`);
  for (const rand of adunari) {
    assert.match(rand, /\*\s*qty;\s*$/,
      `o greutate se aduna fara sa se inmulteasca cu bucatile: ${rand.trim()}`);
  }
});

test("emiterea AWB-ului aduce greutatea din INSTANTANEUL comenzii", () => {
  /*
   * ⚠ Din ce s-a vandut, nu din configuratorul de azi. Recalculata, greutatea ar fi iesit din
   * versiunea curenta: comerciantul care schimba ambalajul saptamana viitoare ar fi cantarit cu
   * numarul cel nou un colet vandut, cotat si platit dupa cel vechi.
   *
   * Si cu CITITORUL DEFENSIV: `orders.items` e jsonb, poate fi scris de o versiune veche de cod si
   * editat de mana. Un `NaN` luat de-a dreptul ar fi facut greutatea intregii comenzi nefinita.
   */
  const c = corpul("lib/shipping/awb-weight.ts", "liniileComenzii");
  assert.match(c, /grameConfiguratie: instantaneulLiniei\(brut\)\?\.grame \?\? 0/,
    "liniile comenzii nu mai poarta greutatea configuratiei catre adunarea de greutate");
  assert.ok(
    corpul("lib/shipping/awb-weight.ts", "greutateaColetului").includes("liniileComenzii(items)"),
    "greutatea coletului nu se mai compune din liniile comenzii, deci ocoleste configuratia",
  );
});

test("cititorul instantaneului chiar intoarce gramele", () => {
  // Fara ele pe `InstantaneuCitit`, veriga dintre comanda si colet se rupe fara ca nimic sa cada:
  // `?.grame` ar fi fost `undefined`, si `?? 0` l-ar fi facut zero pe toate comenzile.
  const c = corpul("lib/configurators/instantaneu.ts", "citesteInstantaneul");
  assert.match(c, /grame: grameBune\(o\.grame\)/, "instantaneul se citeste fara greutate");
});
