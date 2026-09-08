import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   BAZA TREBUIE SA SE POATA REFACE DIN BASELINE (08.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE S-A INTAMPLAT. Jobul de CI „schema se aplica pe o baza goala" cadea la pasul „2 functii",
   cu iesirea 3, de saptamani — si cadea la fel pe commiturile de dinaintea lucrarilor Pepita, deci
   nu era o regresie a nimanui, era un rosu pe care nu-l citise nimeni.

   Cauza: baseline-ul emite sectiunea FUNCTII INAINTEA sectiunii TABELE, iar din 166 de functii
   EXACT UNA numea un tip de tabela in semnatura:

       create or replace function public.edinio_revendica_conversii(limita integer)
       returns setof public.edinio_conversion_outbox

   Tabela nu exista inca in clipa aceea. Si nu ajuta `set check_function_bodies = off`: acolo se
   verifica CORPUL, iar aici pica TIPUL, care se rezolva oricum.

   ⚠ CE COSTA. Nu un job rosu. Procedura de refacere din `migrations/CITESTE-INTAI.md` — preludiu
   plus baseline — pur si simplu NU mergea. Adica exact lucrul pentru care baseline-ul exista.

   ⚠ DE CE O PROBA, SI NU DOAR REPARATIA. Reparatia tine pana cand cineva scrie a doua functie cu
   `returns setof <tabela>` — o forma perfect fireasca, pe care Postgres o accepta fara sa
   clipeasca si pe care nici `tsc`, nici testele, nici build-ul n-au cum s-o vada. Se vede abia
   in ziua in care chiar ai nevoie sa refaci baza, si atunci e prea tarziu.

   ⚠ CE NU ACOPERA. Proba citeste baseline-ul, deci vorbeste despre schema din Git. Ca productia
   e la fel o spune alt job („schema din Git = productie"), si ca fisierul chiar se aplica o
   spune jobul de restaurare. Astea trei impreuna sunt intrebarea intreaga; niciuna singura nu e.
*/

const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");

/**
 * Baseline-ul taiat pe sectiuni, exact cum il taie CI-ul (`awk '/^-- ── /{n++}'`).
 *
 * ⚠ ACEEASI TAIETURA, DINADINS. O proba care si-ar inventa propria impartire ar putea trece peste
 * o schema pe care jobul de restaurare o refuza.
 */
function sectiuni(): { titlu: string; corp: string[] }[] {
  const out: { titlu: string; corp: string[] }[] = [{ titlu: "(antet)", corp: [] }];
  for (const linie of baseline.split("\n")) {
    if (linie.startsWith("-- ── ")) out.push({ titlu: linie.slice(6).split(" ─")[0].trim(), corp: [] });
    out[out.length - 1].corp.push(linie);
  }
  return out;
}

const SECTIUNI = sectiuni();
const indice = (titlu: string) => SECTIUNI.findIndex((s) => s.titlu === titlu);

test("⚠ baseline-ul are chiar sectiunile pe care le enumera CI-ul", () => {
  /*
   * Garda probei. Daca generatorul isi schimba marcajele, taietura de mai sus da o singura bucata
   * si TOATE probele de mai jos ar trece pe gol — chiar tiparul impotriva caruia exista.
   * Numarul e cablat si in `.github/workflows/ci.yml`; cand se schimba, se schimba in amandoua.
   */
  assert.equal(SECTIUNI.length, 17, "s-a schimbat numarul de sectiuni: actualizeaza si pasii din ci.yml");
  assert.ok(indice("FUNCTII") > 0, "sectiunea FUNCTII nu s-a gasit");
  assert.ok(indice("TABELE") > 0, "sectiunea TABELE nu s-a gasit");
});

test("⚠ FUNCTIILE se emit INAINTEA tabelelor, deci nu pot numi nicio tabela", () => {
  /* Asta e chiar ipoteza de care atarna proba urmatoare. Scrisa, ca sa nu se piarda. */
  assert.ok(indice("FUNCTII") < indice("TABELE"));
});

/** Numele tabelelor si vederilor din baseline, oricare ar fi schema. */
function tabeleSiVederi(): Set<string> {
  const nume = new Set<string>();
  for (const linie of baseline.split("\n")) {
    const t = linie.match(/^create table if not exists [a-z_]+\.([a-z0-9_]+) \(/);
    if (t) nume.add(t[1]);
    const v = linie.match(/^create or replace view [a-z_]+\.([a-z0-9_]+)/);
    if (v) nume.add(v[1]);
  }
  return nume;
}

/** Bucatile despartite de virgule de la nivelul de sus (`numeric(10,2)` ramane intreg). */
function imparteLaVirgule(s: string): string[] {
  const out: string[] = [];
  let adanc = 0;
  let curent = "";
  for (const c of s) {
    if (c === "(") adanc++;
    if (c === ")") adanc--;
    if (c === "," && adanc === 0) { out.push(curent); curent = ""; continue; }
    curent += c;
  }
  if (curent.trim()) out.push(curent);
  return out;
}

/**
 * Din `p_business_id uuid` ramane `uuid`; din `limita integer` ramane `integer`.
 *
 * ⚠ SE ARUNCA PRIMUL CUVANT, si nu din comoditate: el e NUMELE argumentului (sau al coloanei, in
 * `returns table(...)`), iar un argument are voie sa se cheme ca o tabela. Fara aruncarea asta,
 * un `orders jsonb` ar fi fost raportat drept „functia numeste tabela orders".
 */
function tipulDin(bucata: string): string {
  const cuvinte = bucata.trim().split(/\s+/).filter(Boolean);
  return cuvinte.length > 1 ? cuvinte.slice(1).join(" ") : bucata.trim();
}

test("⚠ nicio functie nu numeste un tip de TABELA in semnatura", () => {
  const tabele = tabeleSiVederi();
  assert.ok(tabele.size > 60, `citite doar ${tabele.size} tabele: proba n-are pe cine cadea`);

  const linii = SECTIUNI[indice("FUNCTII")].corp;
  const vinovate: string[] = [];
  let vazute = 0;

  for (let i = 0; i < linii.length; i++) {
    const antet = linii[i].match(/^CREATE OR REPLACE FUNCTION [a-z_]+\.([a-z0-9_]+)\((.*)\)$/);
    if (!antet) continue;
    vazute++;

    const retur = (linii[i + 1] ?? "").trim();
    assert.match(retur, /^RETURNS /, `functia ${antet[1]} n-are RETURNS pe linia urmatoare`);

    const bucati = imparteLaVirgule(antet[2]).map(tipulDin);
    let r = retur.replace(/^RETURNS\s+/, "").replace(/^SETOF\s+/, "");
    if (r.toUpperCase().startsWith("TABLE(")) {
      bucati.push(...imparteLaVirgule(r.slice("TABLE(".length, -1)).map(tipulDin));
    } else {
      bucati.push(r);
    }

    for (const bucata of bucati) {
      for (const cuvant of bucata.match(/[a-z_][a-z0-9_]*/g) ?? []) {
        if (tabele.has(cuvant)) vinovate.push(`${antet[1]} → ${bucata.trim()}`);
      }
    }
  }

  assert.ok(vazute > 100, `citite doar ${vazute} functii: proba n-are pe cine cadea`);
  assert.deepEqual(vinovate, [],
    "semnatura numeste o tabela care inca nu exista cand se aplica sectiunea FUNCTII; "
    + "scrie coloanele cu `returns table (...)`, ca in 2026-12-30-conversiile-isi-scriu-coloanele.sql");
});
