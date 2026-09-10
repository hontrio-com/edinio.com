import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { pluralRo } from "@/lib/utils/format";
import { textCurat } from "@/lib/storefront/date-structurate";
import {
  descriereCatalog, descriereCategorie, descrierePaginii, descriereProprieCatalog, latimeEstimata,
  LATIME_MAXIMA, numeScurtMagazin, orfaneCuProduse, preturiFaraTva, ramuriCuProduse,
  subarboreAreProduse, subarboreReunit,
  type ContextDescriere, type ContinutPagina,
} from "./descriere-generata";

/*
 * ═══ DE CE EXISTA FISIERUL ASTA ═══
 *
 * Catalogul si toate categoriile purtau descrierea paginii principale: acelasi text
 * sub fiecare adresa, in Google. Reclamat de caian-textile.ro pe 10.09.2026.
 *
 * Datele de mai jos sunt CELE REALE ale magazinului caian-textile, citite pe
 * 10.09.2026: arborele de categorii (ordonat ca in panou), `catalog_rezumat.categorii`
 * pentru comutatoarele lui, si pentru fiecare categorie ce a raspuns `catalog_pagina`
 * (apelul A: total + primele 3 produse in ordinea grilei, „newest"; apelul B: cel mai
 * mic pret in stoc si `has_range`). Textele asteptate sunt cele din planul aprobat.
 */

const MAGAZIN = "CAIAN TEXTILE";

const CAIAN = [
  ["0b0cfe52-1e8d-443d-8424-7d40f6111202", "Protectii impermeabile saltea", "c042240b-4334-43d6-9f3e-99bc05927935"],
  ["283db998-4275-452e-9a1b-5bb347248d47", "Halate SPA", "7bdf0bd2-b802-4360-9643-7b3616e3a5be"],
  ["28b12792-fc10-4d4a-9c1a-0749a33d0448", "PROSOAPE", null],
  ["3c2f3685-981b-4625-bc94-ee6b31d15ecf", "Perne Hotel", "dea4bf88-d859-4240-a7e0-7e001ac48aee"],
  ["4d91a107-aa23-4001-988d-f23a0cdfbfc6", "Cearsafuri cu elastic", "57cfb2e9-6892-451e-bcd1-549dca073e11"],
  ["e9a46811-ae3c-42ba-a47c-37f0f0f0ba74", "Prosoape Hotel", "28b12792-fc10-4d4a-9c1a-0749a33d0448"],
  ["fe85c523-04a5-4612-8eb7-d6a579351ab7", "Prosoape pentru casa", "da25a30e-b683-498a-ab06-026b843545b2"],
  ["19cbbf99-17d8-4245-8796-fb9cd7db7025", "Cearsafuri clasice", "57cfb2e9-6892-451e-bcd1-549dca073e11"],
  ["2d4463e1-87a8-460b-bb59-ba768704aa31", "Perne Premium", "dea4bf88-d859-4240-a7e0-7e001ac48aee"],
  ["3755d8f4-91de-45c7-b33c-d3f837875958", "Protectii impermeabile perna", "c042240b-4334-43d6-9f3e-99bc05927935"],
  ["57cfb2e9-6892-451e-bcd1-549dca073e11", "LENJERII DE PAT", null],
  ["6411b781-f84e-4757-b0b6-52bd970b5e69", "Prosoape bucatarie", "da25a30e-b683-498a-ab06-026b843545b2"],
  ["c673c626-7f13-4c32-ac29-b72e9439ca6b", "Halate HOTEL", "7bdf0bd2-b802-4360-9643-7b3616e3a5be"],
  ["c91fcc94-ddde-4552-a120-2bb759f082d0", "Prosoape SPA", "28b12792-fc10-4d4a-9c1a-0749a33d0448"],
  ["17ebcfda-9679-47be-ae73-2819a066d65c", "Papuci Hotelieri", "7bdf0bd2-b802-4360-9643-7b3616e3a5be"],
  ["556a9cbd-2909-4e3c-bc72-f447984313cc", "Covorase baie", "c042240b-4334-43d6-9f3e-99bc05927935"],
  ["649e3fad-5915-4a4d-88c5-8175845cdf72", "Pilote", "dea4bf88-d859-4240-a7e0-7e001ac48aee"],
  ["95f0ec61-2348-4005-be02-6bc3d60b1b2f", "Prosoape Salon & Beauty", "28b12792-fc10-4d4a-9c1a-0749a33d0448"],
  ["dea4bf88-d859-4240-a7e0-7e001ac48aee", "PERNE SI PILOTE", null],
  ["ee90f146-f6f5-4911-9005-b037b509ddd7", "Fete de perna", "57cfb2e9-6892-451e-bcd1-549dca073e11"],
  ["059b5619-010a-4690-979b-2bf035784295", "Protectii Scaune", "c042240b-4334-43d6-9f3e-99bc05927935"],
  ["548d6145-bca9-4a4b-b2fc-d33ec687e989", "Seturi", "28b12792-fc10-4d4a-9c1a-0749a33d0448"],
  ["68cf0398-e442-4136-bff7-0d5072296e36", "Lenjerii hoteliere", "57cfb2e9-6892-451e-bcd1-549dca073e11"],
  ["7bdf0bd2-b802-4360-9643-7b3616e3a5be", "HALATE SI PAPUCI", null],
  ["0ef52172-c9c8-479e-bd8f-77988c3851a1", "Lenjerii Multicolore", "57cfb2e9-6892-451e-bcd1-549dca073e11"],
  ["c042240b-4334-43d6-9f3e-99bc05927935", "PROTECTII SI ACCESORII", null],
  ["da25a30e-b683-498a-ab06-026b843545b2", "HOME & DECO", null],
].map(([id, name, parent_id]) => ({ id: id as string, name: name as string, parent_id }));

