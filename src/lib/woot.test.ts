import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  campuriAnulareWoot,
  cancelWootOrder,
  createOrder,
  getOrderAwb,
  getOrderHistory,
  motivulWoot,
  uitaTokenurileWoot,
} from "@/lib/woot";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PLICUL DE SUCCES AL LUI WOOT                                  (13.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ DE CE TOCMAI AICI. Woot e SINGURA integrare de curierat cu trafic real: 211 AWB-uri
 * emise pentru un magazin, 186 dintre ele cu ramburs, si inca 7 in ultimele 24 de ore
 * masurate. Si pana azi n-avea niciun fisier de probe.
 *
 * ⚠ CE APARA. Woot raspunde HTTP 200 si cand a facut, si cand NU a facut: adevarul sta in
 * campul `success` din corp. Trei functii il ignorau.
 *
 *   `createOrder`     tipul promitea `order_id: number` fara sa verifice nimic, deci un
 *                     corp fara identificator ajungea sirul literal „undefined" scris in
 *                     comanda si in registru.
 *   `cancelWootOrder` rezultatul se arunca la gunoi, deci un refuz al curierului golea
 *                     comanda si raporta „anulat": coletul pleca cu rambursul lui, iar
 *                     cheia prin care mai putea fi oprit disparea.
 *   `getOrderAwb`     un corp fara `pdf` ajungea `Buffer.from(undefined)`, adica o
 *                     fereastra goala cu `Content-Type: application/pdf`.
 *
 * ⚠ MUTANTUL SE PUNE PE APELANT: raspunsul furnizorului. Fiecare proba de mai jos trimite
 * exact corpul care trecea inainte, si cere sa nu mai treaca.
 *
 * ⚠ SI VERDICTUL CONTEAZA LA FEL DE MULT CA ESECUL. `esuat` elibereaza reincercarea,
 * `necunoscut` o blocheaza. Confundate, ori se emite al doilea colet platit, ori comanda
 * ramane inghetata degeaba. Vezi `@/lib/operatii/eroare-furnizor`.
 */

const TOKEN = "token-de-proba";

/** Raspunsul urmator al lui `fetch`, oricare ar fi cererea. */
function raspunde(corp: unknown, status = 200): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(corp), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

const fetchInitial = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = fetchInitial;
  uitaTokenurileWoot();
});

/* ═══════════════════════════════════════════════════════════════════════════
   1. EMITEREA
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠⚠ `success:true` FARA order_id nu mai trece drept expediere creata", async () => {
  /*
   * ⚠ AFIRMATIA CENTRALA. Corpul asta trecea: `String(result.order_id)` dadea „undefined",
   * se scria pe comanda, si de acolo expedierea nu mai putea fi anulata NICIODATA.
   */
  raspunde({ success: true, awb_number: "123" });
  await assert.rejects(
    () => createOrder(TOKEN, { service_id: 1, sender: {}, receiver: {}, parcels: [] }),
    (e: Error) => {
      /*
       * ⚠ SI VERDICTUL E „NU STIM", NU „REFUZ". Woot spune ca a creat ceva; coletul poate
       * exista si poate fi facturat. Marcat refuz, registrul ar elibera reincercarea si al
       * doilea AWB ar pleca real, platit inca o data din creditul contului.
       */
      assert.equal(verdictFurnizor(e), "necunoscut",
        "un `success:true` fara identificator a fost luat drept refuz: reincercarea ar emite al doilea colet");
      return true;
    },
  );
});

test("⚠ nici `success:false`, si aici verdictul e REFUZ, deci reincercarea ramane libera", async () => {
  raspunde({ success: false, message: "adresa invalida" });
  await assert.rejects(
    () => createOrder(TOKEN, { service_id: 1, sender: {}, receiver: {}, parcels: [] }),
    (e: Error) => {
      assert.equal(verdictFurnizor(e), "esuat",
        "un refuz citit si complet a fost luat drept incert: comanda ar ramane blocata degeaba");
      return true;
    },
  );
});

test("⚠ un order_id care nu e intreg pozitiv e tot lipsa de identificator", async () => {
  /* Zero, negativ si nenumeric: toate trei dadeau un `String(...)` care pare o cheie. */
  for (const id of [0, -3, "abc", null, 1.5]) {
    raspunde({ success: true, order_id: id });
    await assert.rejects(
      () => createOrder(TOKEN, { service_id: 1, sender: {}, receiver: {}, parcels: [] }),
      `order_id ${JSON.stringify(id)} a fost acceptat drept identificator de expediere`,
    );
  }
});

