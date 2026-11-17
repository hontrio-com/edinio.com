import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";

/*
 * Cablarea SAGA in ruta cronului, in actiuni si in panou: locurile in care o regula proba-ta pe valori
 * se poate pierde pe drum (un argument nedat, o semnalare amanata, o scriere care atinge zero randuri).
 * Ruta si actiunile citesc baza cu clientul real si cookie-urile cererii, deci aici se citeste SURSA,
 * pe ELEMENT (instructiunea anume), nu pe fisier: o potrivire oriunde in fisier ar fi trecut si peste
 * un apel sters.
 */

const citeste = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const RUTA = citeste("src/app/api/cron/saga-export/route.ts");
const ACTIUNI = citeste("src/lib/actions/saga.actions.ts");
const SERVER = citeste("src/lib/saga/server.ts");
const PANOU = citeste("src/components/dashboard/saga/SagaComandaPanel.tsx");

/** Instructiunea care incepe la `inceput` si se termina la primul `;` de la capatul ei (paranteze echilibrate). */
function instructiunea(sursa: string, inceput: string, de = 0): string {
  const i = sursa.indexOf(inceput, de);
  assert.ok(i >= 0, `lipseste: ${inceput}`);
  let adancime = 0;
  for (let j = i; j < sursa.length; j++) {
    const c = sursa[j];
    if (c === "(" || c === "{" || c === "[") adancime++;
    else if (c === ")" || c === "}" || c === "]") adancime--;
    else if (c === ";" && adancime === 0) return sursa.slice(i, j + 1);
  }
  return sursa.slice(i);
}

describe("cronul", () => {
  test("⚠ termenul trecerii ajunge la FIECARE document (`exportaComanda` il primeste)", () => {
    const apel = instructiunea(RUTA, "const r = await exportaComanda(");
    assert.match(apel, /\btermen,/);
    assert.match(apel, /regulaCron: true/);
  });

  test("⚠ semnalarile pleaca PE LOC, din bucla comenzilor, nu dintr-o lista citita la sfarsit", () => {
    const bucla = RUTA.slice(RUTA.indexOf("for (const orderId of plan.orderIds)"), RUTA.indexOf("magazinul a cazut"));
    assert.ok(bucla.length > 0);
    for (const titlu of ["Un document n-a intrat în SAGA", "O stornare nu apare în SAGA", "SAGA a refuzat cheia de acces", "SAGA a schimbat cheia de acces"]) {
      assert.match(bucla, new RegExp(`await semnaleaza\\(businessId, "${titlu}"`), titlu);
    }
    assert.doesNotMatch(RUTA, /deSemnalat/);
  });

  test("factura inlocuita fara stornare se semnaleaza din rezultatul exportului (o data: `stornariLipsa`)", () => {
    const i = RUTA.indexOf("if (r.stornariLipsa.length)");
    assert.ok(i > 0);
    assert.match(RUTA.slice(i, i + 200), /mesajStornariLipsa\(r\.stornariLipsa\)/);
  });

  test("⚠ proba inainte dupa refuz SI dupa nelamurit; o proba picata sare magazinul", () => {
    const i = RUTA.indexOf("if (trebuieProbaInainte(ultima.rand?.stare))");
    assert.ok(i > 0);
    assert.match(RUTA.slice(i, i + 200), /probaCuCheiaSalvata\(admin, businessId, null, 0\);\s*if \(!proba\.ok\) \{ sarite\+\+; continue; \}/);
  });

  test("curatenia: jurnalul de peste 24 de luni si rapoartele comenzilor sterse", () => {
    assert.match(RUTA, /admin\.from\("saga_exporturi"\)\.delete\(\)\.lt\("creat_la", pragJurnal\)/);
    assert.match(RUTA, /const golire = await golesteRapoarteleComenzilorSterse\(admin\);/);
    assert.match(RUTA, /if \(!verificaCron\(req\)\)/);
  });

  test("bugetul lasa loc documentului pornit in ultima clipa (import 30 s + proba 15 s)", () => {
    const m = RUTA.match(/const BUGET_MS = maxDuration \* 1000 - (\d+)_000;/);
    assert.ok(m);
    assert.ok(Number(m[1]) >= 50, `rezerva: ${m[1]} s`);
  });
});

