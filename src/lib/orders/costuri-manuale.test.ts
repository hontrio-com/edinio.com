import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  COSTURI_ADAUGATE_MAX,
  FARA_COSTURI,
  NUME_COST_MAX,
  PREFIX_COST_MANUAL,
  SUMA_MAXIMA,
  cereCosturi,
  citesteCosturile,
  esteCostManual,
  etichetaExtraoptiunilor,
  liniiDeCost,
  numeleCostului,
  scadeTva,
  socotesteEditarea,
  taxaRambursDupaEditare,
  type ComandaDeSocotit,
  type CosturiCerute,
  type IntrareSocoteala,
} from "./costuri-manuale";
import { codExtraoptiune, esteIdExtra } from "./extras";
import { sumaExtraoptiunilor } from "./edit-pricing";
import { totaluriComanda } from "./totals-box";

/*
 * Costurile editabile din „Editeaza comanda” (25.11.2026): transportul, taxa de plata ramburs,
 * reducerea, costurile suplimentare si „Scade TVA”.
 *
 * Cifrele de plecare sunt ale comenzii #1333 din baza demo, cea pe care s-a probat si in browser:
 * marfa 119, o extraoptiune de 15, taxa de ramburs 9,99, transport 19,99, TVA 21% inclus, total
 * 163,98 cu 28,46 TVA.
 */

const TVA_INCLUS = { vat_enabled: true, vat_rate: 21, prices_include_vat: true };
const TVA_PESTE = { vat_enabled: true, vat_rate: 21, prices_include_vat: false };

function intrare(
  peste: Omit<Partial<IntrareSocoteala>, "costuri" | "comanda"> & {
    costuri?: Partial<CosturiCerute>;
    comanda?: Partial<ComandaDeSocotit>;
  } = {},
): IntrareSocoteala {
  const { costuri, comanda, ...rest } = peste;
  return {
    comanda: {
      subtotal: 119, discount: 0, cardDiscount: 0, codDiscount: 0, codFee: 9.99, shipping: 19.99,
      transportManual: false, ...comanda,
    },
    extrasVechi: 15,
    deltaSubtotal: 0,
    extrasPlan: 15,
    costuri: { ...FARA_COSTURI, ...costuri },
    transportCotat: null,
    taxaProcentuala: false,
    pragTransportGratuit: null,
    vat: TVA_INCLUS,
    ...rest,
  };
}

