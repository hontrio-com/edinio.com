import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { LIMITE_EMAG, partNumberPreaLung, plafonat, taiat } from "./limite";

/*
 * ═══ LIMITELE LOR, PROBATE — ȘI VERIFICATE CĂ SUNT CHIAR ALE LOR ═══
 *
 * Auditul din 24.08.2026 a citit OpenAPI-ul eMAG v4.5.1 câmp cu câmp și a găsit cinci
 * pe care le trimiteam fără nicio pază. Niciunul nu lovise încă acest comerciant — dar
 * niciunul n-ar fi dat o eroare pe care s-o putem citi: eMAG refuză oferta întreagă.
 */

test("eMAG limite: cantitățile se plafonează, nu se refuză", () => {
  /* ⚠ Un depozit cu 70.000 de bucăți e o veste bună, nu o eroare. Refuzat, produsul
     n-ar mai fi fost publicat deloc; plafonat, se vinde. */
  assert.equal(plafonat(70000, LIMITE_EMAG.stoc), 65535);
  assert.equal(plafonat(12, LIMITE_EMAG.stoc), 12);
});

test("eMAG limite: un stoc stricat devine 0, nu NaN", () => {
  /* ⚠ Trecut mai departe, `NaN` iese din JSON ca `null` pe un câmp obligatoriu, iar
     eMAG refuză oferta cu un mesaj despre altceva. */
  assert.equal(plafonat(Number.NaN, LIMITE_EMAG.stoc), 0);
  assert.equal(plafonat(-5, LIMITE_EMAG.stoc), 0);
  assert.equal(plafonat(3.9, LIMITE_EMAG.stoc), 3, "bucăți întregi, rotunjite în jos");
});

test("eMAG limite: descrierile se taie", () => {
  assert.equal(taiat("a".repeat(300), LIMITE_EMAG.valoareCaracteristica).length, 255);
  assert.equal(taiat(null, LIMITE_EMAG.nume), "");
});

test("eMAG limite: `part_number` NU se taie — se refuză", () => {
  /*
   * ⚠ CEA MAI IMPORTANTĂ DINTRE CELE TREI PURTĂRI.
   *
   * Un SKU tăiat nu e un SKU mai scurt, e ALT SKU. Trimis, ar lega oferta de alt
   * produs din catalogul lor sau ar face un duplicat — fără nicio eroare, fiindcă e un
   * cod valid. Exact felul de greșeală care se află de la client, peste o lună.
   */
  assert.equal(partNumberPreaLung("A".repeat(26)), true);
  assert.equal(partNumberPreaLung("A".repeat(25)), false);
});

test("eMAG limite: valorile sunt chiar cele din OpenAPI-ul lor", () => {
  /*
   * ⚠ Proba care leagă fișierul de sursa adevărului. Fără ea, cineva poate „relaxa" o
   * limită ca să treacă un produs, iar eMAG ar refuza oferta în continuare — dar acum
   * și cu paza noastră stinsă, deci fără niciun mesaj în română.
   *
   * Numerele sunt citate în comentariile din `limite.ts`; aici se verifică doar că
   * n-au fost schimbate pe furiș.
   */
  assert.deepEqual(
    {
      nume: LIMITE_EMAG.nume,
      partNumber: LIMITE_EMAG.partNumber,
      valoareCaracteristica: LIMITE_EMAG.valoareCaracteristica,
      stoc: LIMITE_EMAG.stoc,
      zilePregatire: LIMITE_EMAG.zilePregatire,
      garantie: LIMITE_EMAG.garantie,
      adresa: LIMITE_EMAG.adresa,
    },
    { nume: 255, partNumber: 25, valoareCaracteristica: 255, stoc: 65535, zilePregatire: 255, garantie: 255, adresa: 1024 },
  );
});

test("eMAG limite: nicio limită nu mai e scrisă de mână în cartografiere", () => {
  /*
   * ⚠ Proba care închide gaura de fond. Înainte, `name` avea `.slice(0, 255)` scris
   * direct, iar `characteristics.value` n-avea nimic — și nimic nu arăta diferența.
   * Numerele împrăștiate se pierd; unul singur, citat, nu.
   */
  for (const cale of ["src/lib/emag/mapping.ts", "src/lib/emag/caracteristici.ts"]) {
    const sursa = readFileSync(cale, "utf8");
    /* Numai in COD: comentariile chiar trebuie sa citeze numarul din schema lor. */
    const coduri = sursa.split(String.fromCharCode(10)).filter((l) => !l.trimStart().startsWith("*") && !l.trimStart().startsWith("/*"));
    for (const forma of ["slice(0, 255)", "slice(0,255)", "Math.min(65535", "Math.min(255", "slice(0, 1024)"]) {
      const linia = coduri.find((l) => l.includes(forma));
      assert.equal(linia, undefined, `${cale} scrie „${forma}" de mana; ia limita din LIMITE_EMAG`);
    }
  }
});
