import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { citesteNotificarea } from "./notificari";

/* ══════════════════════════════════════════════════════════════════════════
   UN RETUR NU E O COMANDA, SI NU APARE IN `order/read` (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE ERA. Orice notificare fara id de comanda recunoscut cadea pe aceeasi plasa:
   „citeste comenzile ultimelor cincisprezece minute". Pentru un RETUR, asta nu face
   absolut nimic — returul nu e o comanda si nu se citeste de acolo.

   Semnalul se pierdea, iar returul se afla abia la trecerea de sfert de ora a cronului.
   Comerciantul avea marfa inapoi in depozit si niciun rand in Edinio.

   ⚠ La DOCUMENTATIE APROBATA e mai subtil: reconcilierea merge cu un cursor prin catalog,
   pagina cu pagina. Pe 3.700 de oferte, o aprobare poate sta zeci de minute pana ajunge
   cursorul la ea — iar „de ce nu se vinde inca produsul meu?" e chiar cea mai frecventa
   intrebare a comerciantului.

   ⚠ FORMA NOTIFICARII NU E DOCUMENTATA NICAIERI. Nu e in OpenAPI. Deci recunoasterea e
   larga si prudenta, iar cand nu se recunoaste nimic se cade pe plasa de dinainte: o
   adaugare care ghiceste n-are voie sa strice ce mergea.
*/

test("un retur se recunoaste dupa id, chiar fara niciun text", () => {
  const n = citesteNotificarea({ rma_id: 4242 });
  assert.deepEqual(n, { fel: "retur", id: 4242 });
});

test("un retur se recunoaste si numai dupa text", () => {
  /* ⚠ Cu `id` generic si un text care spune ce e. Sunt forme reale la alti furnizori. */
  assert.deepEqual(citesteNotificarea({ resource: "RMA", id: 7 }), { fel: "retur", id: 7 });
  assert.deepEqual(citesteNotificarea({ event: "return_status_changed", id: 8 }), { fel: "retur", id: 8 });
});

test("⚠ un retur care poarta si `order_id` NU devine comanda", () => {
  /*
   * Cea mai importanta proba din fisier. Un retur poarta id-ul comenzii returnate. Cautat
   * intai dupa comanda, fiecare retur ar fi fost tratat drept comanda: s-ar fi recitit
   * comanda (care n-are nimic nou de spus) si returul s-ar fi pierdut la fel ca pana acum.
   *
   * Adica reparatia ar fi aratat ca merge, si n-ar fi schimbat nimic.
   */
  const n = citesteNotificarea({ resource: "rma", rma_id: 99, order_id: 12345 });
  assert.deepEqual(n, { fel: "retur", id: 99 }, "id-ul returului, nu al comenzii");
});

test("documentatia aprobata duce la oferta, nu la comenzi", () => {
  const n = citesteNotificarea({ resource: "documentation", product_id: 5150 });
  assert.deepEqual(n, { fel: "documentatie", id: 5150 });
});

test("o comanda ramane o comanda", () => {
  assert.deepEqual(citesteNotificarea({ order_id: 12345 }), { fel: "comanda", id: 12345 });
  assert.deepEqual(citesteNotificarea({ id: "998877" }), { fel: "comanda", id: 998877 });
});

test("forma impachetata in `data` se desface", () => {
  /* ⚠ Se vede la multi furnizori, si e chiar forma pe care o cauta deja `idComenzii`. */
  assert.deepEqual(citesteNotificarea({ data: { order_id: 42 } }), { fel: "comanda", id: 42 });
  assert.deepEqual(citesteNotificarea({ topic: "rma", data: { rma_id: 43 } }), { fel: "retur", id: 43 });
});

test("ce nu se recunoaste NU se ghiceste", () => {
  /*
   * ⚠ Perechea tuturor probelor de sus. Fara ea, recunoasterea ar fi putut deveni tot mai
   * larga pana cand o notificare de comanda ar fi ajuns pe calea returului — si atunci
   * s-ar fi cerut de la ei un retur care nu exista, iar comanda nu s-ar mai fi citit.
   */
  assert.deepEqual(citesteNotificarea({}), { fel: "necunoscut" });
  assert.deepEqual(citesteNotificarea(null), { fel: "necunoscut" });
  assert.deepEqual(citesteNotificarea("ceva"), { fel: "necunoscut" });
  assert.deepEqual(citesteNotificarea({ ceva: "altceva" }), { fel: "necunoscut" });
});

test("numerele vin si ca text, si se citesc", () => {
  /* ⚠ Aceeasi lectie ca la `allow_to_add_offer`: schema lor nu spune ce forma are campul,
     iar in raspunsuri se vad amandoua. Un tip ingust ar fi o minciuna care trece de `tsc`. */
  assert.deepEqual(citesteNotificarea({ rma_id: "77" }), { fel: "retur", id: 77 });
});

