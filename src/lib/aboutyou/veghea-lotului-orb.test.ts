import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { amprentaArticolului } from "./sync";
import {
  FEREASTRA_DEASA_MS, ORIZONT_VEGHE_MS, PRAG_CURATE, reperulVeghii,
  urmatoareaVerificareMs, vegheaSAIncheiat,
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
   * putin de doua ore, iar orizontul e de o luna.
   */
  const inViitor = new Date(Date.now() + ORIZONT_VEGHE_MS).toISOString();
  assert.equal(vegheaSAIncheiat({ pana_la: inViitor, curate_la_rand: 99 }), false,
    "orizontul inca tine: nu se inchide oricat de curate ar fi citirile");
});

test("⚠ si un SKU strain opreste inchiderea, oricat de curate ar fi citirile", () => {
  /*
   * ═══ ⚠ ALARMA SE SCRIA, SI APOI CITIREA IESEA „IDENTIC" (27.08.2026, tarziu) ═══
   *
   * Un SKU pe care ei il au si noi nu-l cunoastem deloc ajungea in `straine`, se scria un
   * `critical`, si atat: comparatia nu-l socotea „diferit" (corect — nu stim ce e si nu-l
   * atingem), deci veghea il numara drept citire CURATA. Dupa orizont si trei citiri, randul se
   * STERGEA — declarand curat un produs despre care ea insasi scrisese ca are ceva nelamurit, si
   * stingand singurul lucru care il mai tinea vizibil.
   */
  const demult = new Date(Date.now() - 1000).toISOString();
  assert.equal(vegheaSAIncheiat({ pana_la: demult, curate_la_rand: 99, necesita_om: true }), false);
  assert.equal(vegheaSAIncheiat({ pana_la: demult, curate_la_rand: PRAG_CURATE, necesita_om: false }), true);
});

test("⚠ semnul cade singur cand SKU-ul strain dispare, fara sa ceara o apasare", () => {
  /*
   * ⚠ O stare care cere un OM si NU se poate stinge singura devine, in cateva saptamani, un rand
   * pe care nimeni nu-l mai citeste. Cand comerciantul scoate SKU-ul din Seller Center sau il
   * leaga la un produs, urmatoarea citire nu-l mai gaseste — si atunci semnul pica de la sine.
   */
  assert.match(sync, /const areStraine = deriva\.straine\.length > 0;/);
  assert.match(sync, /necesita_om: areStraine,/);
  /* ⚠ Si alarma se stinge odata cu el, altfel un incident viitor n-ar mai avea cum sa strige. */
  assert.match(sync, /!areStraine && v\.necesita_om \? \{ alarma_scrisa_la: null \} : \{\}/);
});

test("⚠ coada lunga: dupa fereastra deasa se mai uita o data pe zi, o luna", () => {
  /*
   * ═══ ⚠ CELE 48 DE ORE ERAU TOT O PRESUPUNERE (27.08.2026, tarziu) ═══
   *
   * Documentatia lor spune ca un lot poate fi `pending`, `processing`, `retry`, `completed` sau
   * `failed`. NU publica nicaieri un termen maxim dupa care un lot nevazut poate fi declarat
   * imposibil de aplicat. Cele 48 de ore de livrare a webhook-urilor sunt ale ALTUI mecanism.
   *
   * Deci veghea nu se mai stinge dupa doua zile: se raresc citirile. Nu fiindca stim ca dupa o
   * luna nu se mai poate aseza nimic, ci fiindca de la un punct incolo o citire zilnica pe veci
   * costa mai mult decat ce mai poate afla.
   */
  assert.equal(urmatoareaVerificareMs(0, FEREASTRA_DEASA_MS), 24 * 60 * 60 * 1000);
  assert.equal(urmatoareaVerificareMs(9, FEREASTRA_DEASA_MS + 1), 24 * 60 * 60 * 1000);
  /* ⚠ Si inainte de prag ramane deasa, altfel coada lunga ar inghiti fereastra utila. */
  assert.equal(urmatoareaVerificareMs(0, FEREASTRA_DEASA_MS - 1), 15 * 60 * 1000);
});

test("⚠ o deriva noua reporneste ceasul, nu doar orizontul", () => {
  /*
   * Altfel un produs care deriveaza in ziua a treia ar fi verificat mai departe o data pe zi —
   * taman cand are cea mai mare nevoie de citiri dese.
   */
  const t = Date.now() - 3600_000;
  assert.equal(reperulVeghii({ pornita_la: new Date(0).toISOString(), ultima_deriva_la: new Date(t).toISOString() }), t);
  /* Fara deriva, reperul e pornirea. */
  assert.equal(reperulVeghii({ pornita_la: new Date(t).toISOString(), ultima_deriva_la: null }), t);
});

