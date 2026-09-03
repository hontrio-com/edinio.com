import { strict as assert } from "node:assert";
import { test } from "node:test";
import { destulDinSectiune } from "./sectiune-vazuta";

test("⚠ o sectiune mai inalta decat doua ecrane SE POATE vedea", () => {
  /*
    ═══ ⚠ DEFECTUL PE CARE IL INCHIDE, in cifre ═══

    Forma veche cerea 50% din SECTIUNE. Pentru 2400px pe un ecran de 800px,
    maximul vizibil deodata e 800/2400 = 33%. Deci pragul nu se atingea niciodata,
    iar `section_view` nu se tragea pentru sectiunile lungi — exact cele care
    conteaza. Masurat pe `/preturi`: `comparatie` are 1152px la 1920px latime; pe
    telefon, unde tabelul se stivuieste, trece lesne de doua ecrane.
  */
  const ecran = 800;
  const sectiune = 2400;
  const maximPosibil = ecran; /* mai mult de-atat nu incape pe ecran */

  assert.ok(maximPosibil / sectiune < 0.5, "sectiunea de proba nu mai e „imposibila\" pentru pragul vechi");
  assert.equal(destulDinSectiune({ vizibil: maximPosibil, sectiune, ecran }), true,
    "o sectiune lunga umplut tot ecranul si tot nu se socoteste vazuta");
  assert.equal(destulDinSectiune({ vizibil: ecran / 2, sectiune, ecran }), true,
    "jumatate de ecran umplut de sectiune nu se socoteste vazuta");
});

test("⚠ si o sectiune SCURTA cere in continuare jumatate din ea", () => {
  /*
    ⚠ JUMATATEA CARE TINE REGULA CINSTITA. Fara ea, „vizibil >= jumatate de ecran"
    ar fi facut ca o sectiune de 200px sa nu se poata numara niciodata, iar
    „vizibil > 0" ar fi numarat o derulare in fuga peste marginea de sus.
  */
  const ecran = 800;
  assert.equal(destulDinSectiune({ vizibil: 199, sectiune: 400, ecran }), false, "sub jumatate s-a numarat");
  assert.equal(destulDinSectiune({ vizibil: 200, sectiune: 400, ecran }), true, "exact jumatate nu s-a numarat");
  assert.equal(destulDinSectiune({ vizibil: 1, sectiune: 400, ecran }), false, "un pixel a trecut drept vazut");
});

test("o sectiune cat ecranul se poarta la fel in amandoua regulile", () => {
  const ecran = 800;
  assert.equal(destulDinSectiune({ vizibil: 399, sectiune: 800, ecran }), false);
  assert.equal(destulDinSectiune({ vizibil: 400, sectiune: 800, ecran }), true);
});

test("masuri fara sens nu produc o vizualizare", () => {
  /* ⚠ La montare, inainte de asezare, inaltimile pot fi zero. Zero nu e „vazut". */
  assert.equal(destulDinSectiune({ vizibil: 0, sectiune: 0, ecran: 800 }), false);
  assert.equal(destulDinSectiune({ vizibil: 100, sectiune: 400, ecran: 0 }), false);
});