const REZUMAT_CAIAN = new Set([
  "Cearsafuri cu elastic", "Covorase baie", "Fete de perna", "Lenjerii hoteliere", "Papuci Hotelieri",
  "Perne Hotel", "Perne Premium", "Prosoape Hotel", "Prosoape SPA", "Prosoape Salon & Beauty",
  "Protectii Scaune", "Protectii impermeabile saltea", "Seturi",
]);

/** [total A, primele 3 din grila, pret B, has_range B]; cheia "" = catalogul intreg. */
const GRILA: Record<string, [number, string[], number | null, boolean]> = {
  "": [41, ["Husa de Pat CAIAN Elastic Jersey 100% Bumbac 140x200 cm Alb", "Protectie Saltea Caian Impermeabila cu Fermoar 180x200 cm Alba", "Protectie Saltea Caian Impermeabila cu Fermoar 90x200 cm Alba"], 2.1, false],
  "Cearsafuri clasice": [0, [], null, false],
  "Cearsafuri cu elastic": [5, ["Husa de Pat CAIAN Elastic Jersey 100% Bumbac 140x200 cm Alb", "Husa de Pat CAIAN Elastic Jersey 100% Bumbac 200x220 cm", "Husa de Pat CAIAN Elastic Jersey 100% Bumbac 180x200 cm"], 40, false],
  "Covorase baie": [1, ["Covoras Baie CAIAN 100% Bumbac 50x70 cm - 700 GSM"], 18.09, false],
  "Fete de perna": [1, ["Fata de Perna CAIAN Damasc Satinat 50x70 cm"], 20.87, false],
  "Halate HOTEL": [0, [], null, false],
  "HALATE SI PAPUCI": [2, ["Papuci Hotelieri CAIAN ECO Vascoza Antiderapanti", "Papuci Hotelieri CAIAN De Unica Folosinta"], 2.1, false],
  "Halate SPA": [0, [], null, false],
  "HOME & DECO": [0, [], null, false],
  "LENJERII DE PAT": [8, ["Husa de Pat CAIAN Elastic Jersey 100% Bumbac 140x200 cm Alb", "Fata de Perna CAIAN Damasc Satinat 50x70 cm", "Lenjerie Hoteliera CAIAN Dubla Bumbac Satinat Damasc cu Dungi 1 cm - Set Complet Husa Pilota Cearceaf si 2 Fete de Perna"], 20.87, false],
  "Lenjerii hoteliere": [2, ["Lenjerie Hoteliera CAIAN Dubla Bumbac Satinat Damasc cu Dungi 1 cm - Set Complet Husa Pilota Cearceaf si 2 Fete de Perna", "Lenjerie Hoteliera CAIAN Single Bumbac Satinat Damasc cu Dungi 1 cm - Set Complet Husa Pilota Cearceaf si 2 Fete de Perna"], 175, false],
  "Lenjerii Multicolore": [0, [], null, false],
  "Papuci Hotelieri": [2, ["Papuci Hotelieri CAIAN ECO Vascoza Antiderapanti", "Papuci Hotelieri CAIAN De Unica Folosinta"], 2.1, false],
  "Perne Hotel": [1, ["Perna Hoteliera CAIAN Microfibra 50x70 cm - 900 grame"], 28.5, false],
  "Perne Premium": [3, ["Perna Matlasata CAIAN Premium 50x70 cm", "Perna Matlasata CAIAN Eucalipt Premium 50x70 cm", "Perna Matlasata CAIAN Aloe Vera Premium 50x70 cm"], 33.5, true],
  "PERNE SI PILOTE": [4, ["Perna Matlasata CAIAN Premium 50x70 cm", "Perna Matlasata CAIAN Eucalipt Premium 50x70 cm", "Perna Matlasata CAIAN Aloe Vera Premium 50x70 cm"], 28.5, false],
  "Pilote": [0, [], null, false],
  "PROSOAPE": [18, ["Set 3 Prosoape CAIAN Greek Border Albastru 50x90 cm - 500 GSM", "Set 5 Prosoape CAIAN Greek Border Albastru 30x50 cm - 500 GSM", "Set 3 Prosoape CAIAN Greek Border Verde 50x90 cm - 500 GSM"], 8.63, false],
  "Prosoape bucatarie": [0, [], null, false],
  "Prosoape Hotel": [2, ["Prosop Hotelier CAIAN Greek Border Bumbac Alb 70x130 cm - 620 GSM", "Prosop Hotelier CAIAN Greek Border Bumbac Alb 50x90 cm - 620 GSM"], 34.79, false],
  "Prosoape pentru casa": [0, [], null, false],
  "Prosoape Salon & Beauty": [9, ["Prosop CAIAN Greek Border Verde 70x130 cm - 500 GSM", "Prosop CAIAN Greek Border Verde 30x50 cm - 500 GSM", "Prosop CAIAN Greek Border Verde 50x90 cm - 500 GSM"], 8.63, false],
  "Prosoape SPA": [1, ["Prosop SPA CAIAN Greek Border Bumbac Alb 80x180 cm - 500 GSM"], 45.92, false],
  "Protectii impermeabile perna": [0, [], null, false],
  "Protectii impermeabile saltea": [7, ["Protectie Saltea Caian Impermeabila cu Fermoar 180x200 cm Alba", "Protectie Saltea Caian Impermeabila cu Fermoar 90x200 cm Alba", "Protectie Saltea Elastic Colturi Caian Impermeabila 160x200 cm Alba"], 32.29, false],
  "Protectii Scaune": [1, ["Set 6 Huse Scaun CAIAN Elastice Universale"], 61.75, true],
  "PROTECTII SI ACCESORII": [9, ["Protectie Saltea Caian Impermeabila cu Fermoar 180x200 cm Alba", "Protectie Saltea Caian Impermeabila cu Fermoar 90x200 cm Alba", "Protectie Saltea Elastic Colturi Caian Impermeabila 160x200 cm Alba"], 18.09, false],
  "Seturi": [6, ["Set 3 Prosoape CAIAN Greek Border Albastru 50x90 cm - 500 GSM", "Set 5 Prosoape CAIAN Greek Border Albastru 30x50 cm - 500 GSM", "Set 3 Prosoape CAIAN Greek Border Verde 50x90 cm - 500 GSM"], 26.44, false],
};