describe("citirea cererii", () => {
  test("lipsa cererii inseamna ca nu se schimba nimic", () => {
    assert.deepEqual(citesteCosturile(undefined), FARA_COSTURI);
    assert.deepEqual(citesteCosturile(null), FARA_COSTURI);
    assert.deepEqual(citesteCosturile({}), FARA_COSTURI);
    assert.equal(cereCosturi(FARA_COSTURI), false);
  });

  test("sumele se rotunjesc la ban, iar zero e o cerere (scoate transportul), nu o lipsa", () => {
    const c = citesteCosturile({ transport: 0, taxa_ramburs: 4.996, reducere: 10.004 });
    assert.deepEqual(c, { transport: 0, taxaRamburs: 5, reducere: 10, adaugate: [] });
    assert.equal(cereCosturi(c as CosturiCerute), true);
  });

  test("`null` pe un camp inseamna tot „neatins”", () => {
    assert.deepEqual(citesteCosturile({ transport: null, reducere: 12 }), { ...FARA_COSTURI, reducere: 12 });
  });

  test("⚠ un sir, un numar negativ, infinit sau peste plafon se REFUZA, nu se citesc ca zero", () => {
    for (const rau of ["", "12", -1, Number.NaN, Number.POSITIVE_INFINITY, SUMA_MAXIMA + 1, true, {}]) {
      for (const camp of ["transport", "taxa_ramburs", "reducere"]) {
        const r = citesteCosturile({ [camp]: rau });
        assert.ok("error" in r, `${camp} = ${String(rau)} a trecut`);
      }
    }
    assert.match((citesteCosturile({ transport: -1 }) as { error: string }).error, /^Transportul trebuie să fie o sumă/);
    assert.match((citesteCosturile({ reducere: "5" }) as { error: string }).error, /^Reducerea trebuie/);
  });

  test("o cerere care nu e obiect se refuza", () => {
    for (const rau of ["x", 5, [], true]) assert.ok("error" in citesteCosturile(rau));
  });

  test("costurile adaugate: denumirea se curata, suma se rotunjeste", () => {
    const c = citesteCosturile({ adaugate: [{ nume: "  Taxă   de\turgență \n", suma: 25.004 }] });
    assert.deepEqual(c, { ...FARA_COSTURI, adaugate: [{ nume: "Taxă de urgență", suma: 25 }] });
    assert.equal(numeleCostului(`a${String.fromCharCode(0)}b${String.fromCharCode(31)}c`), "a b c");
    assert.equal(numeleCostului(42), "");
  });

  test("⚠ un cost fara denumire, cu denumire prea lunga sau fara suma se refuza", () => {
    assert.ok("error" in citesteCosturile({ adaugate: [{ nume: "   ", suma: 10 }] }));
    assert.ok("error" in citesteCosturile({ adaugate: [{ suma: 10 }] }));
    assert.ok("error" in citesteCosturile({ adaugate: [{ nume: "x".repeat(NUME_COST_MAX + 1), suma: 10 }] }));
    assert.ok(!("error" in citesteCosturile({ adaugate: [{ nume: "x".repeat(NUME_COST_MAX), suma: 10 }] })));
    /* Zero nu e un cost: linia ar ajunge pe factura fara sa schimbe nimic. */
    assert.ok("error" in citesteCosturile({ adaugate: [{ nume: "Montaj", suma: 0 }] }));
    assert.ok("error" in citesteCosturile({ adaugate: [{ nume: "Montaj" }] }));
    assert.ok("error" in citesteCosturile({ adaugate: [{ nume: "Montaj", suma: "10" }] }));
    assert.ok("error" in citesteCosturile({ adaugate: [null] }));
    assert.ok("error" in citesteCosturile({ adaugate: "Montaj" }));
  });

  test("cel mult zece costuri intr-o salvare", () => {
    const multe = Array.from({ length: COSTURI_ADAUGATE_MAX + 1 }, (_, i) => ({ nume: `Cost ${i}`, suma: 1 }));
    assert.ok("error" in citesteCosturile({ adaugate: multe }));
    assert.ok(!("error" in citesteCosturile({ adaugate: multe.slice(1) })));
  });
});

