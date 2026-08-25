import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { amprentaContinutului, eanDeTrimis } from "./mapping";

/* ══════════════════════════════════════════════════════════════════════════
   CELE CINCI CONSTATARI ALE AUDITULUI 9.3, VERIFICATE SI REPARATE (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Sase din sapte afirmatii s-au dovedit reale in codul real. Una — „part_number
   nepersistat" — a fost DEMONTATA, si demontarea conteaza: reparatia ceruta ar fi stricat.
   Vezi nota de la sfarsitul fisierului.
*/

const PRODUS = {
  id: "p-1",
  name: "Lesa retractabila",
  description: "text",
  category: "Caini",
  sku: "LES-01",
  weight_grams: 300,
  is_active: true,
  images: ["https://edinio-cdn.com/a.jpg"],
  page_sections: {
    google: { brand: "Acme", gtin: "5941234567890" },
    variants: {
      enabled: true,
      options: [{ name: "Culoare", values: ["Rosu"] }],
      combinations: [
        { title: "Rosu", sku: "LES-01-R", gtin: "5949999999999", enabled: true },
      ],
    },
  },
} as never;

/* ── P1 #1: codul de bare VERIFICAT = codul TRIMIS ───────────────────────── */

test("produsul simplu isi da codul din fisa, chiar cand randul n-are niciunul", () => {
  /*
   * ⚠ CONSTATAREA CEA MAI IMPORTANTA. `asiguraIdentitatile` insereaza sapte coloane si
   * `ean` nu e printre ele, iar singurul scriitor al coloanei e IMPORTUL, din raspunsul
   * LOR. Deci la un produs facut in Edinio randul avea `ean` NULL, filtrul din
   * `cautaInCatalogulLor` dadea lista goala, si `documentation/find_by_eans` nu se chema
   * NICIODATA.
   *
   * ⚠ Nu „la prima publicare": la fiecare publicare, pana la un import complet.
   *
   * Adica toata paza impotriva duplicatului in catalogul lor comun — `atasare`, `inchis`,
   * `nehotarat`, `avem_deja`, plus oprirea adaugata pe 25.08 — rula NUMAI pentru ofertele
   * venite din import, unde duplicatul nici nu se poate produce. Si tacea exact acolo unde
   * se putea.
   */
  assert.equal(eanDeTrimis(PRODUS, null, null), "5941234567890");
});

test("combinatia isi da codul EI, nu pe al produsului", () => {
  /* ⚠ Un cod de bare identifica un ambalaj anume. Cazut pe cel al produsului, fiecare
     marime ar pleca cu ACELASI cod, iar eMAG le-ar lega pe toate de aceeasi pagina. */
  assert.equal(eanDeTrimis(PRODUS, "Rosu", null), "5949999999999");
});

test("ce ne-au spus EI bate ce stim noi", () => {
  /* ⚠ `ident.ean` e codul confirmat de ei pentru chiar oferta aceea. */
  assert.equal(eanDeTrimis(PRODUS, null, "5940000000000"), "5940000000000");
});

