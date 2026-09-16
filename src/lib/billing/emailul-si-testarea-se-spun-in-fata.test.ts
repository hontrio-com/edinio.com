import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * DOUA HOTARARI ALE PROPRIETARULUI, DUSE PANA LA CAPAT      (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Emailul la Oblio se adauga, dar OPRIT din oficiu.** Pornit implicit, ar fi inceput sa
 *    trimita emailuri cumparatorilor a trei magazine care azi nu primesc niciunul: o schimbare
 *    vizibila clientilor LOR, nu o reparatie. Acelasi tipar ca `send_email` la SmartBill.
 *
 *    ⚠⚠ Si e fire-and-forget, spre deosebire de SmartBill: Oblio il ia ca un camp al cererii de
 *    emitere (`sendEmail: 1`) si nu intoarce nimic despre el, pe cand SmartBill are
 *    `/document/send` cu `status.code` in raspuns. Deci daca sablonul din contul lor nu e
 *    configurat, nu se trimite nimic SI NOI NU AFLAM. Fara sa scriem asta in interfata am repeta
 *    exact situatia masurata la SmartBill: 187 de trimiteri incercate, zero dovezi ca vreuna a ajuns.
 *
 * 2. **Modul de testare fGO NU se blocheaza, dar se VEDE.** Blocarea ar face calea automata de
 *    neprobat, iar sandbox-ul tocmai pentru asta exista. Pana azi insa nu se vedea nicaieri in
 *    afara paginii de configurare, si nici acolo nu scria CE INSEAMNA, doar ce server se foloseste.
 *
 *    Scenariul de care ne aparam: comutatorul pornit, facturarea automata pornita, si luni intregi
 *    de „facturi" de test in urma, cu randuri critice in jurnal pe care nu le citeste nimeni.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/*
 * ⚠ TEXTUL ARATAT OMULUI SE CAUTA CU SPATIILE STRANSE.
 *
 * Prima varianta a cazut pe „nu ne spune": in JSX, „nu" statea la capatul unui rand si „ne spune"
 * la inceputul urmatorului. Fraza era acolo, intreaga, doar ca sursa o rupsese. O proba care cade
 * cand cineva reformateaza un paragraf nu apara nimic, doar enerveaza.
 */
const text = (cale: string) => viu(cale).replace(/\s+/g, " ");

describe("Oblio: emailul e un buton, si e oprit", () => {
  test("⚠⚠ implicitul e OPRIT, la fel ca la SmartBill", () => {
    const panou = viu("src/components/dashboard/OblioConfigClient.tsx");
    assert.match(panou, /useState\(initialConfig\?\.send_email \?\? false\)/,
      "comutatorul porneste aprins, deci trimite fara sa fi cerut cineva");
    /* Si perechea de la SmartBill ramane tot oprita: regula e aceeasi la amandoua. */
    assert.match(viu("src/components/dashboard/SmartbillConfigClient.tsx"), /send_email: false/);
  });

  test("⚠ si chiar se salveaza, altfel comutatorul e decor", () => {
    const panou = viu("src/components/dashboard/OblioConfigClient.tsx");
    assert.match(panou, /send_email: sendEmail,/, "valoarea nu ajunge in configurarea salvata");
    assert.match(panou, /checked=\{sendEmail\} onCheckedChange=\{setSendEmail\}/);
  });

  test("⚠⚠ se trimite DOAR cand e cerut SI cand exista adresa", () => {
    /* Fara adresa, i-am cere lui Oblio sa trimita in gol. Iar absenta campului inseamna la ei
       „nu trimite", adica exact purtarea de pana acum pentru cine n-a bifat nimic. */
    const actiuni = viu("src/lib/actions/oblio.actions.ts");
    assert.match(
      actiuni,
      /\.\.\.\(config\.send_email && order\.customer_email \? \{ sendEmail: 1 as const \} : \{\}\),/,
      "conditia s-a slabit",
    );
  });

  test("⚠ proforma NU pleaca pe email: butonul spune „factura”", () => {
    const actiuni = viu("src/lib/actions/oblio.actions.ts");
    assert.match(actiuni, /sendEmail: _mail, \.\.\.proformaData/, "proforma mosteneste emailul facturii");
  });

  test("⚠⚠ si interfata SPUNE ca nu putem confirma trimiterea", () => {
    /*
     * Asta e jumatatea care lipsea la SmartBill si a costat 187 de trimiteri fara nicio dovada.
     * Un buton care promite ceva ce nu putem verifica trebuie sa spuna chiar el asta.
     */
    const panou = text("src/components/dashboard/OblioConfigClient.tsx");
    assert.match(panou, /Trimite factura pe email/);
    assert.match(panou, /nu se trimite nimic/, "nu se spune ce se intampla fara sablon");
    assert.match(panou, /nu ne spune/, "nu se spune ca noi nu putem confirma");
    assert.match(panou, /Verifica primul email tu/, "nu i se spune omului ce sa faca");
  });
});

describe("fGO: modul de testare se vede, dar nu blocheaza", () => {
  test("⚠⚠ panoul de configurare arata consecinta cat timp e pornit", () => {
    const panou = viu("src/components/dashboard/FgoConfigClient.tsx");
    assert.match(panou, /\{form\.sandbox && \(/, "avertismentul nu mai atarna de comutator");
    assert.match(panou, /NU sunt documente/, "nu se spune ca documentele nu-s fiscale");
    assert.match(panou, /variant="warning"/);
  });

  test("⚠ si comutatorul insusi spune ce inseamna, nu doar ce server", () => {
    const panou = viu("src/components/dashboard/FgoConfigClient.tsx");
    assert.match(panou, /Documentele emise asa NU sunt fiscale/);
  });

  test("⚠⚠ iar pe COMANDA se vede si dupa ce toastul a disparut", () => {
    /*
     * Avertismentul de la emitere tine douazeci de secunde; documentul ramane luni. Si pe calea
     * automata nu exista niciun toast, fiindca nu e nimeni in fata.
     */
    const panou = viu("src/components/dashboard/OrderDetailClient.tsx");
    const bloc = /function renderFgo\(\)[\s\S]*?\n  \}/.exec(panou)?.[0] ?? "";
    assert.ok(bloc, "randarea fGO a disparut");
    assert.match(bloc, /const eDeTest = linkFgo\.toLowerCase\(\)\.includes\("testuat\.fgo\.ro"\);/);
    assert.match(bloc, /modul de TESTARE/);
    assert.match(bloc, /\{semnDeTest\}/, "semnul e compus dar nu e pus nicaieri");
  });

  test("⚠⚠ dar NICAIERI nu se blocheaza emiterea in sandbox", () => {
    /*
     * Hotararea: sandbox-ul trebuie sa ramana probabil, inclusiv pe drumul automat. Daca vreodata
     * cineva „repara" asta cu un refuz, proba cade si il trimite sa citeasca de ce.
     */
    const auto = viu("src/lib/actions/fgo.actions.ts");
    const i = auto.indexOf("export async function maybeAutoGenerateInvoice");
    const capat = auto.indexOf("\nexport ", i + 1);
    const corp = auto.slice(i, capat > 0 ? capat : undefined);
    const ramura = /if \(config\.sandbox\) \{[\s\S]*?\n    \}/.exec(corp)?.[0] ?? "";
    assert.ok(ramura, "ramura de sandbox a disparut");
    assert.ok(!/return false/.test(ramura), "sandbox-ul a devenit o oprire, deci de neprobat");
    assert.match(ramura, /severity: "critical"/);
  });
});
