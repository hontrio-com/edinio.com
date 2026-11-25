import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { COLOANA_AWB } from "@/lib/orders/awb-propriu";
import { ORDER_STATUS } from "@/lib/orders/status";
import { siglaCurierului } from "@/lib/integrari/parteneri";
import { comandaDinRand, cuCeilaltiCurieri, type Integrari } from "./date";
import {
  adresaFiltrelor, areFiltre, ASEZARE_IMPLICITA, ASEZARI, asezareDinCookie, cateInGrupa, coadaFiltrelor, ETAPE, filtreDinAdresa,
  filtreGoale, GRUPE, STARI, stariFiltrului, stariGrupei, type Asezare,
} from "./filtre";
import { expediere, rezumatLivrare, rezumatPlata, rezumatProduse, stareaAwb } from "./rezumate";

/*
  Lista de Comenzi in asezarile ei noi (25.11.2026): filtrele din adresa pe fiecare asezare,
  propozitiile din randuri, ce se poate face cu expedierea unei comenzi si LEGATURA cu manerele
  din `OrdersClient`.

  Ce pazesc probele de la sfarsit: asezarile noi nu au voie sa aiba un buton care doar arata a
  functie. Fiecare cere prin contextul de actiuni, iar `OrdersClient` raspunde cu manerele de
  dinainte (ferestrele curierilor, facturile, lotul cu confirmarile lui). O piesa care si-ar
  chema singura o actiune de server ar ocoli poarta de AWB sau confirmarile lotului.
*/

/* ── Asezarea ─────────────────────────────────────────────────────────────── */

test("asezarea din cookie: una cunoscuta, altfel cea implicita („Registru”)", () => {
  assert.equal(ASEZARE_IMPLICITA, "registru");
  for (const a of ASEZARI) assert.equal(asezareDinCookie(a.cheie), a.cheie);
  for (const strain of [undefined, null, "", "Registru", "tabel", "constructor", "a"]) assert.equal(asezareDinCookie(strain), "registru", String(strain));
  /* Tabelul de dinainte e ultimul, despartit: e plasa de siguranta, nu o a cincea asezare noua. */
  assert.equal(ASEZARI[ASEZARI.length - 1].cheie, "clasic");
});

/* ── Filtrele din adresa, pe asezare ──────────────────────────────────────── */

test("„Registrul” si tabelul de dinainte filtreaza pe o stare; grupa din adresa nu-i priveste", () => {
  for (const asezare of ["registru", "clasic"] as const) {
    const f = filtreDinAdresa({ status: "shipped", grupa: "lucru", q: " ana ", source: "emag", de_la: "2026-11-01", pana_la: "2026-11-24", page: "3" }, asezare);
    assert.deepEqual(f, { asezare, q: "ana", status: "shipped", grupa: "toate", source: "emag", deLa: "2026-11-01", panaLa: "2026-11-24", page: 3, peCuloar: 20 });
    assert.deepEqual(stariFiltrului(f), []);
  }
  /* O stare necunoscuta (sau una care seamana cu o proprietate mostenita) nu ajunge in interogare. */
  for (const rea of ["Livrat", "toString", "constructor", ""]) assert.equal(filtreDinAdresa({ status: rea }, "registru").status, "all", rea);
  assert.equal(filtreDinAdresa({ source: "magazinul-meu" }, "registru").source, "all");
  assert.equal(filtreDinAdresa({ source: "store" }, "registru").source, "store");
});

test("„Două panouri” si „Pe zile” filtreaza pe o grupa de stari; starea din adresa nu-i priveste", () => {
  const panouri = filtreDinAdresa({ status: "shipped" }, "panouri");
  /* „Două panouri" se deschide cu ce e de lucru, „Pe zile" cu toate. */
  assert.deepEqual([panouri.status, panouri.grupa], ["all", "lucru"]);
  assert.deepEqual(stariFiltrului(panouri), ["pending", "confirmed", "processing"]);
  assert.equal(filtreDinAdresa({}, "zile").grupa, "toate");
  assert.deepEqual(stariFiltrului(filtreDinAdresa({ grupa: "incheiate" }, "zile")), ["delivered", "cancelled", "refunded"]);
  assert.equal(filtreDinAdresa({ grupa: "necunoscuta" }, "zile").grupa, "toate");
});