test("⚠ un incident NOU pe acelasi produs primeste contoare noi", () => {
  /*
   * ═══ ⚠ AL DOILEA INCIDENT MOSTENEA NUMARATORILE PRIMULUI (27.08.2026, tarziu) ═══
   *
   * Cheia unica e `(business_id, style_key)`, deci al doilea incident cadea peste randul primului.
   * Un produs ajuns la `reasertari = 5`, cu alarma deja scrisa, nu mai primea NICIO retrimitere
   * pentru incidentul urmator — pragul era atins din povestea veche — si nici alarma noua. Veghea
   * ramanea in picioare si nu mai facea nimic: cea mai rea forma de plasa.
   */
  const veghe = viu("src/lib/aboutyou/veghe.ts");
  assert.match(veghe, /const altIncident = r\.incident !== incident;/);
  assert.match(veghe, /curate_la_rand: 0, reasertari: 0, alarma_scrisa_la: null, ultima_deriva_la: null,/);
  /* ⚠ Si prima citire vine repede, chiar daca veghea veche ajunsese la una pe zi. */
  assert.match(veghe, /urmatoarea_verificare: new Date\(acum \+ urmatoareaVerificareMs\(0\)\)\.toISOString\(\),/);

  /*
   * ⚠ SI NICI INVERS: acelasi incident semnalat de doua ori NU repune contoarele la zero, altfel
   * pragul de retrimiteri n-ar fi atins niciodata si bucla n-ar mai avea capat.
   */
  assert.match(veghe, /\.\.\.\(altIncident\s*\?/);

  /* Si fiecare pornire spune CARE incident o cere: lotul care a ramas orb. */
  assert.match(sync, /"lot-orb", lot\.id\)/);
  assert.match(sync, /"generatie-depasita", b\.id\)/);
  assert.match(sync, /"lot-abandonat", b\.id\)/);
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
  assert.match(sync, /pana_la: new Date\(acum \+ ORIZONT_VEGHE_MS\)\.toISOString\(\)/);
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
  assert.match(sync, /pornesteVeghea\(admin, businessId, styleKey, listing\.product_id, "lot-orb", lot\.id\)/);
  assert.match(sync, /pornesteVeghea\(admin, ctx\.businessId, listing\.style_key, listing\.product_id, "generatie-depasita", b\.id\)/);
  assert.match(sync, /pornesteVeghea\(admin, ctx\.businessId, sk, l\.product_id, "lot-abandonat", b\.id\)/);
  /* ⚠ Si veghea nescrisa TINE LOTUL DESCHIS: altfel promisiunea ar fi goala. */
  assert.match(sync, /if \(!await pornesteVeghea\(admin, businessId, styleKey, listing\.product_id, "lot-orb", lot\.id\)\) \{[\s\S]{0,400}?continue;/);
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


/* ── Modificarea salvata care nu ajunge in coada ──────────────────────────── */

test("⚠ semnul se scrie de un DECLANSATOR, in aceeasi tranzactie cu modificarea", () => {
  /*
   * ═══ ⚠ MODIFICAREA S-A SALVAT, PUNEREA LA COADA A PICAT (27.08.2026, tarziu) ═══
   *
   *     UPDATE products      -> COMMIT ✅
   *     after() -> enqueue…  -> UPSERT in coada ❌
   *     logError             -> ✅
   *
   * Produsul modificat la noi, nemodificat la ei, si nimic care sa mai revina vreodata la el:
   * veghea urmareste produsele cu LOT extern orb, iar aici nu s-a nascut niciun lot. Cel mai scump
   * caz e stocul — o comanda scade 5 la 4 si About You vinde mai departe bucata care nu mai
   * exista.
   *
   * ⚠ DE CE UN DECLANSATOR, si nu o „cutie de iesire" scrisa din aplicatie: fiindca lucrul care a
   * picat E o scriere in baza. Orice scriere facuta din acelasi proces pica in aceleasi clipe —
   * n-ar fi o plasa, ar fi acelasi fir. Singura urma care supravietuieste garantat e cea din
   * ACEEASI tranzactie cu modificarea.
   */
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  assert.match(baseline, /CREATE TRIGGER aboutyou_marcheaza_modificarea/);

  /*
   * ═══ ⚠ SI NU-SI MAI INGHITE PROPRIA EROARE (27.08.2026, noaptea tarziu) ═══
   *
   * Corpul avea `exception when others then return new`, cu explicatia „o plasa n-are voie sa rupa
   * chiar lucrul pe care il pazeste". Suna bine si e fals in fond: taman asta facea ca urma sa NU
   * mai fie tranzactionala — modificarea se salva, semnul nu, si ajungeam exact in situatia pe care
   * declansatorul trebuia s-o faca imposibila, doar ca acum cu o plasa care PARE ca exista.
   *
   * ⚠ SI PROBA ASTA CEREA SA EXISTE. Inca un test verde care apara o alegere ce slabeste
   * invariantul; e al doilea in aceeasi zi. Acum cere opusul.
   *
   * ⚠ CE POATE PICA, DE FAPT: cheia unica (rezolvata de `on conflict`), sau infrastructura — si
   * atunci pica si `UPDATE`-ul comerciantului oricum.
   *
   * ⚠ PROBAT INAINTE DE A SCOATE PAZA, fiindca fara ea o greseala aici opreste salvarea produselor
   * pentru toti: un `UPDATE products` rulat cu rolul `authenticated` si RLS pornit CHIAR scrie
   * semnul. Verificat pe baza de productie, nu dedus.
   */
  const i = baseline.indexOf("FUNCTION public.aboutyou_marcheaza_modificarea");
  const corp = baseline.slice(i, i + 2400);
  assert.doesNotMatch(corp, /EXCEPTION/i,
    "declansatorul nu are voie sa-si inghita eroarea: atunci urma nu mai e tranzactionala");

  /*
   * ⚠ SI SEMNUL POARTA CEA MAI NOUA MODIFICARE, nu prima. `do nothing` pastra prima, iar
   * comentariul o numea „cea mai stricta". E invers:
   *
   *     10:00 modificarea A -> semn 10:00
   *     10:01 A pleaca                    -> dovada 10:01
   *     10:02 modificarea B, punerea pica -> semnul RAMANE 10:00
   *     plasa: 10:01 >= 10:00 -> „s-a trimis"  ❌ B nu s-a trimis niciodata
   */
  assert.match(corp, /do update set creat_la = now\(\), recuperari = 0, status = 'deschis'/i);
  assert.doesNotMatch(corp, /do nothing/i);

  /*
   * ⚠ SI O MODIFICARE NOUA PRIMESTE BUGET NOU DE RECUPERARI. Pastrat contorul, un produs care
   * avusese nevoie de patru recuperari intra la a cincea direct in abandon — pentru o modificare
   * care n-are nicio legatura cu incidentul de atunci. Aceeasi regula ca la `incident` in veghea
   * loturilor oarbe, unde am aplicat-o corect si aici o uitasem.
   */
  assert.match(corp, /recuperari = 0/);
});

test("⚠ semnul poarta OPERATIA de care e nevoie, nu doar „s-a schimbat ceva”", () => {
  /*
   * ═══ ⚠ O COMANDA AR FI TRIMIS PRODUSUL INTREG (28.08.2026) ═══
   *
   *     o comanda scade stocul       -> semn (declansatorul asculta `stock_quantity`)
   *     impingerea dedicata de stoc  -> pleaca, si e chiar ce trebuie ✅
   *     dar nu scria nicio dovada
   *     dupa trei minute: „n-a plecat prin catalog" -> upsert de produs INTREG
   *
   * La o mie de comenzi pe zi, mii de loturi de catalog degeaba — cu tot cu generatii, loturi si
   * curse de urmarit. Acum semnul stie ce fel de trimitere cere.
   *
   * ⚠ `page_sections` MERGE LA CATALOG desi poarta si stocul si preturile variantelor: un `upsert`
   * le duce pe toate, iar o schimbare de titlu de varianta trimisa doar ca stoc n-ar ajunge acolo.
   */
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  const i = baseline.indexOf("FUNCTION public.aboutyou_marcheaza_modificarea");
  const corp = baseline.slice(i, i + 2400);
  assert.match(corp, /new\.stock_quantity is distinct from old\.stock_quantity[\s\S]{0,200}?'stock'/i);
  assert.match(corp, /new\.price is distinct from old\.price[\s\S]{0,200}?'price'/i);
  assert.match(corp, /new\.page_sections is distinct from old\.page_sections[\s\S]{0,300}?'upsert'/i);
});

test("⚠ declansatorul asculta EXACT campurile care pleaca la About You", () => {
  /*
   * ⚠ Pe toate coloanele, semnul s-ar scrie si la un contor de vizualizari — zgomot curat. Pe mai
   * putine, o modificare adevarata ar trece nemarcata, adica exact defectul pe care plasa il
   * repara. Legatura cu `PRODUCT_FIELDS` nu e o coincidenta si nu are voie sa se rupa in tacere:
   * cine adauga un camp in payload trebuie sa-l adauge si aici.
   */
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  const linie = baseline.split(/\r?\n/).find((l) => l.includes("CREATE TRIGGER aboutyou_marcheaza_modificarea"));
  assert.ok(linie, "declansatorul trebuie sa existe in baseline");

  const brut = readFileSync("src/lib/aboutyou/sync.ts", "utf8");
  const m = /PRODUCT_FIELDS =\s*(?:\/\*[\s\S]*?\*\/\s*)?"([^"]+)"/.exec(brut);
  assert.ok(m, "PRODUCT_FIELDS trebuie sa fie citibil");
  const campuri = m![1].split(",").map((x) => x.trim())
    /* `id` si `updated_at` nu sunt campuri de continut: unul e cheia, celalalt se scrie singur. */
    .filter((x) => x !== "id" && x !== "updated_at");
  const lipsa = campuri.filter((c) => !linie!.includes(c));
  assert.deepEqual(lipsa, [],
    "campurile trimise la About You trebuie sa fie si in lista declansatorului, altfel modificarea lor nu lasa semn");
});

test("⚠ semnul devine coada DOAR daca punerea din aplicatie chiar s-a pierdut", () => {
  /*
   * Doua dovezi ca drumul obisnuit a mers, amandoua ieftine si fara nicio cerere la ei: exista
   * deja un rand in coada pentru produs, sau a plecat ceva pentru listare DUPA clipa semnului.
   * Fara ele, plasa ar repune la coada tot catalogul dupa fiecare salvare.
   */
  /*
   * ═══ ⚠ DOVADA E PER OPERATIE, NU „A PLECAT CEVA" (27.08.2026, noaptea tarziu) ═══
   *
   * Semnul cere o trimitere de CATALOG. Ieri se citea ORICE rand din coada si ORICE impingere:
   *
   *     descrierea se schimba          -> semn
   *     punerea la coada pica          -> ❌
   *     un `stock` intra din alt motiv -> plasa: „exista in coada" -> sterge semnul
   *
   * Dar lotul de stoc nu poarta descrierea. La ei ramanea cea veche, tacut.
   */
  assert.match(sync, /\.in\("op", \["upsert", "stock", "price"\]\)/);
  /*
   * ⚠ SI IN AMANDOUA SENSURILE: un semn de STOC se satisface cu o impingere de stoc SAU cu un
   * upsert (care duce si stocul); un semn de CATALOG, doar cu un upsert. Invers ar fi fost fals.
   */
  assert.match(sync, /op === "stock" \? \[d\.stoc, d\.catalog\]/);
  assert.match(sync, /op === "upsert" \? \["upsert"\] : \[op, "upsert"\]/);
  assert.match(sync, /if \(potriviteFelului\(d, m\.op\)\.some\(\(t\) => t != null && Date\.parse\(t\) >= cerut\)\)/);
  /*
   * ⚠ SI UN RAND `upsert` DEJA LA COADA NU STERGE SEMNUL, doar il lasa in pace. Sters, un lucrator
   * care a citit produsul INAINTEA modificarii ar duce la capat sarcina veche, si nimeni n-ar mai
   * sti ca cea noua n-a plecat. Semnul cade abia cand apare dovada.
   */
  assert.match(sync, /if \(cozi && cozilePotrivite\(m\.op\)\.some\(\(op\) => cozi\.has\(op\)\)\) continue;/);
  /* ⚠ Si repunerea nu reseteaza `attempts`: altfel un element care esueaza mereu n-ar muri niciodata. */
  const iUps = sync.indexOf("business_id: businessId, product_id: p.product_id, offer_id: p.product_id, op: p.op,");
  assert.ok(iUps > 0, "repunerea scrie doar cheile, si pe felul cerut de semn");
  assert.doesNotMatch(sync.slice(iUps, iUps + 160), /attempts/);
  /* ⚠ Si `.in()` pe bucati: peste vreo sase sute de id-uri, adresa cererii e refuzata. */
  assert.match(sync, /for \(const bucata of bucatiDeIduri\(ids\)\)/);
  /* ⚠ Si cand se repune, se SCRIE: o plasa care lucreaza tacut ascunde defectul din cauza caruia exista. */
  assert.match(sync, /fara sa ajunga in coada About You: repuse acum/);
  /* Si cronul chiar o cheama. */
  assert.match(cron, /recuperate \+= await rezolvaIntentiile\(admin, ctx\)/);
});