describe("linia unui cost suplimentar", () => {
  test("e o extraoptiune cu cele patru chei ale unei linii obisnuite si cantitatea 1", () => {
    const linii = liniiDeCost([{ nume: "Montaj", suma: 80 }, { nume: "Taxă de urgență", suma: 25 }], ["a1b2c3d4", "e5f6a7b8"]);
    assert.deepEqual(linii, [
      { product_id: "extra_manual_a1b2c3d4", name: "Montaj", price: 80, quantity: 1 },
      { product_id: "extra_manual_e5f6a7b8", name: "Taxă de urgență", price: 25, quantity: 1 },
    ]);
    assert.equal(PREFIX_COST_MANUAL, "extra_manual_");
    assert.ok(esteCostManual(linii[0].product_id));
    /* ⚠ Tot ce citeste banii comenzii o recunoaste dupa prefixul comun. */
    assert.ok(esteIdExtra(linii[0].product_id));
    assert.equal(sumaExtraoptiunilor(linii), 105);
    /* Pe factura, doua costuri de pe aceeasi comanda au coduri de articol diferite. */
    assert.notEqual(codExtraoptiune(linii[0].product_id), codExtraoptiune(linii[1].product_id));
  });

  test("extraoptiunea aleasa de client la comanda NU e cost pus de mana", () => {
    assert.equal(esteCostManual("extra_ambalaj"), false);
    assert.equal(esteCostManual(null), false);
  });

  test("fara id nu se scrie nicio linie", () => {
    assert.throws(() => liniiDeCost([{ nume: "Montaj", suma: 80 }], []));
  });

  test("randul din caseta de totaluri isi spune numele dupa ce aduna", () => {
    const produs = { product_id: "0b7a6f52-3c1d-4e8f-9a2b-1c3d5e7f9a0b", name: "Vază", price: 119, quantity: 1 };
    const ambalaj = { product_id: "extra_ambalaj", name: "Ambalaj cadou", price: 15, quantity: 1 };
    const [montaj] = liniiDeCost([{ nume: "Montaj", suma: 80 }], ["a1b2c3d4"]);
    assert.equal(etichetaExtraoptiunilor([produs, ambalaj]), "Opțiuni extra");
    assert.equal(etichetaExtraoptiunilor([produs, montaj]), "Costuri suplimentare");
    assert.equal(etichetaExtraoptiunilor([produs, ambalaj, montaj]), "Opțiuni extra și costuri suplimentare");
    /* Fara linii de felul asta randul nici nu se arata; eticheta ramane cea de dinainte. */
    assert.equal(etichetaExtraoptiunilor([produs]), "Opțiuni extra");
    assert.equal(etichetaExtraoptiunilor(null), "Opțiuni extra");
  });
});

describe("taxa de plata ramburs", () => {
  const baza = { taxaVeche: 9.99, bazaVeche: 134, bazaNoua: 134, procentuala: true };

  test("suma scrisa de comerciant bate tot, si zero e o suma", () => {
    assert.equal(taxaRambursDupaEditare({ ...baza, ceruta: 0 }), 0);
    assert.equal(taxaRambursDupaEditare({ ...baza, ceruta: 5, bazaNoua: 500 }), 5);
  });

  test("procentuala se scaleaza cu baza; fixa nu se misca", () => {
    assert.equal(taxaRambursDupaEditare({ ...baza, ceruta: null, bazaNoua: 114 }), 8.5);
    assert.equal(taxaRambursDupaEditare({ ...baza, ceruta: null, bazaNoua: 114, procentuala: false }), 9.99);
    assert.equal(taxaRambursDupaEditare({ ...baza, ceruta: null }), 9.99);
  });

  test("⚠ o taxa scoasa de comerciant nu reapare singura la editarea urmatoare", () => {
    assert.equal(taxaRambursDupaEditare({ ...baza, ceruta: null, taxaVeche: 0, bazaNoua: 500 }), 0);
  });
});

