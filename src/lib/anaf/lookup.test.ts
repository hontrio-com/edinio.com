import assert from "node:assert/strict";
import { test } from "node:test";
import { mapAnafItem, clasificaLipsa, type AnafFoundItem } from "./lookup";

/**
 * Raspunsul de mai jos e captura REALA a lui webservicesp.anaf.ro v9 pentru CUI
 * 14399840, din 31.07.2026, cu campurile pastrate cum au venit.
 *
 * De ce e salvat aici. Numele campurilor ANAF sunt singura parte a fluxului pe
 * care nu o controlam si s-au schimbat deja o data: versiunea dinaintea acesteia
 * citea `dstrada` si `dnumar`, care NU EXISTA in v9 — de aceea autocompletarea
 * cadea mereu pe sirul brut din `date_generale.adresa`, cu tot cu judet si oras
 * inghesuite in campul de strada. Daca ANAF le mai schimba o data, testul asta
 * pica inainte sa iasa o factura gresita.
 */
const DANTE: AnafFoundItem = {
  date_generale: {
    cui: 14399840,
    denumire: "DANTE INTERNATIONAL SA",
    adresa: "MUNICIPIUL BUCUREŞTI, SECTOR 2, STR. GARA HERĂSTRĂU, NR.6, CLADIREA GLOBALWORTH SQUARE",
    codPostal: "",
    nrRegCom: "J2002000372404",
  },
  inregistrare_scop_Tva: { scpTVA: true },
  stare_inactiv: { statusInactivi: false },
  adresa_domiciliu_fiscal: {
    ddenumire_Localitate: "Sector 2 Mun. Bucureşti",
    ddenumire_Strada: "Str. Gara Herăstrău",
    dnumar_Strada: "6",
    ddenumire_Judet: "MUNICIPIUL BUCUREŞTI",
    ddetalii_Adresa: "Cladirea Globalworth Square",
    dcod_Postal: "",
  },
};

test("citeste denumirea, numarul de la reg. com. si statutul de TVA", () => {
  const c = mapAnafItem("14399840", DANTE);
  assert.ok(c);
  assert.equal(c.business_name, "DANTE INTERNATIONAL SA");
  assert.equal(c.reg_com, "J2002000372404");
  assert.equal(c.vat_payer, true);
  assert.equal(c.inactive, false);
});

test("nu dubleaza tipul arterei: ANAF il trimite deja inclus", () => {
  const c = mapAnafItem("14399840", DANTE);
  assert.ok(c);
  assert.equal(c.address, "Str. Gara Herăstrău nr. 6, Cladirea Globalworth Square");
  assert.ok(!c.address.includes("Str. Str."));
});

test("judetul ANAF ajunge in forma din lista formularului", () => {
  const c = mapAnafItem("14399840", DANTE);
  assert.ok(c);
  assert.equal(c.county, "Municipiul Bucuresti");
  assert.equal(c.city, "Sector 2 Mun. Bucureşti");
});

test("un neplatitor de TVA nu e raportat ca platitor", () => {
  const c = mapAnafItem("14399840", { ...DANTE, inregistrare_scop_Tva: { scpTVA: false } });
  assert.ok(c);
  assert.equal(c.vat_payer, false);
});

test("firma inactiva fiscal e semnalata", () => {
  const c = mapAnafItem("14399840", { ...DANTE, stare_inactiv: { statusInactivi: true } });
  assert.ok(c);
  assert.equal(c.inactive, true);
});

test("fara denumire nu se intoarce nimic", () => {
  assert.equal(mapAnafItem("14399840", { date_generale: { denumire: "  " } }), null);
  assert.equal(mapAnafItem("14399840", {}), null);
});

/**
 * Distinctia asta decide daca o comanda trece sau e refuzata: pe `not_found`
 * serverul respinge datele de firma cu un mesaj catre client, pe orice altceva le
 * pastreaza si doar le marcheaza neconfirmate. Confundate, un ANAF care raspunde
 * aiurea ar fi refuzat comenzi ale unor firme cat se poate de reale.
 */
test("negasit e un verdict doar cand ANAF chiar il rosteste", () => {
  assert.equal(clasificaLipsa("14399840", { notFound: [14399840] }), "not_found");
  assert.equal(clasificaLipsa("14399840", { found: [] }), "not_found");
  assert.equal(clasificaLipsa("14399840", { found: [], notFound: [14399840] }), "not_found");
});

test("un corp fara `found` nu e o confirmare, ci un raspuns necitibil", () => {
  // Corp de eroare al serviciului: are `cod`/`message`, n-are `found`.
  assert.equal(clasificaLipsa("14399840", { cod: 500, message: "Eroare interna" }), "unusable");
  assert.equal(clasificaLipsa("14399840", {}), "unusable");
  // `notFound` pentru ALT cod nu spune nimic despre al nostru.
  assert.equal(clasificaLipsa("14399840", { notFound: [2816464] }), "unusable");
});

test("forma veche, plata, inca merge", () => {
  const c = mapAnafItem("2816464", {
    denumire: "DEDEMAN SRL",
    adresa: "STR. ALEXEI TOLSTOI, NR. 4",
    judet: "BACAU",
    nrRegCom: "J04/2621/1992",
  });
  assert.ok(c);
  assert.equal(c.business_name, "DEDEMAN SRL");
  assert.equal(c.county, "Bacau");
  // Fara localitate proprie, judetul e mai bun decat un camp gol.
  assert.equal(c.city, "Bacau");
  assert.equal(c.address, "STR. ALEXEI TOLSTOI, NR. 4");
  // Lipsa blocului de TVA nu inseamna platitor.
  assert.equal(c.vat_payer, false);
});