const continutCaian = (nume: string): ContinutPagina => {
  const [numar, produse, pretMinim, interval] = GRILA[nume];
  return { numar, produse, pretMinim, interval };
};

/** Contextul caian, compus ca in `contextDescriere`: subarborele reunit, ramurile cu produse. */
function contextCaian(nume: string): ContextDescriere {
  if (!nume) {
    return { parinte: null, subcategorii: ramuriCuProduse(CAIAN, null, REZUMAT_CAIAN), continut: continutCaian(""), faraTva: false, reduceri: false };
  }
  const s = subarboreReunit(CAIAN, nume);
  return {
    parinte: s.parinte,
    subcategorii: ramuriCuProduse(CAIAN, s.idsPagina, REZUMAT_CAIAN),
    continut: continutCaian(nume),
    faraTva: false,
    reduceri: false,
  };
}

const descriereCaian = (nume: string) => descrierePaginii({ categorie: nume, magazin: MAGAZIN, context: contextCaian(nume) });

const context = (peste: Partial<ContextDescriere> = {}): ContextDescriere => ({
  parinte: null, subcategorii: [], continut: { numar: 2, pretMinim: 10, interval: false, produse: [] },
  faraTva: false, reduceri: false, ...peste,
});

describe("pluralRo", () => {
  test("acordul romanesc, dupa ULTIMELE DOUA cifre, cu separator de mii", () => {
    const asteptat: [number, string][] = [
      [0, "0 produse"], [1, "1 produs"], [19, "19 produse"], [20, "20 de produse"],
      [100, "100 de produse"], [101, "101 produse"], [120, "120 de produse"],
      [1001, "1.001 produse"], [1353, "1.353 de produse"],
    ];
    for (const [n, text] of asteptat) assert.equal(pluralRo(n), text, `n = ${n}`);
  });

  test("merge si pentru alte substantive", () => {
    assert.equal(pluralRo(1, "categorie", "categorii"), "1 categorie");
    assert.equal(pluralRo(21, "categorie", "categorii"), "21 de categorii");
    assert.equal(pluralRo(3, "produs a venit", "produse au venit"), "3 produse au venit");
  });
});

describe("numeScurtMagazin", () => {
  test("numele reale ale magazinelor cu domeniu propriu", () => {
    const asteptat: [string, string][] = [
      ["BricoSmart - Solutii smart pentru casa si gradina", "BricoSmart"],
      ["CAIAN TEXTILE", "CAIAN TEXTILE"],
      ["Suporti-Numar.ro - Suporti Numar Ultra Slim", "Suporti-Numar.ro"],
      ["eSAFE.ro - Echipamente protectia muncii", "eSAFE.ro"],
      // Magazinul fara `store_name` se afiseaza cu numele firmei.
      ["ULTIMUL MAGAZIN S.R.L.", "ULTIMUL MAGAZIN"],
      ["Atelierul Larisei - cadouri unice", "Atelierul Larisei"],
      ["Yvelle ", "Yvelle"],
    ];
    for (const [brut, scurt] of asteptat) assert.equal(numeScurtMagazin(brut), scurt, brut);
  });

  test("forma juridica, oricum ar fi scrisa; un cap prea scurt nu taie", () => {
    assert.equal(numeScurtMagazin("CADEBO COMPANY SRL"), "CADEBO COMPANY");
    assert.equal(numeScurtMagazin("Ana - Maria"), "Ana");
    assert.equal(numeScurtMagazin("Al - Magazin"), "Al - Magazin");
    assert.equal(numeScurtMagazin("SRL"), "SRL");
  });
});

