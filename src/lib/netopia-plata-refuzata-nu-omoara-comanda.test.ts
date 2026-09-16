import { strict as assert } from "node:assert";
import { test, describe, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { resolveNetopiaStatus, rambourseazaNetopia, stareaPlatiiNetopia } from "./netopia";
import { signNetopiaIpn, verifyNetopiaIpn } from "./netopia-ipn";
import { verdictFurnizor } from "./operatii/eroare-furnizor";

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

  test("⚠⚠ RAMBURSAREA E 8, si asta e MASURAT, nu citit", () => {
    /*
     * `POST /operation/credit` pe sandbox-ul magazinului `itp-blk`, cu `ntpID` 3022507 (o plata de
     * 1 leu dusa pana la capat prin pagina lor gazduita), a raspuns pe 16.09.2026 cu
     * `payment.status: 8`, `error.code: "00"`, `error.message: "[TEST P] Approved"`. IPN-ul sosit
     * imediat dupa, la `/api/netopia/notify`, purta tot `status: 8`.
     */
    assert.deepEqual(resolveNetopiaStatus(8), { paymentStatus: "refunded" });
  });

  test("⚠⚠ iar 15 NU e rambursare: e 3-D Secure, si maparea veche amutea plasa de bani", () => {
    /*
     * ═══ DE CE E O PROBA, SI NU O SIMPLA CORECTIE ═══
     *
     * Aici scria `15 -> refunded`, cu nota mea ca „15 nu apare in specificatia v2, e mostenit din
     * v1, si maparea e in directia sigura". Amandoua erau gresite:
     *
     *   * APARE. Schema `Payment` din specul lor da lista intreaga: 3 paid, 5 confirmed,
     *     12 rejected, 15 **3-D Secure authentication required**. Citisem doar schema
     *     `PaymentNotify`, care enumera trei coduri, si am tras concluzia ca al patrulea nu exista.
     *   * NU E IN DIRECTIA SIGURA. `refunded` face parte din `BANII_S_AU_INTORS`
     *     (`marfa-a-plecat-fara-bani.ts`), deci o comanda etichetata gresit „rambursata" e SCOASA
     *     din semnalul de marfa plecata fara bani. Maparea nu doar mintea: amutea chiar plasa
     *     intinsa in aceeasi zi pentru cazul in care banii nu intra.
     *
     * Proba pune AMANDOUA jumatatile, ca o intoarcere la vechi sa nu poata trece nici pe furis.
     */
    assert.notEqual(resolveNetopiaStatus(15).paymentStatus, "refunded");
    assert.deepEqual(resolveNetopiaStatus(15), { intermediar: true });
  });

  test("⚠ starile intermediare se recunosc PE NUME, ca jurnalul sa nu minta", () => {
    /*
     * 1 si 15 nu misca nimic, exact ca un cod necunoscut. Deosebirea e ca pe astea le STIM, iar
     * ruta trebuie sa le spuna asa: un jurnal care zice „NERECUNOSCUT" despre ceva documentat
     * trimite pe cine il citeste sa „repare" o harta care e deja corecta. Vezi memoria
     * `comentariul-fals-e-o-invitatie`.
     */
    for (const s of [1, 15]) {
      assert.deepEqual(resolveNetopiaStatus(s), { intermediar: true }, `codul ${s}`);
      assert.equal(resolveNetopiaStatus(s).orderStatus, undefined);
      assert.equal(resolveNetopiaStatus(s).paymentStatus, undefined);
    }
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

  test("⚠⚠ statusul 1, vazut de DOUA ori pe sandbox, NU misca nimic", () => {
    /*
     * Vazut intai la cardul expirat (`19 Expired card`), apoi la o pornire FARA niciun card
     * (`instrument: {}`), care a raspuns tot `1` si tot cu o pagina de plata. Doua intrari foarte
     * diferite, acelasi cod, amandoua cu pagina: e o stare de asteptare, nu un deznodamant.
     */
    assert.deepEqual(resolveNetopiaStatus(1), { intermediar: true });
  });

  test("⚠⚠ si orice cod necunoscut NU misca nimic", () => {
    /* Tacerea pe necunoscut e purtarea corecta cand de partea cealalta sunt bani. */
    for (const s of [0, 2, 4, 6, 7, 10, 13, 14, 16, 99, -1]) {
      assert.deepEqual(resolveNetopiaStatus(s), {}, `codul ${s} a capatat un inteles nemasurat`);
    }
  });

  test("⚠⚠ UN SINGUR cod muta banii in „rambursat”, si acela e 8", () => {
    /*
     * Plasa care apara chiar reparatia de azi. Fara ea, un viitor „hai sa recunoastem si 15, ca
     * doar semana a rambursare" ar trece verde.
     */
    const rambursate: number[] = [];
    for (let s = -5; s <= 40; s++) {
      if (resolveNetopiaStatus(s).paymentStatus === "refunded") rambursate.push(s);
    }
    assert.deepEqual(rambursate, [8]);
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

describe("Ruta de notificare: ce ii ramane ei, adica HTTP-ul", () => {
  const s = viu("src/app/api/netopia/notify/route.ts");

  test("⚠ verificarea semnaturii ramane INAINTEA oricarei scrieri", () => {
    /* O notificare neautentificata n-are voie sa ajunga nici macar la citirea comenzii. */
    assert.ok(s.indexOf("verifyNetopiaIpn") < s.indexOf('from("orders")'), "semnatura se verifica prea tarziu");
    assert.ok(
      s.indexOf("verifyNetopiaIpn") < s.indexOf("aplicaStatusulNetopia"),
      "se lucreaza pe comanda inainte de a sti cine cheama",
    );
  });

  test("⚠⚠ un ESEC cere REPETAREA, o plata pierduta e mai rea decat o notificare repetata", () => {
    const ramura = /if \(verdict\.fel === "esec"\) \{[\s\S]*?\n  \}/.exec(s)?.[0] ?? "";
    assert.ok(ramura, "ruta nu mai deosebeste esecul");
    assert.match(ramura, /errorCode: 1/, "un esec ar fi confirmat, deci nerepetat");
  });

  test("⚠⚠ dar refuzul si codul necunoscut raspund `errorCode: 0`", () => {
    /*
     * Am primit si am inteles notificarea, deci nu e nimic de repetat. Altfel Netopia ar relua la
     * nesfarsit pentru fiecare card refuzat.
     */
    const final = s.slice(s.lastIndexOf("errorCode: 0"));
    assert.match(final, /errorCode: 0, errorMessage: "OK"/);
    /* ⚠ Si iesirea de succes vine DUPA ramura de esec, nu inaintea ei. */
    assert.ok(
      s.indexOf('if (verdict.fel === "esec")') < s.lastIndexOf("errorCode: 0"),
      "se raspunde succes inainte de a verifica esecul",
    );
  });

  test("⚠⚠ REGULA DESPRE BANI NU MAI E IN RUTA, si nici nu se intoarce", () => {
    /*
     * Plasa care tine o singura copie. De pe 16.09 exista doua drumuri catre aceeasi regula (IPN-ul
     * lor si cronul de reconciliere), iar o a doua copie s-ar departa de prima si niciodata
     * amandoua deodata. Vezi memoria `acelasi-lucru-in-doua-copii`.
     */
    assert.match(s, /aplicaStatusulNetopia\(/, "ruta nu mai cheama regula comuna");
    for (const copiat of [
      "aplica_tranzitia_comenzii",
      "finalizeazaPlataComenzii",
      "incasat + 0.01 < datorat",
      "NERECUNOSCUT",
      "resolveNetopiaStatus",
    ]) {
      assert.ok(!s.includes(copiat), `«${copiat}» a fost copiat inapoi in ruta`);
    }
  });
});

describe("Regula despre bani, in singurul loc unde sta", () => {
  const m = viu("src/lib/netopia-aplica-statusul.ts");

  test("⚠⚠ refuzul se scrie, si comanda NU se atinge", () => {
    assert.match(m, /if \(refuzat\) \{/, "nu se mai stie de refuz");
    const ramura = /if \(refuzat\) \{[\s\S]*?\n  \}/.exec(m)?.[0] ?? "";
    assert.match(ramura, /severity: "warning"/, "un card refuzat nu e o defectiune, e o intamplare");
    assert.ok(!/aplica_tranzitia_comenzii/.test(ramura), "refuzul misca iar comanda");
    assert.match(ramura, /return \{ fel: "refuzata" \}/);
  });

  test("⚠⚠ garda de SUMA ramane pe loc", () => {
    /* Semnatura dovedeste ca notificarea e a comenzii, nu CAT s-a incasat. */
    assert.match(m, /incasat \+ 0\.01 < datorat/, "garda de suma a disparut");
    assert.match(m, /Amount mismatch/);
    /* ⚠ Si e INAINTEA oricarei scrieri: altfel comanda s-ar misca si abia apoi s-ar afla. */
    assert.ok(
      m.indexOf("incasat + 0.01 < datorat") < m.indexOf("aplica_tranzitia_comenzii"),
      "suma se verifica dupa ce comanda s-a miscat",
    );
  });

  test("⚠⚠ codurile NERECUNOSCUTE se strang din trafic", () => {
    /*
     * Harta creste din trafic, nu din presupuneri, ca la Woot si Cargus. Si a lucrat: codul 8
     * (rambursarea) a fost prins de randul asta la mai putin de o ora dupa ce a fost pus.
     */
    assert.match(m, /status Netopia NERECUNOSCUT/, "codurile necunoscute trec fara urma");
    assert.match(m, /codLor: spuse\.codLor/, "nu se strange si motivul lor");
    const ramura = m.slice(m.indexOf("status Netopia NERECUNOSCUT"));
    assert.match(ramura, /severity: "info"/, "un cod nou nu e o alarma, e o masuratoare");
    assert.ok(!/aplica_tranzitia_comenzii|payment_status:/.test(ramura), "codul necunoscut misca acum comanda");
  });

  test("⚠ o stare pe care o STIM nu se scrie ca „nerecunoscuta”", () => {
    /*
     * 1 si 15 nu misca nimic, ca un cod necunoscut, dar mesajul trebuie sa spuna adevarul. Un
     * jurnal care zice „NERECUNOSCUT" despre ceva documentat trimite pe cine il citeste sa
     * „repare" o harta deja corecta. Vezi memoria `comentariul-fals-e-o-invitatie`.
     */
    assert.match(m, /if \(intermediar\) \{/, "nu se mai deosebeste starea intermediara");
    const ramura = /if \(intermediar\) \{[\s\S]*?return \{ fel: "intermediara" \};/.exec(m)?.[0] ?? "";
    assert.ok(ramura, "ramura intermediara a disparut");
    assert.match(ramura, /stare intermediara Netopia/);
    assert.match(ramura, /severity: "info"/, "o stare de asteptare nu e o alarma");
    assert.ok(!/NERECUNOSCUT/.test(ramura), "starea cunoscuta e numita nerecunoscuta");
    assert.ok(
      !/aplica_tranzitia_comenzii|payment_status:/.test(ramura),
      "starea intermediara misca acum comanda",
    );
  });

  test("⚠⚠ plata trece prin AMBELE motoare, nu prin `update` direct", () => {
    assert.match(m, /rpc\("aplica_tranzitia_comenzii"/, "stocul si cuponul nu se mai misca la confirmare");
    assert.match(m, /finalizeazaPlataComenzii\(/, "plata nu mai e idempotenta");
    /*
     * ⚠ SE COMPARA APELURILE, NU NUMELE. Prima scriere compara `indexOf("finalizeazaPlataComenzii")`,
     * care nimereste IMPORTUL din capul fisierului, deci masura ordinea importurilor si cadea pe cod
     * bun. Numele se cauta in forma in care e CHEMAT.
     */
    assert.ok(
      m.indexOf('admin.rpc("aplica_tranzitia_comenzii"') < m.indexOf("finalizeazaPlataComenzii(admin"),
      "plata se finalizeaza inaintea tranzitiei",
    );
  });

  test("⚠ si jurnalul spune DE UNDE am aflat", () => {
    /* O plata reconciliata si una notificata se deosebesc, altfel nu se poate masura cat de des
       se pierde o notificare. */
    assert.match(m, /sursa === "notify" \? "netopia\/notify" : "netopia\/reconciliere"/);
  });
});

// ─── Rambursarea: banii pleaca o singura data ────────────────────────────────

describe("Rambursarea prin Netopia: ce face CHIAR clientul", () => {
  const FETCH_VECHI = globalThis.fetch;
  afterEach(() => { globalThis.fetch = FETCH_VECHI; });

  /** Netopia raspunde asa. Se inlocuieste `fetch`, deci se probeaza clientul REAL. */
  function raspunde(status: number, corp: unknown) {
    globalThis.fetch = (async () =>
      new Response(typeof corp === "string" ? corp : JSON.stringify(corp), { status })) as typeof fetch;
  }

  async function prinde(): Promise<unknown> {
    try {
      await rambourseazaNetopia({ ntpID: "3022507", amount: 1 }, "cheie", true);
      return null;
    } catch (e) { return e; }
  }

  test("✅ MASURAT: incuviintarea lor vine cu `code 00` si `status 8`", async () => {
    /*
     * Corpul de mai jos e chiar ce a raspuns sandbox-ul lor pe 16.09.2026 la
     * `POST /operation/credit` pentru `ntpID` 3022507, o plata de 1 leu dusa pana la capat prin
     * pagina lor gazduita.
     */
    raspunde(200, { error: { code: "00", message: "[TEST P] Approved" }, payment: { status: 8, ntpID: "3022507" } });
    const r = await rambourseazaNetopia({ ntpID: "3022507", amount: 1 }, "cheie", true);
    assert.deepEqual(r, { ntpID: "3022507", status: 8, mesaj: "[TEST P] Approved" });
  });

  test("⚠⚠ un cod care NU e „00” e refuz, nu succes tacut", async () => {
    /*
     * ⚠ Se cere EXPLICIT „00". La o operatie care muta bani, tacerea nu inseamna „s-a facut":
     * citit pe dos, un corp fara cod ar fi raportat succes si comanda ar fi fost marcata
     * rambursata fara ca banii sa plece.
     */
    raspunde(200, { error: { code: "56", message: "Nu se poate credita" }, payment: { status: 12 } });
    const e = await prinde();
    assert.ok(e instanceof Error, "a raspuns succes la un refuz");
    assert.equal(verdictFurnizor(e), "esuat", "un refuz dovedit trebuie sa deblocheze reincercarea");
  });

  test("⚠⚠ si un corp FARA niciun cod e tot refuz, nu succes", async () => {
    raspunde(200, { payment: { status: 8 } });
    const e = await prinde();
    assert.ok(e instanceof Error, "lipsa codului a fost citita ca incuviintare");
    assert.equal(verdictFurnizor(e), "esuat");
  });

  test("⚠⚠ o cadere de retea e NECUNOSCUT: rambursarea poate sa fi plecat", async () => {
    /*
     * Inima lucrarii. Clasificata gresit drept „esec", randul din registru s-ar elibera si a doua
     * apasare ar trimite banii A DOUA OARA.
     */
    globalThis.fetch = (async () => { throw new Error("ECONNRESET"); }) as typeof fetch;
    assert.equal(verdictFurnizor(await prinde()), "necunoscut");
  });

  test("⚠⚠ un 5xx e tot NECUNOSCUT: cererea ajunsese la ei", async () => {
    raspunde(502, { error: { code: "99", message: "gateway" } });
    assert.equal(verdictFurnizor(await prinde()), "necunoscut");
  });

  test("⚠⚠ si un corp neinteligibil la fel", async () => {
    /* O pagina de intretinere poate fi pusa DUPA ce rambursarea a fost inregistrata. */
    raspunde(200, "<html>mentenanta</html>");
    assert.equal(verdictFurnizor(await prinde()), "necunoscut");
  });

  test("⚠ dar o cheie API respinsa e refuz DOVEDIT: nu s-a intamplat nimic acolo", async () => {
    raspunde(401, { code: "401", message: "Unauthorized" });
    const e = await prinde();
    assert.equal(verdictFurnizor(e), "esuat");
    assert.match(String((e as Error).message), /API Key/);
  });

  test("⚠ un 4xx obisnuit ramane refuz, deci reincercarea e libera", async () => {
    raspunde(400, { error: { code: "12", message: "ntpID inexistent" } });
    assert.equal(verdictFurnizor(await prinde()), "esuat");
  });

  test("⚠ suma pleaca in unitati MAJORE, ca peste tot la ei", async () => {
    /*
     * Dovedit de aceeasi proba de pe sandbox: cererea a plecat cu `amount: 1` pe o plata de
     * 1,00 lei si a fost incuviintata. Proza lor descrie campul in unitati minore; exemplele si
     * purtarea lor spun altceva, si exemplele castiga.
     */
    let trimis: unknown = null;
    globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => {
      trimis = JSON.parse(init?.body ?? "{}");
      return new Response(JSON.stringify({ error: { code: "00" }, payment: { status: 8 } }), { status: 200 });
    }) as unknown as typeof fetch;
    await rambourseazaNetopia({ ntpID: "3022507", amount: 12.34 }, "cheie", true);
    assert.deepEqual(trimis, { ntpID: "3022507", amount: 12.34 });
  });

  test("⚠ sandbox si productie nu se amesteca", async () => {
    const gazde: string[] = [];
    globalThis.fetch = (async (u: unknown) => {
      gazde.push(String(u));
      return new Response(JSON.stringify({ error: { code: "00" }, payment: { status: 8 } }), { status: 200 });
    }) as unknown as typeof fetch;
    await rambourseazaNetopia({ ntpID: "1", amount: 1 }, "k", true);
    await rambourseazaNetopia({ ntpID: "1", amount: 1 }, "k", false);
    assert.match(gazde[0], /secure\.sandbox\.netopia-payments\.com\/operation\/credit$/);
    assert.match(gazde[1], /secure\.mobilpay\.ro\/pay\/operation\/credit$/);
  });
});

describe("Rambursarea prin Netopia: cum e legata in panou", () => {
  const a = viu("src/lib/actions/netopia.actions.ts");

  test("⚠⚠ NU e legata de selectorul de status, si asta apara banii", () => {
    /*
     * ═══ DE CE E CEA MAI IMPORTANTA PROBA DIN FISIER ═══
     *
     * Niciun procesator din platforma nu trimitea bani inapoi pe API: „rambursat" era o eticheta
     * pe care comerciantul o punea DUPA ce daduse banii de mana din panoul procesatorului. Legata
     * de acel selector, apasarea lui obisnuita ar fi trimis banii A DOUA OARA, in tacere, la
     * fiecare comanda deja rambursata manual.
     */
    const o = viu("src/lib/actions/order.actions.ts");
    assert.ok(
      !/rambourseazaNetopia|rambourseazaPrinNetopia/.test(o),
      "schimbarea de status a ajuns sa trimita bani inapoi",
    );
  });

  test("⚠⚠ apelul care muta bani trece prin REGISTRU", () => {
    /* Fara el, o apasare dubla sau o scriere pierduta trimite banii de doua ori. */
    const f = /export async function rambourseazaPrinNetopia[\s\S]*$/.exec(a)?.[0] ?? "";
    assert.ok(f, "actiunea de rambursare a disparut");
    assert.match(f, /cuRegistru\(/, "rambursarea nu mai e aparata de registru");
    assert.match(f, /fel: "rambursare"/);
    assert.match(f, /furnizor: "netopia"/);
    assert.match(f, /verdictFurnizor/, "verdictul nu se mai calculeaza, deci orice esec deblocheaza");
    /* ⚠ Apelul furnizorului trebuie sa fie INAUNTRUL registrului, nu langa el. */
    assert.ok(
      f.indexOf("cuRegistru(") < f.indexOf("rambourseazaNetopia("),
      "apelul care muta bani a iesit de sub registru",
    );
  });

  test("⚠⚠ se cer toate cele trei conditii inainte de a misca bani", () => {
    const f = /export async function rambourseazaPrinNetopia[\s\S]*$/.exec(a)?.[0] ?? "";
    /*
     * ⚠ SE PRINDE FORMA GARZII, NU PREZENTA NUMELUI. Prima scriere a acestei probe cerea doar ca
     * sirul `netopia_ntp_id` sa apara undeva in functie, si mutantul `if (false && !ntpID)` a
     * TRECUT, fiindca numele ramanea in `select` si in citirea de deasupra. O proba care masoara
     * prezenta nu apara o conditie. Vezi memoria `proba-pe-fisier-trece-proba-pe-element-prinde`.
     */
    assert.match(f, /if \(order\.payment_method !== "netopia"\) \{/, "s-ar rambursa prin Netopia o plata facuta altundeva");
    assert.match(f, /if \(order\.payment_status !== "paid"\) \{/, "s-ar rambursa o comanda neplatita");
    assert.match(f, /if \(!ntpID\) \{/, "s-ar rambursa fara sa stim CE tranzactie");
    /* Toate trei INAINTEA registrului si a apelului. */
    for (const g of [
      'if (order.payment_method !== "netopia") {',
      'if (order.payment_status !== "paid") {',
      "if (!ntpID) {",
    ]) {
      assert.ok(f.indexOf(g) > -1 && f.indexOf(g) < f.indexOf("cuRegistru("), `garda «${g}» a ajuns dupa apel`);
    }
  });

  test("⚠⚠ si proprietatea magazinului se dovedeste cu clientul UTILIZATORULUI", () => {
    /*
     * Randul comenzii se citeste cu rol de serviciu, deci pana la verificarea asta nu s-a dovedit
     * nimic despre cine cheama. Modulul e „use server": fiecare export e un capat chemabil din
     * browser, cu ce argumente vrea apelantul.
     */
    const f = /export async function rambourseazaPrinNetopia[\s\S]*$/.exec(a)?.[0] ?? "";
    assert.match(f, /supabase\s*\n?\s*\.from\("businesses"\)\.select\("id"\)\.eq\("id", order\.business_id\)\.eq\("user_id", user\.id\)/,
      "apartenenta magazinului nu mai e verificata cu clientul omului");
    assert.ok(f.indexOf('eq("user_id", user.id)') < f.indexOf("cuRegistru("), "verificarea a ajuns dupa apel");
  });

  test("⚠ statusul se scrie prin RPC, ca la panou: un cuvant, un inteles", () => {
    /*
     * Un `update` direct ar fi lasat cuponul si stocul neatinse, deci „rambursat" ar fi insemnat
     * doua lucruri diferite dupa cum a fost apasat.
     */
    const f = /export async function rambourseazaPrinNetopia[\s\S]*$/.exec(a)?.[0] ?? "";
    assert.match(f, /rpc\("aplica_tranzitia_comenzii"/, "rambursarea nu mai trece prin tranzitia comenzii");
    assert.match(f, /p_payment_status: "refunded"/);
    assert.ok(f.indexOf("cuRegistru(") < f.indexOf("aplica_tranzitia_comenzii"), "statusul se scrie inainte sa plece banii");
  });

  test("⚠⚠ iar daca scrierea pica DUPA ce banii au plecat, se striga", () => {
    /* Banii dusi si comanda aratand „platita" e cea mai urata stare cu putinta. */
    const f = /export async function rambourseazaPrinNetopia[\s\S]*$/.exec(a)?.[0] ?? "";
    const dupa = f.slice(f.indexOf("aplica_tranzitia_comenzii"));
    assert.match(dupa, /severity: "critical"/, "esecul de dupa rambursare nu mai e o alarma");
  });
});

// ─── Reconcilierea: intrebam noi, cand ei nu ne-au spus ──────────────────────

describe("Interogarea starii: ce face CHIAR clientul", () => {
  const FETCH_VECHI = globalThis.fetch;
  afterEach(() => { globalThis.fetch = FETCH_VECHI; });

  function raspunde(status: number, corp: unknown) {
    globalThis.fetch = (async () =>
      new Response(typeof corp === "string" ? corp : JSON.stringify(corp), { status })) as typeof fetch;
  }

  const cheama = () => stareaPlatiiNetopia({ ntpID: "3022507", posSignature: "POS" }, "cheie", true);

  test("✅ MASURAT: capatul lor RASPUNDE, desi specul lor spune ca nu e gata", async () => {
    /*
     * ⚠⚠ ASTA A FOST CEA MAI MARE DESCOPERIRE A ZILEI. Scrisesem chiar eu, in evidenta, ca „Netopia
     * nu are plasa, si ei o spun": in specificatia lor, `/operation/status` poarta descrierea
     * „will be available at a future date". Chemat, raspunde. Corpul de mai jos e chiar ce a
     * intors sandbox-ul lor pe 16.09.2026 pentru `ntpID` 3022507.
     *
     * Concluzia, scrisa ca sa nu se piarda: la Netopia, o propozitie din specificatie NU e o
     * masuratoare.
     */
    raspunde(200, { error: { code: "00", message: "Approved" }, payment: { status: 5, amount: 1 } });
    assert.deepEqual(await cheama(), { status: 5, codLor: "00", mesajLor: "Approved", incasat: 1 });
  });

  test("⚠⚠ un REFUZ al bancii se intoarce ca stare, nu ca eroare de comunicare", async () => {
    /*
     * ⚠ AICI NU SE CERE `code === "00"`, SI E PE DOS FATA DE RAMBURSARE, DINADINS. Cererea e o
     * INTREBARE: codul descrie starea tranzactiei, nu izbanda intrebarii. Cerut si aici, o plata
     * refuzata (cod 21, CVV gresit) ar fi fost citita ca o eroare de comunicare, si reconcilierea
     * n-ar fi aflat NICIODATA de ea.
     */
    raspunde(200, { error: { code: "21", message: "Invalid CVV" }, payment: { status: 12 } });
    const r = await cheama();
    assert.equal(r.status, 12, "un refuz a fost inghitit ca eroare");
    assert.equal(r.codLor, "21");
  });

  test("⚠⚠ o cadere de retea ARUNCA, nu se intoarce ca «neplatit»", async () => {
    /*
     * Cea mai urata greseala cu putinta aici: o pana citita drept „Netopia zice ca nu e platita".
     * Cronul ar fi „lamurit" comenzi pe tacere si ar fi lasat plati adevarate nerecunoscute.
     */
    globalThis.fetch = (async () => { throw new Error("ECONNRESET"); }) as typeof fetch;
    let a_aruncat = false;
    try { await cheama(); } catch { a_aruncat = true; }
    assert.ok(a_aruncat, "o pana de retea a fost citita ca un raspuns");
  });

  test("⚠ un corp fara status intoarce `null`, nu zero", async () => {
    /* `Number(undefined)` e `NaN`, dar `Number(null)` e ZERO, iar zero e un status adevarat la ei.
       Vezi memoria `feeduri-facebook-pretmax-zero`. */
    raspunde(200, { error: { code: "00" }, payment: {} });
    assert.equal((await cheama()).status, null);
  });
});

describe("Cronul de reconciliere", () => {
  const c = viu("src/app/api/cron/netopia-reconciliere/route.ts");

  test("⚠⚠ poarta e in sensul BUN", () => {
    /* `verificaCron` intoarce `boolean`. Vezi `poarta-cronului-e-in-sensul-bun.test.ts`. */
    assert.match(c, /if \(!verificaCron\(req\)\) \{/, "poarta lipseste sau e inversata");
    assert.ok(c.indexOf("verificaCron") < c.indexOf("createClient<Database>"), "baza se deschide inaintea portii");
  });

  test("⚠⚠ nu se re-intreaba despre o comanda deja RAMBURSATA", () => {
    /* Acolo nu mai e nimic de lamurit: si banii, si eticheta sunt la locul lor. */
    assert.match(c, /\.not\("payment_status", "in", "\(paid,refunded\)"\)/, "se interogheaza si platile incheiate");
    assert.ok(!/\.eq\("payment_status", "refunded"\)/.test(c), "se intreaba despre comenzi rambursate");
  });

  test("⚠⚠ o comanda DEJA PLATITA se misca DOAR la rambursare", () => {
    /*
     * ═══ CEA MAI USOR DE RATAT GARDA DIN CRON ═══
     *
     * Comenzile platite se intreaba pentru UN singur lucru: nu cumva banii s-au intors (comerciantul
     * ramburseaza de ani de zile din panoul LOR, si notificarea aceea se poate pierde). Lasate sa
     * treaca prin regula intreaga, un raspuns `3`/`5` ar chema `aplica_tranzitia_comenzii` cu
     * `confirmed` si ar da inapoi la „confirmata" o comanda deja EXPEDIATA, la fiecare ora, sapte
     * zile la rand.
     *
     * Acelasi defect pe care `finalizeazaPlataComenzii` il evita prin `WHERE`, dar aici nu exista
     * niciun `WHERE` care sa apere: intrebarea e a noastra, deci garda trebuie sa fie tot a noastra.
     */
    assert.match(c, /if \(c\.payment_status === "paid" && spuse\.status !== 8\) continue;/,
      "o comanda expediata poate fi data inapoi la «confirmata»");
    assert.ok(
      c.indexOf('c.payment_status === "paid" && spuse.status !== 8') < c.indexOf("aplicaStatusulNetopia("),
      "garda a ajuns dupa aplicarea regulii",
    );
  });

  test("⚠ si intrebarea despre rambursari nu infometeaza pe cea despre bani pierduti", () => {
    /* Nedecisele iau plafonul intreg; platitele au fereastra mai scurta si plafon mai mic. */
    assert.match(c, /const MAX_PLATITE = 100;/);
    assert.match(c, /const ZILE_RAMBURSARE = 7;/);
    assert.ok(
      c.indexOf("MAX_PLATITE") > c.indexOf("MAX_COMENZI = 200"),
      "plafoanele s-au amestecat",
    );
  });

  test("⚠⚠ se intreaba DOAR despre platile pornite prin noi", () => {
    /* Fara `netopia_ntp_id` n-avem ce intreba, iar o comanda cu ramburs n-are nicio treaba aici. */
    assert.match(c, /\.eq\("payment_method", "netopia"\)/);
    assert.match(c, /\.not\("netopia_ntp_id", "is", null\)/);
  });

  test("⚠ si nu despre una pornita ACUM: cumparatorul poate fi inca la banca", () => {
    assert.match(c, /const ORE_MINIME = 1;/, "rastimpul de asteptare a disparut");
    assert.match(c, /\.lte\("created_at", pana\)/, "se intreaba si despre plati proaspete");
  });

  test("⚠⚠ ce raspund ei trece prin ACEEASI regula ca o notificare", () => {
    /*
     * Plasa care tine o singura copie a regulii despre bani. Vezi memoria
     * `acelasi-lucru-in-doua-copii`: pe 16.09 erau OPT, si o data ORIGINALUL era cel stricat.
     */
    assert.match(c, /aplicaStatusulNetopia\(/, "cronul si-a facut propria regula");
    for (const copiat of ["aplica_tranzitia_comenzii", "finalizeazaPlataComenzii", "resolveNetopiaStatus"]) {
      assert.ok(!c.includes(copiat), `«${copiat}» a fost copiat in cron`);
    }
  });

  test("⚠⚠ o interogare PICATA nu lamureste nimic", () => {
    /* O pana citita drept „neplatita" ar fi cea mai urata purtare cu putinta. */
    const ramura = /\} catch \(err\) \{[\s\S]*?continue;\n    \}/.exec(c)?.[0] ?? "";
    assert.ok(ramura, "interogarea nu mai e aparata de un catch");
    assert.match(ramura, /nelamurite\+\+/);
    assert.match(ramura, /continue;/);
    assert.ok(!/aplicaStatusulNetopia/.test(ramura), "o pana de retea misca acum comanda");
  });

  test("⚠⚠ iar o plata gasita asa SE STRIGA: inseamna ca notificarea lor nu a ajuns", () => {
    const dupa = c.slice(c.indexOf("lamurite++"));
    assert.match(dupa, /severity: "warning"/, "o notificare pierduta a devenit rutina tacuta");
    assert.match(dupa, /notificarea lor nu ajunsese/);
  });
});