describe("socoteala comenzii dupa editare", () => {
  test("fara nicio cerere, totalul e exact cel dinainte", () => {
    const s = socotesteEditarea(intrare());
    assert.deepEqual(
      { total: s.total, tva: s.vatAmount, transport: s.shipping, taxa: s.codFee, reducere: s.discount, extras: s.extras },
      { total: 163.98, tva: 28.46, transport: 19.99, taxa: 9.99, reducere: 0, extras: 15 },
    );
    assert.equal(s.transportManual, false);
  });

  test("transportul scos: totalul scade cu el, iar TVA-ul se resocoteste", () => {
    const s = socotesteEditarea(intrare({ costuri: { transport: 0 } }));
    assert.equal(s.shipping, 0);
    assert.equal(s.total, 143.99);
    assert.equal(s.vatAmount, 24.99);
    assert.equal(s.transportManual, true);
  });

  test("⚠ transportul pus de mana nu se mai judeca dupa pragul de livrare gratuita", () => {
    /* Marfa (119) e peste prag (100): fara cerere, regula de dinainte il face gratuit. */
    assert.equal(socotesteEditarea(intrare({ pragTransportGratuit: 100 })).shipping, 0);

    const pus = socotesteEditarea(intrare({ pragTransportGratuit: 100, costuri: { transport: 30 } }));
    assert.equal(pus.shipping, 30);
    assert.equal(pus.transportManual, true);
    assert.equal(pus.total, 173.99);

    /* Editarea URMATOARE (doar un telefon corectat): comanda tine minte, suma ramane. */
    const dupa = socotesteEditarea(intrare({
      pragTransportGratuit: 100,
      comanda: { subtotal: 119, discount: 0, cardDiscount: 0, codDiscount: 0, codFee: 9.99, shipping: 30, transportManual: true },
    }));
    assert.equal(dupa.shipping, 30);
    assert.equal(dupa.transportManual, true);
    assert.equal(dupa.total, 173.99);
  });

  test("o cotatie noua aplicata ia locul transportului pus de mana si readuce pragul", () => {
    const comanda = { subtotal: 119, discount: 0, cardDiscount: 0, codDiscount: 0, codFee: 9.99, shipping: 30, transportManual: true };
    const sub = socotesteEditarea(intrare({ comanda, transportCotat: 24.5, pragTransportGratuit: 300 }));
    assert.equal(sub.shipping, 24.5);
    assert.equal(sub.transportManual, false);
    const peste = socotesteEditarea(intrare({ comanda, transportCotat: 24.5, pragTransportGratuit: 100 }));
    assert.equal(peste.shipping, 0);
  });

  test("suma scrisa de comerciant bate si cotatia", () => {
    const s = socotesteEditarea(intrare({ transportCotat: 24.5, costuri: { transport: 12 } }));
    assert.equal(s.shipping, 12);
    assert.equal(s.transportManual, true);
  });

  test("reducerea scrisa e reducerea TOATA de pe comanda", () => {
    const cuCupon = { subtotal: 119, discount: 10, cardDiscount: 0, codDiscount: 0, codFee: 9.99, shipping: 19.99, transportManual: false };
    assert.equal(socotesteEditarea(intrare({ comanda: cuCupon })).total, 153.98);
    const s = socotesteEditarea(intrare({ comanda: cuCupon, costuri: { reducere: 20 } }));
    assert.equal(s.discount, 20);
    assert.equal(s.total, 143.98);
    /* Reducerea scoasa cu totul. */
    assert.equal(socotesteEditarea(intrare({ comanda: cuCupon, costuri: { reducere: 0 } })).total, 163.98);
  });

  test("taxa procentuala urmeaza baza micsorata de reducere, cea fixa ramane", () => {
    assert.equal(socotesteEditarea(intrare({ costuri: { reducere: 20 } })).codFee, 9.99);
    const s = socotesteEditarea(intrare({ taxaProcentuala: true, costuri: { reducere: 20 } }));
    assert.equal(s.codFee, 8.5);
    assert.equal(s.total, 142.49);
  });

  test("un cost suplimentar intra la extraoptiuni, deci in total si in baza de TVA, nu in subtotal", () => {
    const s = socotesteEditarea(intrare({ costuri: { adaugate: [{ nume: "Montaj", suma: 25 }] } }));
    assert.equal(s.subtotal, 119);
    assert.equal(s.extras, 40);
    assert.equal(s.total, 188.98);
    assert.equal(s.vatAmount, 32.8);
  });

  test("taxa de ramburs scoasa", () => {
    const s = socotesteEditarea(intrare({ taxaProcentuala: true, costuri: { taxaRamburs: 0 } }));
    assert.equal(s.codFee, 0);
    assert.equal(s.total, 153.99);
  });

  test("totul deodata, peste o editare care scoate si marfa", () => {
    const s = socotesteEditarea(intrare({
      deltaSubtotal: -19,
      extrasPlan: 0,
      costuri: { transport: 0, taxaRamburs: 0, reducere: 10, adaugate: [{ nume: "Montaj", suma: 40 }] },
    }));
    assert.deepEqual(
      { subtotal: s.subtotal, extras: s.extras, total: s.total },
      { subtotal: 100, extras: 40, total: 130 },
    );
  });

  test("⚠ caseta de totaluri de pe pagina comenzii se inchide pe cifrele scrise", () => {
    const s = socotesteEditarea(intrare({
      costuri: { transport: 0, reducere: 12.5, adaugate: [{ nume: "Montaj", suma: 40 }] },
    }));
    const items = [
      { product_id: "0b7a6f52-3c1d-4e8f-9a2b-1c3d5e7f9a0b", name: "Vază", price: 119, quantity: 1 },
      { product_id: "extra_ambalaj", name: "Ambalaj cadou", price: 15, quantity: 1 },
      ...liniiDeCost([{ nume: "Montaj", suma: 40 }], ["a1b2c3d4"]),
    ];
    const caseta = totaluriComanda({
      items, subtotal: s.subtotal, shippingCost: s.shipping, discountAmount: s.discount,
      cardDiscount: s.cardDiscount, codDiscount: s.codDiscount, codFee: s.codFee,
      vatAmount: s.vatAmount, vatRate: 21, regimInghetat: true, total: s.total,
      setariTva: { vat_enabled: true, prices_include_vat: true },
    });
    assert.equal(caseta.diferenta, 0);
    assert.equal(caseta.extras, 55);
    assert.equal(caseta.total, s.total);
  });
});