test("„Fluxul” nu are pagini, are culoare: 20 de comenzi, apoi trepte de 20 pana la 100", () => {
  assert.deepEqual(
    [20, 40, 100].map((n) => filtreDinAdresa({ pe_culoar: String(n), page: "4" }, "flux")),
    [20, 40, 100].map((n) => ({ ...filtreGoale("flux"), peCuloar: n })),
  );
  for (const rau of ["30", "0", "120", "-20", "multe", ""]) assert.equal(filtreDinAdresa({ pe_culoar: rau }, "flux").peCuloar, 20, rau);
  /* In afara „Fluxului" marimea culoarelor nu inseamna nimic. */
  assert.equal(filtreDinAdresa({ pe_culoar: "60" }, "registru").peCuloar, 20);
});

test("⚠ adresa nu poarta asezarea, iar ce scrie in ea se citeste inapoi la fel", () => {
  const cazuri: [Asezare, Record<string, string>][] = [
    ["registru", { q: "ana", status: "delivered", source: "store", de_la: "2026-11-01", page: "2" }],
    ["panouri", { grupa: "drum", pana_la: "2026-11-24", page: "5" }],
    ["zile", { grupa: "incheiate", source: "emag" }],
    ["flux", { q: "1331", pe_culoar: "60" }],
    ["clasic", { status: "pending", page: "9" }],
  ];
  for (const [asezare, sp] of cazuri) {
    const f = filtreDinAdresa(sp, asezare);
    const coada = coadaFiltrelor(f);
    assert.equal(coada.includes("asezare"), false, asezare);
    assert.deepEqual(filtreDinAdresa(Object.fromEntries(new URLSearchParams(coada)), asezare), f, asezare);
    assert.deepEqual(Object.fromEntries(new URLSearchParams(coada)), sp, asezare);
  }
  /* Ce e pe implicit nu se scrie: adresa goala e chiar pagina. */
  for (const a of ASEZARI) assert.equal(adresaFiltrelor("/dashboard/orders", filtreGoale(a.cheie)), "/dashboard/orders", a.cheie);
  /* Grupa implicita a „Două panouri" („De lucru") nu se scrie; „Toate" da, fiindca acolo nu e implicita. */
  assert.equal(coadaFiltrelor({ ...filtreGoale("panouri"), grupa: "toate" }), "grupa=toate");
});

test("„Șterge filtrele” apare doar cand e pus un filtru al asezarii", () => {
  for (const a of ASEZARI) assert.equal(areFiltre(filtreGoale(a.cheie)), false, a.cheie);
  assert.equal(areFiltre({ ...filtreGoale("registru"), status: "pending" }), true);
  assert.equal(areFiltre({ ...filtreGoale("panouri"), grupa: "toate" }), true);
  assert.equal(areFiltre({ ...filtreGoale("zile"), q: "x" }), true);
  /* Pagina si marimea culoarelor nu sunt filtre. */
  assert.equal(areFiltre({ ...filtreGoale("registru"), page: 4 }), false);
  assert.equal(areFiltre({ ...filtreGoale("flux"), peCuloar: 60 }), false);
});

test("⚠ grupele si etapele acopera starile platformei, fiecare stare o singura data", () => {
  const toate = Object.keys(ORDER_STATUS).sort();
  /* Filele „Registrului": toate cele sapte stari, plus „Toate". */
  assert.deepEqual(STARI.map((s) => s.cheie).filter((c) => c !== "all").sort(), toate);
  /* Grupele: fiecare stare intr-o singura grupa, deci numerele grupelor se aduna la total. */
  const inGrupe = GRUPE.flatMap((g) => g.stari);
  assert.deepEqual([...inGrupe].sort(), toate);
  assert.equal(new Set(inGrupe).size, inGrupe.length);
  assert.deepEqual(stariGrupei("toate"), []);
  /* Etapele „Fluxului" nu cuprind anulatele si rambursatele: acelea se vad in „Registru". */
  const inEtape = new Set(ETAPE.flatMap((e) => e.stari));
  assert.deepEqual([...inEtape].sort(), toate.filter((s) => s !== "cancelled" && s !== "refunded"));
  /* „De pregatit" si „De predat" impart aceleasi stari si se despart prin AWB. */
  assert.deepEqual(ETAPE.filter((e) => e.awb !== null).map((e) => [e.cheie, e.awb]), [["pregatit", false], ["predat", true]]);
});

