import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { linii } from "./rapoarte";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  RANDURILE RAPOARTELOR, SI CE SE PIERDE PE DRUM
  ═══════════════════════════════════════════════════════════════════════════════
*/

const rand = (dim: string[], met: string[]) => ({
  dimensionValues: dim.map((value) => ({ value })),
  metricValues: met.map((value) => ({ value })),
});

test("⚠ un rand cu DOUA dimensiuni le pastreaza pe amandoua", () => {
  /*
    ⚠ CE APARA. Forma veche citea numai `dimensionValues[0]`. La prima cerere cu
    doua dimensiuni (browser + sistem), a doua ar fi fost aruncata TACUT: raportul
    ar fi aratat „Safari" de trei ori, cu cifre deosebite, si nimeni n-ar fi stiut
    ca sunt trei sisteme deosebite.

    Defectul nu s-ar fi vazut ca eroare, ci ca un tabel care pare stricat.
  */
  const out = linii({ rows: [
    rand(["Safari", "iOS"], ["120"]),
    rand(["Safari", "macOS"], ["45"]),
    rand(["Chrome", "Windows"], ["300"]),
  ] } as never);

  assert.deepEqual(out.map((l) => l.cheie), ["Safari / iOS", "Safari / macOS", "Chrome / Windows"]);
  assert.equal(new Set(out.map((l) => l.cheie)).size, 3, "doua randuri s-au contopit intr-unul");
});

test("o singura dimensiune ramane exact cum era", () => {
  /* ⚠ Martorul: schimbarea de mai sus n-avea voie sa atinga celelalte noua cereri. */
  const out = linii({ rows: [rand(["Romania"], ["500"]), rand(["Bulgaria"], ["12"])] } as never);
  assert.deepEqual(out, [{ cheie: "Romania", a: 500 }, { cheie: "Bulgaria", a: 12 }]);
});

test("o dimensiune goala nu lasa un rand fara nume", () => {
  const out = linii({ rows: [rand([], ["7"]), rand([""], ["3"])] } as never);
  assert.deepEqual(out.map((l) => l.cheie), ["(fara)", "(fara)"]);
});

test("a doua masura se pastreaza doar cand exista", () => {
  const cu = linii({ rows: [rand(["x"], ["10", "2"])] } as never);
  const fara = linii({ rows: [rand(["x"], ["10"])] } as never);
  assert.deepEqual(cu[0], { cheie: "x", a: 10, b: 2 });
  assert.deepEqual(fara[0], { cheie: "x", a: 10 });
  assert.ok(!("b" in fara[0]), "un `b` inventat ar fi aratat ca zero in raport");
});

test("⚠ nimic nu se aduce de la Google fara sa fie si aratat", () => {
  /*
    ⚠ CE APARA. Fiecare cerere in plus e latime de banda, o intarziere in plus
    pentru cine deschide pagina, si o sansa in plus ca teancul sa cada. O bucata
    adusa si nearatata le plateste pe toate trei si nu foloseste nimanui.

    Proba citeste campurile din `DateAnalytics` si cere ca fiecare sa apara in
    componenta care deseneaza pagina.
  */
  const tip = readFileSync("src/lib/admin-analytics/rapoarte.ts", "utf8");
  const client = readFileSync("src/components/admin/AdminAnalyticsClient.tsx", "utf8");

  const i = tip.indexOf("export type DateAnalytics = {");
  const j = tip.indexOf("};", i);
  assert.ok(i > 0 && j > i, "nu mai gasesc tipul datelor");

  const campuri = tip.slice(i, j)
    .split(String.fromCharCode(10))
    .map((r) => r.trim().match(/^([a-zA-Z]+)\??:/))
    .map((m) => m?.[1])
    .filter((n): n is string => !!n && n !== "probleme");

  assert.ok(campuri.length >= 12, `s-au gasit doar ${campuri.length} campuri — cautarea s-a stricat?`);
  /*
    ⚠ SE CAUTA SI FORMA DESFACUTA. Prima forma cerea doar `date.<camp>`, si a
    cazut pe `rezumat` — care se desface la inceput (`const { rezumat } = date`) si
    se foloseste apoi de sapte ori. Adica proba raporta ca nu se arata ceva ce se
    arata pe cardurile de sus.

    O proba care da alarme false invata pe cineva s-o ignore. Cauta acum ambele
    feluri in care un camp poate ajunge pe ecran.
  */
  /*
    ⚠ FARA REGEX, DINADINS. Prima forma folosea `new RegExp(...)` cu margini de
    cuvant scrise intr-un literal de sablon — unde `\` urmat de `b` nu e marginea
    de cuvant, ci caracterul BACKSPACE. Regexul cauta atunci un sir care nu poate
    exista, si proba raporta ca nu se arata ceva ce se arata.

    O cautare simpla e destul aici: numele campurilor sunt lungi si deosebite, iar
    o potrivire din intamplare ar face proba mai ingaduitoare, nu mai aspra.
  */
  const nearatate = campuri.filter((c) => !client.includes(c));
  assert.deepEqual(nearatate, [], "se aduc de la Google si nu se arata nicaieri: " + nearatate.join(", "));
});

test("⚠ nicio dimensiune PERSONALIZATA in teancul principal", () => {
  /*
    ═══════════════════════════════════════════════════════════════════════════════
    ⚠ CE APARA, si de ce paguba era fara nicio legatura cu ce se strica
    ═══════════════════════════════════════════════════════════════════════════════

    O dimensiune personalizata (`customEvent:…`) exista numai daca a fost
    inregistrata de mana in interfata GA4. Pana atunci — sau daca e arhivata, sau
    daca Data API o refuza o clipa — orice cerere care o pomeneste raspunde cu
    eroare.

    Iar `teanc()` se opreste la PRIMA eroare si intoarce `{ problema }`, care mai
    sus devine `{ eroare }` pentru toata pagina. Deci o dimensiune neinregistrata
    doborа `/admin/analytics` cu totul: utilizatori, sesiuni, pagini, tot.

    `page_group` fusese scos din teanc tocmai de aceea. `cta_id` ramasese inauntru,
    si nimeni n-ar fi aflat pana in ziua in care cineva arhiveaza o dimensiune.

    Proba cere insusirea, nu cele doua nume: ORICE dimensiune personalizata trebuie
    ceruta separat, ca sa cada singura.
  */
  const sursa = readFileSync("src/lib/admin-analytics/rapoarte.ts", "utf8");

  const iTeanc = sursa.indexOf("const cereri");
  assert.ok(iTeanc > 0, "nu mai gasesc teancul de cereri");
  const iSfarsit = sursa.indexOf("await teanc(", iTeanc);
  assert.ok(iSfarsit > iTeanc, "nu mai gasesc chemarea teancului");

  const inTeanc = sursa.slice(iTeanc, iSfarsit);
  const gasite = [...inTeanc.matchAll(/customEvent:([a-z_]+)/g)].map((m) => m[1]);
  assert.deepEqual(
    gasite, [],
    "dimensiuni personalizate in teancul principal: " + gasite.join(", ") +
    " — una neinregistrata in GA4 doboara TOATA pagina, nu doar tabelul ei",
  );

  /* ⚠ Si martorul: cele scoase chiar se cer, separat. Altfel „zero in teanc" s-ar */
  /*    putea obtine si stergandu-le cu totul. */
  for (const dim of ["page_group", "cta_id"]) {
    assert.ok(sursa.includes(`customEvent:${dim}`), `raportul pentru \`${dim}\` a disparut cu totul`);
  }
});
