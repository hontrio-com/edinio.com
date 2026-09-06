import test from "node:test";
import assert from "node:assert/strict";
import { normalizeazaDefinitia, type DefinitiePersonalizare } from "./definitie";
import { normalizeazaValorile } from "./valori";
import { pretUnitar, pretulPersonalizarii } from "./pret";

/**
 * Pretul unei personalizari.
 *
 * ⚠ Probele astea sunt POARTA DE BANI a functiei. Ce trece pe aici ajunge pe factura clientului,
 * deci fiecare cifra e scrisa pe fata, nu dedusa dintr-o alta functie a proiectului.
 */

/** Fototapetul din exemplul de acceptanta, exact cum l-ar configura un comerciant. */
function fototapet(): DefinitiePersonalizare {
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [
      {
        id: "dim", type: "dimensiuni", label: "Dimensiunile peretelui", required: true,
        unitate: "cm",
        latime: { min: 100, max: 500 },
        inaltime: { min: 70, max: 350 },
      },
      {
        id: "mat", type: "butoane", label: "Material", required: true,
        optiuni: [
          { id: "std", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
          { id: "prm", eticheta: "Premium", impact: { fel: "pe_m2", suma: 89 } },
        ],
      },
      {
        id: "prot", type: "comutator", label: "Protectie impermeabila", required: false,
        impact: { fel: "pe_m2", suma: 15 },
      },
    ],
    pret: {
      fel: "suprafata",
      campDimensiuni: "dim",
      tarif: 69,
      campTarif: "mat",
      includePretulProdusului: false,
    },
  });
  assert.ok(d, "definitia de proba nu s-a citit");
  return d;
}

function socoteste(d: DefinitiePersonalizare, brut: unknown) {
  const v = normalizeazaValorile(d, brut);
  return { v, p: pretulPersonalizarii(d, v.valori) };
}

test("ACCEPTANTA: 350x250 cm, Premium, cu protectie = 910 lei", () => {
  /*
   * 350 x 250 cm = 3,5 x 2,5 m = 8,75 m².
   *   8,75 x 89 = 778,75   (materialul, care DA tariful)
   *   8,75 x 15 = 131,25   (protectia, supliment pe m²)
   *               ───────
   *                910,00
   */
  const d = fototapet();
  const { v, p } = socoteste(d, {
    dim: { latime: 350, inaltime: 250 },
    mat: "prm",
    prot: true,
  });
  assert.equal(v.ok, true, `constatari: ${JSON.stringify(v.constatari)}`);
  assert.equal(p.aria, 8.75);
  assert.equal(p.ariaFacturata, 8.75);
  assert.equal(p.tarifM2, 89);
  assert.equal(p.supliment, 910);
  assert.equal(p.bazaInclusa, false);
  /* ⚠ Pretul de catalog NU se incaseaza: 89 de lei de baza nu se adauga la cele 910. */
  assert.equal(pretUnitar(p, 89), 910);
});

test("⚠ optiunea de tarif INLOCUIESTE tariful, nu se adauga peste el", () => {
  /*
   * Mutantul: `tarifM2 = mod.tarif + imp.suma`. Atunci Premium ar fi iesit 69+89 = 158 lei/m², iar
   * fototapetul de 8,75 m² ar fi costat 1382,50 in loc de 778,75 — de aproape doua ori.
   */
  const d = fototapet();
  const { p } = socoteste(d, { dim: { latime: 100, inaltime: 100 }, mat: "prm", prot: false });
  assert.equal(p.aria, 1);
  assert.equal(p.tarifM2, 89, "tariful nu mai vine de pe optiunea aleasa");
  assert.equal(p.supliment, 89, "materialul s-a socotit de doua ori");
});

test("⚠ Standard da alt pret decat Premium, pe aceeasi suprafata", () => {
  const d = fototapet();
  const std = socoteste(d, { dim: { latime: 200, inaltime: 100 }, mat: "std", prot: false }).p;
  const prm = socoteste(d, { dim: { latime: 200, inaltime: 100 }, mat: "prm", prot: false }).p;
  assert.equal(std.supliment, 138); /* 2 m² x 69 */
  assert.equal(prm.supliment, 178); /* 2 m² x 89 */
});

