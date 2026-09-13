import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { coloanelePortii, deCeNuSePoateAwbPropriu, MOTIV_COMANDA_INCHISA, MOTIV_DUS_DE_EI, MOTIV_PLATA_NECONFIRMATA, type ComandaLaPoartaAwb } from "./awb-propriu";
import { poartaCuBaza } from "./poarta-awb";

/* ══════════════════════════════════════════════════════════════════════════
   AWB PROPRIU PE O COMANDA CARE NU-L SUPORTA (08.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   Doua feluri de paguba, amandoua din acelasi buton:

   1. LIVRARE PEPITA. Coletul e dus de GLS-ul contractat de EI, cu eticheta lor. Un AWB propriu
      inseamna a doua eticheta pe acelasi pachet si un al doilea transport platit. Rambursul era
      aparat de mult, generarea in MASA sarea peste randurile astea — dar pe ecranul comenzii
      butonul se putea apasa, si actiunea de pe server nu verifica nimic.

   2. PLATA IN AVANS NECONFIRMATA. La `transfer` si `creditcard` banii vin inainte si nu trec
      prin curier: rambursul e zero. Un AWB emis inainte de confirmare trimite marfa fara niciun
      ban si fara nicio incasare la usa.

   ⚠ SI DE CE POARTA E PE SERVER, NU PE ECRAN. Fiecare actiune de curier e o „use server", adica
   o adresa publica: se poate chema din doua file deschise, dintr-un dublu-click, sau direct.
   Ecranul poate doar sa nu arate butonul; refuzul trebuie sa fie unde se emite AWB-ul.
*/

/**
 * Comanda de proba, cu campurile noi completate „curat".
 *
 * ⚠ Exista ca probele DE MAI JOS sa ramana despre ce erau, Pepita si plata,
 * si sa nu inceapa sa cada din alt motiv cand poarta a mai primit doua reguli.
 */
function comanda(peste: Partial<ComandaLaPoartaAwb>): ComandaLaPoartaAwb {
  return { order_source: null, payment_status: "paid", status: "processing", awburi: {}, ...peste };
}

const PEPITA_LIVRARE = { marketplace: "pepita", livrare_pepita: true, pepita_payment_mode: "cod" };
const PEPITA_PROPRIU = { marketplace: "pepita", livrare_pepita: false, pepita_payment_mode: "cod" };

test("⚠ livrarea dusa de ei refuza AWB-ul propriu, oricare ar fi plata", () => {
  for (const plata of ["paid", "unpaid", null]) {
    assert.equal(
      deCeNuSePoateAwbPropriu(comanda({ order_source: PEPITA_LIVRARE, payment_status: plata })),
      MOTIV_DUS_DE_EI,
      `plata ${plata}`,
    );
  }
});

test("⚠ si o comanda de dinaintea steagului, recunoscuta dupa modul de livrare", () => {
  /*
   * `livrare_pepita` se scrie abia de la ingestul din 08.09.2026. O comanda mai veche are doar
   * `pepita_delivery_mode`. Fara caderea pe el, tocmai comenzile vechi — cele care apuca sa
   * ajunga la expediere — ar fi trecut de poarta.
   */
  for (const mod of ["gls", "gls_parcelshop", "gls_parcellocker", "gls_xxl", "GLS_XXL"]) {
    assert.equal(
      deCeNuSePoateAwbPropriu(comanda({
        order_source: { marketplace: "pepita", pepita_delivery_mode: mod },
        payment_status: "unpaid",
      })),
      MOTIV_DUS_DE_EI,
      mod,
    );
  }
});

test("⚠ ramburs cu CURIERUL COMERCIANTULUI se poate emite, desi comanda e neplatita", () => {
  /*
   * Aici „neplatit" e starea NORMALA: curierul chiar incaseaza la usa. O poarta care ar fi
   * privit doar `payment_status` ar fi oprit exact fluxul care merge bine.
   */
  assert.equal(deCeNuSePoateAwbPropriu(comanda({ order_source: PEPITA_PROPRIU, payment_status: "unpaid" })), null);
});

