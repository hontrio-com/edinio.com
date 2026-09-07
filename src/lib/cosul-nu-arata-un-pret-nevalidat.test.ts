import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * UN PRET PE CARE NU L-AM VALIDAT NU SE ARATA CA PRET, SI NU SE POATE COMANDA PE EL.
 *
 * ═══ ⚠ DEFECTUL, SI DE CE NU-L PRINDEA NIMIC ═══
 *
 * `CartProvider` aducea preturile autoritare asincron si le inghitea esecul:
 *
 *   getCartPricing(...).then(setPreturi).catch(() => {});
 *
 * Fara `regula`, `pretulLiniei` cade pe `item.price`. Pentru un produs OBISNUIT purtarea e buna: un
 * pret de catalog vechi de-o zi, din aceeasi lume cu cel adevarat. Pentru unul PERSONALIZAT,
 * `item.price` e pretul de BAZA, salvat dinadins fara supliment: fototapetul de 3,5 x 2,5 m cu
 * Premium si protectie costa 910 lei si are `price: 89`.
 *
 * Deci la o singura cerere picata, si fara nicio reincercare, cosul arata 89, clientul apasa, si
 * serverul incasa 910. Serverul n-a fost pacalit nicio clipa; omul a fost.
 *
 * ⚠ SI ACEEASI LIPSA AVEA PATRU PRICINI care nu se deosebeau din afara: preturile inca se incarca,
 * cererea a picat, produsul a fost sters, produsul n-a venit in raspuns. Prima trece singura;
 * celelalte trei nu trec niciodata. `cereRevizuire` raspunde `false` la toate, dinadins, fiindca
 * „nu stiu inca" nu inseamna „stricat" — deci ea nu putea acoperi cazul asta.
 *
 * ⚠ DE CE SE CITESTE SURSA. Regula insasi e o functie pura si se probeaza ca atare in
 * `pret-personalizat.test.ts`. Ce se apara aici e ca fiecare ECRAN chiar o intreaba: patru
 * componente React care cer un furnizor de cos, iar proiectul n-are jsdom. Exact prin gaura asta a
 * intrat o data in productie un cos care arata pretul de catalog langa un server care incasa altul.
 */

const RAD = process.cwd();

/** ⚠ Comentariile se taie: fisierele isi explica pe larg propriile defecte, cu `item.price` in text. */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const PROVIDER = "src/components/storefront/cart/CartProvider.tsx";
const PIESE = "src/components/storefront/sections/cart/_shared/CartPieces.tsx";
const SERTAR = "src/components/storefront/sections/cart/CartDrawerClassic.tsx";
const COMPACT = "src/components/storefront/sections/cart/CartPageCompact.tsx";
const REZUMAT = "src/components/storefront/sections/checkout/CheckoutSummary.tsx";
const FORMULAR = "src/components/storefront/sections/checkout/CheckoutForm.tsx";
const NUCLEU = "src/components/storefront/sections/checkout/checkout-core.ts";
const COMANDA_ACUM = "src/components/ministore/OrderModal.tsx";

/* ═══════════════════════════════════════════════════════════════════════════
   FURNIZORUL STIE CE S-A INTAMPLAT CU CEREREA
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ esecul cererii de preturi NU se mai inghite in tacere", () => {
  const s = sursa(PROVIDER);

  /*
   * ⚠ ASTA E CHIAR RANDUL CARE ERA ACOLO. Lasat, nimeni n-ar fi putut afla vreodata ca preturile
   * lipsesc din alt motiv decat „inca se incarca".
   */
  assert.doesNotMatch(s, /\.catch\(\(\) => \{\}\)/, "esecul cererii de preturi se inghite iar");
  assert.match(s, /setPricingStare\("eroare"\)/, "nu exista stare de eroare");
  assert.match(s, /setPricingStare\("gata"\)/, "nu exista stare de reusita");
});