describe("latimeEstimata", () => {
  test("o majuscula cantareste 1,3, restul 1", () => {
    assert.equal(latimeEstimata("abc"), 3);
    assert.equal(latimeEstimata("ABC"), 3.9);
    assert.equal(latimeEstimata("Ăă 1"), 4.3);
  });

  test(`exemplul din plan: „Prosoape Hotel” cu primul produs trece de 155`, () => {
    const cuProdus = "Prosoape Hotel (PROSOAPE) la CAIAN TEXTILE, de la 34,79 lei. Printre produse: Prosop Hotelier CAIAN Greek Border Bumbac Alb 70x130 cm - 620 GSM.";
    assert.equal(latimeEstimata(cuProdus), 155.1);
  });
});

describe("descrierile caian, pe datele reale", () => {
  test("exact textele din plan", () => {
    assert.equal(
      descriereCaian("PROSOAPE"),
      "PROSOAPE la CAIAN TEXTILE: 18 produse, de la 8,63 lei. Subcategorii: Prosoape Hotel, Prosoape SPA, Prosoape Salon & Beauty și Seturi.",
    );
    assert.equal(
      descriereCaian("Prosoape Salon & Beauty"),
      "Prosoape Salon & Beauty (PROSOAPE) la CAIAN TEXTILE, de la 8,63 lei. Printre produse: Prosop CAIAN Greek Border Verde 70x130 cm - 500 GSM.",
    );
    // Cu numele primului produs, latimea ar fi 155,1: produsul nu intra, parintele ramane.
    assert.equal(descriereCaian("Prosoape Hotel"), "Prosoape Hotel (PROSOAPE) la CAIAN TEXTILE, de la 34,79 lei.");
    // „Cearsafuri clasice" si „Lenjerii Multicolore" n-au produse: nu se numesc.
    assert.equal(
      descriereCaian("LENJERII DE PAT"),
      "LENJERII DE PAT la CAIAN TEXTILE, de la 20,87 lei. Subcategorii: Cearsafuri cu elastic, Fete de perna și Lenjerii hoteliere.",
    );
    assert.equal(descriereCaian("HOME & DECO"), "HOME & DECO la CAIAN TEXTILE.");
    assert.equal(
      descriereCaian(""),
      "Catalogul CAIAN TEXTILE: 41 de produse în 5 categorii, printre care PROSOAPE, LENJERII DE PAT, PERNE SI PILOTE și HALATE SI PAPUCI.",
    );
  });

  test("toate cele 27 de categorii: texte distincte, fiecare cu numele ei, sub 155, fara emdash", () => {
    const texte = CAIAN.map((c) => descriereCaian(c.name));
    assert.equal(new Set(texte).size, CAIAN.length);
    for (const [i, t] of texte.entries()) {
      assert.ok(t.includes(CAIAN[i].name), t);
      assert.ok(latimeEstimata(t) <= LATIME_MAXIMA, `${t} (${latimeEstimata(t)})`);
      assert.ok(!t.includes("\u2014"), t);
      assert.ok(!/\b0 produse\b/.test(t), t);
    }
  });

  test(`un singur produs: pretul fara „de la”, iar cu variante „de la”`, () => {
    assert.equal(
      descriereCaian("Prosoape SPA"),
      "Prosoape SPA (PROSOAPE) la CAIAN TEXTILE: 45,92 lei. Produsul: Prosop SPA CAIAN Greek Border Bumbac Alb 80x180 cm - 500 GSM.",
    );
    assert.ok(descriereCaian("Protectii Scaune").includes(", de la 61,75 lei."));
  });
});

