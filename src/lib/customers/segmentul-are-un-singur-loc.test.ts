import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { SEGMENTE } from "./filtre";
import {
  CRITERII_GOALE, adresaSegmentului, catiIn, criteriiGoale, criteriiValide,
  descrieCriteriile, numeValid, type CriteriiSegment,
} from "./segmente";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CINE INTRA INTR-UN SEGMENT SE HOTARASTE INTR-UN SINGUR LOC   (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fila „Segmente" spune CATI oameni sunt in fiecare segment, iar lista arata
 * CARE sunt. Cea mai la indemana scriere ar fi fost sa aiba fiecare `case`-ul ei.
 *
 * ⚠⚠ ATUNCI CELE DOUA S-AR FI DESPARTIT, si nu s-ar fi vazut: placa ar fi spus
 * „98 de inactivi", lista deschisa de pe ea ar fi aratat 140, si niciuna n-ar fi
 * dat vreo eroare. Un comerciant nu are cum sa afle care dintre ele minte.
 *
 * De-aia regula a fost MUTATA in `customer_in_segment`, iar proba asta apara
 * mutarea: daca cineva scrie a doua oara conditiile, pica aici.
 */

/*
  ⚠⚠ `000-schema-baseline.sql` NU E O MIGRATIE, e o FOTOGRAFIE generata din
  productie cu `pg_dump`. Citita ca migratie, probele de aici ar fi masurat textul
  masinii in loc de textul scris de om — si, fiind prima alfabetic, ar fi fost si
  cea gasita prima.

  S-a intamplat chiar asa, pe 21.09.2026: dupa regenerarea liniei de baza, doua
  probe au picat deodata, spunand „bucata gasita are 0 semne". Nu se stricase
  nimic: se schimbase ce citeau ele.
*/
const DOSAR = "migrations";
/*
  ⚠ SORTATE PE NUME, fiindca numele incep cu data aplicarii: asa „ultima” e
  chiar ultima aplicata. `readdirSync` da ordinea sistemului de fisiere, care pe
  Windows nu e cea alfabetica — masurat: chiar nu e. Luata asa cum vine, proba ar
  fi citit cand o definitie, cand alta, si ar fi trecut sau picat dupa noroc.
*/
const FISIERE = readdirSync(DOSAR)
  .filter((f) => f.endsWith(".sql") && !f.startsWith("000-"))
  .sort();

/** Textul tuturor migratiilor, fiecare cu numele ei. */
const MIGRATII = FISIERE.map((f) => ({ f, text: readFileSync(join(DOSAR, f), "utf8") }));

/** Randurile unui fisier SQL, fara comentariile `--`. */
function faraComentarii(text: string): string {
  return text
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");
}

test("⚠ fisierele chiar au fost gasite, altfel proba n-are ce citi", () => {
  /* O cautare care nu gaseste nimic trece pe tacute. Vezi `ancora-negasita`. */
  assert.ok(FISIERE.length > 20, `am gasit doar ${FISIERE.length} migratii`);
  assert.ok(
    MIGRATII.some((m) => m.text.includes("create or replace function public.customer_in_segment")),
    "nu gasesc deloc functia `customer_in_segment`",
  );
});

/**
 * Ultima migratie care defineste o functie — adica cea care e vie azi.
 *
 * ⚠ DOSARUL DE MIGRATII E ISTORIE, nu stare: o regula mutata ramane scrisa in
 * fisierul de unde a plecat, si asa trebuie sa ramana. Deci nu se numara peste
 * tot istoricul (proba ar fi picat pe fisierul vechi, care e corect asa), ci se
 * citeste DEFINITIA CARE E IN BAZA ACUM: ultima, dupa numele fisierelor.
 */
function ultimaDefinitie(numeFunctie: string): { f: string; corp: string } {
  /* ⚠ Ancora e CREAREA, nu numele: `function public.<nume>(` se potriveste si pe
     randurile de `revoke` de dupa, iar cautarea de la coada ar fi cazut pe ele si ar
     fi masurat o bucata de cateva zeci de semne in loc de corpul functiei. */
  const ancora = `create or replace function public.${numeFunctie}(`;
  const gasite = MIGRATII.filter((m) => m.text.includes(ancora));
  assert.ok(gasite.length > 0, `nicio migratie nu defineste ${numeFunctie}`);

  const m = gasite[gasite.length - 1];
  const de = m.text.lastIndexOf(ancora);
  /* Corpul tine pana la `revoke`-urile de dupa el; daca lipsesc, pana la sfarsit. */
  const panaLa = m.text.indexOf(`revoke all on function public.${numeFunctie}`, de);
  return { f: m.f, corp: m.text.slice(de, panaLa === -1 ? undefined : panaLa) };
}

test("⚠ numele migratiilor incep cu data, altfel sortarea nu inseamna ordine", () => {
  /*
   * Toata proba de mai jos se sprijina pe asta: „ultima definitie” = ultimul
   * fisier in ordine alfabetica. Un fisier botezat altfel s-ar fi asezat aiurea
   * in sir, iar proba ar fi masurat o definitie moarta crezand ca e cea vie.
   */
  const fara = FISIERE.filter((f) => !/^(000-|\d{4}-\d{2}-\d{2}-)/.test(f));
  assert.deepEqual(fara, [], `migratii fara data in nume: ${fara.join(", ")}`);
});

test("⚠⚠ LISTA nu mai poarta regula segmentelor: o cheama", () => {
  /*
   * Asta e regresia de aparat. Cineva rescrie `customers_aggregate` — adauga un
   * filtru, schimba o sortare — si lipeste inapoi `case`-ul, fiindca asa era
   * inainte. Din clipa aceea placa si lista socotesc fiecare pe cont propriu.
   */
  const lista = ultimaDefinitie("customers_aggregate");
  assert.ok(lista.corp.length > 400, `bucata gasita are ${lista.corp.length} semne`);

  for (const seg of SEGMENTE) {
    if (seg === "toti") continue; /* „toti” e `true`, n-are conditie proprie. */
    assert.ok(
      !lista.corp.includes(`when '${seg}' then`),
      `${lista.f}: lista si-a scris din nou conditia segmentului „${seg}”`,
    );
  }
  assert.ok(lista.corp.includes("public.customer_in_segment("), "lista nu mai cheama regula deloc");
});

test("⚠⚠ si REGULA le are pe toate, nu doar pe unele", () => {
  /*
   * Perechea celei de sus. Fara ea, un segment scos din `customer_in_segment` ar
   * fi cazut pe `else true` — adica ar fi aratat TOT magazinul sub numele unui
   * segment ingust, tacut si convingator.
   */
  const regula = ultimaDefinitie("customer_in_segment");
  for (const seg of SEGMENTE) {
    if (seg === "toti") continue;
    assert.ok(
      regula.corp.includes(`when '${seg}' then`),
      `${regula.f}: regula nu mai stie segmentul „${seg}”`,
    );
  }
});

test("⚠ lista din numaratoare e ACEEASI cu cea din TypeScript, in aceeasi ordine", () => {
  /*
   * Numaratoarea isi tine segmentele intr-un `array[...]` al ei. Un segment
   * adaugat numai in TypeScript ar fi aparut pe ecran ca placa fara cifra; unul
   * adaugat numai in SQL ar fi fost numarat degeaba. Ordinea conteaza fiindca
   * numaratoarea se intoarce dupa `rang`.
   */
  const m = MIGRATII.find((x) => x.text.includes("customer_segment_counts"));
  assert.ok(m, "nu gasesc migratia numaratorii");

  const corp = m.text.slice(
    m.text.indexOf("returns table (segment text, cati bigint)"),
    m.text.indexOf("revoke all on function public.customer_segment_counts"),
  );
  assert.ok(corp.length > 200, `bucata gasita are ${corp.length} semne`);

  const lista = corp.slice(corp.indexOf("unnest(array["), corp.indexOf("]) with ordinality"));
  const dinSql = [...lista.matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]);
  assert.deepEqual(dinSql, [...SEGMENTE]);
});