describe("actiunile", () => {
  test("⚠ salvarea si deconectarea cer randul scris inapoi: zero randuri nu e succes", () => {
    const starturi = [...ACTIUNI.matchAll(/const \{ data: scrise/g)].map((m) => m.index ?? -1);
    assert.equal(starturi.length, 2, "salvarea si deconectarea");
    assert.equal((ACTIUNI.match(/from\("store_settings"\)\.update\(/g) ?? []).length, 2, "nicio alta scriere a configurarii");
    for (const i of starturi) {
      const scriere = instructiunea(ACTIUNI, "const { data: scrise", i);
      assert.match(scriere, /from\("store_settings"\)\.update\(\{/);
      assert.match(scriere, /\.select\("business_id"\);$/);
      const dupa = ACTIUNI.slice(i + scriere.length, i + scriere.length + 200);
      assert.match(dupa, /scrise\.length === 0/);
    }
  });

  test("⚠ C3: lotul oprit din alt motiv decat timpul spune motivul si e `oprit`; termenul ajunge la fiecare document", () => {
    const apel = instructiunea(ACTIUNI, "r = await exportaComanda(admin, businessId, id,");
    assert.match(apel, /\btermen,/);
    const i = ACTIUNI.indexOf("if (r.oprire) {");
    assert.ok(i > 0);
    const bloc = ACTIUNI.slice(i, i + 250);
    assert.match(bloc, /rezultat\.oprit = true;/);
    assert.match(bloc, /motivOprireLot\(r\.oprire\)/);
    assert.match(bloc, /rezultat\.motivOprire = motiv;/);
  });

  test("avertismentele lotului pleaca separat de erori, cu numarul comenzii", () => {
    const lot = ACTIUNI.slice(ACTIUNI.indexOf("export async function exportaComenzileInSaga"));
    assert.match(lot, /rezultat\.avertismente\?\.push\(`#\$\{order\}: \$\{r\.avertismente\.join\(" "\)\}`\)/);
    assert.doesNotMatch(lot, /\[\.\.\.r\.erori, \.\.\.r\.avertismente\]/);
  });

  test("trimiterea unei comenzi spune avertismentele si cand nimic n-a plecat", () => {
    const una = ACTIUNI.slice(ACTIUNI.indexOf("export async function exportaComandaInSaga"), ACTIUNI.indexOf("const MAX_LOT"));
    assert.match(una, /return \{ error: \[\.\.\.r\.erori, \.\.\.r\.avertismente\]\.join\(" "\) \}/);
    assert.match(una, /deci nu le-am trimis a doua oară\.", \.\.\.r\.avertismente\]/);
  });
});

describe("serverul", () => {
  test("⚠ registrul primeste starea si codul (`mesajPentruRegistru`), nu `rez.mesaj`", () => {
    const i = SERVER.indexOf("const verdict = verdictPentruRegistru(rez.fel);");
    assert.ok(i > 0);
    const bloc = SERVER.slice(i, SERVER.indexOf("verdictFurnizor,", i));
    assert.match(bloc, /const mesaj = mesajPentruRegistru\(rez\.fel, rez\.status\);/);
    assert.match(bloc, /throw verdict === "necunoscut" \? eroareNesigura\(mesaj\) : eroareRefuz\(mesaj\);/);
    assert.doesNotMatch(bloc, /eroare(Nesigura|Refuz)\(rez\.mesaj/);
  });

  test("⚠ proba cu cheia salvata trece prin `verdictProba` (cheia rotita pierduta nu e reusita)", () => {
    assert.match(SERVER, /return verdictProba\(r\.valoare\);/);
  });

  test("⚠ termenul se verifica in bucla DOCUMENTELOR", () => {
    const inceput = SERVER.indexOf("for (const d of lista) {");
    assert.ok(inceput > 0);
    const primul = SERVER.slice(inceput).indexOf("if (o.termen !== undefined && Date.now() >= o.termen)");
    assert.ok(primul > 0 && primul < 300, "chiar la inceputul fiecarui document");
  });

  test("TVA-ul casei ajunge in compunere", () => {
    assert.match(SERVER, /tvaFurnizor: ctx\.tvaPeCasa\[d\.casa\],/);
  });
});

describe("panoul", () => {
  test("sfatul la „nelamurit” urmeaza importul automat al TRIMITERII (Ieșiri sau Import date)", () => {
    const i = PANOU.indexOf('u?.stare === "necunoscut"');
    assert.ok(i > 0);
    const bloc = PANOU.slice(i, i + 600);
    assert.match(bloc, /u\.importAutomat\s*\?/);
    assert.match(bloc, /la Ieșiri/);
    assert.match(bloc, /Diverse, Import date/);
  });

  test("facturile inlocuite fara stornare si nota documentului se vad", () => {
    assert.match(PANOU, /\{mesajStornariLipsa\(stare\.stornariLipsa\)\}/);
    assert.match(PANOU, /\{d\.nota && <p/);
  });
});

describe("textele", () => {
  test("⚠ nicio liniuta lunga in fisierele SAGA (cod, probe, pagini, fisa)", () => {
    const fisiere = [
      ...readdirSync("src/lib/saga").map((f) => `src/lib/saga/${f}`),
      ...readdirSync("src/app/(dashboard)/dashboard/features/saga").map((f) => `src/app/(dashboard)/dashboard/features/saga/${f}`),
      "src/lib/actions/saga.actions.ts", "src/app/api/cron/saga-export/route.ts",
      "src/components/dashboard/SagaConfigClient.tsx", "src/components/dashboard/saga/SagaComandaPanel.tsx",
      "docs/facturare/SAGA.md",
    ];
    for (const f of fisiere) {
      const linii = citeste(f).split("\n");
      const cu = linii.findIndex((l) => l.includes("\u2014"));
      assert.equal(cu, -1, `${f}:${cu + 1}`);
    }
  });

  test("ghilimeaua de jos se inchide cu cea dreapta-sus (U+201D), nu cu una dreapta", () => {
    /* Numai in cod: comentariile (fara diacritice, pentru cititorul codului) au regula lor. */
    const faraComentarii = (sursa: string) => sursa.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const [nume, sursa] of [["server", SERVER], ["actiuni", ACTIUNI], ["panou", PANOU], ["ruta", RUTA]] as const) {
      const gresite = [...faraComentarii(sursa).matchAll(/\u201E[^\u201E\u201D"\n]{0,80}"/g)].map((m) => m[0]);
      assert.deepEqual(gresite, [], nume);
    }
  });
});