describe("descriereCategorie: regulile", () => {
  const baza = { categorie: "Prosoape Hotel", magazin: MAGAZIN };

  test(`date necitite: doar deschiderea, niciodata „0 produse”`, () => {
    const t = descriereCategorie({ ...baza, ...context({ parinte: "PROSOAPE", subcategorii: ["Ceva"], continut: null }) });
    assert.equal(t, "Prosoape Hotel (PROSOAPE) la CAIAN TEXTILE.");
  });

  test("categorie fara produse: doar deschiderea, fara sa-si anunte golul", () => {
    const t = descriereCategorie({ ...baza, ...context({ continut: { numar: 0, pretMinim: null, interval: false, produse: [] } }) });
    assert.equal(t, "Prosoape Hotel la CAIAN TEXTILE.");
  });

  test("fara pret (nimic in stoc): fara pret, dar cu produsele", () => {
    const t = descriereCategorie({ ...baza, ...context({ continut: { numar: 2, pretMinim: null, interval: false, produse: ["Prosop A"] } }) });
    assert.equal(t, "Prosoape Hotel la CAIAN TEXTILE. Printre produse: Prosop A.");
  });

  test(`un produs: „: pret”; cu interval: „de la”`, () => {
    const fara = descriereCategorie({ ...baza, ...context({ continut: { numar: 1, pretMinim: 45.92, interval: false, produse: ["Prosop A"] } }) });
    assert.equal(fara, "Prosoape Hotel la CAIAN TEXTILE: 45,92 lei. Produsul: Prosop A.");
    const cu = descriereCategorie({ ...baza, ...context({ continut: { numar: 1, pretMinim: 45.92, interval: true, produse: ["Prosop A"] } }) });
    assert.equal(cu, "Prosoape Hotel la CAIAN TEXTILE, de la 45,92 lei. Produsul: Prosop A.");
  });

  test("numarul apare de la 10 produse in sus", () => {
    const noua = descriereCategorie({ ...baza, ...context({ continut: { numar: 9, pretMinim: 5, interval: false, produse: [] } }) });
    assert.equal(noua, "Prosoape Hotel la CAIAN TEXTILE, de la 5 lei.");
    const zece = descriereCategorie({ ...baza, ...context({ continut: { numar: 10, pretMinim: 5, interval: false, produse: [] } }) });
    assert.equal(zece, "Prosoape Hotel la CAIAN TEXTILE: 10 produse, de la 5 lei.");
  });

  test(`subcategoriile care nu incap: „și altele”, sub 155`, () => {
    const t = descriereCategorie({
      categorie: "CURATENIE", magazin: "BricoSmart - Solutii smart pentru casa si gradina",
      ...context({
        subcategorii: ["Hartie", "Detergenti", "Articole casa", "Articole Curatenie", "Echipamente de protectie", "Candele si lumanari", "Saci menaj", "Lavete"],
        continut: { numar: 992, pretMinim: 1.11, interval: false, produse: [] },
      }),
    });
    assert.match(t, /^CURATENIE la BricoSmart: 992 de produse, de la 1,11 lei\. Subcategorii: Hartie, .* și altele\.$/);
    assert.ok(latimeEstimata(t) <= LATIME_MAXIMA, String(latimeEstimata(t)));
  });

  test("o singura subcategorie: la singular", () => {
    assert.equal(descriereCaian("HALATE SI PAPUCI"), "HALATE SI PAPUCI la CAIAN TEXTILE, de la 2,10 lei. Subcategoria: Papuci Hotelieri.");
  });

  test("un nume de produs care nu incape opreste lista ACOLO, nu se taie", () => {
    const lung = "Lenjerie Hoteliera CAIAN Dubla Bumbac Satinat Damasc cu Dungi 1 cm - Set Complet Husa Pilota";
    const t = descriereCategorie({ ...baza, ...context({ continut: { numar: 3, pretMinim: 20, interval: false, produse: ["Fata de perna", lung, "Scurt"] } }) });
    assert.equal(t, "Prosoape Hotel la CAIAN TEXTILE, de la 20 lei. Printre produse: Fata de perna.");
  });

  test("nume de categorie de 60 de caractere: incape, cu numele intreg", () => {
    const reala = descriereCategorie({
      categorie: "Faianță personalizată diferite marimi 20*20 / 10*15  / 20*30",
      magazin: "Atelierul Larisei - cadouri unice",
      ...context({ parinte: "Obiecte personalizate", continut: { numar: 120, pretMinim: 1069.99, interval: false, produse: ["Faianta 20x20"] } }),
    });
    assert.ok(reala.startsWith("Faianță personalizată diferite marimi 20*20 / 10*15 / 20*30 (Obiecte personalizate) la Atelierul Larisei: 120 de produse, de la 1.069,99 lei."), reala);
    assert.ok(latimeEstimata(reala) <= LATIME_MAXIMA);

    const nume = "ECHIPAMENTE DE PROTECTIE SI SIGURANTA PENTRU CONSTRUCTII NOI";
    assert.equal(nume.length, 60);
    const t = descriereCategorie({
      categorie: nume, magazin: "eSAFE.ro - Echipamente protectia muncii",
      ...context({ parinte: "ECHIPAMENTE DE PROTECTIA MUNCII SI ACCESORII PENTRU SANTIERE", continut: { numar: 236, pretMinim: 63.07, interval: false, produse: [] } }),
    });
    // Parintele pleaca primul; numele ramane intreg.
    assert.equal(t, `${nume} la eSAFE.ro: 236 de produse, de la 63,07 lei.`);
    assert.ok(latimeEstimata(t) <= LATIME_MAXIMA);
  });

  test(`preturi fara TVA: „fără TVA” langa pret`, () => {
    const t = descriereCategorie({
      categorie: "Bocanci", magazin: "eSAFE.ro - Echipamente protectia muncii",
      ...context({ faraTva: true, continut: { numar: 214, pretMinim: 63.07, interval: false, produse: [] } }),
    });
    assert.equal(t, "Bocanci la eSAFE.ro: 214 produse, de la 63,07 lei fără TVA.");
  });

  test(`pagina de reduceri: prefixul „Reduceri: ”`, () => {
    const t = descriereCategorie({ ...baza, ...context({ reduceri: true, continut: { numar: 3, pretMinim: 15.58, interval: false, produse: [] } }) });
    assert.equal(t, "Reduceri: Prosoape Hotel la CAIAN TEXTILE, de la 15,58 lei.");
  });

  test("parintele cu acelasi nume nu se scrie", () => {
    const t = descriereCategorie({ categorie: "Obiecte personalizate", magazin: "Atelierul Larisei", ...context({ parinte: "Obiecte personalizate" }) });
    assert.ok(!t.includes("("), t);
  });

  test("nicaieri emdash", () => {
    const texte = [
      descriereCategorie({ ...baza, ...context() }),
      descriereCategorie({ ...baza, ...context({ subcategorii: ["A", "B", "C"] }) }),
      descriereCategorie({ ...baza, ...context({ reduceri: true, faraTva: true }) }),
      descriereCatalog({ magazin: MAGAZIN, radacini: ["A", "B"], continut: continutCaian(""), reduceri: false }),
    ];
    for (const t of texte) assert.ok(!t.includes("\u2014"), t);
  });
});