test("⚠ iar raspunsul BUN trece, si AWB-ul lipsa ramane `null`, nu sirul gol", async () => {
  /*
   * Woot poate emite expedierea fara sa aiba inca numarul AWB. Aia e o stare legitima, nu
   * un esec: `null` o spune, sirul gol o ascunde intr-un camp care pare completat.
   */
  raspunde({ success: true, order_id: 71, awb_number: null });
  assert.deepEqual(
    await createOrder(TOKEN, { service_id: 1, sender: {}, receiver: {}, parcels: [] }),
    { success: true, order_id: 71, awb_number: null },
  );

  raspunde({ success: true, order_id: "71", awb_number: "  WB123  " });
  const r = await createOrder(TOKEN, { service_id: 1, sender: {}, receiver: {}, parcels: [] });
  assert.equal(r.order_id, 71, "identificatorul trimis ca sir nu a fost convertit");
  assert.equal(r.awb_number, "WB123", "numarul AWB nu a fost curatat de spatii");
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. ANULAREA
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠⚠ `{success:false}` la anulare nu mai e succes: coletul e viu la Woot", async () => {
  /*
   * ⚠ CEA MAI SCUMPA DINTRE TOATE. Inainte, corpul asta ducea la: golirea comenzii,
   * eliberarea slotului din registru si mesajul „AWB anulat" catre comerciant. Coletul
   * pleca la client, incasa rambursul, si tocmai stersesem cheia prin care mai putea fi
   * oprit.
   */
  raspunde({ success: false });
  await assert.rejects(
    () => cancelWootOrder(TOKEN, 71),
    (e: Error) => {
      assert.equal(verdictFurnizor(e), "esuat", "refuzul de anulare trebuie sa fie DOVEDIT, nu incert");
      assert.match(e.message, /preluat|ramane viu/i, "mesajul nu-i spune omului ca expedierea traieste mai departe");
      return true;
    },
  );
});

test("⚠ si numai confirmarea pozitiva inseamna anulare", async () => {
  raspunde({ success: true });
  assert.deepEqual(await cancelWootOrder(TOKEN, 71), { success: true });

  /* Un corp fara `success` nu e o confirmare: e un raspuns pe care nu-l intelegem. */
  raspunde({});
  await assert.rejects(() => cancelWootOrder(TOKEN, 71));
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. CE SE GOLESTE PE COMANDA
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠⚠ urmarirea comuna se goleste DOAR daca e chiar a acestui AWB", async () => {
  /*
   * `tracking_number` e o coloana comuna tuturor celor 17 curieri. Golita neconditionat,
   * anularea unei expedieri Woot ar fi sters urmarirea coletului trimis cu ALT curier.
   */
  assert.deepEqual(campuriAnulareWoot(true), {
    woot_order_id: null,
    woot_awb_number: null,
    woot_service_name: null,
    /*
     * ⚠ SI URMAREA EXPEDIERII ANULATE, de la 15.09.2026. Lasate pe loc, comanda ar fi aratat mai
     * departe ultima stare a coletului MORT, iar dupa o reemitere ceasul de rotatie ar fi tinut
     * expedierea NOUA la coada, fiindca randul ar fi parut proaspat intrebat.
     */
    woot_awb_at: null,
    woot_status_id: null,
    woot_status_label: null,
    woot_status_checked_at: null,
    tracking_number: null,
  });

  const alAltuia = campuriAnulareWoot(false);
  assert.ok(!("tracking_number" in alAltuia),
    "anularea Woot sterge urmarirea unui colet care nu e al ei");
  assert.equal(alAltuia.woot_order_id, null, "cheia expedierii ramane pe o comanda fara expediere");
});

/* ═══════════════════════════════════════════════════════════════════════════
   4. ETICHETA
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ eticheta fara `pdf` e eroare, nu o fereastra goala", async () => {
  for (const corp of [{ success: false }, { success: true }, { success: true, pdf: "" }]) {
    raspunde(corp);
    await assert.rejects(
      () => getOrderAwb(TOKEN, 71),
      `corpul ${JSON.stringify(corp)} a trecut drept eticheta valida`,
    );
  }

  raspunde({ success: true, pdf: "JVBERi0=" });
  assert.deepEqual(await getOrderAwb(TOKEN, 71), { success: true, pdf: "JVBERi0=" });
});

/* ═══════════════════════════════════════════════════════════════════════════
   4b. ISTORICUL EXPEDIERII
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ istoricul care nu e lista e eroare, nu „expedierea n-are nicio stare”", async () => {
  /*
   * ⚠ A CINCEA OARA ACEEASI LECTIE. Ei raspund 200 si cand nu dau ce am cerut. Fara citirea
   * plicului, corpul de mai jos ajungea o lista goala, iar cronul ar fi scris marcajul si ar fi
   * trecut linistit mai departe: o cadere care arata exact ca un colet fara evenimente.
   */
  raspunde({ success: false, message: "Comanda nu va apartine" });
  await assert.rejects(
    () => getOrderHistory(TOKEN, 71),
    (e: Error) => {
      assert.match(e.message, /Comanda nu va apartine/, "motivul LOR nu ajunge la noi");
      return true;
    },
  );
});

