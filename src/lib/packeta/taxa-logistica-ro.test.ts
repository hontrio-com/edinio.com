import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nodulTaxeiRo, taraOrigineValida } from "./taxa-logistica-ro";
import { construiesteAtribute, lipsuriExpediere, type DateExpediere } from "./expediere";
import { cerereXml } from "./xml";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * TAXA LOGISTICA ROMANEASCA, ceruta de ei de la 1.01.2026    (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Documentatia lor (`guides/ro-logistics-tax`, actualizata 30.07.2026):
 *
 *   „Starting from January 1, 2026, Romania has introduced new legislation that imposes a fixed
 *    tax on all packets originating from outside the European Union... Merchants and platforms
 *    handling packets to Romania must account for and apply this tax."
 *
 *   „Non-compliance: ... Omitting this data may result in non-compliance with Romanian
 *    regulations."
 *
 * ⚠ Integrarea noastra s-a scris pe 15.08.2026, DUPA ce pagina exista. N-a prins-o fiindca
 * documentatia s-a citit din depozitul lor de pe GitHub, oprit in februarie 2026: campul nu e
 * acolo nici azi, e numai pe site.
 */

const BAZA: DateExpediere = {
  numarComanda: "CMD-1",
  addressId: "123",
  eshop: "magazin",
  valoare: 100,
  greutateKg: 1,
  laAdresa: true,
  destinatar: {
    nume: "Ion Popescu", telefon: "+40722222222", email: "a@b.ro",
    strada: "Str. Test", numar: "1", oras: "Cluj-Napoca", judet: "Cluj", codPostal: "400000",
  },
};

test("⚠⚠ fara declaratie, blocul NU pleaca deloc", () => {
  /*
   * In tabelul lor de structuri `roLogisticsTaxDeclaration` e `required: no`. Iar o declaratie
   * „nu e supus" pusa de noi ar fi o AFIRMATIE JURIDICA facuta in numele comerciantului, despre
   * marfa lui, pe care n-avem cum s-o stim: un magazin din Bucuresti poate vinde marfa
   * chinezeasca.
   */
  assert.equal(nodulTaxeiRo(undefined), undefined);
  assert.equal(nodulTaxeiRo(null), undefined);
  assert.equal(nodulTaxeiRo({}), undefined);
  assert.equal(nodulTaxeiRo({ supusa: false, taraOrigine: "CN" }), undefined);

  const a = construiesteAtribute(BAZA);
  assert.equal(a.roLogisticsTaxDeclaration, undefined);
});

test("⚠ cand comerciantul o declara, pleaca INTREAGA", () => {
  assert.deepEqual(nodulTaxeiRo({ supusa: true, taraOrigine: "CN" }), {
    isSubjectToTax: "true",
    countryOfOrigin: "CN",
  });

  const a = construiesteAtribute({ ...BAZA, taxaLogisticaRo: { supusa: true, taraOrigine: "cn" } });
  assert.deepEqual(a.roLogisticsTaxDeclaration, { isSubjectToTax: "true", countryOfOrigin: "CN" });
});

test("⚠⚠ o declaratie pe JUMATATE arunca, nu se omite tacut", () => {
  /*
   * Ei cer `countryOfOrigin` tocmai cand `isSubjectToTax` e adevarat. Omisa tacut, expedierea ar
   * pleca fara declaratie DESI omul a cerut una, adica exact neconformitatea pe care campul o
   * apara. Iar trimisa incompleta, ar fi un refuz al lor cu un mesaj de nelegat de nimic.
   */
  assert.throws(() => nodulTaxeiRo({ supusa: true }), /tara de origine/i);
  assert.throws(() => nodulTaxeiRo({ supusa: true, taraOrigine: "" }), /tara de origine/i);
  assert.throws(() => nodulTaxeiRo({ supusa: true, taraOrigine: "China" }), /tara de origine/i);
});

test("⚠ si se spune mai devreme, in lipsurile expedierii", () => {
  /* Aruncarea e ultima plasa; omul trebuie sa afle inainte sa apese. */
  const lipsuri = lipsuriExpediere({ ...BAZA, taxaLogisticaRo: { supusa: true } });
  assert.ok(
    lipsuri.some((l) => /tara de origine/i.test(l)),
    `lipsurile nu spun nimic despre tara de origine: ${lipsuri.join("; ")}`,
  );
  /* Iar cand nu e declarata, nu se cere nimic. */
  assert.deepEqual(lipsuriExpediere(BAZA).filter((l) => /origine/i.test(l)), []);
});

test("codul de tara se cere ISO 3166-1 alpha-2, si se normalizeaza", () => {
  assert.equal(taraOrigineValida("cn"), "CN");
  assert.equal(taraOrigineValida("  tr  "), "TR");
  assert.equal(taraOrigineValida("RO"), "RO");
  for (const rau of ["", "C", "CHN", "China", "12", null, undefined, 42, {}]) {
    assert.equal(taraOrigineValida(rau), null, String(rau));
  }
});

test("⚠ nodul iese in XML exact cu numele cerute de ei", () => {
  /*
   * Numele campurilor sunt cele din exemplul lor. Scrise altfel, Packeta le-ar ignora in tacere,
   * iar coletul ar pleca nedeclarat.
   */
  const x = cerereXml("createPacket", {
    packetAttributes: construiesteAtribute({
      ...BAZA, taxaLogisticaRo: { supusa: true, taraOrigine: "CN" },
    }),
  });
  assert.match(x, /<roLogisticsTaxDeclaration>/);
  assert.match(x, /<isSubjectToTax>true<\/isSubjectToTax>/);
  assert.match(x, /<countryOfOrigin>CN<\/countryOfOrigin>/);
});

/* ═══ MUTANTUL STA PE APELANT ═══ */
test("⚠⚠ emiterea chiar ia declaratia din configurarea magazinului", () => {
  const sursa = readFileSync(new URL("../actions/packeta.actions.ts", import.meta.url), "utf8");
  assert.match(sursa, /taxaLogisticaRo: \{\s*supusa: config\.taxa_ro_supusa,\s*taraOrigine: config\.taxa_ro_tara_origine,/,
    "declaratia trebuie sa vina din configurare, nu dedusa de noi");
  /* Si aruncarea trebuie sa ajunga la om, nu sa devina o cadere fara explicatie. */
  assert.match(sursa, /atribute = construiesteAtribute\(dateExpediere\);\s*\}\s*catch/,
    "constructia trebuie prinsa, ca mesajul ei sa ajunga pe ecran");
});

test("⚠ campurile exista in configurarea Packeta", () => {
  const client = readFileSync(new URL("./client.ts", import.meta.url), "utf8");
  assert.match(client, /taxa_ro_supusa\?: boolean \| null;/);
  assert.match(client, /taxa_ro_tara_origine\?: string \| null;/);
});
