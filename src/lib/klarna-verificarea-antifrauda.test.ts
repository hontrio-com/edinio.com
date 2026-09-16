import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * KLARNA: VERIFICAREA ANTIFRAUDA CARE NU SE MAI TERMINA      (17.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ EXPUNEREA MASURATA INAINTE DE ORICE: **ZERO**. Zero magazine cu `klarna_config` din 130, zero
 * comenzi, zero randuri in registru, zero in jurnal. Ca la iPay: integrarea e OFERITA, dar n-a rulat
 * niciodata pentru nimeni.
 *
 * ═══ ⚠⚠ GAURA, SI E PE DOS FATA DE CELELALTE TREI ═══
 *
 * La Netopia, Stripe si iPay banii erau LUATI si noi nu stiam. Aici banii **nu se iau deloc**, iar
 * marfa a plecat:
 *
 *   1. `placeOrder` intoarce `fraud_status: PENDING` (Klarna se hotaraste mai tarziu);
 *   2. comanda se pune pe `confirmed` / `unpaid`, cu `klarna_order_id` scris;
 *   3. cronul EXCLUDE anume comenzile cu `klarna_order_id` (si bine face: altfel ar replasa);
 *   4. `merchant_urls` inregistra DOAR `confirmation`, deci Klarna n-avea unde sa ne anunte;
 *   5. `getOmOrder` nu se mai chema din nicio parte.
 *
 * Deci daca Klarna accepta dupa aceea, **nimeni nu captureaza**. Comerciantul nu incaseaza niciodata,
 * comanda arata „confirmata", si nimic nu semnaleaza.
 *
 * ⚠ SE REPARA INTREBAND, nu asteptand un callback: specificatia lor de Order Management (citita
 * 17.09.2026) arata ca `GET /ordermanagement/v1/orders/{id}` intoarce chiar `fraud_status`,
 * `expires_at`, `captured_amount` si `refunded_amount`.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const F = viu("src/lib/klarna-finalize.ts");
const C = viu("src/app/api/cron/klarna-reconcile/route.ts");
const K = viu("src/lib/klarna.ts");
const A = viu("src/lib/actions/klarna.actions.ts");

describe("Comanda ramasa in verificare antifrauda", () => {
  const f = /export async function reiaKlarnaInAsteptare[\s\S]*$/.exec(F)?.[0] ?? "";

  test("⚠⚠ exista cineva care se intoarce la ea", () => {
    assert.ok(f, "nimeni nu mai reia o comanda ramasa in PENDING");
    assert.match(C, /reiaKlarnaInAsteptare\(/, "cronul nu cheama reluarea");
  });

  test("⚠⚠ cronul CHIAR le cauta, si tocmai pe cele pe care bucla veche le exclude", () => {
    /*
     * Bucla de sesiuni filtreaza `.is("klarna_order_id", null)`; trecerea noua face pe dos.
     *
     * ⚠ SE PRINDE INTEROGAREA INTREAGA, nu prezenta sirului. Prima forma cerea doar ca
     * `.not("klarna_order_id", "is", null)` sa apara undeva in fisier, iar mutantul care il
     * inversa in interogarea de ASTEPTARE a trecut: acelasi sir mai apare in interogarea de
     * rambursari. A patra oara azi cand o proba de-a mea masoara prezenta in loc de fapta.
     */
    const q = C.slice(C.indexOf("const { data: inAsteptare"), C.indexOf("const { data: platite"));
    assert.ok(q, "interogarea comenzilor in verificare a disparut");
    assert.match(q, /\.eq\("payment_status", "unpaid"\)/);
    assert.match(q, /\.not\("klarna_order_id", "is", null\)/, "comenzile deja plasate nu se mai cauta");
    assert.ok(!/\.is\("klarna_order_id", null\)/.test(q), "interogarea le exclude, in loc sa le caute");
  });

  test("⚠⚠ ACCEPTAT dupa verificare => se CAPTUREAZA si abia apoi se marcheaza platit", () => {
    /* Fara capture, „platit" ar fi o minciuna: la Klarna banii se iau prin capture. */
    assert.match(f, /captureOrder\(cfg, klarnaOrderId, expected\)/, "nu se mai captureaza nimic");
    assert.match(f, /finalizeazaPlataComenzii\(/);
    assert.ok(
      f.indexOf("captureOrder(cfg, klarnaOrderId, expected)") < f.indexOf("finalizeazaPlataComenzii("),
      "comanda s-ar marca platita INAINTE de incasare",
    );
  });

  test("⚠⚠ REFUZAT dupa verificare NU anuleaza comanda, dar se spune raspicat", () => {
    /*
     * Aceeasi hotarare ca la cardul refuzat de la Netopia: refuzul e al lui Klarna, nu al
     * cumparatorului, iar comerciantul poate vrea sa-i ceara alta metoda de plata.
     */
    const ramura = f.slice(f.indexOf('if (fraud === "REJECTED")'), f.indexOf('if (fraud !== "ACCEPTED")'));
    assert.ok(ramura, "ramura de refuz a disparut");
    assert.ok(!/cancelled/.test(ramura), "refuzul anuleaza comanda");
    assert.match(ramura, /spune\(/, "refuzul nu ajunge la om");
  });

  test("⚠⚠ o interogare picata NU e un refuz", () => {
    /* Cea mai urata citire pe dos cu putinta: o pana de retea luata drept „Klarna a refuzat". */
    assert.match(
      f,
      /if \(!om\.ok \|\| !om\.data\) return \{ status: "inca-in-verificare" \};/,
      "o interogare picata are acum alt inteles",
    );
  });

  test("⚠⚠ si se striga DOAR cand autorizarea e aproape de expirare", () => {
    /*
     * Dupa `expires_at` banii nu mai pot fi capturati deloc. Pana atunci, o alarma la fiecare cinci
     * minute ar fi zgomot si n-ar mai fi citita cand chiar conteaza.
     */
    assert.match(f, /expires_at/, "expirarea autorizarii nu se mai citeste");
    assert.match(f, /48 \* 3600_000/, "pragul de avertizare a disparut");
  });

  test("⚠ si nu se recaptureaza ce e deja capturat", () => {
    assert.match(f, /const dejaCapturat = Number\(om\.data\.captured_amount \?\? 0\) >= expected/,
      "o rulare picata dupa capture ar captura a doua oara");
  });
});

describe("Campurile care lipseau din tipul nostru", () => {
  test("⚠⚠ `fraud_status` si `expires_at` sunt in raspunsul LOR, deci si la noi", () => {
    /* Fara ele, deznodamantul unei verificari si termenul de incasare erau invizibile in cod. */
    const t = /export type KlarnaOmOrder = \{[\s\S]*?\n\};/.exec(K)?.[0] ?? "";
    assert.ok(t, "tipul comenzii de order-management a disparut");
    assert.match(t, /fraud_status\?: string;/);
    assert.match(t, /expires_at\?: string;/);
  });
});

describe("Banii care se intorc", () => {
  test("⚠⚠ `refunded_amount` era DECLARAT si necitit; acum se citeste", () => {
    assert.match(C, /om\.data\.refunded_amount/, "rambursarile nu se mai vad");
    assert.match(C, /baniiSAuIntors\(/, "cronul si-a facut propria regula");
  });

  test("⚠⚠ si trece prin ACEEASI regula ca la ceilalti procesatori", () => {
    assert.match(C, /from "@\/lib\/plati\/banii-s-au-intors"/, "Klarna si-a facut copia lui");
  });

  test("⚠ o interogare picata NU lamureste nimic", () => {
    const i = C.indexOf("paza rambursarii a esuat");
    assert.ok(i > 0, "paza rambursarii nu mai are catch propriu");
    const ramura = C.slice(C.lastIndexOf("} catch (e) {", i), C.indexOf("}", i) + 1);
    assert.ok(!/baniiSAuIntors/.test(ramura), "o pana de retea misca acum comanda");
  });
});

describe("Cronul: nicio poarta nu face trecerile noi cod MORT", () => {
  test("⚠⚠ intre inceput si a doua trecere nu exista iesire care sa nu fie eroare", () => {
    /*
     * A TREIA OARA aceeasi capcana intr-o zi (`stripe-reconcile`, `ipay-reconcile`, aici). Statea
     * `if (!orders || orders.length === 0) return ...`, adica iesirea pe cazul NORMAL.
     *
     * ⚠ Se ingaduie o iesire pe „niciun magazin de verificat", fiindca aceea vine DUPA ce toate
     * cele trei liste au fost citite: atunci chiar nu e nimic de facut.
     */
    const corp = C.slice(C.indexOf("export async function GET"));
    const pana = corp.slice(0, corp.indexOf("reiaKlarnaInAsteptare("));
    for (const i of pana.match(/return NextResponse\.json\([^;]*\);/g) ?? []) {
      const eEroare = /status: (401|503)/.test(i);
      const eListaGoala = /reluate: 0, intoarse: 0/.test(i);
      assert.ok(eEroare || eListaGoala, `iesire care ar face trecerile noi cod mort: ${i}`);
    }
  });

  test("⚠ si magazinele se string din TOATE cele trei liste", () => {
    /* Altfel magazinele care au numai comenzi in verificare sau numai platite ar fi ramas fara
       configurare, adica exact cele pentru care s-au scris trecerile. */
    assert.match(C, /\.\.\.\(inAsteptare \?\? \[\]\)\.map/, "magazinele cu comenzi in verificare raman nepazite");
    assert.match(C, /\.\.\.\(platite \?\? \[\]\)\.map/, "magazinele cu comenzi platite raman nepazite");
  });
});

describe("Rambursarea pornita din panou", () => {
  const f = /export async function rambourseazaPrinKlarna[\s\S]*$/.exec(A)?.[0] ?? "";

  test("⚠⚠ unealta nu mai e SCRISA SI NECHEMATA", () => {
    assert.ok(f, "actiunea de rambursare a disparut");
    assert.match(f, /refundOrder\(/, "rambursarea nu mai cheama clientul");
  });

  test("⚠⚠ NU e legata de selectorul de status", () => {
    assert.ok(
      !/rambourseazaPrinKlarna|refundOrder/.test(viu("src/lib/actions/order.actions.ts")),
      "schimbarea de status a ajuns sa trimita bani inapoi",
    );
  });

  test("⚠⚠ trece prin REGISTRU si cere cele trei conditii", () => {
    assert.match(f, /cuRegistru\(/);
    assert.match(f, /furnizor: "klarna"/);
    assert.match(f, /if \(order\.payment_method !== "klarna"\) \{/);
    assert.match(f, /if \(order\.payment_status !== "paid"\) \{/);
    assert.match(f, /if \(!klarnaOrderId\) \{/);
    assert.ok(f.indexOf("cuRegistru(") < f.indexOf("refundOrder("), "apelul a iesit de sub registru");
  });

  test("⚠⚠ statusul NU se scrie de aici", () => {
    /* Un singur drum catre „rambursat": cronul, prin aceeasi regula ca o rambursare din portalul lor. */
    assert.ok(!/aplica_tranzitia_comenzii/.test(f));
    assert.ok(!/payment_status: "refunded"/.test(f));
  });
});
