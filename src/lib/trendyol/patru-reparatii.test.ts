import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const orders = viu("src/lib/trendyol/orders.ts");
const facturi = viu("src/lib/trendyol/facturi.ts");
const auto = viu("src/lib/actions/invoice-auto.actions.ts");
const ui = viu("src/components/dashboard/TrendyolReturns.tsx");

/* ── 1) Moneda ──────────────────────────────────────────────────────────────── */

test("⚠ moneda comenzii se scrie in `order_source`, ca la About You", () => {
  /*
   * `orders.total` e citit peste tot in casa ca LEI. Sub Cross-Country insa, `packageTotalPrice`
   * vine in moneda vitrinei: EUR pe Grecia, BGN pe Bulgaria, SAR in Golf.
   *
   * `trendyol_orders.currency` retinea moneda — dar acolo n-o citeste nimeni la facturare, la
   * afisare sau la raportare. About You o pune anume in `order_source`, chiar cu explicatia asta.
   */
  assert.match(orders, /currency: String\(pkg\.currencyCode\)\.toUpperCase\(\)/);
});

test("⚠ nu se factureaza in lei o comanda care n-a fost in lei", () => {
  /*
   * Furnizorii de facturare primesc `currency: "RON"` scris fix. O comanda greceasca de 89,90 EUR
   * ar fi iesit ca o factura de 89,90 LEI.
   *
   * ⚠ Greseala e ireversibila de DOUA ori: un document fiscal gresit nu se retrage, se STORNEAZA;
   * iar urcat la Trendyol, nici de-acolo nu se mai scoate — 409 si niciun capat de corectie.
   *
   * ⚠ SE OPRESTE, NU SE GHICESTE: a converti noi ar cere un curs, o data de referinta si un
   * tratament de TVA intracomunitar — trei hotarari fiscale care nu sunt ale noastre.
   */
  assert.match(auto, /monedaComenzii\.toUpperCase\(\) !== "RON"/);
  const i = auto.indexOf('monedaComenzii.toUpperCase() !== "RON"');
  const f = auto.slice(i, i + 500);
  assert.match(f, /return;/, "se opreste, nu se converteste");
  assert.doesNotMatch(f, /curs|rate|convert/i, "si nu se inventeaza un curs");
});

/* ── 2) Fereastra facturilor ────────────────────────────────────────────────── */

test("⚠ fereastra facturilor se ROTESTE, ca la eMAG", () => {
  /*
   * Forma dinainte lua `order(updated_at desc).limit(10)` fara rotatie. O comanda facturata mai
   * tarziu nu-si misca `updated_at`-ul din `trendyol_orders` — factura se emite in `orders` —
   * deci cele zece pachete active mai noi ocupau fereastra si factura ei nu ajungea NICIODATA.
   */
  assert.match(facturi, /const tura = Math\.floor\(Date\.now\(\) \/ 60_000\);/);
  assert.match(facturi, /const deLa = total > limita \? \(tura \* limita\) % total : 0;/);
  assert.match(facturi, /trendyol_comenzi_de_facturat/);
});

test("⚠ si o citire picata NU inseamna „nicio comanda de facturat”", () => {
  assert.match(facturi, /if \(eBazin\) throw eBazin;/);
});

test("⚠ filtrul e in Postgres: numai comenzile care CHIAR au factura", () => {
  /* Altfel rotatia ar fi tot risipa — noua din zece locuri pe comenzi care n-au ce trimite. */
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  assert.match(baseline, /trendyol_comenzi_de_facturat/);
  assert.match(baseline, /smartbill_invoice_number is not null and o\.smartbill_invoice_url is not null/);
  /* ⚠ Si moneda se verifica si acolo: doua garduri, nu unul. */
  assert.match(baseline, /coalesce\(o\.order_source->>'currency', 'RON'\) = 'RON'/);
});

/* ── 3) Pachetul spart ──────────────────────────────────────────────────────── */

test("⚠ un pachet spart se LEAGA de comanda veche, nu face una noua", () => {
  /*
   * Cand comerciantul anuleaza doar o parte dintr-un pachet, Trendyol il SPARGE si da restului
   * un `shipmentPackageId` NOU. Randul lateral se cauta dupa acel id — deci pachetul nou nu se
   * gasea, se facea o comanda NOUA, si stocul se consuma A DOUA OARA pentru aceleasi bucati.
   *
   * ⚠ Iar pachetul vechi, ajuns pe `UnSupplied`, elibera TOT `stoc_rezervat`-ul comenzii vechi —
   * inclusiv al marfii care chiar pleaca la client pe pachetul nou. Stocul urca inapoi cu
   * bucatile alea si se vinde ce nu mai exista.
   *
   * ⚠ Ei ne spun legatura, si n-o citeam: `originPackageIds` da id-ul pachetului INITIAL.
   */
  assert.match(orders, /const brute = pkg\.originPackageIds;/);
  assert.match(orders, /if \(dinPachetulVechi\?\.order_id\) \{/);
});

test("⚠ si pe calea aia NU se consuma stoc", () => {
  /* Bucatile ramase erau deja rezervate de comanda veche. */
  const i = orders.indexOf("if (dinPachetulVechi?.order_id) {");
  const f = orders.slice(i, orders.indexOf('return "updated";', i));
  assert.doesNotMatch(f, /consuma_stoc|consumaStocul/, "nu se consuma a doua oara");
  assert.match(f, /onConflict: "business_id,shipment_package_id"/, "dar randul lateral se scrie");
});

test("⚠ legatura se cauta DOAR cand pachetul e necunoscut", () => {
  /* Un pachet pe care il stim deja n-are de ce sa fie relegat: e chiar el, nu un copil. */
  assert.match(orders, /if \(!existing\) \{\s*const brute = pkg\.originPackageIds;/);
});

/* ── 4) Formularul de retur ─────────────────────────────────────────────────── */

test("⚠ dovezile, motivul si explicatia sunt PE CERERE, nu la gramada", () => {
  /*
   * Formularul se randeaza in FIECARE card de retur, dar starea era una singura pentru tot
   * ecranul: fisierele alese la un retur plecau la respingerea altuia, iar explicatia scrisa
   * pentru unul ajungea pe altul.
   *
   * ⚠ Aceeasi greseala ca la bifate, facuta a doua oara in acelasi fisier — semn ca tiparul
   * „o stare pentru o lista randata" merita cautat, nu asteptat.
   */
  assert.match(ui, /useState<Record<string, File\[\]>>\(\{\}\)/);
  assert.match(ui, /const \[motivAles, setMotivAles\] = useState<Record<string, string>>\(\{\}\)/);
  assert.match(ui, /const \[explicatie, setExplicatie\] = useState<Record<string, string>>\(\{\}\)/);
  assert.match(ui, /dovezi\[claimId\] \?\? \[\]/);
  assert.match(ui, /motivAles\[claimId\] \?\? ""/);
});