describe("descriereCatalog", () => {
  const cu = (numar: number): ContinutPagina => ({ numar, pretMinim: 2.1, interval: false, produse: [] });
  const radacini = (k: number) => Array.from({ length: k }, (_, i) => `Categoria ${i + 1}`);

  test("o singura categorie", () => {
    assert.equal(
      descriereCatalog({ magazin: MAGAZIN, radacini: ["PROSOAPE"], continut: cu(18), reduceri: false }),
      "Catalogul CAIAN TEXTILE: 18 produse, în categoria PROSOAPE.",
    );
  });

  test("K se acorda si el: 19, 20, 28", () => {
    for (const [k, forma] of [[19, "în 19 categorii"], [20, "în 20 de categorii"], [28, "în 28 de categorii"]] as const) {
      const t = descriereCatalog({ magazin: MAGAZIN, radacini: radacini(k), continut: cu(500), reduceri: false });
      assert.ok(t.includes(forma), t);
      assert.ok(t.includes(", printre care Categoria 1"), t);
      assert.ok(latimeEstimata(t) <= LATIME_MAXIMA, t);
    }
  });

  test("fara produse sau fara date: doar numele", () => {
    assert.equal(descriereCatalog({ magazin: MAGAZIN, radacini: ["A"], continut: cu(0), reduceri: false }), "Catalogul CAIAN TEXTILE.");
    assert.equal(descriereCatalog({ magazin: MAGAZIN, radacini: ["A"], continut: null, reduceri: false }), "Catalogul CAIAN TEXTILE.");
  });

  test("pe reduceri, categoriile nu se numesc: rezumatul nu stie de reduceri", () => {
    assert.equal(
      descriereCatalog({ magazin: MAGAZIN, radacini: ["A", "B"], continut: cu(6), reduceri: true }),
      "Reduceri: Catalogul CAIAN TEXTILE: 6 produse.",
    );
  });
});

describe("ramuriCuProduse, pe arborele caian", () => {
  const idDupaNume = (n: string) => CAIAN.filter((c) => c.name === n).map((c) => c.id);

  test("LENJERII DE PAT: exact cele trei cu produse, in ordinea din panou", () => {
    assert.deepEqual(
      ramuriCuProduse(CAIAN, idDupaNume("LENJERII DE PAT"), REZUMAT_CAIAN),
      ["Cearsafuri cu elastic", "Fete de perna", "Lenjerii hoteliere"],
    );
  });

  test("PROSOAPE: ordinea din panou, nu alta", () => {
    assert.deepEqual(
      ramuriCuProduse(CAIAN, idDupaNume("PROSOAPE"), REZUMAT_CAIAN),
      ["Prosoape Hotel", "Prosoape SPA", "Prosoape Salon & Beauty", "Seturi"],
    );
  });

  test("nivelul de sus: cele 5 cu produse, fara HOME & DECO", () => {
    assert.deepEqual(
      ramuriCuProduse(CAIAN, null, REZUMAT_CAIAN),
      ["PROSOAPE", "LENJERII DE PAT", "PERNE SI PILOTE", "HALATE SI PAPUCI", "PROTECTII SI ACCESORII"],
    );
  });

  test("fara rezumat: nimic, fiindca nu stim", () => {
    assert.deepEqual(ramuriCuProduse(CAIAN, idDupaNume("LENJERII DE PAT"), null), []);
    assert.deepEqual(ramuriCuProduse(CAIAN, null, null), []);
  });
});

/** Arborele real atelierul-larisei: „Obiecte personalizate" e radacina SI propriul ei copil. */
const RAD_OBIECTE = "2789c4a0-e2f5-4eed-82ac-7ce8a083627b";
const ATELIER = [
  ["8f06c8cf-3709-4d3b-b421-ea6b19b29da4", "Obiecte personalizate", RAD_OBIECTE],
  ["608ea357-94a4-4679-b6ee-96c309023439", "Tricouri personalizate adulți", RAD_OBIECTE],
  ["736fcb68-2343-47de-9a80-e88feacaa296", "Brelocuri", RAD_OBIECTE],
  [RAD_OBIECTE, "Obiecte personalizate", null],
  ["f12da72c-cd53-408f-88a2-d0898922b4df", "Magneți", RAD_OBIECTE],
  ["04982466-c9c0-4a26-82fb-24059e0bbcb9", "Tablou sticlă personalizat", RAD_OBIECTE],
  ["ba93e9fe-d277-408b-88d8-83876423fbfd", "Cană personalizată", RAD_OBIECTE],
  ["327c4bc3-ba19-4910-ae4c-1dc1907ee47d", "Brichetă personalizată  /  Scrumieră personalizată", RAD_OBIECTE],
  ["29a8387d-2eed-421b-96c4-71611c05adbb", "Tricouri personalizate copii", RAD_OBIECTE],
].map(([id, name, parent_id]) => ({ id: id as string, name: name as string, parent_id }));
const REZUMAT_ATELIER = new Set(["Cană personalizată", "Magneți", "Obiecte personalizate", "Tricouri personalizate copii", "Lumânări decorative"]);

