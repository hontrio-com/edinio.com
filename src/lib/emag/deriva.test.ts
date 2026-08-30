import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  citesteMemoriaDerivei,
  derivaOfertei,
  hotarasteDeriva,
  semnaturaDerivei,
  sursaAdevarului,
  REPARARI_MAXIM,
  type MemorieDeriva,
} from "./deriva";

/*
 * Probele derivei.
 *
 * Fiecare pazeste un rau pe care mecanismul asta l-ar putea FACE, nu unul pe care
 * l-ar preveni. O plasa de siguranta prost pusa e mai scumpa decat lipsa ei.
 */

const AMBELE_LA_NOI = { pret: "edinio", stoc: "edinio" } as const;
const ACUM = "2026-08-24T10:00:00.000Z";

/* ── Ce se numeste derivare ────────────────────────────────────────────────── */

test("eMAG deriva: rotunjirea lor la doi bani NU e o derivare", () => {
  /*
   * ═══ GRESEALA CARE AR FI ARS LIMITA DE CERERI ═══
   *
   * Noi trimitem patru zecimale, cat ingaduie ei. `product_offer/read` poate intoarce
   * doua. Comparate cu `!==`, `82,6364` si `82,64` ar fi fost o derivare la FIECARE
   * trecere, pentru FIECARE oferta din catalog — mii de reparari pe zi, niciuna cu
   * vreun efect, si cele 3 cereri pe secunda ale magazinului arse degeaba.
   */
  assert.deepEqual(derivaOfertei({ pret: 82.6364, stoc: 5 }, { pret: 82.64, stoc: 5 }), []);
  assert.deepEqual(derivaOfertei({ pret: 82.6364, stoc: 5 }, { pret: 82.63, stoc: 5 }), []);
});

test("eMAG deriva: o schimbare adevarata de pret se vede", () => {
  const d = derivaOfertei({ pret: 100, stoc: 5 }, { pret: 89.9, stoc: 5 });
  assert.deepEqual(d, [{ camp: "pret", laNoi: 100, laEi: 89.9 }]);
});

test("eMAG deriva: stocul se compara EXACT, un singur fir de diferenta conteaza", () => {
  assert.deepEqual(derivaOfertei({ pret: 10, stoc: 5 }, { pret: 10, stoc: 4 }),
    [{ camp: "stoc", laNoi: 5, laEi: 4 }]);
  assert.deepEqual(derivaOfertei({ pret: 10, stoc: 0 }, { pret: 10, stoc: 0 }), []);
});

test("eMAG deriva: un camp pe care EI nu l-au trimis nu e o derivare de la zero", () => {
  /*
   * ⚠ `product_offer/read` nu intoarce intotdeauna tot. Lipsa luata drept zero, fiecare
   * oferta ar fi aratat „pretul lor e 0" — si am fi rescris catalogul intreg pornind
   * de la o citire incompleta, cu convingerea ca reparam ceva.
   */
  assert.deepEqual(derivaOfertei({ pret: 100, stoc: 5 }, { pret: null, stoc: null }), []);
  assert.deepEqual(derivaOfertei({ pret: 100, stoc: 5 }, { pret: null, stoc: 5 }), []);
  assert.deepEqual(derivaOfertei({ pret: 100, stoc: 5 }, { pret: 100, stoc: null }), []);
});

/* ── Cele doua vederi ──────────────────────────────────────────────────────── */

test("eMAG deriva: PRIMA vedere nu repara nimic", () => {
  /*
   * ═══ CEL MAI SCUMP RAU POSIBIL AICI, SI E FACUT DE NOI ═══
   *
   * O comanda intrata pe eMAG le scade stocul in aceeasi secunda; la noi scade la
   * urmatoarea trecere a cronului. In minutul ala, stocul nostru e legitim mai mare
   * decat al lor si arata exact ca o derivare.
   *
   * Reparata din prima, am fi trimis inapoi stocul dinaintea vanzarii: eMAG ar fi pus
   * la vanzare bucati deja vandute, iar al doilea cumparator ar fi primit o anulare.
   */
  const d = derivaOfertei({ pret: 100, stoc: 5 }, { pret: 100, stoc: 4 });
  const h = hotarasteDeriva(d, null, AMBELE_LA_NOI, ACUM);
  assert.deepEqual(h.deReparat, [], "prima vedere: nimic de trimis");
  assert.equal(h.memorie?.vazutaDe, 1);
  assert.equal(h.memorie?.reparari, 0);
});

