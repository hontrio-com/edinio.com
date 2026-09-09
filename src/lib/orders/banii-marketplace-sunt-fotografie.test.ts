import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { recalculeazaTotal } from "@/lib/orders/edit-pricing";
import { invoiceVat } from "@/lib/billing/invoice-vat";
import { liniiSmartbill, reconciliazaComanda } from "@/lib/billing/reconcile";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import { livrareaEDusaDeMarketplace } from "@/lib/orders/origin";

/* ══════════════════════════════════════════════════════════════════════════
   BANII UNEI COMENZI DE MARKETPLACE SUNT O FOTOGRAFIE (09.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ DRUMUL CARE LIPSEA DIN PROBE, SI CARE A COSTAT.

   Aveam probe bune pentru „import Pepita → factura". N-aveam niciuna pentru
   „import Pepita → EDITEAZA COMANDA → factura" — iar acolo era gaura: editorul
   generic de comenzi trece toata comanda prin motorul financiar, chiar si cand
   comerciantul schimba doar telefonul.

   Sumele unei comenzi de marketplace vin de la ei si nu se pot deduce din nimic
   de-al nostru: nici din catalogul nostru, nici din setarile noastre de TVA, nici
   din pragul nostru de livrare gratuita. Resocotite, ies alte cifre — si nu cu un
   ban, ci cu procente.
*/

const MAGAZIN_NET = { vat_enabled: true, vat_rate: 21, prices_include_vat: false };

test("⚠ resocotita cu setarile magazinului, o comanda Pepita de 121 iese 146,41", () => {
  /*
   * Magazin cu preturi FARA TVA. Pepita a trimis 121 de lei BRUTI, si atat a platit clientul.
   * Motorul de editare, care nu stie ca sumele sunt deja brute, adauga 21% deasupra.
   *
   * ⚠ CIFRA E MASURATA, nu presupusa: chiar `recalculeazaTotal`, chiar cu numerele astea.
   */
  const resocotit = recalculeazaTotal({
    subtotal: 121, extras: 0, discount: 0, cardDiscount: 0, codDiscount: 0,
    codFee: 0, shipping: 0, freeShippingThreshold: null, vat: MAGAZIN_NET,
  });
  assert.equal(resocotit.total, 146.41);
  assert.equal(resocotit.vatAmount, 25.41);

  /*
   * ⚠ SI DE CE E O PAGUBA DE BANI, NU DOAR O CIFRA URATA: `orders.total` e chiar suma pe care
   * o cere curierul la usa. Clientul ar fi platit 25,41 lei in plus pentru un telefon corectat.
   */
  const laUsa = rambursDeIncasat({
    total: resocotit.total, payment_status: "unpaid",
    order_source: { marketplace: "pepita" },
  });
  assert.equal(laUsa, 146.41, "rambursul nu mai urmareste totalul comenzii");
  assert.notEqual(laUsa, 121);
});

test("⚠ si transportul lor se pierdea, prin pragul de livrare gratuita al magazinului", () => {
  /*
   * A doua cale de stricare, si mai tacuta decat prima: pragul e al magazinului, iar comanda de
   * marketplace n-a trecut niciodata prin el. O comanda de 250 cu transport de 19,99 incasat de
   * ei iesea din editare cu transport zero.
   */
  const r = recalculeazaTotal({
    subtotal: 250, extras: 0, discount: 0, cardDiscount: 0, codDiscount: 0,
    codFee: 0, shipping: 19.99, freeShippingThreshold: 200,
    vat: { vat_enabled: true, vat_rate: 21, prices_include_vat: true },
  });
  assert.equal(r.shipping, 0, "pragul nu mai zeroeaza transportul — proba nu mai apara nimic");
  assert.equal(r.total, 250);
});

