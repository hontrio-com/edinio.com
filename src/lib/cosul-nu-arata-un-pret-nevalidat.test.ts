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

/* ═══════════════════════════════════════════════════════════════════════════
   SI CA STAREA DE EROARE POATE FI ATINSA CU ADEVARAT
   ═══════════════════════════════════════════════════════════════════════════ */

const PRETURI = "src/lib/actions/store.actions.ts";

test("⚠ `getCartPricing` ARUNCA la o citire cazuta, nu intoarce un cos gol", () => {
  /*
   * ═══ ⚠ FARA ASTA, REINCERCAREA SI BUTONUL NU SE APRIND NICIODATA ═══
   *
   * `error` nu se citea deloc: functia mergea mai departe cu `data ?? []` si intorcea `{}`. Pentru
   * apelant, aia arata IDENTIC cu „magazinul n-are produsele astea": raspuns reusit, zero reguli.
   *
   * Deci `CartProvider` trecea pe `gata`, iar cosul ramanea la „Se verifica preturile produselor
   * personalizate..." PENTRU TOTDEAUNA, cu butonul stins si fara nicio cale de a mai incerca:
   * starile pe care le-am construit erau de neatins tocmai in cazul principal de eroare.
   */
  const s = sursa(PRETURI);
  const i = s.indexOf("export async function getCartPricing");
  assert.ok(i > 0, "citirea preturilor si-a schimbat numele");
  const corp = s.slice(i, s.indexOf("\nexport ", i + 10));

  assert.match(corp, /const \{ data, error \} = await admin/, "eroarea de baza nu se mai citeste");
  assert.match(corp, /if \(error\) \{/, "eroarea se citeste, dar nu se face nimic cu ea");
  assert.match(corp, /throw new Error\(/, "o citire cazuta nu mai arunca");
  assert.match(corp, /logError\(/, "o citire cazuta nu lasa nicio urma");
});

/* ═══════════════════════════════════════════════════════════════════════════
   SI NICIO SUMA CARE CONTINE LINIA NU SE ARATA
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ nu se ascunde doar pretul liniei, ci TOATE sumele care il contin", () => {
  /*
   * ═══ ⚠ DE CE NU AJUNGE LINIA ═══
   *
   * „Produse", transportul, TVA-ul si totalul se socotesc TOATE din acelasi total, in care linia
   * intra cu pretul ei de BAZA: 89 in loc de 910. Ascuns doar randul liniei, restul casetei ramanea
   * un set de numere plauzibile si gresite, chiar langa un rand care spune „se verifica pretul".
   */
  /*
   * ⚠ Fiecare caseta isi are forma ei, deci se cere ce chiar face, nu un numar de puncte de
   * suspensie: o numaratoare ar fi trecut si peste trei placeholdere puse pe randuri gresite.
   */
  /*
   * ⚠ SE CERE FIECARE RAND PE NUMELE LUI, nu un numar de ascunderi.
   *
   * Masurat cu mutanti: cu „cel putin trei", scoaterea ascunderii de pe subtotal (in piese) si de pe
   * total (in sertar) trecea nevazuta, fiindca mai ramaneau trei. O numaratoare spune cate sume sunt
   * ascunse, nu CARE, si tocmai asta conteaza.
   */
  const randuri = [
    ["piesele comune", PIESE, ["formatPrice(total)", "formatPrice(pricing.vatAmount)", "formatPrice(pricing.grandTotal)"]],
    ["sertarul", SERTAR, ["formatPrice(total)", "formatPrice(vatAmount)", "formatPrice(grandTotal)"]],
  ] as const;
  for (const [nume, fisier, campuri] of randuri) {
    const s = sursa(fisier);
    for (const camp of campuri) {
      const scapat = camp.replace(/[.()]/g, (c) => "\\" + c);
      assert.match(
        s, new RegExp(`liniiNevalidate > 0 \\? "\\.\\.\\." : ${scapat}`),
        `${nume} arata \`${camp}\` fara sa-l ascunda pe un total incomplet`,
      );
    }
    /* Transportul are alta forma (poate fi „Gratuita"), deci se cere separat. */
    assert.match(s, /liniiNevalidate > 0 \? "\.\.\." : (pricing\.)?shipping === 0/,
      `${nume} arata transportul socotit pe un total incomplet`);
  }

  /*
   * Rezumatul de la finalizare trece toate sumele printr-un singur ajutor, `suma()`. Se cere ca
   * ajutorul sa existe SI sa fie chiar folosit: definit si ocolit, caseta ar fi aratat mai departe
   * numerele incomplete.
   */
  const rez = sursa(REZUMAT);
  assert.match(rez, /const nesigur = liniiNevalidate\.length > 0;/, "rezumatul nu mai stie ca o linie e nevalidata");
  assert.match(rez, /const suma = \(n: number\) => \(nesigur \? "\.\.\." : formatPrice\(n\)\);/,
    "rezumatul nu mai are un fel unic de a ascunde sumele");
  for (const camp of ["total", "vatAmount", "grandTotal"]) {
    assert.match(rez, new RegExp(`suma\\(${camp}\\)`), `rezumatul arata \`${camp}\` fara sa-l treaca prin ascundere`);
  }
  assert.match(rez, /nesigur \? "\.\.\." : shipping === 0/, "transportul se arata mai departe pe un total incomplet");
});

test("⚠ si INDICIILE care atarna de totalul incomplet tac", () => {
  /*
   * „Mai adauga 40 de lei pentru livrare gratuita" si „Comanda minima este X, mai adauga Y" se
   * socotesc din acelasi total. Lasate, omul ar fi pus in cos ceva de care n-avea nevoie ca sa
   * treaca un prag pe care il trecuse deja.
   */
  assert.match(sursa(SERTAR), /liniiNevalidate > 0 \? \(\s*<p[^>]*>Se verifica preturile/,
    "bara de progres catre livrarea gratuita arata mai departe un numar fals");
  for (const [nume, fisier] of [["piesele comune", PIESE], ["cosul compact", COMPACT], ["sertarul", SERTAR]] as const) {
    assert.match(sursa(fisier), /\{!liniiNevalidate &&[^}]*belowMinOrder/,
      `${nume} arata mai departe cat mai lipseste pana la comanda minima`);
  }
});