test("⚠ comutatorul STINS nu costa nimic", () => {
  /*
   * Mutantul: se scoate verificarea `!v.pornit` din `impactulAles`. Atunci protectia s-ar fi
   * platit si cand clientul raspunde „nu" — suma ar creste la o alegere pe care tocmai a refuzat-o.
   */
  const d = fototapet();
  const cu = socoteste(d, { dim: { latime: 100, inaltime: 100 }, mat: "std", prot: true }).p;
  const fara = socoteste(d, { dim: { latime: 100, inaltime: 100 }, mat: "std", prot: false }).p;
  assert.equal(cu.supliment, 84); /* 69 + 15 */
  assert.equal(fara.supliment, 69);
});

test("⚠ suprafata minima facturabila urca pretul, si se vede in rezultat", () => {
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "d", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
      latime: { min: 10, max: 500 }, inaltime: { min: 10, max: 500 } }],
    pret: { fel: "suprafata", campDimensiuni: "d", tarif: 100, includePretulProdusului: false, minimM2: 1 },
  })!;
  /* 70 x 100 cm = 0,7 m², dar se factureaza 1 m². */
  const { p } = socoteste(d, { d: { latime: 70, inaltime: 100 } });
  assert.equal(p.aria, 0.7);
  assert.equal(p.ariaFacturata, 1);
  assert.equal(p.supliment, 100);
});

test("⚠ rotunjirea in SUS nu lasa deriva de virgula mobila", () => {
  /*
   * `Math.ceil(8.75 / 0.1) * 0.1` da 8.799999999999999 in JavaScript, si numarul ala ar fi ajuns
   * pe factura. Se socoteste in sutimi, pe intregi.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "d", type: "dimensiuni", label: "D", required: true, unitate: "cm",
      latime: { min: 1, max: 1000 }, inaltime: { min: 1, max: 1000 } }],
    pret: { fel: "suprafata", campDimensiuni: "d", tarif: 10, includePretulProdusului: false, rotunjire: 0.1 },
  })!;
  const { p } = socoteste(d, { d: { latime: 350, inaltime: 250 } });
  assert.equal(p.aria, 8.75);
  assert.equal(p.ariaFacturata, 8.8, `a iesit ${p.ariaFacturata}`);
  assert.equal(p.supliment, 88);
});

test("⚠ o suprafata care CADE fix pe treapta nu se mai urca", () => {
  /*
   * Perechea probei de deasupra: fara scaderea lui EPSILON inainte de `ceil`, o arie care ar
   * trebui sa fie exact 8,75 poate fi 8.750000000000002, iar rotunjirea la 0,5 ar fi urcat-o la
   * 9 — clientul ar fi platit un sfert de metru patrat pentru o eroare de calcul.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "d", type: "dimensiuni", label: "D", required: true, unitate: "cm",
      latime: { min: 1, max: 1000 }, inaltime: { min: 1, max: 1000 } }],
    pret: { fel: "suprafata", campDimensiuni: "d", tarif: 10, includePretulProdusului: false, rotunjire: 0.5 },
  })!;
  const { p } = socoteste(d, { d: { latime: 350, inaltime: 250 } });
  assert.equal(p.ariaFacturata, 9);
  const exact = socoteste(d, { d: { latime: 300, inaltime: 250 } }).p; /* 7,5 m², chiar pe treapta */
  assert.equal(exact.aria, 7.5);
  assert.equal(exact.ariaFacturata, 7.5, "o arie exact pe treapta s-a urcat degeaba");
});