test("numarul unei grupe e suma starilor ei, iar „Toate” e totalul", () => {
  const numarari = { pending: 3, confirmed: 5, processing: 2, shipped: 7, delivered: 40, cancelled: 4, refunded: 1 };
  assert.equal(cateInGrupa("lucru", numarari, 62), 10);
  assert.equal(cateInGrupa("drum", numarari, 62), 7);
  assert.equal(cateInGrupa("incheiate", numarari, 62), 45);
  assert.equal(cateInGrupa("toate", numarari, 62), 62);
  assert.equal(cateInGrupa("lucru", {}, 0), 0);
});

/* ── Propozitiile din randuri si expedierea ───────────────────────────────── */

const sigla = (cheie: string) => {
  const s = siglaCurierului(cheie);
  if (!s) throw new Error(`curier necunoscut in proba: ${cheie}`);
  return s;
};
const PORNITE: Integrari = { curieri: [sigla("fancourier"), sigla("sameday"), sigla("dpd")], case_: [] };
const RAND = {
  id: "o1", order_number: "#1331", created_at: "2026-11-20T10:00:00Z", status: "confirmed", total: 100, customer_name: "Ana Pop",
  shipping_address: { courier: "sameday", city: "Cluj-Napoca", county: "Cluj" },
  items: [{ name: "Veioză", quantity: 2, price: 30 }, { name: "Pernă", quantity: 1, price: 40 }, { name: "Vază", quantity: 1, price: 0 }],
  order_source: null, payment_method: "cash_on_delivery", payment_status: "pending",
};
const comanda = (peste: Record<string, unknown> = {}, pornite = PORNITE) => cuCeilaltiCurieri(comandaDinRand({ ...RAND, ...peste }, pornite, {}), pornite);

test("rezumatul produselor: primul, cu bucatile lui, si cate mai sunt", () => {
  assert.equal(rezumatProduse(comanda()), "2 × Veioză și încă 2");
  assert.equal(rezumatProduse(comanda({ items: [{ name: "Pernă", quantity: 1 }] })), "Pernă");
  assert.equal(rezumatProduse(comanda({ items: [] })), "Fără produse");
});

test("rezumatul livrarii si al platii", () => {
  assert.equal(rezumatLivrare(comanda()), "Cluj-Napoca, Cluj");
  assert.equal(rezumatLivrare(comanda({ shipping_address: { delivery_type: "locker", locker_name: "easybox Mall" } })), "Punct de ridicare: easybox Mall");
  assert.equal(rezumatLivrare(comanda({ shipping_address: { courier: "pickup" } })), "Ridicare din magazin");
  assert.equal(rezumatLivrare(comanda({ shipping_address: {} })), "Fără adresă");

  assert.deepEqual(rezumatPlata(comanda()), { text: "Ramburs", atentie: false });
  assert.deepEqual(rezumatPlata(comanda({ payment_status: "paid" })), { text: "Ramburs, încasat", atentie: false });
  /* Plata in avans care n-a venit e singura care cere atentie. */
  assert.deepEqual(rezumatPlata(comanda({ payment_method: "netopia" })), { text: "Card, neplătită", atentie: true });
  assert.deepEqual(rezumatPlata(comanda({ payment_method: "netopia", payment_status: "paid" })), { text: "Card, plătită", atentie: false });
  /* Banii unei comenzi de marketplace ii tine marketplace-ul: „neplatita" acolo nu e o alarma. */
  assert.deepEqual(rezumatPlata(comanda({ payment_method: "emag", order_source: { marketplace: "emag" } })), { text: "Prin eMAG", atentie: false });
  assert.deepEqual(rezumatPlata(comanda({ payment_method: "netopia", payment_status: "refunded" })), { text: "Card, rambursată", atentie: false });
});

test("expedierea: curierul ales de client e butonul, ceilalti stau in meniu", () => {
  const e = expediere(comanda());
  assert.equal(e.fel, "buton");
  if (e.fel !== "buton") return;
  assert.equal(e.sigla.cheie, "sameday");
  assert.deepEqual(e.altii.map((s) => s.cheie), ["fancourier", "dpd"]);
  assert.equal(e.refuz, null);
});

