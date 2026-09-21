import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  CODURI_PE_PAGINA, FILTRE_STARE, NUMELE_FILTRULUI, NUMELE_SORTARII, SORTARI,
  cateLaFiltru, filtreCuRost, filtruValid, sortareValida,
} from "./filtre";
import { catePagini, rezumatulPaginii } from "./lista";
import { STARI, stareaCodului, type CodDeJudecat } from "./stare";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * REGULA DE STARE E ACEEASI PE ECRAN SI IN BAZA                  (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ DE CE EXISTA PROBA ASTA, SI CE A INLOCUIT.
 *
 * Pana ieri filtrarea se facea in memoria browserului, si regula de stare era
 * scrisa INTR-UN SINGUR LOC (`stare.ts`). Proba de atunci —
 * `filtrul-intreaba-aceeasi-regula.test.ts` — cerea doar ca filtrul si eticheta
 * sa cheme aceeasi functie. S-a sters odata cu filtrarea din memorie.
 *
 * De cand lista se pagineaza in Postgres, filtrul trebuie sa aleaga randurile IN
 * BAZA, iar eticheta trebuie desenata pe ecran. Deci regula e acum in DOUA
 * copii: `public.discount_state` si `stareaCodului`.
 *
 * Doua copii se despart. Iar cand se vor desparti, filtrul „Expirate" va arata
 * alte coduri decat cele scrise „Expirat" in tabel — si nimic nu va da vreo
 * eroare. Proba asta le tine lipite, comparand ordinea si conditiile din corpul
 * functiei SQL cu cele din TypeScript.
 */

const DOSAR = "migrations";
const MIGRATII = readdirSync(DOSAR)
  .filter((f) => f.endsWith(".sql") && !f.startsWith("000-")).sort()
  .map((f) => ({ f, text: readFileSync(join(DOSAR, f), "utf8") }));

const SEMN = "create or replace function public.discount_state(";
const M = MIGRATII.filter((m) => m.text.includes(SEMN)).at(-1);

test("⚠ migratia chiar a fost gasita, altfel proba n-are ce citi", () => {
  assert.ok(M, "nicio migratie nu defineste `public.discount_state`");
});

/** Corpul functiei, taiat pana la `$function$;` ca sa nu imprumute de la vecin. */
const SQL = (() => {
  const t = M!.text;
  const de = t.indexOf(SEMN);
  return t.slice(de, t.indexOf("$function$;", de));
})();

test("⚠⚠ ORDINEA starilor e aceeasi in baza si pe ecran", () => {
  /*
   * Un cod poate fi deodata oprit, expirat SI epuizat. Pe rand incape o singura
   * eticheta, si trebuie sa fie cea care spune ce ai de facut INTAI. Inversata
   * in SQL, filtrul „Oprite" ar fi scos coduri scrise „Expirat" in tabel.
   */
  const inSql = [...SQL.matchAll(/then '(\w+)'/g)].map((m) => m[1]);
  inSql.push(/else 'activ'/.test(SQL) ? "activ" : "?");

  /*
   * Ordinea de pe ecran nu se scrie de mana aici: se AFLA, punand `stareaCodului`
   * in fata unui cod care are toate pricinile deodata si scotandu-le pe rand.
   * Scrisa de mana, proba ar fi fost a treia copie a aceleiasi reguli.
   */
  const acum = Date.UTC(2026, 8, 22, 12);
  const ieri = new Date(acum - 86_400_000).toISOString();
  const maine = new Date(acum + 86_400_000).toISOString();

  const toateDeodata: CodDeJudecat = {
    is_active: false, starts_at: maine as string | null, expires_at: ieri as string | null,
    max_uses: 2 as number | null, uses_count: 2,
  };
  const peEcran: string[] = [];
  let d = { ...toateDeodata };
  peEcran.push(stareaCodului(d, acum));            // oprit
  d = { ...d, is_active: true };
  peEcran.push(stareaCodului(d, acum));            // expirat
  d = { ...d, expires_at: null };
  peEcran.push(stareaCodului(d, acum));            // epuizat
  d = { ...d, max_uses: null };
  peEcran.push(stareaCodului(d, acum));            // programat
  d = { ...d, starts_at: null };
  peEcran.push(stareaCodului(d, acum));            // activ

  assert.deepEqual(inSql, peEcran,
    `baza judeca in ordinea ${inSql.join(" → ")}, ecranul in ${peEcran.join(" → ")}`);
});

test("⚠⚠ si CONDITIILE sunt aceleasi, nu doar ordinea", () => {
  /*
   * O margine mutata — `>` in loc de `>=` la plafon, sau `<=` in loc de `<` la
   * data — ar fi pus un cod pe o parte pe ecran si pe cealalta in filtru, exact
   * la granita unde se si intampla lucrurile.
   */
  assert.match(SQL, /when not p_is_active then 'oprit'/);
  assert.match(SQL, /p_expires_at is not null and p_expires_at < now\(\) then 'expirat'/);
  assert.match(SQL, /p_max_uses is not null and p_uses_count >= p_max_uses then 'epuizat'/);
  assert.match(SQL, /p_starts_at is not null and p_starts_at > now\(\) then 'programat'/);

  /* Si oglinda lor din `stare.ts`, citita ca text. */
  const ts = readFileSync("src/lib/discounts/stare.ts", "utf8");
  assert.match(ts, /if \(!d\.is_active\) return "oprit"/);
  assert.match(ts, /pana !== null && pana < acum/);
  assert.match(ts, /d\.max_uses !== null && d\.uses_count >= d\.max_uses/);
  assert.match(ts, /de !== null && de > acum/);
});

test("⚠⚠ cele cinci stari sunt aceleasi cinci, scrise la fel", () => {
  /*
   * Un nume scris altfel intr-o parte („inactiv" in loc de „oprit") ar fi facut
   * ca filtrul sa nu gaseasca niciodata nimic — iar cifra de langa el ar fi fost
   * zero, deci optiunea nici n-ar fi aparut in meniu. Un defect care se ascunde
   * singur.
   */
  const inSql = new Set([...SQL.matchAll(/'(\w+)'/g)].map((m) => m[1]));
  for (const s of STARI) assert.ok(inSql.has(s), `starea „${s}” lipseste din SQL`);
  assert.equal(inSql.size, STARI.length, `SQL are si alte stari: ${[...inSql].join(", ")}`);
});

test("⚠ ceasul e al BAZEI, nu unul primit de la apelant", () => {
  /*
   * `now()` se judeca pe ceasul Postgresului. Primit ca argument, ar fi venit de
   * la partea care intreaba — si atunci doua ecrane deschise deodata ar fi putut
   * vedea stari deosebite pentru acelasi cod.
   */
  assert.ok(!SQL.includes("p_acum"), "ceasul a ajuns argument");
  assert.equal(SQL.split("now()").length - 1, 2, "nu se mai intreaba ceasul bazei de doua ori");
});

/* ── Paginarea ──────────────────────────────────────────────────────────── */

test("⚠⚠ pagina se cere din BAZA, nu se taie din lista adusa", () => {
  /*
   * Defectul de care ne aparam: cineva „simplifica" aducand iar toate codurile
   * si taindu-le in browser. Merge pana la o mie de randuri — plafonul PostgREST
   * — si de acolo lista se taie IN TACERE, fara nicio eroare.
   */
  const pagina = readFileSync("src/app/(dashboard)/dashboard/discounts/page.tsx", "utf8");
  assert.match(pagina, /rpc\("discounts_page"/);
  assert.match(pagina, /page_limit: CODURI_PE_PAGINA/);
  assert.match(pagina, /page_offset: \(pagina - 1\) \* CODURI_PE_PAGINA/);
  assert.ok(!/from\("discounts"\)/.test(pagina), "pagina cere iar toata tabela de coduri");
});

test("⚠⚠ cifrele din cap se socotesc pe TOT magazinul, nu pe pagina", () => {
  /*
   * Adunate din lista adusa — cum erau pana azi — ar fi SCAZUT cu fiecare pagina
   * rasfoita. Un raport care scade cand rasfoiesti e mai rau decat niciun raport.
   */
  const pagina = readFileSync("src/app/(dashboard)/dashboard/discounts/page.tsx", "utf8");
  assert.match(pagina, /rpc\("discount_totaluri"/);

  const client = readFileSync("src/components/dashboard/DiscountsClient.tsx", "utf8");
  assert.ok(!/reduce\(\(t, c\) => t \+ c\.comenziValide/.test(client),
    "cifrele din cap se aduna iar din lista adusa");
});

test("⚠⚠ cifrele de langa filtre se numara peste CAUTARE, in baza", () => {
  /*
   * Altfel omul cauta „VARA", vede „Expirate (3)" si apasa, iar lista iese goala
   * fiindca cele trei expirate erau alte coduri. Socotite din pagina adusa,
   * cifra ar fi insemnat „atatea pe pagina asta".
   */
  const pagina = readFileSync("src/app/(dashboard)/dashboard/discounts/page.tsx", "utf8");
  assert.match(pagina, /rpc\("discount_state_counts", \{ bid: row\.id, search: q \|\| null \}\)/);
});

test("paginile se numara de la unu, si un magazin gol are tot o pagina", () => {
  /* „Pagina 1 din 0" ar fi fost o propozitie fara inteles pe un magazin nou. */
  assert.equal(catePagini(0, 25), 1);
  assert.equal(catePagini(1, 25), 1);
  assert.equal(catePagini(25, 25), 1);
  assert.equal(catePagini(26, 25), 2);
  assert.equal(catePagini(137, 25), 6);
});

test("⚠⚠ sub lista scrie CATE SUNT IN TOT, nu cate incap pe pagina", () => {
  /*
   * O lista care arata douazeci si cinci de randuri fara sa spuna cate sunt il
   * lasa pe comerciant sa creada ca atatea are.
   */
  assert.equal(rezumatulPaginii(0, 1, 25), "Niciun cod");
  assert.equal(rezumatulPaginii(1, 1, 25), "1 cod");
  assert.equal(rezumatulPaginii(11, 1, 25), "11 coduri");
  assert.equal(rezumatulPaginii(137, 1, 25), "1–25 din 137 de coduri");
  assert.equal(rezumatulPaginii(137, 6, 25), "126–137 din 137 de coduri");
});

/* ── Ce vine din adresa ─────────────────────────────────────────────────── */

test("⚠ un filtru sau o sortare necunoscuta cade pe implicit, nu pe o lista goala", () => {
  assert.equal(filtruValid("expirat"), "expirat");
  assert.equal(filtruValid("inventat"), "toate");
  assert.equal(filtruValid(null), "toate");
  assert.equal(sortareValida("folosite"), "folosite");
  assert.equal(sortareValida("dupa-noroc"), "noi");
});

test("fiecare filtru si fiecare sortare are un nume pe ecran", () => {
  for (const f of FILTRE_STARE) assert.ok(NUMELE_FILTRULUI[f]?.length > 3, f);
  for (const s of SORTARI) assert.ok(NUMELE_SORTARII[s]?.length > 3, s);
});

test("⚠⚠ nu se ofera filtre pe care nu cade niciun cod", () => {
  /*
   * O optiune „Programate" intr-un magazin fara niciun cod programat nu e o
   * functie in plus, e o promisiune goala care il trimite pe om sa caute un
   * defect.
   */
  assert.deepEqual(filtreCuRost({ activ: 2 }, "toate"), ["toate", "activ"]);
});

test("⚠ filtrul ALES acum ramane in meniu, chiar daca nu mai gaseste nimic", () => {
  /*
   * Altfel meniul si-ar pierde sub deget optiunea pe care omul tocmai a
   * apasat-o, si ar sari inapoi pe „toate" fara sa spuna nimeni de ce.
   */
  assert.ok(filtreCuRost({ activ: 1 }, "expirat").includes("expirat"));
  assert.ok(!filtreCuRost({ activ: 1 }, "toate").includes("expirat"));
});

test("⚠ cifra de langa „Toate” e suma celorlalte, nu zero", () => {
  /*
   * Baza intoarce cate un rand pe stare, si niciunul pentru „toate": el nu e o
   * stare, e lipsa unui filtru. Citit direct din harta, ar fi scris „(0)" langa
   * optiunea care le arata pe toate.
   */
  assert.equal(cateLaFiltru({ activ: 6, oprit: 3, expirat: 1, epuizat: 1 }, "toate"), 11);
  assert.equal(cateLaFiltru({ activ: 6, oprit: 3 }, "activ"), 6);
  assert.equal(cateLaFiltru({ activ: 6 }, "programat"), 0);
});

test("cate coduri incap pe o pagina", () => {
  assert.equal(CODURI_PE_PAGINA, 25);
});
