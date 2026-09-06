import test from "node:test";
import assert from "node:assert/strict";
import { normalizeazaDefinitia, type DefinitiePersonalizare } from "./definitie";
import { normalizeazaValorile } from "./valori";
import {
  campurileFaraSuprafata, podeaPersonalizarii, pretUnitar, pretulDepindeDeAlegeri,
  pretulPoateCreste,
  pretulPersonalizarii,
} from "./pret";

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

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ ZERO LEI: masurat ca gaura, apoi inchis
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ un TARIF DE ZERO nu vinde produsul pe gratis", () => {
  /*
   * ⚠ ASTA S-A MASURAT, nu s-a banuit. Sonda de dinainte de reparatie, pe o definitie cu tarif
   * 0 si baza stinsa, a raspuns textual:
   *
   *     valori ok: true | supliment: 0 | bazaInclusa: false | PRET FINAL cu catalog 89: 0
   *
   * Adica un produs vandut cu ZERO lei, cu `ok: true` si fara nicio eroare nicaieri: valorile
   * erau valide, calculul dadea zero, comanda pleaca. Un tarif gol nu e o configurare — e una
   * neterminata — si raspunsul corect e pretul de catalog, care e mereu vandabil.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{
      id: "dim", type: "dimensiuni", label: "Dimensiuni", required: false, unitate: "cm",
      latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 },
    }],
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 0, includePretulProdusului: false },
  })!;
  assert.equal(d.pret?.fel, "adaugat", "tariful zero a ramas mod de suprafata");
  const { v, p } = socoteste(d, { dim: { latime: 350, inaltime: 250 } });
  assert.equal(v.ok, true);
  assert.equal(p.bazaInclusa, true, "baza a ramas stinsa, deci nu mai plateste nimeni nimic");
  assert.equal(pretUnitar(p, 89), 89);
});

test("⚠ o SINGURA optiune de material fara tarif strica tot modul, nu doar optiunea ei", () => {
  /*
   * Sursa de tarif INLOCUIESTE tariful de baza, deci o optiune fara tarif propriu nu cade inapoi
   * pe el — ea ar fi socotit 0 lei/m². Comerciantul care adauga a treia optiune si uita sa-i
   * puna pretul ar fi vandut fototapetele de 8,75 m² pe gratis, si numai pe ramura aia.
   *
   * ⚠ Se cere ca TOATE optiunile sursei sa aiba tarif > 0, nu doar cea aleasa: verdictul se da
   * la CITIRE, pe definitie, nu pe valorile unei comenzi anume.
   */
  const cuGaura = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
        latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } },
      { id: "mat", type: "butoane", label: "Material", required: true,
        optiuni: [
          { id: "std", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
          { id: "uitat", eticheta: "Uitat", impact: { fel: "fara" } },
        ] },
    ],
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 0, campTarif: "mat", includePretulProdusului: false },
  })!;
  assert.equal(cuGaura.pret?.fel, "adaugat");
  /*
   * ⚠ SI CAT COSTA CADEREA, fiindca proba asta a raspuns intai altceva decat credeam.
   *
   * Cazut pe „adaugat", tariful de pe optiuni nu dispare: el se citeste acum ca SUPLIMENT pe m²,
   * peste pretul de catalog. Deci 8,75 m² x 69 = 603,75, plus 89 din catalog = 692,75 — nu 89, cum
   * scrisesem aici prima data.
   *
   * Sensul optiunilor se schimba (inlocuiau tariful, acum se adauga la pret), si asta e de stiut.
   * Dar directia e cea buna: caderea urca pretul, nu il coboara. Cealalta varianta — sa se arunce
   * si suplimentele pe m² — ar fi vandut 8,75 m² de Premium cu 89 de lei, adica exact paguba de
   * care fuge toata reparatia. Ce se apara aici e ca nu se ajunge la ZERO, si nici sub catalog.
   */
  const cazut = pretUnitar(socoteste(cuGaura, { dim: { latime: 350, inaltime: 250 }, mat: "std" }).p, 89);
  assert.equal(cazut, 692.75);
  assert.ok(cazut >= 89, "caderea pe „adaugat\" a coborat sub pretul de catalog");

  /* Si perechea: cu tariful pus pe amandoua, modul ramane „suprafata" si se incaseaza 603,75. */
  const intreg = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
        latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } },
      { id: "mat", type: "butoane", label: "Material", required: true,
        optiuni: [
          { id: "std", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
          { id: "pus", eticheta: "Pus", impact: { fel: "pe_m2", suma: 89 } },
        ] },
    ],
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 0, campTarif: "mat", includePretulProdusului: false },
  })!;
  assert.equal(intreg.pret?.fel, "suprafata");
  assert.equal(pretUnitar(socoteste(intreg, { dim: { latime: 350, inaltime: 250 }, mat: "std" }).p, 89), 603.75);
});

