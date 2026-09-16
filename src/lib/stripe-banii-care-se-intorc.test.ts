import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";
import { baniiSAuIntors, type ComandaAtinsa } from "./stripe-banii-s-au-intors";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * BANII CARE SE INTORC LA STRIPE                              (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ CE LIPSEA CU TOTUL. Masurat in cod: se tratau SASE feluri de evenimente Stripe
 * (`account.updated`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
 * `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`) si
 * niciunul nu era despre bani intorsi. Iar cronul de reconciliere se uita EXCLUSIV la comenzi
 * `unpaid`, deci nici el n-avea cum sa afle.
 *
 * Adica: comerciantul ramburseaza din panoul Stripe (unde e cel mai la indemana, si unde a facut-o
 * dintotdeauna), sau cumparatorul castiga o contestatie, iar comanda ramane `paid` la noi PENTRU
 * TOTDEAUNA. Banii dusi, marfa dusa, platforma arata o vanzare incheiata cu bine.
 *
 * ⚠ Expunerea masurata in productie la scrierea acestor probe: 7 comenzi Stripe Connect in doua
 * magazine, 971,01 lei incasati, sesiuni `cs_live_` (bani adevarati, nu test). Trei magazine au
 * contul conectat pornit.
 */

/** Baza minima: retine ce s-a chemat, ca sa se poata afirma despre PURTARE, nu despre siruri. */
function bazaFalsa(optiuni: { tranzitieCade?: boolean } = {}) {
  const scrieri: { rpc?: string; argumente?: unknown; tabel?: string; rand?: unknown }[] = [];
  const admin = {
    from(tabel: string) {
      const api = {
        select: () => api,
        insert: (rand: unknown) => { scrieri.push({ tabel, rand }); return Promise.resolve({ error: null }); },
        in: () => Promise.resolve({ data: [{ id: "biz-1", user_id: "om-1" }], error: null }),
        eq: () => api,
      };
      return api;
    },
    rpc(nume: string, argumente: unknown) {
      scrieri.push({ rpc: nume, argumente });
      return Promise.resolve(
        optiuni.tranzitieCade
          ? { data: null, error: { message: "baza a picat" } }
          : { data: { gasit: true }, error: null },
      );
    },
  };
  return { admin: admin as never, scrieri };
}

const COMANDA: ComandaAtinsa = {
  id: "cmd-1", business_id: "biz-1", order_number: "#0010",
  status: "delivered", payment_status: "paid", total: 504.01,
};

const notificari = (s: ReturnType<typeof bazaFalsa>["scrieri"]) => s.filter((x) => x.tabel === "notifications");
const tranzitii = (s: ReturnType<typeof bazaFalsa>["scrieri"]) => s.filter((x) => x.rpc === "aplica_tranzitia_comenzii");

describe("Rambursarea INTEGRALA", () => {
  test("⚠⚠ marcheaza comanda rambursata, si o face prin TRANZITIE, nu prin `update`", async () => {
    /*
     * Un `update` direct ar fi lasat cuponul si stocul neatinse, deci „rambursat" ar fi insemnat
     * doua lucruri diferite dupa cum a fost aflat. Acelasi drum ca la panou si ca la Netopia.
     */
    const { admin, scrieri } = bazaFalsa();
    const v = await baniiSAuIntors(admin, COMANDA, { intors: 50401, incasat: 50401, moneda: "ron" }, "webhook");
    assert.deepEqual(v, { fel: "integral" });
    const t = tranzitii(scrieri);
    assert.equal(t.length, 1, "rambursarea nu a trecut prin tranzitia comenzii");
    assert.equal((t[0].argumente as { p_payment_status: string }).p_payment_status, "refunded");
  });

  test("⚠ dar statusul comenzii NU se schimba: banii intorsi nu inseamna marfa intoarsa", async () => {
    const { admin, scrieri } = bazaFalsa();
    await baniiSAuIntors(admin, COMANDA, { intors: 50401, incasat: 50401, moneda: "ron" }, "webhook");
    assert.equal((tranzitii(scrieri)[0].argumente as { p_status: string }).p_status, "delivered");
  });

  test("⚠⚠ si i se SPUNE omului, nu doar jurnalului", async () => {
    /*
     * Lectia din 16.09, de la cronurile de curieri: cinci din saptesprezece calculau corect ca ceva
     * merita spus si o scriau intr-un jurnal pe care comerciantul nu-l deschide niciodata.
     */
    const { admin, scrieri } = bazaFalsa();
    await baniiSAuIntors(admin, COMANDA, { intors: 50401, incasat: 50401, moneda: "ron" }, "webhook");
    const n = notificari(scrieri);
    assert.equal(n.length, 1, "comerciantul nu primeste nimic in clopotel");
    assert.match(String((n[0].rand as { message: string }).message), /504\.01 RON/);
    assert.match(String((n[0].rand as { message: string }).message), /storneaz/i, "nu i se spune de factura");
  });

  test("⚠⚠ iar daca tranzitia pica, NU se raporteaza succes", async () => {
    /* Banii intorsi si comanda aratand „platita" e cea mai urata stare cu putinta. */
    const { admin, scrieri } = bazaFalsa({ tranzitieCade: true });
    const v = await baniiSAuIntors(admin, COMANDA, { intors: 50401, incasat: 50401, moneda: "ron" }, "webhook");
    assert.equal(v.fel, "esec");
    assert.equal(notificari(scrieri).length, 0, "s-a anuntat o rambursare care nu s-a scris");
  });

  test("⚠ o comanda deja rambursata nu se rescrie si nu se restriga", async () => {
    /* Singura garda pe drumul cronului: acolo nu exista niciun id de eveniment de deduplicat. */
    const { admin, scrieri } = bazaFalsa();
    const v = await baniiSAuIntors(
      admin, { ...COMANDA, payment_status: "refunded" },
      { intors: 50401, incasat: 50401, moneda: "ron" }, "reconciliere",
    );
    assert.deepEqual(v, { fel: "nimic" });
    assert.equal(tranzitii(scrieri).length, 0);
    assert.equal(notificari(scrieri).length, 0);
  });
});

describe("Rambursarea PARTIALA: nu se minte in baza", () => {
  test("⚠⚠ NU scrie «rambursat», fiindca baza n-are cum sa spuna «partial»", async () => {
    /*
     * ═══ DE CE E O HOTARARE, NU O LIPSA ═══
     *
     * `orders_payment_status_check` ingaduie exact trei valori: `unpaid`, `paid`, `refunded`. Nu
     * exista `partially_refunded` (desi `marfa-a-plecat-fara-bani.ts` il numara intr-un set, unde e
     * valoare MOARTA: baza nu-l poate tine).
     *
     * Scris `refunded` la o rambursare partiala, randul ar spune ca s-au intors TOTI banii (fals)
     * si ar scoate comanda din semnalul de marfa plecata fara bani. Se lasa `paid`, care e adevarat
     * (o parte din bani chiar au ramas), si se strica tacerea.
     */
    const { admin, scrieri } = bazaFalsa();
    const v = await baniiSAuIntors(admin, COMANDA, { intors: 20000, incasat: 50401, moneda: "ron" }, "webhook");
    assert.deepEqual(v, { fel: "partial" });
    assert.equal(tranzitii(scrieri).length, 0, "s-a scris «rambursat» pentru o rambursare partiala");
  });

  test("⚠⚠ dar se SPUNE, cu amandoua sumele", async () => {
    const { admin, scrieri } = bazaFalsa();
    await baniiSAuIntors(admin, COMANDA, { intors: 20000, incasat: 50401, moneda: "ron" }, "webhook");
    const m = String((notificari(scrieri)[0].rand as { message: string }).message);
    assert.match(m, /200\.00 RON/, "nu se spune cat s-a intors");
    assert.match(m, /504\.01 RON/, "nu se spune cat se incasase");
  });
});

describe("Contestatia NU e o rambursare", () => {
  test("⚠⚠ comanda nu se misca deloc: o contestatie se poate CASTIGA", async () => {
    const { admin, scrieri } = bazaFalsa();
    const v = await baniiSAuIntors(
      admin, COMANDA,
      { intors: 50401, incasat: 50401, moneda: "ron", contestatie: true, referinta: "dp_1" },
      "webhook",
    );
    assert.deepEqual(v, { fel: "contestata" });
    assert.equal(tranzitii(scrieri).length, 0, "o contestatie a schimbat starea comenzii");
  });

  test("⚠⚠ si se striga, cu TERMENUL, fiindca tacerea o pierde din oficiu", async () => {
    const { admin, scrieri } = bazaFalsa();
    await baniiSAuIntors(
      admin, COMANDA,
      { intors: 50401, incasat: 50401, moneda: "ron", contestatie: true }, "webhook",
    );
    const m = String((notificari(scrieri)[0].rand as { message: string }).message);
    assert.match(m, /termen/i, "nu i se spune ca are un termen de raspuns");
    assert.match(m, /din oficiu/i, "nu i se spune ce se intampla daca tace");
  });

  test("⚠ o contestatie peste o comanda DEJA rambursata tot se spune", async () => {
    /* Garda de repetare e pentru rambursari. O contestatie e alt fapt, si mereu o veste noua. */
    const { admin, scrieri } = bazaFalsa();
    const v = await baniiSAuIntors(
      admin, { ...COMANDA, payment_status: "refunded" },
      { intors: 100, incasat: 50401, moneda: "ron", contestatie: true }, "webhook",
    );
    assert.equal(v.fel, "contestata");
    assert.equal(notificari(scrieri).length, 1);
  });
});

describe("Nimic de facut", () => {
  test("⚠ zero bani intorsi NU e un eveniment", async () => {
    /* Fiecare comanda platita trece pe la paza rambursarilor la fiecare rulare de cron. Daca zero ar
       produce ceva, comerciantul ar primi o notificare la fiecare sfert de ora. */
    const { admin, scrieri } = bazaFalsa();
    assert.deepEqual(
      await baniiSAuIntors(admin, COMANDA, { intors: 0, incasat: 50401, moneda: "ron" }, "reconciliere"),
      { fel: "nimic" },
    );
    assert.equal(scrieri.length, 0, "o comanda nerambursata a produs scrieri");
  });
});

// ─── Si legaturile chiar exista ──────────────────────────────────────────────

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("Cine cheama regula", () => {
  const w = viu("src/app/api/stripe/connect/webhook/route.ts");
  const c = viu("src/app/api/cron/stripe-reconcile/route.ts");

  test("⚠⚠ webhook-ul Connect trateaza rambursarea SI contestatia", () => {
    assert.match(w, /event\.type === "charge\.refunded" \|\| event\.type === "charge\.dispute\.created"/,
      "evenimentele despre bani intorsi nu mai sunt tratate");
    assert.match(w, /baniiSAuIntors\(/, "webhook-ul si-a facut propria regula");
  });

  test("⚠⚠ si are dedupe de evenimente, altfel striga de doua ori pentru aceiasi bani", () => {
    assert.match(w, /evenimentNou\(admin, event\)/, "webhook-ul Connect a ramas fara dedupe");
    assert.ok(
      w.indexOf("evenimentNou(admin, event)") < w.indexOf('event.type === "charge.refunded"'),
      "dedupe-ul a ajuns dupa tratarea rambursarii",
    );
  });

  test("⚠⚠ un esec de scriere cere RELIVRARE, nu tacere", () => {
    /*
     * ⚠ SE PRINDE CHIAR RANDUL, NU „exista un 503 pe undeva prin ramura". Prima scriere cerea doar
     * `/status: 503/` in felia de la `charge.refunded` incolo, si mutantul care scotea 503-ul de pe
     * calea de esec a TRECUT, fiindca in aceeasi felie mai era unul (citirea platii contestate).
     * A doua oara azi cand o proba de-a mea masoara prezenta in loc de fapta.
     */
    assert.match(
      w,
      /if \(v\.fel === "esec"\) return NextResponse\.json\(\{ received: false, error: v\.mesaj \}, \{ status: 503 \}\);/,
      "un esec de scriere ar fi confirmat lui Stripe, deci nerepetat",
    );
  });

  test("⚠⚠ cronul INTREABA despre comenzile platite, nu doar despre cele neplatite", () => {
    /* Plasa care merge chiar daca in panoul Stripe nu e bifat niciun eveniment nou. */
    assert.match(c, /\.eq\("payment_status", "paid"\)/, "cronul nu mai pazeste rambursarile");
    assert.match(c, /baniiSAuIntors\(/, "cronul si-a facut propria regula");
    assert.match(c, /expand: \["payment_intent\.latest_charge"\]/, "s-ar face trei cereri in loc de una");
  });

  test("⚠⚠ si NICIUN `return` timpuriu nu mai face a treia trecere cod MORT", () => {
    /*
     * ═══ AM CAZUT CHIAR EU IN CAPCANA ASTA, AZI ═══
     *
     * Fisierul poarta de dinainte un comentariu despre un `return` care facea a DOUA trecere cod
     * mort. Am adaugat a treia trecere la sfarsit si am lasat un `return` pe cazul „nicio comanda
     * neplatita", adica exact cazul NORMAL. Paza rambursarilor n-ar fi rulat niciodata.
     *
     * Proba pinuieste faptul, nu forma: intre inceputul functiei si a treia trecere n-are voie sa
     * existe nicio iesire care sa nu fie o EROARE.
     */
    const corp = c.slice(c.indexOf("export async function GET"));
    const pana = corp.slice(0, corp.indexOf('eq("payment_status", "paid")'));
    const iesiri = pana.match(/return NextResponse\.json\([^;]*\);/g) ?? [];
    for (const i of iesiri) {
      assert.match(i, /status: (401|503)/, `iesire care nu e eroare inaintea pazei rambursarilor: ${i}`);
    }
  });

  test("⚠ si aduce configuratiile magazinelor care au DOAR comenzi platite", () => {
    /*
     * `cfgMap` se compune din magazinele cu comenzi NEPLATITE. Fara aducerea in plus, tocmai
     * magazinele fara probleme de incasare ar fi ramas nepazite.
     *
     * ⚠ Se prinde CULEGEREA si SCRIEREA in harta, nu numele variabilei: un mutant care pastra
     * numele dar golea lista a trecut de prima forma a probei.
     */
    assert.match(
      c,
      /const bizPlatite = \[\.\.\.new Set\(\(platite \?\? \[\]\)\.map\(\(o\) => o\.business_id\)\)\]\.filter\(\(b\) => !cfgMap\.has\(b\)\);/,
      "magazinele fara comenzi neplatite nu mai sunt culese",
    );
    assert.match(
      c,
      /for \(const r of inPlus \?\? \[\]\) cfgMap\.set\(r\.business_id, stripeAccountId\(r\.stripe_config\)\);/,
      "configuratiile aduse in plus nu mai ajung in harta",
    );
  });
});
