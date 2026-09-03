import { strict as assert } from "node:assert";
import { test } from "node:test";
import { destulDinSectiune, pragulSectiunii } from "./sectiune-vazuta";

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

test("⚠ pragul e ATINGIBIL, altfel regula nu se executa niciodata", () => {
  /*
    ═══ ⚠ SCAPAREA DIN PRIMA MEA REPARATIE ═══

    Regula (`destulDinSectiune`) era dreapta, dar ea se cheama numai cand
    `IntersectionObserver` ne trezeste — iar el trezeste la TRAVERSAREA unui prag.
    Cu o lista fixa `[0, 0.25, 0.5, 0.75]`, o sectiune de 5000px pe un ecran de
    800px ajunge cel mult la raportul 800/5000 = 0,16: traverseaza `0` la primul
    pixel, cand inca nu s-a vazut destul, si apoi NICIUN alt prag.

    Deci callback-ul nu mai venea, iar `section_view` tot nu se tragea — reparasem
    aritmetica si lasasem declansatorul stricat. Proba veche nu vedea asta: ea
    intreba doar „daca ii dau 400px, raspunde da?".
  */
  const ecran = 800;

  for (const sectiune of [1200, 2400, 5000, 12000]) {
    const prag = pragulSectiunii(sectiune, ecran);
    const maximPosibil = Math.min(1, ecran / sectiune);
    assert.ok(prag <= maximPosibil,
      `sectiune de ${sectiune}px: pragul ${prag} nu poate fi atins niciodata (maxim ${maximPosibil})`);

    /* ⚠ Si ca pragul cade CHIAR pe clipa in care regula devine adevarata. */
    const vizibilLaPrag = prag * sectiune;
    assert.equal(destulDinSectiune({ vizibil: vizibilLaPrag, sectiune, ecran }), true,
      `sectiune de ${sectiune}px: la prag inca nu se socoteste vazuta`);
  }
});

test("pentru o sectiune scurta, pragul ramane jumatate din ea", () => {
  /* ⚠ Martorul: leacul n-avea voie sa slabeasca cerinta acolo unde era buna. */
  assert.equal(pragulSectiunii(400, 800), 0.5);
  assert.equal(pragulSectiunii(800, 800), 0.5);
});

test("masuri fara sens nu produc un prag imposibil", () => {
  assert.equal(pragulSectiunii(0, 800), 0);
  assert.equal(pragulSectiunii(400, 0), 0);
  assert.ok(pragulSectiunii(1_000_000, 800) > 0, "un prag de zero ne-ar trezi la primul pixel");
});
