import { strict as assert } from "node:assert";
import { test } from "node:test";
import { eProaspata, pastreazaVechea, PRAG, PRAG_TRUNCHIAT } from "./memorie";

/*
 * Probele memoriei nomenclatoarelor.
 *
 * Deciziile sunt pure tocmai ca sa poata fi probate fara baza si fara eMAG: fiecare
 * dintre ele hotaraste daca ecranul arata raftul adevarat sau unul vechi, iar
 * greselile de aici nu dau nicio eroare — dau sugestii gresite cu incredere mare.
 */

/* ── Prospetimea ───────────────────────────────────────────────────────────── */

test("eMAG memorie: o lista INCOMPLETA imbatraneste mult mai repede", () => {
  /*
   * ═══ REGULA CARE FACE MEMORIA SIGURA ═══
   *
   * O lista veche dar intreaga nu strica nimic: sugestiile se ARATA, nu se aplica, iar
   * la salvare se cere oricum categoria proaspata de la ei.
   *
   * O lista TRUNCHIATA e altceva: potrivirea nu vede jumatate din raft si sugereaza
   * categoria gresita cu incredere mare. Tinuta minte o saptamana, ar fi mintit o
   * saptamana — iar comerciantul n-are de unde sti ca lipseste ceva.
   */
  const acum = 1_000_000_000_000;
  const acumUnaJumateDeZi = acum - 12 * 60 * 60 * 1000;

  assert.equal(eProaspata(acumUnaJumateDeZi, false, "categorii", acum), true,
    "lista intreaga de acum 12 ore e inca buna");
  assert.equal(eProaspata(acumUnaJumateDeZi, true, "categorii", acum), false,
    "aceeasi vechime, dar trunchiata, NU mai e");
  assert.ok(PRAG_TRUNCHIAT < PRAG.categorii);
});

test("eMAG memorie: detaliul unei categorii sta mai putin decat raftul", () => {
  /* Din el ies caracteristicile obligatorii; o cerinta noua neluata in seama se
     plateste in oferte respinse, nu intr-o sugestie mai slaba. */
  assert.ok(PRAG.categorie < PRAG.categorii);
});

test("eMAG memorie: o data necitibila nu trece drept proaspata", () => {
  assert.equal(eProaspata(Number.NaN, false, "categorii"), false);
});

test("eMAG memorie: exact la prag nu mai e proaspata", () => {
  const acum = 1_000_000_000_000;
  assert.equal(eProaspata(acum - PRAG.tva, false, "tva", acum), false);
  assert.equal(eProaspata(acum - PRAG.tva + 1, false, "tva", acum), true);
});

/* ── Ce se scrie si ce nu ──────────────────────────────────────────────────── */

test("eMAG memorie: o citire CAZUTA nu sterge raftul", () => {
  /*
   * Scrisa peste, ar fi golit lista si ecranul ar fi aratat „nicio categorie" — iar
   * comerciantul ar fi crezut ca nu are acces nicaieri.
   */
  assert.equal(
    pastreazaVechea({ cate: 6000, trunchiat: false }, { cate: 0, trunchiat: false, eroare: "429" }),
    true,
  );
  assert.equal(
    pastreazaVechea(null, { cate: 0, trunchiat: false, eroare: "retea" }),
    true,
    "nici macar cand n-avem nimic: o eroare nu e o lista goala",
  );
});

test("eMAG memorie: zero randuri dintr-o citire REUSITA nu sterge o lista care exista", () => {
  /* Aproape sigur inseamna altceva decat „nu mai ai categorii": un filtru schimbat la
     ei, o forma noua de raspuns. */
  assert.equal(
    pastreazaVechea({ cate: 6000, trunchiat: false }, { cate: 0, trunchiat: false, eroare: null }),
    true,
  );
});

test("eMAG memorie: o lista proaspata dar CIUNTITA nu inlocuieste una veche si intreaga", () => {
  /*
   * Mai bine cautam in tot raftul de saptamana trecuta decat in jumatatea de azi:
   * sugestiile se cauta in ea, si o lista din care lipseste jumatate sugereaza
   * categoria gresita cu incredere mare.
   */
  assert.equal(
    pastreazaVechea({ cate: 6000, trunchiat: false }, { cate: 3000, trunchiat: true, eroare: null }),
    true,
  );
});

test("eMAG memorie: o lista trunchiata dar MAI MARE se scrie totusi", () => {
  /* A crescut ce stim. Refuzata, memoria n-ar mai fi progresat niciodata pe un cont
     al carui raft nu incape in cele 60 de pagini. */
  assert.equal(
    pastreazaVechea({ cate: 3000, trunchiat: true }, { cate: 5000, trunchiat: true, eroare: null }),
    false,
  );
});

test("eMAG memorie: o lista INTREAGA inlocuieste mereu una trunchiata", () => {
  assert.equal(
    pastreazaVechea({ cate: 6000, trunchiat: true }, { cate: 4000, trunchiat: false, eroare: null }),
    false,
  );
});

test("eMAG memorie: prima aducere se scrie oricum", () => {
  assert.equal(pastreazaVechea(null, { cate: 10, trunchiat: false, eroare: null }), false);
  assert.equal(pastreazaVechea(null, { cate: 0, trunchiat: false, eroare: null }), false,
    "chiar si goala: e primul raspuns pe care il avem de la ei");
});