/**
 * Marcajele pe care le muta CRONUL, si numai el.
 *
 * ⚠ Numele sunt cele reale din `EmagConfig` — verificate acolo, nu inventate. O lista de
 * nume care nu exista ar fi facut proba sa treaca verde orice: chiar tiparul „o proba care
 * nu gaseste nimic trece intotdeauna”.
 */
const MARCAJELE_CRONULUI = [
  "orders_synced_at", "rma_synced_at", "reconcile_page", "catalog_citit_la",
] as const;

/* ── Si ruta chiar le foloseste ───────────────────────────────────────────── */

test("ruta merge pe calea rapida, si pastreaza plasa de dinainte", () => {
  const sursa = readFileSync("src/app/api/emag/webhook/route.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  assert.match(sursa, /semnal\.fel === "retur"/, "returul are cale proprie");
  assert.match(sursa, /aduUnRetur\(admin, ctx, semnal\.id\)/, "si chiar citeste returul acela");
  assert.match(sursa, /semnal\.fel === "documentatie"/, "documentatia are cale proprie");
  assert.match(sursa, /scrieStatusurile\(admin, businessId, oferte\)/, "si scrie starea ofertei");

  /* ⚠ Plasa de dinainte trebuie sa RAMANA: notificarile se pot pierde pe drum, iar forma
     lor nu e documentata nicaieri. Scoasa, o notificare nerecunoscuta n-ar mai face nimic. */
  assert.match(sursa, /aduComenzile\(admin, ctx, new Date\(Date\.now\(\) - 15/,
    "fereastra scurta de comenzi ramane pentru ce nu se recunoaste");
});

test("nicio cale rapida nu atinge marcajul cronului", () => {
  /*
   * ⚠ Notificarile vin oricand si in orice ordine. Mutat de ele, cursorul cronului ar fi
   * sarit peste comenzi pe care nu le-a citit nimeni. Regula era deja scrisa in ruta;
   * proba o tine si peste caile noi.
   */
  /* ⚠ Fara comentarii: notele care explica regula pomenesc chiar numele cautate, iar
     proba ar cadea pe propriul ei text. Tiparul care a muscat de patru ori azi. */
  const sursa = readFileSync("src/app/api/emag/webhook/route.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ 	]*\/\/.*$/gm, "");

  /* ⚠ Se cauta MARCAJELE, nu orice scriere in configurare: `ultimul_webhook` chiar se
     scrie de aici, si trebuie, ca sa se poata raspunde la „notificarile chiar merg?". */
  for (const marcaj of MARCAJELE_CRONULUI) {
    assert.ok(!sursa.includes(marcaj), `webhook-ul scrie marcajul \`${marcaj}\``);
  }

  /* Si nici comenzile citite de aici nu au voie sa mute fereastra cronului. */
  assert.match(
    sursa, /aduComenzile\(admin, ctx, new Date\(/,
    "fereastra se da din afara, cu o data anume, nu se ia din marcaj",
  );
});

test("marcajele cautate exista cu adevarat in configurare", () => {
  /*
   * ⚠ Proba probei. Un nume scris gresit in lista de mai sus ar fi cautat ceva ce nu poate
   * exista nicaieri, iar verificarea ar fi trecut verde peste un webhook care chiar mutase
   * cursorul cronului.
   */
  const tipuri = readFileSync("src/lib/emag/types.ts", "utf8");
  for (const marcaj of MARCAJELE_CRONULUI) {
    assert.ok(
      new RegExp(String.raw`^\s*${marcaj}\?:`, "m").test(tipuri),
      `\`${marcaj}\` nu exista in \`EmagConfig\`: proba cauta un nume inventat`,
    );
  }
});

test("notificarea de AWB cade ANUME pe fereastra de comenzi", () => {
  /*
   * ⚠ Nu e o scapare, e o hotarare — si e scrisa ca atare in `notificari.ts`.
   *
   * O schimbare de AWB vine odata cu o schimbare de stare a COMENZII, iar aceea se vede
   * in `order/read` cu `modifiedAfter`: plasa de dinainte o prinde. Deosebirea fata de
   * RETUR e tocmai asta — un retur NU apare niciodata in `order/read`.
   *
   * ⚠ Si nu tinem noi starea curierului: `emag_awb` se scrie la emitere si nu se
   * improspateaza de nicaieri. O ramura care „ar actualiza AWB-ul" ar fi trebuit sa
   * inventeze intai ce actualizeaza — adica o ramura goala care pare ca face ceva.
   */
  const n = citesteNotificarea({ resource: "AWB", emag_id: 555 });
  assert.equal(n.fel === "retur" || n.fel === "documentatie", false,
    "AWB-ul n-are cale proprie, si nu trebuie sa nimereasca pe alta");

  const sursa = readFileSync("src/lib/emag/notificari.ts", "utf8");
  assert.match(sursa, /NOTIFICARILE DE AWB/, "hotararea trebuie scrisa, nu dedusa din lipsa");
});