test("fara un curier ales si conectat, se alege dintre cei conectati; fara niciunul, se spune", () => {
  const e = expediere(comanda({ shipping_address: { city: "Iași" } }));
  assert.equal(e.fel, "alege");
  if (e.fel === "alege") assert.deepEqual(e.altii.map((s) => s.cheie), ["fancourier", "sameday", "dpd"]);
  assert.deepEqual(expediere(comanda({ shipping_address: { city: "Iași" } }, { curieri: [], case_: [] })), { fel: "text", text: "Niciun curier conectat", cu: "camion" });
});

test("⚠ AWB-ul emis bate orice: se arata el, nu un buton de emitere", () => {
  const e = expediere(comanda({ [COLOANA_AWB.dpd]: "80512345", dpd_status_label: "În livrare" }));
  assert.equal(e.fel, "awb");
  if (e.fel !== "awb") return;
  assert.deepEqual([e.awb.curier.cheie, e.awb.numar], ["dpd", "80512345"]);
  assert.equal(stareaAwb(e.awb, "AWB emis"), "În livrare");
  /* Fara nicio stare de la curier ramane vorba implicita; un colet in curs o spune el. */
  assert.equal(stareaAwb({ ...e.awb, stare: null }, "AWB emis"), "AWB emis");
  assert.equal(stareaAwb({ ...e.awb, stare: null, partener: "DPD 123" }, "AWB emis"), "DPD 123");
  assert.equal(stareaAwb({ ...e.awb, inCurs: true, numar: "" }), "Se emite, numărul vine de la curier");
});

test("⚠ o comanda incheiata nu mai are buton de AWB", () => {
  assert.deepEqual(expediere(comanda({ status: "cancelled" })), { fel: "text", text: "Neexpediată", cu: "camion" });
  assert.deepEqual(expediere(comanda({ status: "refunded" })), { fel: "text", text: "Neexpediată", cu: "camion" });
  assert.deepEqual(expediere(comanda({ status: "delivered" })), { fel: "text", text: "Livrată fără AWB", cu: "camion" });
  /* O comanda marcata de mana ca expediata, fara AWB, inca il poate primi. */
  assert.equal(expediere(comanda({ status: "shipped" })).fel, "buton");
  assert.deepEqual(expediere(comanda({ shipping_address: { courier: "pickup" } })), { fel: "text", text: "Ridicare din magazin", cu: "magazin" });
  assert.deepEqual(expediere(comanda({ shipping_address: { courier: "own", city: "Iași" } })), { fel: "text", text: "Livrare proprie", cu: "camion" });
});

test("⚠ marketplace: unde isi tine singur fluxul, butonul lui duce in comanda, iar curierii proprii raman in meniu", () => {
  const emag = expediere(comanda({ order_source: { marketplace: "emag" }, shipping_address: { city: "Iași" } }));
  assert.equal(emag.fel, "marketplace");
  if (emag.fel === "marketplace") {
    assert.equal(emag.sigla.nume, "eMAG");
    /* Curierii proprii nu se pierd: comerciantul poate expedia si cu contractul lui. */
    assert.deepEqual(emag.altii.map((s) => s.cheie), ["fancourier", "sameday", "dpd"]);
  }
  /* Pepita cu livrarea ei (GLS-ul lor): un AWB propriu ar fi a doua eticheta pe acelasi colet. */
  assert.deepEqual(
    expediere(comanda({ order_source: { marketplace: "pepita", livrare_pepita: true } })),
    { fel: "text", text: "Livrată de marketplace", cu: "camion" },
  );
  /* Pepita cu curierul comerciantului: comanda se administreaza de aici, ca una din magazin. */
  const pepita = expediere(comanda({ order_source: { marketplace: "pepita", livrare_pepita: false, pepita_payment_mode: "cod" }, shipping_address: { city: "Iași" } }));
  assert.equal(pepita.fel, "alege");
});

test("⚠ refuzul portii ajunge pe buton: plata in avans neconfirmata la Pepita", () => {
  const e = expediere(comanda({ order_source: { marketplace: "pepita", livrare_pepita: false, pepita_payment_mode: "transfer" }, shipping_address: { city: "Iași" } }));
  assert.equal(e.fel, "alege");
  if (e.fel === "alege") assert.match(e.refuz ?? "", /Plata acestei comenzi nu e confirmată/);
});

/* ── Legatura cu manerele din `OrdersClient` ──────────────────────────────── */

