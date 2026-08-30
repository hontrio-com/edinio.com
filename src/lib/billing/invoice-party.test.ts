import assert from "node:assert/strict";
import { test } from "node:test";
import { invoiceParty } from "./invoice-party";
import { parseBillingCompany, readBillingCompany } from "./company";

/**
 * Cei trei furnizori de facturare aveau persoana fizica scrisa in cod, fiecare in
 * felul lui. Testele astea apara singurul loc din care isi iau acum clientul:
 * cine e titularul, ce cod fiscal poarta si — cel mai important — ca numele
 * persoanei de contact NU e inlocuit de denumirea firmei nicaieri altundeva.
 */

const LIVRARE = { address: "Str. Livrarii nr. 5", city: "Cluj-Napoca", county: "Cluj" };

const FIRMA = {
  cui: "14399840",
  company_name: "SC Exemplu SRL",
  reg_com: "J40/1234/2020",
  address: "Bd. Sediului nr. 1",
  city: "Sector 1",
  county: "Municipiul Bucuresti",
  vat_payer: true,
  verified: true,
  inactive: false,
};

test("persoana fizica: exact ce se trimitea si inainte", () => {
  const p = invoiceParty({ customer_name: "Ion Popescu" }, LIVRARE);
  assert.equal(p.isCompany, false);
  assert.equal(p.name, "Ion Popescu");
  assert.equal(p.vatCode, null);
  assert.equal(p.vatPayer, false);
  assert.equal(p.city, "Cluj-Napoca");
});

test("firma: titularul e denumirea, nu persoana de contact", () => {
  const p = invoiceParty({ customer_name: "Ion Popescu", billing_company: FIRMA }, LIVRARE);
  assert.equal(p.isCompany, true);
  assert.equal(p.name, "SC Exemplu SRL");
  assert.equal(p.regCom, "J40/1234/2020");
});

test("prefixul RO apare doar la platitorii de TVA", () => {
  const platitor = invoiceParty({ customer_name: "X", billing_company: FIRMA }, LIVRARE);
  assert.equal(platitor.vatCode, "RO14399840");
  assert.equal(platitor.vatPayer, true);

  const neplatitor = invoiceParty(
    { customer_name: "X", billing_company: { ...FIRMA, vat_payer: false } },
    LIVRARE
  );
  assert.equal(neplatitor.vatCode, "14399840");
  assert.equal(neplatitor.vatPayer, false);
});

test("pe factura merge sediul fiscal, nu adresa de livrare", () => {
  const p = invoiceParty({ customer_name: "X", billing_company: FIRMA }, LIVRARE);
  assert.equal(p.address, "Bd. Sediului nr. 1");
  assert.equal(p.city, "Sector 1");
  assert.equal(p.county, "Municipiul Bucuresti");
});

test("fara sediu completat, se cade pe adresa de livrare in loc de campuri goale", () => {
  const p = invoiceParty(
    { customer_name: "X", billing_company: { ...FIRMA, address: "", city: "", county: "" } },
    LIVRARE
  );
  assert.equal(p.address, "Str. Livrarii nr. 5");
  assert.equal(p.city, "Cluj-Napoca");
});

test("un bloc de firma invalid e ignorat: comanda ramane pe persoana fizica", () => {
  // CUI cu o cifra schimbata.
  const cuiGresit = invoiceParty(
    { customer_name: "Ion Popescu", billing_company: { ...FIRMA, cui: "14399841" } },
    LIVRARE
  );
  assert.equal(cuiGresit.isCompany, false);
  assert.equal(cuiGresit.name, "Ion Popescu");

  // Fara denumire nu se poate emite nimic pe firma.
  const faraDenumire = invoiceParty(
    { customer_name: "Ion Popescu", billing_company: { ...FIRMA, company_name: "" } },
    LIVRARE
  );
  assert.equal(faraDenumire.isCompany, false);
});

test("parseBillingCompany nu crede clientul pe cuvant", () => {
  assert.equal(parseBillingCompany(null), null);
  assert.equal(parseBillingCompany("SC Exemplu SRL"), null);
  assert.equal(parseBillingCompany({ cui: "0000000000000", company_name: "X" }), null);

  const curatat = parseBillingCompany({
    cui: " RO 14.399.840 ",
    company_name: "  SC Exemplu SRL  ",
    reg_com: " J40/1234/2020 ",
    vat_payer: "da",
  });
  assert.ok(curatat);
  assert.equal(curatat.cui, "14399840");
  assert.equal(curatat.company_name, "SC Exemplu SRL");
  assert.equal(curatat.reg_com, "J40/1234/2020");
  // Orice altceva decat `true` inseamna neplatitor: un sir adevarat-ish nu tine.
  assert.equal(curatat.vat_payer, false);
});

/**
 * `verified` si `inactive` sunt verdicte ale SERVERULUI. Daca un client si le-ar
 * putea declara singur, reverificarea la ANAF ar deveni decor: ar fi de ajuns sa
 * trimita `verified: true` ca panoul sa nu mai avertizeze pe nimeni.
 */
test("clientul nu isi poate declara singur datele confirmate", () => {
  const curatat = parseBillingCompany({
    cui: "14399840",
    company_name: "SC Fantoma SRL",
    verified: true,
    inactive: false,
  });
  assert.ok(curatat);
  assert.equal(curatat.verified, false);
  assert.equal(curatat.inactive, false);
});

test("tara de pe factura vine din aceeasi sursa ca restul adresei", () => {
  // Persoana fizica: adresa de livrare, cu tot cu tara ei.
  const pf = invoiceParty({ customer_name: "X" }, { ...LIVRARE, country: "DE" });
  assert.equal(pf.country, "DE");

  // Firma: sediul vine din registrul ANAF, deci Romania (`null` = implicit RO).
  const pj = invoiceParty({ customer_name: "X", billing_company: FIRMA }, { ...LIVRARE, country: "DE" });
  assert.equal(pj.country, null);
});

/**
 * Citirea din baza pastreaza verdictul serverului; parsarea intrarii de la client
 * nu il poate inventa. Confuzia intre cele doua ar fi pus „date neconfirmate la
 * ANAF" pe absolut fiecare comanda pe firma.
 */
test("citirea din baza pastreaza confirmarea, spre deosebire de parsarea intrarii", () => {
  const confirmat = readBillingCompany({ ...FIRMA, verified: true, inactive: true });
  assert.ok(confirmat);
  assert.equal(confirmat.verified, true);
  assert.equal(confirmat.inactive, true);

  const dinClient = parseBillingCompany({ ...FIRMA, verified: true, inactive: true });
  assert.ok(dinClient);
  assert.equal(dinClient.verified, false);
  assert.equal(dinClient.inactive, false);
});

test("starea de confirmare ajunge la factura", () => {
  const neconfirmat = invoiceParty(
    { customer_name: "X", billing_company: { ...FIRMA, verified: false, inactive: true } },
    LIVRARE
  );
  assert.equal(neconfirmat.verified, false);
  assert.equal(neconfirmat.inactive, true);

  const confirmat = invoiceParty({ customer_name: "X", billing_company: FIRMA }, LIVRARE);
  assert.equal(confirmat.verified, true);
  assert.equal(confirmat.inactive, false);
});
