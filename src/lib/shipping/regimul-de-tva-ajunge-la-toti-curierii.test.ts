import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pretCuTva } from "@/lib/innoship/preturi";
import { ofertePosibile as oferteEcolet } from "@/lib/ecolet/preturi";

/**
 * REGIMUL DE TVA E AL MAGAZINULUI, SI AJUNGE LA TOTI CURIERII.
 *
 * ═══ ⚠ CE S-A INCHIS (13.09.2026) ═══
 *
 * `tvaPeDeasupra` exista de la reparatia FAN, dar era declarat INAUNTRUL ramurii FAN.
 * Deci doar FAN il respecta. Ceilalti opt curieri impingeau pretul intors de furnizor
 * asa cum vine, iar pe un magazin cu preturi FARA TVA (`vat_enabled` adevarat SI
 * `prices_include_vat` fals) transportul intra apoi in `vatBase`, si `computeVat` ii
 * mai adauga o data cota peste una deja inclusa in pret.
 *
 * La FAN erau 31,17 facuti 37,09. Aceeasi socoteala se intampla si azi la Cargus
 * (`GrandTotal`), DPD intern (`price.total`), Woot (`final_total`), Colete
 * (`price.total`), eColet (`prices_gross`), Innoship (`rateTotalAmount`) si SmartShip
 * (`cost`). Sapte furnizori care intorc pret CU TVA, verificat in documentatia fiecaruia
 * acolo unde exista.
 *
 * Shipo, UPS, DHL si FedEx nu intra: la ei regimul atarna de contract si nu se poate
 * sti static, deci acolo nu s-a atins nimic.
 *
 * ═══ ⚠ DE CE PARTEA A DOUA CITESTE SURSA, SI DE CE NU SE POATE ALTFEL ═══
 *
 * `pretWoot`, `buildColeteOptions`, `buildWootOptions` si celelalte stau in
 * `shipping.actions.ts`, care e un fisier `"use server"`. Acolo FIECARE export devine
 * o actiune de server chemabila din browser (vezi memoria `use-server-expune-fiecare-export`).
 * Exportate ca sa le pot proba pur, ar deveni suprafata publica. Deci regula lor se
 * probeaza pe sursa, ca la vecina despre tariful FAN.
 *
 * Cele DOUA care se pot proba cu adevarat pur o si sunt, mai jos, pe numere: `pretCuTva`
 * (Innoship) si `ofertePosibile` (eColet) stau in fisiere proprii, fara `"use server"`.
 *
 * ⚠ MUTANTUL SE PUNE PE APELANT: scotand `tvaPeDeasupra` din oricare dintre cele cinci
 * apeluri `build*Options(...)` din `shipping.actions.ts`, sau intorcand `q.price` in locul
 * lui `q.priceNoVat` la DPD ori Cargus, probele din partea a doua cad.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   1. REGULA, PE NUMERE: cele doua ajutoare care chiar se pot importa
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ Cotatia are TVA de 19%, magazinul e pe 21%. Nepotrivirea e dinadins: ea e chiar
 * motivul pentru care netul nu se deduce niciodata din brut.
 */
const OFERTA_INNOSHIP = {
  carrierId: 7,
  serviceId: 12,
  carrier: "Cargus",
  service: "Standard",
  rateAmount: 20,
  rateVatAmount: 3.8,
  rateTotalAmount: 23.8,
  rateCurrency: "RON",
};

test("⚠ Innoship: regimul alege campul, si netul nu se deduce NICIODATA", () => {
  /* Implicit si explicit, regimul brut ia totalul lor: asa arata azi aproape toate magazinele. */
  assert.equal(pretCuTva(OFERTA_INNOSHIP), 23.8, "fara argument, se ia `rateTotalAmount`");
  assert.equal(pretCuTva(OFERTA_INNOSHIP, false), 23.8);

  /* Pe regim net se ia netul LOR, nu unul calculat de noi. */
  assert.equal(pretCuTva(OFERTA_INNOSHIP, true), 20, "pe regim net se ia `rateAmount`");

  /*
   * ⚠ MUTANTUL, adica leacul care pare evident: „daca lipseste netul, imparte brutul la
   * cota". Magazinul e pe 21%, deci deducerea da 19,67, nu 20.
   *
   * ⚠ Si nu se vede din totalul platit de cumparator: 19,67 cu 21% peste da tot 23,80.
   * Ce se strica sunt CELE DOUA RANDURI DIN ACTE: venitul din transport si TVA-ul pe el
   * pleaca amandoua gresite (19,67 + 4,13 in loc de 20,00 + 3,80), la fiecare comanda, si
   * nimic nu se plange. De aia lipsa netului inseamna „nu stim", nu „aproximeaza".
   */
  const dedus = Math.round((23.8 / 1.21) * 100) / 100;
  assert.equal(dedus, 19.67);
  assert.notEqual(dedus, 20,
    "cota curierului nu e cota magazinului: netul dedus nu e netul furnizorului");

  /* Deci pe regim net, fara netul lor, oferta se arunca. Apelantul cade pe tariful zonei. */
  assert.equal(pretCuTva({ ...OFERTA_INNOSHIP, rateAmount: undefined }, true), null,
    "pe regim net, lipsa netului trebuie sa dea `null`, nu un numar ghicit");
  /* Perechea, ca afirmatia de mai sus sa nu treaca din intamplare: pe regim brut, aceeasi oferta merge. */
  assert.equal(pretCuTva({ ...OFERTA_INNOSHIP, rateAmount: undefined }, false), 23.8);
});

