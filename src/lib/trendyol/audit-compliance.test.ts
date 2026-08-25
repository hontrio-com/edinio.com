import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { atributeLipsaPeVariante } from "./atribute-obligatorii";
import { curataAtribute } from "./mapping";
import type { TrendyolCategoryAttribute, TrendyolProductAttribute } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   AUDITUL TRENDYOL, A DOUA TRANSA (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════ */

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/* ── Atribute cu mai multe valori ──────────────────────────────────────────── */

test("⚠ o lista de valori IMPLINESTE cerinta categoriei", () => {
  /*
   * Taxonomia lor ne spunea de mult `allowMultipleAttributeValues`; noi il citeam si nu-l
   * foloseam nicaieri. Deci pe o categorie cu un atribut multi-select OBLIGATORIU, produsul
   * era oprit ca „fara atributul cerut" chiar dupa ce comerciantul il completase — sau, mai
   * rau, pleca cu o singura valoare si ei il refuzau.
   */
  const cerut: TrendyolCategoryAttribute = {
    attribute: { id: 7, name: "Material" }, required: true, allowMultipleAttributeValues: true,
  };
  const lipsa = atributeLipsaPeVariante(
    [cerut],
    [{ attributes: [{ attributeId: 7, attributeValueIds: [11, 12] }] }],
  );
  assert.deepEqual(lipsa, [], "cu doua valori alese, cerinta e implinita");
});

test("⚠ o lista GOALA nu implineste nimic", () => {
  const cerut: TrendyolCategoryAttribute = {
    attribute: { id: 7, name: "Material" }, required: true, allowMultipleAttributeValues: true,
  };
  const lipsa = atributeLipsaPeVariante([cerut], [{ attributes: [{ attributeId: 7, attributeValueIds: [] }] }]);
  assert.equal(lipsa.length, 1, "declarat fara valori e tot lipsa");
});

test("⚠ in incarcatura NU pleaca amandoua formele", () => {
  /*
   * `attributeValueId` si `attributeValueIds` se exclud la ei. Trimise impreuna, am da doua
   * declaratii despre acelasi atribut si n-am sti pe care o citesc.
   */
  const curatate = curataAtribute([
    { attributeId: 1, attributeValueId: 5, attributeValueIds: [7, 8] },
    { attributeId: 2, attributeValueId: 9 },
    { attributeId: 3, customAttributeValue: "  bumbac  " },
    /* ⚠ Golurile se scot: un `attributeValueIds: []` ar fi spus „declar atributul si n-are
       nicio valoare", ceea ce e mai rau decat sa nu-l trimitem deloc. */
    { attributeId: 4, attributeValueIds: [] },
    { attributeId: 5, customAttributeValue: "   " },
  ] as TrendyolProductAttribute[]);

  assert.deepEqual(curatate, [
    { attributeId: 1, attributeValueIds: [7, 8] },
    { attributeId: 2, attributeValueId: 9 },
    { attributeId: 3, customAttributeValue: "bumbac" },
  ]);
});

test("⚠ si editorul stie sa bifeze, cand categoria ingaduie", () => {
  const ed = viu("src/components/dashboard/TrendyolListingEditor.tsx");
  assert.match(ed, /if \(g\.allowMultipleAttributeValues\) \{/);
  assert.match(ed, /valueIds: \[\.\.\.next\]/);
  /* ⚠ Si lista bate valoarea singura la serializare: cand omul a ales mai multe, aceea e
     alegerea lui. */
  assert.match(ed, /if \(multe\.length > 0\) return \{ attributeId, attributeValueIds: multe \};/);
});

/* ── Reconcilierea ─────────────────────────────────────────────────────────── */

test("⚠ listarile in asteptare se intreaba DIRECT, nu se asteapta cursorul", () => {
  /*
   * ⚠ AUDITUL A SPUS MAI MULT DECAT ERA: „produsele remote care nu sunt in primele 2.000 pot
   * sa nu intre niciodata in mapa". Nu e asa — cursorul se roteste, iar dupa ultima pagina se
   * intoarce la zero, deci scanarea e completa.
   *
   * Ce e adevarat e ca e LENTA: la sapte mii de produse, cinci pagini pe trecere inseamna
   * vreo paisprezece minute pana ajunge cursorul la pagina produsului publicat acum. Iar
   * intrebarea noastra e mica — „a fost aprobat produsul ASTA?" — si `getApprovedProducts`
   * primeste `productMainId`.
   */
  const sync = viu("src/lib/trendyol/sync.ts");
  assert.match(sync, /async function confirmaTintit\(/);
  assert.match(sync, /getApprovedProducts\(ctx\.auth, \{ productMainId: l\.product_main_id, size: 1 \}\)/);
  /* ⚠ Scanarea RAMANE: ea prinde ce intrebarea tintita nu poate. */
  assert.match(sync, /const res = await getApprovedProducts\(ctx\.auth, \{ page, size: 100 \}\);/);
  /* ⚠ Si o eroare la intrebarea tintita nu se citeste ca „nu e aprobat". */
  assert.match(sync, /if \(isTrendyolError\(res\)\) continue;/);
});

test("⚠ si NU infometeaza restul listarilor", () => {
  /*
   * ═══ DEFECTUL A FOST AL MEU, IN ACEEASI ORA ═══
   *
   * Prima forma scria `last_status_at` NUMAI la aprobare. Dar lista se cere ordonata dupa chiar
   * campul asta, cu nulurile intai — deci cele NEAPROBATE ramaneau cu `null`, erau alese din
   * nou la fiecare trecere, si restul nu ajungeau niciodata la rand.
   *
   * ⚠ Masurat: un magazin are 97 de listari in asteptare si se intreaba 20 pe trecere. Aceleasi
   * 20 s-ar fi intrebat la nesfarsit, iar celelalte 77 niciodata — si ar fi aratat ca merge,
   * fiindca primele 20 chiar se confirmau.
   */
  const sursa = viu("src/lib/trendyol/sync.ts");
  const i = sursa.indexOf("async function confirmaTintit(");
  const f = sursa.slice(i, sursa.indexOf("export async function reconcileStatuses(", i));
  assert.doesNotMatch(f, /if \(!gasit\) continue;/, "nu se mai sare fara sa se scrie marcajul");
  assert.match(f, /\.\.\.\(gasit \? \{ status: "approved", error: null \} : \{\}\),/);
  assert.match(f, /last_status_at: now,/);
  /* ⚠ Si ordonarea chiar e pe campul asta, altfel rotatia n-ar avea sens. */
  assert.match(f, /\.order\("last_status_at", \{ ascending: true, nullsFirst: true \}\)/);
});

/* ── auto_publish, independent de auto_sync ────────────────────────────────── */

test("⚠ „trimite automat” stins NU mai opreste publicarea produselor noi", () => {
  /*
   * Panoul are DOUA comutatoare independente, dar taietura se facea la `auto_sync`, iar
   * `auto_publish` se citea abia mai jos — deci nu apuca sa fie intrebat niciodata.
   *
   * Comerciantul care spune „preturile le conduc eu din panoul Trendyol, dar produsele noi sa
   * plece singure" nu primea NIMIC: nici in coada, nici in jurnal, fiindca iesirea era un
   * `return` gol.
   *
   * ⚠ Aceeasi gaura a fost inchisa la eMAG cu o zi inainte. Aici a ramas pana a gasit-o
   * auditul Trendyol.
   */
  const q = viu("src/lib/trendyol/queue.ts");
  assert.match(q, /const publicareCeruta = op === "upsert" && produsNou && config\.auto_publish === true;/);
  assert.match(q, /if \(config\.auto_sync === false && op !== "delete" && !publicareCeruta\) return;/);
});

test("⚠ retragerea trece oricum", () => {
  /* „Mi-am stins sincronizarea automata" nu inseamna „lasa produsul sters din magazin la
     vanzare pe Trendyol". */
  const q = viu("src/lib/trendyol/queue.ts");
  assert.match(q, /op !== "delete"/);
});

test("⚠ si configul necitit nu mai arata ca „magazin fara Trendyol”", () => {
  /* La o pana, `ss` vine `null`, configul iese gol, si functia se oprea exact ca pentru un
     magazin neconectat. Miscarea nu intra in coada NICIODATA, si nimeni nu afla. */
  const q = viu("src/lib/trendyol/queue.ts");
  assert.match(q, /const \{ data: ss, error: eConfig \}/);
  assert.match(q, /if \(eConfig\) \{[\s\S]{0,200}?inghiteDarScrie/);
});

/* ── SGR pe comanda si pe linie ────────────────────────────────────────────── */

test("⚠ SGR se PASTREAZA, dar nu se aduna la total", () => {
  /*
   * Trendyol a adaugat in 2026 `lineSgrFee` si `totalSgrFee` pe comenzi si retururi. Noi stiam
   * SGR doar pe partea de PRODUS — cat declaram la publicare — si pe comanda nu-l citeam
   * deloc. Deci nu puteam sti nici daca totalul il cuprinde, nici cat se intoarce la un retur.
   *
   * ⚠ SI NU SE ADUNA. `packageTotalPrice` e ce a platit clientul; daca garantia e deja
   * inauntru, adunarea ar umfla comanda si ar strica si rambursul, si contabilitatea. Se
   * pastreaza ca sa se poata VERIFICA.
   */
  const o = viu("src/lib/trendyol/orders.ts");
  assert.match(o, /const sgrPachet = num\(pkg\.totalSgrFee\);/);
  assert.match(o, /\.\.\.\(sgrPachet > 0 \? \{ sgr: sgrPachet \} : \{\}\)/);
  assert.match(o, /const sgr = num\(l\.lineSgrFee\);/);

  /* ⚠ Totalul ramane ce au spus EI, neatins. */
  assert.match(o, /const total = num\(pkg\.packageTotalPrice\) \|\| num\(pkg\.totalPrice\)/);
  const i = o.indexOf("const total = num(pkg.packageTotalPrice)");
  assert.doesNotMatch(o.slice(i, i + 400), /total \+ sgr|sgr \+ total/, "nu se aduna nicaieri");
});