test("eMAG deriva: a doua vedere cu ACELEASI valori repara", () => {
  const d = derivaOfertei({ pret: 100, stoc: 5 }, { pret: 100, stoc: 4 });
  const intai = hotarasteDeriva(d, null, AMBELE_LA_NOI, ACUM);
  const apoi = hotarasteDeriva(d, intai.memorie, AMBELE_LA_NOI, ACUM);
  assert.deepEqual(apoi.deReparat, ["stoc"]);
  assert.equal(apoi.memorie?.vazutaDe, 2);
  assert.equal(apoi.memorie?.reparari, 1);
});

test("eMAG deriva: o vanzare ingerata intre treceri STINGE numaratoarea", () => {
  /* Chiar drumul obisnuit: la a doua trecere stocul nostru a scazut si el, deci nu mai
     e nicio diferenta. Memoria se sterge cu totul. */
  const intai = hotarasteDeriva(
    derivaOfertei({ pret: 100, stoc: 5 }, { pret: 100, stoc: 4 }), null, AMBELE_LA_NOI, ACUM);
  const apoi = hotarasteDeriva(
    derivaOfertei({ pret: 100, stoc: 4 }, { pret: 100, stoc: 4 }), intai.memorie, AMBELE_LA_NOI, ACUM);
  assert.equal(apoi.memorie, null, "fara diferenta, memoria se sterge");
  assert.deepEqual(apoi.deReparat, []);
});

test("eMAG deriva: valori care se PLIMBA nu ajung niciodata la reparare", () => {
  /*
   * ⚠ O campanie de-a lor care se aprinde si se stinge muta pretul intre doua valori.
   * Cu o amprenta pe camp, asta ar fi aratat ca o singura derivare vazuta de zeci de
   * ori, si ar fi trecut proba din prima. Cu valorile in amprenta, fiecare miscare
   * reincepe numaratoarea — ceea ce e chiar adevarul: nu e o stare, e o oscilatie.
   */
  let m: MemorieDeriva | null = null;
  for (let i = 0; i < 6; i++) {
    const laEi = i % 2 === 0 ? 89.9 : 79.9;
    const h = hotarasteDeriva(
      derivaOfertei({ pret: 100, stoc: 5 }, { pret: laEi, stoc: 5 }), m, AMBELE_LA_NOI, ACUM);
    assert.deepEqual(h.deReparat, [], `trecerea ${i}: nu se repara o oscilatie`);
    assert.equal(h.memorie?.vazutaDe, 1);
    m = h.memorie;
  }
});

/* ── Renuntarea ────────────────────────────────────────────────────────────── */

test("eMAG deriva: o derivare care NU se lasa reparata se opreste, dar ramane scrisa", () => {
  /*
   * eMAG poate refuza mereu pretul: in afara benzii min/max, oferta blocata, categorie
   * inchisa. O reparare pornita la fiecare trecere ar fi o bucla fara sfarsit — ar arde
   * cele 3 cereri pe secunda la nesfarsit si n-ar ajunge nicaieri.
   */
  const d = derivaOfertei({ pret: 100, stoc: 5 }, { pret: 89.9, stoc: 5 });
  let m: MemorieDeriva | null = null;
  let reparari = 0;

  for (let i = 0; i < 12; i++) {
    const h = hotarasteDeriva(d, m, AMBELE_LA_NOI, ACUM);
    if (h.deReparat.length) reparari++;
    m = h.memorie;
    if (i === 11) {
      assert.equal(h.renuntat, true, "la sfarsit s-a renuntat la trimis");
      assert.deepEqual(h.memorie?.campuri, d, "⚠ dar diferenta RAMANE scrisa, pentru panou");
    }
  }
  assert.equal(reparari, REPARARI_MAXIM, "exact atatea incercari, apoi tacere la trimis");
});