test("⚠ campul de dimensiuni devine OBLIGATORIU cand pretul atarna de el", () => {
  /*
   * A doua jumatate a aceleiasi gauri, si singura care se vedea pe ecran: comerciantul putea lasa
   * campul neobligatoriu. Clientul nu completa nimic, suprafata iesea 0 m², suplimentul 0 lei, si
   * cu baza stinsa comanda pleaca la ZERO — cu `ok: true`, fiindca un camp neobligatoriu gol e
   * un raspuns valid.
   *
   * Nu se refuza configurarea, se REPARA la citire: fara valori nu exista suprafata, deci campul
   * n-are cum sa fie optional. Asa se apara si randurile scrise inainte de reparatie.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{
      id: "dim", type: "dimensiuni", label: "Dimensiuni", required: false, unitate: "cm",
      latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 },
    }],
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 69, includePretulProdusului: false },
  })!;
  assert.equal(d.pret?.fel, "suprafata");
  assert.equal(d.fields[0].required, true, "campul de dimensiuni a ramas optional");
  /* Si consecinta: gol, comanda se REFUZA — nu se pretuieste la zero. */
  const { v, p } = socoteste(d, {});
  assert.equal(v.ok, false, "un camp gol a trecut, si pretul ar fi iesit zero");
  assert.equal(pretUnitar(p, 89), 0, "confirmarea ca fara poarta chiar ieseau 0 lei");
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ INCA DOUA DRUMURI CATRE ZERO, gasite de auditul proprietarului
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ campul-SURSA DE TARIF devine si el obligatoriu", () => {
  /*
   * ⚠ ASTA E CHIAR DRUMUL PE CARE IL RECOMANDA PANOUL, si de-aia costa mai mult decat pare.
   *
   * Comerciantul pune tarifele PE OPTIUNI (Standard 69 / Premium 89) si lasa caseta „Tarif lei/m²"
   * pe 0 — n-are ce scrie acolo. Campul „Material" ramane optional, fiindca panoul creeaza
   * campurile optionale si nu spune nicaieri ca sursa de tarif ar trebui sa fie obligatorie.
   *
   * Clientul scrie 350x250 cm, NU apasa niciun buton de material (nu e obligat, si nimic nu e
   * preselectat), si vede 0 lei. Sonda dinainte de reparatie, pe exact definitia de mai jos:
   *
   *     dim.required: true | mat.required: false
   *     fara material -> ok: TRUE | constatari: []
   *     pret: 0
   *
   * Reparatia de la runda trecuta forta doar campul de dimensiuni. Fara alegere nu exista tarif,
   * exact cum fara dimensiuni nu exista suprafata — aceeasi regula, acelasi loc.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: false, unitate: "cm",
        latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } },
      { id: "mat", type: "butoane", label: "Material", required: false,
        optiuni: [
          { id: "std", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
          { id: "prm", eticheta: "Premium", impact: { fel: "pe_m2", suma: 89 } },
        ] },
    ],
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 0, campTarif: "mat",
      includePretulProdusului: false },
  })!;
  assert.equal(d.pret?.fel, "suprafata");
  assert.equal(d.fields[1].required, true, "campul-sursa a ramas optional");

  const { v, p } = socoteste(d, { dim: { latime: 350, inaltime: 250 } });
  assert.equal(v.ok, false, "s-a putut comanda fara sa se aleaga materialul");
  assert.equal(pretUnitar(p, 89), 0, "confirmarea ca fara poarta chiar ieseau 0 lei");
  /* Martor: completat, se incaseaza 778,75 (8,75 m² x 89). Deci proba poate si sa TREACA. */
  const martor = socoteste(d, { dim: { latime: 350, inaltime: 250 }, mat: "prm" });
  assert.equal(martor.v.ok, true);
  assert.equal(pretUnitar(martor.p, 89), 778.75);
});