test("⚠ dovada se ia la CITIRE, nu la trimitere", () => {
  /*
   * ═══ ⚠ INTRE CITIRE SI TRIMITERE PRODUSUL SE POATE SCHIMBA ═══
   *
   * Lucratorul scoate randul din coada, CITESTE produsul, apoi trimite — secunde intregi. O dovada
   * pusa la trimitere ar acoperi si o modificare pe care sarcina utila n-o continea, iar semnul ei
   * s-ar sterge fara ca ea sa fi plecat vreodata.
   */
  assert.match(sync, /const cititLa = new Date\(\)\.toISOString\(\);/);
  const iCitit = sync.indexOf("const cititLa = new Date().toISOString();");
  const iProdus = sync.indexOf('.from("products").select(PRODUCT_FIELDS)', iCitit);
  assert.ok(iCitit > 0 && iProdus > iCitit,
    "clipa se ia INAINTEA citirii produsului, altfel n-ar acoperi ce s-a citit");
  /*
   * ⚠ SI NU LA TRIMITERE. Lotul de produs e tot asincron si poate fi respins mai tarziu; dovada
   * scrisa la plecare ar fi stins intre timp si semnele de stoc si de pret, care se satisfac prin
   * el. Clipa calatoreste CU LOTUL si trece pe listare abia la asezare.
   */
  assert.match(sync, /generatie, cititLa, transe\), "trimiterea produsului"/);
  assert.match(sync, /catalog_confirmat_la: b\.citit_la/);
});

test("⚠ o impingere de stoc sau de pret nu scrie NICIO dovada", () => {
  /*
   * ⚠ Nu poarta descrierea, imaginile sau atributele — deci n-are cum sa dovedeasca nimic despre
   * modificarea din semn. Ieri scria un „a plecat ceva" comun, si taman aia stergea semnul unei
   * schimbari de descriere care nu plecase.
   */
  const i = sync.indexOf("async function trimiteInTranse");
  const bucata = sync.slice(i, i + 2600);
  assert.doesNotMatch(bucata, /confirmat_la/,
    "impingerea de stoc/pret nu confirma nimic la trimitere: confirmarea o pune asezarea lotului");
  assert.doesNotMatch(bucata, /last_synced_at/,
    "si nici `last_synced_at`, care inseamna „a plecat produsul intreg acolo”");
});

/* ── Publicarea pierduta dupa ce produsul a fost creat cu succes ──────────── */