test("⚠ se REINCEARCA o data singura, si exista si un buton de reincercare", () => {
  /*
   * Cele mai multe esecuri de aici sunt o clipire de retea la schimbarea paginii: a doua cerere le
   * rezolva fara ca omul sa afle ca a fost ceva. Mai multe ar fi tinut butonul de comanda stins
   * minute intregi pe un magazin chiar cazut, si atunci raspunsul cinstit e butonul.
   */
  const s = sursa(PROVIDER);
  assert.match(s, /cere\(\)\s*\n\s*\.catch\(\(\) => cere\(\)\)/, "nu se mai reincearca deloc");
  assert.match(s, /reincearcaPreturile/, "nu exista reincercare ceruta de om");
});

/* ═══════════════════════════════════════════════════════════════════════════
   NICIUN ECRAN NU ARATA NUMARUL
   ═══════════════════════════════════════════════════════════════════════════ */

for (const [nume, fisier] of [
  ["linia comuna a paginilor de cos", PIESE],
  ["sertarul", SERTAR],
  ["rezumatul de la finalizare", REZUMAT],
] as const) {
  test(`⚠ ${nume} nu arata pretul unei linii nevalidate`, () => {
    const s = sursa(fisier);
    assert.match(s, /linePretNevalidat/, `${nume} nu intreaba deloc daca pretul e validat`);
    /*
     * ⚠ SI CHIAR ASCUNDE NUMARUL. Fara randul asta, o componenta care doar CHEAMA functia si ii
     * ignora raspunsul ar fi trecut proba: exact felul de reparatie care arata facuta si nu e.
     */
    assert.match(s, /se verifica pretul\.\.\./i, `${nume} intreaba, dar arata pretul oricum`);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   SI NICIUN BUTON NU PLEACA
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ butonul de finalizare din cos e stins cat timp o linie nu s-a validat", () => {
  /*
   * ⚠ SI TOTALUL, nu doar linia: el include linia nevalidata cu pretul ei de BAZA, deci ar fi un
   * numar plauzibil si gresit pe care clientul l-ar duce mai departe.
   */
  for (const [nume, fisier] of [["piesele comune", PIESE], ["sertarul", SERTAR], ["cosul compact", COMPACT]] as const) {
    const s = sursa(fisier);
    assert.match(s, /liniiNevalidate/, `${nume} nu numara liniile nevalidate`);
    assert.match(
      s, /disabled=\{[^}]*liniiNevalidate > 0\}/,
      `${nume} lasa butonul de finalizare apasabil peste un pret nevalidat`,
    );
  }
});

test("⚠ finalizarea nu se poate trimite, si se spune de ce", () => {
  const nucleu = sursa(NUCLEU);
  assert.match(nucleu, /const liniiNevalidate = items\.filter\(linePretNevalidat\)/,
    "finalizarea nu mai stie care linii au pretul nevalidat");

  const form = sursa(FORMULAR);
  assert.match(form, /disabled=\{[^}]*liniiNevalidate\.length > 0\}/,
    "butonul de plata se apasa peste un pret nevalidat");
  /* ⚠ Un buton stins fara explicatie e mai rau decat unul care refuza: omul apasa si nu intelege. */
  assert.match(form, /Se verifica preturile produselor personalizate/, "nu se spune de ce e stins butonul");
  assert.match(form, /reincearcaPreturile/, "nu se poate reincerca din formular");
});

test("⚠ si «Comanda acum» refuza cat timp o linie PURTATA DIN COS nu s-a validat", () => {
  /*
   * Produsul de pe care s-a apasat isi stie pretul: definitia lui e in pagina. Dar liniile purtate
   * din cos trec prin acelasi furnizor, deci pot cadea pe pretul lor de baza, iar `placeOrder`
   * incaseaza pretul adevarat.
   */
  const s = sursa(COMANDA_ACUM);
  assert.match(s, /linePretNevalidat/, "«Comanda acum» nu intreaba nimic despre liniile din cos");
  assert.match(s, /disabled=\{isPending \|\| belowMinOrder \|\| liniiNevalidate > 0\}/,
    "«Comanda acum» pleaca peste un pret nevalidat purtat din cos");
});