describe("„Scade TVA”", () => {
  test("clientul plateste pretul fara TVA: 163,98 devine 135,52", () => {
    const r = scadeTva(intrare());
    assert.deepEqual(r, { reducere: 28.46, taxaRamburs: null });
    const s = socotesteEditarea(intrare({ costuri: { reducere: r!.reducere } }));
    assert.equal(s.total, 135.52);
    assert.equal(s.total, Math.round((163.98 / 1.21) * 100) / 100);
    /* ⚠ E o reducere, nu o scutire: factura ramane cu TVA, socotit la suma redusa. */
    assert.equal(s.vatAmount, 23.52);
  });

  test("⚠ apasat de doua ori da acelasi numar: pleaca de la reducerea SALVATA, nu de la cea tastata", () => {
    const prima = scadeTva(intrare())!;
    const aDoua = scadeTva(intrare({ costuri: { reducere: prima.reducere } }))!;
    assert.deepEqual(aDoua, prima);
  });

  test("se adauga peste cuponul de la plasare", () => {
    const cuCupon = { subtotal: 119, discount: 10, cardDiscount: 0, codDiscount: 0, codFee: 9.99, shipping: 19.99, transportManual: false };
    const r = scadeTva(intrare({ comanda: cuCupon }))!;
    /* Baza e 153,98; TVA-ul din ea e 26,72. */
    assert.equal(r.reducere, 36.72);
    assert.equal(socotesteEditarea(intrare({ comanda: cuCupon, costuri: { reducere: r.reducere } })).total, 127.26);
  });

  test("⚠ taxa procentuala se tine pe loc, altfel totalul ar cadea sub pretul fara TVA", () => {
    const r = scadeTva(intrare({ taxaProcentuala: true }))!;
    assert.deepEqual(r, { reducere: 28.46, taxaRamburs: 9.99 });
    const s = socotesteEditarea(intrare({ taxaProcentuala: true, costuri: { reducere: r.reducere, taxaRamburs: r.taxaRamburs } }));
    assert.equal(s.total, 135.52);
    /* Fara taxa tinuta pe loc, ea s-ar fi micsorat odata cu baza. */
    assert.ok(socotesteEditarea(intrare({ taxaProcentuala: true, costuri: { reducere: r.reducere } })).total < 135.52);
  });

  test("tine cont de ce se schimba in aceeasi editare (transportul scos)", () => {
    const r = scadeTva(intrare({ costuri: { transport: 0 } }))!;
    /* Baza e 143,99; TVA-ul din ea e 24,99. */
    assert.equal(r.reducere, 24.99);
    assert.equal(socotesteEditarea(intrare({ costuri: { transport: 0, reducere: r.reducere } })).total, 119);
  });

  test("la preturi FARA TVA, totalul ajunge la pretul net, cu cel mult un ban langa", () => {
    const net = { subtotal: 100, discount: 0, cardDiscount: 0, codDiscount: 0, codFee: 0, shipping: 0, transportManual: false };
    const p = intrare({ comanda: net, extrasVechi: 0, extrasPlan: 0, vat: TVA_PESTE });
    assert.equal(socotesteEditarea(p).total, 121);
    const r = scadeTva(p)!;
    assert.equal(r.reducere, 17.36);
    const s = socotesteEditarea({ ...p, costuri: { ...FARA_COSTURI, reducere: r.reducere } });
    assert.ok(Math.abs(s.total - 100) <= 0.011, `total ${s.total}`);
  });

  test("pe o plaja de sume, cu TVA inclus, totalul e pretul fara TVA la ban", () => {
    for (let bani = 1_00; bani <= 2_500_00; bani += 7_313) {
      const marfa = bani / 100;
      const comanda = { subtotal: marfa, discount: 0, cardDiscount: 0, codDiscount: 0, codFee: 0, shipping: 0, transportManual: false };
      const p = intrare({ comanda, extrasVechi: 0, extrasPlan: 0 });
      const r = scadeTva(p)!;
      const s = socotesteEditarea({ ...p, costuri: { ...FARA_COSTURI, reducere: r.reducere } });
      assert.ok(Math.abs(s.total - marfa / 1.21) <= 0.0051, `${marfa} -> ${s.total}`);
    }
  });

  test("magazinul neplatitor de TVA n-are ce scadea", () => {
    assert.equal(scadeTva(intrare({ vat: { vat_enabled: false, vat_rate: 21, prices_include_vat: true } })), null);
    assert.equal(scadeTva(intrare({ vat: { vat_enabled: true, vat_rate: 0, prices_include_vat: true } })), null);
  });
});

