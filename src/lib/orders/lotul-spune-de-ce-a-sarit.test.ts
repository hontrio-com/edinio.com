import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/* ══════════════════════════════════════════════════════════════════════════
   LOTUL SPUNE DE CE A SARIT, SI INTREABA INAINTE SA EMITA (14.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   DOUA DEFECTE, amandoua in aceeasi bara de lot.

   1. „SARITE" ERA UN SINGUR NUMAR PESTE TREI MOTIVE care cer miscari OPUSE:
        - are deja AWB la curierul cerut            -> nu cere NIMIC
        - curierul ales nu intra in lot / nu e conectat -> cere emitere PE BUCATA,
          altfel comanda nu pleaca niciodata
        - transportul e in fluxul marketplace-ului  -> nu se emite nimic, vreodata
      Contopite, comerciantul citea „7 sărite" fara sa poata sti daca mai are ceva de facut.
      Si, reluand lotul, cele deja facute se sar la fel: numarul nu scade, deci arata ca un
      esec care nu se repara.

   2. LOTUL DE AWB-URI PORNEA FARA NICIO INTREBARE, desi butonul de alaturi cere confirmare
      pentru facturi. O apasare emitea pana la 50 de expedieri REALE, platite. Iar greseala e
      mai greu de desfacut decat o factura: aceea se storneaza, un colet la Packeta sau DHL
      NU se poate anula prin API (vezi `bulk-orders.actions.ts` la Packeta si `dhl.actions.ts`).
*/

const RAD = process.cwd();
const LOT = "src/lib/actions/bulk-orders.actions.ts";
const ECRAN = "src/components/dashboard/OrdersClient.tsx";

const fisier = (relativ: string) => readFileSync(path.join(RAD, relativ), "utf8").replace(/\r\n/g, "\n");
const faraComentarii = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** Corpul unei functii exportate, pana la urmatoarea declaratie de acelasi fel. */
function corpFunctiei(sursa: string, nume: string): string {
  const i = sursa.indexOf(`export async function ${nume}(`);
  assert.ok(i > 0, `${nume} nu mai exista`);
  const urmator = sursa.indexOf("\nexport async function ", i + 10);
  return sursa.slice(i, urmator === -1 ? sursa.length : urmator);
}

/* ── 1. Fiecare sarire isi spune motivul ──────────────────────────────────── */

test("⚠⚠ FIECARE sarire din lot creste si un contor de motiv", () => {
  /*
   * ⚠ PROBA ASTA E MAI TARE DECAT „exista trei contoare".
   *
   * Un al patrulea motiv de sarire adaugat maine, fara contor, ar face `skipped` sa creasca
   * peste o desfacere care nu-l cuprinde: suma n-ar mai da, iar ecranul ar spune „5 sărite"
   * si ar insira motive pentru patru. Se cere ca FIECARE crestere sa fie insotita.
   */
  const corp = faraComentarii(corpFunctiei(fisier(LOT), "bulkGenerateAwbs"));
  const MOTIVE = ["faraCurier.push", "dejaAreAwb++", "duseDeEi.push"];

  const pozitii: number[] = [];
  for (let de = 0; ; ) {
    const i = corp.indexOf("result.skipped++", de);
    if (i === -1) break;
    pozitii.push(i);
    de = i + 1;
  }
  assert.ok(pozitii.length >= 3, `am gasit doar ${pozitii.length} sariri in lotul de AWB-uri`);

  for (const i of pozitii) {
    /*
     * ⚠ SE CITESTE PANA LA `return;`, NU O FEREASTRA DE CARACTERE.
     *
     * Prima forma lua 160 de caractere dupa sarire. Fereastra ajungea pana in blocul VECIN si
     * gasea motivul LUI: mutantul care scotea `dejaAreAwb++` trecea verde, fiindca la doua
     * randuri mai jos era `duseDeEi.push`. Aceeasi lectie ca la „proba pe fisier trece, proba
     * pe element prinde": hotarul trebuie sa fie instructiunea, nu vecinatatea.
     */
    const sfarsit = corp.indexOf("return;", i);
    const bucata = corp.slice(i, sfarsit === -1 ? i + 160 : sfarsit);
    assert.ok(
      MOTIVE.some((m) => bucata.includes(m)),
      `o sarire nu-si spune motivul:\n${corp.slice(Math.max(0, i - 90), i + 90).trim()}`,
    );
  }
});

