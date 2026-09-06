import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Doua linii ale ACELUIASI produs se pot returna separat?
 *
 * ═══ ⚠ CAND SE INTAMPLA, SI DE CE NU E O IPOTEZA ═══
 *
 * Cosul isi face cheia de linie din produs PLUS varianta (`lineKey` din `cart/normalize.ts`).
 * Deci doua marimi ale aceleiasi camasi sunt DOUA linii cu acelasi `product_id` in `orders.items`.
 *
 * ⚠ Masurat in productie: nicio comanda de pana acum n-are inca doua linii pe acelasi produs.
 * Adica defectul e LATENT, nu activ — si tocmai de aceea merita pazit: nu-l va prinde nimeni
 * raportandu-l, fiindca prima data cand se aprinde e o cerere de retur gresita la un client.
 *
 * ═══ ⚠ CE SE INTAMPLA PE CHEIA VECHE ═══
 *
 * Clientul bifeaza UNA. Serverul potrivea pe `product_id`, iar cele doua linii au acelasi produs
 * — deci `filter` le prindea pe amandoua si returul se inregistra pentru DOUA bucati. Pe ecran,
 * cele doua randuri aveau o singura bifa (aceeasi cheie de stare) si acelasi `key` de React.
 *
 * ═══ ⚠ DE CE INDEXUL, SI NU O CHEIE NOUA ═══
 *
 * `orders.items` nu se reordoneaza: editarea din panou scoate sau schimba linii pe loc, prin
 * spread, dar nu le amesteca. Deci pozitia e stabila pe viata comenzii, si nu cere nimic scris in
 * plus pe linie — spre deosebire de o amprenta, care ar fi lipsit de pe toate comenzile vechi.
 *
 * ⚠ Proba e pe SURSA fiindca ce apara e LANTUL: forma intoarsa de server, cheia de stare din
 * ecran, si potrivirea de la inregistrare. Fiecare veriga in parte merge si fara celelalte.
 */

const SRC = path.resolve(process.cwd(), "src");

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(relativ: string): string {
  return readFileSync(path.join(SRC, relativ), "utf8").replace(/\r\n/g, "\n");
}

const SERVER = "lib/actions/return.actions.ts";
const CLIENT = "components/ministore/ReturnRequestClient.tsx";

test("⚠ probele stiu sa citeasca fisierele", () => {
  // Perechea obligatorie a oricarei probe pe sursa: un cititor rupt le-ar face pe toate verzi.
  assert.ok(sursa(SERVER).length > 5_000);
  assert.ok(sursa(CLIENT).length > 5_000);
});

test("⚠ SERVERUL potriveste pe INDEXUL liniei, nu pe produs", () => {
  const s = sursa(SERVER);
  assert.match(s, /wanted\.has\(i\.index\)/, "selectia se face inca pe produs");
  assert.match(s, /\[Number\(i\.index\), Math\.max\(1/, "cererea nu mai vine pe index");
  assert.match(s, /quantity: Math\.min\(i\.quantity, wanted\.get\(i\.index\)!\)/);
  /* Si ca forma intoarsa chiar poarta indexul, altfel ecranul n-are ce cheie sa trimita. */
  assert.match(s, /^\s{2}index: number;$/m, "`ReturnableItem` nu mai poarta indexul");
});

test("⚠ indexul se ia INAINTE de filtrarea extraoptiunilor", () => {
  /*
   * ⚠ Luat dupa, extraoptiunile scoase l-ar fi decalat: serverul ar fi returnat ALTA linie decat
   * cea bifata. Tacut, si numai pe comenzile care au extraoptiuni — adica greu de legat de cauza.
   */
  const s = sursa(SERVER);
  const iIndex = s.indexOf(".map((linie, index) =>");
  const iFiltru = s.indexOf('.startsWith("extra_")');
  assert.ok(iIndex > 0 && iFiltru > 0, "lipseste una dintre cele doua");
  assert.ok(iIndex < iFiltru, "indexul se numara dupa ce s-au scos extraoptiunile");
});

test("⚠ CLIENTUL tine bifa si `key` pe index", () => {
  const s = sursa(CLIENT);
  assert.match(s, /type Selection = Record<number,/, "starea de selectie e inca pe produs");
  assert.match(s, /key=\{i\.index\}/, "doua linii ale aceluiasi produs au acelasi `key`");
  assert.match(s, /onChange=\{\(\) => toggleItem\(i\.index\)\}/, "o bifa lucreaza pe doua linii");
  assert.match(s, /selection\[i\.index\]\?\.checked/);
  assert.match(s, /\.map\(\(i\) => \(\{ index: i\.index, quantity:/, "cererea pleaca inca pe produs");
});

test("⚠ nicaieri nu mai ramane o cheie pe `product_id`", () => {
  /*
   * ⚠ GUARDA CARE PRINDE JUMATATEA DE REPARATIE. Sase locuri din ecran foloseau cheia veche;
   * ramas unul singur, bifa si cantitatea ar fi cazut pe chei diferite — omul bifeaza un rand si
   * se schimba altul. Se cere ca NICIUNUL dintre tiparele de cheie sa nu mai numeasca produsul.
   *
   * ⚠ CE COSTA: `product_id` ramane liber sa fie CITIT (se si trimite mai departe pe cererea de
   * retur, ca sa stie comerciantul ce produs e). Ce se interzice e folosirea lui ca INDICE.
   */
  const s = sursa(CLIENT);
  assert.equal(
    /selection\[i\.product_id\]|key=\{i\.product_id\}|toggleItem\(i\.product_id\)|setQty\(i\.product_id/.test(s),
    false,
    "un loc din ecran cheieste inca pe produs",
  );
});
