import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { METODE_RECOMANDARE, DESPRE_METODA, metodaRecomandarii, parseOfferConfig } from "./offer.types";
import { DESPRE_STAREA_STOCULUI, stareaStocului } from "./lista";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * STOCUL ȘI METODA, FĂRĂ SĂ MIȘTE CELE CINCI RECOMANDĂRI CARE RULEAZĂ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Două cereri de-ale lui:
 *   (5) produsele fără stoc scoase automat, plus o veste când o ofertă rămâne
 *       fără niciunul;
 *   (6) la Recomandări: metoda („cele mai vândute din categorie”), excluderea
 *       celor fără stoc, numărul maxim de produse.
 *
 * ⚠⚠ ASTEA DOUĂ SUNT SINGURELE DIN CELE ȘAPTE CARE CHIAR POT SCHIMBA CE VEDE UN
 * CUMPĂRĂTOR AZI. Măsurat pe producție la 22.09.2026: 5 recomandări pornite,
 * toate cu `autoByCategory: false` și `maxProducts: 4`. Deci proba de temelie e
 * că un rând care n-are câmpurile noi se poartă exact ca ieri.
 */

/* ── Metoda: derivată, nu inventată ─────────────────────────────────────── */

test("⚠⚠ un rând vechi capătă metoda din `autoByCategory`, nu una implicită", () => {
  /*
   * Cele cinci recomandări de pe producție au toate `autoByCategory: false`.
   * Dacă lipsa câmpului ar fi însemnat altceva decât „manual”, toate cinci ar fi
   * început să aleagă singure produse la primul deploy.
   */
  const vechiManual = parseOfferConfig({ productIds: ["a"], autoByCategory: false });
  assert.equal(vechiManual.metodaRecomandare, undefined, "parserul n-are voie să inventeze câmpul");
  assert.equal(metodaRecomandarii(vechiManual), "manual");

  const vechiAutomat = parseOfferConfig({ productIds: [], autoByCategory: true });
  assert.equal(metodaRecomandarii(vechiAutomat), "categorie_noi");
});

test("⚠ `categorie_noi` e CHIAR purtarea veche, cu alt nume", () => {
  /*
   * `fetchCategoryProducts` sortează `created_at desc` de mult. Numele îi spune
   * acum pe față ce face, ca să se poată pune lângă el o a doua metodă.
   */
  const s = readFileSync("src/lib/offers/offers.ts", "utf8");
  assert.match(s, /\.order\("created_at", \{ ascending: false \}\)/);
});

test("o metodă necunoscută din jsonb cade pe derivare, nu pe ea însăși", () => {
  const c = parseOfferConfig({ productIds: [], autoByCategory: true, metodaRecomandare: "din_burta" });
  assert.equal(c.metodaRecomandare, undefined);
  assert.equal(metodaRecomandarii(c), "categorie_noi");
});

test("⚠⚠ `autoByCategory` se scrie DIN metodă, ca să nu se poată despărți", () => {
  /*
   * Câmpul vechi e citit în mai multe locuri. Scris numai cel nou, o cale rămasă
   * în urmă ar fi ales alt bazin de produse decât cea nouă — și nimic n-ar fi
   * dat vreo eroare.
   */
  const f = readFileSync("src/components/dashboard/OfferForm.tsx", "utf8");
  assert.match(f, /const autoByCategory = metoda !== "manual";/);
  assert.match(f, /metodaRecomandare: meta\.automatDinCategorie \? metoda : undefined/);
});

test("fiecare metodă are un nume și o explicație pe ecran", () => {
  assert.deepEqual(Object.keys(DESPRE_METODA).sort(), [...METODE_RECOMANDARE].sort());
  for (const m of METODE_RECOMANDARE) assert.ok(DESPRE_METODA[m].explicatie.length > 20);
});

/* ── Excluderea celor fără stoc ─────────────────────────────────────────── */

test("⚠⚠ nebifat înseamnă PURTAREA DE AZI, care e deosebită pe cele două suprafețe", () => {
  /*
   * Pe pagina de produs recomandarea epuizată SE ARATĂ, cu eticheta „Epuizat” și
   * butonul stins; în coș se ARUNCĂ. Uniformizată în tăcere, una din cele două
   * s-ar fi schimbat pentru toate cele cinci recomandări care rulează.
   */
  const c = parseOfferConfig({ productIds: ["a"] });
  assert.equal(c.excludeFaraStoc, undefined);
  /* Și `false` nu se scrie: ar fi un câmp în plus care nu spune nimic peste lipsă. */
  assert.equal(parseOfferConfig({ productIds: ["a"], excludeFaraStoc: false }).excludeFaraStoc, undefined);
  assert.equal(parseOfferConfig({ productIds: ["a"], excludeFaraStoc: true }).excludeFaraStoc, true);
});