test("⚠ o optiune de tarif cu pret FIX strica modul, fiindca nu s-ar incasa deloc", () => {
  /*
   * `pretulPersonalizarii` sare campul-sursa din bucla de suplimente (e socotit sus, ca tarif) si
   * acolo citeste doar `pe_m2`. Deci „+15 lei" fix pus pe o optiune de material nu aduce nici cei
   * 15 lei, nici nu schimba tariful: se incaseaza tariful de baza, tacut, si comerciantul vede in
   * ecran un pret pe care casa nu-l cunoaste.
   *
   * Pe „adaugat" suma aia CHIAR se incaseaza, deci caderea nu e doar o oprire — e si reparatia.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
        latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } },
      { id: "mat", type: "butoane", label: "Material", required: true,
        optiuni: [
          { id: "std", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
          { id: "gres", eticheta: "Cu pret fix", impact: { fel: "fix", suma: 15 } },
        ] },
    ],
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 69, campTarif: "mat",
      includePretulProdusului: false },
  })!;
  assert.equal(d.pret?.fel, "adaugat");
});

test("⚠ laturi NEMARGINITE fara suprafata minima: un fototapet de 1 cm² pe un ban", () => {
  /*
   * `citesteLatura` intoarce marginile doar in pereche, deci o latura ori are `min` si `max`,
   * ori lipseste cu totul — iar lipsa inseamna „orice pana la MAX_LATURA_M". Cu baza stinsa, o
   * comanda de 1x1 cm face 0,0001 m² x 89 = 0,01 lei, si pleaca: e „valida".
   *
   * Ori se stiu marginile, ori exista un minim facturabil care ridica orice comanda la el.
   */
  const fara = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "dim", type: "dimensiuni", label: "Dimensiuni", required: false, unitate: "cm" }],
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 89, includePretulProdusului: false },
  })!;
  assert.equal(fara.pret?.fel, "adaugat");

  /* Perechea: cu minim facturabil modul TINE, si cea mai mica comanda costa 2 m² x 89. */
  const cu = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "dim", type: "dimensiuni", label: "Dimensiuni", required: false, unitate: "cm" }],
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 89, minimM2: 2,
      includePretulProdusului: false },
  })!;
  assert.equal(cu.pret?.fel, "suprafata");
  assert.equal(podeaPersonalizarii(cu, 89), 178);
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ PODEAUA: numarul pe care il are voie sa-l spuna cardul
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ podeaua e cea mai ieftina alegere posibila, socotita cu ACELASI motor", () => {
  /*
   * ⚠ CE COSTA CAND NU EXISTA: `products.price` a incetat sa fie pretul produsului in ziua in
   * care personalizarea a capatat pret. La fototapetul de mai jos catalogul zice 89 de lei, dar
   * cei 89 nu se incaseaza NICIODATA (`includePretulProdusului` stins) — nu e nici pret de
   * vanzare, nici pret de pornire, nu e nimic. Si tocmai el pleaca pe card, in sortare, in filtrul
   * de pret, in insigna de reducere, in JSON-LD, la Google si la Meta.
   *
   * Podeaua: laturile MINIME (100x70 cm = 0,7 m²) x cel mai ieftin material (Standard, 69) =
   * 48,30 lei. Protectia e comutator, deci stinsa e gratis si nu intra.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
        latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } },
      { id: "mat", type: "butoane", label: "Material", required: true,
        optiuni: [
          { id: "std", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
          { id: "prm", eticheta: "Premium", impact: { fel: "pe_m2", suma: 89 } },
        ] },
      { id: "prot", type: "comutator", label: "Protectie", required: false,
        impact: { fel: "pe_m2", suma: 15 } },
    ],
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 69, campTarif: "mat",
      includePretulProdusului: false },
  })!;
  assert.equal(podeaPersonalizarii(d, 89), 48.3);
  assert.equal(pretulDepindeDeAlegeri(d, 89), true, "89 de lei e o minciuna, si trebuie sa se stie");

  /* ⚠ Si podeaua nu e o a doua formula: aceleasi valori, prin motorul de incasare, dau acelasi numar. */
  const prinMotor = pretUnitar(
    socoteste(d, { dim: { latime: 100, inaltime: 70 }, mat: "std" }).p, 89,
  );
  assert.equal(prinMotor, 48.3, "podeaua si casa au dat numere diferite");
});

