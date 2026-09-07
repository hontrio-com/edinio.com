import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeazaDefinitia } from "./definitie";
import { pretulPersonalizarii } from "./pret";
import { normalizeazaValorile } from "./valori";

/**
 * RADIO SI CHECKBOX — ca STIL de afisare, nu ca tipuri noi.
 *
 * ═══ ⚠ DE CE NU DOUA TIPURI ═══
 *
 * Specificatia cerea si `radio`, si `checkbox`. Dar `radio` e vizual acelasi lucru cu `butoane` (o
 * alegere din mai multe), iar `checkbox` acelasi lucru cu `comutator` (pornit / stins).
 *
 * Tipuri noi ar fi insemnat inca doua ramuri in FIECARE loc care se uita la `type`: pretuirea,
 * validarea de salvare, greutatea maxima, poarta comenzii, rezumatul din cos, instantaneul,
 * emailul, panoul. Opt locuri care trebuie tinute in sincron pentru o deosebire care e numai de
 * desen — si fiecare o cale pe care un tip nou e uitat si cade tacut pe `default`.
 *
 * Probele de aici cer exact asta: ca desenul sa se schimbe, si NIMIC altceva.
 */

const sursa = (r: string) => readFileSync(path.resolve(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");

const cuStil = (stil?: string) => ({
  enabled: true,
  fields: [
    { id: "mat", type: "butoane", label: "Material", required: true, ...(stil ? { stil } : {}),
      optiuni: [{ id: "prm", eticheta: "Premium", impact: { fel: "fix", suma: 30 } }] },
    { id: "prot", type: "comutator", label: "Protectie", required: false,
      ...(stil === "bifa" ? { stil } : {}), impact: { fel: "fix", suma: 15 } },
  ],
});

test("⚠ stilul se citeste, dar numai unde are inteles", () => {
  const d = normalizeazaDefinitia(cuStil("radio"))!;
  assert.equal(d.fields[0].stil, "radio", "stilul nu s-a citit");

  /*
   * ⚠ SI FIECARE CAMP IL PASTREAZA PE AL LUI. Prima varianta a probei cerea doar ca stilul „sa se
   * citeasca", si trecea verde peste un mutant care punea `radio` pe TOATE campurile — inclusiv pe
   * comutator, unde n-are niciun inteles. Se cere pe amandoua tipurile deodata.
   */
  const amandoua = normalizeazaDefinitia(cuStil("bifa"))!;
  assert.equal(amandoua.fields[1].stil, "bifa", "comutatorul nu si-a pastrat casuta de bifat");

  /*
   * ⚠ UN STIL NEPOTRIVIT SE ARUNCA. `bifa` pe `butoane` ar fi desenat un comutator peste o lista
   * de optiuni; `radio` pe un camp de text n-ar insemna nimic. Campul cade pe desenul lui
   * obisnuit, care merge intotdeauna.
   */
  const gresit = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "b", type: "butoane", label: "B", required: true, stil: "bifa",
        optiuni: [{ id: "o", eticheta: "O" }] },
      { id: "t", type: "text", label: "T", required: false, stil: "radio" },
    ],
  })!;
  assert.equal(gresit.fields[0].stil, undefined, "`bifa` a trecut pe un camp cu optiuni");
  assert.equal(gresit.fields[1].stil, undefined, "un stil a trecut pe un camp de text");
});

test("⚠ stilul NU schimba pretul — asta e tot rostul reparatiei", () => {
  /*
   * ⚠ AFIRMATIA CARE APARA HOTARAREA. Daca desenul ar putea muta un ban, atunci `radio` chiar ar fi
   * fost un tip aparte si ar fi trebuit dus in toate cele opt locuri.
   */
  const valori = { mat: "prm", prot: true };
  const sume = ["butoane", "radio"].map((stil) => {
    const d = normalizeazaDefinitia(cuStil(stil))!;
    return pretulPersonalizarii(d, normalizeazaValorile(d, valori).valori).supliment;
  });
  assert.equal(sume[0], 45, "suplimentul de baza s-a schimbat");
  assert.equal(sume[0], sume[1], "desenul a mutat pretul");
});

test("⚠ produsele deja configurate nu se schimba cu nimic", () => {
  /*
   * ⚠ PERECHEA CARE APARA CELE 71 DE PRODUSE VII. Niciunul n-are `stil`, deci toate trebuie sa
   * ramana exact pe desenul de pana acum. Un implicit gresit ar fi schimbat peste noapte cum arata
   * fiecare fototapet din platforma.
   */
  const d = normalizeazaDefinitia(cuStil())!;
  assert.equal(d.fields[0].stil, undefined);
  assert.equal(d.fields[1].stil, undefined);
});

test("⚠ amandoua desenele exista in vitrina, si spun acelasi lucru cititorului de ecran", () => {
  /*
   * ⚠ SEMANTICA RAMANE ACEEASI: `radiogroup` + `radio` la amandoua desenele de alegere, fiindca si
   * intelesul e acelasi. Un desen care arata altfel dar se anunta altfel ar fi fost doua lucruri,
   * nu unul.
   */
  const v = sursa("src/components/storefront/sections/product/_shared/CampuriPersonalizare.tsx");
  assert.ok(v.includes('camp.stil === "radio"'), "vitrina nu deseneaza lista cu bulina");
  assert.ok(v.includes('camp.stil === "bifa"'), "vitrina nu deseneaza casuta de bifat");
  assert.ok(v.includes('role="checkbox"'), "casuta nu se anunta ca bifa");
  /*
   * ⚠ SE NUMARA ATRIBUTUL, NU CUVANTUL. Prima varianta cauta `role="radiogroup"` in tot fisierul si
   * gasea TREI: doua elemente si un COMENTARIU care il citeaza. O scanare de sursa nu deosebeste
   * codul de ce e scris despre el — aceeasi capcana in care proiectul a mai cazut o data.
   */
  assert.equal(
    (v.match(/<div role="radiogroup"/g) ?? []).length, 2,
    "cele doua desene de alegere nu se anunta la fel cititorului de ecran",
  );
});

test("⚠ panoul lasa comerciantul sa aleaga desenul", () => {
  /*
   * Un desen pe care il suporta vitrina dar nu-l poate alege nimeni e o capabilitate care nu
   * exista — chiar tiparul pe care proiectul l-a mai prins o data, la numerotarea campurilor.
   */
  const panou = sursa("src/components/dashboard/PersonalizareCampuri.tsx");
  assert.ok(panou.includes("Lista cu bulina"), "panoul nu ofera desenul de lista");
  assert.ok(panou.includes("Casuta de bifat"), "panoul nu ofera casuta de bifat");
  assert.ok(panou.includes("Cum se afiseaza"), "reglajul n-are nume in panou");
});
