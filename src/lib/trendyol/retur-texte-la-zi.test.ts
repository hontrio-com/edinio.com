import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   TEXTELE RAMASE IN URMA DUPA O ZI DE INDREPTARI (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   O maturare cu 39 de cititori peste codul de retururi a gasit 34 de locuri unde CODUL era
   corect si TEXTUL nu. Nu comentarii ornamentale: mesaje pe care le vede comerciantul, o
   masuratoare consemnata ca dovada, un index viu in baza, si o a doua lista de stari.

   ⚠ DE-AIA EXISTA PROBA ASTA. Textele se schimba odata cu codul numai daca cineva le pazeste;
   altfel raman, si peste cateva luni se citesc ca adevar.
*/

const fis = (p: string) => readFileSync(p, "utf8");
/* ⚠ Fara comentarii: o nota care CITEAZA textul vechi ca sa spuna de ce l-a inlocuit nu e o
   scapare — e chiar felul in care se tine minte. Se scaneaza codul viu. */
const viu = (p: string) =>
  fis(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ 	]*\/\/.*$/gm, "");
const mod = viu("src/lib/trendyol/retururi.ts");
const ui = viu("src/components/dashboard/TrendyolReturns.tsx");

test("⚠ nicaieri nu mai scrie ca podeaua e de-o ora", () => {
  /* Podeaua obisnuita e de cinci minute, iar sub ea se coboara pana la un minut. */
  for (const [p, t] of [
    ["retururi.ts", mod],
    ["retur-fereastra.test.ts", viu("src/lib/trendyol/retur-fereastra.test.ts")],
    ["retur-stramtoare.test.ts", viu("src/lib/trendyol/retur-stramtoare.test.ts")],
  ] as const) {
    assert.doesNotMatch(t, /ferestre de-o ora pentru totdeauna/, p);
    assert.doesNotMatch(t, /Douazeci de pagini pe o (ora|fereastra de-o ora)/, p);
  }
});

test("⚠ si nicio trimitere la constante scoase", () => {
  /* `PAGINI_MAXIME_LA_PODEA` era chiar plafonul care ingaduia pierderea de date. Numele lui
     ramas intr-un comentariu trimite cititorul la o regula desfiintata. */
  assert.doesNotMatch(mod, /PAGINI_MAXIME_LA_PODEA/);
  assert.doesNotMatch(viu("src/lib/trendyol/types.ts"), /^export const CLAIM_DE_HOTARAT/m);
});

test("⚠ precautia noastra nu se mai da drept regula lor", () => {
  /* Latimea de doua saptamani si orizontul de trei luni sunt amandoua alese de noi. */
  assert.doesNotMatch(mod, /altfel serviciul refuza/);
  assert.doesNotMatch(mod, /cat tin ei cererile/);
  assert.doesNotMatch(viu("src/lib/trendyol/retururi.test.ts"), /atat ingaduie ei intr-o cerere/);
  assert.doesNotMatch(viu("src/lib/trendyol/retururi.test.ts"), /Plafonul ei ramane cel al lor/);
});

test("⚠ „nu mai asteapta” nu se spune despre un retur care n-a INCEPUT sa astepte", () => {
  /*
   * Pe `Created` clientul abia a apasat butonul: returul nu a inceput sa astepte un raspuns, nu
   * „nu mai" asteapta. Mesajul pleaca si din server, si din ecran, deci se indreapta in amandoua.
   */
  assert.match(mod, /Clientul abia a cerut returul, iar coletul n-a ajuns încă la tine/);
  assert.match(mod, /const abiaCerute = inchise\.filter\(\(id\) => !marfaAAjuns\(stari\.get\(id\)\)\)/);
  assert.match(ui, /clientul abia a cerut returul; nu ai ce răspunde până nu ajunge la tine/);
});

test("⚠ hotararea se anunta pe LINII, fiindca retururile lor sunt PARTIALE", () => {
  /* „Returul a fost acceptat" spunea despre tot ce se intamplase doar cu liniile bifate — iar
     daca mai ramaneau linii nehotarate, il trimitea acasa crezand ca a terminat. */
  assert.match(ui, /Linia a fost acceptată|linii au fost acceptate/);
  assert.doesNotMatch(ui, /"Returul a fost acceptat\."/);
  assert.doesNotMatch(ui, /"Returul a fost respins\."/);
});

