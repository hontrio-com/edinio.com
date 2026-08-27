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
  const corp = baseline.slice(i, i + 1400);
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
  assert.match(corp, /do update set creat_la = now\(\)/i);
  assert.doesNotMatch(corp, /do nothing/i);
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
  assert.match(sync, /\.eq\("op", "upsert"\)\.in\("product_id", bucata\)/);
  assert.match(sync, /if \(citit && Date\.parse\(citit\) >= Date\.parse\(m\.creat_la\)\) \{ deSters\.push\(m\.id\); continue; \}/);
  /*
   * ⚠ SI UN RAND `upsert` DEJA LA COADA NU STERGE SEMNUL, doar il lasa in pace. Sters, un lucrator
   * care a citit produsul INAINTEA modificarii ar duce la capat sarcina veche, si nimeni n-ar mai
   * sti ca cea noua n-a plecat. Semnul cade abia cand apare dovada.
   */
  assert.match(sync, /if \(inCoada\.has\(m\.product_id\)\) continue;/);
  /* ⚠ Si repunerea nu reseteaza `attempts`: altfel un element care esueaza mereu n-ar muri niciodata. */
  const iUps = sync.indexOf("business_id: businessId, product_id: p.product_id, offer_id: p.product_id, op: \"upsert\"");
  assert.ok(iUps > 0, "repunerea scrie doar cheile");
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
  assert.match(sync, /catalog_citit_la: cititLa,/);
});

test("⚠ o impingere de stoc sau de pret nu scrie NICIO dovada", () => {
  /*
   * ⚠ Nu poarta descrierea, imaginile sau atributele — deci n-are cum sa dovedeasca nimic despre
   * modificarea din semn. Ieri scria un „a plecat ceva" comun, si taman aia stergea semnul unei
   * schimbari de descriere care nu plecase.
   */
  const i = sync.indexOf("async function trimiteInTranse");
  const bucata = sync.slice(i, i + 2600);
  assert.doesNotMatch(bucata, /catalog_citit_la/,
    "impingerea de stoc/pret nu are voie sa scrie dovada de catalog");
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
  /* ⚠ Cele care n-au plecat niciodata se sterg pe loc: la ei nu exista nimic de retras. */
  assert.match(sync, /const doarLocale = orfane\.filter\(\(o\) => o\.last_synced_at == null\);/);
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