test("⚠ baza INCLUSA se aduna, baza STINSA nu", () => {
  const stins = fototapet();
  const { p: pStins } = socoteste(stins, { dim: { latime: 100, inaltime: 100 }, mat: "std", prot: false });
  assert.equal(pretUnitar(pStins, 89), 69, "pretul de catalog s-a incasat desi baza e stinsa");

  const pornit = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "dim", type: "dimensiuni", label: "D", required: true, unitate: "cm",
        latime: { min: 10, max: 500 }, inaltime: { min: 10, max: 500 } },
    ],
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 69, includePretulProdusului: true },
  })!;
  const { p: pPornit } = socoteste(pornit, { dim: { latime: 100, inaltime: 100 } });
  assert.equal(pretUnitar(pPornit, 89), 158, "89 + 69");
});

test("⚠ modul ADAUGAT: sume fixe peste pretul de catalog", () => {
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "grav", type: "text", label: "Gravura", required: false, impact: { fel: "fix", suma: 20 } },
      { id: "cutie", type: "comutator", label: "Cutie cadou", required: false, impact: { fel: "fix", suma: 15 } },
    ],
  })!;
  const { p } = socoteste(d, { grav: "Robert", cutie: true });
  assert.equal(p.bazaInclusa, true);
  assert.equal(p.supliment, 35);
  assert.equal(pretUnitar(p, 89), 124);
  /* Campul necompletat nu costa. */
  const gol = socoteste(d, { grav: "", cutie: false }).p;
  assert.equal(gol.supliment, 0);
  assert.equal(pretUnitar(gol, 89), 89);
});

test("⚠ un supliment pe m² fara camp de dimensiuni se SARE, nu se socoteste ca fix", () => {
  /*
   * E o greseala de configurare a comerciantului. Cel mai putin rau lucru e sa nu incasam nimic
   * pentru ea — nu sa preschimbam „15 lei/m²" in „15 lei", ceea ce ar fi un pret pe care nu l-a
   * scris nimeni.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "x", type: "comutator", label: "Protectie", required: false, impact: { fel: "pe_m2", suma: 15 } }],
  })!;
  const { p } = socoteste(d, { x: true });
  assert.equal(p.supliment, 0);
  assert.equal(p.defalcare.length, 0);
});

test("⚠ suplimentul nu poate cobori sub zero", () => {
  /* Sumele negative se refuza inca de la citire, deci nu exista cale catre un pret negativ. */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "x", type: "comutator", label: "Reducere", required: false, impact: { fel: "fix", suma: -500 } }],
  })!;
  assert.equal(d.fields[0].impact?.fel, "fara", "o suma negativa a trecut de cititor");
  const { p } = socoteste(d, { x: true });
  assert.equal(p.supliment, 0);
  assert.equal(pretUnitar(p, 89), 89);
});

test("⚠ defalcarea spune din ce se compune suma", () => {
  const d = fototapet();
  const { p } = socoteste(d, { dim: { latime: 350, inaltime: 250 }, mat: "prm", prot: true });
  assert.equal(p.defalcare.length, 2);
  assert.equal(p.defalcare[0].eticheta, "Premium");
  assert.equal(p.defalcare[0].suma, 778.75);
  assert.equal(p.defalcare[0].detaliu, "8,75 m² x 89 lei/m²");
  assert.equal(p.defalcare[1].eticheta, "Protectie impermeabila");
  assert.equal(p.defalcare[1].suma, 131.25);
});

test("⚠ modul „suprafata\" cade inapoi pe „adaugat\" cand ii lipseste temelia", () => {
  /*
   * Fara un camp de dimensiuni care chiar exista si e de tipul bun, nu se poate socoti nicio
   * suprafata. Un pret pe m² fara m² ar fi iesit ZERO — adica marfa data pe gratis. Purtarea de
   * rezerva e pretul de catalog, care e mereu vandabil.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "t", type: "text", label: "Text", required: false }],
    pret: { fel: "suprafata", campDimensiuni: "nu-exista", tarif: 69, includePretulProdusului: false },
  })!;
  assert.equal(d.pret?.fel, "adaugat");
  const { p } = socoteste(d, { t: "ceva" });
  assert.equal(p.bazaInclusa, true);
  assert.equal(pretUnitar(p, 89), 89);
});