test("⚠ si nu se cere o apasare imposibila", () => {
  /*
   * Cand nicio linie n-are stare citibila, toate bifele sunt stinse — iar cererea apare totusi in
   * lista, fiindca necunoscutul se ARATA. „Bifează întâi liniile" l-ar fi pus sa caute la
   * nesfarsit o bifa care nu se poate apasa.
   */
  assert.match(ui, /function deCeNuSePoateBifa\(claimId: string\): string \{/);
  assert.match(ui, /Nicio linie din returul ăsta nu mai poate primi un răspuns acum/);

  /*
   * ⚠ SI E CHEMATA DIN AMANDOUA CAILE. Prima oara reparatia a cazut doar in `respinge`, iar
   * `hotaraste` a ramas cu textul vechi — `replace(..., 1)` nimerise prima potrivire. Doua cai
   * care fac acelasi lucru se despart la prima reparatie care le atinge pe rand, deci textul se
   * scrie o data si se cheama de doua ori.
   */
  const chemari = ui.match(/toast\.error\(deCeNuSePoateBifa\(claimId\)\)/g) ?? [];
  assert.equal(chemari.length, 2, "si `respinge`, si `hotaraste`");

  /*
   * ⚠ Si toastul de reusita e pe LINII in amandoua caile, tot din acelasi motiv. Se verifica pe
   * CORPUL fiecarei functii, nu numarand potriviri in tot fisierul: `hotaraste` are doua texte
   * intr-un ternar (acceptat/respins) si `respinge` unul, deci un numar total n-ar spune ca
   * amandoua sunt acoperite — ar spune doar ca sunt trei undeva.
   */
  for (const nume of ["function hotaraste(", "function respinge("]) {
    const i = ui.indexOf(nume);
    assert.ok(i > 0, `${nume} exista`);
    const corp = ui.slice(i, ui.indexOf("\n  }", i));
    assert.match(corp, /Linia a fost (acceptată|respinsă)/, nume);
    assert.doesNotMatch(corp, /Returul a fost/, nume);
  }
});

test("⚠ „Respins.” nu se mai spune despre toata cererea", () => {
  /* `dontShipBack` vine pe coletul de retur-respins, care e la nivel de cerere — dar o cerere
     poate avea linii acceptate si linii respinse deodata. */
  assert.doesNotMatch(ui, /Respins\. Nu trebuie să trimiți nimic înapoi/);
  assert.match(ui, /Nu trebuie să trimiți nimic înapoi clientului\./);
});

test("⚠ indexul „de hotarat” urmeaza chiar interogarea panoului", () => {
  /*
   * ═══ ⚠ UN INDEX PARTIAL CU PREDICATUL VECHI NU MAI E FOLOSIT DELOC ═══
   *
   * Avea `claim_status in ('Created','WaitingInAction','InAnalysis')`, iar panoul intreaba
   * `claim_status is null or claim_status = 'WaitingInAction'`. Postgres poate folosi un index
   * partial numai cand poate DOVEDI ca interogarea implica predicatul — iar `is null` nu-l
   * implica, si cum cele doua stau sub un `or`, indexul cadea cu totul.
   *
   * ⚠ MASURAT prin `explain`, pe 4000 de randuri, in tranzactie anulata:
   *     predicat vechi -> Index Scan using trendyol_claims_biz_idx + Filter  (cerne in memorie)
   *     predicat nou   -> Index Scan using trendyol_claims_de_hotarat_idx    (fara Filter, fara Sort)
   *
   * Costa la fiecare scriere si nu ajuta la nicio citire.
   */
  const mig = fis("migrations/2026-11-14-indexul-de-hotarat-si-lista-moarta.sql");
  assert.match(mig, /where claim_status is null or claim_status = 'WaitingInAction'/);
  assert.match(mig, /drop index if exists public\.trendyol_claims_de_hotarat_idx;/);

  /* ⚠ Si baseline-ul trebuie sa fi prins forma noua — altfel productia si Git-ul s-au despartit. */
  const baza = fis("migrations/000-schema-baseline.sql");
  assert.doesNotMatch(baza, /trendyol_claims_de_hotarat_idx.*'Created'::text/);
  assert.match(baza, /trendyol_claims_de_hotarat_idx[\s\S]{0,220}WaitingInAction/);
});