test("⚠ podeaua alege optiunea cea mai ieftina CU ADEVARAT, nu nominal", () => {
  /*
   * „1 leu/m²" pare mai ieftin decat „5 lei fix", si e — pana la 5 m². Pe 8,75 m² costa 8,75.
   * O alegere pe cifra scrisa ar fi urcat podeaua peste un pret pe care cineva chiar il poate
   * plati, iar cardul ar fi promis mai mult decat cere casa.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
        latime: { min: 300, max: 500 }, inaltime: { min: 300, max: 350 } },
      { id: "fin", type: "butoane", label: "Finisaj", required: true,
        optiuni: [
          { id: "pem2", eticheta: "Pe metru", impact: { fel: "pe_m2", suma: 1 } },
          { id: "fix", eticheta: "Fix", impact: { fel: "fix", suma: 5 } },
        ] },
    ],
  })!;
  /* 3x3 m = 9 m². „Pe metru" costa 9, „Fix" costa 5 -> podeaua ia FIX: 89 + 5 = 94. */
  assert.equal(podeaPersonalizarii(d, 89), 94);
});

test("⚠ produsele VECHI n-au podea peste catalog, deci nimic nu se schimba pentru ele", () => {
  /*
   * Cele din productie: `text`, `textarea`, `image`, fara niciun pret. Podeaua trebuie sa fie
   * chiar pretul de catalog, si `pretulDepindeDeAlegeri` sa spuna „nu minte" — altfel poarta de
   * pe feeduri ar fi retras de pe Google si Meta 29 de produse care se vand corect azi.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "f1", type: "text", label: "Nume gravat", required: true, max_length: 20 },
      { id: "f2", type: "image", label: "Poza", required: false },
    ],
  })!;
  assert.equal(podeaPersonalizarii(d, 89), 89);
  assert.equal(pretulDepindeDeAlegeri(d, 89), false);
});

test("⚠ un supliment OBLIGATORIU urca podeaua; unul optional, nu", () => {
  /*
   * Distinctia asta hotaraste daca feedul minte. Cu gravura obligatorie la +20, nimeni nu poate
   * cumpara la 89 — deci 89 e o minciuna. Cu cutia cadou optionala la +30, 89 e chiar pretul de
   * pornire, si feedul e onest.
   */
  const obligatoriu = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "g", type: "text", label: "Gravura", required: true,
      impact: { fel: "fix", suma: 20 } }],
  })!;
  assert.equal(podeaPersonalizarii(obligatoriu, 89), 109);
  assert.equal(pretulDepindeDeAlegeri(obligatoriu, 89), true);

  const optional = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "c", type: "comutator", label: "Cutie cadou", required: false,
      impact: { fel: "fix", suma: 30 } }],
  })!;
  assert.equal(podeaPersonalizarii(optional, 89), 89);
  assert.equal(pretulDepindeDeAlegeri(optional, 89), false);
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ UN „+15 LEI/M²" CARE N-ARE DE UNDE SA-SI IA METRII
   ══════════════════════════════════════════════════════════════════════════ */