test("iar o lista GOALA e legitima: expedierea abia creata n-are evenimente", async () => {
  raspunde([]);
  assert.deepEqual(await getOrderHistory(TOKEN, 71), []);

  raspunde([{ id: 1, status_id: 3, comment: "Ridicat de curier", added: "2026-09-15T14:30:00" }]);
  assert.equal((await getOrderHistory(TOKEN, 71))[0].comment, "Ridicat de curier");
});

/* ═══════════════════════════════════════════════════════════════════════════
   5. IDENTITATEA EXPEDIERII SE CITESTE, NU SE PRIMESTE
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ DE CE PROBA E PE SURSA, SI NU PE PURTARE. `woot.actions.ts` e „use server": fiecare
   export al lui e o actiune apelabila din browser, deci regula nu se poate scoate intr-un
   modul de probat fara sa deschid o usa noua. Se verifica atunci CUSATURA: semnatura,
   citirea din comanda si filtrul de scriere. Vezi `suita-verde-peste-un-fisier-care-nu-compila`:
   probele care scaneaza surse le citesc ca TEXT, deci `tsc` ramane singurul care prinde
   sintaxa, si el ruleaza oricum inaintea fiecarui push.
*/

const RAD = process.cwd();

/** ⚠ Comentariile se taie: fisierul isi explica pe larg propria regula. */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const ACTIUNI = "src/lib/actions/woot.actions.ts";
const MODAL = "src/components/dashboard/WootAwbModal.tsx";
const EDITARE = "src/components/dashboard/OrderEditModal.tsx";

test("⚠⚠ anularea nu mai primeste identificatorul expedierii de la browser", () => {
  /*
   * ⚠ MIEZUL LUI WO-P1-01. Cu identificatorul venit din payload, cine trecea de
   * `checkAccess` cerea anularea comenzii A trimitand expedierea B: se anula B la curier si
   * se dezlega A in Edinio. Doua comenzi stricate dintr-o apasare.
   */
  const s = sursa(ACTIUNI);

  assert.match(
    s, /export async function cancelWootAwb\(\s*businessId: string,\s*orderId: string,\s*\)/,
    "anularea Woot are din nou alti parametri decat magazinul si comanda",
  );
  assert.doesNotMatch(
    s, /cancelWootAwb\([^)]*wootOrderId/,
    "identificatorul expedierii a revenit in semnatura: ar fi iar ales de browser",
  );
  assert.match(
    s, /\.select\("woot_order_id, woot_awb_number, tracking_number"\)/,
    "anularea nu mai citeste expedierea din comanda autorizata",
  );

  /*
   * ⚠ SI SCRIEREA E FILTRATA PE CE S-A CITIT. Intre citire si scriere sta apelul la Woot;
   * fara filtru, o reemitere pornita in alta fila ar fi sters numarul CEL NOU, pe care nu
   * l-a anulat nimeni. Acelasi compare-and-set ca la FAN.
   */
  assert.match(
    s, /\.eq\(awb \? "woot_awb_number" : "woot_order_id", awb \|\| wootOrderId\)/,
    "scrierea de dupa anulare nu mai e legata de expedierea care a fost anulata",
  );
});

test("⚠ si niciun apelant nu mai trimite un al treilea argument", () => {
  /*
   * ⚠ SE NUMARA APELURILE, nu doar forma lor. Woot are DOUA ferestre care anuleaza
   * (fereastra de AWB si cea de editare a comenzii); reparata una singura, cealalta ar fi
   * continuat sa trimita identificatorul. Vezi `acelasi-lucru-in-doua-copii`.
   */
  let apeluriTotale = 0;
  for (const f of [MODAL, EDITARE]) {
    const apeluri = sursa(f).match(/cancelWootAwb\([^)]*\)/g) ?? [];
    assert.ok(apeluri.length > 0, `${f} nu mai cheama deloc anularea Woot: plasa n-are pe cine cadea`);
    apeluriTotale += apeluri.length;
    for (const a of apeluri) {
      assert.equal(
        (a.match(/,/g) ?? []).length, 1,
        `${f}: apelul ${a} trimite inca identificatorul expedierii de la browser`,
      );
    }
  }
  assert.ok(apeluriTotale >= 2, `gasite doar ${apeluriTotale} apeluri de anulare Woot; erau doua`);
});