/*
 * ═══ LEGATURILE: SERVERUL, FUNCTIA DIN BAZA SI FEREASTRA ═══
 *
 * `updateOrderDetails` cere sesiune, baza si catalog viu, deci nu se poate rula aici. Ce se poate
 * apara din sursa sunt hotararile: costurile trec prin aceleasi porti ca marfa, cifra scrisa iese
 * din aceeasi functie ca cifra aratata, iar reducerea chiar ajunge in baza.
 */
describe("costurile sunt legate cap la cap", () => {
  const viu = (cale: string) => readFileSync(cale, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  test("⚠ pe server, costurile trec prin portile banilor: factura, AWB, marketplace", () => {
    const s = viu("src/lib/actions/order.actions.ts");
    assert.match(s, /const costuriCitite = citesteCosturile\(data\.costuri\);\s+if \("error" in costuriCitite\) return \{ error: costuriCitite\.error \};/,
      "o cerere cu forma gresita nu mai e refuzata inainte de porti");
    assert.match(s, /if \(numarFactura && \(cereProduse \|\| cereTransport \|\| cereCosturile\)\)/,
      "costurile se pot schimba peste o factura fiscala emisa");
    assert.match(s, /if \(cereCosturile && areAwb\) \{\s+return \{ error:/,
      "costurile se pot schimba peste un AWB emis: curierul ar incasa rambursul vechi");
    assert.match(s, /if \(marketplace && cereCosturile\) \{\s+return \{ error:/,
      "costurile unei comenzi de marketplace se pot schimba din panou");
  });

  test("⚠ cifra scrisa iese din aceeasi socoteala ca cifra aratata in fereastra", () => {
    const s = viu("src/lib/actions/order.actions.ts");
    assert.match(s, /const socoteala = socotesteEditarea\(\{ \.\.\.intrareSocoteala, transportCotat \}\);\s+const \{ total: newTotal, vatAmount, shipping: newShipping \} = socoteala;/);
    /* Transportul scris de mana bate cotatia: verificarea ei nici nu mai porneste. */
    assert.match(s, /if \(data\.shipping_cost != null && costuri\.transport === null\) \{/);
    /* Comanda tine minte ca transportul e pus de mana; `undefined` sterge cheia la serializare. */
    assert.match(s, /transport_manual: socoteala\.transportManual \? true : undefined,/);

    const fereastra = viu("src/components/dashboard/OrderEditModal.tsx");
    assert.match(fereastra, /const s = socotesteEditarea\(intrareSocoteala\);/);
    assert.doesNotMatch(fereastra, /recalculeazaTotal\(/, "fereastra si-a refacut propria socoteala a totalului");
    assert.match(fereastra, /\.\.\.\(cerereCosturi \? \{ costuri: cerereCosturi \} : \{\}\),/, "costurile nu mai pleaca la server");
    assert.match(fereastra, /\|\| !!costuriDinCampuri\.eroare \|\| costInAsteptare/, "se poate salva cu o suma necitita sau cu un cost neadaugat");
  });

  test("⚠ reducerea pleaca la scriere numai cand a fost schimbata, impreuna cu liniile costurilor", () => {
    const s = viu("src/lib/actions/order.actions.ts");
    const i = s.indexOf("const banii = marketplace");
    assert.ok(i > 0);
    const bloc = s.slice(i, s.indexOf("};", i));
    assert.match(bloc, /items: itemsFinale,/, "liniile costurilor suplimentare nu ajung in comanda");
    assert.match(bloc, /\.\.\.\(costuri\.reducere !== null \? \{ discount_amount: socoteala\.discount \} : null\),/,
      "reducerea se scrie si cand n-a cerut-o nimeni, sau nu se mai scrie deloc");
    assert.match(s, /\[\.\.\.plan\.items, \.\.\.liniiDeCost\(costuri\.adaugate, idsCosturi\)\]/);
  });

  test("⚠ functia din baza chiar scrie reducerea: fara rand, totalul ar ramane peste o reducere veche", () => {
    /*
     * `editeaza_comanda_atomic` aplica fiecare camp cu `coalesce(p_patch->>'x', x)`: o cheie pe care
     * lista de `SET` n-o cunoaste nu da eroare, pur si simplu nu se scrie. Acelasi fel de gaura ca
     * la `prices_include_vat`.
     *
     * ⚠ Se citeste MIGRATIA, nu baseline-ul: baseline-ul e fotografia productiei si se regenereaza
     * abia dupa ce migratia e aplicata acolo, odata cu pushul. Cand il cuprinde si el, e cu atat
     * mai bine; pana atunci, randul trebuie sa existe macar in fisierul care pleaca odata cu codul.
     */
    const RAND = /discount_amount\s+= coalesce\(\(p_patch->>'discount_amount'\)::numeric, discount_amount\),/;
    const corp = (sql: string) => {
      const i = sql.indexOf("CREATE OR REPLACE FUNCTION public.editeaza_comanda_atomic");
      assert.notEqual(i, -1, "functia a disparut");
      return sql.slice(i, sql.indexOf("$function$", sql.indexOf("$function$", i) + 10));
    };
    const migratie = corp(readFileSync("migrations/2027-02-14-editarea-scrie-si-reducerea.sql", "utf8"));
    assert.match(migratie, RAND);

    /* Restul functiei e cel din baseline, cuvant cu cuvant: migratia adauga, nu rescrie. */
    const baseline = corp(readFileSync("migrations/000-schema-baseline.sql", "utf8").replace(/\r\n/g, "\n"));
    if (!RAND.test(baseline)) {
      const faraAdaos = migratie.replace(/\r\n/g, "\n").split("\n")
        .filter((r, k, toate) => {
          const inceput = toate.findIndex((x) => x.includes("-- Reducerea de pe comanda."));
          const sfarsit = toate.findIndex((x) => RAND.test(x));
          return inceput === -1 || k < inceput || k > sfarsit;
        })
        .join("\n");
      assert.equal(faraAdaos, baseline, "migratia a schimbat si altceva decat randul reducerii");
    }
  });
});