test("⚠ dupa reparatie, factura comenzii neatinse iese pe fix suma incasata", () => {
  /*
   * Comanda ramane cum a venit, deci facturarea o citeste cu regimul ei inghetat si liniile ei
   * brute. Asta e capatul pe care il apara toata poarta.
   */
  const comanda = { total: 121, vat_amount: 21, vat_rate: 21, prices_include_vat: true };
  const regim = invoiceVat(comanda, MAGAZIN_NET);
  assert.equal(regim.taxIncluded, true);
  assert.equal(
    reconciliazaComanda(liniiSmartbill([{ quantity: 1, price: 121 }]), comanda, regim).fel,
    "exact",
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   POARTA, IN SURSA
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE APARA SI CE NU: `updateOrderDetails` cere sesiune, baza si catalog viu, deci purtarea
   ei nu se poate rula aici. Cifrele de mai sus sunt insa reale — sunt chiar ale motorului pe
   care il cheama ea. Ce se cere mai jos e ca poarta sa EXISTE si sa taie exact ce trebuie.
*/

const SURSA = readFileSync("src/lib/actions/order.actions.ts", "utf8");
const FARA_COMENTARII = SURSA.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

test("⚠ pe o comanda de marketplace nu se adauga marfa si nu se schimba transportul", () => {
  /*
   * ⚠ CE ERA INAINTE: poarta oprea doar MODIFICAREA liniilor. Adaugarea trecea, iar comentariul
   * de langa ea chiar spunea ca „pentru marketplace adaugarea merge mai departe".
   *
   * Comanda platita cu cardul la Pepita, 200 de lei; comerciantul adauga un produs de 50; Edinio
   * spune 250, Pepita spune 200, incasati raman 200. Nu exista niciun capat prin care sa se mai
   * ceara diferenta: feedul merge intr-o singura directie si comanda o tine marketplace-ul.
   */
  assert.match(
    FARA_COMENTARII, /if \(marketplace && \(cereAdaugari \|\| cereTransport\)\)/,
    "adaugarea de marfa si recotarea transportului au redevenit posibile pe o comanda de marketplace",
  );
});

test("⚠ si niciun camp de bani nu pleaca la scriere pentru o comanda de marketplace", () => {
  /*
   * ⚠ ASTA E MIEZUL, si e partea pe care garda de mai sus n-o acopera: chiar si o salvare care
   * NU cere nimic — doar telefonul schimbat — trecea prin motorul financiar si scria inapoi
   * `total`, `vat_amount`, `vat_rate`, `shipping_cost`, `cod_fee_amount`.
   *
   * ⚠ SI DE CE MERGE ASA: `editeaza_comanda_atomic` aplica fiecare camp cu
   * `coalesce(p_patch->>'x', x)`. Cheia care lipseste din sarcina NU sterge coloana, o lasa
   * exact cum era. Deci poarta se poate pune in aplicatie, si nu in SQL.
   */
  assert.match(
    FARA_COMENTARII, /const banii = marketplace \? \{\} : \{/,
    "campurile de bani nu mai sunt taiate pentru comenzile de marketplace",
  );

  /* Toate opt trebuie sa fie INAUNTRUL lui `banii`, nu langa el. */
  const i = FARA_COMENTARII.indexOf("const banii = marketplace");
  assert.ok(i > 0);
  const bloc = FARA_COMENTARII.slice(i, FARA_COMENTARII.indexOf("};", i));
  for (const camp of [
    "items", "subtotal", "shipping_cost", "cod_fee_amount",
    "vat_amount", "vat_rate", "prices_include_vat", "total",
  ]) {
    assert.match(bloc, new RegExp(`\\b${camp}:`), `„${camp}" a iesit din blocul taiat`);
  }

  /* Si sarcina chiar il foloseste, o singura data, prin raspandire. */
  assert.equal(
    (FARA_COMENTARII.match(/\.\.\.banii,/g) ?? []).length, 1,
    "blocul de bani nu mai ajunge in sarcina de scriere, sau ajunge de doua ori",
  );
});

test("⚠ Pepita Delivery: datele destinatarului nu se corecteaza local", () => {
  /*
   * Eticheta e deja facuta de ei, pentru adresa din comanda lor. Schimbata in Edinio, panoul ar
   * arata adresa noua si coletul ar pleca la cea veche — iar comerciantul ar avea toate motivele
   * sa creada ca a corectat-o.
   */
  /*
   * ⚠ PRIN HELPERUL COMUN, NU PRIN STEAGUL CRUD.
   *
   * Comenzile intrate INAINTE ca `livrare_pepita` sa existe poarta doar `pepita_delivery_mode`.
   * Prima varianta a portii citea strict `livrare_pepita === true`, deci ele treceau — desi
   * eticheta lor e tot a Pepitei, si coletul tot dupa ea pleaca. AWB-ul propriu si loturile
   * foloseau deja helperul; editorul nu.
   */
  assert.match(
    FARA_COMENTARII, /const livrarePepita = livrareaEDusaDeMarketplace\(order\.order_source\);/,
    "poarta Pepita Delivery nu mai trece prin helperul comun, deci comenzile vechi scapa",
  );
  /* Si helperul chiar stie sa raspunda pentru amandoua formele. */
  assert.equal(livrareaEDusaDeMarketplace({ livrare_pepita: true }), true);
  assert.equal(
    livrareaEDusaDeMarketplace({ marketplace: "pepita", pepita_delivery_mode: "gls_parcellocker" }), true,
    "comanda veche, cu doar `pepita_delivery_mode`, nu mai e recunoscuta ca Pepita Delivery",
  );
  /* ⚠ Si NU raspunde da pentru o comanda Pepita obisnuita, unde expediaza comerciantul. */
  assert.equal(livrareaEDusaDeMarketplace({ marketplace: "pepita" }), false);
  assert.equal(livrareaEDusaDeMarketplace({ livrare_pepita: false, pepita_delivery_mode: "gls" }), false);
  const i = FARA_COMENTARII.indexOf("const livrarePepita");
  assert.ok(i > 0);
  const bloc = FARA_COMENTARII.slice(i, i + 1200);
  /* Se compara TOATE campurile care pot sta pe eticheta. */
  for (const camp of ["name", "phone", "customer_email", "address", "city", "county", "postal_code"]) {
    assert.match(bloc, new RegExp(camp), `„${camp}" nu mai e comparat, deci se poate schimba tacut`);
  }
  /*
   * ⚠ MESAJUL SPUNE UNDE SE FACE, dar NU promite un mecanism pe care ei nu-l documenteaza.
   *
   * Documentatia lor descrie transmiterea intr-o singura directie, iar „Resend order" ca pe o
   * reincercare dupa un esec tehnic — nu ca pe o cale de editare a unei comenzi deja trimise.
   * Noi suntem pregatiti daca sarcina vine schimbata (datele si eticheta se rescriu), dar asta e
   * partea NOASTRA: scrisa pe ecran ca o garantie, ar fi un sfat care se poate sa nu se tina.
   */
  assert.match(bloc, /Pepita Admin/, "mesajul nu mai spune unde se face corectura");
  assert.doesNotMatch(
    bloc, /apasă „Resend order|apasa „Resend order/,
    "mesajul promite din nou „Resend order” ca pe o cale garantata de resincronizare",
  );
});

test("⚠ daca sarcina vine SCHIMBATA, o preluam — destinatar si eticheta deopotriva", () => {
  /*
   * ═══ ⚠ CE APARA, SI CE NU PROMITE ═══
   *
   * Documentatia lor descrie transmiterea intr-o singura directie, iar „Resend order" ca pe o
   * reincercare dupa un esec tehnic — nu ca pe o cale de editare a unei comenzi deja trimise.
   * Deci proba asta NU spune ca resincronizarea exista la ei. Spune ca, DACA sarcina vine
   * schimbata, noi o luam corect: si datele destinatarului, si eticheta.
   *
   * ⚠ SI CELE DOUA TREBUIE SA MEARGA IMPREUNA. Ziua in care am facut una fara alta, comanda a
   * ajuns cu adresa noua pe ecran si cu eticheta veche in imprimanta — coletul pleaca dupa
   * eticheta. Doua reparatii bune, care puse una fara alta fac o paguba noua.
   */
  const ingest = readFileSync("src/lib/pepita/ingest.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
  assert.match(ingest, /async function improspateazaDestinatarul\(/);
  /* ⚠ Si numai la Pepita Delivery: pe celelalte comenzi corectura din panou e chiar calea buna,
     iar rescrisa la fiecare retrimitere ar fi stearsa. */
  assert.match(ingest, /if \(esteLivrarePepita\(c\.modLivrare\)\) \{\s*await improspateazaDestinatarul\(/);
  /* Rescrie chiar cele patru campuri care conteaza, si imbina adresa in loc s-o inlocuiasca. */
  const i = ingest.indexOf("async function improspateazaDestinatarul");
  const corp = ingest.slice(i, ingest.indexOf(String.fromCharCode(10) + "}", i));
  for (const camp of ["customer_name", "customer_phone", "customer_email", "shipping_address"]) {
    assert.match(corp, new RegExp(camp), `„${camp}" nu se mai reimprospateaza`);
  }
  assert.match(corp, /\.\.\.prev,/, "adresa se inlocuieste, deci se pierd cheile puse de noi peste ea");

  /* ⚠ SI ETICHETA, in aceeasi trecere: comparata pe CONTINUT, ca una noua sa o inlocuiasca pe
     cea veche. Fara randul asta, adresa s-ar reimprospata iar PDF-ul ar ramane cel vechi. */
  assert.match(ingest, /const sha = createHash\("sha256"\)\.update\(citita\.octeti\)/);
  assert.match(ingest, /if \(shaCunoscut && shaCunoscut === sha\)/);
});

test("⚠ `editeaza_comanda_atomic` chiar scrie regimul de pret", () => {
  /*
   * ⚠ O SCRIERE CARE NU SCRIA. Aplicatia trimitea `prices_include_vat` in `p_patch` de la
   * reparatia de ieri, iar functia din baza nu-l avea in lista de `SET`: campul nu ajungea
   * nicaieri, si codul arata exact ca unul care merge.
   *
   * Conteaza pe comanda din magazin plasata cand preturile erau FARA TVA si editata dupa ce
   * comerciantul a trecut magazinul pe preturi CU TVA: totalul se resocoteste brut, semnul ar fi
   * ramas „net", iar facturarea ar fi refuzat documentul.
   */
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  const i = baseline.indexOf("CREATE OR REPLACE FUNCTION public.editeaza_comanda_atomic");
  assert.notEqual(i, -1, "functia a disparut din baseline");
  const corp = baseline.slice(i, baseline.indexOf("$function$", baseline.indexOf("$function$", i) + 10));
  assert.match(
    corp, /prices_include_vat = coalesce\(\(p_patch->>'prices_include_vat'\)::boolean, prices_include_vat\)/,
    "regimul de pret nu se mai scrie din editare",
  );
});
