import test from "node:test";
import assert from "node:assert/strict";
import { harta, nodDupaId } from "./definitie";
import { aplicaRegulile, esteAscuns } from "./reguli";
import { normalizeazaValori } from "./valori";
import type { Definitie, Nod } from "./definitie";

/**
 * Harta nodurilor se tine minte, si raspunde acelasi lucru.
 *
 * ═══ ⚠ DE CE CONTEAZA ═══
 *
 * `esteAscuns` cere harta la fiecare apel, iar el se cheama de cateva ori pe fiecare nod, la
 * fiecare trecere a motorului de reguli, si inca o data pe fiecare camp la randare. Numarat pe un
 * configurator obisnuit: ~95 de reconstructii pe FIECARE TASTA apasata. Costul creste PATRATIC cu
 * numarul de noduri — la plafonul platformei ar fi sute de mii de inserari pe tasta, si campul de
 * gravura ar incepe sa se blocheze sub degete.
 *
 * ═══ ⚠ CE PAZESC PROBELE ═══
 *
 * Nu viteza — ea nu se poate masura de aici. Ci CORECTITUDINEA memorarii: ca aceeasi definitie da
 * acelasi raspuns, ca doua definitii diferite NU se amesteca, si ca o definitie noua (alta ciorna,
 * alta versiune) primeste harta ei. O memorare gresita ar fi mult mai rea decat lipsa ei: campuri
 * ascunse dupa structura ALTUI configurator.
 */

const def = (noduri: Nod[], idGrup = "g1"): Definitie =>
  ({ versiuneSchema: 1, mod: "auto", pasi: [{ id: "p1", eticheta: "Pas", grupuri: [{ id: idGrup, noduri }] }] });

const text = (id: string): Nod =>
  ({ fel: "text", control: "scurt", id, eticheta: id } as Nod);

test("aceeasi definitie da aceeasi harta, si a doua oara instantaneu", () => {
  const d = def([text("a"), text("b")]);
  const unu = harta(d);
  const doi = harta(d);
  assert.equal(unu, doi, "harta se reconstruieste la fiecare apel");
  assert.equal(unu.size, 2);
});

test("⚠ doua definitii DIFERITE nu se amesteca", () => {
  /*
   * ⚠ Asta e defectul pe care memorarea l-ar putea introduce, si e mai rau decat incetineala:
   * un camp ascuns dupa structura ALTUI configurator. Cheia e identitatea obiectului, deci nu se
   * poate intampla — dar se cere aici, fiindca o cheie gresita (numarul de noduri, un id) ar fi
   * parut la fel de rezonabila cand a fost scrisa.
   */
  const d1 = def([text("a")]);
  const d2 = def([text("b")]);
  assert.ok(harta(d1).has("a"));
  assert.ok(!harta(d1).has("b"));
  assert.ok(harta(d2).has("b"));
  assert.ok(!harta(d2).has("a"));
});

test("⚠ o definitie NOUA cu acelasi cuprins primeste harta ei", () => {
  /*
   * ⚠ Fiecare editare din panou creeaza un obiect nou (spread peste tot in `editare.ts`), deci
   * asta e cazul OBISNUIT, nu unul de margine. Doua obiecte egale ca valoare sunt chei diferite.
   */
  const d1 = def([text("a")]);
  const d2 = def([text("a")]);
  assert.notEqual(harta(d1), harta(d2), "obiecte diferite impart aceeasi harta");
  assert.equal(harta(d2).get("a")?.nod, d2.pasi[0].grupuri[0].noduri[0], "harta arata catre nodurile ALTEI definitii");
});

test("harta arata catre CHIAR obiectele definitiei date", () => {
  const d = def([text("a")]);
  const loc = harta(d).get("a");
  assert.equal(loc?.pas, d.pasi[0]);
  assert.equal(loc?.grup, d.pasi[0].grupuri[0]);
  assert.equal(loc?.nod, d.pasi[0].grupuri[0].noduri[0]);
});

