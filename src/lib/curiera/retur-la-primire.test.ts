import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { coletCuVerificare, parametriExpediereCuriera, serviciiExtraTrimise, SERVICIU_DESCHIDERE_COLET } from "./expediere";
import { asteaptaPrimireaReturului, elibereazaStoculLaRetur, statusDupaRetur } from "./statusuri";
import { semnalareCuriera } from "./urmarire";
import { rezervareaAreStoc, stocRezervat } from "@/lib/orders/stoc-rezervat";

/*
 * Returul Curiera si stocul (cerut pe 23.11.2026): „intrarea in stoc sa se faca dupa ce coletul a
 * fost scanat ca livrat retur”. Curiera nu da scanarea aceea (starea „returnat” vine la PLECAREA
 * coletului inapoi si e ultima), deci momentul il spune omul: magazinul poate alege ca stocul sa
 * revina abia la „Retur primit”. Implicitul ramane cel din 19.10.2026.
 */

const citeste = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

describe("Cand revine stocul unui retur", () => {
  test("⚠ implicit, ca pana acum: la anuntul returului", () => {
    for (const cfg of [null, undefined, {}, { stoc_la_retur: "automat" }, { stoc_la_retur: "altceva" }, { stoc_la_retur: true }]) {
      assert.equal(elibereazaStoculLaRetur(cfg as never), true, JSON.stringify(cfg));
    }
    assert.equal(elibereazaStoculLaRetur({ stoc_la_retur: "la_primire" }), false);
  });

  test("regula trecerii pe „Rambursat” nu se schimba: ramburs neincasat, comanda inca nelivrata", () => {
    const c = { status: "shipped", metodaPlata: "cash_on_delivery", starePlata: "unpaid", sursa: null };
    assert.equal(statusDupaRetur(c), "refunded");
    assert.equal(statusDupaRetur({ ...c, starePlata: "paid" }), null);
  });

  test("comanda care asteapta „Retur primit”: rambursata, returnata, cu stocul inca la ea", () => {
    const o = {
      status: "refunded", curiera_status_code: "returnat", stoc_eliberat_la: null,
      stoc_rezervat: { produse: [{ product_id: "p1", quantity: 2 }], variante: [] },
    };
    assert.equal(asteaptaPrimireaReturului(o), true);
    assert.equal(
      asteaptaPrimireaReturului({ ...o, stoc_rezervat: { produse: [], variante: [{ product_id: "p1", variant_title: "M", quantity: 1 }] } }),
      true, "si cand s-a consumat numai o varianta",
    );
    /* ⚠ Rezervarea goala: niciun produs cu stoc urmarit, deci nimic de pus inapoi si nimic de cerut. */
    assert.equal(asteaptaPrimireaReturului({ ...o, stoc_rezervat: { produse: [], variante: [] } }), false);
    assert.equal(asteaptaPrimireaReturului({ ...o, stoc_rezervat: {} }), false);
    assert.equal(asteaptaPrimireaReturului({ ...o, curiera_status_code: "returnat|IND" }), true, "motivul lor nu schimba starea");
    assert.equal(asteaptaPrimireaReturului({ ...o, stoc_eliberat_la: "2026-11-23T10:00:00Z" }), false, "stocul e deja la loc");
    assert.equal(asteaptaPrimireaReturului({ ...o, stoc_rezervat: null }), false, "comanda de dinaintea stocului rezervat");
    assert.equal(asteaptaPrimireaReturului({ ...o, status: "shipped" }), false, "netrecuta pe Rambursat: decizia e a omului");
    assert.equal(asteaptaPrimireaReturului({ ...o, status: "cancelled" }), false);
    assert.equal(asteaptaPrimireaReturului({ ...o, curiera_status_code: "livrat" }), false);
    assert.equal(asteaptaPrimireaReturului({ ...o, curiera_status_code: null }), false, "rambursata de mana, fara retur");
  });

  test("notificarea spune ce s-a facut cu stocul, in fiecare dintre cele trei cazuri", () => {
    const p = { orderNumber: "#0123", awb: "711000001", cheie: "returnat", eticheta: "Colet returnat expeditorului", evenimente: null };
    const laPrimire = semnalareCuriera({ ...p, rambursataAutomat: true, stocLaPrimire: true });
    assert.match(laPrimire.mesaj, /am trecut comanda pe Rambursat\. Stocul ei revine cand confirmi ca ai primit coletul/);
    assert.match(laPrimire.mesaj, /„Retur primit”/);
    assert.doesNotMatch(laPrimire.mesaj, /am eliberat stocul/);

    const automat = semnalareCuriera({ ...p, rambursataAutomat: true, stocLaPrimire: false });
    assert.match(automat.mesaj, /am trecut comanda pe Rambursat si am eliberat stocul ei/);

    /* Comanda nemutata (plata online): optiunea de stoc nu are ce spune. */
    const nemutata = semnalareCuriera({ ...p, rambursataAutomat: false, stocLaPrimire: true });
    assert.match(nemutata.mesaj, /Comanda nu s-a mutat singura/);
    assert.doesNotMatch(nemutata.mesaj, /Retur primit/);
  });

  test("cronul asculta de optiune la trecerea pe „Rambursat” si o spune in notificare", () => {
    const cron = citeste("src/app/api/cron/curiera-tracking/route.ts");
    assert.match(cron, /\.\.\.\(eRetur \? \{ elibereazaStoc: elibereazaStoculLaRetur\(cfg\) \} : \{\}\),/);
    assert.doesNotMatch(cron, /elibereazaStoc: true/);
    /* ⚠ Notificarea promite butonul numai cand el chiar apare: optiunea SI o rezervare cu ceva in ea. */
    assert.match(cron, /stocLaPrimire: !elibereazaStoculLaRetur\(cfg\) && rezervareaAreStoc\(o\.stoc_rezervat\),/);
    assert.match(cron, /\.select\("id, business_id, status, [^"]*\bstoc_rezervat"\)/, "fara coloana citita, conditia ar fi mereu falsa");
  });

  test("⚠ „Retur primit” elibereaza numai stocul comenzii omului, o singura data", () => {
    const s = citeste("src/lib/actions/retur-primit.actions.ts");
    assert.match(s, /^"use server";/);
    assert.equal((s.match(/^export /gm) ?? []).length, 1);
    /* Comanda se citeste cu clientul omului (RLS), nu cu cheia de serviciu. */
    assert.match(s, /await supabase\s+\.from\("orders"\)\s+\.select\("id, business_id, order_number, status, curiera_status_code, stoc_rezervat, stoc_eliberat_la"\)\s+\.eq\("id", orderId\)/);
    assert.match(s, /if \(order\.stoc_eliberat_la\) return \{ error:/);
    assert.match(s, /if \(!asteaptaPrimireaReturului\(order\)\) \{/);
    assert.match(s, /\.rpc\("elibereaza_stoc_comanda", \{ p_order_id: order\.id \}\)/);
    /* Statusul comenzii nu se atinge de aici. */
    assert.doesNotMatch(s, /aplica_tranzitia_comenzii|\.update\(/);
    /* Functia din baza se apara singura de a doua apasare. */
    const baza = citeste("migrations/000-schema-baseline.sql");
    const i = baza.indexOf("CREATE OR REPLACE FUNCTION public.elibereaza_stoc_comanda(");
    assert.match(baza.slice(i, i + 900), /and stoc_eliberat_la is null/);
  });

  test("optiunea e in pagina integrarii, iar butonul pe pagina comenzii", () => {
    const config = citeste("src/components/dashboard/CurieraConfigClient.tsx");
    assert.match(config, /stoc_la_retur: stocLaPrimire \? "la_primire" : "automat",/);
    assert.match(config, /useState\(initialConfig\?\.stoc_la_retur === "la_primire"\)/);
    assert.match(config, /asigurare, marime, continut, stocLaPrimire,/, "bara de salvare vede schimbarea");
    assert.match(config, /setStocLaPrimire\(reper\.stocLaPrimire\);/, "„Renunta” o pune la loc");
    assert.match(citeste("src/components/dashboard/OrderDetailClient.tsx"), /<ReturDePrimit order=\{order\} \/>/);
    const buton = citeste("src/components/dashboard/ReturDePrimit.tsx");
    assert.match(buton, /if \(!asteaptaPrimireaReturului\(order\)\) return null;/);
    assert.match(buton, /r = await confirmaReturulPrimit\(order\.id\);/);
  });
});

describe("Rezervarea are ceva de dat inapoi?", () => {
  test("forma scrisa la plasare, plina sau goala, si formele stricate", () => {
    assert.equal(rezervareaAreStoc(stocRezervat([{ product_id: "p1", quantity: 1 }])), true);
    assert.equal(rezervareaAreStoc(stocRezervat([], [{ product_id: "p1", variant_title: "M", quantity: 1 }])), true);
    assert.equal(rezervareaAreStoc(stocRezervat([])), false);
    /* O linie fara varianta nu intra la variante, deci rezervarea ramane goala. */
    assert.equal(rezervareaAreStoc(stocRezervat([], [{ product_id: "p1", variant_title: null, quantity: 1 }])), false);
    for (const stricat of [null, undefined, "text", 5, [], [{ product_id: "p1" }], { produse: "x" }, { produse: null, variante: null }]) {
      assert.equal(rezervareaAreStoc(stricat), false, JSON.stringify(stricat));
    }
  });
});

describe("Serviciile extra tinute pe comanda („Colet cu verificare”)", () => {
  test("se citesc din parametrii TRIMISI, nu din ce a bifat fereastra", () => {
    assert.deepEqual(serviciiExtraTrimise({ service_443: "true", service_616: "true", content: "Produse", service_x: "true" }), ["443", "616"]);
    assert.deepEqual(serviciiExtraTrimise({ content: "Produse" }), []);
    /* Cap la cap cu constructorul de parametri: un id care nu e numar nu pleaca, deci nici nu se tine. */
    const sursa = citeste("src/lib/curiera/expediere.ts");
    assert.match(sursa, /if \(\/\^\\d\+\$\/\.test\(curat\)\) p\[`service_\$\{curat\}`\] = "true";/);
    assert.equal(typeof parametriExpediereCuriera, "function");
  });

  test("Da, Nu, sau necunoscut", () => {
    assert.equal(SERVICIU_DESCHIDERE_COLET, "443");
    assert.equal(coletCuVerificare({ curiera_awb_number: "711000001", curiera_servicii_extra: ["443"] }), true);
    assert.equal(coletCuVerificare({ curiera_awb_number: "711000001", curiera_servicii_extra: ["616", 443] }), true, "si ca numar");
    assert.equal(coletCuVerificare({ curiera_awb_number: "711000001", curiera_servicii_extra: ["616"] }), false);
    assert.equal(coletCuVerificare({ curiera_awb_number: "711000001", curiera_servicii_extra: [] }), false);
    /* ⚠ Necunoscut nu e „Nu”: AWB emis inainte de coloana, sau comanda fara AWB Curiera. */
    assert.equal(coletCuVerificare({ curiera_awb_number: "711000001", curiera_servicii_extra: null }), null);
    assert.equal(coletCuVerificare({ curiera_awb_number: "711000001" }), null);
    assert.equal(coletCuVerificare({ curiera_awb_number: null, curiera_servicii_extra: ["443"] }), null);
    assert.equal(coletCuVerificare({ dpd_awb_number: "80000000001" }), null);
  });
});
