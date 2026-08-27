import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { amprentaArticolului } from "./sync";
import {
  FEREASTRA_VEGHE_MS, PRAG_CURATE, urmatoareaVerificareMs, vegheaSAIncheiat,
} from "./veghe";
import { numaraIncercarea } from "./inbox";
import { EroareNecorelata, EroareTrecatoare, RABDARE_CORELARE_MS } from "./erori";

/* ══════════════════════════════════════════════════════════════════════════
   O SINGURA PRIVIRE NU DOVEDESTE CA UN LOT ORB S-A TERMINAT (27.08.2026, noaptea)
   ══════════════════════════════════════════════════════════════════════════

   Un lot ORB — trimis, cu raspunsul pierdut — se lamurea CITIND o data ce au ei. Daca la ei era
   deja starea de acum, lotul se inchidea si nu se mai revenea niciodata:

       10:00  GEN 10 pleaca, raspunsul se pierde   -> `necunoscut`
       10:05  GEN 11 pleaca si se incheie          -> la ei e starea noua ✅
       10:10  citim: identic                       -> inchidem GEN 10
       11:30  GEN 10 se aseaza in sfarsit          -> la ei e IAR starea veche ❌

   ⚠ Loturile lor se prelucreaza asincron, iar in contractul lor public nu scrie nicaieri ca doua
   loturi diferite se aseaza in ordinea trimiterii. Deci „identic acum" nu inseamna „identic peste
   un ceas", si de la 11:30 incolo nu mai exista nimic care sa observe asta.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const sync = viu("src/lib/aboutyou/sync.ts");
const cron = viu("src/app/api/cron/aboutyou-sync/route.ts");

/* ── Cand se uita, si cat tine veghea ─────────────────────────────────────── */

test("⚠ o singura citire curata NU inchide veghea", () => {
  /*
   * ⚠ ASTA E CHIAR DEFECTUL. Cu fereastra scursa dar o singura citire curata, veghea trebuie sa
   * ramana deschisa: lotul vechi se poate aseza in orice clipa din fereastra.
   */
  const demult = new Date(Date.now() - 1000).toISOString();
  assert.equal(vegheaSAIncheiat({ pana_la: demult, curate_la_rand: 1 }), false);
  assert.equal(vegheaSAIncheiat({ pana_la: demult, curate_la_rand: PRAG_CURATE }), true);
});

test("⚠ si nici fereastra scursa singura, nici sirul curat singur", () => {
  /*
   * Numai fereastra ar inchide o veghe care TOCMAI a gasit deriva. Numai sirul curat ar inchide-o
   * la un ceas dupa pornire, adica exact prea devreme — cele trei citiri dese se termina in mai
   * putin de doua ore, iar fereastra e de doua zile.
   */
  const inViitor = new Date(Date.now() + FEREASTRA_VEGHE_MS).toISOString();
  assert.equal(vegheaSAIncheiat({ pana_la: inViitor, curate_la_rand: 99 }), false,
    "fereastra inca tine: nu se inchide oricat de curate ar fi citirile");
});

test("⚠ citirile se raresc, ca o veghe de doua zile sa nu coste doua sute de cereri", () => {
  /*
   * ⚠ E O SOCOTEALA, nu un gust. La un sfert de ora fix, doua zile inseamna 192 de cereri pentru
   * UN produs. Cu rarire, ajung vreo douasprezece — si primele, cele dese, cad taman acolo unde e
   * cel mai probabil sa se aseze lotul vechi.
   */
  assert.equal(urmatoareaVerificareMs(0), 15 * 60 * 1000);
  assert.equal(urmatoareaVerificareMs(1), 30 * 60 * 1000);
  assert.equal(urmatoareaVerificareMs(2), 60 * 60 * 1000);
  /* ⚠ Si are plafon: fara el, la a douazecea citire ar iesi ani. */
  assert.equal(urmatoareaVerificareMs(20), 6 * 60 * 60 * 1000);
  /* ⚠ Si nu scade niciodata sub primul pas, oricat de ciudat ar fi contorul. */
  assert.equal(urmatoareaVerificareMs(-3), 15 * 60 * 1000);
});

test("⚠ deriva gasita muta fereastra INAINTE, nu inapoi", () => {
  /* Cat timp produsul deriveaza, veghea n-are voie sa expire — altfel s-ar stinge exact atunci. */
  assert.match(sync, /pana_la: new Date\(acum \+ FEREASTRA_VEGHE_MS\)\.toISOString\(\)/);
  assert.match(sync, /curate_la_rand: 0, reasertari: v\.reasertari \+ 1/);
});