describe("subarboreReunit", () => {
  test("atelierul-larisei: reuniunea, fara parintele autoreferential", () => {
    const s = subarboreReunit(ATELIER, "Obiecte personalizate");
    assert.equal(s.parinte, null);
    assert.deepEqual([...s.idsPagina].sort(), [RAD_OBIECTE, "8f06c8cf-3709-4d3b-b421-ea6b19b29da4"].sort());
    assert.deepEqual([...s.nume].sort(), [...new Set(ATELIER.map((c) => c.name))].sort());
    // Copilul cu acelasi nume e chiar pagina, nu o subcategorie a ei.
    assert.deepEqual(ramuriCuProduse(ATELIER, s.idsPagina, REZUMAT_ATELIER), ["Magneți", "Cană personalizată", "Tricouri personalizate copii"]);
  });

  test("numele dublat sub doi parinti diferiti: ambii subarbori, niciun parinte", () => {
    const cat = [
      { id: "1", name: "Casa", parent_id: null },
      { id: "2", name: "Gradina", parent_id: null },
      { id: "3", name: "Insecticide", parent_id: "1" },
      { id: "4", name: "Insecticide", parent_id: "2" },
      { id: "5", name: "Spray", parent_id: "3" },
      { id: "6", name: "Granule", parent_id: "4" },
    ];
    const s = subarboreReunit(cat, "Insecticide");
    assert.deepEqual([...s.nume].sort(), ["Granule", "Insecticide", "Spray"]);
    assert.equal(s.parinte, null);
    assert.equal(subarboreReunit(cat, "Spray").parinte, "Insecticide");
  });

  test("numele purtat doar de produse: chiar numele, fara parinte", () => {
    assert.deepEqual(subarboreReunit(CAIAN, "Orfana"), { nume: ["Orfana"], idsPagina: [], parinte: null });
  });

  test("un ciclu scris in baza nu blocheaza", () => {
    const cat = [{ id: "a", name: "A", parent_id: "b" }, { id: "b", name: "B", parent_id: "a" }];
    assert.deepEqual([...subarboreReunit(cat, "A").nume].sort(), ["A", "B"]);
    assert.deepEqual(ramuriCuProduse(cat, ["a"], new Set(["A"])), ["B"]);
  });
});

describe("subarboreAreProduse: regula unica a deciziei 6", () => {
  test("caian: goale false, pline true", () => {
    assert.equal(subarboreAreProduse(CAIAN, "HOME & DECO", REZUMAT_CAIAN), false);
    assert.equal(subarboreAreProduse(CAIAN, "Cearsafuri clasice", REZUMAT_CAIAN), false);
    assert.equal(subarboreAreProduse(CAIAN, "PROSOAPE", REZUMAT_CAIAN), true);
    assert.equal(subarboreAreProduse(CAIAN, "Prosoape Hotel", REZUMAT_CAIAN), true);
  });

  test("fara rezumat: null, adica pagina ramane indexabila", () => {
    assert.equal(subarboreAreProduse(CAIAN, "HOME & DECO", null), null);
    assert.equal(subarboreAreProduse(CAIAN, "HOME & DECO", undefined), null);
    assert.equal(subarboreAreProduse(CAIAN, "", REZUMAT_CAIAN), null);
  });

  test("primeste si tabloul din rezumat, asa cum vine din baza", () => {
    assert.equal(subarboreAreProduse(CAIAN, "HOME & DECO", [...REZUMAT_CAIAN]), false);
    assert.equal(subarboreAreProduse(ATELIER, "Obiecte personalizate", [...REZUMAT_ATELIER]), true);
  });
});

describe("orfaneCuProduse", () => {
  test("numele din rezumat fara rand in tabel; cele stinse nu sunt orfane", () => {
    const toate = [{ name: "Casa" }, { name: "Stinsa" }];
    assert.deepEqual(orfaneCuProduse(toate, new Set(["Stinsa"]), new Set(["Casa", "Import vechi", "Stinsa"])), ["Import vechi"]);
    assert.deepEqual(orfaneCuProduse(toate, new Set(), null), []);
  });
});

