import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MOTIVE_ANULARE_TRENDYOL } from "./types";

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const client = viu("src/lib/trendyol/client.ts");
const facturi = viu("src/lib/trendyol/facturi.ts");
const coada = viu("src/lib/trendyol/queue.ts");
const cron = viu("src/app/api/cron/trendyol-sync/route.ts");
const ful = viu("src/lib/trendyol/fulfillment.ts");
const intentie = viu("src/lib/marketplace/intentie-publicare.ts");

/* ── Facturi ────────────────────────────────────────────────────────────────── */

test("⚠ varianta INTERNATIONALA cere doar linkul si pachetul", () => {
  /*
   * Amanasem functia fiindca o serie romaneasca („EDN1234") nu incape in formatul lor de fix 16
   * semne: [3 alfanumerice][an 2020-2099][9 cifre]. Formatul ala e al TURCIEI.
   *
   * OpenAPI-ul international spune, citat: „Only requires invoice link and shipment package ID
   * (no invoice number or date fields)." Deci nu e nimic de potrivit si nimic de inventat — iar
   * blocajul pe care il raportasem nu exista.
   */
  assert.match(client, /seller-invoice-links/);
  const i = client.indexOf("export function sendInvoiceLink(");
  const f = client.slice(i, i + 500);
  assert.match(f, /invoiceLink: p\.invoiceLink, shipmentPackageId: p\.shipmentPackageId/);
  assert.doesNotMatch(f, /invoiceNumber/, "nu se trimite un numar pe care ei nu-l cer");
  assert.doesNotMatch(f, /invoiceDateTime/);
});

test("⚠ 409 inseamna „e deja acolo”, deci REUSITA", () => {
  /*
   * Mesajul lor: „The invoice for the package number {N} has already been sent". Citit ca esec,
   * am fi reincercat la nesfarsit un lucru deja facut — si n-am fi marcat niciodata comanda ca
   * facturata. Iar ei NU au niciun capat de corectie sau stergere.
   */
  assert.match(facturi, /if \(r\.status !== 409\) throw new Error\(r\.error\);/);
});

test("⚠ facturarea nu porneste singura", () => {
  /* Raspunderea fiscala e a comerciantului, iar el poate emite deja facturile astea in alta
     parte. Pornite si de aici, ar iesi doua documente fiscale pentru aceeasi marfa. */
  assert.match(facturi, /ctx\.config\.factureaza_clientul !== true\) return \{ fel: "oprit" \}/);
  assert.match(cron, /ctx\.config\.factureaza_clientul !== true\) continue/);
  /* ⚠ Si comutatorul CHIAR EXISTA in panou: altfel functia ramane ascunsa. */
  const ui = readFileSync("src/components/dashboard/TrendyolClient.tsx", "utf8");
  assert.match(ui, /Emite și trimite facturile către Trendyol/);
  assert.match(ui, /factureaza_clientul: facturam/);
});

