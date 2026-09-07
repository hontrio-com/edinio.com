import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randurileInstantaneului } from "./comanda";

/**
 * ═══ ULTIMUL ECRAN AL VANZARII ARATA CE S-A CUMPARAT ═══
 *
 * „Comanda plasata" randa pe fiecare rand doar numele, cantitatea si pretul. Cine tocmai scrisese o
 * gravura, alesese un material si incarcase o poza vedea un rand identic cu al unui produs
 * obisnuit — si n-avea de unde sti daca alegerile lui au ajuns in comanda.
 *
 * Gasit de proprietarul platformei, incercand chiar drumul: a incarcat o imagine, a plasat comanda,
 * si pe ecranul final nu era nimic din ea.
 */

const sursa = (r: string) => readFileSync(path.resolve(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");
const CONFIRM = "src/app/(public)/[slug]/confirm/page.tsx";

test("⚠ fiecare fel de camp iese CITIBIL, asa cum l-a scris `caText` la salvare", () => {
  /*
   * ⚠ NU SE MAI SOCOTESTE NIMIC AICI. `caText` a scris deja valorile in forma omului la salvare:
   * dimensiunile ca „350 x 250 cm", optiunea cu ETICHETA ei, comutatorul „Da"/„Nu". A doua traducere
   * pe drum ar fi putut sa se departeze de ce vede comerciantul in panou si de ce scrie in email.
   */
  const randuri = randurileInstantaneului({
    a: { type: "text", label: "Gravura", value: "Robert" },
    b: { type: "dimensiuni", label: "Dimensiuni", value: "350 x 250 cm" },
    c: { type: "butoane", label: "Material", value: "Premium", optiuneId: "prm" },
    d: { type: "comutator", label: "Protectie", value: "Da" },
  });
  assert.deepEqual(randuri, [
    { eticheta: "Gravura", text: "Robert" },
    { eticheta: "Dimensiuni", text: "350 x 250 cm" },
    /* ⚠ ETICHETA, nu id-ul: „prm" n-ar fi spus nimic nici clientului, nici atelierului. */
    { eticheta: "Material", text: "Premium" },
    { eticheta: "Protectie", text: "Da" },
  ]);
});

test("⚠ fisierele se arata cu NUMELE lor, si niciun octet nu pleaca", () => {
  /*
   * ═══ ⚠ DE CE NU SE ARATA IMAGINEA ═══
   *
   * Fiindca NU SE POATE, si asta e purtarea corecta. Octetii se servesc numai prin
   * `/api/customization-file`, care cere sesiune de comerciant, proprietatea magazinului, si ca
   * cheia sa fie chiar pe comanda ceruta. Cumparatorul de pe ecranul de confirmare e anonim.
   *
   * O adresa publica pusa aici ar fi desfiintat exact ce s-a castigat cand incarcarile au trecut
   * in galeata privata. Ce-i lipseste omului nu e poza — o are pe telefon —, ci confirmarea ca a
   * ajuns.
   */
  const cheie = "products/customizations/6f99a1c9-e744-48b6-a112-6747403e7e19/"
    + "72bbb364-21ce-42eb-9c2a-9e4747d45db8-d64aba1222341f973da0e21f.jpg";
  const randuri = randurileInstantaneului({ p: { type: "image", label: "Poze", value: [cheie, cheie] } });

  assert.deepEqual(randuri, [{ eticheta: "Poze", text: "Fisierul 1.jpg, Fisierul 2.jpg" }]);

  /* ⚠ SI NICIO BUCATA DIN CHEIE nu iese pe ecran: ea pleaca mai departe in emailuri si in panou. */
  const tot = randuri.map((r) => r.text).join(" ");
  for (const bucata of ["products/customizations", "6f99a1c9", "72bbb364", "d64aba12"]) {
    assert.ok(!tot.includes(bucata), `„${bucata}" a ajuns pe ecranul cumparatorului`);
  }
});

test("⚠ chiar instantaneul comenzii #0009, cel care a scos defectul la iveala", () => {
  /*
   * Copiat din productie, nu inventat: e forma pe care a scris-o `verificaPersonalizarea` la
   * comanda de proba din 07.09.2026 — un camp de imagine cu eticheta „tEST".
   */
  assert.deepEqual(
    randurileInstantaneului({
      "c9f02d54-84d2-4040-a2fc-5790becddeeb": {
        type: "image",
        label: "tEST",
        value: ["products/customizations/6f99a1c9-e744-48b6-a112-6747403e7e19/"
          + "72bbb364-21ce-42eb-9c2a-9e4747d45db8-d64aba1222341f973da0e21f.jpg"],
      },
    }),
    [{ eticheta: "tEST", text: "Fisierul 1.jpg" }],
    "comanda care a scos defectul la iveala tot n-ar arata nimic",
  );
});

test("⚠ ce e GOL se sare, si formele stramte nu arunca", () => {
  /*
   * Un camp optional necompletat n-are ce cauta pe bonul omului. Iar ecranul citeste `items` din
   * randuri scrise de-a lungul anilor: o exceptie aici ar fi inlocuit „Comanda plasata" cu o pagina
   * de eroare — pe omul care tocmai platise.
   */
  assert.deepEqual(randurileInstantaneului({ a: { type: "text", label: "Gravura", value: "" } }), []);
  assert.deepEqual(randurileInstantaneului({ a: { type: "image", label: "Poze", value: [] } }), []);
  assert.deepEqual(randurileInstantaneului({ a: { type: "image", label: "Poze", value: ["", "  "] } }), []);

  for (const brut of [null, undefined, 42, "sir", [], {}, { a: null }, { a: 7 }, { a: [] },
    { a: { label: "X" } }, { a: { value: null } }, { a: { value: [null, 7] } }]) {
    assert.doesNotThrow(() => randurileInstantaneului(brut), `a aruncat pentru ${JSON.stringify(brut)}`);
    assert.ok(Array.isArray(randurileInstantaneului(brut)));
  }

  /* ⚠ Si o eticheta lipsa nu ascunde valoarea: omul vede macar CE a scris. */
  assert.deepEqual(
    randurileInstantaneului({ a: { type: "text", value: "Robert" } }),
    [{ eticheta: "", text: "Robert" }],
  );
});

test("⚠ ecranul de confirmare chiar le randeaza", () => {
  /*
   * ⚠ UN AJUTOR CHEMAT DE NIMENI E O REPARATIE CARE NU EXISTA — chiar tiparul prins in proiect la
   * `numeroteaza`, unde vitrina avea prop-ul si panoul nu-l oferea.
   */
  const v = sursa(CONFIRM);
  assert.match(v, /randurileInstantaneului\(item\.customization\)\.map\(/, "sumarul nu deseneaza personalizarea");
  assert.match(v, /\{item\.variant_title &&/, "sumarul nu deseneaza varianta");

  /*
   * ⚠ SI NU DESENEAZA NICIO IMAGINE. O miniatura pusa aici ar cere o adresa publica — adica fix ce
   * s-a desfiintat cand incarcarile au trecut in galeata privata. Se cere pe fata, ca nimeni sa n-o
   * adauge „ca sa arate mai bine".
   */
  const de = v.indexOf("Sumar comanda");
  const bruta = v.slice(de, v.indexOf("border-t border-[var(--st-border)] px-4 py-3 space-y-2", de));
  assert.ok(de > 0 && bruta.length > 0, "n-am gasit blocul de sumar");
  /*
   * ⚠ SE SCOT COMENTARIILE INAINTE DE CAUTARE, si nu e pedanterie: prima varianta a probei cadea
   * pe propriul meu comentariu din JSX, cel care EXPLICA de ce nu se serveste `customization-file`
   * acolo. O scanare de sursa nu deosebeste codul de ce e scris despre el — aceeasi capcana in care
   * proiectul a mai cazut de doua ori (`role="radiogroup"` numarat intr-un comentariu, si
   * „formularul" citit ca „formula").
   */
  const bloc = bruta.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "");
  assert.equal(/<Image|<img|customization-file/.test(bloc), false, "sumarul serveste octeti catre un anonim");
});
