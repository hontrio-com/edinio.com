import { strict as assert } from "node:assert";
import { test } from "node:test";
import { POLICY_LINKS, descrierePolitica } from "./policy-links";
import { TIPURI_POLITICI } from "./policy-index";
import { latimeEstimata, numeScurtMagazin } from "@/lib/storefront/catalog/descriere-generata";

/*
 * Descrierea paginilor de politici (reclamatia caian-textile.ro, 10.09.2026). Pana acum
 * lipsea, deci cele sase politici purtau in Google descrierea paginii principale.
 *
 * Aici e fraza. Cablarea (aceeasi in description, og si twitter, cu numele scurt) e
 * probata pe sursa, in `catalog/apelantii-descrierii.test.ts`: pagina e un `.tsx`, iar un
 * `.tsx` nu se poate importa in probe.
 */

const ASTEPTATE: Record<string, string> = {
  termeni: "Termenii și condițiile de utilizare ale magazinului online CAIAN TEXTILE.",
  livrare: "Politica de livrare a magazinului CAIAN TEXTILE: cum ajung comenzile la tine.",
  retur: "Politica de retur a magazinului CAIAN TEXTILE: condițiile și pașii pentru returnarea produselor.",
  confidentialitate: "Cum prelucrează CAIAN TEXTILE datele personale ale clienților.",
  gdpr: "Drepturile tale privind datele personale la CAIAN TEXTILE.",
  anulare: "Cum poți anula o comandă plasată la CAIAN TEXTILE.",
};

const GENERICA = (m: string) => `Politicile magazinului online ${m}.`;

test("fiecare tip are exact fraza din plan", () => {
  for (const [tip, text] of Object.entries(ASTEPTATE)) {
    assert.equal(descrierePolitica(tip, "CAIAN TEXTILE"), text);
  }
});

test("fiecare politica din subsol si din sitemap are fraza ei, nu pe cea generica", () => {
  /* Doua liste de tipuri, doua fisiere (`policy-links.ts` si `policy-index.ts`): o politica
     adaugata intr-una si uitata aici ar fi primit in Google fraza de rezerva. */
  for (const tip of [...POLICY_LINKS.map((p) => p.slug), ...TIPURI_POLITICI.map((p) => p.tip)]) {
    assert.notEqual(descrierePolitica(tip, "X"), GENERICA("X"), tip);
    assert.equal(descrierePolitica(tip, "CAIAN TEXTILE"), ASTEPTATE[tip], tip);
  }
});

test("sase texte diferite, fara emdash, care incap in Google si cu numele reale", () => {
  const nume = [
    "CAIAN TEXTILE",
    numeScurtMagazin("ULTIMUL MAGAZIN S.R.L."),
    numeScurtMagazin("BricoSmart - Solutii smart pentru casa si gradina"),
    numeScurtMagazin("eSAFE.ro - Echipamente protectia muncii"),
    numeScurtMagazin("Atelierul Larisei - cadouri unice"),
  ];
  for (const n of nume) {
    const texte = POLICY_LINKS.map((p) => descrierePolitica(p.slug, n));
    assert.equal(new Set(texte).size, POLICY_LINKS.length, `doua politici cu acelasi text la ${n}`);
    for (const t of texte) {
      assert.ok(!t.includes(String.fromCharCode(0x2014)), t);
      assert.ok(t.includes(n), t);
      assert.ok(latimeEstimata(t) <= 155, `${t} (${latimeEstimata(t)})`);
    }
  }
});

test("numele se ia cum vine de la apelant, cu spatiile comprimate", () => {
  assert.equal(descrierePolitica("gdpr", "  CAIAN   TEXTILE "), "Drepturile tale privind datele personale la CAIAN TEXTILE.");
});

test("tip necunoscut: fraza generica, niciodata sirul gol, nici ceva mostenit de la Object", () => {
  for (const tip of ["inventat", "", "constructor", "__proto__", "toString", "hasOwnProperty"]) {
    assert.equal(descrierePolitica(tip, "CAIAN TEXTILE"), GENERICA("CAIAN TEXTILE"), tip);
  }
});
