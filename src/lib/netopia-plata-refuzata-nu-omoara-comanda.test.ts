import { strict as assert } from "node:assert";
import { test, describe, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { resolveNetopiaStatus } from "./netopia";
import { signNetopiaIpn, verifyNetopiaIpn } from "./netopia-ipn";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * NETOPIA: UN CARD REFUZAT NU OMOARA COMANDA, SI SECRETUL NU POATE LIPSI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Netopia e procesatorul cu bani REALI: 40 de comenzi, 24 platite, ~1.913 lei, patru magazine,
 * ultima plata pe 14.09.2026. Tot ce se atinge aici are pret.
 *
 * ── 1. STATUSUL 12 ──
 *
 * Codul spunea `12 = cancelled` si anula comanda. Afirmatia venea din migrarea v1 to v2 si NU e
 * sustinuta de v2. Specificatia lor OpenAPI 3.0 (`secure.sandbox.netopia-payments.com/spec`,
 * citita pe 16.09.2026) o contrazice de DOUA ori, in doua scheme:
 *   * `NotifyRequest.payment.status` si `PaymentNotify.status`: „12 = invalid account";
 *   * `Payment.status` (raspunsul de pornire): „12 - rejected".
 *
 * ⚠⚠ Iar anularea nu era o eticheta gresita, era o vanzare pierduta: `/api/netopia/start` refuza sa
 * porneasca o plata pe o comanda cu `status === "cancelled"`. Deci cardul refuzat o data inchidea
 * comanda pentru totdeauna, si elibera stocul si cuponul.
 *
 * ⚠ Purtarea corecta era deja SCRISA in platforma, pentru aceeasi situatie: cronul
 * `discount-release` spune despre plata online neterminata „nu anuleaza si nu atinge in niciun fel
 * comanda". Abandonul pe pagina bancii si cardul refuzat trebuie tratate la fel.
 *
 * ── 2. SECRETUL DE SEMNARE ──
 *
 * `ipnSecret()` cadea pe `""`. `createHmac` nu se plange de o cheie goala: scoate un HMAC valid, pe
 * o cheie pe care o stie oricine. Cum id-ul comenzii e public (e in adresa de confirmare), oricine
 * putea calcula jetonul si trimite o notificare de „platit" pentru propria comanda.
 *
 * ⚠⚠ SI DE ASTA PROBA ISI PUNE SINGURA UN SECRET. Incarcatorul de probe nu aduce niciun `.env`,
 * deci pana azi si semnatorul, si verificatorul lucrau cu `""`: o proba care ar fi spus „jetonul
 * falsificat e respins" ar fi trecut VERDE fara sa apere nimic, fiindca si falsificatorul folosea
 * aceeasi cheie goala. Vezi memoria `probele-semneaza-cu-cheia-goala`.
 */

const SECRET_VECHI = process.env.NETOPIA_IPN_SECRET;
const SERVICE_VECHI = process.env.SUPABASE_SERVICE_ROLE_KEY;

afterEach(() => {
  if (SECRET_VECHI === undefined) delete process.env.NETOPIA_IPN_SECRET;
  else process.env.NETOPIA_IPN_SECRET = SECRET_VECHI;
  if (SERVICE_VECHI === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_VECHI;
});

/** Secret adevarat, pus de proba: fara el, tot ce urmeaza ar fi teatru. */
function cuSecret(valoare = "secret-de-proba-nu-e-in-productie") {
  process.env.NETOPIA_IPN_SECRET = valoare;
}

describe("Statusul 12: plata REFUZATA, nu anulare", () => {
  test("⚠⚠ nu mai anuleaza comanda", () => {
    const r = resolveNetopiaStatus(12);
    assert.equal(r.orderStatus, undefined, "un card refuzat inchide iar comanda pentru totdeauna");
    assert.equal(r.paymentStatus, undefined, "nu se atinge nici starea platii");
  });

  test("⚠ dar nici nu tace: se intoarce `refuzat`, ca ruta sa lase o urma", () => {
    assert.equal(resolveNetopiaStatus(12).refuzat, true);
  });

  test("⚠ platile reusite raman neatinse", () => {
    for (const s of [3, 5]) {
      assert.deepEqual(resolveNetopiaStatus(s), { orderStatus: "confirmed", paymentStatus: "paid" });
    }
  });

  test("⚠ rambursarea ramane rambursare", () => {
    assert.deepEqual(resolveNetopiaStatus(15), { paymentStatus: "refunded" });
  });

  test("✅ DOVEDIT pe sandbox: 12 vine de la un CVV gresit si de la un numar inexistent", () => {
    /*
     * Nu mai e o citire de specificatie. Cu cardurile de test din chiar specificatia lor, pe contul
     * de sandbox al magazinului `itp-blk`, `POST /payment/card/start` a raspuns pe 16.09.2026:
     *
     *   card valid           -> status 3,  „00 Approved"
     *   CVV gresit           -> status 12, „21 Invalid CVV"
     *   numar inexistent     -> status 12, „17 Invalid card number"
     *   card expirat         -> status 1,  „19 Expired card"
     *
     * ⚠⚠ Deci 12 e refuz de card, si nu e un cod rar: e chiar ce produce un CVV tastat gresit.
     * Pana la reparatie, cine gresea codul de pe card ramanea cu comanda ANULATA si nu o mai putea
     * plati niciodata.
     */
    assert.equal(resolveNetopiaStatus(12).refuzat, true);
    assert.equal(resolveNetopiaStatus(12).orderStatus, undefined);
    assert.deepEqual(resolveNetopiaStatus(3), { orderStatus: "confirmed", paymentStatus: "paid" });
  });

  test("⚠⚠ statusul 1 (card expirat), vazut pe sandbox, NU misca nimic", () => {
    /*
     * Cod nedocumentat nicaieri in specificatia lor, gasit doar probind. Nu se mapeaza: nu stim
     * daca `1` inseamna intotdeauna refuz sau e o stare intermediara (raspunsul purta si o pagina
     * de plata, deci cumparatorul poate relua acolo). Tacerea pe necunoscut ramane.
     */
    assert.deepEqual(resolveNetopiaStatus(1), {});
  });

  test("⚠⚠ si orice cod necunoscut NU misca nimic", () => {
    /* Tacerea pe necunoscut e purtarea corecta cand de partea cealalta sunt bani. */
    for (const s of [0, 1, 2, 4, 6, 7, 10, 13, 14, 16, 99, -1]) {
      assert.deepEqual(resolveNetopiaStatus(s), {}, `codul ${s} a capatat un inteles nemasurat`);
    }
  });
});

describe("Jetonul IPN: secretul nu poate lipsi", () => {
  test("⚠⚠ fara secret, semnarea ARUNCA, nu semneaza cu cheia goala", () => {
    delete process.env.NETOPIA_IPN_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.throws(() => signNetopiaIpn("comanda-1"), /NETOPIA_IPN_SECRET|SUPABASE_SERVICE_ROLE_KEY/);
  });

  test("⚠⚠ si verificarea la fel: nu accepta tacut un jeton pe cheie goala", () => {
    /*
     * Asta e proba care chiar apara: cu `""`, un atacator calculeaza acelasi HMAC ca noi. Aruncarea
     * iese `500`, Netopia repeta notificarea, deci plata nu se pierde, se inregistreaza dupa ce
     * variabila e pusa la loc.
     */
    cuSecret();
    const jetonValid = signNetopiaIpn("comanda-1");
    delete process.env.NETOPIA_IPN_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.throws(() => verifyNetopiaIpn("comanda-1", jetonValid), /NETOPIA_IPN_SECRET/);
  });

  test("cu secret, jetonul propriu trece", () => {
    cuSecret();
    assert.equal(verifyNetopiaIpn("comanda-1", signNetopiaIpn("comanda-1")), true);
  });

  test("⚠⚠ jetonul ALTEI comenzi nu trece", () => {
    /* Altfel, cine plateste o comanda de 1 leu ar confirma una de 1.000. */
    cuSecret();
    assert.equal(verifyNetopiaIpn("comanda-2", signNetopiaIpn("comanda-1")), false);
  });

  test("⚠⚠ jetonul semnat cu ALT secret nu trece", () => {
    /* Proba care cade daca cineva reintroduce caderea pe cheia goala. */
    cuSecret("secretul-atacatorului");
    const strain = signNetopiaIpn("comanda-1");
    cuSecret("secretul-nostru");
    assert.equal(verifyNetopiaIpn("comanda-1", strain), false);
  });

  test("⚠ jeton lipsa sau gol nu trece", () => {
    cuSecret();
    assert.equal(verifyNetopiaIpn("comanda-1", null), false);
    assert.equal(verifyNetopiaIpn("comanda-1", ""), false);
    assert.equal(verifyNetopiaIpn("", signNetopiaIpn("")), false, "fara id de comanda nu se verifica nimic");
  });

  test("⚠ si `SUPABASE_SERVICE_ROLE_KEY` ramane rezerva, ca pana acum", () => {
    /* Reparatia n-avea voie sa ceara o variabila noua in productie. */
    delete process.env.NETOPIA_IPN_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "cheia-de-serviciu";
    assert.equal(verifyNetopiaIpn("c", signNetopiaIpn("c")), true);
  });
});

// ─── Si ruta chiar se poarta asa ─────────────────────────────────────────────

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("Ruta de notificare", () => {
  const s = viu("src/app/api/netopia/notify/route.ts");

  test("⚠⚠ refuzul se scrie, si comanda NU se atinge", () => {
    assert.match(s, /if \(refuzat\) \{/, "ruta nu mai stie de refuz");
    const ramura = /if \(refuzat\) \{[\s\S]*?\n  \}/.exec(s)?.[0] ?? "";
    assert.match(ramura, /action: "netopia\/notify"/);
    assert.match(ramura, /severity: "warning"/, "un card refuzat nu e o defectiune, e o intamplare");
    assert.ok(!/aplica_tranzitia_comenzii/.test(ramura), "refuzul misca iar comanda");
  });

  test("⚠⚠ si raspunde `errorCode: 0`, ca Netopia sa nu repete la nesfarsit", () => {
    const ramura = /if \(refuzat\) \{[\s\S]*?\n  \}/.exec(s)?.[0] ?? "";
    assert.match(ramura, /errorCode: 0/, "notificarea ar fi repetata la infinit");
  });

  test("⚠ verificarea semnaturii ramane INAINTEA oricarei scrieri", () => {
    /* O notificare neautentificata n-are voie sa ajunga nici macar la citirea comenzii. */
    assert.ok(s.indexOf("verifyNetopiaIpn") < s.indexOf('from("orders")'), "semnatura se verifica prea tarziu");
  });

  test("⚠⚠ codurile NERECUNOSCUTE se strang din trafic", () => {
    /*
     * Harta creste din trafic, nu din presupuneri, ca la Woot si Cargus. Specificatia lor
     * documenteaza doar 3, 5 si 12; proba pe sandbox a scos si `1`. Cate altele mai vin, nu stim,
     * si pana acum nici nu s-ar fi aflat.
     */
    assert.match(s, /status Netopia NERECUNOSCUT/, "codurile necunoscute trec fara urma");
    assert.match(s, /severity: "info"/, "un cod nou nu e o alarma, e o masuratoare");
    assert.match(s, /codLor: payload\.payment\?\.code/, "nu se strange si motivul lor");
    /* ⚠ Si tot NU misca nimic: strangerea n-are voie sa devina o mapare pe furis. */
    const ramura = /\} else \{[\s\S]*?severity: "info",[\s\S]*?\n  \}/.exec(s)?.[0] ?? "";
    assert.ok(ramura, "ramura de cod necunoscut a disparut");
    assert.ok(!/aplica_tranzitia_comenzii|payment_status/.test(ramura), "codul necunoscut misca acum comanda");
  });

  test("⚠⚠ si garda de SUMA ramane pe loc", () => {
    /* Semnatura dovedeste ca notificarea e a comenzii, nu CAT s-a incasat. */
    assert.match(s, /incasat \+ 0\.01 < datorat/, "garda de suma a disparut");
    assert.match(s, /Amount mismatch/);
  });
});
