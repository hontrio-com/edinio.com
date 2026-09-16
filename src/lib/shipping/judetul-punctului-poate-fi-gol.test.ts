import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { destinatarulLaPunct } from "@/lib/shipping/punctul-de-pe-comanda";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * JUDETUL PUNCTULUI POATE FI GOL, SI STERGEA JUDETUL OMULUI   (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La emitere, Sameday si DPD suprascriu destinatarul de pe AWB cu `locker_city` si
 * `locker_county`. Cand punctul n-are judet, suprascrierea stergea judetul BUN al
 * cumparatorului si punea un sir gol in locul lui.
 *
 * ⚠ MASURAT, SI NU E O IPOTEZA. Din cele sase comenzi cu punct de ridicare din toata istoria
 * platformei, una singura a primit vreodata un AWB: `#0011`, 08.08.2026, punctul
 * „PASCANI - STEFAN CEL MARE 2 (DPD SHOP)", DPD `81343890397`, livrata. Si exact aceea are
 * `locker_county` gol. Adica singura expediere reala la punct a plecat chiar asa.
 *
 * A ajuns fiindca la DPD `pickupOfficeId` hotaraste destinatia, nu adresa. La Sameday, unde
 * judetul intra in adresa destinatarului, norocul acela nu exista.
 *
 * ⚠⚠ SI DE CE NU ERA DE AJUNS `??`, care parea sa fie plasa: DPD avea deja
 * `shipping.locker_county ?? input.recipientCounty`. Dar `??` raspunde numai la `null` si
 * `undefined`, iar valoarea masurata e SIRUL GOL — pe care il lasa sa treaca intact. O plasa
 * care nu prinde singurul caz real nu e o plasa.
 */

describe("`destinatarulLaPunct`: golul nu inlocuieste nimic", () => {
  const OM = { oras: "Pascani", judet: "Iasi" };

  test("punctul cu localitate intreaga hotaraste, ca pana acum", () => {
    const d = destinatarulLaPunct({ oras: "Cluj-Napoca", judet: "Cluj" }, OM);
    assert.deepEqual(d, { oras: "Cluj-Napoca", judet: "Cluj" });
  });

  test("⚠⚠ judetul GOL al punctului nu-l mai sterge pe al omului", () => {
    /* Chiar cazul masurat: `#0011`, PASCANI, `locker_county` = "". */
    const d = destinatarulLaPunct({ oras: "PASCANI", judet: "" }, OM);
    assert.equal(d.oras, "PASCANI", "orasul punctului trebuie sa ramana al punctului");
    assert.equal(d.judet, "Iasi", "judetul gol a sters judetul cumparatorului");
  });

  test("⚠ si `null`, si `undefined`, si spatiile goale inseamna acelasi lucru", () => {
    for (const gol of [null, undefined, "", "   ", "\t"]) {
      const d = destinatarulLaPunct({ oras: "PASCANI", judet: gol }, OM);
      assert.equal(d.judet, "Iasi", `judetul ${JSON.stringify(gol)} a trecut drept judet`);
    }
  });

  test("la fel si pentru oras", () => {
    const d = destinatarulLaPunct({ oras: "  ", judet: "Iasi" }, OM);
    assert.equal(d.oras, "Pascani");
  });

  test("⚠ cand nici punctul, nici omul n-au nimic, iese GOL — nu se inventeaza", () => {
    const d = destinatarulLaPunct({ oras: "", judet: "" }, { oras: "", judet: null });
    assert.deepEqual(d, { oras: "", judet: "" });
  });
});

describe("⚠ si amandoi curierii care suprascriu destinatarul chiar o folosesc", () => {
  /*
   * Regula e a DOI furnizori, deci plasa nu se pune in fisierul unuia. Iar `??` a ramas afara
   * dinadins: repus, ar trece iar peste sirul gol si singurul caz real ar scapa din nou.
   */
  const sursa = (c: string) => readFileSync(c, "utf8").replace(/\r\n/g, "\n");
  const CURIERI = [
    { nume: "Sameday", cale: "src/lib/actions/sameday.actions.ts" },
    { nume: "DPD", cale: "src/lib/actions/dpd.actions.ts" },
  ];

  for (const { nume, cale } of CURIERI) {
    test(`${nume} trece prin \`destinatarulLaPunct\``, () => {
      const s = sursa(cale);
      assert.match(s, /destinatarulLaPunct\(/, `${nume} nu mai foloseste plasa comuna`);
      assert.match(
        s, /destinatarPunct\.(oras|judet)/,
        `${nume} nu mai scrie rezultatul plasei in cererea catre curier`,
      );
    });

    test(`${nume} NU mai citeste direct \`locker_county\` la destinatar`, () => {
      /* Codul strict: `locker_county` mai poate aparea la citirea din comanda, dar nu langa
         campul care pleaca spre ei. */
      const s = sursa(cale).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
      assert.ok(
        !/(?:county|recipientCounty):\s*shipping\.locker_county/.test(s),
        `${nume}: judetul punctului pleaca iar direct, gol cu tot`,
      );
      assert.ok(
        !/locker_county\s*\?\?/.test(s),
        `${nume}: a revenit \`??\`, care nu prinde sirul gol`,
      );
    });
  }
});
