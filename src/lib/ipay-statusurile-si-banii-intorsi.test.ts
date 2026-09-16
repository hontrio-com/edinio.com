import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";
import { resolveIpayStatus, ipayGetOrderStatus, ipayMonedaInLitere, type IPayConfig } from "./ipay";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * BT iPAY: STATUSURILE SI BANII CARE SE INTORC          (17.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ EXPUNEREA MASURATA INAINTE DE ORICE: **ZERO**. Zero magazine cu `ipay_config`, zero comenzi cu
 * `payment_method = ipay`, zero randuri in registrul de operatii externe, zero in jurnal. ~1000 de
 * linii care n-au rulat niciodata pentru nimeni.
 *
 * Dar integrarea E OFERITA: e in catalogul de integrari, in `PAYMENT_PROCESSOR_TYPES`, are pagina de
 * configurare, iar `isConfigured` cere doar `enabled + username + password`. Orice comerciant o poate
 * porni maine. O integrare care n-a rulat niciodata e cea mai probabil stricata, si tocmai acum
 * nimeni n-ar observa.
 *
 * ⚠ TABELUL OFICIAL (doc 6.7, pagina 46):
 *   0 registered not paid · 1 pre-auth held · 2 deposited · 3 reversed
 *   4 fully refunded · 5 ACS initiated · 6 DECLINED · 7 partially refunded
 */

describe("Harta de statusuri iPay", () => {
  test("⚠⚠ un card REFUZAT nu anuleaza comanda", () => {
    /*
     * ═══ CAPCANA ARMATA, DESCARCATA INAINTE SA TRAGA ═══
     *
     * Aici scria `case 6: return { orderStatus: "cancelled" }`. E chiar defectul reparat la Netopia
     * cu o zi inainte: un card refuzat (blocat, fonduri insuficiente, CVV gresit) ar fi ANULAT
     * comanda, iar `/api/ipay/start` refuza comenzile anulate, deci cumparatorul nu mai putea
     * reincerca NICIODATA.
     *
     * ⚠ Nu a pagubit pe nimeni, si nu fiindca era inofensiv: fiindca niciun apelant nu citea acel
     * camp. Masurat, nu presupus. Era o capcana armata pentru primul care ar fi legat-o.
     */
    const r = resolveIpayStatus(6);
    assert.equal(r.refuzat, true, "refuzul nu mai e numit");
    assert.equal(r.paid, false);
    assert.ok(!("orderStatus" in r), "refuzul misca iar comanda");
  });

  test("⚠⚠ banii DOAR BLOCATI nu sunt bani incasati", () => {
    /*
     * Statusul 1 e pre-autorizare (2-phase): banii sunt retinuti pe card, nu incasati; incasarea cere
     * `deposit.do`. Aici scria `paid: true` + `confirmed`, cu nota „treated as success if ever enabled":
     * adica facturarea automata s-ar fi declansat pe bani care nu sunt ai comerciantului. Chiar
     * documentatia lor cere reversare in 24 de ore daca nu onorezi comanda.
     */
    const r = resolveIpayStatus(1);
    assert.equal(r.paid, false, "o pre-autorizare e luata drept incasare");
    assert.equal(r.doiPasi, "blocat");
  });

  test("⚠⚠ rambursarea PARTIALA se deosebeste de cea integrala", () => {
    /*
     * Baza ingaduie doar `unpaid`/`paid`/`refunded` (`orders_payment_status_check`). Scris „rambursat"
     * la un partial, randul ar spune ca s-au intors TOTI banii si ar scoate comanda din semnalul de
     * marfa plecata fara bani. Aceeasi hotarare ca la Stripe.
     */
    assert.equal(resolveIpayStatus(4).rambursat, "integral");
    assert.equal(resolveIpayStatus(7).rambursat, "partial");
    assert.notEqual(resolveIpayStatus(7).rambursat, "integral");
  });

  test("⚠ o singura valoare inseamna «banii au intrat», si aia e 2", () => {
    /* Plasa care apara chiar reparatia: fara ea, un viitor „hai sa numaram si 1" ar trece verde. */
    const platite: number[] = [];
    for (let s = -2; s <= 20; s++) if (resolveIpayStatus(s).paid) platite.push(s);
    assert.deepEqual(platite, [2]);
  });

  test("⚠ starile de asteptare nu sunt deznodaminte", () => {
    for (const s of [0, 5]) {
      assert.equal(resolveIpayStatus(s).final, false, `codul ${s}`);
      assert.equal(resolveIpayStatus(s).paid, false);
    }
    assert.equal(resolveIpayStatus(1).final, false, "o pre-autorizare inca se poate incasa sau anula");
  });

  test("⚠ si un cod necunoscut NU misca nimic", () => {
    for (const s of [8, 9, 99, -1, undefined]) {
      assert.deepEqual(resolveIpayStatus(s), { final: false, paid: false }, `codul ${s}`);
    }
  });
});

describe("Cat s-a intors, citit din raspunsul LOR", () => {
  const FETCH_VECHI = globalThis.fetch;
  const CFG: IPayConfig = { enabled: true, username: "u", password: "p", sandbox: true } as IPayConfig;

  function raspunde(corp: unknown) {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(corp), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  }
  const cheama = () => ipayGetOrderStatus(CFG, { orderId: "x" });

  test("✅ forma din CHIAR exemplul lor (doc, pagina 50)", async () => {
    /*
     * ⚠ Si o capcana din acelasi exemplu: dupa o rambursare TOTALA, `depositedAmount` ajunge ZERO si
     * numai `approvedAmount` ramane. De aceea suma incasata nu se citeste din `depositedAmount`.
     */
    raspunde({
      errorCode: "0", orderStatus: 4, amount: 2600, currency: "946",
      paymentAmountInfo: { paymentState: "REFUNDED", approvedAmount: 2600, depositedAmount: 0, refundedAmount: 2600 },
      refunds: [{ referenceNumber: "230177409921", actionCode: "0", amount: 2600, date: "20260218191929" }],
      chargeback: false,
    });
    const s = await cheama();
    assert.equal(s.rambursat, 2600);
    assert.equal(s.amount, 2600, "suma comenzii nu se mai citeste");
    assert.equal(s.contestat, false);
    globalThis.fetch = FETCH_VECHI;
  });

  test("⚠ lista `refunds[]` e REZERVA cand lipseste `refundedAmount`", async () => {
    /* Fara rezerva, o rambursare adevarata ar trece drept „zero intors", adica tocmai tacerea de
       care ne ferim. */
    raspunde({ errorCode: "0", orderStatus: 7, amount: 5000, refunds: [{ amount: 1500 }, { amount: 500 }] });
    assert.equal((await cheama()).rambursat, 2000);
    globalThis.fetch = FETCH_VECHI;
  });

  test("⚠⚠ „nu stim” NU e „zero”", async () => {
    /* `Number(undefined)` e `NaN`, dar un `0` scris in loc de „necunoscut" ar spune ca s-a verificat
       si nu s-a intors nimic. Vezi memoria `zero-randuri-nu-e-succes`. */
    raspunde({ errorCode: "0", orderStatus: 2, amount: 5000 });
    assert.equal((await cheama()).rambursat, undefined);
    globalThis.fetch = FETCH_VECHI;
  });

  test("⚠⚠ steagul de CONTESTATIE se citeste", async () => {
    /* iPay il da direct, fara webhook: un lucru pe care Stripe nu-l ofera dintr-o singura citire. */
    raspunde({ errorCode: "0", orderStatus: 2, amount: 5000, chargeback: true });
    assert.equal((await cheama()).contestat, true);
    globalThis.fetch = FETCH_VECHI;
  });

  test("⚠ moneda lor e NUMERICA si se traduce pentru oameni", () => {
    assert.equal(ipayMonedaInLitere("946"), "RON");
    assert.equal(ipayMonedaInLitere("978"), "EUR");
    assert.equal(ipayMonedaInLitere(undefined), "RON");
  });
});

// ─── Si cronul chiar intreaba ────────────────────────────────────────────────

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("Cronul de reconciliere iPay", () => {
  const c = viu("src/app/api/cron/ipay-reconcile/route.ts");

  test("⚠⚠ intreaba si despre comenzile PLATITE, fiindca e SINGURA cale", () => {
    /*
     * iPay nu are webhook server-la-server, iar dupa o rambursare cumparatorul nu se mai intoarce in
     * magazin. Daca nu intreaba cronul, nu aflam niciodata.
     */
    assert.match(c, /\.eq\("payment_status", "paid"\)/, "cronul nu pazeste rambursarile");
    assert.match(c, /baniiSAuIntors\(/, "cronul si-a facut propria regula");
    /*
     * ⚠ SE PRINDE GARDA, NU PREZENTA NUMELUI. Prima forma cerea doar ca sirul `status.contestat` sa
     * apara undeva, iar mutantul care il scotea DIN GARDA a trecut: numele ramanea mai jos, in apelul
     * catre regula. A treia oara azi cand o proba de-a mea masoara prezenta in loc de fapta.
     */
    assert.match(
      c,
      /if \(!resolved\.rambursat && !status\.contestat\) continue;/,
      "o contestatie fara rambursare nu mai e raportata",
    );
  });

  test("⚠⚠ si NICIUN `return` timpuriu nu face a doua trecere cod MORT", () => {
    /*
     * Aici a fost `if (!orders || orders.length === 0) return ...`, adica iesirea pe cazul NORMAL.
     * Aceeasi capcana in care am cazut cu o ora inainte la `stripe-reconcile`.
     *
     * Proba pinuieste FAPTUL: intre inceputul functiei si paza rambursarilor n-are voie sa existe
     * nicio iesire care sa nu fie o eroare.
     */
    const corp = c.slice(c.indexOf("export async function GET"));
    const pana = corp.slice(0, corp.indexOf('eq("payment_status", "paid")'));
    for (const i of pana.match(/return NextResponse\.json\([^;]*\);/g) ?? []) {
      assert.match(i, /status: (401|503)/, `iesire care nu e eroare inaintea pazei rambursarilor: ${i}`);
    }
  });

  test("⚠ fereastra tine pana la termenul CONTESTATIILOR, nu pana unde ne convine", () => {
    assert.match(c, /const ZILE_RAMBURSARE = 120;/, "fereastra a fost scurtata");
    assert.match(c, /const MAX_PLATITE = 120;/);
  });

  test("⚠⚠ o interogare picata NU lamureste nimic", () => {
    /*
     * ⚠ SE ANCOREAZA PE CATCH-UL POTRIVIT, NU PE PRIMUL DIN FISIER. Prima scriere pornea regexul de
     * la primul `} catch (e) {` si inghitea tot pana la al doilea, inclusiv apelul `baniiSAuIntors`
     * din trecerea buna, deci cadea pe cod CORECT. Vezi memoria
     * `slice-ul-de-corp-imprumuta-de-la-vecin`.
     */
    const i = c.indexOf("paza rambursarii a esuat");
    assert.ok(i > 0, "paza rambursarii nu mai are catch propriu");
    const inceput = c.lastIndexOf("} catch (e) {", i);
    const ramura = c.slice(inceput, c.indexOf("}", i) + 1);
    assert.ok(!/baniiSAuIntors/.test(ramura), "o pana de retea misca acum comanda");
    assert.ok(!/intoarse\+\+/.test(ramura), "o pana de retea se numara drept rambursare");
  });

  test("⚠ si aduce configuratiile magazinelor care au DOAR comenzi platite", () => {
    assert.match(
      c,
      /const bizPlatite = \[\.\.\.new Set\(\(platite \?\? \[\]\)\.map\(\(o\) => o\.business_id\)\)\]\.filter\(\(b\) => !cfgMap\.has\(b\)\);/,
      "magazinele fara comenzi neplatite raman nepazite",
    );
  });
});

describe("Rambursarea pornita din panou", () => {
  const a = viu("src/lib/actions/ipay.actions.ts");
  const f = /export async function rambourseazaPrinIpay[\s\S]*$/.exec(a)?.[0] ?? "";

  test("⚠⚠ unealta nu mai e SCRISA SI NECHEMATA", () => {
    /*
     * `ipayRefund` statea in `lib/ipay.ts` de multa vreme fara niciun apelant: cod mort intr-o
     * integrare care n-a rulat niciodata, adica o unealta despre care nimeni n-ar fi aflat ca e
     * stricata. Vezi memoria `unealta-scrisa-anume-si-nechemata`.
     */
    assert.ok(f, "actiunea de rambursare a disparut");
    assert.match(f, /ipayRefund\(/, "rambursarea nu mai cheama clientul");
  });

  test("⚠⚠ NU e legata de selectorul de status", () => {
    /* In panou „rambursat" e o eticheta pusa dupa o rambursare manuala. Legata de ea, apasarea
       obisnuita ar fi trimis banii a doua oara. */
    assert.ok(
      !/rambourseazaPrinIpay|ipayRefund/.test(viu("src/lib/actions/order.actions.ts")),
      "schimbarea de status a ajuns sa trimita bani inapoi",
    );
  });

  test("⚠⚠ apelul care muta bani trece prin REGISTRU", () => {
    assert.match(f, /cuRegistru\(/, "rambursarea nu mai e aparata de registru");
    assert.match(f, /fel: "rambursare"/);
    assert.match(f, /furnizor: "ipay"/);
    assert.match(f, /verdictFurnizor/, "orice esec ar debloca a doua trimitere de bani");
    assert.ok(f.indexOf("cuRegistru(") < f.indexOf("ipayRefund("), "apelul a iesit de sub registru");
  });

  test("⚠⚠ se cer toate cele trei conditii INAINTE de a misca bani", () => {
    assert.match(f, /if \(order\.payment_method !== "ipay"\) \{/);
    assert.match(f, /if \(order\.payment_status !== "paid"\) \{/);
    assert.match(f, /if \(!ipayOrderId\) \{/, "s-ar rambursa fara sa stim CE tranzactie");
    for (const g of ['if (order.payment_method !== "ipay") {', 'if (order.payment_status !== "paid") {', "if (!ipayOrderId) {"]) {
      assert.ok(f.indexOf(g) > -1 && f.indexOf(g) < f.indexOf("cuRegistru("), `garda «${g}» a ajuns dupa apel`);
    }
  });

  test("⚠⚠ doar `errorCode 0` e incuviintare, tacerea NU", () => {
    /* Citit pe dos, un corp fara cod ar fi raportat succes si comanda ar fi fost marcata rambursata
       fara ca banii sa plece. */
    assert.match(f, /if \(!rod\.ok\) \{/, "refuzul lor nu mai opreste nimic");
    assert.match(f, /eroareRefuz\(/);
  });

  test("⚠ si proprietatea magazinului se dovedeste cu clientul UTILIZATORULUI", () => {
    assert.match(f, /\.eq\("user_id", user\.id\)/, "oricine ar putea rambursa comanda altuia");
    assert.ok(f.indexOf('eq("user_id", user.id)') < f.indexOf("cuRegistru("), "verificarea a ajuns dupa apel");
  });

  test("⚠⚠ statusul NU se scrie de aici: adevarul despre bani il da interogarea lor", () => {
    /*
     * La Netopia se scrie, fiindca ei incuviinteaza sincron. Aici `refund.do` spune doar ca a fost
     * primit. Un singur drum catre „rambursat": cronul, prin aceeasi regula ca o rambursare facuta
     * din consola lor.
     */
    assert.ok(!/aplica_tranzitia_comenzii/.test(f), "actiunea scrie singura statusul, pe langa cron");
    assert.ok(!/payment_status: "refunded"/.test(f));
  });
});

describe("Regula despre bani e ACEEASI la toti procesatorii", () => {
  test("⚠⚠ si Stripe, si iPay cheama acelasi modul", () => {
    /*
     * Plasa care tine o singura copie. Regula „ce inseamna ca banii s-au intors" a fost scrisa
     * pentru Stripe pe 16.09; cand a venit iPay, s-a MUTAT in `lib/plati/`, nu s-a copiat. Doua
     * copii ale unei reguli despre bani se departeaza una de alta, si niciodata amandoua deodata.
     */
    for (const f of [
      "src/app/api/cron/stripe-reconcile/route.ts",
      "src/app/api/stripe/connect/webhook/route.ts",
      "src/app/api/cron/ipay-reconcile/route.ts",
    ]) {
      assert.match(viu(f), /from "@\/lib\/plati\/banii-s-au-intors"/, `${f} nu foloseste regula comuna`);
    }
  });
});