test("⚠ desfacerea se pune MEREU, si `skipped` ramane SUMA", () => {
  /*
   * ⚠ Campul se pune si cand e nul: un camp lipsa ar insemna „lotul n-a stiut sa spuna de ce",
   * iar ecranul trebuie sa poata deosebi asta de „n-a sarit nimic".
   *
   * ⚠ Si `skipped` NU se inlocuieste: il citesc si loturile de facturi si de status, care nu
   * au de unde da desfacerea. O forma comuna schimbata acolo ar fi rupt doua operatii ca sa
   * repare una.
   */
  const corp = faraComentarii(corpFunctiei(fisier(LOT), "bulkGenerateAwbs"));
  assert.match(corp, /result\.motiveSarite = \{/, "lotul nu mai intoarce desfacerea");
  for (const camp of ["dejaAreAwb", "faraCurierPotrivit: faraCurier.length", "duseDeMarketplace: duseDeEi.length"]) {
    assert.ok(corp.includes(camp), `desfacerea nu mai are \`${camp}\``);
  }
  /* ⚠ Campul ramane OPTIONAL in tip, ca sa nu ceara nimic de la celelalte doua loturi. */
  assert.match(fisier(LOT), /motiveSarite\?: \{/, "campul a devenit obligatoriu: rupe loturile de facturi si de status");
});

test("⚠ comenzile care CER o miscare se numesc, nu doar se numara", () => {
  /*
   * Din cele trei feluri de sarire, unul singur cere ceva de la om: curierul ales nu intra in
   * lot, deci comanda nu va pleca din nicio reluare. Fara numerele lor, comerciantul stie doar
   * ca „ceva" a ramas si trebuie sa caute prin tabel.
   *
   * ⚠ Iar cele „deja facute" NU se numesc dinadins: ele nu cer nimic, si o lista lunga de
   * numere fara rost il invata pe om sa nu mai citeasca lista deloc.
   */
  const corp = faraComentarii(corpFunctiei(fisier(LOT), "bulkGenerateAwbs"));
  assert.match(corp, /order: faraCurier\.join\(", "\)/, "comenzile fara curier potrivit nu mai sunt numite");
  assert.match(corp, /order: duseDeEi\.join\(", "\)/, "comenzile duse de marketplace nu mai sunt numite");
  assert.doesNotMatch(corp, /dejaAreAwb\.join/, "s-au inceput sa se insire si comenzile care nu cer nimic");
});

test("⚠ si ecranul arata desfacerea, nu un singur numar", () => {
  /*
   * ⚠ SE CERE EXPRESIA RANDATA, nu numele campului undeva in fisier.
   *
   * Prima forma cerea `ui.includes("dejaAreAwb")`. Era plasa pe subsir: un mutant care sterge
   * randul afisat, dar lasa numele in conditia de deasupra, ar fi trecut nevazut. Acelasi fel
   * de greseala pe care am facut-o azi la selectul lui `deleteOrder`.
   */
  const ui = faraComentarii(fisier(ECRAN));
  assert.match(ui, /motiveSarite/, "ecranul nu mai citeste desfacerea");
  for (const camp of ["dejaAreAwb", "duseDeMarketplace", "faraCurierPotrivit"]) {
    assert.match(
      ui,
      new RegExp(`\\{bulkResult\\.result\\.motiveSarite\\.${camp}\\}`),
      `ecranul nu mai RANDEAZA \`${camp}\`: numele poate fi inca in fisier, dar omul nu-l vede`,
    );
  }
  /* ⚠ Si nu s-a intors propozitia veche, care numea doi curieri anume dintr-o lista mai lunga. */
  assert.doesNotMatch(ui, /Comenzile Woot \/ Colete sau cele fără curier potrivit/,
    "a revenit nota veche, care contopea trei motive intr-o propozitie");
});

/* ── 2. Lotul intreaba inainte sa emita ───────────────────────────────────── */

test("⚠⚠ NICIUN lot care creeaza documente sau expedieri REALE nu porneste fara intrebare", () => {
  /*
   * ⚠ REGULA E PE TIPAR, nu pe butonul de AWB. Lotul de facturi intreba de mult; cel de
   * AWB-uri nu. Al treilea lot (schimbarea de status) NU intra aici, si pe drept: e
   * reversibil si nu cheama niciun furnizor.
   */
  const ui = faraComentarii(fisier(ECRAN));
  const IREVERSIBILE = ["bulkGenerateInvoices(", "bulkGenerateAwbs("];

  for (const apel of IREVERSIBILE) {
    const iApel = ui.indexOf(apel);
    assert.ok(iApel > 0, `${apel} nu mai e chemat din ecran`);
    /* Functia care il contine: de la ultima declaratie `function` de dinaintea apelului. */
    const iFunctie = ui.lastIndexOf("function ", iApel);
    assert.ok(iFunctie > 0 && iFunctie < iApel, `nu gasesc functia care cheama ${apel}`);
    const inainte = ui.slice(iFunctie, iApel);
    assert.match(
      inainte,
      /window\.confirm\(/,
      `${apel} porneste fara nicio intrebare: o apasare face lucruri reale, platite, pe care `
      + "nu le poate desface nimeni",
    );
  }
});

test("⚠ intrebarea de la AWB-uri SPUNE ce costa, nu doar „esti sigur?”", () => {
  /*
   * Un „esti sigur?" nu adauga nimic: omul apasa Da din reflex. Intrebarea trebuie sa poarte
   * chiar faptele care fac greseala scumpa: cate expedieri, ca sunt reale si platite, si ca la
   * doi curieri nu exista drum inapoi.
   */
  /*
   * ⚠ FARA COMENTARII, si asta a prins-o un mutant.
   *
   * Prima forma citea fisierul BRUT. Comentariul pe care l-am scris chiar deasupra confirmarii
   * contine cuvintele „expedieri REALE", „Packeta" si „DHL", deci proba isi masura propriul
   * comentariu, iar un mutant care golea TEXTUL intrebarii trecea nevazut. O proba care se
   * hraneste din explicatia de langa ea nu apara nimic.
   */
  const ui = faraComentarii(fisier(ECRAN));
  const i = ui.indexOf("function runBulkAwbs(");
  assert.ok(i > 0, "runBulkAwbs nu mai exista");
  const corp = ui.slice(i, ui.indexOf("\n  }", i));
  assert.match(corp, /expedieri REALE/, "intrebarea nu mai spune ca expedierile sunt reale");
  assert.match(corp, /Packeta/, "intrebarea nu mai numeste curierul fara anulare");
  assert.match(corp, /DHL/, "intrebarea nu mai numeste al doilea curier fara anulare");
  assert.match(corp, /selected\.size/, "intrebarea nu mai spune CATE comenzi sunt in lot");
});

test("⚠ si afirmatia din intrebare e ADEVARATA: la Packeta si DHL chiar nu exista anulare", () => {
  /*
   * ⚠ Un text catre comerciant care exagereaza e mai rau decat unul care tace: prima data cand
   * descopera ca se putea anula, nu mai crede nicio alta avertizare. Proba leaga textul de
   * dovada din cod.
   */
  assert.match(fisier(LOT), /API-ul lor nu are anulare/, "nota despre Packeta a disparut din lot");
  assert.match(
    fisier("src/lib/actions/dhl.actions.ts"),
    /DHL nu are anulare de expediere/,
    "nota despre DHL a disparut",
  );
});