test("eMAG deriva: renuntarea se scrie in jurnal EXACT o data", () => {
  /*
   * ═══ O PAZA CARE PAREA SCRISA SI NU ERA ═══
   *
   * Prima forma se uita la `reparari` ca sa afle daca e prima trecere de dupa
   * renuntare. Dar dupa renuntare `reparari` ramane blocat pe maxim la FIECARE
   * trecere — deci conditia iesea fie mereu adevarata, fie niciodata.
   *
   * Cu „niciodata" (forma pe care o scrisesem), tocmai ofertele care nu se lasa
   * reparate ar fi fost cele mai tacute din tot sistemul: fara cereri catre eMAG si
   * fara niciun rand in jurnal.
   */
  const d = derivaOfertei({ pret: 100, stoc: 5 }, { pret: 89.9, stoc: 5 });
  let m: MemorieDeriva | null = null;
  let scrieri = 0;

  for (let i = 0; i < 20; i++) {
    const h = hotarasteDeriva(d, m, AMBELE_LA_NOI, ACUM);
    if (h.deScrisInJurnal) scrieri++;
    m = h.memorie;
  }
  assert.equal(scrieri, 1, "un singur rand in jurnal, nu douazeci");
  assert.equal(typeof m?.renuntatLa, "string", "si ramane insemnat cand s-a renuntat");
});

test("eMAG deriva: o derivare NOUA se incearca din nou, chiar dupa o renuntare", () => {
  /*
   * ⚠ Renuntarea NU se mosteneste peste valori schimbate. Mostenita, o oferta care
   * a esuat o data n-ar mai fi fost incercata niciodata — nici la urmatoarea
   * schimbare de pret facuta de comerciant, nici peste un an.
   */
  const veche = derivaOfertei({ pret: 100, stoc: 5 }, { pret: 89.9, stoc: 5 });
  let m: MemorieDeriva | null = null;
  for (let i = 0; i < 12; i++) m = hotarasteDeriva(veche, m, AMBELE_LA_NOI, ACUM).memorie;
  assert.equal(typeof m?.renuntatLa, "string", "s-a renuntat la cea veche");

  const noua = derivaOfertei({ pret: 120, stoc: 5 }, { pret: 89.9, stoc: 5 });
  const intai = hotarasteDeriva(noua, m, AMBELE_LA_NOI, ACUM);
  assert.equal(intai.memorie?.renuntatLa, undefined, "alte valori: renuntarea se sterge");
  assert.equal(intai.memorie?.reparari, 0, "si numaratoarea o ia de la capat");
  const apoi = hotarasteDeriva(noua, intai.memorie, AMBELE_LA_NOI, ACUM);
  assert.deepEqual(apoi.deReparat, ["pret"], "se incearca din nou");
});

/* ── Sursa adevarului (§69) ────────────────────────────────────────────────── */

test("eMAG deriva: sursa se intreaba PE CAMP, nu pe magazin", () => {
  /*
   * ⚠ Aproape orice comerciant vrea ca Edinio sa tina STOCUL — asta e tot rostul
   * integrarii: un singur inventar. Dar multi isi tin PRETUL in panoul eMAG, din
   * campanii.
   *
   * Un singur comutator pentru amandoua l-ar fi pus sa aleaga intre a-si pierde
   * campaniile la fiecare sfert de ora si a-si vinde marfa de doua ori.
   */
  const d = derivaOfertei({ pret: 100, stoc: 5 }, { pret: 89.9, stoc: 4 });
  assert.equal(d.length, 2);

  const surse = { pret: "emag", stoc: "edinio" } as const;
  const intai = hotarasteDeriva(d, null, surse, ACUM);
  const apoi = hotarasteDeriva(d, intai.memorie, surse, ACUM);
  assert.deepEqual(apoi.deReparat, ["stoc"], "stocul se repara, pretul lor se lasa in pace");
});