const DIR = "src/components/dashboard/comenzi";
const citeste = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");
const PIESE = readdirSync(DIR).filter((f) => f.endsWith(".tsx")).map((f) => [f, citeste(`${DIR}/${f}`)] as const);
const ECRAN = citeste("src/components/dashboard/OrdersClient.tsx");
const PAGINA = citeste("src/app/(dashboard)/dashboard/orders/page.tsx");

test("⚠ piesele asezarilor nu cheama nicio actiune de server si nu mai poarta nimic de prototip", () => {
  /* Cele patru asezari, radacina lor, piesele comune, piesele mici si contextele: opt fisiere. */
  assert.ok(PIESE.length >= 8, `ma asteptam la piesele listei, am gasit ${PIESE.length}`);
  for (const [nume, sursa] of PIESE) {
    /* Tot ce scrie trece prin `OrdersClient`: acolo sunt poarta de AWB, „nu stim daca s-a emis" si confirmarile lotului. */
    assert.equal(/from "@\/lib\/actions\//.test(sursa.replace(/import type [^;]+;/g, "")), false, `${nume} cheama direct o actiune de server`);
    assert.equal(/prototip|variante-comenzi|ComandaProto/i.test(sursa), false, `${nume} mai poarta ceva de prototip`);
    assert.equal(/\bconfirm\(/.test(sursa), false, `${nume} intreaba prin casuta browserului`);
  }
});

test("⚠ fiecare curier care emite AWB are fereastra lui legata de asezarile noi", () => {
  const harta = ECRAN.slice(ECRAN.indexOf("const ferestreAwb: Record<CurierPropriu, (o: Order) => void> = {"), ECRAN.indexOf("/* Facturis, Factureaza.ro, easybill: aceeasi emitere"));
  assert.ok(harta.length > 100, "harta ferestrelor de AWB nu mai e unde o stiam");
  for (const curier of Object.keys(COLOANA_AWB)) {
    assert.match(harta, new RegExp(`\\b${curier}: set\\w+ModalOrder\\b`), `${curier} n-are fereastra legata`);
  }
  /* Poarta de AWB e cea comuna, intrebata pentru curierul apasat. */
  assert.ok(ECRAN.includes("apasaAwb(refuz, deschide);"));
  assert.match(ECRAN, /const refuz = deCeNuSePoateAwbPropriu\(\{[\s\S]{0,400}?\}, curier\);/);
});

test("⚠ fiecare casa de facturare emite pe drumul ei de dinainte", () => {
  for (const apel of [
    'if (casa === "smartbill") handleGenerateInvoice(FARA_EVENIMENT, idComanda);',
    'else if (casa === "oblio") handleOblioAction(FARA_EVENIMENT, idComanda, "invoice");',
    'else if (casa === "fgo") handleFgoAction(FARA_EVENIMENT, idComanda, "invoice");',
    "else emiteLaCasaCuCheie(casa, idComanda);",
  ]) assert.ok(ECRAN.includes(apel), apel);
  /* Casele cu cheie: apelul singur in `try`, si un raspuns pierdut nu invita la reincercare oarba. */
  const corp = ECRAN.slice(ECRAN.indexOf("function emiteLaCasaCuCheie("), ECRAN.indexOf("const manere = {"));
  assert.match(corp, /try \{\s+rezultat = casa === "facturis" \? await generateFacturisInvoice\(businessId, orderId\)\s+: casa === "factureaza" \? await generateFactureazaInvoice\(businessId, orderId\)\s+: await generateEasybillInvoice\(businessId, orderId\);\s+\} catch \{/);
  assert.match(corp, /nu știm dacă factura s-a emis/);
  /* Emiterea dintr-un buton doar cu sigla se intreaba intai. */
  const comune = citeste(`${DIR}/comune.tsx`);
  assert.match(comune, /titlu: `Emiți factura pentru comanda \$\{c\.numar\}\?`/);
  assert.ok(comune.includes("fa: () => emiteFactura(c.id, casa.cheie as CasaFacturare),"));
});

test("⚠ lotul asezarilor noi trece prin aceleasi confirmari ca tabelul de dinainte", () => {
  for (const apel of [
    "facturi(casa: InvoiceProvider) { runBulkInvoices(casa); },",
    "awburi(curier: BulkCourier) { runBulkAwbs(curier); },",
    "saga() { runBulkSaga(); },",
    "schimbaStarea(iduri: readonly string[], stare: string) { runBulkStatus(stare, iduri); },",
  ]) assert.ok(ECRAN.includes(apel), apel);
  /* Schimbarea starii dintr-un meniu se intreaba: clientul e anuntat, iar doua stari misca stocul si cuponul. */
  const comune = citeste(`${DIR}/comune.tsx`);
  assert.ok(comune.includes("fa: () => schimbaStarea(comenzi.map((c) => c.id), stare),"));
  assert.ok(comune.includes('const STARI_CU_EFECTE = new Set(["cancelled", "refunded"]);'));
});

test("⚠ asezarea aleasa se tine minte si se citeste pe server, iar grupa de stari ajunge si in export", () => {
  assert.match(ECRAN, /document\.cookie = `\$\{COOKIE_ASEZARE\}=\$\{asezare\}; path=\/; max-age=\$\{60 \* 60 \* 24 \* 365\}; samesite=lax`;/);
  assert.ok(PAGINA.includes("const filtre = filtreDinAdresa(sp, asezareDinCookie(jar.get(COOKIE_ASEZARE)?.value));"));
  /* Pagina: grupa se aplica in SQL, pe aceeasi interogare ca numaratoarea. */
  assert.ok(PAGINA.includes('if (stariGrupa.length > 0) listQuery = listQuery.in("status", [...stariGrupa]);'));
  /* Exportul primeste aceeasi lista de stari: fisierul are exact comenzile de pe ecran. */
  assert.ok(ECRAN.includes("stari: filtre ? [...stariFiltrului(filtre)] : [] },"));
  const actiune = citeste("src/lib/actions/export-comenzi.actions.ts");
  assert.ok(actiune.includes('stari: (Array.isArray(cerere.stari) ? cerere.stari : []).filter((st) => typeof st === "string" && Object.hasOwn(ORDER_STATUS, st)),'));
  assert.ok(citeste("src/lib/orders/filtrele-listei.ts").includes('if (f.stari && f.stari.length > 0) q = q.in("status", f.stari);'));
});

test("⚠ culoarele „Fluxului” se despart prin AWB pe coloanele portii, iar randurile vin intregi", () => {
  const corp = PAGINA.slice(PAGINA.indexOf("async function culoareleFluxului("), PAGINA.indexOf("function ScheletComenzi()"));
  assert.ok(corp.includes("const coloane = coloanelePortii();"));
  assert.ok(corp.includes('supabase.from("orders").select("*", { count: "exact" }).eq("business_id", businessId),'));
  assert.ok(corp.includes("{ ...comune, status: \"all\", stari: etapa.stari },"));
  assert.ok(corp.includes("if (etapa.awb !== null) culoar = culoar.or(etapa.awb ? areAwb : nAreAwb);"));
});

test("⚠ bifele tin doar comenzi care se vad: selectia se strange cand randurile de pe ecran se schimba", () => {
  /*
   * O comanda bifata poate iesi din lista fara nicio navigare (primeste AWB si trece in alta fila).
   * Ramasa bifata fara sa se vada, ar fi intrat in urmatorul lot: bara ar fi spus „2 comenzi alese",
   * iar lotul ar fi emis cinci facturi.
   */
  const corp = ECRAN.slice(ECRAN.indexOf("const [randuriVazute, setRanduriVazute] = useState(randDupaId);"), ECRAN.indexOf("/** Fereastra fiecarui curier."));
  assert.ok(corp.length > 100, "strangerea selectiei nu mai e unde o stiam");
  assert.ok(corp.includes("if (randuriVazute !== randDupaId) {"));
  assert.ok(corp.includes("const ramase = [...prev].filter((id) => randDupaId.has(id));"));
  /* Fara nimic de scos se intoarce chiar multimea de dinainte: lista nu se redeseneaza degeaba. */
  assert.ok(corp.includes("return ramase.length === prev.size ? prev : new Set(ramase);"));
  /* Randurile de pe ecran sunt cele din pagina SI cele din culoarele „Fluxului". */
  assert.match(ECRAN, /for \(const o of comenzi\) dupaId\.set\(o\.id, o\);\s+for \(const cu of culoare\) for \(const o of cu\.comenzi\) dupaId\.set\(o\.id, o\);/);
});
