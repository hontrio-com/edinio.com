import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  coletDeTrimisInapoi, idCererii, idPachetului, liniileReturului, nuSeTrimiteInapoi,
} from "./retur-forma";
import type { TrendyolClaim } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   LINIILE RETURULUI ERAU CU UN NIVEL MAI ADANC DECAT LE CITEAM (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Referinta lor (`getClaims`) spune ca `items[]` NU sunt liniile:

     claim
     └── items[]
         ├── orderLine   { id, productName, barcode, merchantSku, price, ... }
         └── claimItems[]{ id, orderLineItemId, customerClaimItemReason,
                           trendyolClaimItemReason, claimItemStatus, customerNote, ... }

   Noi luam `items[]` drept linii si ceream `id`-ul de acolo. Pe forma lor, acel `id` nu
   exista — deci fiecare linie ar fi fost sarita, iar returul ar fi aparut in panou cu ZERO
   produse. Ar fi aratat complet, si ar fi fost gol.

   ⚠ SI DE-AIA PROBA ASTA CHEAMA FUNCTIA, nu scaneaza sursa. Probele de pana acum se uitau la
   text si treceau verzi peste chiar defectul asta: ele confirmau ca scrie `l.barcode`, nu ca
   `l.barcode` are ce citi.

   ⚠ Tiparul de mai jos e copiat ca STRUCTURA din referinta lor, fiindca forma vie n-a putut fi
   masurata: ambele conturi au zero cereri de retur (probat pe API-ul lor, 200 cu
   `content: null` pe orice fereastra si orice stare).
*/

/** Cum arata un retur in referinta lor. */
const CA_LA_EI = {
  id: "1a2b3c",
  claimId: "1a2b3c",
  orderNumber: "TY-8899",
  claimDate: 1756150000000,
  orderShipmentPackageId: 776655,
  status: "WaitingInAction",
  items: [
    {
      orderLine: {
        id: 991,
        productName: "Carnilove Cat Freeze Dried Beef 40 g",
        barcode: "8595602540280",
        merchantSku: "CRN-40",
        price: 24.9,
      },
      claimItems: [
        {
          id: "ci-1", orderLineItemId: 991,
          customerClaimItemReason: { name: "Ürün beklediğim gibi değil" },
          claimItemStatus: { name: "WaitingInAction" },
          customerNote: "Pisica nu l-a mancat",
        },
        {
          id: "ci-2", orderLineItemId: 991,
          customerClaimItemReason: { name: "Ürün beklediğim gibi değil" },
          claimItemStatus: { name: "WaitingInAction" },
        },
      ],
    },
  ],
} as unknown as TrendyolClaim;

test("⚠ liniile se scot din items[].claimItems[], nu din items[]", () => {
  const linii = liniileReturului(CA_LA_EI);
  assert.equal(linii.length, 2, "ambele bucati, nu zero");
  assert.deepEqual(linii.map((l) => l.claimItemId), ["ci-1", "ci-2"]);
});

test("⚠ codul de bare si numele vin din orderLine, nu din bucata", () => {
  /* Bucata spune CATE si DE CE; produsul il spune linia de comanda. Fara imprumutul asta,
     repunerea in stoc n-are de ce sa se agate si returul e nefolositor. */
  const [a, b] = liniileReturului(CA_LA_EI);
  assert.equal(a.barcode, "8595602540280");
  assert.equal(b.barcode, "8595602540280", "si a doua bucata, din acelasi invelis");
  assert.equal(a.numeProdus, "Carnilove Cat Freeze Dried Beef 40 g");
  assert.equal(a.orderLineId, "991");
});

test("⚠ o bucata inseamna UNA, fiindca ei n-au camp de cantitate", () => {
  /*
   * Un retur de trei bucati vine ca trei elemente cu id-uri diferite. Daca am fi citit un
   * `quantity` inexistent si l-am fi tratat ca „toata linia", repunerea in stoc ar fi adaugat
   * de trei ori cate trei.
   */
  const linii = liniileReturului(CA_LA_EI);
  assert.deepEqual(linii.map((l) => l.cantitate), [1, 1]);
});

test("⚠ motivul si nota se iau de pe bucata, si lipsa notei nu strica linia", () => {
  const [a, b] = liniileReturului(CA_LA_EI);
  assert.equal(a.motiv, "Ürün beklediğim gibi değil");
  assert.equal(a.notaClient, "Pisica nu l-a mancat");
  assert.equal(b.notaClient, null, "fara nota, linia ramane intreaga");
  assert.equal(a.stare, "WaitingInAction");
});

test("⚠ `orderShipmentPackageId`, nu `shipmentPackageId`", () => {
  /* Al doilea nu exista in raspunsul lor: citindu-l ieseam mereu cu gol, si fara nicio eroare. */
  assert.equal(idPachetului(CA_LA_EI), 776655);
  assert.equal(idPachetului({} as TrendyolClaim), null);
  /* Vechiul nume se citeste totusi, daca vreo vitrina il mai da. */
  assert.equal(idPachetului({ shipmentPackageId: 42 } as TrendyolClaim), 42);
});

test("⚠ si forma plata se citeste, fiindca n-am putut masura care vine", () => {
  /*
   * Cand n-ai cum sa masori, citesti si ce scrie in hartie, si ce ai presupus — nu alegi una
   * si speri. Costul e cateva randuri; costul alegerii gresite ar fi fost un ecran gol.
   */
  const plat = {
    id: "c-2",
    items: [{ id: "flat-1", barcode: "111", productName: "Ceva", quantity: 3 }],
  } as unknown as TrendyolClaim;
  const linii = liniileReturului(plat);
  assert.equal(linii.length, 1);
  assert.equal(linii[0].claimItemId, "flat-1");
  assert.equal(linii[0].barcode, "111");
  /* ⚠ Aici `quantity` CHIAR exista, deci se citeste. */
  assert.equal(linii[0].cantitate, 3);
});

test("⚠ o bucata fara id se sare, dar nu darama restul returului", () => {
  const stricat = {
    id: "c-3",
    items: [{
      orderLine: { barcode: "222" },
      claimItems: [{ customerNote: "fara id" }, { id: "bun-1" }],
    }],
  } as unknown as TrendyolClaim;
  const linii = liniileReturului(stricat);
  assert.deepEqual(linii.map((l) => l.claimItemId), ["bun-1"]);
});

test("⚠ aceeasi bucata nu intra de doua ori", () => {
  /* Ei dau uneori si `items[]`, si `claimItems[]` pe cerere. Numarate de doua ori, repunerea
     in stoc ar fi dublat marfa. */
  const dublu = {
    id: "c-4",
    items: [{ orderLine: { barcode: "333" }, claimItems: [{ id: "x1" }] }],
    claimItems: [{ id: "x1", barcode: "333" }],
  } as unknown as TrendyolClaim;
  assert.equal(liniileReturului(dublu).length, 1);
});

test("⚠ id-ul cererii se citeste si ca `id`, si ca `claimId`", () => {
  assert.equal(idCererii(CA_LA_EI), "1a2b3c");
  assert.equal(idCererii({ claimId: "doar-asta" } as TrendyolClaim), "doar-asta");
  assert.equal(idCererii({} as TrendyolClaim), null);
});

test("⚠ „respins” nu inseamna „gata”: coletul se poate intoarce la CLIENT", () => {
  /*
   * ═══ ⚠ TREI STARI, NU DOUA (26.08.2026) ═══
   *
   * Regula lor, verbatim: „If `dontShipBack: true`: You do not need to ship the package back to
   * the customer. If `dontShipBack: false`: You must ship the package back to the customer only
   * if your rejection request has been accepted by Trendyol."
   *
   * ⚠ SI INTREG `rejectedPackageInfo` LIPSESTE cand nu s-a creat un colet de retur-respins.
   * Documentatia lor o spune pe fata: „If there is no return rejection package, this field will
   * not appear." Deci ABSENTA nu e „false".
   *
   * Un `?.dontShipBack ?? false` ar fi turnat prima stare peste a treia — adica i-ar fi spus
   * comerciantului „ai de trimis un colet" la fiecare retur respins, inclusiv unde nu exista
   * niciunul. Iar o alarma care suna mereu inceteaza sa fie citita.
   */
  const faraColet = { id: "c-1" } as unknown as TrendyolClaim;
  assert.equal(nuSeTrimiteInapoi(faraColet), null, "absenta NU e false");
  assert.equal(coletDeTrimisInapoi(faraColet), null);

  const nuTrimite = {
    id: "c-2",
    rejectedPackageInfo: { packageId: 92248304, dontShipBack: true },
  } as unknown as TrendyolClaim;
  assert.equal(nuSeTrimiteInapoi(nuTrimite), true);

  /* Tiparul e copiat ca structura din exemplul lor: AWB-ul vine NUMERIC. */
  const trimite = {
    id: "c-3",
    rejectedPackageInfo: {
      cargoTrackingNumber: 2207284754,
      packageId: 92248304,
      cargoProviderName: "FANCOURIER",
      cargoTrackingLink: "https://stage-tracking.trendyol.com/?trackingId=x",
      items: ["26889877-203a-468a-abb8-6b8e05497c0b"],
      dontShipBack: false,
      sellerOtp: "234433",
    },
  } as unknown as TrendyolClaim;
  assert.equal(nuSeTrimiteInapoi(trimite), false);
  assert.equal(coletDeTrimisInapoi(trimite)?.cargoProviderName, "FANCOURIER");
  assert.equal(coletDeTrimisInapoi(trimite)?.sellerOtp, "234433");

  /* ⚠ Un colet exista, dar fara steag: tot necunoscut, nu „trimite". */
  const faraSteag = { id: "c-4", rejectedPackageInfo: { packageId: 1 } } as unknown as TrendyolClaim;
  assert.equal(nuSeTrimiteInapoi(faraSteag), null);
});

test("⚠ ecranul vorbeste numai cand chiar e ceva de facut", () => {
  const ui = readFileSync("src/components/dashboard/TrendyolReturns.tsx", "utf8");
  /* Numai `false` SI colet existent aduce avertismentul. */
  assert.match(ui, /r\.nuTrimiteInapoi === false && r\.coletRespins/);
  assert.match(ui, /Mai ai de trimis coletul înapoi clientului/);
  /* Si `true` se spune, scurt, ca sa se vada ca s-a incheiat. */
  assert.match(ui, /r\.nuTrimiteInapoi === true/);
  assert.match(ui, /Nu trebuie să trimiți nimic înapoi clientului/);
});