/* ═══════════════════════════════════════════════════════════════════════════
   4. MOTIVUL LOR NU SE MAI PIERDE PE RAMURA DE 200            (15.09.2026)
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ MASURAT IN PRODUCTIE, NU PRESUPUS. Toate cele SAPTE esecuri de AWB Woot din viata
   platformei poarta chiar mesajul lor: „Nu aveti suficient credit pentru a finaliza comanda".
   Un mesaj din care comerciantul stie ce sa faca: isi alimenteaza contul si reia.

   ⚠ Extragerea motivului exista de mult, dar traia INGROPATA in ramura de raspuns nereusit a
   lui `wootReq`, deci se aplica numai la 4xx si 5xx. Pe ramura de 200 cu `success:false`, cele
   trei plicuri aruncau propozitia noastra si ARUNCAU motivul lor. Comerciantul citea „Woot a
   refuzat crearea expedierii" si nu avea ce sa faca mai departe.

   ⚠ Si e chiar lectia pe care fisierul `woot.ts` o poarta scrisa: „exact asa s-a ascuns o zi
   cauza reala". Se invatase doar pentru 4xx.
   ═══════════════════════════════════════════════════════════════════════════ */

test("motivul se scoate din toate formele in care il dau", () => {
  assert.equal(motivulWoot({ message: "credit insuficient" }), "credit insuficient");
  assert.equal(motivulWoot({ error: "cont blocat" }), "cont blocat");
  /* ⚠ `error` ca OBIECT camp catre motiv: forma care a ascuns o zi cauza reala. */
  assert.equal(motivulWoot({ error: { "parcels.0.weight": "must be >= 1" } }), "parcels.0.weight: must be >= 1");
  /* Stil Laravel, ca lista si ca obiect catre lista. */
  assert.equal(motivulWoot({ errors: ["a", "b"] }), "a; b");
  assert.equal(motivulWoot({ errors: { camp: ["prea scurt"] } }), "prea scurt");
});

test("⚠ si tace cand chiar n-au spus nimic", () => {
  /* Un motiv inventat din nimic ar fi mai rau decat propozitia noastra: ar parea al lor. */
  for (const corp of [null, undefined, 42, "text", {}, { success: false }]) {
    assert.equal(motivulWoot(corp), "");
  }
});

test("⚠⚠ CAZUL REAL: creditul insuficient ajunge la comerciant, pe ramura de 200", async () => {
  /*
   * ⚠ Chiar corpul masurat in productie. Pana azi mesajul asta se pierdea aici, iar omul citea
   * o propozitie din care nu reiese ca trebuie sa-si alimenteze contul.
   */
  raspunde({ success: false, message: "Nu aveti suficient credit pentru a finaliza comanda" });
  await assert.rejects(
    () => createOrder(TOKEN, { service_id: 1, sender: {}, receiver: {}, parcels: [] }),
    (e: Error) => {
      assert.match(e.message, /Nu aveti suficient credit/,
        "motivul lui Woot s-a pierdut: comerciantul nu afla ca trebuie sa alimenteze contul");
      /* ⚠ Si propozitia NOASTRA ramane: ea spune ce s-a intamplat la noi, motivul spune de ce la ei. */
      assert.match(e.message, /Woot a refuzat crearea expedierii/);
      /* ... iar verdictul nu s-a clintit: refuz dovedit, deci reincercarea ramane libera. */
      assert.equal(verdictFurnizor(e), "esuat");
      return true;
    },
  );
});

test("⚠ eticheta refuzata spune si ea de ce", async () => {
  raspunde({ success: false, error: "expedierea nu exista" });
  await assert.rejects(
    () => getOrderAwb(TOKEN, 123),
    (e: Error) => {
      assert.match(e.message, /expedierea nu exista/, "motivul lui Woot s-a pierdut la eticheta");
      assert.match(e.message, /Woot nu a returnat eticheta/);
      return true;
    },
  );
});