/** O definitie cu DOUA grupuri: declansatorul in al doilea, ca sa nu se ascunda pe sine. */
function cuDouaGrupuri(): Definitie {
  return {
    versiuneSchema: 1, mod: "auto",
    pasi: [{
      id: "p1", eticheta: "Pas",
      grupuri: [
        { id: "g1", noduri: [text("grav")] },
        { id: "g2", noduri: [{ fel: "comutator", control: "comutator", id: "fara", eticheta: "Fara" } as Nod] },
      ],
    }],
  };
}

test("⚠ ascunderea prin GRUP merge mai departe, pe o harta memorata", () => {
  /*
   * ⚠ Perechea obligatorie: `esteAscuns` e singurul cititor important al hartii, si el urca la
   * grup si la pas. O memorare care ar pastra alt grup ar fi lasat campurile vizibile " iar ele ar
   * fi si platit, si intrat in comanda.
   */
  const d = cuDouaGrupuri();
  const reguli = [{
    id: "r", cand: { c: "pornit" as const, nod: "fara" },
    atunci: [{ a: "ascunde" as const, tinta: "g1" }],
  }];
  const stare = aplicaRegulile(d, reguli, normalizeazaValori({ fara: { f: "comutator", v: true } }));
  assert.equal(esteAscuns(d, stare, "grav"), true, "grupul ascuns nu mai ascunde campul din el");

  // Si a doua oara, pe harta deja memorata.
  assert.equal(esteAscuns(d, stare, "grav"), true);
});

test("⚠ o regula care isi ascunde PROPRIUL declansator se stinge singura, si ia valoarea cu ea", () => {
  /*
   * ⚠ GASIT SCRIIND PROBA DE DEASUPRA, unde pusesem din greseala declansatorul chiar in grupul
   * ascuns. Merita pastrat, fiindca e o capcana pe care comerciantul o poate intinde singur.
   *
   * Ce se intampla: bifa aprinde regula, regula ascunde grupul, grupul contine chiar bifa, deci
   * valoarea ei se goleste (`golesteAscunse`), deci regula nu se mai aprinde, deci grupul nu mai e
   * ascuns. Motorul se aseaza — NU oscileaza, deci `reguli_oscileaza` nu-l prinde — intr-o stare in
   * care nimic nu e ascuns SI bifa e goala.
   *
   * Pentru cumparator asta arata ca o bifa care se dezbifeaza singura. Nu vinde nimic gresit
   * (valoarea nu intra nici in pret, nici in comanda), dar e un camp care pare stricat.
   *
   * Se scrie aici ca purtare CUNOSCUTA, nu ca defect inghetat: cine o schimba vreodata va sti ce
   * schimba, si de ce arata asa.
   */
  const d: Definitie = {
    versiuneSchema: 1, mod: "auto",
    pasi: [{ id: "p1", eticheta: "Pas", grupuri: [{ id: "g1", noduri: [
      text("grav"),
      { fel: "comutator", control: "comutator", id: "fara", eticheta: "Fara" } as Nod,
    ] }] }],
  };
  const reguli = [{
    id: "r", cand: { c: "pornit" as const, nod: "fara" },
    atunci: [{ a: "ascunde" as const, tinta: "g1" }],
  }];
  const stare = aplicaRegulile(d, reguli, normalizeazaValori({ fara: { f: "comutator", v: true } }));

  assert.equal(stare.neasezat, false, "motorul chiar se aseaza; nu e o oscilatie");
  assert.deepEqual([...stare.ascunse], [], "nimic nu ramane ascuns");
  assert.deepEqual(stare.valori, {}, "iar bifa cumparatorului s-a golit");
});

test("`nodDupaId` ramane in acord cu harta", () => {
  const d = def([text("a"), text("b")]);
  assert.equal(nodDupaId(d, "b"), harta(d).get("b")?.nod);
});
