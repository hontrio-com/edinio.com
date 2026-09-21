import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/*
 * FIECARE RUTA DE ETICHETA TRECE PRIN ACEEASI POARTA.
 *
 * ⚠ ASTA E PARTEA CARE CHIAR APARA. Poarta e o functie de doua randuri; ce conteaza
 * e ca toate rutele o cheama. Pana pe 13.09.2026 o chema UNA SINGURA din opt, cea de
 * la FAN Courier, iar celelalte sapte serveau etichete mai departe unui magazin cu
 * abonamentul expirat. Nu se vedea de nicaieri: fiecare ruta e un fisier separat, si
 * nimic nu le confrunta intre ele.
 *
 * ⚠ SE NUMARA SI RUTELE. Fara asta, o redenumire de dosar (sau un regex care nu mai
 * potriveste nimic) ar face proba sa treaca peste ZERO rute si sa iasa verde, adica
 * exact tiparul „proba care nu poate cadea".
 */

const RADACINA = "src/app/api";

/**
 * Rutele care servesc etichete.
 *
 * ⚠ SI CELE CARE NU SE CHEAMA „awb". Pana pe 21.09.2026 lista era doar
 * `<furnizor>/awb/route.ts`, iar in ziua aia s-au adaugat doua rute de eticheta care
 * nu se potrivesc tiparului: `pallex/document` (eticheta SI avizul) si `etichete`
 * (lotul, toate comenzile alese intr-un singur PDF). Amandoua cheama API-ul
 * curierului cu credentialele comerciantului, exact ca celelalte, deci amandoua au
 * nevoie de aceeasi poarta — si niciuna n-ar fi fost vazuta de plasa asta.
 *
 * ⚠ Cele din afara tiparului se scriu pe nume, DINADINS: o cautare mai larga (orice
 * ruta care importa `raspunsEticheta`) ar fi tacut tocmai cand cineva scrie una fara
 * niciunul dintre semnele cautate.
 */
const IN_AFARA_TIPARULUI = ["pallex/document", "etichete"];

function ruteDeEticheta(): { furnizor: string; cale: string }[] {
  const dinTipar = readdirSync(RADACINA, { withFileTypes: true })
    .filter((x) => x.isDirectory())
    .map((x) => ({ furnizor: x.name, cale: `${RADACINA}/${x.name}/awb/route.ts` }));

  return [
    ...dinTipar,
    ...IN_AFARA_TIPARULUI.map((p) => ({ furnizor: p, cale: `${RADACINA}/${p}/route.ts` })),
  ].filter((r) => {
    try { readFileSync(r.cale, "utf8"); return true; } catch { return false; }
  });
}

test("⚠ fiecare ruta de eticheta cheama poarta de abonament", () => {
  const rute = ruteDeEticheta();

  assert.ok(
    rute.length >= 10,
    `gasite doar ${rute.length} rute de eticheta: plasa n-are pe cine cadea`,
  );

  const fara: string[] = [];
  for (const { furnizor, cale } of rute) {
    const sursa = readFileSync(cale, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

    const cheama = /await poartaEtichetei\(businessId\)/.test(sursa)
      && /from "@\/lib\/orders\/poarta-eticheta"/.test(sursa);
    if (!cheama) fara.push(furnizor);
  }

  assert.deepEqual(
    fara,
    [],
    "rute de eticheta care servesc mai departe unui cont inactiv: "
    + `${fara.join(", ")}. Vezi src/lib/orders/poarta-eticheta.ts`,
  );
});

test("⚠ poarta se cheama DUPA dovedirea proprietatii, nu inaintea ei", () => {
  /*
   * `businessId` vine din adresa. Chemata inaintea verificarii, poarta ar citi starea
   * contului altcuiva si ar raspunde despre el: un refuz de 402 pe un id strain spune
   * ca acel magazin exista si ca abonamentul lui a expirat.
   */
  for (const { furnizor, cale } of ruteDeEticheta()) {
    const sursa = readFileSync(cale, "utf8");
    const proprietate = sursa.indexOf('.from("businesses")');
    const poarta = sursa.indexOf("await poartaEtichetei(businessId)");
    assert.ok(proprietate > 0, `${furnizor}: ruta nu mai verifica proprietatea magazinului`);
    assert.ok(poarta > 0, `${furnizor}: ruta nu mai cheama poarta`);
    assert.ok(
      poarta > proprietate,
      `${furnizor}: poarta de abonament se cheama INAINTE de a sti ca magazinul e al celui logat`,
    );
  }
});