test("⚠⚠ si anularea refuzata, unde motivul valoreaza cel mai mult", async () => {
  /*
   * ⚠ Aici comerciantul are un colet VIU la ei si trebuie sa stie de ce nu se opreste. „De regula
   * inseamna ca a fost deja preluata" e o ghiceala a noastra; motivul lor e adevarul.
   */
  raspunde({ success: false, message: "Expedierea a fost deja ridicata de curier" });
  await assert.rejects(
    () => cancelWootOrder(TOKEN, 123),
    (e: Error) => {
      assert.match(e.message, /deja ridicata de curier/, "motivul lui Woot s-a pierdut la anulare");
      assert.match(e.message, /Woot a refuzat anularea/);
      assert.equal(verdictFurnizor(e), "esuat");
      return true;
    },
  );
});

test("⚠ cand ei tac, ramane propozitia noastra INTREAGA, fara doua puncte in coada", async () => {
  /* Un mesaj care se termina cu doua puncte arata ca s-a pierdut ceva pe drum. */
  raspunde({ success: false });
  await assert.rejects(
    () => createOrder(TOKEN, { service_id: 1, sender: {}, receiver: {}, parcels: [] }),
    (e: Error) => {
      assert.equal(e.message, "Woot a refuzat crearea expedierii.");
      return true;
    },
  );
});

test("⚠ si pe 4xx motivul trece mai departe ca inainte, prin acelasi ajutor", async () => {
  /*
   * Ramura veche nu s-a schimbat ca purtare, dar acum trece prin functia comuna. Scrisa a doua
   * oara de mana, cele doua ar fi inceput sa citeasca forme diferite ale aceluiasi raspuns.
   */
  raspunde({ error: { "parcels.0.weight": "must be >= 1" } }, 400);
  await assert.rejects(
    () => createOrder(TOKEN, { service_id: 1, sender: {}, receiver: {}, parcels: [] }),
    (e: Error) => {
      assert.match(e.message, /parcels\.0\.weight: must be >= 1/);
      return true;
    },
  );
});


/* ═══════════════════════════════════════════════════════════════════════════
   5. REGIMUL DE PLATA AL CONTULUI                             (15.09.2026)
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ Pana azi nimeni nu trimitea `payment_method`, deci TOATE magazinele plecau pe `credit`.
   Masurat: toate cele SAPTE esecuri de AWB Woot din viata platformei sunt „Nu aveti suficient
   credit". Un magazin cu cont pe termen ar fi esuat asa la nesfarsit.

   ⚠ Si „card" NU se ofera, pe documentatia LOR: la POST /orders, `awb_number` e „for credit/term
   payments", iar `payment_id` e „for card payments". Pe card nu intorc niciun AWB.
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ regimul ales de comerciant chiar pleaca la Woot", async () => {
  let trimis: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => {
    trimis = init?.body ? JSON.parse(init.body) as Record<string, unknown> : null;
    return new Response(JSON.stringify({ success: true, order_id: 7, awb_number: "W1" }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await createOrder(TOKEN, { service_id: 1, sender: {}, receiver: {}, parcels: [], payment_method: "term" });
  assert.equal((trimis as unknown as { payment_method?: string })?.payment_method, "term",
    "regimul ales de comerciant nu ajunge la Woot: contul pe termen ar esua la nesfarsit pe credit");
});

test("⚠ si lipsa lui inseamna `credit`, care e si implicitul LOR", async () => {
  /* Asa nu se clinteste nimic pentru magazinele care merg azi. */
  let trimis: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => {
    trimis = init?.body ? JSON.parse(init.body) as Record<string, unknown> : null;
    return new Response(JSON.stringify({ success: true, order_id: 7, awb_number: "W1" }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await createOrder(TOKEN, { service_id: 1, sender: {}, receiver: {}, parcels: [] });
  assert.equal((trimis as unknown as { payment_method?: string })?.payment_method, "credit");
});

test("⚠⚠ panoul NU ofera `card`, fiindca acolo nu vine niciun AWB", () => {
  /*
   * ⚠ Regula asta nu se poate proba pe valori: e o alegere dintr-o lista din panou. Iar daca ar
   * ajunge acolo, comerciantul ar emite o expediere fara eticheta si fara numar, si ar afla abia
   * cand s-ar duce sa tipareasca. Se cere deci pe SURSA.
   */
  const panou = readFileSync(
    path.join(process.cwd(), "src/components/dashboard/WootConfigClient.tsx"), "utf8");
  const optiuni = [...panou.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(optiuni.includes("credit"), "panoul nu mai ofera creditul");
  assert.ok(optiuni.includes("term"), "panoul nu mai ofera termenul");
  assert.equal(optiuni.includes("card"), false,
    "panoul ofera `card`, unde Woot intoarce `payment_id` in loc de `awb_number`: expediere fara eticheta");
});