test("verificarea si trimiterea folosesc ACEEASI functie", () => {
  /*
   * ⚠ Miezul reparatiei. Doua socoteli separate s-au despartit o data deja: pe 24.08 s-a
   * reparat CE PLEACA (`mapping.ts`), dar nu si CE SE INTREABA (`cautaInCatalogulLor`).
   * Aceeasi propozitie, doua locuri, un singur reparat.
   */
  const m = readFileSync("src/lib/emag/mapping.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const t = readFileSync("src/lib/emag/trimite.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(m, /ean: eanDeTrimis\(produs, null, ident\.ean\)/, "produsul simplu");
  assert.match(m, /ean: eanDeTrimis\(produs, c\.title, ident\.ean\)/, "combinatia");
  assert.match(t, /eanDeTrimis\(produs, r\.variant_title, r\.ean\)/, "verificarea");

  assert.ok(
    !/r\.part_number_key && \(r\.ean \?\? ""\)\.trim\(\)/.test(t),
    "filtrul vechi, care citea numai coloana din baza, n-are voie sa se intoarca",
  );
});

/* ── P1 #4: amprenta, nu marcajul de timp ────────────────────────────────── */

test("stocul si pretul NU pot schimba amprenta continutului", () => {
  /*
   * ⚠ Cea mai subtila dintre constatari. `last_synced_at` se scria la ORICE reusita,
   * inclusiv dupa o miscare de stoc — deci o vanzare petrecuta intre schimbarea de continut
   * si trecerea plasei stergea urma:
   *
   *   10:00 se schimba titlul · punerea in coada se pierde
   *   10:04 se vinde ceva · stocul pleaca · `last_synced_at = 10:04`
   *   10:10 plasa: 10:00 > 10:04 ? NU → „nimic neplecat"
   *
   * Cu cat magazinul vindea mai bine, cu atat plasa era mai oarba.
   */
  const a = amprentaContinutului(PRODUS);
  const cuAltStoc = amprentaContinutului({ ...(PRODUS as object), stock_quantity: 999 } as never);
  const cuAltPret = amprentaContinutului({ ...(PRODUS as object), price: 12345 } as never);

  assert.equal(a, cuAltStoc, "stocul n-are ce cauta in amprenta: are reconcilierea lui");
  assert.equal(a, cuAltPret, "nici pretul");
});

test("orice schimbare de CONTINUT schimba amprenta", () => {
  const a = amprentaContinutului(PRODUS);
  const schimbari: [string, object][] = [
    ["nume", { name: "Altceva" }],
    ["descriere", { description: "alt text" }],
    ["categorie", { category: "Pisici" }],
    ["cod", { sku: "ALT-01" }],
    ["greutate", { weight_grams: 999 }],
    ["imagini", { images: ["https://edinio-cdn.com/b.jpg"] }],
    ["marca", { page_sections: { google: { brand: "Alta", gtin: "5941234567890" } } }],
    ["variante", { page_sections: { variants: { enabled: true, options: [{ name: "Culoare", values: ["Verde"] }], combinations: [] } } }],
  ];
  for (const [ce, patch] of schimbari) {
    assert.notEqual(
      amprentaContinutului({ ...(PRODUS as object), ...patch } as never), a,
      `${ce}: schimbarea nu se vede in amprenta`,
    );
  }
});

test("amprenta e stabila: acelasi continut da acelasi rezultat", () => {
  /* ⚠ Altfel plasa s-ar aprinde la fiecare trecere si ar retrimite catalogul la nesfarsit. */
  assert.equal(amprentaContinutului(PRODUS), amprentaContinutului(PRODUS));
});

test("amprenta se scrie NUMAI de ruta grea, si numai la reusita deplina", () => {
  const t = readFileSync("src/lib/emag/trimite.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  assert.match(t, /amprenta_continut: amprentaContinutului\(produs\)/);
  assert.match(t, /sAIncheiat\(r\.verdict as VerdictEmag\) && !aRamasCeva/,
    "ce n-a plecat intreg nu se marcheaza ca plecat");

  /* ⚠ Nicaieri pe rutele usoare. Scrisa acolo, o miscare de stoc ar „confirma" un continut
     pe care nu l-a trimis — chiar orbirea pe care amprenta o repara. */
  const iStoc = t.indexOf("async function duStocul(");
  const corpStoc = t.slice(iStoc, t.indexOf(String.fromCharCode(10) + "}", iStoc));
  assert.ok(!/amprenta_continut/.test(corpStoc), "ruta de stoc n-are voie s-o atinga");
});

/* ── P1 #3: a doua trecere pentru SKU ────────────────────────────────────── */

test("cand codul a fost omis, amprenta NU se scrie", () => {
  /*
   * ⚠ Asa se naste a doua trecere, fara un al doilea mecanism care sa se strice singur:
   * amprenta nescrisa => plasa vede continutul nesincronizat => repune produsul in coada.
   * La trecerea aceea numele e deja al lor, `schimbaSiNumele` e fals, si codul pleaca.
   */
  const t = readFileSync("src/lib/emag/trimite.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(
    t, /const aRamasCeva = \(oferte as EmagProdusOferta\[\]\)\.some\(\(o\) => !o\.part_number\)/,
    "omisiunea se citeste din INCARCATURA, nu se re-socoteste",
  );
});

/* ── P1 #5: ofertele preluate nu mai stau in limbo ───────────────────────── */

test("rutele usoare recunosc ofertele PRELUATE", () => {
  /*
   * ⚠ O oferta importata are `last_synced_at` gol si `creat_de_edinio: false` — exista la
   * ei, doar ca n-am pus noi mana pe ea. Cu filtrul vechi, prima vanzare de dupa „preia-le
   * in Edinio" raspundea „Produsul nu are nicio ofertă eMAG al cărei stoc să fie
   * actualizat." A treia oara azi cand aceeasi regula scrisa in doua locuri se desparte.
   */
  const t = readFileSync("src/lib/emag/trimite.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const i = t.indexOf("function identitatiUsoare(");
  const corp = t.slice(i, t.indexOf(String.fromCharCode(10) + "}", i));

  assert.match(corp, /\.filter\(ofertaEsteLaEi\)/, "regula casei, nu o copie");
  assert.ok(
    !/last_synced_at != null/.test(corp),
    "copia veche cu un singur martor n-are voie sa se intoarca",
  );
});

/* ── P2: coada nu mosteneste memoria unei pene vechi ─────────────────────── */

test("o cerere noua porneste cu contoarele curate", () => {
  /*
   * ⚠ `pauze` nu se punea la zero niciodata — singurele lui scrieri sunt `+1` in cron. Deci
   * un produs abia atins de comerciant astepta ore pentru o pana de acum o saptamana.
   */
  const q = readFileSync("src/lib/emag/queue.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const upserturi = q.split("upsert(").length - 1;
  assert.ok(upserturi >= 3, `prea putine upsert-uri gasite (${upserturi})`);

  const cate = (q.match(/pauze: 0/g) ?? []).length;
  assert.equal(cate, 3, "toate cele trei cai de punere in coada trebuie sa curete `pauze`");
  assert.equal((q.match(/last_error: null/g) ?? []).length, 3, "si motivul vechi");
});

/* ── Migratia ────────────────────────────────────────────────────────────── */

test("plasa nu socoteste „schimbat” pentru ce n-a masurat", () => {
  /*
   * ⚠ Cronul socoteste amprente pentru o FELIE, nu pentru tot catalogul. Fara verificarea
   * de prezenta in harta, un produs din afara feliei ar fi avut amprenta `NULL`, iar
   * `is distinct from null` e ADEVARAT — plasa ar fi repus in coada tot ce n-a apucat sa
   * masoare. Exact inversul a ceea ce trebuie sa faca.
   */
  const m = readdirSync("migrations")
    .filter((f) => f.includes("amprenta-continutului"))
    .map((f) => readFileSync(`migrations/${f}`, "utf8")).join("");
  assert.ok(m.length > 0, "n-am gasit migratia");

  assert.match(m, /when not \(p_amprente \? p\.id::text\) then false/, "felia");
  assert.match(m, /when o\.amprenta_continut is null then false/,
    "„nu stim ce i-am trimis” nu inseamna „s-a schimbat”");
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ CE NU S-A REPARAT, SI DE CE — `part_number` nepersistat
   ══════════════════════════════════════════════════════════════════════════

   Auditul cerea sa persistam `part_number` pe randurile create de Edinio, ca al doilea
   martor din `chiarEOfertaNoastra` sa participe mereu. Premisa e adevarata: nicio cale de
   publicare nu scrie coloana (masurat pe productie: 924 din 964 de randuri `creat_de_edinio`
   o au NULL).

   Dar consecinta NU urmeaza, si reparatia ar fi stricat:

   1. Al doilea martor apara EXCLUSIV impotriva reciclarii id-ului, iar reciclarea nu poate
      atinge randurile fara martor. `2026-09-19-emag-id-pe-magazin.sql` reporneste sirul la
      1.000.000.000, iar `emag_ridica_sirurile` (chemata din `import-run.ts:657`) il impinge
      peste orice id preluat. Masurat: cele 3.714 randuri de import au id maxim 603.049.089
      si ZERO `part_number` NULL; cele 964 de randuri publicate din Edinio au toate
      `emag_id >= 1.000.000.000`. Martorul lipseste exact acolo unde reciclarea nu ajunge.

   2. Iar „reparatia" evidenta — sa salvam codul socotit la trimitere — ar fi introdus un
      defect NOU: `mapping.ts` omite `part_number` cand se schimba si numele, deci codul
      nostru local ar fi putut diferi de cel tinut de ei, iar `chiarEOfertaNoastra` ar fi dat
      o NEPOTRIVIRE falsa si ar fi refuzat o legare buna de comanda.

   Valoarea comparabila e cea ECOATA de ei, si aceea o scrie deja importul.

   ⚠ Se lasa asa DINADINS, nu din scapare. Iar daca vreodata un comerciant are la eMAG
   id-uri peste un miliard, se rupe intai ciocnirea de id la ei, nu potrivirea comenzii.
*/

test("despartirea intervalelor de id chiar e mentinuta", () => {
  /* ⚠ Toata argumentatia de mai sus atarna de asta. Daca apelul dispare, martorul lipsa
     redevine o gaura adevarata — si atunci constatarea auditului se reactiveaza. */
  const importRun = readFileSync("src/lib/emag/import-run.ts", "utf8");
  assert.match(importRun, /rpc\("emag_ridica_sirurile"/, "importul trebuie sa ridice sirurile");
});