test("⚠ si retrimiterea are un CAPAT: dupa cateva incercari se cere un om", () => {
  /*
   * ⚠ O deriva care nu se inchide dupa cinci retrimiteri nu mai e o cursa — e altceva: o mapare
   * respinsa, o valoare pe care ei o normalizeaza altfel, un camp comparat gresit de noi.
   * Retrimisa mai departe, ar fi o roata care se invarte la nesfarsit si acopera tocmai cauza.
   *
   * ⚠ SI VEGHEA NU SE STINGE ATUNCI: continua sa MASOARE, doar ca nu mai trimite. Altfel am
   * pierde si semnalul, nu doar bucla.
   */
  assert.match(sync, /const peste = v\.reasertari >= PRAG_REASERTARI;/);
  assert.match(sync, /se opreste retrimiterea si se cere un om/);
  /* ⚠ Alarma se scrie o SINGURA data pe rand: cronul bate din minut in minut. */
  assert.match(sync, /alarma_scrisa_la: v\.alarma_scrisa_la \?\? new Date\(acum\)\.toISOString\(\)/);
});

test("⚠ „n-am putut citi” nu se numara nici ca bine, nici ca rau", () => {
  /* Numarata drept curata, ar inchide veghea taman cand n-avem nicio dovada. */
  assert.match(sync, /if \(deriva\.fel === "necitibil"\) \{[\s\S]{0,500}?curate_la_rand/);
  const i = sync.indexOf('if (deriva.fel === "necitibil") {');
  const bucata = sync.slice(i, i + 500);
  assert.doesNotMatch(bucata, /curate_la_rand: v\.curate_la_rand \+ 1/,
    "o citire picata nu are voie sa creasca sirul curat");
});

test("⚠ veghea se porneste chiar acolo unde inainte se inchidea lotul si gata", () => {
  /* Cele trei feluri de lot orb, toate cu acelasi rezultat: nimic nu revenea la produsul ala. */
  assert.match(sync, /pornesteVeghea\(admin, businessId, styleKey, listing\.product_id, "lot-orb"\)/);
  assert.match(sync, /pornesteVeghea\(admin, ctx\.businessId, listing\.style_key, listing\.product_id, "generatie-depasita"\)/);
  assert.match(sync, /pornesteVeghea\(admin, ctx\.businessId, sk, l\.product_id, "lot-abandonat"\)/);
  /* ⚠ Si veghea nescrisa TINE LOTUL DESCHIS: altfel promisiunea ar fi goala. */
  assert.match(sync, /if \(!await pornesteVeghea\(admin, businessId, styleKey, listing\.product_id, "lot-orb"\)\) \{[\s\S]{0,400}?continue;/);
});

test("⚠ si cronul chiar trece prin ea, altfel tabelul doar s-ar umple", () => {
  assert.match(cron, /vegheate \+= await treciPrinVeghe\(admin, ctx, inceput \+ BUGET_TOTAL_MS\)/);
  /*
   * ⚠ CU TERMEN, ca peste tot in cronul asta. Zece veghi pe magazin si zece magazine in rotatie
   * inseamna pana la o suta de citiri la ei, taman in coada rularii — adica exact acolo unde
   * taierea loveste pasii de dupa. Ce nu incape se reia la minutul urmator: randul ramane
   * scadent, deci nu se pierde nimic.
   */
  const sync2 = viu("src/lib/aboutyou/sync.ts");
  assert.match(sync2, /if \(pana != null && Date\.now\(\) > pana\) break;/);
});

/* ── Amprenta: ce se compara, si de ce nu imaginile ───────────────────────── */

/*
 * ⚠ CELE DE MAI JOS NU SUNT INVENTATE. Sunt chiar perechea masurata pe contul de sandbox, acelasi
 * produs, aceeasi zi: stanga e ce am trimis, dreapta e ce ne-au dat inapoi.
 */
const TRIMIS = {
  quantity: 1, ean: "8720857992045", color: 160344, size: 248738, brand: 178225, category: 1452,
  weight: 300, country_of_origin: "RO", countries: ["BE", "IT"],
  attributes: [186833, 158862, 158453, 158747, 180687, 280509],
  prices: [
    { country_code: "BE", retail_price: 85.88, sale_price: 75.38 },
    { country_code: "IT", retail_price: 85.88, sale_price: 75.38 },
  ],
  images: [
    "https://edinio-cdn.com/products/a/1.webp", "https://edinio-cdn.com/products/a/2.webp",
    "https://edinio-cdn.com/products/a/3.webp", "https://edinio-cdn.com/products/a/4.webp",
    "https://edinio-cdn.com/products/a/5.webp", "https://edinio-cdn.com/products/a/6.webp",
  ],
  material_composition_non_textile: [
    { cluster_id: 164632, components: [{ material_id: 4396748 }] },
    { cluster_id: 164593, components: [{ material_id: 235906 }] },
  ],
};

const PRIMIT = {
  ...TRIMIS,
  /* ⚠ Aceleasi numere, ALTA ORDINE — exact cum le-au intors. */
  attributes: [186833, 180687, 158453, 280509, 158747, 158862],
  /* ⚠ Regazduite SI transcodate: alt domeniu, alta extensie, acelasi numar. */
  images: [
    "https://ayou-live-sellerscenter-s3.s3.amazonaws.com/media/products/18f8d2a3.jpg",
    "https://ayou-live-sellerscenter-s3.s3.amazonaws.com/media/products/13613360.jpg",
    "https://ayou-live-sellerscenter-s3.s3.amazonaws.com/media/products/a1c88d0b.jpg",
    "https://ayou-live-sellerscenter-s3.s3.amazonaws.com/media/products/c85c77b9.jpg",
    "https://ayou-live-sellerscenter-s3.s3.amazonaws.com/media/products/8b41c6b1.jpg",
    "https://ayou-live-sellerscenter-s3.s3.amazonaws.com/media/products/400b81de.jpg",
  ],
};

test("⚠ perechea MASURATA nu produce deriva", () => {
  /*
   * ⚠ PROBA CARE CONTEAZA CEL MAI MULT DIN FISIER. Daca amprenta ar compara URL-urile imaginilor
   * sau ordinea atributelor, aici s-ar vedea „diferit" — si atunci fiecare citire a fiecarui
   * produs sanatos ar cere o retrimitere, la nesfarsit. O comparatie mai bogata care se insala
   * face mai mult rau decat una saraca.
   */
  assert.equal(amprentaArticolului(TRIMIS), amprentaArticolului(PRIMIT));
});

test("⚠ imaginile NU intra in amprenta, nici macar ca numar", () => {
  /*
   * ═══ ⚠ SASE SI SASE, PE UN SINGUR PRODUS, NU E O REGULA (27.08.2026, noaptea) ═══
   *
   * URL-urile nu se pot compara: ei le regazduiesc si le transcodeaza. Pana aici, masurat.
   *
   * ⚠ DAR NICI NUMARUL. Produsul masurat are O SINGURA varianta si O SINGURA culoare, iar noi
   * trimitem lista de imagini PE CULOARE. Ce intorc ei pe un produs cu trei culori — lista culorii
   * sau a produsului intreg — nu stiu. Daca e a produsului intreg, numarul lor ar fi mereu mai
   * mare si FIECARE produs multicolor ar arata deriva pentru totdeauna. Auditul cerea sortarea
   * URL-urilor; ar fi fost si mai rau.
   */
  const cuCinci = { ...PRIMIT, images: PRIMIT.images.slice(0, 5) };
  assert.equal(amprentaArticolului(TRIMIS), amprentaArticolului(cuCinci),
    "numarul de imagini nu are ce cauta in amprenta: nu stim ce forma are lista lor");
  assert.doesNotMatch(sync, /im: \(x\.images/);
});

test("⚠ dar „mai putine decat am trimis” se vede, si nu poate da fals", () => {
  /*
   * ⚠ E ADEVARAT SUB AMANDOUA IPOTEZELE: si daca lista lor e a culorii, si daca e a produsului
   * intreg, ea n-are cum sa fie mai SCURTA decat ce am trimis pentru culoarea aia. Deci prinde
   * chiar cazul de care ne temem — un lot vechi asezat cu trei poze peste unul cu sase — fara sa
   * poata da vreodata o deriva falsa.
   */
  assert.match(sync,
    /if \(\(lor\.images \?\? \[\]\)\.length < \(alNostru\.images \?\? \[\]\)\.length\) diferit = true;/);
});

test("⚠ si un atribut SCHIMBAT se vede, desi ordinea nu conteaza", () => {
  const altul = { ...PRIMIT, attributes: [186833, 180687, 158453, 280509, 158747, 999999] };
  assert.notEqual(amprentaArticolului(TRIMIS), amprentaArticolului(altul));
});

test("⚠ greutatea si compozitia intra si ele", () => {
  assert.notEqual(amprentaArticolului(TRIMIS), amprentaArticolului({ ...PRIMIT, weight: 301 }));
  assert.notEqual(amprentaArticolului(TRIMIS), amprentaArticolului({
    ...PRIMIT,
    material_composition_non_textile: [{ cluster_id: 164632, components: [{ material_id: 1 }] }],
  }));
});

test("⚠ iar grupurile de material reordonate NU produc deriva", () => {
  const rasturnat = {
    ...PRIMIT,
    material_composition_non_textile: [...PRIMIT.material_composition_non_textile].reverse(),
  };
  assert.equal(amprentaArticolului(TRIMIS), amprentaArticolului(rasturnat));
});

test("⚠ stocul si pretul raman ce se vede cel mai repede", () => {
  assert.notEqual(amprentaArticolului(TRIMIS), amprentaArticolului({ ...PRIMIT, quantity: 0 }));
  assert.notEqual(amprentaArticolului(TRIMIS), amprentaArticolului({
    ...PRIMIT,
    prices: [
      { country_code: "BE", retail_price: 85.88, sale_price: 70 },
      { country_code: "IT", retail_price: 85.88, sale_price: 75.38 },
    ],
  }));
});

/* ── Un upsert de produs poate da inapoi stocul si pretul ─────────────────── */

test("⚠ dupa un lot de PRODUS se retrimit stocul si pretul, dar numai cand a fost o cursa", () => {
  /*
   * ═══ ⚠ `POST /products/` DUCE CU EL SI `quantity` SI `prices` ═══
   *
   *     10:00  se schimba descrierea -> lot PRODUS, cu stoc 10 si pret 100
   *     10:01  stocul devine 5, pretul 90 -> loturi DEDICATE, cu `valid_at`
   *     10:02  loturile dedicate se aseaza  -> la ei 5 / 90 ✅
   *     10:03  lotul de PRODUS se aseaza    -> la ei iar 10 / 100 ❌
   *
   * ⚠ `valid_at` nu apara aici: el ordoneaza doua scrieri pe rutele dedicate, iar valorile care
   * calatoresc INAUNTRUL unui upsert nu trec pe acolo si n-au nicio marca de timp.
   */
  assert.match(sync, /if \(b\.kind === "product" && !hardFail\) \{/);
  assert.match(sync, /op: "stock", attempts: 0, last_error: null \},/);
  assert.match(sync, /op: "price", attempts: 0, last_error: null \},/);

  /*
   * ⚠ SI NU LA FIECARE LOT DE PRODUS. Retrimis mereu, un „Sincronizeaza tot" pe 25.000 de produse
   * ar face 50.000 de cereri in plus degeaba: fara o schimbare intre timp, lotul de produs duce
   * chiar valorile de acum. Semnul cursei e un lot dedicat plecat DUPA el.
   */
  assert.match(sync, /\.in\("kind", \["stock", "price"\]\)[\s\S]{0,200}?\.gt\("submitted_at", b\.submitted_at\)/);
  assert.match(sync, /if \(dedicateMaiNoi\.length === 0\) continue;/);

  /* ⚠ Si nepusa la coada, ramane la ei valoarea veche: lotul se lasa deschis si se reia. */
  assert.match(sync, /if \(eReasert\) \{\s*\n\s*asezat = false;/);
});

/* ── Inbox: „inca nu se poate corela" nu e „stricat" ──────────────────────── */

test("⚠ un eveniment care inca nu se poate corela nu arde o incercare cat e tanar", () => {
  /*
   * ═══ ⚠ ZECE INCERCARI INSEMNAU VREO SASE ORE (27.08.2026, noaptea) ═══
   *
   * Un `order_items.*` soseste des INAINTEA comenzii — evenimentele lor nu vin in ordine, iar
   * sondarea aduce comanda in minutele urmatoare. Aruncat ca `Error` simplu, ardea incercari ca
   * si cum ar fi fost stricat, si ajungea abandonat inaintea lui About You, care reincearca DOUA
   * ZILE.
   */
  const e = new EroareNecorelata("inca nu");
  assert.equal(numaraIncercarea(e, 60_000), false, "la un minut, mai are de ce sa astepte");
  assert.equal(numaraIncercarea(e, RABDARE_CORELARE_MS - 1), false);

  /*
   * ⚠ DAR RABDAREA E MARGINITA. O comanda care la ei nu mai exista nu se coreleaza NICIODATA;
   * „nu numara" fara capat i-ar tine locul la nesfarsit celor care chiar se pot rezolva.
   */
  assert.equal(numaraIncercarea(e, RABDARE_CORELARE_MS), true);
});

test("⚠ trecatoarele nu numara NICIODATA, iar restul numara mereu", () => {
  assert.equal(numaraIncercarea(new EroareTrecatoare("pana"), RABDARE_CORELARE_MS * 10), false);
  assert.equal(numaraIncercarea(new Error("sarcina utila necunoscuta"), 0), true);
});

test("⚠ si calea rapida ia aceeasi hotarare", () => {
  /*
   * Randul tocmai s-a scris, deci e cel mai tanar cu putinta — iar `order_items.*` sosit inaintea
   * comenzii e cazul OBISNUIT pe calea rapida, nu o exceptie. Scria `incercari: 1` pentru orice.
   */
  const ruta = viu("src/app/api/aboutyou/webhook/route.ts");
  assert.match(ruta, /e instanceof EroareNecorelata;/);
});