test("⚠ intentia de publicare se scrie INAINTEA starii", () => {
  /*
   * ═══ ⚠ ALTFEL PUBLICAREA SE PIERDE DEFINITIV (27.08.2026, tarziu) ═══
   *
   *     lotul se incheie      -> `pending` devine `draft`  ✅
   *     punerea publicarii    -> pica                      ❌
   *     lotul se inchide `completed`
   *
   * Produsul e creat la ei, e ciorna, si nimeni nu mai incearca vreodata publicarea. Nici macar o
   * reluare a lotului n-ar repara-o: ramura se intra NUMAI pe `status === "pending"`, iar starea
   * fusese deja schimbata. Un `asezat = false` singur n-ar fi fost destul — trebuia INVERSATA
   * ordinea.
   */
  const iPub = sync.indexOf('op: "publish", attempts: 0, last_error: null');
  const iStare = sync.indexOf("if (urmare.status != null) {");
  assert.ok(iPub > 0 && iStare > iPub,
    "punerea publicarii la coada trebuie sa vina INAINTEA scrierii starii");
  /* ⚠ Si cat timp intentia nu s-a scris, starea ramane `pending` si lotul ramane deschis. */
  assert.match(sync, /if \(ePub\) \{[\s\S]{0,600}?asezat = false;\s*\n\s*continue;/);
});

test("⚠ plasa NU porneste ce a oprit omul", () => {
  /*
   * ═══ ⚠ CU `auto_sync` OPRIT, PLASA AR FI TRIMIS EXACT CE NU TREBUIA ═══
   *
   * Declansatorul scrie semnul pentru orice produs listat — in Postgres n-are cum sa stie ce a
   * bifat comerciantul. Dar `enqueueAboutYouSync` nu pune nimic la coada cand sincronizarea e
   * oprita, si aia nu e o scapare, e o hotarare: „nu trimite modificarile mele".
   *
   * Fara verificarea asta, lipsa randului din coada s-ar fi citit drept „s-a pierdut", iar plasa
   * ar fi trimis chiar ce omul ceruse sa nu plece. Repara ce s-a stricat, nu porneste ce n-a fost
   * cerut.
   */
  assert.match(sync, /if \(ctx\.config\.auto_sync === false\) \{[\s\S]{0,300}?return 0;/);
  /* ⚠ Si semnele se sterg totusi, altfel s-ar aduna la nesfarsit si ar fi recitite la fiecare trecere. */
  assert.match(sync, /if \(ctx\.config\.auto_sync === false\) \{[\s\S]{0,200}?\.from\("aboutyou_intentii"\)\.delete\(\)/);
});

test("⚠ un produs prea mare se vede din PRIMA cerere, nu din douazeci", () => {
  /*
   * Plafonul de pagini e o margine de buget, nu o hotarare despre produs. La unul care il
   * depaseste, il descopeream cheltuind toate cele douazeci de cereri — la FIECARE trecere a
   * cronului, la nesfarsit, fiindca „necitibil" nu inchide nimic.
   */
  assert.match(sync, /if \(page === 1 && Number\.isFinite\(pagini\) && pagini > MAX_PAGINI_DERIVA\)/);
  /*
   * ⚠ SI `pages` NU E CONDITIE DE OPRIRE: e nulabil in schema lor, iar `Number(undefined ?? 1)` da
   * 1 — chiar defectul care oprea reconcilierea dupa prima suta de SKU-uri. Oprirea ramane pe
   * lungimea lotului.
   */
  assert.match(sync, /if \(items\.length < 100\) \{ taiat = false; break; \}/);
});


/* ── Stergerea: ce se cauta dupa ce produsul nu mai exista ────────────────── */

test("⚠ stergerea in masa nu mai cauta dupa un `product_id` deja NULL", () => {
  /*
   * ═══ ⚠ BULK DELETE NU TRIMITEA NIMIC (27.08.2026, noaptea tarziu) ═══
   *
   * Randul se scrie DUPA `DELETE FROM products`, iar cheia straina e `ON DELETE SET NULL`. Deci in
   * clipa apelului `aboutyou_listings.product_id` e NULL — chiar asta scria si nota de deasupra
   * functiei. Numai ca dedesubt se chema `idsListate`, care cauta TOCMAI dupa `product_id`:
   *
   *     listari gasite -> 0
   *     rows           -> []
   *     return
   *
   * Produsul disparea din magazin si ramanea ACTIV pe About You, primind comenzi pentru marfa care
   * nu mai exista. Nota si codul de sub ea se contraziceau pe doua randuri alaturate.
   *
   * ⚠ MASURAT pe baza adevarata: dupa stergere, cautarea dupa `product_id` da 0 randuri, cea dupa
   * `style_key` da 1.
   */
  const coada = viu("src/lib/aboutyou/queue.ts");
  const i = coada.indexOf("export async function enqueueAboutYouStergereMany");
  const bucata = coada.slice(i, i + 2000);
  assert.match(bucata, /\.select\("style_key"\)[\s\S]{0,120}?\.in\("style_key", bucata\)/);
  assert.doesNotMatch(bucata, /idsListate/,
    "`idsListate` cauta dupa `product_id`, care la stergere e deja NULL");
});

test("⚠ si Trendyol avea acelasi defect, negasit de niciun audit", () => {
  /*
   * `trendyol_listings.product_id` e tot `ON DELETE SET NULL`, iar filtrul rula tot dupa stergere.
   * Aici nu exista un geaman al lui `style_key`, iar calea de stergere a UNUI produs nici nu
   * filtreaza — deci filtrul se scoate, ceea ce o aduce in acord cu ea insasi.
   */
  const coadaTy = viu("src/lib/trendyol/queue.ts");
  const i = coadaTy.indexOf("export async function enqueueTrendyolStergereMany");
  const bucata = coadaTy.slice(i, i + 1600);
  assert.doesNotMatch(bucata, /\.in\("product_id", bucata\)/);
  assert.match(bucata, /const rows = ids\s*\n?\s*\.map\(/);
});

test("⚠ si o retragere pierduta se recupereaza din listarea ramasa orfana", () => {
  /*
   * ⚠ Declansatorul e pe `AFTER UPDATE`, deci o STERGERE nu lasa niciun semn — si nici n-ar avea
   * unde: `aboutyou_intentii.product_id` ar arata spre un rand care nu mai exista. Dar semnul
   * exista deja, si e chiar listarea: `product_id IS NULL` inseamna exact „produsul care o avea a
   * fost sters", fiindca doar cheia straina scrie NULL acolo.
   *
   * ⚠ SI ACOPERA TOATE CAILE — una, in masa, si oricare alta care ar aparea maine. De-aia se
   * citeste STAREA, nu se instrumenteaza fiecare apelant.
   */
  assert.match(sync, /export async function retrageListarileOrfane\(/);
  assert.match(sync, /\.is\("product_id", null\)/);
  assert.match(sync, /op: "delete",/);
  /*
   * ═══ ⚠ SI NU `last_synced_at` HOTARASTE CINE SE STERGE (28.08.2026) ═══
   *
   * Vezi proba de mai jos: un produs cu 250 de variante pleaca in trei transe, iar daca a treia
   * pica, primele doua sunt DEJA la ei si campul ramane gol. Sters randul, dispare si ultimul fir
   * prin care le-am mai fi putut retrage.
   */
  assert.match(sync, /const doarLocale = orfane\.filter\(\(o\) => !o\.remote_poate_exista\);/);
  assert.doesNotMatch(sync, /orfane\.filter\(\(o\) => o\.last_synced_at == null\)/);
  /* Si cronul chiar trece pe-acolo. */
  assert.match(cron, /orfane \+= await retrageListarileOrfane\(admin, ctx\)/);
});

test("⚠ si recuperarea are un capat", () => {
  /*
   * Un produs care nu poate fi trimis NICIODATA — o mapare lipsa, o validare pe care n-o trece —
   * n-ar ajunge niciodata sa aiba `catalog_citit_la` mai nou decat semnul. Fara contor, plasa l-ar
   * repune la coada la fiecare trecere, pe veci.
   */
  assert.match(sync, /const PRAG_RECUPERARI = 5;/);
  assert.match(sync, /if \(m\.recuperari >= PRAG_RECUPERARI\)/);
  assert.match(sync, /verifica eroarea de pe listare/);
});


/* ── `last_synced_at` nu e o dovada ca la ei nu exista nimic ───────────────── */

test("⚠ o transa picata la mijloc lasa produsul PARTIAL la ei, cu campul gol", () => {
  /*
   * ═══ ⚠ CHIAR CODUL O SPUNE, SI TOT EL LASA CAMPUL GOL ═══
   *
   *     un produs cu 250 de variante pleaca in TREI transe
   *     transa 1 -> acceptata la ei ✅
   *     transa 2 -> acceptata la ei ✅
   *     transa 3 -> pica            ❌
   *     `setListingStatus(error)` si `return` — `last_synced_at` NU se scrie
   *
   * Ramura de esec scrie in jurnal „primele N au ajuns deja la About You". Deci codul STIE ca
   * la ei sunt doua sute de variante, si lasa in acelasi timp campul din care plasa de orfane
   * deducea „n-a plecat niciodata".
   */
  const iBucla = sync.indexOf("for (let i = 0; i < built.items.length; i += 100)");
  const bucla = sync.slice(iBucla, sync.indexOf("const now = new Date().toISOString();", iBucla));
  assert.ok(iBucla > 0, "bucla de transe trebuie sa existe");
  assert.match(bucla, /return \{ ok: false, error: res\.error, status: res\.status \};/);
  assert.doesNotMatch(bucla, /last_synced_at/,
    "ramura de esec nu scrie `last_synced_at` — deci el nu poate dovedi ca nimic n-a plecat");

  /*
   * ⚠ SEMNUL SE SCRIE INAINTEA PRIMEI TRANSE, si daca nu se scrie, nu se trimite.
   *
   * ⚠ Proba cerea literalul `remote_poate_exista: true`, dintr-un obiect scris pe loc. De cand in
   * aceeasi scriere se ingheata si CATEGORIA trimisa, campurile se aduna intr-un obiect si forma
   * s-a schimbat — dar regula nu: scrierea ramane inaintea buclei, si tot ea opreste trimiterea
   * daca pica. Se cere fapta, nu ortografia ei.
   */
  const iPoate = sync.indexOf("deInghetat.remote_poate_exista = true");
  const iScriere = sync.indexOf('.update(deInghetat as never)');
  assert.ok(iPoate > 0 && iScriere > iPoate && iScriere < iBucla,
    "`remote_poate_exista` se scrie INAINTEA buclei de transe, ca la `cuLotDurabil`");
  assert.match(sync, /if \(ePoate\) \{[\s\S]{0,320}?ok: false, status: 0/);
});

test("⚠ si rezultatul ultimei scrieri dupa trimitere se citeste", () => {
  /*
   * `setListingStatus` intoarce `boolean` chiar fiindca raspunsul conteaza — si taman aici era
   * aruncat, desi e cea mai importanta scriere de dupa trimitere. Loturile plecau la ei, functia
   * raspundea `ok: true`, iar listarea ramanea fara `last_synced_at`, fara `catalog_citit_la` si
   * fara `pending` — deci nici publicarea nu se mai inlantuia, fiindca asezarea lotului cauta
   * chiar `pending`.
   */
  assert.match(sync, /const salvat = await setListingStatus\(admin, listing\.id, "pending"/);
  assert.match(sync, /if \(!salvat\) \{[\s\S]{0,300}?ok: false, status: 0/);
});

test("⚠ orfanele se rotesc, ca primele doua sute sa nu tina locul tuturor", () => {
  /*
   * Plafonul fara cursor se sprijinea pe presupunerea ca fiecare trecere goleste ce a citit. Dar o
   * retragere care nu se poate duce la capat lasa randul pe loc, iar urmatoarele cinci mii n-ar
   * mai fi vazute NICIODATA — acelasi defect ca „primele 5 pagini de la zero" la reconciliere.
   */
  assert.match(sync, /if \(dupa\) q = q\.gt\("id", dupa\);/);
  assert.match(sync, /\.order\("id", \{ ascending: true \}\)/);
  /* ⚠ Si roata se intoarce la inceput cand lista s-a terminat. */
  assert.match(sync, /const urmatorul = gata \? null : orfane\[orfane\.length - 1\]\.id;/);
});

test("⚠ semnul abandonat se pastreaza, nu se sterge", () => {
  /*
   * Sters, randul lua cu el si ce modificare n-a plecat, si de cand, si de cate ori. Pastrat, se
   * vede — iar cand comerciantul repara produsul, prima lui modificare noua il repune singura pe
   * `deschis`, cu bugetul de recuperari intreg. Nu e nevoie de niciun buton.
   */
  assert.match(sync, /status: "abandonat",/);
  assert.match(sync, /\.eq\("status", "deschis"\)/);
});


/* ── „Exista ceva la ei?" are UN SINGUR raspuns in toata integrarea ───────── */

test("⚠ nicio hotarare despre ce exista la ei nu se mai ia din `last_synced_at`", () => {
  /*
   * ═══ ⚠ CAMPUL INSEAMNA ALTCEVA, SI PATRU LOCURI IL CITEAU GRESIT (28.08.2026, seara) ═══
   *
   * `last_synced_at` inseamna „s-a terminat vreodata o trimitere COMPLETA". Un produs cu 250 de
   * variante ale carui prime doua transe au ajuns si a treia a picat il are GOL — si doua sute de
   * variante vandabile la ei. Citit ca „nu exista nimic acolo", iesea prost in patru feluri:
   *
   *   `stergeListare`        -> stergea randul, cu tot cu `style_key` si maparea SKU
   *   `setRemoteStatus`      -> scria `inactive` doar local
   *   produs dezactivat      -> „sarit", produsul ramanea vandabil
   *   variante scoase        -> marcate „retrase" local, dar cu stoc la ei
   *
   * Intrebarea „poate exista ceva acolo?" are camp propriu, scris INAINTEA cererii.
   */
  const decizii = [
    /const eDoarLocala = !listing\.remote_poate_exista;/,
    /if \(!listing\.remote_poate_exista\) \{/,
    /if \(listing\.remote_poate_exista\) \{/,
  ];
  for (const d of decizii) assert.match(sync, d);

  /*
   * ⚠ SI NICIUNA DIN CELE PATRU nu mai citeste `last_synced_at`. Ce ramane e legitim: „prima
   * trimitere?" (`stareaDeTinutMinte`) si cazul ambiguu de la variante, unde tocmai lipsa lui
   * deosebeste „a plecat tot" de „a plecat o parte".
   */
  const ramase = [...sync.matchAll(/last_synced_at (?:==|!=) null/g)].length;
  assert.equal(ramase, 2,
    "au ramas doar `stareaDeTinutMinte` si deosebirea cazului ambiguu de la variante");
});

test("⚠ varianta scoasa in cazul ambiguu se LAMURESTE, nu se ghiceste", () => {
  /*
   * `remote_poate_exista` adevarat cu `last_synced_at` gol inseamna „cateva transe au ajuns, nu
   * stim care". Marcata „retrasa" local, varianta ar ramane vandabila; un zero trimis orbeste
   * primeste „not found", lotul iese `hardFail` si zeroul se reincearca la nesfarsit.
   *
   * ⚠ O citire spune exact ce SKU-uri sunt acolo. Costa o cerere, si numai in cazul ambiguu.
   */
  assert.match(sync, /if \(listing\.remote_poate_exista && listing\.last_synced_at == null\) \{/);
  assert.match(sync, /aleLorAmbiguu = new Set\(\(res\.data\?\.items \?\? \[\]\)\.map\(\(it\) => it\.sku\)\);/);
  /* ⚠ Necitibil: nu se hotaraste nimic, randurile raman in `deScos` si se reia. */
  assert.match(sync, /Nu am putut citi variantele de la About You/);
  assert.match(sync, /const deZerouit = deScos\.filter\(chiarAcolo\);/);
});

/* ── „Am trimis" nu e „s-a aplicat" ───────────────────────────────────────── */

test("⚠ dovada se scrie la ASEZARE, si lotul o poarta cu el", () => {
  /*
   * ═══ ⚠ `PUT` INTOARCE UN `batchRequestId`, NU UN VERDICT (28.08.2026, seara) ═══
   *
   *     stocul scade 10 -> 2, impingerea pleaca si e acceptata ✅
   *     dovada scrisa, semnul dispare                          ✅
   *     `/results/stocks`: `success: false`                    ❌
   *
   * La noi 2, la ei 10, si nimic care sa mai revina — chiar peste stoc, unde greseala se plateste
   * in marfa vanduta si neexistenta. Documentatia lor spune limpede ca un lot `completed` poate
   * contine articole cu `success: false`.
   */
  assert.match(sync, /citit_la: cititLa/);
  assert.match(sync, /const camp = b\.kind === "stock" \? "stoc_confirmat_la" : "pret_confirmat_la";/);
  /* ⚠ Si numai la lot fara articole respinse. */
  assert.match(sync, /if \(!hardFail && b\.citit_la\) \{/);
  /* ⚠ Si nu se da inapoi: doua loturi asezate in ordine inversa n-au voie sa mute dovada in trecut. */
  assert.match(sync, /if \(Date\.parse\(b\.citit_la\) <= vechea\) continue;/);
});

test("⚠ si ce e IN ZBOR nu se numara pierdut", () => {
  /*
   * De cand dovada se scrie la asezare, intre trimitere si rezultat trec minute in care nu exista
   * nici rand in coada (a fost consumat), nici confirmare. Citit ca „s-a pierdut", fiecare
   * trimitere ar fi fost repusa la coada trei minute mai tarziu — o roata perfecta.
   */
  assert.match(sync, /\.in\("status", \["intentie", "necunoscut", "pending", "processing", "retry"\]\)/);
  assert.match(sync, /if \(zbor\.some\(\(b\) => feluri\.includes\(b\.kind\) && b\.citit_la != null && Date\.parse\(b\.citit_la\) >= cerut\)\)/);
});

/* ── Starea are si ea generatie ───────────────────────────────────────────── */

test("⚠ un lot de stare dintr-o generatie depasita nu castiga", () => {
  /*
   *     10:00 omul cere „Publica"   -> lotul pleaca, raspunsul se pierde
   *     10:02 omul cere „Retrage"   -> lotul pleaca si se incheie -> la ei `inactive` ✅
   *     10:05 lotul vechi se aseaza -> la ei `published` ❌
   *
   * Continutul avea generatii de mult; starea n-avea nimic, iar reconcilierea ar fi citit
   * `published` si l-ar fi scris la noi ca si cum ar fi fost ce s-a cerut.
   */
    /*
   * ⚠ ATOMIC, PRINTR-UN RPC (28.08.2026, tarziu). Citit-apoi-scris din aplicatie, doua cereri
   * simultane citesc amandoua 5 si scriu amandoua 6 — iar atunci niciuna nu e „depasita" fata de
   * cealalta, si la ei castiga cine termina ultimul, nu cine a cerut ultimul.
   */
  /*
   * ⚠ CEASUL E UNUL SINGUR, PE CHEIA DE STIL (28.08.2026, noaptea tarziu). Tinut pe randul de
   * listare, se pierdea la relistare si se dubla cu cel din piatra de mormant — deci doua operatii
   * concurente puteau primi acelasi numar, iar paza pe generatie nu mai deosebea nimic.
   */
  /*
   * ⚠ SI ALOCAREA CERE O ASTEPTARE (28.08.2026, dupa-amiaza). Ceasul dadea numere unice, si atat:
   * cine cere ultimul primeste cel mai mare numar. Dar „ultimul care a cerut" nu e „ultimul care a
   * vrut ceva" — intre citirea listarii si cererea numarului, randul poate sa DISPARA, iar
   * `published` pleca oricum si invia produsul la ei. Vezi `ceasul-conditionat.test.ts`.
   */
  assert.match(sync, /await admin\.rpc\("aboutyou_ceas_pentru_listare", \{/);
  assert.doesNotMatch(sync, /aboutyou_status_generatie_noua/);
  assert.doesNotMatch(sync, /const genStatus = listing\.status_generatie \+ 1;/);
  /* ⚠ Scrisa INAINTEA cererii, si daca nu se scrie, cererea nu pleaca. */
  const iGen = sync.indexOf('await admin.rpc("aboutyou_ceas_pentru_listare"');
  const iCerere = sync.indexOf('cuLotDurabil(admin, ctx.businessId, "status"', iGen);
  assert.ok(iGen > 0 && iCerere > iGen,
    "generatia se cere INAINTEA cererii externe, altfel paza n-ar avea ce compara");
  assert.match(sync, /if \(typeof genNou !== "number"\) \{[\s\S]{0,300}?ok: false, status: 0/);
  /* ⚠ Si nu ajunge sa nu-i credem starea: se retrimite ce a cerut omul ULTIMA oara. */
  assert.match(sync, /if \(b\.generatie != null && b\.generatie < l\.status_generatie\) \{/);
  /*
   * ═══ ⚠ SI PROBA ASTA CEREA FORMA GRESITA (28.08.2026, noaptea) ═══
   *
   * Cerea `op: l.status_dorit === "published" ? "publish" : "upsert"`. Dar `upsert` inseamna
   * `syncProductNow`, adica trimiterea CONTINUTULUI — nu e nici pe departe un `PUT /products/status`
   * cu `inactive`. Deci pentru „Retrage" retrimiteam produsul, iar la ei ramanea `published`.
   *
   * ⚠ E A TREIA OARA IN DOUA ZILE cand o proba verde apara alegerea care strica invariantul. De-aia
   * proba noua nu se uita la forma, ci la CE FACE lucratorul cu operatia.
   */
  assert.match(sync, /op: "status",/);
  assert.doesNotMatch(sync, /status_dorit === "published" \? "publish" : "upsert"/);
  /* ⚠ Si lucratorul chiar duce `status` prin masina de stari, cu starea ceruta de om. */
  assert.match(sync, /case "status":/);
  assert.match(sync, /return setRemoteStatus\(admin, ctx, productId, dorit\);/);
  /* ⚠ Si constrangerea din baza il primeste: o valoare respinsa de `check` opreste randul sa existe. */
  const baseline0 = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  assert.match(baseline0, /aboutyou_sync_queue_op_check[\s\S]{0,200}?'status'/);
});

test("⚠ si `setRemoteStatus` isi citeste scrierea, ca `syncProductNow`", () => {
  /* Cererea plecase la ei, iar noi raportam `ok: true` cu starea locala nescrisa: ecranul arata
     succes pentru ceva ce la noi nu s-a intamplat, iar a doua apasare ar fi trimis inca un lot. */
  assert.match(sync, /if \(!await setListingStatus\(admin, listing\.id, statusLocal\)\) \{[\s\S]{0,300}?ok: false, status: 0/);
});

/* ── Editarile din fisa About You lasa si ele urma ────────────────────────── */

test("⚠ EAN-ul, marimea si pretul manual lasa si ele semn", () => {
  /*
   * ═══ ⚠ CUTIA DE IESIRE ERA DOAR PE `products` (28.08.2026, seara) ═══
   *
   * EAN-ul, marimea, culoarea, pretul manual in euro, bifa variantei, categoria si materialele stau
   * in `aboutyou_listings` si `aboutyou_variants`. O editare din fisa About You nu lasa NICIUN
   * semn — iar „Salveaza si trimite" sunt doua cereri separate ale browserului: daca a doua nu mai
   * pleaca (fila inchisa, retea cazuta), omul a apasat „Trimite" si s-a salvat doar configurarea.
   *
   * ⚠ SE ASCULTA STAREA, NU SE INSTRUMENTEAZA APELANTUL. Un declansator acopera si editorul, si
   * orice alta cale care ar aparea maine — inclusiv un script.
   *
   * ⚠ SI DOAR COLOANELE OMULUI: `status`, `error`, `catalog_confirmat_la`, `ay_status` le scriem
   * NOI la fiecare trecere a cronului; ascultate, semnul s-ar rescrie la nesfarsit.
   */
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  assert.match(baseline, /CREATE TRIGGER aboutyou_marcheaza_listarea/);
  assert.match(baseline, /CREATE TRIGGER aboutyou_marcheaza_varianta/);
  const linii = baseline.split(/\r?\n/);
  const lListare = linii.find((l) => l.includes("CREATE TRIGGER aboutyou_marcheaza_listarea"))!;
  const lVarianta = linii.find((l) => l.includes("CREATE TRIGGER aboutyou_marcheaza_varianta"))!;
  for (const c of ["brand_id", "category_id", "color_id", "attributes", "material_composition"]) {
    assert.ok(lListare.includes(c), `declansatorul listarii trebuie sa asculte ${c}`);
  }
  for (const c of ["ean", "size_id", "retail_price_eur", "sale_price_eur", "enabled"]) {
    assert.ok(lVarianta.includes(c), `declansatorul variantei trebuie sa asculte ${c}`);
  }
  /* ⚠ Si NU coloanele scrise de noi. */
  for (const c of ["status", "error", "confirmat_la", "ay_status", "last_synced_at"]) {
    assert.ok(!lListare.includes(c) && !lVarianta.includes(c),
      `${c} il scriem noi: ascultat, semnul s-ar rescrie la fiecare trecere a cronului`);
  }
});


/* ── O operatie logica se confirma intreaga, nu pe transe ─────────────────── */

test("⚠ confirmarea asteapta TOATE transele aceleiasi citiri", () => {
  /*
   * ═══ ⚠ CONFIRMAM DUPA PRIMA TRANSA (28.08.2026, noaptea) ═══
   *
   * `POST /products/` primeste cel mult 100 de articole, impingerile de stoc si pret cel mult o
   * mie. Deci o singura operatie ceruta de comerciant pleaca in mai multe loturi:
   *
   *     250 de variante           -> 3 loturi de produs
   *     400 de variante × 3 tari  -> 1200 de articole de pret -> 2 loturi
   *
   * Toate poarta aceeasi clipa de citire, iar confirmarea se scria la asezarea FIECAREIA: primul
   * lot bun stingea semnul, al doilea putea fi respins, si doua sute de preturi nu ajungeau
   * niciodata — exact ce trebuia cutia de iesire sa garanteze.
   *
   * ⚠ SI MAI RAU LA CATALOG: `catalog_confirmat_la` poate satisface si semnele de stoc si de pret,
   * dar lotul 1 duce doar primele o suta de SKU-uri — iar stocul schimbat putea fi al variantei 175.
   */
  assert.match(sync, /async function operatiaSAIncheiat\(/);
  /*
   * ⚠ CLIPA DE CITIRE E NUMELE OPERATIEI LOGICE. Loturile de stoc si de pret n-au generatie
   * (`cuLotDurabil` e chemat cu `undefined`), deci un filtru pe generatie n-ar fi mers la ele.
   */
  assert.match(sync, /\.eq\("citit_la", cititLa\)/);
  assert.match(sync, /return frati\.every\(\(f\) => f\.status === "completed"\);/);
  /* ⚠ Si `related_ids` e jsonb: sirul JSON, nu vectorul — altfel 22P02 si aruncare. */
  assert.match(sync, /\.contains\("related_ids", JSON\.stringify\(\[styleKey\]\)\)/);

  /* Amandoua confirmarile trec prin ea. */
  assert.match(sync, /if \(!await operatiaSAIncheiat\(admin, ctx\.businessId, b\.kind, sk, b\.citit_la, b\.id, b\.transe\)\) continue;/);
  assert.match(sync, /if \(!await operatiaSAIncheiat\(admin, ctx\.businessId, "product", sk, b\.citit_la, b\.id, b\.transe\)\) continue;/);
});

/* ── Maparea SKU supravietuieste eliminarii listarii ──────────────────────── */

test("⚠ maparea SKU nu moare odata cu listarea", () => {
  /*
   * ═══ ⚠ COMENTARIUL SPUNEA CA NU SE STERGE, SI SE STERGEA ═══
   *
   * `reconciliazaVariante` are scris ca randul de varianta NU se sterge NICIODATA, fiindca e
   * singura urma a maparii `sku -> product_id + variant_title`. Si totusi `stergeListare` face
   * `DELETE FROM aboutyou_listings`, iar `listing_id` e `ON DELETE CASCADE`.
   *
   *     10:00 clientul comanda SKU X
   *     webhook intarziat / inbox indisponibil
   *     10:02 „Elimina" -> listarea si toate variantele dispar
   *     10:05 comanda ajunge -> `product_id` null, stocul NU se scade
   *
   * ⚠ SI CONSECINTA E MAI GREA DECAT PARE: `consuma_stoc_comanda_marketplace` chemat cu liste
   * goale trece de toate ramurile de esec, intoarce `gasit: true` si aseaza `stoc_marketplace_la`.
   * Comanda ramane marcata „stoc consumat", deci idempotenta inchide si sansa reparatiei.
   */
  /*
   * ⚠ MAPAREA SE MUTA IN ACEEASI TRANZACTIE CU STERGEREA (28.08.2026, noaptea tarziu). Ieri erau
   * trei scrieri din aplicatie — maparea, piatra, `DELETE` —, deci trei clipe in care o pana lasa
   * jumatate de treaba. Acum e o singura instructiune, sub incuietoarea randului de ceas.
   */
  const bl = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  assert.match(bl, /insert into public\.aboutyou_sku_istoric[\s\S]{0,400}?from public\.aboutyou_variants v/);
  assert.match(bl, /delete from public\.aboutyou_listings where id = v_listing;/);
  /* ⚠ Si ajutoarele de ieri au disparut: lasate, ar fi parut ca mai pazesc ceva. */
  assert.doesNotMatch(sync, /async function pastreazaMaparea\(/);
  assert.doesNotMatch(sync, /async function pastreazaPiatra\(/);

  /* ⚠ Si comenzile cad pe istoric cand maparea curenta lipseste. */
  const ord = viu("src/lib/aboutyou/orders.ts");
  assert.match(ord, /\.from\("aboutyou_sku_istoric"\)\.select\("sku, product_id, variant_title"\)/);
  /* ⚠ Aceeasi regula ca la maparea curenta: „n-am putut citi" nu e „nu exista". */
  assert.match(ord, /maparea SKU istorica nu s-a putut citi/);
  /* ⚠ Si un SKU ramas fara nicio mapare nu mai tace. */
  assert.match(ord, /stocul NU se scade pentru ele/);

  /* ⚠ Si a patra cale: deconectarea sterge randurile DIRECT, nu prin cascada. */
  const act = viu("src/lib/actions/aboutyou.actions.ts");
  const iSalv = act.indexOf("aboutyou.mapareaLaDeconectare");
  const iSterg = act.indexOf('for (const tabel of ["aboutyou_sync_queue"', iSalv);
  assert.ok(iSalv > 0 && iSterg > iSalv,
    "maparea se salveaza INAINTEA stergerilor de la deconectare");
});

/* ── O apasare, o cerere ──────────────────────────────────────────────────── */

test("⚠ „Salveaza si trimite” nu mai depinde de a doua cerere a browserului", () => {
  /*
   * Editorul chema `saveAboutYouListing`, apoi `syncAboutYouProduct`. Intre ele, fila inchisa sau
   * reteaua cazuta insemnau: configurarea salvata, trimiterea niciodata ceruta. Iar cutia de iesire
   * nu ajuta — declansatorul de pe `products` nu vede editari in `aboutyou_listings` /
   * `aboutyou_variants`, iar cel de pe variante are garda `remote_poate_exista`, deci nu porneste o
   * trimitere pentru o listare care n-a plecat inca.
   *
   * ⚠ INTENTIA SE SCRIE INAINTEA SALVARII, si daca nu se scrie, NU se salveaza. Ordinea e chiar
   * apararea: intoarsa, am fi avut iar „salvat, dar poate nu pleaca niciodata".
   */
  const act = viu("src/lib/actions/aboutyou.actions.ts");
  assert.match(act, /siTrimite = false,/);
  const iIntentie = act.indexOf('.from("aboutyou_intentii").upsert(');
  const iSalvare = act.indexOf('.from("aboutyou_listings")', iIntentie);
  assert.ok(iIntentie > 0 && iSalvare > iIntentie,
    "intentia se scrie INAINTEA salvarii listarii");
  assert.match(act, /Nu am putut porni trimiterea/);

  const ecran = viu("src/components/dashboard/AboutYouListingEditor.tsx");
  assert.match(ecran, /saveAboutYouListing\(businessId, productId, input, then === "sync"\)/);
});


/* ── O lista goala de frati nu inseamna ca n-au existat ───────────────────── */

test("⚠ o cadere dupa prima transa NU confirma operatia", () => {
  /*
   * ═══ ⚠ `[].every(...)` E `true` (28.08.2026, tarziu) ═══
   *
   * Verificarea de ieri numara fratii care EXISTA. Dar daca procesul moare dupa transa 1, transele
   * 2 si 3 n-au niciun rand — si atunci lista de frati e goala, iar `every` spune „toti buni":
   *
   *     250 de variante -> trei transe
   *     transa 1 trimisa ✅, procesul moare
   *     mai tarziu transa 1 se aseaza -> frati: [] -> „operatie incheiata" ❌
   *
   * Se scrie `catalog_confirmat_la`, semnul din cutia de iesire se stinge, si se poate merge chiar
   * spre publicare — cu o suta de variante din doua sute cincizeci la ei.
   *
   * ⚠ SI E CHIAR CAZUL OBISNUIT LA PRET: articolele se numara pe SKU × tara, deci 400 de variante
   * pe trei tari fac 1200 — peste plafonul de o mie, adica doua transe.
   */
  assert.match(sync, /if \(transe == null\) return false;/);
  assert.match(sync, /if \(frati\.length \+ 1 !== transe\) return false;/);
  /* ⚠ Numarul se stie inaintea primei cereri si calatoreste pe randul care supravietuieste. */
  assert.match(sync, /const transe = Math\.ceil\(built\.items\.length \/ 100\);/);
  assert.match(sync, /const cateTranse = Math\.ceil\(items\.length \/ MAX_ITEMI_STOC_PRET\);/);
  assert.match(sync, /\.\.\.\(transe != null \? \{ transe \} : \{\}\),/);

  /*
   * ⚠ SI UN LOT VECHI, DINAINTE DE COLOANA, NU CONFIRMA. `transe` lipsa inseamna „nu pot dovedi",
   * nu „e in regula": confirmarea amanata costa o retrimitere, una data degeaba costa marfa.
   */
  const i = sync.indexOf("async function operatiaSAIncheiat(");
  const corp = sync.slice(i, i + 1400);
  assert.match(corp, /if \(transe == null\) return false;/);

  /*
   * ⚠ SI SE PASTREAZA `.neq("id", idAcesta)`. Scos, randul propriu ar intra in numaratoare cu
   * statusul lui DE ACUM — care se scrie abia la sfarsitul iteratiei, deci inca nu e `completed`,
   * si nimic nu s-ar mai confirma vreodata.
   */
  assert.match(corp, /\.neq\("id", idAcesta\)/);
});

/* ── Un produs eliminat nu se mai poate reactiva ──────────────────────────── */

test("⚠ un `publish` mai vechi nu mai poate invia un produs eliminat", () => {
  /*
   *     10:00 „Publica"  -> lotul pleaca, e inca in lucru la ei
   *     10:01 „Elimina"  -> `inactive` se incheie primul, randul local se sterge
   *     10:05 `published` cel vechi se aseaza -> la ei produsul E DIN NOU ACTIV
   *
   * Pana azi, `removal` era un lot cu totul separat, care nu atingea generatia starii — deci
   * `publish`-ul de dinainte nu devenea depasit — iar dupa stergerea randului nu mai exista nimic
   * care sa ceara `inactive`. Produsul ramanea vandabil si nimeni nu afla.
   */
  /*
   * ⚠ Ancora cerea `tintaRetragere(listing.status)`. **Avea dreptate cat timp tinta se deducea din
   * stare** — atunci chiar asa se scria. A incetat sa aiba cand s-a vazut ca deducerea cade pe
   * `error`: un produs neaprobat primea tinta `inactive`, iar scrierea locala a lui `inactive`
   * aprindea semnul de aprobare pe un produs care nu fusese niciodata aprobat.
   *
   * Regula pazita aici — scoaterea isi cere numarul legat de RAND, inaintea cererii — n-a
   * schimbat-o nimic; doar argumentul lui `tintaRetragere` s-a facut listarea intreaga.
   */
  assert.match(sync, /p_dorit: tintaRetragere\(listing\),/);
  /*
   * ⚠ SI PIATRA SE SCRIE INAUNTRUL TRANZACTIEI, nu dintr-un ajutor separat: vezi
   * `aboutyou_incheie_scoaterea`. Scrisa din afara, ar fi fost inca o scriere care poate lipsi
   * exact intre verificare si cascada.
   */
  const baseline1 = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  assert.match(baseline1, /FUNCTION public\.aboutyou_incheie_scoaterea/);
  assert.match(baseline1, /insert into public\.aboutyou_listari_scoase/);
  /* ⚠ Si asezarea unui lot sub generatia scoaterii cere din nou `inactive`, pe cheie. */
  assert.match(sync, /if \(b\.generatie != null && b\.generatie >= piatra\.status_generatie\) continue;/);
  assert.match(sync, /updateProductStatus\(ctx\.auth, \[\{ style_key: sk, status: "inactive" \}\]\)/);
  /* ⚠ Si are un capat: o roata care se invarte la nesfarsit n-ar fi o plasa. */
  assert.match(sync, /if \(piatra\.reasertari >= 5\) \{/);
});

/* ── Deconectarea e fail-closed ───────────────────────────────────────────── */

test("⚠ deconectarea nu sterge nimic pana nu s-a scris ca e deconectat", () => {
  /*
   * Cel mai urat drum de pana azi: dezabonarea la ei reuseste, scrierea configului PICA, iar
   * stergerile locale se fac — adica un cont care pare inca legat (cheia e acolo) dar fara nicio
   * stare locala. Nimic nu mai poate nici trimite, nici retrage.
   *
   * ⚠ `saveConfig` INTOARCE UN BOOLEAN, nu arunca. Un `try/catch` in jurul ei ar fi fost o paza
   * care nu se poate aprinde niciodata — chiar tiparul vanat toata saptamana.
   */
  const act = viu("src/lib/actions/aboutyou.actions.ts");
  assert.match(act, /if \(!await saveConfig\(businessId, \{\}\)\) \{/);
  const iConfig = act.indexOf("if (!await saveConfig(businessId, {}))");
  const iStergere = act.indexOf('for (const tabel of ["aboutyou_sync_queue"', iConfig);
  assert.ok(iConfig > 0 && iStergere > iConfig,
    "stergerile locale vin DUPA ce s-a scris ca magazinul e deconectat");
  /* ⚠ Si fiecare isi citeste raspunsul: mergeau oarbe, iar functia raspundea `success`. */
  assert.match(act, /if \(error\) resturi\.push/);
  assert.match(act, /au ramas randuri nesterse/);
  /* ⚠ Si dezabonarea la ei: un esec lasa un abonament ORFAN pe care nimeni nu-l mai poate sterge. */
  assert.match(act, /ramane orfan/);
  /* ⚠ Si maparea SKU se salveaza inaintea tuturor, cu raspunsul citit. */
  const iMapare = act.indexOf("aboutyou.mapareaLaDeconectare");
  assert.ok(iMapare > 0 && iMapare < iConfig);
  assert.match(act, /maparea SKU nu s-a putut pastra, deci nu s-a sters nimic/);
});

/* ── Un SKU nu se refoloseste intre produse ───────────────────────────────── */

test("⚠ un SKU care a apartinut altui produs nu se mai poate refolosi", () => {
  /*
   *     SKU ABC -> produsul A, listarea A eliminata -> istoric: ABC -> A
   *     ABC dat produsului B
   *     comanda foarte intarziata pentru A ajunge -> `aboutyou_variants` gaseste B
   *     se scade stocul lui B, pentru marfa lui A
   *
   * Iar `orders.ts` cauta INTAI maparea curenta, deci B castiga — nu dintr-o greseala de cod, ci
   * fiindca SKU-ul a incetat sa fie un identificator. Istoricul exista tocmai ca sa lege comenzile
   * intarziate; refolosirea il face sa minta.
   */
  const act = viu("src/lib/actions/aboutyou.actions.ts");
  assert.match(act, /\.from\("aboutyou_sku_istoric"\)\s*\n?\s*\.select\("sku, product_id"\)/);
  assert.match(act, /a fost folosit de alt produs listat c\u00e2ndva pe About You/);
  /* ⚠ Si nu se sterge istoricul ca sa facem loc: mesajul spune de ce. */
  assert.match(act, /comenzile vechi se leag\u0103 de produse dup\u0103 SKU/);
});


/* ── Publicarea foloseste ACELASI invariant ca restul ─────────────────────── */

test("⚠ publicarea cere operatia intreaga, nu doar „niciun frate deschis”", () => {
  /*
   * ═══ ⚠ DOUA DEFINITII PENTRU „TOATE LOTURILE S-AU TERMINAT” (28.08.2026, noaptea) ═══
   *
   * `fratiNeterminati` intreaba „mai e vreun frate in lucru?". Lista goala inseamna insa doua
   * lucruri cu totul diferite: „toti s-au incheiat" si „ceilalti n-au apucat sa existe". Iar cea
   * slaba pazea tocmai pasul cel mai greu de intors — publicarea.
   *
   * ⚠ SI NU PE DRUMUL DIN AUDIT. Un proces mort la transa 1 nu poate ajunge acolo: `pending` se
   * scrie DUPA bucla de transe. Drumul adevarat e o listare deja `pending` din alta scriere — o
   * apasare pe „Publica", sau o asezare in care `urmareaLotului` a intors `status: null`. Verificat
   * de un agent care a urmarit lantul de `if/else if` pana la capat; scenariul din audit era gresit,
   * defectul nu.
   *
   * ⚠ SI `stalled` NU ERA SOCOTIT NETERMINAT de `fratiNeterminati` (lipseste din lista lui de
   * cinci statusuri), desi loturile `stalled` inca se sondeaza. `operatiaSAIncheiat` cere
   * `completed` la toti, deci il acopera si pe el.
   */
  assert.match(sync, /if \(b\.citit_la && !await operatiaSAIncheiat\(admin, ctx\.businessId, "product", listing\.style_key, b\.citit_la, b\.id, b\.transe\)\)/);
  /*
   * ⚠ SI `citit_la` LIPSA NU ARUNCA. Un lot dinainte de coloana ar fi produs `citit_la = ""` —
   * nu e o marca de timp, deci interogarea ar fi picat, iar `randuriCitite` ar fi doborat asezarea
   * intregului magazin. O paza care omoara pasul pe care il pazeste nu e o paza.
   */
  assert.doesNotMatch(sync, /b\.citit_la \?\? ""/);
});

/* ── Scoaterea poate fi ea insasi depasita ────────────────────────────────── */

test("⚠ o scoatere depasita de o cerere mai noua nu mai sterge listarea", () => {
  /*
   *     generatia 5
   *     „Elimina"  -> generatia 6, lotul pleaca
   *     „Publica"  -> generatia 7, lotul pleaca
   *     scoaterea se incheie prima -> stergea listarea
   *
   * ⚠ AUDITUL A DIAGNOSTICAT GRESIT MECANISMUL, si un agent pus sa-l refuze a aratat de ce:
   * cerea ca piatra sa poarte generatia LOTULUI (6) in loc de cea a listarii (7). Dar paza e
   * `b.generatie >= piatra.status_generatie`, deci publicarea (7) trece si peste 6, si peste 7 —
   * remediul propus n-ar fi schimbat nimic.
   *
   * ⚠ DEFECTUL E ALTUL, SI E REAL: nu ca publicarea castiga — ea CHIAR e cererea mai noua —, ci
   * ca stergem listarea cat timp exista o cerere mai noua decat scoaterea. Se compara cu ce e ACUM.
   */
  /*
   * ═══ ⚠ VERIFICAREA SI STERGEREA SUNT ACELASI LUCRU (28.08.2026, noaptea tarziu) ═══
   *
   * Ieri se citea listarea, se compara generatia, si abia apoi se stergea. Intre cele doua incape o
   * cerere noua:
   *
   *     ceasul 6, lotul de scoatere 6
   *     citim: 6 < 6 e fals -> avem voie sa stergem
   *     ⟵ AICI omul apasa „Publica" -> ceasul 7, lotul pleaca
   *     scriem piatra si STERGEM listarea -> la ei publicat, la noi nimic
   *
   * Acum totul se face sub incuietoarea randului de ceas, intr-o singura tranzactie.
   */
  assert.match(sync, /await admin\.rpc\("aboutyou_incheie_scoaterea", \{/);
  assert.match(sync, /if \(verdict === "depasit" \|\| verdict === "fara-ceas"\) \{/);
  const baseline2 = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  assert.match(baseline2, /aboutyou_incheie_scoaterea[\s\S]{0,900}?for update/i);
  /* ⚠ Si „fara ceas" nu se citeste ca „liber": nu se sterge nimic ce nu se poate dovedi. */
  assert.match(baseline2, /return 'fara-ceas';/);
  /* ⚠ Si se retrimite starea ceruta ultima oara, prin operatia adevarata de stare. */
  assert.match(sync, /offer_id: acum\.style_key, op: "status",/);
});

/* ── Generatia starii supravietuieste relistarii ──────────────────────────── */

test("⚠ generatia nu se intoarce la zero cand produsul e listat din nou", () => {
  /*
   * Piatra tine generatia la care s-a cerut scoaterea. Un rand nou pornit de la 0 ar face ca un lot
   * de stare foarte intarziat din viata dinainte (generatia 5) sa nu mai fie recunoscut ca depasit
   * fata de o listare la generatia 1 — si cel vechi ar castiga.
   *
   * ⚠ GENERATIA APARTINE CHEII DE STIL, nu randului: `style_key` e acelasi la ei si dupa
   * relistare, deci si ceasul trebuie sa fie acelasi.
   */
  /*
   * ⚠ SI NU MAI E NIMIC DE SOCOTIT LA RELISTARE. Ceasul traieste pe `(business_id, style_key)`,
   * iar `style_key` e acelasi si dupa relistare — deci supravietuieste stergerii listarii de la
   * sine. Ieri se citea piatra si se aduna unu: o alocare citit-calculeaza-scrie, care putea da
   * acelasi numar unei reasertari pornite in acelasi timp.
   */
  const act = viu("src/lib/actions/aboutyou.actions.ts");
  assert.doesNotMatch(act, /piatra\.status_generatie \+ 1/);
  const bl2 = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  assert.match(bl2, /aboutyou_ceas_stare[\s\S]{0,400}?PRIMARY KEY \(business_id, style_key\)/i);
});

/* ── Deduplicarea lor nu mai pare o pierdere ──────────────────────────────── */

test("⚠ acelasi lot intors de doua ori e URMARIT, nu pierdut", () => {
  /*
   * About You intoarce acelasi `batchRequestId` pentru un payload identic — chiar asa scrie si nota
   * din `reconciliazaVariante`. Iar `UNIQUE (business_id, batch_request_id)` face ca a doua scriere
   * sa pice cu `23505`, si orice eroare acolo insemna „trimis dar NEURMARIT": o alarma falsa care ii
   * cere omului sa retrimita ceva ce e deja in lucru.
   */
  /*
   * ═══ ⚠ SI LEACUL DE IERI ERA GRESIT IN FOND (28.08.2026, noaptea tarziu) ═══
   *
   * Stergeam randul NOU si spuneam „urmarit", daca felul si cheile se potriveau. Dar
   * `batchRequestId` identifica lotul LOR, nu operatia NOASTRA: GEN 6 are alta generatie, alta
   * clipa de citire, alt numar de transe. Sters, operatia GEN 6 nu mai exista nicaieri — n-are cine
   * sa-i confirme citirea, iar daca lotul era deja `completed` nici nu se mai sondeaza.
   *
   * ⚠ ACUM CONSTRANGEREA UNICA NU MAI EXISTA: un lot al lor poate purta mai multe operatii de-ale
   * noastre, fiecare asezandu-se singura. Ramura de dedup a disparut cu totul.
   */
  assert.doesNotMatch(sync, /const eDuplicat/);
  assert.doesNotMatch(sync, /lotulGeaman/);
  const baseline3 = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  assert.doesNotMatch(baseline3, /aboutyou_batches_business_id_batch_request_id_key/);
  assert.match(baseline3, /aboutyou_batches_request_idx/);
});

/* ── Dezabonarea vine dupa ce s-a scris deconectarea ──────────────────────── */

test("⚠ nu ramanem conectati la noi si dezabonati la ei", () => {
  /*
   * Dezabonarea era prima, iar intre ea si scrierea configului sunt trei cai de abandon. Oricare
   * lasa starea cea mai proasta: la noi „conectat", la ei fara abonament — nu mai vine niciun
   * eveniment, si nimeni nu stie.
   *
   * ⚠ INVERS E STRICT MAI BINE: daca dezabonarea pica dupa ce am scris deconectarea, ei mai
   * trimit o vreme evenimente catre o ruta care le ignora — zgomot, nu pierdere.
   */
  const act = viu("src/lib/actions/aboutyou.actions.ts");
  const iConfig = act.indexOf("if (!await saveConfig(businessId, {}))");
  const iWebhook = act.indexOf("await deleteWebhookSubscription(", iConfig);
  assert.ok(iConfig > 0 && iWebhook > iConfig,
    "dezabonarea la ei vine DUPA ce s-a scris ca magazinul e deconectat");
  /* ⚠ Si acreditarile se citesc inainte, in `prev`: dupa `saveConfig({})` nu mai exista in baza. */
  const iPrev = act.indexOf("const prev = await loadConfig(businessId);", act.indexOf("disconnectAboutYou"));
  assert.ok(iPrev > 0 && iPrev < iConfig);
});


/* ── Ceasul e unul singur, si nu da doua numere la fel ────────────────────── */

test("\u26a0 ceasul starii e o alocare atomica, nu citit-calculeaza-scrie", () => {
  /*
   * \u2550\u2550\u2550 \u26a0 GENERATIA STATEA IN DOUA LOCURI (28.08.2026, noaptea tarziu) \u2550\u2550\u2550
   *
   * Pe listare si pe piatra de mormant, iar alocarea la relistare era citit-calculeaza-scrie:
   *
   *     piatra = 5
   *     un lot vechi reactiveaza produsul -> reasertarea vrea 6
   *     in acelasi timp omul relisteaza   -> citeste piatra 5, creeaza listarea cu 6
   *     cele doua operatii au ACEEASI generatie
   *     cand reasertarea se incheie: 6 < 6 e fals -> e socotita curenta -> sterge listarea NOUA
   *
   * \u26a0 Ceasul apartine CHEII DE STIL, nu randului — chiar asa scria comentariul de ieri, dar
   * implementarea tinea doua ceasuri. Masurat pe baza adevarata: opt cereri simultane dau opt
   * numere distincte, iar o reasertare si o relistare concurente nu mai pot primi acelasi numar.
   */
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  assert.match(baseline, /CREATE TABLE IF NOT EXISTS public\.aboutyou_ceas_stare/i);
  assert.match(baseline, /FUNCTION public\.aboutyou_ceas_urmator/);
  /* ⚠ Incrementul se face IN INSTRUCTIUNE, sub incuietoarea randului, si intoarce valoarea noua. */
  assert.match(baseline, /do update set generatie = public\.aboutyou_ceas_stare\.generatie \+ 1/);
  assert.match(baseline, /returning generatie into v_gen/);

  /*
   * Si toate cele patru cai cer de la el, nu-si socotesc singure numarul.
   *
   * ⚠ DAR NU MAI CER NECONDITIONAT (28.08.2026, dupa-amiaza). Un numar unic nu e destul: „ultimul
   * care a cerut" nu e „ultimul care a vrut ceva". Cele trei cai de stare cer legat de RANDUL de
   * la care au pornit, iar reasertarea cere legat de generatia PIETREI. `aboutyou_ceas_urmator`
   * ramane indreptatit doar la relistare, in actiuni, unde nu exista asteptare de verificat.
   */
  assert.equal([...sync.matchAll(/aboutyou_ceas_pentru_listare/g)].length, 3,
    "publicarea/dezactivarea, scoaterea si scoaterea doar-locala cer legat de randul citit");
  assert.equal([...sync.matchAll(/aboutyou_ceas_pentru_reasertare/g)].length, 1,
    "reasertarea cere legat de generatia pietrei de mormant");
  assert.equal([...sync.matchAll(/aboutyou_ceas_urmator/g)].length, 0,
    "in sync.ts nicio cerere nu mai porneste de nicaieri");
  const act = viu("src/lib/actions/aboutyou.actions.ts");
  /* ⚠ Si relistarea nu mai socoteste nimic: ceasul supravietuieste stergerii listarii. */
  assert.doesNotMatch(act, /piatra\.status_generatie \+ 1/);
});