/** Protectia din audit: comutator optional, cu pret pe metru patrat. */
const PROTECTIE = {
  id: "prot", type: "comutator", label: "Protectie impermeabila", required: false,
  impact: { fel: "pe_m2", suma: 15 },
};
const DIM_OPTIONAL = {
  id: "dim", type: "dimensiuni", label: "Dimensiuni", required: false, unitate: "cm",
  latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 },
};

test("⚠ suplimentul pe m² CERE metri, si spune care camp ii cere", () => {
  /*
   * ⚠ MASURAT INAINTE DE REPARATIE, pe patru configurari, cu „Protectie impermeabila +15 lei/m²"
   * pe un produs de 100 de lei:
   *
   *     pe_m2 fara camp de dimensiuni       -> supliment 0 | PRET 100 | la salvare: TRECE
   *     pe_m2 cu DOUA campuri de dimensiuni -> supliment 0 | PRET 100 | la salvare: TRECE
   *     pe_m2 cu camp optional necompletat  -> supliment 0 | PRET 100 | la salvare: TRECE
   *     MARTOR, dimensiuni completate       -> supliment 131,25 | PRET 231,25
   *
   * Comerciantul configura tariful, il vedea salvat, si incasa ZERO. Clientul primea protectia pe
   * gratis. Nimeni nu afla pana la inventar.
   *
   * ⚠ `pretulPersonalizarii` SARE suplimentul dinadins — la nivelul socotelii, „nu incasez
   * nimic" e mai putin rau decat „inventez un numar". Greseala n-a fost saritura, ci ca nimeni nu
   * intreba nicaieri daca ea s-a intamplat.
   */
  const d = normalizeazaDefinitia({
    enabled: true, fields: [DIM_OPTIONAL, PROTECTIE],
  })!;

  const lipsa = campurileFaraSuprafata(d, socoteste(d, { prot: true }).v.valori);
  assert.equal(lipsa.length, 1, "nimeni nu observa ca protectia n-are metri");
  assert.equal(lipsa[0].label, "Protectie impermeabila", "nu se spune CARE camp cere suprafata");
});

test("⚠ cine NU alege nimic pe metru nu e obligat sa dea dimensiuni", () => {
  /*
   * ⚠ PERECHEA CARE FACE REPARATIA SA MERITE, si hotararea de proiectare din spatele ei.
   *
   * Se putea si mai simplu: campul de dimensiuni fortat OBLIGATORIU ori de cate ori exista un
   * supliment pe m². Dar atunci fiecare cumparator ar fi trebuit sa dea masuri chiar si cand nu
   * cumpara nimic pe metru — un cost platit de toti, pentru o alegere pe care o fac putini.
   *
   * Se intreaba deci despre ALEGEREA clientului, nu despre configurare.
   */
  const d = normalizeazaDefinitia({ enabled: true, fields: [DIM_OPTIONAL, PROTECTIE] })!;
  assert.deepEqual(campurileFaraSuprafata(d, socoteste(d, {}).v.valori), []);
  assert.equal(pretUnitar(socoteste(d, {}).p, 100), 100, "s-a schimbat pretul cui nu cere nimic");

  /* Si cu dimensiunile completate, protectia se incaseaza: 8,75 m² x 15 = 131,25. */
  const cu = socoteste(d, { dim: { latime: 350, inaltime: 250 }, prot: true });
  assert.deepEqual(campurileFaraSuprafata(d, cu.v.valori), []);
  assert.equal(pretUnitar(cu.p, 100), 231.25);
});

