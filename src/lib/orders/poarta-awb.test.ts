import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { deCeNuSePoateAwbPropriu, MOTIV_DUS_DE_EI, MOTIV_PLATA_NECONFIRMATA } from "./awb-propriu";
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

const PEPITA_LIVRARE = { marketplace: "pepita", livrare_pepita: true, pepita_payment_mode: "cod" };
const PEPITA_PROPRIU = { marketplace: "pepita", livrare_pepita: false, pepita_payment_mode: "cod" };

test("⚠ livrarea dusa de ei refuza AWB-ul propriu, oricare ar fi plata", () => {
  for (const plata of ["paid", "unpaid", null]) {
    assert.equal(
      deCeNuSePoateAwbPropriu({ order_source: PEPITA_LIVRARE, payment_status: plata }),
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
      deCeNuSePoateAwbPropriu({
        order_source: { marketplace: "pepita", pepita_delivery_mode: mod },
        payment_status: "unpaid",
      }),
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
  assert.equal(deCeNuSePoateAwbPropriu({ order_source: PEPITA_PROPRIU, payment_status: "unpaid" }), null);
});

test("⚠ transferul si cardul neconfirmate opresc AWB-ul, iar marcarea ca platit il ridica", () => {
  for (const mod of ["transfer", "creditcard"]) {
    const sursa = { marketplace: "pepita", livrare_pepita: false, pepita_payment_mode: mod };
    assert.equal(
      deCeNuSePoateAwbPropriu({ order_source: sursa, payment_status: "unpaid" }),
      MOTIV_PLATA_NECONFIRMATA,
      `${mod} neplatit`,
    );
    assert.equal(
      deCeNuSePoateAwbPropriu({ order_source: sursa, payment_status: null }),
      MOTIV_PLATA_NECONFIRMATA,
      `${mod} fara stare`,
    );
    /* ⚠ Poarta se RIDICA dupa ce omul s-a uitat in extras si a marcat comanda. Nu e un zid. */
    assert.equal(deCeNuSePoateAwbPropriu({ order_source: sursa, payment_status: "paid" }), null, mod);
  }
});

test("⚠ poarta nu atinge comenzile care nu sunt Pepita", () => {
  /*
   * O comanda din magazin, sau de la alt marketplace, isi are propriile reguli. Poarta asta
   * vorbeste despre ce ne-a spus Pepita, si atat: largita din reflex, ar fi oprit AWB-uri pe
   * magazine care n-au nicio legatura cu ea.
   */
  assert.equal(deCeNuSePoateAwbPropriu({ order_source: null, payment_status: "unpaid" }), null);
  assert.equal(deCeNuSePoateAwbPropriu({ order_source: {}, payment_status: "unpaid" }), null);
  assert.equal(
    deCeNuSePoateAwbPropriu({
      order_source: { marketplace: "emag", pepita_payment_mode: "transfer" },
      payment_status: "unpaid",
    }),
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
        maybeSingle() { return Promise.resolve(raspuns); },
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
   saptesprezece actiuni de emitere o cheama. Copiata cu mana, s-ar dezbina la primul curier nou:
   cine il adauga copiaza fisierul de langa, si daca acela e cel fara poarta, lipsa e tacuta.
*/

/** Actiunile care NU trec prin poarta, si de ce. Lista e scurta dinadins. */
const SCUTITE: Record<string, string> = {
  createSamedayReturnAwbAction:
    "e un RETUR: coletul vine INAPOI de la cumparator, deci nu se dubleaza expedierea dusa de "
    + "Pepita, iar starea platii n-are ce cauta acolo. Daca vreodata se face si un retur prin "
    + "fluxul lor, scutirea asta se rediscuta.",
};

test("⚠ fiecare actiune care emite AWB cheama poarta", () => {
  const RAND_NOU = String.fromCharCode(10);
  const fisiere = readdirSync("src/lib/actions").filter((f) => f.endsWith(".actions.ts"));
  const gasite: string[] = [];

  for (const nume of fisiere) {
    const cale = `src/lib/actions/${nume}`;
    const sursa = readFileSync(cale, "utf8");
    for (const m of sursa.matchAll(/^export async function (create[A-Za-z0-9]*(?:Awb|Shipment)[A-Za-z0-9]*)\(/gm)) {
      const functie = m[1];
      gasite.push(functie);
      if (SCUTITE[functie]) continue;

      const i = sursa.indexOf(`export async function ${functie}(`);
      const sfarsit = sursa.indexOf(RAND_NOU + "}", i);
      const corp = sursa.slice(i, sfarsit === -1 ? sursa.length : sfarsit);
      assert.ok(
        corp.includes("await poartaAwbPropriu(businessId, orderId)"),
        `${cale}: ${functie} emite AWB fara sa treaca prin poarta (vezi src/lib/orders/poarta-awb.ts)`,
      );
    }
  }

  /*
   * ⚠ SI SE NUMARA. Fara randul asta, o schimbare de nume (sau un regex care nu mai potriveste
   * nimic) ar fi facut proba sa treaca peste ZERO actiuni si sa iasa verde — exact tiparul
   * „proba care nu poate cadea".
   */
  assert.ok(gasite.length >= 18, `gasite doar ${gasite.length} actiuni de emitere: plasa n-are pe cine cadea`);
  for (const scutita of Object.keys(SCUTITE)) {
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