/* ── Criteriile venite din baza ─────────────────────────────────────────── */

test("⚠⚠ criteriile din `jsonb` se curata, oricat de stricate ar fi", () => {
  /*
   * ⚠ Coloana e `jsonb`: in ea incape orice. Un segment salvat inainte ca un
   * filtru sa fie redenumit ar fi trimis catre RPC un segment inexistent — si
   * atunci pagina ar fi aratat TOT magazinul sub numele unui segment ingust,
   * adica cea mai rea forma de minciuna: una care arata a lista buna.
   */
  assert.deepEqual(criteriiValide(null), CRITERII_GOALE);
  assert.deepEqual(criteriiValide("recurenti"), CRITERII_GOALE);
  assert.deepEqual(criteriiValide([1, 2]), CRITERII_GOALE);
  assert.deepEqual(criteriiValide({}), CRITERII_GOALE);

  assert.equal(criteriiValide({ segment: "segment-scos-din-lista" }).segment, "toti");
  assert.equal(criteriiValide({ segment: 7 }).segment, "toti");
  assert.equal(criteriiValide({ segment: "recurenti" }).segment, "recurenti");
});

test("⚠ o treapta de valoare NECUNOSCUTA se scoate, nu se trece mai departe", () => {
  /*
   * Trecuta mai departe, ar fi ajuns la `treaptaValoare` care da `null`, deci
   * `p_valoare_min` nedefinit: filtrul de valoare ar fi disparut in tacere, iar
   * segmentul „peste 1.000 lei" ar fi aratat pe toata lumea.
   */
  assert.equal(criteriiValide({ valoare: "100-300" }).valoare, null);
  assert.equal(criteriiValide({ valoare: "200-500" }).valoare, "200-500");
});