test("⚠ campul-SURSA de tarif nu intra in socoteala asta", () => {
  /*
   * In modul „suprafata", campul de material DA tariful, nu un supliment peste el — iar campul de
   * dimensiuni de acolo e oricum obligatoriu (vezi `citestePret`). Numarat gresit, fototapetul
   * intreg ar fi fost refuzat la fiecare comanda.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
        latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } },
      { id: "mat", type: "butoane", label: "Material", required: true, optiuni: [
        { id: "std", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
      ] },
    ],
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 69, campTarif: "mat",
      includePretulProdusului: false },
  })!;
  /* Fara dimensiuni, comanda cade oricum pe „Completeaza Latimea" — dar NU pe materialul-sursa. */
  assert.deepEqual(campurileFaraSuprafata(d, socoteste(d, { mat: "std" }).v.valori), []);
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ DOUA INTREBARI, NU UNA: „minte catalogul?" si „poate creste?"
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ instructiunea platformei il ducea pe comerciant CHIAR in defect", () => {
  /*
   * ⚠ SCENARIUL, masurat pe fototapetul din probele proiectului:
   *
   *   Ziua 1: catalog 89. Cardul scrie corect „de la 48,30 lei" — dar poarta de feed scoate
   *           produsul din Google si Meta si ii scrie comerciantului in panou chiar mesajul
   *           nostru: „pretul din catalog [trebuie sa devina] chiar pretul de pornire".
   *   Ziua 2: comerciantul face ce i s-a cerut si pune 48,30. Produsul se intoarce in feeduri —
   *           si, fara ca nimeni sa fi atins cardul, grila incepe sa scrie „48,30 lei" in loc de
   *           „de la 48,30 lei". Pe un produs care se vinde pana la 1557 de lei.
   *   Ziua 3: clientul sorteaza dupa pret, il gaseste intre marunțisuri, apasa — si pe pagina
   *           scrie „de la 48,30 lei". Doua ecrane, doua promisiuni, acelasi produs.
   *
   * Cauza: o singura functie raspundea la doua intrebari diferite. Cand podeaua ajunge egala cu
   * catalogul, „minte catalogul?" devine NU — corect pentru feed, gresit pentru eticheta.
   */
  const d = fototapet();

  /* Ziua 1: amandoua raspund „da", din motive diferite. */
  assert.equal(pretulDepindeDeAlegeri(d, 89), true, "poarta de feed n-a vazut minciuna");
  assert.equal(pretulPoateCreste(d, 89), true);

  /* Ziua 2: feedul se linisteste, eticheta NU. Asta e toata reparatia. */
  assert.equal(podeaPersonalizarii(d, 48.3), 48.3);
  assert.equal(pretulDepindeDeAlegeri(d, 48.3), false, "produsul ar ramane scos din feeduri");
  assert.equal(pretulPoateCreste(d, 48.3), true, "cardul si-a pierdut iar „de la”");
});