test("⚠ transferul si cardul neconfirmate opresc AWB-ul, iar marcarea ca platit il ridica", () => {
  for (const mod of ["transfer", "creditcard"]) {
    const sursa = { marketplace: "pepita", livrare_pepita: false, pepita_payment_mode: mod };
    assert.equal(
      deCeNuSePoateAwbPropriu(comanda({ order_source: sursa, payment_status: "unpaid" })),
      MOTIV_PLATA_NECONFIRMATA,
      `${mod} neplatit`,
    );
    assert.equal(
      deCeNuSePoateAwbPropriu(comanda({ order_source: sursa, payment_status: null })),
      MOTIV_PLATA_NECONFIRMATA,
      `${mod} fara stare`,
    );
    /* ⚠ Poarta se RIDICA dupa ce omul s-a uitat in extras si a marcat comanda. Nu e un zid. */
    assert.equal(deCeNuSePoateAwbPropriu(comanda({ order_source: sursa, payment_status: "paid" })), null, mod);
  }
});

test("⚠ poarta nu atinge comenzile care nu sunt Pepita", () => {
  /*
   * O comanda din magazin, sau de la alt marketplace, isi are propriile reguli. Poarta asta
   * vorbeste despre ce ne-a spus Pepita, si atat: largita din reflex, ar fi oprit AWB-uri pe
   * magazine care n-au nicio legatura cu ea.
   */
  assert.equal(deCeNuSePoateAwbPropriu(comanda({ order_source: null, payment_status: "unpaid" })), null);
  assert.equal(deCeNuSePoateAwbPropriu(comanda({ order_source: {}, payment_status: "unpaid" })), null);
  assert.equal(
    deCeNuSePoateAwbPropriu(comanda({
      order_source: { marketplace: "emag", pepita_payment_mode: "transfer" },
      payment_status: "unpaid",
    })),
    null,
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   CITIREA PE CARE SE SPRIJINA POARTA
   ══════════════════════════════════════════════════════════════════════════ */

interface Cerere { tabela: string; coloane: string; filtre: [string, unknown][] }

function bazaFalsa(raspuns: { data: unknown; error: { message: string } | null }) {
  const cereri: Cerere[] = [];
  const db = {
    from(tabela: string) {
      const c: Cerere = { tabela, coloane: "", filtre: [] };
      cereri.push(c);
      const lant = {
        select(coloane: string) { c.coloane = coloane; return lant; },
        eq(k: string, v: unknown) { c.filtre.push([k, v]); return lant; },
        /*
         * ⚠ SE INTORC DOAR COLOANELE CERUTE, ca PostgREST.
         *
         * Pana pe 13.09.2026 baza asta intorcea acelasi rand orice s-ar fi cerut in
         * `select`, deci nimic nu apara lista de coloane. Probat: cu select-ul scurtat
         * la cele trei vechi SI cu maparea stricata, toate cele 17 probe treceau, iar
         * regula-titlu a valului („AWB la alt curier") tacea complet. O baza falsa mai
         * darnica decat cea adevarata nu prinde campul necerut.
         */
        maybeSingle() {
          if (!raspuns.data || typeof raspuns.data !== "object") return Promise.resolve(raspuns);
          const cerute = c.coloane.split(",").map((x) => x.trim()).filter(Boolean);
          const rand = raspuns.data as Record<string, unknown>;
          const taiat: Record<string, unknown> = {};
          for (const k of cerute) if (k in rand) taiat[k] = rand[k];
          return Promise.resolve({ data: taiat, error: raspuns.error });
        },
      };
      return lant;
    },
  };
  return { db: db as unknown as Parameters<typeof poartaCuBaza>[0], cereri };
}

test("⚠ citirea cere si magazinul, nu doar id-ul comenzii", async () => {
  /*
   * Se citeste cu cheia de SISTEM, deci RLS nu mai apara nimic, iar `orderId` vine din browser.
   * Fara `business_id`, poarta ar fi raspuns despre comanda altui magazin — si ar fi si spus, prin
   * chiar refuzul ei, ce fel de comanda are acela.
   */
  const { db, cereri } = bazaFalsa({ data: { order_source: PEPITA_LIVRARE, payment_status: "paid" }, error: null });
  await poartaCuBaza(db, "biz-1", "ord-1");

  assert.equal(cereri.length, 1);
  assert.equal(cereri[0].tabela, "orders");
  assert.deepEqual(cereri[0].filtre, [["id", "ord-1"], ["business_id", "biz-1"]]);
  /* ⚠ Si cele doua coloane se CER anume: necerute, ar veni `undefined` si poarta ar tace. */
  assert.match(cereri[0].coloane, /order_source/);
  assert.match(cereri[0].coloane, /payment_status/);
});

test("⚠ o citire cazuta cade INCHIS", async () => {
  /*
   * Intrebarea la care nu stim raspunsul e „coletul asta e deja dus de altcineva?". Ghicita
   * gresit in partea cealalta, costa un al doilea transport platit.
   */
  const { db } = bazaFalsa({ data: null, error: { message: "pana de retea" } });
  const refuz = await poartaCuBaza(db, "biz-1", "ord-1");
  assert.ok(refuz, "o baza cazuta a lasat AWB-ul sa treaca");
});

test("comanda negasita nu se refuza aici: actiunea da mesajul ei", async () => {
  /* Un refuz de aici ar fi ascuns cauza adevarata in spatele unui text despre AWB-uri. */
  const { db } = bazaFalsa({ data: null, error: null });
  assert.equal(await poartaCuBaza(db, "biz-1", "ord-1"), null);
});

test("⚠ poarta chiar refuza pe drumul intreg, nu doar in functia pura", async () => {
  const { db } = bazaFalsa({ data: { order_source: PEPITA_LIVRARE, payment_status: "paid" }, error: null });
  assert.equal(await poartaCuBaza(db, "biz-1", "ord-1"), MOTIV_DUS_DE_EI);

  const b2 = bazaFalsa({
    data: { order_source: { marketplace: "pepita", livrare_pepita: false, pepita_payment_mode: "transfer" }, payment_status: "unpaid" },
    error: null,
  });
  assert.equal(await poartaCuBaza(b2.db, "biz-1", "ord-1"), MOTIV_PLATA_NECONFIRMATA);
});

/* ══════════════════════════════════════════════════════════════════════════
   SI FIECARE CURIER TRECE PRIN EA
   ══════════════════════════════════════════════════════════════════════════

   ⚠ ASTA E PARTEA CARE CHIAR APARA. Regula de mai sus e o functie; ce conteaza e ca toate cele
   douazeci de actiuni de emitere o cheama. Copiata cu mana, s-ar dezbina la primul curier nou:
   cine il adauga copiaza fisierul de langa, si daca acela e cel fara poarta, lipsa e tacuta.

   ⚠ SI EMITATORII CARE NU SUNT CURIERI (13.09.2026). Plasa prindea doar `create…Awb…`, asa ca
   `emiteAwbEmag` a stat pe langa ea de la bun inceput: emitea un AWB adevarat, cu colet ridicat
   si platit, fara sa treaca prin nimic. Tiparul de nume nu e o regula de securitate.
*/

/** Actiunile care NU trec prin poarta, si de ce. Lista e scurta dinadins. */
const SCUTITE: Record<string, string> = {
  createSamedayReturnAwbAction:
    "e un RETUR: coletul vine INAPOI de la cumparator, deci nu se dubleaza expedierea dusa de "
    + "Pepita, iar starea platii n-are ce cauta acolo. Daca vreodata se face si un retur prin "
    + "fluxul lor, scutirea asta se rediscuta.",
  emiteAwbReturEmag:
    "tot un RETUR, dupa acelasi precedent. Si, peste asta, nici nu POATE trece pe aici: "
    + "primeste `emagRmaId`, nu `orderId`, iar comanda o afla abia dupa citirea din `emag_rma`, "
    + "unde `order_id` are voie sa fie null. Piedicile lui sunt in `poateAwbRetur`.",
};

/**
 * Actiunile care trec prin poarta, dar FARA sa se prezinte cu un curier, si de ce.
 *
 * ⚠ Nu e o portita de comoditate: un emitator care ARE coloana pe `orders` si totusi n-o
 * spune s-ar bloca pe propriul lui AWB, deci lista de aici se verifica in amandoua sensurile.
 */
const FARA_CURIER: Record<string, string> = {
  emiteAwbEmag:
    "eMAG nu are coloana pe `orders`: AWB-ul lui sta in `emag_awb`, iar pe comanda scrie doar "
    + "`tracking_number`, camp comun tuturor curierilor, deci nefolosibil ca identitate. Neavand "
    + "cheie in `COLOANA_AWB`, nu se poate prezenta cu una, si nici nu are nevoie: fara curier, "
    + "poarta refuza pe AWB-ul ORICARUI curier propriu, ceea ce e exact ce trebuia oprit.",
};

test("⚠ fiecare actiune care emite AWB cheama poarta", () => {
  const RAND_NOU = String.fromCharCode(10);
  const fisiere = readdirSync("src/lib/actions").filter((f) => f.endsWith(".actions.ts"));
  const gasite: string[] = [];

  for (const nume of fisiere) {
    const cale = `src/lib/actions/${nume}`;
    const sursa = readFileSync(cale, "utf8");
    for (const m of sursa.matchAll(/^export async function ((?:create|emite)[A-Za-z0-9]*(?:Awb|Shipment)[A-Za-z0-9]*)\(/gm)) {
      const functie = m[1];
      gasite.push(functie);
      if (SCUTITE[functie]) continue;

      const i = sursa.indexOf(`export async function ${functie}(`);
      const sfarsit = sursa.indexOf(RAND_NOU + "}", i);
      const corp = sursa.slice(i, sfarsit === -1 ? sursa.length : sfarsit);
      /*
       * ⚠ SI CU CURIERUL DAT. Din 09.09.2026 poarta stie sa refuze si „coletul e
       * deja dus de altcineva", iar raspunsul depinde de CINE intreaba: fara al
       * treilea argument, fiecare curier s-ar bloca pe propriul AWB.
       *
       * Argumentul e optional in tip, pentru emitatorii fara coloana pe `orders`
       * (vezi `FARA_CURIER`), deci aici se cere pe nume, nu pe semnatura.
       */
      const chemare = corp.match(/await poartaAwbPropriu\(businessId, orderId(?:, "([a-z]+)")?\)/);
      assert.ok(
        chemare,
        `${cale}: ${functie} emite AWB fara sa treaca prin poarta (vezi src/lib/orders/poarta-awb.ts)`,
      );

      if (FARA_CURIER[functie]) {
        /* ⚠ Scutirea se verifica si PE DOS: trecut aici din greseala, un emitator care are
           totusi coloana ar fi scapat tacut de regula „fiecare se recunoaste pe sine". */
        assert.equal(
          chemare![1], undefined,
          `${cale}: ${functie} e in FARA_CURIER, dar se prezinta cu un curier: scoate-l din lista`,
        );
      } else {
        assert.ok(
          chemare![1],
          `${cale}: ${functie} trece prin poarta fara sa spuna ce curier e; daca chiar n-are `
          + `coloana pe tabela orders, treci-l in FARA_CURIER cu motivul scris`,
        );
        assert.ok(
          nume.startsWith(chemare![1]),
          `${cale}: ${functie} se prezinta la poarta drept "${chemare![1]}"`,
        );
      }
    }
  }

  /*
   * ⚠ SI SE NUMARA. Fara randul asta, o schimbare de nume (sau un regex care nu mai potriveste
   * nimic) ar fi facut proba sa treaca peste ZERO actiuni si sa iasa verde — exact tiparul
   * „proba care nu poate cadea".
   */
  assert.ok(gasite.length >= 20, `gasite doar ${gasite.length} actiuni de emitere: plasa n-are pe cine cadea`);
  for (const scutita of [...Object.keys(SCUTITE), ...Object.keys(FARA_CURIER)]) {
    assert.ok(gasite.includes(scutita), `scutirea pentru ${scutita} e pe o functie care nu mai exista`);
  }
});

test("⚠ si ecranul comenzii tace acolo unde serverul refuza", () => {
  /*
   * Ecranul nu apara nimic — dar un buton care se apasa si da eroare e mai rau decat unul care
   * lipseste cu explicatie. Si, mai ales, ecranul trebuie sa foloseasca ACEEASI regula: o copie
   * a ei ar fi al doilea adevar despre aceeasi comanda, iar cel de pe ecran ar fi crezut.
   */
  const sursa = readFileSync("src/components/dashboard/OrderDetailClient.tsx", "utf8");
  assert.match(sursa, /from "@\/lib\/orders\/awb-propriu"/, "ecranul si-a facut propria regula");
  assert.match(sursa, /refuzAwbPropriu/);
  /* ⚠ Si bara de jos de pe telefon, care e chiar butonul apasat cel mai des. */
  assert.match(sursa, /!refuzAwbPropriu && primaryCourier/, "bara de jos de pe telefon a ramas deschisa");
});

test("⚠ si LISTA de comenzi, care a primit aceeasi regula si n-o apara nimeni", () => {
  /*
   * ═══ ECRANUL NOU NU ERA ATINS DE NICIO PROBA (13.09.2026) ═══
   *
   * Regula a intrat in acelasi val si pe lista de comenzi, pe noua butoane de emitere, dar
   * proba de mai sus citeste doar `OrderDetailClient.tsx`. Cine aranjeaza clasele butoanelor
   * peste o luna poate scoate garda din toate cele noua locuri, iar suita ramane VERDE: lista
   * ofera din nou „Creeaza AWB" pe comenzi cu livrarea dusa de marketplace, unde apasarea da
   * eroare, si unde inainte de val dadea al doilea colet.
   *
   * ⚠ CE APARA, SI CE NU. Prinde dezbracarea garzilor existente si despartirea de regula
   * comuna. NU prinde un al zecelea buton adaugat fara garda: etichetele celor noua nu sunt
   * identice (unul are alt text), deci nu exista un numarator cinstit al „butoanelor de
   * emitere" pe care sa-l compar. Spun asta pe fata ca sa nu para ca apara mai mult.
   */
  const sursa = readFileSync("src/components/dashboard/OrdersClient.tsx", "utf8");

  /* ⚠ ACEEASI regula, nu o copie: doua adevaruri despre aceeasi comanda s-ar desparti. */
  assert.match(sursa, /from "@\/lib\/orders\/awb-propriu"/, "lista si-a facut propria regula");
  assert.match(sursa, /deCeNuSePoateAwbPropriu\(/, "lista nu mai intreaba regula comuna");
  assert.match(sursa, /awburiDinRand\(/, "fara `awburiDinRand`, lista nu vede coletul altui curier");

  /*
   * ⚠ SE NUMARA. Masurat pe 13.09.2026: noua butoane trecute prin garda.
   * Un `assert.match` simplu ar fi ramas verde dupa ce opt din noua si-o pierdeau,
   * exact greseala prinsa in aceeasi zi la plasa de termene.
   *
   * ⚠ SI GARDA NU MAI STINGE BUTONUL. Stins, motivul traia doar in `title`, care pe un
   * element `disabled` nu se vede pe telefon si pe tableta: acolo nu exista hover. Acum
   * apasarea ajunge la noi si arata chiar propozitia serverului. Vezi `apasaAwb`.
   */
  const garzi = (sursa.match(/apasaAwb\(refuzAwbLista,/g) ?? []).length;
  const marcaje = (sursa.match(/aria-disabled=\{!!refuzAwbLista\}/g) ?? []).length;
  assert.ok(garzi >= 9, `doar ${garzi} din 9 butoane de emitere mai trec prin garda`);
  assert.equal(marcaje, garzi, "un buton pazit trebuie sa spuna si cititorului de ecran ca e refuzat");

  assert.match(
    sursa, /function apasaAwb\([\s\S]{0,600}?toast\.error\(/,
    "garda nu mai ARATA motivul: un buton care nu face nimic e mai rau decat unul lipsa",
  );
  /*
   * ⚠ PRIVIREA INAPOI NU E DECORATIVA: fara ea, regexul se potriveste CHIAR IN INTERIORUL
   * lui `aria-disabled={!!refuzAwbLista}`, ca subsir, deci afirmatia nu putea fi adevarata
   * niciodata dupa propria ei reparatie. Prins pe 13.09.2026 de controlul de dinaintea
   * mutantilor, care a iesit rosu pe arborele CURAT.
   */
  assert.doesNotMatch(
    sursa, /(?<!aria-)disabled=\{!!refuzAwbLista\}/,
    "butonul a ramas stins, deci pe telefon motivul nu se vede deloc",
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   DOUA REGULI NOI (09.09.2026)
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ o comanda anulata sau restituita nu mai primeste AWB", () => {
  for (const stare of ["cancelled", "refunded"]) {
    assert.equal(deCeNuSePoateAwbPropriu(comanda({ status: stare })), MOTIV_COMANDA_INCHISA, stare);
  }
});

test("⚠ dar `shipped` si `delivered` raman deschise: o reexpediere e legitima", () => {
  for (const stare of ["shipped", "delivered", "processing", "pending", "confirmed", null]) {
    assert.equal(deCeNuSePoateAwbPropriu(comanda({ status: stare })), null, String(stare));
  }
});

test("⚠ un AWB la ALT curier opreste emiterea, si spune la care", () => {
  const motiv = deCeNuSePoateAwbPropriu(
    comanda({ awburi: { cargus: "1234567890" } }), "fancourier");
  assert.match(motiv ?? "", /Cargus/);
  assert.match(motiv ?? "", /1234567890/);
});

test("⚠ dar PROPRIUL AWB nu se opreste singur: altfel anularea si reemiterea ar fi imposibile", () => {
  assert.equal(
    deCeNuSePoateAwbPropriu(comanda({ awburi: { fancourier: "2228000111" } }), "fancourier"),
    null,
  );
});

test("⚠ eticheta de RETUR Sameday nu blocheaza livrarea", () => {
  // `sameday_return_awb_number` nu e in `COLOANA_AWB`, deci nici nu ajunge in `awburi`.
  assert.equal(deCeNuSePoateAwbPropriu(comanda({ awburi: {} }), "sameday"), null);
});

test("⚠ toti cei 17 curieri sunt acoperiti, si fiecare se recunoaste pe sine", async () => {
  const { COLOANA_AWB } = await import("./awb-propriu");
  const chei = Object.keys(COLOANA_AWB) as (keyof typeof COLOANA_AWB)[];
  assert.equal(chei.length, 17, "harta de coloane nu mai are 17 curieri");
  for (const c of chei) {
    // Mutantul e pe APELANT: fiecare curier, intrebat despre propriul AWB, trece;
    // intrebat despre al vecinului, cade.
    assert.equal(deCeNuSePoateAwbPropriu(comanda({ awburi: { [c]: "X1" } }), c), null, c);
    const altul = chei.find(x => x !== c)!;
    assert.notEqual(deCeNuSePoateAwbPropriu(comanda({ awburi: { [c]: "X1" } }), altul), null, `${altul} vs ${c}`);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   CE CITESTE CHIAR POARTA (13.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Probele de mai sus confrunta harta cu EA INSASI, pe date sintetice. Cele de aici
   trec prin `poartaCuBaza`, cu randul exact cum il lasa emiterea fiecarui curier, si
   cer coloanele pe numele lor. Fara ele, o coloana gresita in harta trecea verde.
*/

test("⚠ poarta cere `status` si TOATE coloanele hartii, nu doar cele doua vechi", async () => {
  const { db, cereri } = bazaFalsa({
    data: { order_source: null, payment_status: "paid", status: "processing" }, error: null,
  });
  await poartaCuBaza(db, "biz-1", "ord-1", "fancourier");

  const cerute = cereri[0].coloane.split(",").map((x) => x.trim());
  assert.ok(cerute.includes("status"), "poarta nu mai cere `status`");
  for (const coloana of coloanelePortii()) {
    assert.ok(cerute.includes(coloana), `poarta nu mai cere coloana ${coloana}`);
  }
});

test("⚠ PACKETA: coletul tocmai emis opreste AWB-ul la alt curier", async () => {
  /*
   * Randul exact cum il lasa `createPacketaAwbAction`: `packeta_packet_id` si
   * `packeta_barcode` scrise, `packeta_external_tracking` inca null, fiindca pe acela
   * il scrie abia cronul de urmarire, la statusul 6. Cu harta veche, aici treceau doua
   * colete reale, la furnizorul care nu are anulare in API.
   */
  const { db } = bazaFalsa({
    data: {
      order_source: null, payment_status: "paid", status: "processing",
      packeta_packet_id: "9012345678", packeta_barcode: "Z9012345678", packeta_external_tracking: null,
    },
    error: null,
  });
  const refuz = await poartaCuBaza(db, "biz-1", "ord-1", "fancourier");
  assert.match(refuz ?? "", /Packeta/, "al doilea colet real a trecut de poarta");
  assert.match(refuz ?? "", /9012345678/);
});

test("⚠ ECOLET: expedierea trimisa, dar inca fara AWB, opreste alt curier", async () => {
  // Fereastra dintre `send-order` (scrie `ecolet_order_to_send_id`) si AWB-ul care
  // vine mai tarziu. eColet isi apara singur a doua expediere tot pe `to_send_id`.
  const { db } = bazaFalsa({
    data: {
      order_source: null, payment_status: "paid", status: "processing",
      ecolet_order_to_send_id: 4242, ecolet_awb_number: null,
    },
    error: null,
  });
  assert.match(await poartaCuBaza(db, "biz-1", "ord-1", "fancourier") ?? "", /eColet/);
});

test("⚠ dar propriul curier nu se blocheaza pe martorul lui", async () => {
  // Altfel eColet n-ar mai putea duce la capat chiar expedierea pe care a pornit-o.
  const { db } = bazaFalsa({
    data: {
      order_source: null, payment_status: "paid", status: "processing",
      ecolet_order_to_send_id: 4242, ecolet_awb_number: null,
    },
    error: null,
  });
  assert.equal(await poartaCuBaza(db, "biz-1", "ord-1", "ecolet"), null);
});