test("cautarea se taie la 80 de semne, ca in adresa", () => {
  assert.equal(criteriiValide({ q: "  ana  " }).q, "ana");
  assert.equal(criteriiValide({ q: "x".repeat(200) }).q.length, 80);
});

test("⚠ criterii goale inseamna tot magazinul, si se poate spune asta", () => {
  /* Un segment fara niciun filtru e o capcana: arata ca un segment si nu e unul. */
  assert.equal(criteriiGoale(CRITERII_GOALE), true);
  assert.equal(criteriiGoale({ ...CRITERII_GOALE, segment: "vip", valoare: null, q: "" }), false);
  assert.equal(criteriiGoale({ ...CRITERII_GOALE, segment: "toti", valoare: "200-500", q: "" }), false);
  assert.equal(criteriiGoale({ ...CRITERII_GOALE, segment: "toti", valoare: null, q: "ana" }), false);
});

/* ── Cum se citeste si unde duce ────────────────────────────────────────── */

test("⚠ descrierea spune CE filtreaza, nu cate filtre are", () => {
  assert.equal(
    descrieCriteriile({ ...CRITERII_GOALE, segment: "vip", valoare: "200-500", q: "ana" }),
    "Clienți VIP · 200 – 500 lei · caută „ana”",
  );
  assert.equal(descrieCriteriile(CRITERII_GOALE), "Toți clienții");
});

test("⚠ adresa segmentului nu poarta filtre care nu-s puse", () => {
  /*
   * `?segment=toti&valoare=` ar fi fost aceeasi lista, dar adresa ar fi aratat
   * a filtru pus, iar bara de filtre ar fi numarat unul.
   */
  assert.equal(adresaSegmentului(CRITERII_GOALE), "/dashboard/customers");
  assert.equal(
    adresaSegmentului({ ...CRITERII_GOALE, segment: "recurenti", valoare: null, q: "" }),
    "/dashboard/customers?segment=recurenti",
  );
});

test("⚠ cautarea se codeaza in adresa, cu diacritice cu tot", () => {
  const a = adresaSegmentului({ ...CRITERII_GOALE, segment: "toti", valoare: null, q: "Ioană Popescu" });
  assert.ok(!a.includes(" "), `adresa are spatiu in ea: ${a}`);
  assert.equal(new URL(a, "https://x.ro").searchParams.get("q"), "Ioană Popescu");
});

/* ── Cifra de pe placa ──────────────────────────────────────────────────── */

test("⚠ „inca nu stiu” si „zero” nu sunt acelasi lucru", () => {
  /*
   * Amandoua ar fi desenat „0" pe placa. Dar zero inseamna „n-ai niciun client
   * VIP", pe cand necunoscutul inseamna „baza n-a raspuns" — si al doilea nu are
   * voie sa se dea drept primul.
   */
  assert.equal(catiIn(null, "vip"), null);
  assert.equal(catiIn([], "vip"), 0);
  assert.equal(catiIn([{ segment: "vip", cati: 25 }], "vip"), 25);
  assert.equal(catiIn([{ segment: "noi", cati: 88 }], "vip"), 0);
});

/* ── Numele ─────────────────────────────────────────────────────────────── */

test("numele se curata, si refuzul spune de ce", () => {
  assert.deepEqual(numeValid("  Clienti   buni "), { nume: "Clienti buni" });
  assert.ok("eroare" in numeValid("   "));
  assert.ok("eroare" in numeValid("x".repeat(61)));
  assert.match((numeValid("x".repeat(61)) as { eroare: string }).eroare, /prea lung/);
});

/* ── Numele unic ────────────────────────────────────────────────────────── */