test("⚠ produsele VECHI raman fara „de la” — sunt 29 in productie", () => {
  /*
   * Perechea obligatorie: un predicat care spune „da" la tot ar fi trecut proba de mai sus si ar
   * fi pus „de la" pe fiecare card din platforma.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "t", type: "text", label: "Nume gravat", required: true, max_length: 20 },
      { id: "p", type: "image", label: "", required: false },
    ],
  })!;
  assert.equal(pretulPoateCreste(d, 41), false);
  assert.equal(pretulDepindeDeAlegeri(d, 41), false);
});

test("⚠ un supliment doar OPTIONAL capata „de la” — schimbare vizibila, anuntata", () => {
  /*
   * ⚠ CONSECINTA DE STIUT, si nu una strecurata: un card care azi scrie „100 lei" pe un produs
   * cu cutie cadou optionala +35 va scrie „de la 100 lei".
   *
   * Nu e un pret schimbat — 100 ramane platibil, si e chiar pretul de pornire. E raspunsul cinstit
   * la intrebarea „poate cineva plati mai mult?".
   *
   * ⚠ Si poarta feedurilor NU se misca: acolo 100 chiar E pretul de pornire, deci produsul ramane
   * publicat. Daca cele doua ar fi ramas o singura functie, reparatia etichetei ar fi scos din
   * Google si Meta fiecare produs cu supliment optional.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "c", type: "comutator", label: "Cutie cadou", required: false,
      impact: { fel: "fix", suma: 35 } }],
  })!;
  assert.equal(pretulPoateCreste(d, 100), true);
  assert.equal(pretulDepindeDeAlegeri(d, 100), false, "produsul ar fi fost scos din feeduri");
});

test("⚠ plafonul alege optiunea cea mai SCUMPA, si comutatorul PORNIT", () => {
  /* Oglinda podelei. Fara ea, „poate creste?" ar fi raspuns „nu" pe chiar produsele care cresc. */
  const d = fototapet();
  /* Podea: 100x70 cm cu Standard = 0,7 m² x 69 = 48,30. Plafon: 500x350 cu Premium = 17,5 x 89. */
  assert.equal(podeaPersonalizarii(d, 89), 48.3);
  assert.equal(pretulPoateCreste(d, 48.3), true);

  /* Si la un produs unde nimic nu poate creste, raspunsul e „nu". */
  const fix = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "g", type: "text", label: "Gravura", required: true,
      impact: { fel: "fix", suma: 20 } }],
  })!;
  assert.equal(podeaPersonalizarii(fix, 100), 120);
  assert.equal(pretulPoateCreste(fix, 100), false, "un supliment OBLIGATORIU si fix nu poate creste");
});

test("⚠ fiecare jumatate a plafonului conteaza SINGURA", () => {
  /*
   * ⚠ PROBELE DE MAI SUS N-AU PRINS DOI MUTANTI, si merita scris de ce.
   *
   * La fototapet, „poate creste?" ramane ADEVARAT chiar daca plafonul ia optiunea cea mai ieftina
   * SAU laturile minime — fiindca cealalta jumatate singura duce oricum pretul mai sus. Un
   * raspuns bun din motiv gresit e tot un raspuns pe care nu te poti bizui.
   *
   * Aici fiecare dimensiune e IZOLATA: un caz in care poate varia doar OPTIUNEA, si unul in care
   * pot varia doar LATURILE.
   */

  /* 1. Doar optiunea: fara camp de dimensiuni, deci laturile nu pot schimba nimic. */
  const doarOptiunea = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "f", type: "butoane", label: "Finisaj", required: true, optiuni: [
      { id: "simplu", eticheta: "Simplu" },
      { id: "lux", eticheta: "Lux", impact: { fel: "fix", suma: 50 } },
    ] }],
  })!;
  assert.equal(podeaPersonalizarii(doarOptiunea, 100), 100, "podeaua ia optiunea gratuita");
  assert.equal(
    pretulPoateCreste(doarOptiunea, 100), true,
    "plafonul nu mai ia optiunea cea mai SCUMPA",
  );

  /*
   * 2. Doar LATIMEA, si numai ea: inaltimea e pironita (min = max), iar tariful are o singura
   *    optiune. ⚠ Cu amandoua laturile libere, un mutant care strica DOAR latimea trecea —
   *    inaltimea singura ducea oricum aria mai sus. Fiecare latura isi cere cazul ei.
   */
  const doarLatimea = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
        latime: { min: 100, max: 500 }, inaltime: { min: 100, max: 100 } },
    ],
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 69, includePretulProdusului: false },
  })!;
  assert.equal(podeaPersonalizarii(doarLatimea, 89), 69, "1 m² x 69");
  assert.equal(pretulPoateCreste(doarLatimea, 89), true, "plafonul nu mai ia LATIMEA maxima");

  /* 3. Si oglinda: doar INALTIMEA, cu latimea pironita. */
  const doarInaltimea = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
        latime: { min: 100, max: 100 }, inaltime: { min: 100, max: 350 } },
    ],
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 69, includePretulProdusului: false },
  })!;
  assert.equal(podeaPersonalizarii(doarInaltimea, 89), 69);
  assert.equal(pretulPoateCreste(doarInaltimea, 89), true, "plafonul nu mai ia INALTIMEA maxima");
});