test("⚠ pagina de produs arată în continuare produsele epuizate, cu eticheta lor", () => {
  const s = readFileSync("src/components/ministore/ProductOffers.tsx", "utf8");
  assert.match(s, /product\.outOfStock &&/, "eticheta „Epuizat” a dispărut de pe card");
  assert.match(s, /disabled=\{product\.outOfStock\}/);
});

test("⚠⚠ filtrul de stoc se aplică ÎNAINTE de tăiere, nu după", () => {
  /*
   * După tăiere, un raft cerut de patru cu un produs epuizat ar fi arătat trei —
   * iar numărul scris de comerciant n-ar mai fi însemnat „câte se văd”.
   */
  const s = readFileSync("src/lib/offers/offers.ts", "utf8");
  const i = s.indexOf(".filter((p) => !(faraStoc && p.outOfStock))");
  const j = s.indexOf(".slice(0, o.config.maxProducts)", i);
  assert.ok(i > 0 && j > i, "filtrul nu mai stă înaintea tăierii");
});

test("⚠⚠ pe calea AUTOMATĂ, tăierea e în BAZĂ, deci se cere o rezervă", () => {
  /*
   * `fetchCategoryProducts` cere `.limit(...)`: bazinul sosește deja retezat, iar
   * un filtru pus în JavaScript peste el n-are din ce să completeze raftul.
   * Exact metodele automate sunt singurele unde bifa de stoc contează.
   * Găsit de adversar, la proiectare.
   */
  const s = readFileSync("src/lib/offers/offers.ts", "utf8");
  assert.match(s, /const rezerva = faraStoc \? limit \* 3 : 0;/);
  assert.match(s, /\.limit\(limit \+ excludeIds\.size \+ rezerva\)/);
});

/* ── Numărul maxim ──────────────────────────────────────────────────────── */

test("⚠⚠ `maxProducts` nu mai e CABLAT în formular", () => {
  /*
   * Câmpul exista și era respectat de vitrină (`.slice(0, o.config.maxProducts)`),
   * dar formularul trimitea mereu 4. Deci opțiunea era acolo și nu se putea
   * atinge.
   */
  const f = readFileSync("src/components/dashboard/OfferForm.tsx", "utf8");
  assert.match(f, /maxProducts: maxProduse/);
  assert.ok(!/maxProducts: OFFER_DEFAULT_MAX_PRODUCTS/.test(f), "numărul e iar cablat");
  /* ⚠ Și implicita rămâne 4, ca ofertele care există să nu-și schimbe raftul. */
  assert.match(f, /useState\(offer\?\.config\.maxProducts \?\? OFFER_DEFAULT_MAX_PRODUCTS\)/);
});

test("⚠⚠ sertarul de coș nu mai taie în tăcere sub numărul cerut", () => {
  /*
   * Tăia la șase, scris în cod. De când comerciantul poate cere până la
   * `OFFER_MAX_PRODUCTS`, șase ar fi retezat tocmai numărul lui — și cu două
   * recomandări pe același coș, și mai devreme.
   */
  const s = readFileSync("src/components/ministore/CartRecommendations.tsx", "utf8");
  assert.match(s, /const MINIM_IN_SERTAR = 6;/);
  assert.match(s, /flat\.slice\(0, catIncapInSertar\(offers\)\)/);
  assert.ok(!/flat\.slice\(0, 6\)/.test(s), "plafonul cablat de șase a rămas");
  /*
    ⚠⚠ DAR NU S-A RIDICAT PUR SI SIMPLU. Masurat pe productie: `caian-textile`
    are patru recomandari pe categorii disjuncte, deci un cos cu doua grupe da
    opt produse — taiate azi la sase. Un plafon mutat la 24 ar fi aratat
    dintr-odata opt, fara ca nimeni sa fi cerut. De-aia e un MAXIM: ramane sase
    cat timp nicio oferta nu cere mai mult.
  */
  assert.match(s, /Math\.max\(MINIM_IN_SERTAR, celMaiMare\)/);
});

/* ── Starea de stoc a unei oferte ───────────────────────────────────────── */

test("trei stări, nu două: întreagă, ciuntită, moartă", () => {
  assert.equal(stareaStocului({ produseCerute: 4, produseRamase: 4 }), "intreaga");
  assert.equal(stareaStocului({ produseCerute: 4, produseRamase: 1 }), "ciuntita");
  assert.equal(stareaStocului({ produseCerute: 4, produseRamase: 0 }), "moarta");
});

test("⚠⚠ „nu se știe” NU e „e bine”", () => {
  /*
   * Ofertele automate și cele de cantitate n-au listă fixă de produse, deci nu se
   * poate spune nimic despre ele. Scrise ca „întreagă”, ar fi fost o liniște pe
   * care nimeni n-a verificat-o.
   */
  assert.equal(stareaStocului({ produseCerute: 0, produseRamase: 0 }), "necunoscut");
  /* Și nu are nici text pe ecran: nu se arată nicio etichetă. */
  assert.ok(!("necunoscut" in DESPRE_STAREA_STOCULUI));
  assert.ok(!("intreaga" in DESPRE_STAREA_STOCULUI));
});

