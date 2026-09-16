import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";
import { verifyWebhookSignature } from "./revolut";
import { createHmac } from "node:crypto";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * REVOLUT: BANII CARE SE INTORC SI SEMNATURA CARE TACEA      (17.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ EXPUNEREA MASURATA: un magazin configurat (acum `enabled: false`, dar cu `secret_key`,
 * `webhook_id` SI `signing_secret`, deci un webhook chiar a fost inregistrat la ei) si O SINGURA
 * comanda reala, `ORD-MSKFBSOC-730`, 24,13 lei, din 08.08.2026, ramasa `cancelled/unpaid`.
 *
 * ⚠ Verificat anume: NIMIC din calea Revolut nu anuleaza comenzi. Anularea aceea a fost a omului.
 *
 * ⚠⚠ SI REVOLUT ARE DOAR TREI EVENIMENTE DE WEBHOOK. Documentatia lor Merchant API, citita din chiar
 * pachetul paginii (site-ul e un SPA care intoarce doar navigatia unui client obisnuit):
 * `ORDER_AUTHORISED`, `ORDER_CANCELLED`, `ORDER_COMPLETED`. **Niciunul despre rambursari.**
 *
 * Deci o rambursare NU poate fi impinsa catre noi niciodata. Singurul mod de a afla e `refunded_amount`
 * de pe comanda lor, camp care lipsea cu totul din tipul nostru.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("Semnatura webhookului", () => {
  const SECRET = "wsk_secret-de-proba";
  const CORP = '{"event":"ORDER_COMPLETED","order_id":"abc"}';
  const TS = "1700000000000";
  const bun = "v1=" + createHmac("sha256", SECRET).update(`v1.${TS}.${CORP}`).digest("hex");

  test("✅ forma ceruta de ei: `v1.{timestamp}.{corp}`, HMAC-SHA256", () => {
    assert.equal(verifyWebhookSignature(SECRET, bun, TS, CORP), true);
  });

  test("⚠⚠ un corp SCHIMBAT nu mai trece", () => {
    assert.equal(verifyWebhookSignature(SECRET, bun, TS, CORP + " "), false);
  });

  test("⚠⚠ alt secret nu trece", () => {
    assert.equal(verifyWebhookSignature("wsk_altul", bun, TS, CORP), false);
  });

  test("⚠⚠ alt timestamp nu trece: el intra in ce se semneaza", () => {
    assert.equal(verifyWebhookSignature(SECRET, bun, "1700000000001", CORP), false);
  });

  test("⚠ lipsa oricareia dintre cele trei = refuz", () => {
    assert.equal(verifyWebhookSignature("", bun, TS, CORP), false);
    assert.equal(verifyWebhookSignature(SECRET, null, TS, CORP), false);
    assert.equal(verifyWebhookSignature(SECRET, bun, null, CORP), false);
  });

  test("⚠⚠ si un secret GOL nu poate fi folosit ca sa se falsifice", () => {
    /*
     * ═══ PROBA DE DEASUPRA NU APARA ASTA, SI AM AFLAT-O DE LA BANC ═══
     *
     * Ea cerea doar ca un secret gol sa nu valideze o semnatura facuta cu secretul ADEVARAT, ceea ce
     * e adevarat oricum: cheile difera. Mutantul care scotea `!signingSecret` din garda a TRECUT.
     *
     * Ce trebuie aparat e altceva: `createHmac("sha256", "")` nu se plange, scoate un HMAC perfect
     * valid pe o cheie pe care o stie toata lumea. Fara garda, oricine ar semna cu cheia goala si ar
     * fi crezut. Aceeasi lectie ca la jetonul Netopia, vezi `probele-semneaza-cu-cheia-goala`.
     */
    const forjat = "v1=" + createHmac("sha256", "").update(`v1.${TS}.${CORP}`).digest("hex");
    assert.equal(verifyWebhookSignature("", forjat, TS, CORP), false, "cheia goala valideaza");
    assert.equal(verifyWebhookSignature(undefined, forjat, TS, CORP), false);
    assert.equal(verifyWebhookSignature(null, forjat, TS, CORP), false);
  });

  test("⚠ mai multe semnaturi in acelasi antet: e de ajuns una buna", () => {
    /* Asa se face rotatia de secret la ei: o vreme trimit doua. */
    assert.equal(verifyWebhookSignature(SECRET, `v1=deadbeef ${bun}`, TS, CORP), true);
  });
});

describe("O semnatura invalida nu mai dispare in tacere", () => {
  const w = viu("src/app/api/revolut/webhook/route.ts");

  test("⚠⚠ se scrie in JURNAL, nu doar in consola", () => {
    /*
     * ═══ DE CE CONTEAZA, DESI RASPUNSUL RAMANE 200 ═══
     *
     * 200 e corect pentru o cerere falsificata: n-are rost s-o punem pe Revolut s-o repete. Dar are
     * un al doilea inteles, mult mai suparator: daca `signing_secret` se roteste la EI si nu si la
     * noi, FIECARE webhook legitim devine „invalid", e aruncat cu 200 (deci nerepetat), si integrarea
     * se opreste complet fara ca cineva sa afle.
     *
     * `console.error` nu ajunge nicaieri: jurnalele de rulare se rotesc si nimeni nu le citeste.
     */
    const ramura = /if \(!valid\) \{[\s\S]*?\n  \}/.exec(w)?.[0] ?? "";
    assert.ok(ramura, "ramura de semnatura invalida a disparut");
    assert.match(ramura, /await logError\(/, "semnatura invalida se pierde iar in consola");
    assert.match(ramura, /businessId,/, "nu se stie CARUI magazin i se intampla");
    assert.match(ramura, /severity: "warning"/, "o cerere falsificata izolata nu e o alarma critica");
  });

  test("⚠ si tot NU se actioneaza pe ea", () => {
    const ramura = /if \(!valid\) \{[\s\S]*?\n  \}/.exec(w)?.[0] ?? "";
    assert.ok(!/finalizeRevolutOrder|payment_status/.test(ramura), "se lucreaza pe un webhook neverificat");
  });

  test("⚠⚠ si verificarea vine INAINTEA oricarei atingeri a comenzii, SI chiar se face", () => {
    /*
     * ⚠ ORDINEA SINGURA NU E DE AJUNS. Prima forma cerea doar ca `verifyWebhookSignature` sa apara
     * inaintea lui `from("orders")`, iar mutantul `const valid = true || verifyWebhookSignature(...)`
     * a TRECUT: numele ramanea la locul lui, dar verificarea devenea moarta. Aceeasi lectie ca la
     * poarta de cron, unde proba masura POZITIA si nu SENSUL.
     */
    assert.match(
      w,
      /const valid = verifyWebhookSignature\(/,
      "verificarea semnaturii a fost scurtcircuitata",
    );
    assert.ok(
      w.indexOf("verifyWebhookSignature") < w.indexOf('from("orders")'),
      "comanda se cauta inainte de a sti cine cheama",
    );
  });
});

describe("Banii care se intorc", () => {
  const c = viu("src/app/api/cron/revolut-reconcile/route.ts");
  const r = viu("src/lib/revolut.ts");

  test("⚠⚠ `refunded_amount` lipsea din tip; acum e acolo si se citeste", () => {
    assert.match(r, /refunded_amount\?: number;/, "campul a disparut din tip");
    assert.match(c, /rev\.data\.refunded_amount/, "rambursarile nu se mai vad");
  });

  test("⚠⚠ cronul intreaba despre comenzile PLATITE", () => {
    /* Singura cale: Revolut n-are niciun eveniment de webhook despre rambursari. */
    assert.match(c, /\.eq\("payment_status", "paid"\)/, "cronul nu pazeste rambursarile");
    assert.match(c, /baniiSAuIntors\(/, "cronul si-a facut propria regula");
  });

  test("⚠⚠ si NICIUN `return` timpuriu nu face trecerea noua cod MORT", () => {
    /* A PATRA OARA aceeasi capcana intr-o zi. */
    const corp = c.slice(c.indexOf("export async function GET"));
    const pana = corp.slice(0, corp.indexOf('eq("payment_status", "paid")'));
    for (const i of pana.match(/return NextResponse\.json\([^;]*\);/g) ?? []) {
      assert.match(i, /status: (401|503)/, `iesire care ar face paza rambursarilor cod mort: ${i}`);
    }
  });

  test("⚠ magazinele se string din AMANDOUA listele", () => {
    assert.match(c, /\[\.\.\.neplatite, \.\.\.\(platite \?\? \[\]\)\]\.map/,
      "magazinele cu doar comenzi platite raman nepazite");
  });

  test("⚠⚠ o interogare picata NU lamureste nimic", () => {
    const i = c.indexOf("paza rambursarii a esuat");
    assert.ok(i > 0, "paza rambursarii nu mai are catch propriu");
    const ramura = c.slice(c.lastIndexOf("} catch (e) {", i), c.indexOf("}", i) + 1);
    assert.ok(!/baniiSAuIntors/.test(ramura), "o pana de retea misca acum comanda");
  });
});

describe("Rambursarea pornita din panou", () => {
  const a = viu("src/lib/actions/revolut.actions.ts");
  const f = /export async function rambourseazaPrinRevolut[\s\S]*$/.exec(a)?.[0] ?? "";

  test("⚠⚠ unealta nu mai e SCRISA SI NECHEMATA", () => {
    assert.ok(f, "actiunea de rambursare a disparut");
    assert.match(f, /refundOrder\(/);
  });

  test("⚠⚠ trece prin REGISTRU si cere cele trei conditii", () => {
    assert.match(f, /cuRegistru\(/);
    assert.match(f, /furnizor: "revolut"/);
    assert.match(f, /if \(order\.payment_method !== "revolut"\) \{/);
    assert.match(f, /if \(order\.payment_status !== "paid"\) \{/);
    assert.match(f, /if \(!revolutOrderId\) \{/);
    assert.ok(f.indexOf("cuRegistru(") < f.indexOf("refundOrder("), "apelul a iesit de sub registru");
  });

  test("⚠⚠ statusul NU se scrie de aici", () => {
    assert.ok(!/aplica_tranzitia_comenzii/.test(f));
    assert.ok(!/payment_status: "refunded"/.test(f));
  });
});

// ─── Recensamantul care apara toti cei cinci ─────────────────────────────────

describe("Toti procesatorii, aceeasi regula si aceeasi purtare", () => {
  test("⚠⚠ fiecare cron de plati are o trecere care intreaba despre comenzile PLATITE", () => {
    /*
     * ═══ PLASA CARE INCHIDE TRECEREA INTREAGA ═══
     *
     * Aceeasi gaura a fost gasita la TOTI cinci: nimeni nu intreba vreodata daca banii au iesit la
     * loc. Randul asta cade daca un cron de plati o pierde, sau daca al saselea procesator apare
     * fara ea.
     */
    for (const f of [
      "src/app/api/cron/stripe-reconcile/route.ts",
      "src/app/api/cron/ipay-reconcile/route.ts",
      "src/app/api/cron/klarna-reconcile/route.ts",
      "src/app/api/cron/revolut-reconcile/route.ts",
      "src/app/api/cron/netopia-reconciliere/route.ts",
    ]) {
      const s = viu(f);
      assert.match(s, /\.eq\("payment_status", "paid"\)/, `${f} nu pazeste rambursarile`);
    }
  });

  test("⚠⚠ si niciunul nu si-a facut propria regula despre ce inseamna «banii s-au intors»", () => {
    for (const f of [
      "src/app/api/cron/stripe-reconcile/route.ts",
      "src/app/api/cron/ipay-reconcile/route.ts",
      "src/app/api/cron/klarna-reconcile/route.ts",
      "src/app/api/cron/revolut-reconcile/route.ts",
      "src/app/api/stripe/connect/webhook/route.ts",
    ]) {
      assert.match(viu(f), /from "@\/lib\/plati\/banii-s-au-intors"/, `${f} nu foloseste regula comuna`);
    }
  });

  test("⚠⚠ si niciun buton de rambursare nu e legat de selectorul de status", () => {
    /*
     * In panou „rambursat" e o eticheta pusa dupa o rambursare facuta de mana. Legata de ea, apasarea
     * obisnuita ar trimite banii a doua oara, la fiecare comanda deja rambursata manual.
     */
    const o = viu("src/lib/actions/order.actions.ts");
    for (const n of [
      "rambourseazaPrinNetopia", "rambourseazaPrinIpay",
      "rambourseazaPrinKlarna", "rambourseazaPrinRevolut",
    ]) {
      assert.ok(!o.includes(n), `schimbarea de status cheama ${n}`);
    }
  });
});
