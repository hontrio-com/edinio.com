import { strict as assert } from "node:assert";
import { test } from "node:test";
import { aduCategorii, categoriiIngaduite, categoriiPentruRaft, type UnelteCategorii } from "./taxonomy";
import type { EmagAuth, EmagResult } from "./client";
import type { EmagCategorie } from "./types";

/*
 * Raftul de categorii eMAG: cum se aduce si ce se tine minte.
 *
 * ═══ CE S-A INTAMPLAT (MNY AROMA, 28.10.2026) ═══
 *
 * Dupa o conectare noua, „Sugerează” a stat patru minute. Masurat in productie:
 *   2.928 de categorii, 30 de pagini cerute UNA DUPA ALTA, ~1,5 s fiecare;
 *   doua 502 de la eMAG, si fiecare a oprit TOATA citirea, desi era o singura pagina;
 *   lista tinuta minte avea 6,7 MB, fiindca venea cu toate caracteristicile, si se
 *   citea inapoi la fiecare tasta din cautare.
 *
 * Probele de aici tin cele trei reparatii: paginile vin cate trei, o pagina cazuta
 * trecator se reia, iar in memorie intra doar ce trebuie ca sa cauti.
 */

const AUTH: EmagAuth = { username: "u", password: "p", tara: "ro", businessId: "b" };

/** O categorie cum vine de la eMAG in lista: cu caracteristici si tipuri de familie. */
function categorie(id: number): EmagCategorie {
  return {
    id,
    name: `Categoria ${id}`,
    parent_id: 1,
    is_allowed: id % 2,
    is_ean_mandatory: 1,
    is_warranty_mandatory: 0,
    characteristics: Array.from({ length: 20 }, (_, i) => ({
      id: id * 100 + i, name: `Caracteristica ${i}`, is_mandatory: i % 2, type_id: 1,
    })),
    family_types: [{ id: 1, name: "Culoare" }] as EmagCategorie["family_types"],
  };
}

/**
 * Un eMAG cu `total` categorii, care raspunde dupa `intarziereMs` si poate cadea pe
 * anumite pagini. Tine socoteala cererilor si a celor aflate in drum deodata.
 */
function eMagFals(total: number, optiuni: {
  cade?: (pagina: number, incercare: number) => "trecatoare" | "refuz" | null;
  intarziereMs?: number;
} = {}) {
  const cereri: number[] = [];
  const incercari = new Map<number, number>();
  let inDrum = 0;
  let maximInDrum = 0;

  const citeste: NonNullable<UnelteCategorii["citeste"]> = async (_auth, filtre = {}) => {
    const pagina = filtre.currentPage ?? 1;
    const aCata = (incercari.get(pagina) ?? 0) + 1;
    incercari.set(pagina, aCata);
    cereri.push(pagina);
    inDrum++;
    maximInDrum = Math.max(maximInDrum, inDrum);
    await new Promise((gata) => setTimeout(gata, optiuni.intarziereMs ?? 1));
    inDrum--;

    const cadere = optiuni.cade?.(pagina, aCata) ?? null;
    if (cadere) {
      return {
        error: cadere === "trecatoare" ? "eMAG a răspuns cu 502. Se reia singur." : "Cerere respinsă.",
        status: cadere === "trecatoare" ? 502 : 400,
        verdict: cadere,
        mesaje: [],
      } satisfies EmagResult<EmagCategorie[]>;
    }
    const prima = (pagina - 1) * 100 + 1;
    const ultima = Math.min(total, pagina * 100);
    const lot = prima > total ? [] : Array.from({ length: ultima - prima + 1 }, (_, i) => categorie(prima + i));
    return { data: lot, verdict: "reusit", mesaje: [] } satisfies EmagResult<EmagCategorie[]>;
  };

  return {
    citeste,
    cereri,
    incercari,
    get maximInDrum() { return maximInDrum; },
  };
}

const faraPauza = async () => {};

test("raftul eMAG: vine intreg, IN ORDINE, si se opreste la prima pagina scurta", async () => {
  const emag = eMagFals(2928);
  const r = await aduCategorii(AUTH, { citeste: emag.citeste, asteapta: faraPauza });

  assert.equal(r.error, null);
  assert.equal(r.trunchiat, false, "2.928 de categorii incap in 30 de pagini, sub plafonul de 60");
  assert.equal(r.categorii.length, 2928);
  assert.deepEqual(r.categorii.map((c) => c.id), Array.from({ length: 2928 }, (_, i) => i + 1),
    "paginile cerute deodata se asaza in ordinea lor, nu in cea in care au raspuns");
  assert.ok(Math.max(...emag.cereri) <= 30,
    "nu se cere nimic dupa valul in care a venit pagina scurta");
});