/** ⚠ Forma intreaga a lui `ServiciuEcolet`: catalogul lor poarta si ids, si starea curierului. */
const CATALOG_ECOLET = [
  {
    id: 11,
    slug: "dpd-standard",
    name: "Standard",
    full_name: "DPD Standard",
    status: true,
    courier: { id: 3, slug: "dpd", name: "DPD", status: true },
  },
];

/** ⚠ Preturile eColet vin ca SIRURI, cu virgula zecimala. Vezi `parseazaPretRo`. */
function raspunsEcolet(preturi: { brut?: Record<string, string>; net?: Record<string, string> }) {
  return {
    form: {
      errors: {},
      statuses: { "dpd-standard": true },
      prices_gross: preturi.brut,
      prices_net: preturi.net,
      additional_services: { "dpd-standard": { cod: true } },
    },
  };
}

test("⚠ eColet: pe regim net se citeste `prices_net`, iar lipsa lui ARUNCA oferta", () => {
  const amandoua = raspunsEcolet({ brut: { "dpd-standard": "23,80" }, net: { "dpd-standard": "20,00" } });

  assert.equal(oferteEcolet(amandoua, CATALOG_ECOLET)[0].pret, 23.8, "implicit, `prices_gross`");
  assert.equal(oferteEcolet(amandoua, CATALOG_ECOLET, undefined, false)[0].pret, 23.8);
  assert.equal(oferteEcolet(amandoua, CATALOG_ECOLET, undefined, true)[0].pret, 20, "pe regim net, `prices_net`");

  /*
   * ⚠ Cazul ASTA e drumul asteptat, nu exceptia: in depozit nu exista niciun raspuns real
   * cu `prices_net` populat. Pe regim net, oferta pica la filtrul de pret si comerciantul
   * ramane pe tariful fix al zonei. Mai bine tariful lui decat un pret cu 19% prea mare.
   */
  const doarBrut = raspunsEcolet({ brut: { "dpd-standard": "23,80" } });
  assert.equal(oferteEcolet(doarBrut, CATALOG_ECOLET, undefined, true).length, 0,
    "fara `prices_net`, pe regim net oferta trebuie sa dispara, nu sa cada pe brut");
  /* Perechea: acelasi raspuns pe regim brut da o oferta. Fara ea, afirmatia de sus ar putea trece degeaba. */
  assert.equal(oferteEcolet(doarBrut, CATALOG_ECOLET, undefined, false).length, 1,
    "pe regim brut acelasi raspuns TREBUIE sa dea o oferta, altfel proba de mai sus nu inseamna nimic");
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. CABLAREA: regimul chiar ajunge la fiecare curier
   ═══════════════════════════════════════════════════════════════════════════ */

const RAD = process.cwd();

/** ⚠ Comentariile se taie: fisierul isi explica pe larg propriile reguli. */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const COTARE = "src/lib/actions/shipping.actions.ts";

test("⚠ regimul se calculeaza DEASUPRA buclei de curieri, nu intr-o ramura", () => {
  /*
   * Aici statea defectul: declarat in ramura FAN, steagul era invizibil pentru ceilalti opt.
   * Regula e de POZITIE, deci se probeaza pe pozitie.
   */
  const s = sursa(COTARE);
  const declarat = s.indexOf("const tvaPeDeasupra =");
  const bucla = s.indexOf("for (const [courierId, zone] of enabledZones) {");

  assert.ok(declarat > 0, "nu se mai calculeaza regimul de TVA al magazinului");
  assert.ok(bucla > 0, "nu mai exista bucla de curieri: proba n-are pe ce cadea");
  assert.ok(declarat < bucla,
    "`tvaPeDeasupra` a recazut in interiorul buclei: ceilalti curieri nu-l mai vad");
});

test("⚠ toti cei cinci constructori de oferte PRIMESC regimul", () => {
  const s = sursa(COTARE);

  /*
   * Woot, Colete, eColet, Innoship, SmartShip. Se numara APELURILE, nu declaratiile: un
   * parametru cu implicit `false` declarat si nepasat e exact defectul dinainte, doar ca
   * scris mai frumos.
   */
  const apeluri = s.match(/build[A-Za-z]+Options\(.*tvaPeDeasupra\)/g) ?? [];
  assert.equal(apeluri.length, 5,
    `doar ${apeluri.length} din 5 constructori mai primesc regimul: ${apeluri.join(" | ")}`);

  /* Si fiecare il declara, altfel apelul de mai sus n-ar avea unde sa ajunga. */
  const declaratii = s.match(/tvaPeDeasupra = false,/g) ?? [];
  assert.ok(declaratii.length >= 5,
    `doar ${declaratii.length} constructori declara parametrul de regim`);
});

test("⚠ DPD si Cargus aleg `priceNoVat`, si lipsa lui nu se deduce", () => {
  const s = sursa(COTARE);

  /*
   * Amandoi intorc acum doua numere din acelasi raspuns (`GrandTotal`/`Subtotal` la Cargus,
   * `price.total`/`price.amount` la DPD). Alegerea o face APELANTUL, fiindca biblioteca nu
   * stie regimul magazinului.
   */
  const alegeri = s.match(/tvaPeDeasupra \? q\.priceNoVat : q\.price/g) ?? [];
  assert.equal(alegeri.length, 2,
    "DPD si Cargus nu mai aleg amandoi intre net si brut dupa regimul magazinului");

  /*
   * `priceNoVat` poate fi `null`, si atunci se cade pe tariful zonei. Ce NU are voie sa se
   * intample e sa se strecoare brutul in locul netului lipsa.
   */
  assert.doesNotMatch(s, /priceNoVat \?\? q\.price/,
    "netul lipsa cade inapoi pe brut: pe regim net, cota s-ar adauga a doua oara");
});

test("⚠ nicaieri in cotare netul nu se deduce impartind la cota", () => {
  const s = sursa(COTARE);
  /* Ancora pozitiva, ca afirmatia negativa de mai jos sa nu treaca pe un fisier gol. */
  assert.match(s, /tvaPeDeasupra/, "fisierul nu mai stie de regim: negatia de mai jos n-ar insemna nimic");
  assert.doesNotMatch(s, /\/\s*\(1\s*\+\s*[^)]*(?:vat|tva|cota)/i,
    "s-a intors deducerea netului din brut prin impartire la cota");
});

test("⚠ cand netul e NECREDIBIL, oferta se arunca la toti trei", () => {
  const s = sursa(COTARE);

  /* Woot: cele trei numere finale trebuie sa se lege intre ele. */
  assert.match(s, /Math\.abs\(net \+ tva - brut\) <= 0\.01/,
    "Woot nu mai verifica `final_price + final_tax = final_total`");

  /* Colete: `price.noVat` e declarat neoptional in tipul nostru, dar tipul e scris de mana. */
  assert.match(s, /net > item\.price\.total\) return \[\];/,
    "Colete nu mai arunca oferta cand netul intors nu e credibil");

  /* SmartShip: `pretFaraTva` e deja normalizat, dar poate lipsi. */
  assert.match(s, /if \(tvaPeDeasupra && o\.pretFaraTva === null\) return \[\];/,
    "SmartShip nu mai arunca ofertele cand netul lipseste pe regim net");
});

test("⚠ tariful fix al zonei NU se atinge de nicio conversie", () => {
  /*
   * `zone.price` e numarul scris de comerciant in Setari, deci e deja in regimul
   * magazinului. Orice ajustare peste el ar fi a doua aplicare a cotei, exact pe drumul
   * de rezerva pe care cad toti curierii cand cotarea nu iese.
   */
  const s = sursa(COTARE);
  assert.match(s, /price: zone\.price/, "nu mai exista rezerva pe tariful zonei");
  assert.doesNotMatch(s, /zone\.price[^;\n]*tvaPeDeasupra/,
    "tariful din Setari a intrat intr-o socoteala de TVA: el e deja in regimul magazinului");
});