test("⚠ cele două stări care se văd spun lucruri DEOSEBITE", () => {
  /* Una e „mișcă-te acum”, cealaltă „când ai timp”. Scrise la fel, n-ar fi
     avut de unde ști care e care. */
  assert.notEqual(DESPRE_STAREA_STOCULUI.ciuntita.text, DESPRE_STAREA_STOCULUI.moarta.text);
  assert.match(DESPRE_STAREA_STOCULUI.moarta.explicatie, /NU se mai arată/);
});

/* ── Migrația și cronul ─────────────────────────────────────────────────── */

const MIGRATII = readdirSync("migrations")
  .filter((f) => f.endsWith(".sql")).sort()
  .map((f) => ({ f, text: readFileSync(join("migrations", f), "utf8") }));

test("⚠⚠ migrația care rescrie `offers_page` se așază DUPĂ cea care o creează", () => {
  /*
   * Dosarul n-are numere de ordine: se citește alfabetic. Pe o bază refăcută din
   * el, o rescriere care ajunge prima ar fi fost ștearsă de cea veche, în tăcere.
   * Aceeași capcană ca la `claim_discount_use`.
   */
  const creeaza = MIGRATII.filter((m) => m.text.includes("create function public.offers_page(")
    || m.text.includes("create or replace function public.offers_page(")).map((m) => m.f);
  assert.ok(creeaza.length >= 2, "una singură — nu mai e nimic de comparat");
  assert.equal(creeaza.at(-1), "2026-09-23-oferte-stoc-si-cele-mai-vandute.sql");
});

test("⚠⚠ funcția se ȘTERGE înainte de a fi recreată cu alte coloane", () => {
  /*
   * `create or replace` NU poate schimba tipul întors. Fără `drop`, migrația ar
   * fi căzut cu „cannot change return type of existing function” — și a și căzut,
   * la prima încercare.
   */
  const m = MIGRATII.find((x) => x.f === "2026-09-23-oferte-stoc-si-cele-mai-vandute.sql");
  assert.ok(m);
  assert.match(m!.text, /drop function if exists public\.offers_page\(/);
  assert.match(m!.text, /drop function if exists public\.offer_totaluri\(/);
  /* ⚠ Și ștergerea ia cu ea granturile: fără ele, pagina ar răspunde „permission denied”. */
  assert.match(m!.text, /grant execute on function public\.offers_page\([^)]*\) to authenticated;/);
  assert.match(m!.text, /grant execute on function public\.offer_totaluri\(uuid\) to authenticated;/);
  /* ⚠ Și PostgREST trebuie să-și recitească catalogul, altfel ține minte forma veche. */
  assert.match(m!.text, /notify pgrst, 'reload schema';/);
});

test("⚠⚠ cronul scrie ÎNTÂI urma, apoi notificarea", () => {
  /*
   * Invers, o notificare reușită cu urma nescrisă ar fi repetat vestea în fiecare
   * zi — zgomot, și atunci nici cea adevărată n-ar mai fi citită. Așa, cel mai rău
   * caz e o veste pierdută, pe care ecranul o arată oricum.
   */
  const s = readFileSync("src/app/api/cron/oferte-fara-stoc/route.ts", "utf8");
  const urma = s.indexOf("fara_stoc_anuntat_la: new Date().toISOString()");
  const notificare = s.indexOf('from("notifications").insert(');
  assert.ok(urma > 0 && notificare > urma, "notificarea se scrie înaintea urmei");
});

test("⚠⚠ cronul are și DRUMUL ÎNAPOI: urma se șterge când oferta se întregește", () => {
  /*
   * Fără el, a doua epuizare ar fi trecut în tăcere — iar notificarea ar fi
   * funcționat exact o dată pe ofertă, pe viață.
   */
  const s = readFileSync("src/app/api/cron/oferte-fara-stoc/route.ts", "utf8");
  assert.match(s, /update\(\{ fara_stoc_anuntat_la: null \}\)/);
});

test("⚠ cronul nu confundă o eroare cu o listă goală", () => {
  const s = readFileSync("src/app/api/cron/oferte-fara-stoc/route.ts", "utf8");
  assert.match(s, /if \(error\) \{/);
  assert.match(s, /citirea ofertelor a cazut/);
});

test("⚠ cronul e înscris în orar, altfel n-ar rula niciodată", () => {
  /*
   * O rută de cron care nu e în `vercel.json` răspunde 200 dacă o ceri, și nu
   * rulează niciodată singură. Nimic n-ar fi dat vreo eroare.
   */
  const v = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string }[] };
  assert.ok(v.crons.some((c) => c.path === "/api/cron/oferte-fara-stoc"));
});
