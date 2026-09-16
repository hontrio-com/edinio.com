import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";
import { DOCUMENT_DE_TEST, eDocumentDeTest } from "./factura-comenzii";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * UN DOCUMENT DE TEST NU E UNUL FISCAL, SI NU PLEACA NICAIERI (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * fGO are comutator de sandbox: cu el pornit, emiterea merge pe `api-testuat.fgo.ro` si intoarce
 * un document care arata EXACT ca unul adevarat, cu numar, serie, link si PDF valid.
 *
 * ⚠⚠ Si tocmai de aia `esteChiarPdf` nu-l prinde: e un PDF perfect valid. Pe randul comenzii nu se
 * deosebeste de o factura fiscala: acelasi `fgo_invoice_number`, aceeasi serie, acelasi fel de link.
 *
 * ⚠ MASURAT, nu banuit: magazinul `itp-blk` are `fgo_config.sandbox = true` si a emis TREI facturi,
 * toate cu link pe `testuat.fgo.ro`, apoi le-a stornat pe toate trei. Pana azi, nimic nicaieri nu
 * spunea ca sunt de proba: nici ecranul la emitere, nici randul comenzii.
 *
 * Pericolul nu e ecranul, e urcarea la marketplace: `facturaComenzii` le-ar fi dat drept factura a
 * comenzii, si la eMAG sau Trendyol ar fi ajuns un document de TEST pe post de document fiscal.
 *
 * ⚠⚠ Se citeste din LINK, nu din configurare. Configurarea spune ce e ACUM; documentul a fost emis
 * candva. Un comerciant care iese din modul de testare nu preface retroactiv in documente fiscale
 * facturile emise cat timp era in el.
 */

describe("Se recunoaste dupa gazda din link", () => {
  test("⚠⚠ un link de pe serverul de test e document de test", () => {
    assert.equal(eDocumentDeTest("https://testuat.fgo.ro/factura/xyz"), true);
    assert.equal(eDocumentDeTest("https://api-testuat.fgo.ro/v1/factura/print?id=1"), true);
  });

  test("un link de productie NU e", () => {
    assert.equal(eDocumentDeTest("https://fgo.ro/factura/xyz"), false);
    assert.equal(eDocumentDeTest("https://api.fgo.ro/v1/factura/print?id=1"), false);
  });

  test("⚠ si documentele celorlalte case raman neatinse", () => {
    /*
     * Lista contine DOAR ce am masurat sau ce scrie in codul nostru. SmartBill si Oblio n-au
     * comutator de sandbox in configurarea noastra; puse pe ghicite, ar taia documente bune.
     */
    assert.equal(eDocumentDeTest("https://cloud.smartbill.ro/documente/extern/factura/1"), false);
    assert.equal(eDocumentDeTest("https://www.oblio.eu/utils/show_file/?ic=1&id=2&it=abc"), false);
  });

  test("⚠ potrivirea nu e sensibila la litere mari, si golul nu cade", () => {
    assert.equal(eDocumentDeTest("HTTPS://TESTUAT.FGO.RO/x"), true);
    assert.equal(eDocumentDeTest(""), false);
  });
});

// ─── Si garda chiar opreste urcarea ──────────────────────────────────────────

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("Nu pleaca la marketplace, si nici tacut", () => {
  const DRUMURI = [
    { nume: "eMAG", cale: "src/lib/emag/facturi.ts" },
    { nume: "Trendyol", cale: "src/lib/trendyol/facturi.ts" },
  ] as const;

  for (const d of DRUMURI) {
    test(`⚠⚠ ${d.nume}: documentul de test se opreste`, () => {
      const s = viu(d.cale);
      assert.match(s, /if \(eDocumentDeTest\(factura\.url\)\) return \{ fel: "esec", mesaj: DOCUMENT_DE_TEST \};/,
        `${d.nume}: garda lipseste`);
    });

    test(`⚠⚠ ${d.nume}: ca \`esec\`, NU ca \`fara_factura\``, () => {
      /*
       * `fara_factura` inseamna „inca nu s-a emis", iar cronul ar reincerca la nesfarsit, tacut.
       * `esec` ajunge in jurnal cu mesajul care spune ce e de facut.
       */
      const s = viu(d.cale);
      const i = s.indexOf("eDocumentDeTest(factura.url)");
      assert.ok(i > 0, `${d.nume}: garda lipseste`);
      const linia = s.slice(i, s.indexOf("\n", i));
      assert.ok(!linia.includes("fara_factura"), `${d.nume}: s-ar reincerca la nesfarsit`);
    });

    test(`⚠ ${d.nume}: si INAINTE de a aduce PDF-ul`, () => {
      /* Nu are rost sa descarcam si sa rehostam un document pe care oricum il refuzam. */
      const s = viu(d.cale);
      assert.ok(s.indexOf("eDocumentDeTest(factura.url)") < s.indexOf("await aduPdf("),
        `${d.nume}: garda vine dupa descarcare`);
    });
  }

  test("⚠⚠ si calea AUTOMATA spune ca factureaza in testare", () => {
    /*
     * Nu se opreste: sandbox-ul exista si ca sa se poata proba drumul automat, iar un refuz l-ar
     * face de neprobat. Dar calea aceea n-are niciun om in fata: pe cea manuala ecranul
     * avertizeaza la fiecare apasare, iar aici, fara randul scris, un magazin ar aduna luni de
     * „facturi" de test fara ca nimeni sa se uite.
     */
    const auto = viu("src/lib/actions/fgo.actions.ts");
    const i = auto.indexOf("export async function maybeAutoGenerateInvoice");
    assert.ok(i > 0, "calea automata fGO a disparut");
    const capat = auto.indexOf("\nexport ", i + 1);
    const corp = auto.slice(i, capat > 0 ? capat : undefined);
    assert.match(corp, /if \(config\.sandbox\) \{/, "nu se mai uita la modul de testare");
    assert.match(corp, /action: "fgo\.facturaAutomataInTestare"/);
    assert.match(corp, /severity: "critical"/, "documentele nefiscale nu sunt un simplu avertisment");
    /* ⚠ Si NU opreste: sandbox-ul trebuie sa ramana probabil. */
    const ramura = /if \(config\.sandbox\) \{[\s\S]*?\n    \}/.exec(corp)?.[0] ?? "";
    assert.ok(!/return false/.test(ramura), "modul de testare a devenit o oprire, deci de neprobat");
  });

  test("⚠ mesajul spune ce e si ce sa faca", () => {
    assert.match(DOCUMENT_DE_TEST, /modul de TESTARE/);
    assert.match(DOCUMENT_DE_TEST, /nu e un document fiscal/);
    assert.match(DOCUMENT_DE_TEST, /NU s-a urcat/);
    assert.match(DOCUMENT_DE_TEST, /Opreste modul de testare/);
  });

  test("⚠⚠ si omul afla la EMITERE, nu abia la marketplace", () => {
    /*
     * Ecranul scria acelasi „generata" verde ca la o factura fiscala. Cu trei documente de test
     * deja emise in productie, asta e chiar momentul in care trebuia spus.
     *
     * ⚠⚠ PRIMA VARIANTA A PROBEI CEREA DOAR CA SIRURILE SA EXISTE IN FISIER, si un mutant care
     * inlocuia `if (eTest)` cu `if (false)` a TRECUT: textele ramaneau acolo, doar ca nu le mai
     * ajungea nimeni. Se pinuieste acum CONDITIA si ce atarna de fiecare ramura, nu prezenta.
     */
    const panou = viu("src/components/dashboard/OrderDetailClient.tsx");
    assert.match(panou, /const eTest = linkDoc\.toLowerCase\(\)\.includes\("testuat\.fgo\.ro"\);/,
      "panoul nu mai deduce mediul din link");

    const ramura = /if \(eTest\) \{[\s\S]*?\n        \}/.exec(panou)?.[0] ?? "";
    assert.ok(ramura, "ramura `if (eTest)` a disparut sau si-a schimbat conditia");
    assert.match(ramura, /toast\.warning\(/, "pe ramura de test nu se mai avertizeaza");
    assert.match(ramura, /MODUL DE TESTARE/);
    assert.match(ramura, /duration: 20000/, "un avertisment inghitit in doua secunde nu spune nimic");
    assert.ok(!/toast\.success\(/.test(ramura), "documentul de test se anunta tot ca succes");

    /* Si ramura cealalta ramane succesul obisnuit: reparatia n-avea voie sa-l piarda. */
    const dupa = panou.slice(panou.indexOf(ramura) + ramura.length, panou.indexOf(ramura) + ramura.length + 200);
    assert.match(dupa, /else \{[\s\S]*?toast\.success\(/, "factura fiscala nu mai e anuntata ca succes");
  });
});