test("eMAG deriva: cand nimic nu e al nostru, se ARATA fara sa se trimita", () => {
  const d = derivaOfertei({ pret: 100, stoc: 5 }, { pret: 89.9, stoc: 4 });
  const surse = { pret: "emag", stoc: "emag" } as const;
  const intai = hotarasteDeriva(d, null, surse, ACUM);
  const apoi = hotarasteDeriva(d, intai.memorie, surse, ACUM);
  assert.deepEqual(apoi.deReparat, []);
  assert.equal(apoi.memorie?.reparari, 0, "⚠ nu se numara ca incercare ce nu s-a incercat");
  assert.deepEqual(apoi.memorie?.campuri, d, "dar se vede in panou");
});

test("eMAG deriva: implicitul e «edinio», nu «emag»", () => {
  /* Un magazin care n-a atins setarea a legat eMAG tocmai ca sa tina totul dintr-un
     singur loc. Implicitul „emag" ar fi stins plasa fara ca nimeni s-o ceara. */
  assert.equal(sursaAdevarului(undefined), "edinio");
  assert.equal(sursaAdevarului(null), "edinio");
  assert.equal(sursaAdevarului("altceva"), "edinio");
  assert.equal(sursaAdevarului("emag"), "emag");
});

/* ── Amprenta si citirea ei ────────────────────────────────────────────────── */

test("eMAG deriva: amprenta nu depinde de ordinea campurilor", () => {
  const a = semnaturaDerivei([
    { camp: "pret", laNoi: 100, laEi: 89.9 },
    { camp: "stoc", laNoi: 5, laEi: 4 },
  ]);
  const b = semnaturaDerivei([
    { camp: "stoc", laNoi: 5, laEi: 4 },
    { camp: "pret", laNoi: 100, laEi: 89.9 },
  ]);
  assert.equal(a, b);
});

test("eMAG deriva: amprenta pretului e in bani intregi", () => {
  /* Altfel zecimalele lor ar fi schimbat amprenta la fiecare trecere si numaratoarea
     n-ar fi ajuns niciodata la doi. */
  assert.equal(
    semnaturaDerivei([{ camp: "pret", laNoi: 82.6364, laEi: 89.9 }]),
    semnaturaDerivei([{ camp: "pret", laNoi: 82.64, laEi: 89.9004 }]),
  );
});

test("eMAG deriva: o memorie de forma necunoscuta se ia de la capat, nu se ghiceste", () => {
  /* ⚠ Citita gresit ca memorie valida, numaratoarea ar fi pornit de la un numar
     inventat si repararea s-ar fi facut din prima — chiar raul de care ne ferim. */
  assert.equal(citesteMemoriaDerivei(null), null);
  assert.equal(citesteMemoriaDerivei({}), null);
  assert.equal(citesteMemoriaDerivei([]), null);
  assert.equal(citesteMemoriaDerivei({ semnatura: "x" }), null);
  assert.equal(citesteMemoriaDerivei({ semnatura: "x", vazutaDe: 2, campuri: [] }), null);
  assert.equal(citesteMemoriaDerivei({ semnatura: "x", vazutaDe: 2, campuri: [{ camp: "culoare" }] }), null);
});

test("eMAG deriva: o memorie buna se citeste intreaga", () => {
  const m = citesteMemoriaDerivei({
    semnatura: "pret:10000:8990", vazutaDe: 3, reparari: 1,
    prima: ACUM, ultima: ACUM,
    campuri: [{ camp: "pret", laNoi: 100, laEi: 89.9 }],
  });
  assert.equal(m?.vazutaDe, 3);
  assert.equal(m?.reparari, 1);
  assert.deepEqual(m?.campuri, [{ camp: "pret", laNoi: 100, laEi: 89.9 }]);
});