test("⚠⚠ baza normalizeaza numele LA FEL ca `numeValid`, nu se bizuie pe el", () => {
  /*
   * ⚠ MASURAT, NU PRESUPUS. Prima scriere avea indexul pe `lower(nume)` simplu,
   * iar curatarea spatiilor statea numai aici, in TypeScript. Probat pe demo:
   * „  vip DE valoare Medie  " a intrat linistit pe langa „VIP de valoare medie".
   *
   * Prin pagina n-ar fi trecut, fiindca pagina curata intai. Dar atunci unicitatea
   * din baza ar fi atarnat de o functie din alt limbaj — si ar fi cazut la primul
   * import, la prima actiune noua, sau la prima reparatie facuta de mana in SQL.
   *
   * Proba cere ca indexul sa faca amandoua: minuscule SI spatii stranse.
   */
  const m = MIGRATII.find((x) => x.text.includes("customer_segments_nume_uidx"));
  assert.ok(m, "nu gasesc migratia indexului de nume");

  const linie = m.text
    .split("\n")
    .find((l) => l.includes("on public.customer_segments (business_id"));
  assert.ok(linie, "nu gasesc randul indexului");

  assert.match(linie, /lower\(/, "indexul nu mai face numele minuscule");
  assert.match(linie, /btrim\(/, "indexul nu mai taie spatiile de la capete");
  assert.match(linie, /regexp_replace\(nume/, "indexul nu mai strange spatiile dinauntru");

  /* Si partea de TypeScript face chiar cele doua lucruri. */
  const n = numeValid("  Doua   Cuvinte  ");
  assert.deepEqual(n, { nume: "Doua Cuvinte" });
});

/* ── Criteriile poarta TOATE filtrele ───────────────────────────────────── */

test("⚠⚠ un filtru nou nu se poate pierde tacut la salvarea segmentului", () => {
  /*
   * ⚠ ASTA E DEFECTUL DE CARE MA TEM CEL MAI TARE LA SEGMENTE, si e chiar cel
   * pentru care n-am legat segmentele de campaniile SMS: un criteriu care pleaca
   * pe jumatate.
   *
   * Un segment salvat cat timp criteriile nu stiu de judet ar pastra numai
   * jumatate din filtru. Deschis a doua zi, ar arata TOATA tara sub un nume care
   * spune „Clientii mei din Cluj" — si nimeni n-ar avea de unde sa banuiasca,
   * fiindca lista chiar are clienti in ea. Daca de pe el pleaca si o campanie,
   * mesajul ajunge la oameni carora nu le era destinat.
   *
   * Proba cere ca FIECARE camp al criteriilor sa ajunga si in descriere, si in
   * adresa. Un camp adaugat fara sa fie dus mai departe pica aici.
   */
  const pline: CriteriiSegment = {
    segment: "vip", valoare: "200-500", q: "ana", judet: "Cluj", canal: "emag",
  };

  /* Fiecare camp e un criteriu, si toate trebuie sa se vada undeva. */
  const campuri = Object.keys(pline) as (keyof CriteriiSegment)[];
  assert.equal(campuri.length, 5, "s-a adaugat un criteriu: du-l si in descriere, si in adresa");

  const descriere = descrieCriteriile(pline);
  const adresa = new URL(adresaSegmentului(pline), "https://x.ro");

  assert.match(descriere, /Clienți VIP/);
  assert.match(descriere, /200 – 500 lei/);
  assert.match(descriere, /Cluj/);
  assert.match(descriere, /eMAG/, "canalul se scrie cu numele lui, nu cu slug-ul");
  assert.match(descriere, /ana/);

  assert.equal(adresa.searchParams.get("segment"), "vip");
  assert.equal(adresa.searchParams.get("valoare"), "200-500");
  assert.equal(adresa.searchParams.get("judet"), "Cluj");
  assert.equal(adresa.searchParams.get("canal"), "emag");
  assert.equal(adresa.searchParams.get("q"), "ana");
});

test("⚠ un segment cu DOAR judet nu e „gol”", () => {
  /*
   * `criteriiGoale` opreste salvarea unui segment fara filtre. Nemodificata
   * odata cu criteriile, ar fi refuzat „Clientii mei din Cluj" spunand ca n-are
   * niciun filtru — un refuz de neinteles peste un filtru care se vede pe ecran.
   */
  assert.equal(criteriiGoale({ ...CRITERII_GOALE, judet: "Cluj" }), false);
  assert.equal(criteriiGoale({ ...CRITERII_GOALE, canal: "emag" }), false);
  assert.equal(criteriiGoale(CRITERII_GOALE), true);
});

test("⚠ judetul si canalul se curata cand vin din `jsonb`", () => {
  assert.equal(criteriiValide({ judet: "  Cluj  " }).judet, "Cluj");
  assert.equal(criteriiValide({ judet: "   " }).judet, null);
  assert.equal(criteriiValide({ judet: 7 }).judet, null);
  assert.equal(criteriiValide({ canal: "emag" }).canal, "emag");
  assert.equal(criteriiValide({}).canal, null);
});