test("raftul eMAG: paginile vin CATE TREI deodata, nu una dupa alta si nici toate odata", async () => {
  /*
   * ⚠ Una dupa alta, 30 de pagini au facut ~45 s. Toate deodata ar fi trecut de cele 3
   * cereri pe secunda ale contului, iar cererile peste limita se numara si ele la eMAG.
   */
  const emag = eMagFals(1000, { intarziereMs: 15 });
  const r = await aduCategorii(AUTH, { citeste: emag.citeste, asteapta: faraPauza });

  assert.equal(r.categorii.length, 1000);
  assert.equal(emag.maximInDrum, 3, "trei cereri in drum deodata, nu mai multe");
});

test("raftul eMAG: un 502 pe o pagina se REIA, nu opreste tot raftul", async () => {
  /* Pagina 7 cade o data, apoi raspunde. Inainte, primul 502 intorcea eroare pe tot. */
  const emag = eMagFals(2928, { cade: (pagina, incercare) => (pagina === 7 && incercare === 1 ? "trecatoare" : null) });
  const pauze: number[] = [];
  const r = await aduCategorii(AUTH, {
    citeste: emag.citeste,
    asteapta: async (ms) => { pauze.push(ms); },
  });

  assert.equal(r.error, null);
  assert.equal(r.trunchiat, false);
  assert.equal(r.categorii.length, 2928);
  assert.equal(emag.incercari.get(7), 2, "pagina cazuta s-a cerut inca o data");
  assert.deepEqual(pauze, [1000], "cu o pauza scurta inaintea reluarii");
});

test("raftul eMAG: un 502 care tine se reia de DOUA ori, apoi se spune", async () => {
  const emag = eMagFals(2928, { cade: (pagina) => (pagina === 4 ? "trecatoare" : null) });
  const r = await aduCategorii(AUTH, { citeste: emag.citeste, asteapta: faraPauza });

  assert.equal(emag.incercari.get(4), 3, "o cerere si doua reluari");
  assert.equal(r.trunchiat, true, "lista fara pagina 4 nu e intreaga");
  assert.match(r.error ?? "", /502/);
});

test("raftul eMAG: un REFUZ nu se reia (cererile invalide se numara si ele la eMAG)", async () => {
  const emag = eMagFals(2928, { cade: (pagina) => (pagina === 1 ? "refuz" : null) });
  const r = await aduCategorii(AUTH, { citeste: emag.citeste, asteapta: faraPauza });

  assert.equal(emag.incercari.get(1), 1);
  assert.equal(r.trunchiat, true);
  assert.equal(r.categorii.length, 0);
  assert.ok(r.error);
});

test("raftul eMAG: peste termen nu se mai porneste nimic si se spune ca lista nu e intreaga", async () => {
  /*
   * ⚠ Actiunea ruleaza sub `maxDuration = 300`. Fara termen, o zi proasta la eMAG, cu
   * reluari pe fiecare pagina, ar fi taiat functia la jumatate, fara niciun mesaj.
   */
  let ceas = 0;
  const emag = eMagFals(5000);
  const citeste: NonNullable<UnelteCategorii["citeste"]> = async (auth, filtre) => {
    ceas += 20_000; // fiecare cerere „dureaza” 20 de secunde
    return emag.citeste(auth, filtre);
  };
  const r = await aduCategorii(AUTH, { citeste, asteapta: faraPauza, acum: () => ceas });

  assert.equal(r.trunchiat, true);
  assert.match(r.error ?? "", /foarte încet/);
  assert.ok(emag.cereri.length < 50, `s-a oprit la termen (${emag.cereri.length} cereri), nu la capatul celor 50 de pagini`);
});

test("raftul eMAG: in memorie intra doar id, nume, parinte si `is_allowed`", () => {
  const intregi = Array.from({ length: 300 }, (_, i) => categorie(i + 1));
  const usoare = categoriiPentruRaft(intregi);

  assert.deepEqual(Object.keys(usoare[0]).sort(), ["id", "is_allowed", "name", "parent_id"]);
  assert.deepEqual(categoriiIngaduite(usoare), categoriiIngaduite(intregi),
    "cautarea si sugestiile gasesc exact aceleasi categorii in forma usoara");
  assert.ok(JSON.stringify(usoare).length * 10 < JSON.stringify(intregi).length,
    "forma usoara e de cel putin zece ori mai mica");
});