describe("descrierePaginii: textul final si carligul pentru etapa 2", () => {
  test("textul propriu castiga cand nu e gol, trecut prin acelasi textCurat", () => {
    const t = descrierePaginii({ categorie: "PROSOAPE", magazin: MAGAZIN, context: contextCaian("PROSOAPE"), descriereProprie: "<p>Prosoape  hoteliere</p>" });
    assert.equal(t, "Prosoape hoteliere");
  });

  test("textul propriu gol sau doar spatii: textul generat", () => {
    for (const gol of [null, undefined, "", "   ", "<p> </p>"]) {
      const t = descrierePaginii({ categorie: "PROSOAPE", magazin: MAGAZIN, context: contextCaian("PROSOAPE"), descriereProprie: gol });
      assert.ok(t.startsWith("PROSOAPE la CAIAN TEXTILE"), String(gol));
    }
  });

  test("pe reduceri textul propriu NU se foloseste: ar fi dublat pagina fara reduceri", () => {
    const t = descrierePaginii({
      categorie: "PROSOAPE", magazin: MAGAZIN, descriereProprie: "Textul meu",
      context: { ...contextCaian("PROSOAPE"), reduceri: true },
    });
    assert.ok(t.startsWith("Reduceri: PROSOAPE la CAIAN TEXTILE"), t);
  });

  test("a doua trecere prin textCurat (JSON-LD) nu mai schimba nimic", () => {
    const nume = ["Brichetă personalizată  /  Scrumieră personalizată", "Saci <60L>", "Șort bucătărie  copil / adult  personalizat"];
    for (const n of nume) {
      const t = descrierePaginii({ categorie: n, magazin: "Atelierul Larisei - cadouri unice", context: context({ parinte: "Obiecte personalizate" }) });
      assert.ok(t.length > 0);
      assert.equal(textCurat(t, 500), t, n);
      assert.ok(!t.includes("  "), t);
    }
  });

  /** Un text de exact `n` caractere, din cuvinte scurte, cu `x` la capat (nu spatiu). */
  const textDe = (n: number) => "prosop moale ".repeat(Math.ceil(n / 13) + 1).slice(0, n - 1) + "x";

  test("etapa 2: pe o CATEGORIE textul comerciantului se publica intreg pana la 300, nu taiat la 160", () => {
    const t250 = textDe(250);
    const t = descrierePaginii({ categorie: "PROSOAPE", magazin: MAGAZIN, context: contextCaian("PROSOAPE"), descriereProprie: t250 });
    assert.equal(t, t250);
    assert.equal(textCurat(t, 500), t, "a doua trecere (JSON-LD) l-ar fi schimbat");
  });

  test("etapa 2: peste 300 (scris ocolind salvarea), taiat la cuvant, sub 300", () => {
    const t400 = textDe(400);
    const t = descrierePaginii({ categorie: "PROSOAPE", magazin: MAGAZIN, context: contextCaian("PROSOAPE"), descriereProprie: t400 });
    assert.ok(t.length <= 300 && t.length > 240, String(t.length));
    assert.ok(t400.startsWith(t), "taiat altfel decat de la inceput");
    assert.equal(t400[t.length], " ", "taiat prin mijlocul unui cuvant");
  });

  test("pe CATALOG subtitlul ramane la 160, ca in etapa 1", () => {
    const t = descrierePaginii({ categorie: "", magazin: MAGAZIN, context: contextCaian("PROSOAPE"), descriereProprie: textDe(250) });
    assert.ok(t.length <= 160 && t.length > 120, String(t.length));
  });

  test("caracterele de control si de directie nu ajung in pagina (`curataTextSeo`, nu doar `textCurat`)", () => {
    const rlo = String.fromCharCode(0x202e);
    const nul = String.fromCharCode(0);
    const t = descrierePaginii({ categorie: "PROSOAPE", magazin: MAGAZIN, context: contextCaian("PROSOAPE"), descriereProprie: `Prosoape${rlo} moi${nul}` });
    assert.equal(t, "Prosoape moi");
  });
});

describe("descriereProprieCatalog (decizia 5)", () => {
  const acasa = "Textile hoteliere CAIAN: prosoape, lenjerii de pat și protecții saltea 100% bumbac, certificate OEKO-TEX. Livrare rapidă în România, prețuri speciale HoReCa.";
  const subtitlu = "Prosoape, lenjerii de pat si protectii saltea certificate OEKO-TEX, pentru hoteluri, pensiuni si uz casnic.";

  test("subtitlul caian e diferit de descrierea paginii principale: el ramane", () => {
    assert.equal(descriereProprieCatalog(subtitlu, acasa), subtitlu);
  });

  test("subtitlul copiat din pagina principala nu se foloseste, nici cu alte diacritice sau spatii", () => {
    const copiat = "  textile hoteliere caian: prosoape, lenjerii de pat si protectii saltea 100% bumbac, certificate oeko-tex. livrare rapida in romania, preturi speciale horeca  ";
    assert.equal(descriereProprieCatalog(copiat, acasa), null);
  });

  test("fara subtitlu: textul generat", () => {
    assert.equal(descriereProprieCatalog("", acasa), null);
    assert.equal(descriereProprieCatalog(null, acasa), null);
  });
});

describe("preturiFaraTva", () => {
  test("aceeasi regula ca serverul care incaseaza", () => {
    assert.equal(preturiFaraTva({ vat_enabled: true, prices_include_vat: false }), true);
    assert.equal(preturiFaraTva({ vat_enabled: true, prices_include_vat: true }), false);
    // `null` = implicitul coloanei, adica „cu TVA".
    assert.equal(preturiFaraTva({ vat_enabled: true, prices_include_vat: null }), false);
    assert.equal(preturiFaraTva({ vat_enabled: false, prices_include_vat: false }), false);
    assert.equal(preturiFaraTva(null), false);
  });
});
