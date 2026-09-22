import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  CUVINTELE_OFERTELOR, FILTRE_STARE, NUMELE_FILTRULUI, NUMELE_SORTARII, OFERTE_PE_PAGINA, SORTARI,
  cateLaFiltru, filtreCuRost, filtruValid, sortareValida, stareDinBaza,
} from "./filtre";
import { rezumatulPaginii } from "@/lib/dashboard/paginare";
import { STARI_OFERTA, stareaOfertei, type OfertaDeJudecat } from "./stare";
import { rataDeAcceptare } from "./lista";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * STAREA UNEI OFERTE E ACEEAȘI PE ECRAN ȘI ÎN BAZĂ               (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * De când lista se paginează în Postgres, filtrul alege rândurile ÎN BAZĂ, iar
 * eticheta se desenează pe ecran. Deci regula e în DOUĂ copii:
 * `public.offer_state` și `stareaOfertei`.
 *
 * Două copii se despart. Iar când se vor despărți, filtrul „Expirate” va arăta
 * alte oferte decât cele scrise „Expirată” în tabel — și nimic nu va da vreo
 * eroare. Proba asta le ține lipite, comparând ordinea ȘI condițiile din corpul
 * funcției SQL cu cele din TypeScript.
 *
 * ⚠ E sora probei de la coduri (`lib/discounts/starea-e-aceeasi-si-in-baza`),
 * nu o copie a ei: ofertele au PATRU stări, nu cinci, și alt nume de coloană
 * pentru capătul de sus (`ends_at`, nu `expires_at`).
 */

const DOSAR = "migrations";
const MIGRATII = readdirSync(DOSAR)
  .filter((f) => f.endsWith(".sql") && !f.startsWith("000-")).sort()
  .map((f) => ({ f, text: readFileSync(join(DOSAR, f), "utf8") }));

const SEMN = "create or replace function public.offer_state(";
const M = MIGRATII.filter((m) => m.text.includes(SEMN)).at(-1);

test("⚠ migrația chiar a fost găsită, altfel proba n-are ce citi", () => {
  assert.ok(M, "nicio migrație nu definește `public.offer_state`");
});

/** Corpul funcției, tăiat până la `$function$;` ca să nu împrumute de la vecin. */
const SQL = (() => {
  const t = M!.text;
  const de = t.indexOf(SEMN);
  return t.slice(de, t.indexOf("$function$;", de));
})();

test("⚠⚠ ORDINEA stărilor e aceeași în bază și pe ecran", () => {
  /*
   * O ofertă poate fi deodată oprită ȘI expirată. Pe rând încape o singură
   * etichetă, și trebuie să fie cea care spune ce ai de făcut ÎNTÂI. Inversată
   * în SQL, filtrul „Oprite” ar fi scos oferte scrise „Expirată” în tabel.
   */
  const inSql = [...SQL.matchAll(/then '(\w+)'/g)].map((m) => m[1]);
  inSql.push(/else 'activ'/.test(SQL) ? "activ" : "?");

  /*
   * Ordinea de pe ecran nu se scrie de mână aici: se AFLĂ, punând `stareaOfertei`
   * în fața unei oferte care are toate pricinile deodată și scoțându-le pe rând.
   * Scrisă de mână, proba ar fi fost a treia copie a aceleiași reguli.
   */
  const acum = Date.UTC(2026, 8, 22, 12);
  const ieri = new Date(acum - 86_400_000).toISOString();
  const maine = new Date(acum + 86_400_000).toISOString();

  const toateDeodata: OfertaDeJudecat = {
    is_active: false, starts_at: maine as string | null, ends_at: ieri as string | null,
  };
  const peEcran: string[] = [];
  let o = { ...toateDeodata };
  peEcran.push(stareaOfertei(o, acum));            // oprit
  o = { ...o, is_active: true };
  peEcran.push(stareaOfertei(o, acum));            // expirat
  o = { ...o, ends_at: null };
  peEcran.push(stareaOfertei(o, acum));            // programat
  o = { ...o, starts_at: null };
  peEcran.push(stareaOfertei(o, acum));            // activ

  assert.deepEqual(inSql, peEcran,
    `baza judecă în ordinea ${inSql.join(" → ")}, ecranul în ${peEcran.join(" → ")}`);
});

test("⚠⚠ și CONDIȚIILE sunt aceleași, nu doar ordinea", () => {
  /*
   * O margine mutată — `<=` în loc de `<` la dată — ar fi pus o ofertă pe o parte
   * pe ecran și pe cealaltă în filtru, exact la granița unde se și întâmplă
   * lucrurile.
   */
  assert.match(SQL, /when not p_is_active then 'oprit'/);
  assert.match(SQL, /p_ends_at is not null and p_ends_at < now\(\) then 'expirat'/);
  assert.match(SQL, /p_starts_at is not null and p_starts_at > now\(\) then 'programat'/);

  /* Și oglinda lor din `stare.ts`, citită ca text. */
  const ts = readFileSync("src/lib/offers/stare.ts", "utf8");
  assert.match(ts, /if \(!o\.is_active\) return "oprit"/);
  assert.match(ts, /pana !== null && pana < acum/);
  assert.match(ts, /de !== null && de > acum/);
});

test("⚠⚠ cele patru stări sunt aceleași patru, scrise la fel", () => {
  /*
   * Un nume scris altfel într-o parte („inactiv” în loc de „oprit”) ar fi făcut
   * ca filtrul să nu găsească niciodată nimic — iar cifra de lângă el ar fi fost
   * zero, deci opțiunea nici n-ar fi apărut în meniu. Un defect care se ascunde
   * singur.
   */
  const inSql = new Set([...SQL.matchAll(/'(\w+)'/g)].map((m) => m[1]));
  for (const s of STARI_OFERTA) assert.ok(inSql.has(s), `starea „${s}” lipsește din SQL`);
  assert.equal(inSql.size, STARI_OFERTA.length, `SQL are și alte stări: ${[...inSql].join(", ")}`);
});

test("⚠⚠ NU exista o a cincea stare, si nici filtru pentru ea", () => {
  /*
   * La coduri există și „epuizat”, fiindcă un cod are `max_uses`. O ofertă n-are
   * plafon de utilizări. Copiată de acolo, opțiunea „Epuizate” n-ar fi găsit
   * niciodată nimic — o promisiune goală care-l trimite pe om să caute un defect.
   */
  assert.ok(!SQL.includes("epuizat"), "SQL a împrumutat starea codurilor");
  assert.ok(!(FILTRE_STARE as readonly string[]).includes("epuizat"));
  assert.ok(!SQL.includes("max_uses"), "SQL întreabă de un plafon pe care ofertele nu-l au");
});

test("⚠ ceasul e al BAZEI, nu unul primit de la apelant", () => {
  /*
   * `now()` se judecă pe ceasul Postgresului. Primit ca argument, ar fi venit de
   * la partea care întreabă — și atunci două ecrane deschise deodată ar fi putut
   * vedea stări deosebite pentru aceeași ofertă.
   */
  assert.ok(!SQL.includes("p_acum"), "ceasul a ajuns argument");
  assert.equal(SQL.split("now()").length - 1, 2, "nu se mai întreabă ceasul bazei de două ori");
});

/* ── Paginarea ──────────────────────────────────────────────────────────── */

const PAGINA = readFileSync("src/app/(dashboard)/dashboard/offers/page.tsx", "utf8");

test("⚠⚠ pagina se cere din BAZĂ, nu se taie din lista adusă", () => {
  /*
   * Defectul de care ne apărăm: cineva „simplifică” aducând iar toate ofertele
   * (`listOffers`, cum era până azi) și tăindu-le în browser. Merge până la o mie
   * de rânduri — plafonul PostgREST — și de acolo lista se taie ÎN TĂCERE.
   */
  assert.match(PAGINA, /rpc\("offers_page"/);
  assert.match(PAGINA, /page_limit: OFERTE_PE_PAGINA/);
  assert.match(PAGINA, /page_offset: \(pagina - 1\) \* OFERTE_PE_PAGINA/);
  /* ⚠ SE CAUTA O CHEMARE, nu numele gol: numele apare si in comentariul care
     explica ce s-a schimbat, iar o proba care cade pe propriile ei explicatii
     se repara slabind-o. */
  assert.ok(!/listOffers\(/.test(PAGINA), "pagina cere iar toate ofertele");
  /* Si usa insasi a fost inchisa: `"use server"` expune fiecare export. */
  const actiuni = readFileSync("src/lib/actions/offer.actions.ts", "utf8");
  assert.ok(!/export async function listOffers/.test(actiuni),
    "usa care aduce toate ofertele, fara plafon, e inca deschisa");
});

test("⚠⚠ cifrele din cap se socotesc pe TOT magazinul, nu pe pagină", () => {
  assert.match(PAGINA, /rpc\("offer_totaluri"/);
  const client = readFileSync("src/components/dashboard/OffersClient.tsx", "utf8");
  assert.ok(!/oferte\.reduce\(/.test(client), "cifrele din cap se adună iar din lista adusă");
});

test("⚠⚠ cifrele de lângă filtre se numără peste CĂUTARE, în bază", () => {
  assert.match(PAGINA, /rpc\("offer_state_counts", \{ bid: biz\.id, search: q \|\| null \}\)/);
});

test("⚠⚠ sub listă scrie CÂTE SUNT ÎN TOT, nu câte încap pe pagină", () => {
  const r = (n: number, p = 1) => rezumatulPaginii(n, p, 25, CUVINTELE_OFERTELOR);
  assert.equal(r(0), "Nicio ofertă");
  assert.equal(r(1), "1 ofertă");
  assert.equal(r(11), "11 oferte");
  assert.equal(r(137), "1–25 din 137 de oferte");
  assert.equal(r(137, 6), "126–137 din 137 de oferte");
});

/* ── Ce vine din adresă ─────────────────────────────────────────────────── */

test("⚠ un filtru sau o sortare necunoscută cade pe implicit, nu pe o listă goală", () => {
  assert.equal(filtruValid("expirat"), "expirat");
  assert.equal(filtruValid("inventat"), "toate");
  assert.equal(filtruValid(null), "toate");
  assert.equal(sortareValida("vazute"), "vazute");
  assert.equal(sortareValida("dupa-noroc"), "noi");
});

test("⚠ o stare necunoscută venită din bază nu rupe rândul", () => {
  /* Un rând vechi, o funcție nereîncărcată, orice: rândul trebuie să se vadă. */
  assert.equal(stareDinBaza("programat"), "programat");
  assert.equal(stareDinBaza("epuizat"), "oprit");
  assert.equal(stareDinBaza(null), "oprit");
});

test("⚠ fiecare sortare cerută are un nume, și fiecare nume o sortare", () => {
  /* Un nume lipsă ar fi desenat o opțiune goală în meniu. */
  assert.deepEqual(Object.keys(NUMELE_SORTARII).sort(), [...SORTARI].sort());
  assert.deepEqual(Object.keys(NUMELE_FILTRULUI).sort(), [...FILTRE_STARE].sort());
});

test("⚠⚠ fiecare sortare e chiar ÎNȚELEASĂ de funcția din bază", () => {
  /*
   * Aici stă defectul tăcut: `offers_page` alege după `sort_key`, iar o sortare
   * pusă în meniu și neadăugată în SQL ar fi căzut pe ordinea implicită. Meniul
   * ar fi arătat „Cele mai văzute”, apăsarea n-ar fi schimbat nimic, și nimeni
   * n-ar fi primit vreo eroare.
   */
  const M2 = MIGRATII.filter((m) => m.text.includes("create or replace function public.offers_page(")).at(-1);
  assert.ok(M2, "nicio migrație nu definește `public.offers_page`");
  const corp = M2!.text.slice(M2!.text.indexOf("create or replace function public.offers_page("));
  for (const s of SORTARI) {
    if (s === "noi") continue; /* ⚠ Cea implicită n-are `case`: e `order by … created_at desc`. */
    assert.ok(corp.includes(`sort_key = '${s}'`), `sortarea „${s}” nu e citită de \`offers_page\``);
  }
  assert.match(corp, /f\.created_at desc/);
});

/* ── Filtrele care au pe ce sta ─────────────────────────────────────────── */

test("⚠ niciun filtru fără date pe care să cadă", () => {
  /*
   * O opțiune „Programate” într-un magazin fără nicio ofertă programată nu e o
   * funcție în plus, e o promisiune goală.
   */
  assert.deepEqual(filtreCuRost({ activ: 3, oprit: 1 }, "toate"), ["toate", "activ", "oprit"]);
  /* ⚠ Filtrul ALES rămâne, chiar cu zero: altfel meniul și-ar pierde sub deget
     opțiunea pe care omul tocmai a apăsat-o. */
  assert.deepEqual(filtreCuRost({ activ: 3 }, "expirat"), ["toate", "activ", "expirat"]);
  assert.deepEqual(filtreCuRost({}, "toate"), ["toate"]);
});

test("„Toate” adună celelalte stări, nu se numără pe sine", () => {
  assert.equal(cateLaFiltru({ activ: 3, oprit: 1, expirat: 2 }, "toate"), 6);
  assert.equal(cateLaFiltru({ activ: 3 }, "oprit"), 0);
});

test("câte oferte încap pe o pagină e aceeași cifră ca la coduri și la clienți", () => {
  assert.equal(OFERTE_PE_PAGINA, 25);
});

/* ── Rata de acceptare ──────────────────────────────────────────────────── */

test("⚠⚠ rata e NULL când n-a văzut-o nimeni, nu zero", () => {
  /*
   * „0%” ar fi însemnat „au văzut-o și n-au vrut-o”, iar adevărul e că n-a ajuns
   * încă pe niciun ecran. Măsurat pe producție la 22.09.2026, TOATE bump-urile
   * erau în situația asta: 0 afișări, 29 de acceptări.
   */
  assert.equal(rataDeAcceptare(0, 0), null);
  assert.equal(rataDeAcceptare(0, 29), null);
  assert.equal(rataDeAcceptare(100, 0), 0);
  assert.equal(rataDeAcceptare(405, 29), 7.2);
});

test("⚠ rata poate trece de 100% fără să fie rotunjită tăcut", () => {
  /*
   * Pe ofertele mai vechi, numitorul e mai mic decât ar fi trebuit: afișările de
   * la checkout și din coș se numără abia de la 22.09.2026, iar acceptările din
   * 04.08.2026. Tăiată la 100, cifra ar fi ascuns tocmai dovada că e de tăiat.
   */
  assert.equal(rataDeAcceptare(10, 29), 290);
});
