import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CURIERUL CARE A IESIT DINADINS NU SE PUNE INAPOI         (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Trei curieri parasesc lista pe comenzile cu ramburs, fiecare cu motivul lui scris pe larg in
 * ramura lui:
 *
 *   * FedEx nu are ramburs deloc (retras de ei in 2023, in afara de Ground spre Canada);
 *   * UPS are, dar numai pe conturi „Daily Pickup" sau „Drop Shipping", iar tipul contului nu se
 *     poate citi din API; comerciantul are un comutator, iar stins, UPS dispare;
 *   * DHL Express nu vinde ramburs din Romania. Trimis totusi, nu cade la cotare, cade la EMITERE.
 *
 * Toti trei spun acelasi lucru: o optiune la tarif fix ar fi ALEASA de cumparator, fiindca tariful
 * fix e adesea cel mai mic din lista. Comanda s-ar bloca in checkout ca „livrata prin X", iar
 * comerciantul ar afla abia la emitere ca AWB-ul nu se poate face DELOC.
 *
 * ⚠ SI TOCMAI PLASA DE SIGURANTA II PUNEA INAPOI. Plafonul de 25 de secunde din `getShippingOptions`
 * parcurge `enabledZones` ORB si da fiecarui curier „intarziat" o optiune la pretul zonei, apoi o
 * SEMNEAZA. Un `continue` nu lasa nicio urma in urma lui, deci bucla nu avea de unde sti ca cei trei
 * plecasera dinadins, nu din intarziere.
 *
 * ⚠ Regula sora, si de ce sunt doua fisiere: `rezerva-la-zero-nu-pleaca-semnata` apara PRETUL unei
 * rezerve (zero nu e o oferta). Asta apara APARTENENTA la lista (cine a plecat nu se intoarce).
 * Puse impreuna, s-ar fi acoperit una pe alta.
 */

const COTARE = "src/lib/actions/shipping.actions.ts";

/*
 * ⚠ CRLF SCOS SI COMENTARIILE TAIATE, amandoua obligatorii.
 *
 * Depozitul e 100% CRLF (masurat), deci un tipar pe mai multe randuri scris cu `\n` nu potriveste.
 * Iar comentariile din fisier isi explica propriile defecte FOLOSIND chiar numele cautate: fara
 * taiere, `indexOf("iesitiDinLista.has")` ar nimeri intr-o explicatie, si ordinea ar fi masurata
 * pe proza, nu pe cod.
 */
function sursaCurata(): string {
  return readFileSync(COTARE, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Bucata de cod a unei ramuri de curier, taiata pana la urmatoarea ramura. */
function ramura(s: string, curier: string): string {
  const marcaje = [...s.matchAll(/\}\s*else if \(courierId === "/g)].map((m) => m.index ?? -1);
  const start = s.indexOf(`} else if (courierId === "${curier}") {`);
  assert.ok(start > 0, `ramura ${curier} nu mai exista in cotare`);
  const urmatoarea = marcaje.find((p) => p > start);
  return s.slice(start, urmatoarea ?? s.length);
}

test("⚠ fiecare dintre cei trei isi RETINE iesirea, pe ramura lui", () => {
  /*
   * ⚠ PE RAMURA, nu o numaratoare globala. Un `3` global ar fi trecut si daca unul dintre ei ar fi
   * pierdut randul iar altul l-ar fi capatat de doua ori: ar fi spus „sunt trei" si ar fi lasat un
   * curier descoperit, exact cel mai scump de gresit.
   */
  const s = sursaCurata();
  for (const curier of ["fedex", "ups", "dhl"]) {
    assert.match(
      ramura(s, curier),
      /iesitiDinLista\.add\(courierId\);/,
      `${curier} iese din lista fara sa retina, deci bucla de rezerva il pune inapoi la tarif fix`,
    );
  }
});

test("⚠ si sunt EXACT trei: un al patrulea cere hotarare, nu tacere", () => {
  /*
   * Egalitate, nu „cel putin". Cine adauga maine un curier care iese dinadins trebuie sa treaca si
   * pe aici: altfel plasa ar spune ca pazeste trei si ar pazi patru pe jumatate. Iar cine STERGE
   * unul face proba sa cada cu numele lui.
   */
  const s = sursaCurata();
  const cate = (s.match(/iesitiDinLista\.add\(courierId\);/g) ?? []).length;
  assert.equal(cate, 3, `sunt ${cate} iesiri retinute, nu trei`);
});

test("⚠ multimea se declara INAINTEA buclei de curieri", () => {
  /*
   * Declarata inauntru, s-ar fi nascut goala la fiecare zona si n-ar fi tinut minte nimic dintr-o
   * iteratie in alta. Ar fi compilat, ar fi trecut typecheck, si n-ar fi aparat nimic.
   */
  const s = sursaCurata();
  const iDecl = s.indexOf("const iesitiDinLista = new Set<string>();");
  const iPrimulAdd = s.indexOf("iesitiDinLista.add(courierId);");
  assert.ok(iDecl > 0, "multimea nu mai e declarata");
  assert.ok(iPrimulAdd > 0, "nimeni nu mai retine nicio iesire");
  assert.ok(iDecl < iPrimulAdd, "multimea se declara dupa prima folosire");
});

test("⚠⚠ BUCLA DE REZERVA O CONSULTA INAINTE DE A ADAUGA, nu dupa", () => {
  /*
   * ⚠ ASTA E AFIRMATIA CARE CONTEAZA, SI E DESPRE ORDINE.
   *
   * O proba care doar cere ca randul `iesitiDinLista.has(...)` sa existe undeva ar trece si daca
   * l-as muta DUPA `intarziati.push(courierId)` — adica exact acolo unde nu mai apara nimic, dupa
   * ce optiunea a fost deja pusa in lista si e pe drumul catre semnare.
   *
   * Aceeasi lectie ca la filtrul de rezerve din regula sora: acolo pus dupa semnare, aici pus dupa
   * adaugare. In amandoua, randul exista si nu face nimic.
   */
  const s = sursaCurata();
  const iPlafon = s.indexOf("if (cotatieExpirata) {");
  assert.ok(iPlafon > 0, "nu mai gasesc bucla de la plafonul de timp");
  const bloc = s.slice(iPlafon, s.indexOf("\n  }", iPlafon));

  const iHas = bloc.indexOf("iesitiDinLista.has(courierId)");
  const iPush = bloc.indexOf("intarziati.push(courierId);");
  assert.ok(iHas > 0, "bucla de rezerva nu mai intreaba cine a iesit dinadins");
  assert.ok(iPush > 0, "nu mai gasesc adaugarea in lista intarziatilor: proba n-are fata de ce compara");
  assert.ok(
    iHas < iPush,
    "paza a ajuns DUPA adaugare: curierul care nu poate incasa ramburs intra oricum in lista",
  );
});