test("⚠ un singur foc: trece prin registru", () => {
  /* Ei n-au corectie si n-au stergere. A doua trimitere pe acelasi pachet e 409. */
  assert.match(facturi, /cuRegistru\(/);
  assert.match(facturi, /furnizor: "trendyol"/);
  assert.match(facturi, /cheie: `trendyol-factura-\$\{orderId\}-\$\{factura\.numar\}`/);
});

/* ── Intentia de publicare ──────────────────────────────────────────────────── */

test("⚠ intentia se scrie INAINTEA cozii", () => {
  /*
   * Punerea la coada e un efect lateral al unei salvari deja facute. Refuzata, produsul ramanea
   * nepublicat pentru totdeauna: n-are listare, iar „produs fara listare, deci publica-l" nu se
   * poate presupune — cele mai multe produse fara listare sunt chiar cele pe care comerciantul
   * nu le-a vrut acolo.
   *
   * ⚠ INAINTE, nu dupa: invers, o pana intre cele doua ar pierde exact cazul pentru care exista
   * tabela.
   */
  const i = coada.indexOf("const publicareCeruta =");
  const iIntentie = coada.indexOf("noteazaIntentia(", i);
  const iCoada = coada.indexOf('from("trendyol_sync_queue").upsert', i);
  assert.ok(iIntentie > 0 && iCoada > iIntentie, "intentia se scrie prima");
});

test("⚠ plasa nu publica dupa presupuneri", () => {
  /* Nu „produs fara listare -> publica": se reiau NUMAI cererile scrise. */
  assert.match(cron, /intentiiNeimplinite\(admin, businessId, "trendyol"\)/);
  assert.match(cron, /inchideIntentia\(admin, businessId, \[\.\.\.gata\], "trendyol"\)/);
  /* ⚠ Si cu plafon: un produs care nu se poate publica n-are rost reluat la nesfarsit. */
  assert.match(intentie, /\.lt\("incercari", MAX_INCERCARI\)/);
});

test("⚠ o citire picata NU inseamna „nicio intentie”", () => {
  /* Ar fi facut plasa sa taca exact cand baza clipeste — adica exact cand se pierd puneri la
     coada. */
  assert.match(intentie, /if \(error\) throw error;/);
});

/* ── Anularea partiala ──────────────────────────────────────────────────────── */

test("⚠ motivul 503 NU exista, si il aveam", () => {
  /*
   * Il luasem dintr-o pagina care il listeaza. Tabelul lor oficial are 500, 501, 502, 504, 505,
   * 506 — verificat de doua ori. Un comerciant care l-ar fi ales primea un refuz pe care nu-l
   * putea intelege, iar comanda ii ramanea neanulata la ei.
   */
  const ids = MOTIVE_ANULARE_TRENDYOL.map((m) => m.id).sort((a, b) => a - b);
  assert.deepEqual(ids, [500, 501, 502, 504, 505, 506]);
});

test("⚠ `shouldKeepPreviousStatus` nu se mai trimite din oficiu", () => {
  /*
   * Paginile lor nu se potrivesc: cea internationala il documenteaza, cea turceasca nu-l
   * pomeneste. Cand doua pagini ale aceluiasi serviciu spun lucruri diferite, campul OMIS e
   * partea sigura — implicitul lor e `false`, iar trimiterea unui camp pe care un capat nu-l
   * cunoaste e riscul necunoscut.
   */
  assert.match(client, /p\.shouldKeepPreviousStatus !== undefined/);
  assert.doesNotMatch(client, /shouldKeepPreviousStatus: p\.shouldKeepPreviousStatus \?\? true/);
});

test("⚠ o anulare PARTIALA nu inchide comanda", () => {
  /*
   * Restul liniilor pleaca mai departe la client. Marcata „UnSupplied" si trecuta pe „anulata"
   * la noi, comanda ar fi eliberat TOT stocul — inclusiv al marfii care chiar se expediaza.
   */
  /*
   * ⚠ SE MASOARA ORDINEA, nu un domeniu taiat pe semne. Taiat, treceam dincolo de bloc si
   * prindeam tranzitia de dedesubt — care e chiar calea corecta pentru anularea INTREAGA.
   *
   * Regula adevarata: ramura partiala se INTOARCE inainte sa ajunga la tranzitie.
   */
  const iPartiala = ful.indexOf("if (partiala) {");
  const iRetur = ful.indexOf("avertisment:", iPartiala);
  const iTranzitie = ful.indexOf("tranzitieComandaMarketplace", iPartiala);
  const iStare = ful.indexOf('status: "UnSupplied", last_synced_at', iPartiala);
  assert.ok(iPartiala > 0, "exista ramura partiala");
  assert.ok(iRetur > iPartiala && iRetur < iTranzitie, "se intoarce inainte de tranzitie");
  assert.ok(iRetur < iStare, "si inainte sa scrie starea pachetului");
});

test("⚠ liniile alese se verifica fata de pachet", () => {
  /* O linie straina sau o cantitate prea mare ar fi fost refuzata de ei cu un mesaj care nu
     spune CARE linie — iar comerciantul ar fi ramas cu o comanda pe care crede ca a anulat-o. */
  assert.match(ful, /nu e în acest pachet/);
  assert.match(ful, /Math\.max\(1, Math\.min\(Math\.floor\(a\.quantity\) \|\| 1, max\)\)/);
});
