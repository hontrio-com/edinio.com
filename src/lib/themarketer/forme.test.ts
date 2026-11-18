import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { produsXml, preturiTM, disponibilitateTM, dataTM, type ProdusFeedTM } from "./feed-produse";
import { ierarhieDupaNume, ierarhiiDupaId, categorieXml, brandXml, adresaValida } from "./feed-categorii";
import {
  apelPentruEveniment, comandaPentruFeed, corpComanda, corpComandaFaraPersoana, liniiTM, statusTM, variantaDinNume,
  type ComandaTM, type ProdusLinie,
} from "./comanda";
import { idVariantaTM, skuLinieTM, skuVariantaTM, skuProdusTM, slugTitluVarianta } from "./identitate";
import { numeTM, telefonTM } from "./persoana";
import { citesteCererea, codNou, expirareaCerute, PREFIX_COD, VALOARE_FIXA_MAXIMA } from "./coduri";
import { autorPublic, citesteRecenziile, dataRecenziei, stele } from "./recenzii";
import { adreseDinWebhook } from "./webhook";
import { faraCampuriTM, moduleServerVitrina, vitrinaTheMarketer } from "./vitrina";
import { coduriDinRaspuns, fidelitateDinRaspuns } from "./fidelitate";
import { modulPornit, sursaPornita, theMarketerGata, MODULE_IMPLICITE, type TheMarketerConfig } from "./config";

const parser = new XMLParser({ ignoreAttributes: false });
const valid = (xml: string) => assert.equal(XMLValidator.validate(xml), true, xml.slice(0, 300));

const CTX = {
  baza: "https://magazin.ro",
  prefixProdus: "product",
  ierarhie: ierarhieDupaNume([
    { id: "c1", name: "Barbati", parent_id: null },
    { id: "c2", name: "Incaltaminte", parent_id: "c1" },
    { id: "c3", name: "Sneakers", parent_id: "c2" },
  ]),
};

const produs = (extra: Partial<ProdusFeedTM> = {}): ProdusFeedTM => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Pantof & sport <nou>",
  slug: "pantof-sport",
  description: "<p>Comod&nbsp;si usor</p>",
  price: 199,
  compare_at_price: null,
  sku: "PS-1",
  images: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"],
  category: "Sneakers",
  is_bundle: false,
  track_inventory: true,
  stock_quantity: 7,
  page_sections: { google: { brand: "Nike" } },
  created_at: "2026-11-18T10:05:00Z",
  ...extra,
});

function unProdus(xml: string) {
  valid(`<products>${xml}</products>`);
  return parser.parse(`<products>${xml}</products>`).products.product;
}

describe("feedul de produse", () => {
  test("produsul simplu, cu toate campurile obligatorii si escapat", () => {
    const p = unProdus(produsXml(produs(), CTX));
    assert.equal(p.id, "11111111-1111-4111-8111-111111111111");
    assert.equal(p.sku, "PS-1");
    assert.equal(p.name, "Pantof & sport <nou>");
    assert.equal(p.description, "Comod si usor");
    assert.equal(p.url, "https://magazin.ro/product/pantof-sport");
    assert.equal(p.category, "Barbati|Incaltaminte|Sneakers");
    assert.equal(p.brand, "Nike");
    assert.equal(p.acquisition_price, 0);
    /* „If product is not on sale, must be equal to price”. */
    assert.equal(p.price, 199);
    assert.equal(p.sale_price, 199);
    assert.equal(p.availability, 1);
    assert.equal(p.stock, 7);
    assert.equal(p.media_gallery.image.length, 2);
    assert.equal(p.created_at, "2026-11-18 12:05");
  });

  test("reducerea: pretul intreg e cel taiat, pretul redus cel de azi", () => {
    assert.deepEqual(preturiTM(150, 200), { price: 200, sale_price: 150 });
    assert.deepEqual(preturiTM(150, 100), { price: 150, sale_price: 150 });
    const p = unProdus(produsXml(produs({ price: 150, compare_at_price: 200 }), CTX));
    assert.equal(p.price, 200);
    assert.equal(p.sale_price, 150);
  });

  test("stocul si disponibilitatea, dupa regula lor („stock > 0 → 1; stock 0 → 0 sau 2”)", () => {
    assert.deepEqual(disponibilitateTM(5, true), { availability: 1, stock: 5 });
    assert.deepEqual(disponibilitateTM(0, true), { availability: 0, stock: 0 });
    assert.deepEqual(disponibilitateTM(-3, true), { availability: 0, stock: 0 });
    /* Stoc neurmarit: 2 cu stoc 0, ca pluginul lor. Nu un stoc inventat. */
    assert.deepEqual(disponibilitateTM(null, true), { availability: 2, stock: 0 });
    assert.deepEqual(disponibilitateTM(null, false), { availability: 0, stock: 0 });
  });

  test("fara brand si fara categorie: „N/A”, campurile sunt obligatorii", () => {
    const p = unProdus(produsXml(produs({ page_sections: {}, category: null }), CTX));
    assert.equal(p.brand, "N/A");
    assert.equal(p.category, "N/A");
  });

  test("produsul fara imagine ramane afara (ca in catalogul Meta)", () => {
    assert.equal(produsXml(produs({ images: [] }), CTX), "");
  });

  test("⚠ un octet de control din descriere nu strica TOT feedul", () => {
    const xml = produsXml(produs({ description: "Bun\u0007 si ieftin\u001b" }), CTX);
    valid(`<products>${xml}</products>`);
  });

  test("variantele: pret, stoc si marime/culoare pe fiecare; identitatea e cea din cos si din comanda", () => {
    const xml = produsXml(produs({
      price: 100,
      stock_quantity: 0,
      page_sections: {
        google: { brand: "Nike" },
        variants: {
          enabled: true,
          options: [{ id: "o1", name: "Marime", values: ["S", "M"] }, { id: "o2", name: "Culoare", values: ["Rosu"] }],
          combinations: [
            { id: "s-rosu", title: "S / Rosu", price: "", compare_at_price: "", sku: "PS-S-R", stock_quantity: "3", image: "", enabled: true },
            { id: "m-rosu", title: "M / Rosu", price: "110", compare_at_price: "130", sku: "", stock_quantity: "0", image: "", enabled: true },
          ],
        },
      },
    }), CTX);
    const p = unProdus(xml);
    const v = p.variations.variation;
    assert.equal(v.length, 2);
    assert.equal(v[0].sku, "PS-S-R");
    assert.equal(v[0].size, "S");
    assert.equal(v[0].color, "Rosu");
    assert.equal(v[0].stock, 3);
    assert.equal(v[0].availability, 1);
    assert.equal(v[1].price, 130);
    assert.equal(v[1].sale_price, 110);
    assert.equal(v[1].availability, 0);
    /* SKU-ul lipsa al combinatiei = ID-ul variantei, acelasi in cos si in comanda. */
    assert.equal(v[1].sku, idVariantaTM("11111111-1111-4111-8111-111111111111", "M / Rosu"));
    assert.equal(v[0].id, idVariantaTM("11111111-1111-4111-8111-111111111111", "S / Rosu"));
    /* Produsul: stocul e suma variantelor, pretul cel mai mic. */
    assert.equal(p.stock, 3);
    assert.equal(p.availability, 1);
    assert.equal(p.sale_price, 100);
  });

  test("pachetul: disponibilitatea din componente", () => {
    const p = unProdus(produsXml(produs({ is_bundle: true, track_inventory: false, pachetDisponibil: false }), CTX));
    assert.equal(p.availability, 0);
    const q = unProdus(produsXml(produs({ is_bundle: true, track_inventory: false, pachetDisponibil: true }), CTX));
    assert.equal(q.availability, 2);
  });

  test("data e ora Romaniei, in forma lor", () => {
    assert.equal(dataTM("2026-07-01T21:30:00Z"), "2026-07-02 00:30");
    assert.equal(dataTM("2026-01-15T09:00:00Z"), "2026-01-15 11:00");
    assert.equal(dataTM("nu e data"), null);
  });
});

describe("categoriile si brandurile", () => {
  test("ierarhia: prima categorie cu numele castiga, ciclurile se taie, `|` se scrie `/`", () => {
    const ierarhie = ierarhieDupaNume([
      { id: "a", name: "Femei", parent_id: null },
      { id: "b", name: "Rochii", parent_id: "a" },
      { id: "c", name: "Rochii", parent_id: null },
      { id: "x", name: "X", parent_id: "y" },
      { id: "y", name: "Y", parent_id: "x" },
      { id: "z", name: "Casa | Gradina", parent_id: null },
    ]);
    assert.equal(ierarhie("Rochii"), "Femei|Rochii");
    assert.equal(ierarhie("rochii"), "Femei|Rochii");
    assert.match(String(ierarhie("X")), /^(Y\|X|X)$/);
    assert.equal(ierarhie("Casa | Gradina"), "Casa / Gradina");
    assert.equal(ierarhie("Necunoscuta"), "Necunoscuta");
    assert.equal(ierarhie(null), null);
    assert.equal(ierarhiiDupaId([{ id: "a", name: "A", parent_id: null }]).get("a"), "A");
  });

  test("adresele optionale: numai https si de macar 10 caractere, altfel lipsesc", () => {
    assert.equal(adresaValida("https://magazin.ro/x"), "https://magazin.ro/x");
    assert.equal(adresaValida("http://magazin.ro/x"), null);
    assert.equal(adresaValida("https://a"), null);
    const xml = categorieXml({ id: "c1", name: "Pantofi & cizme", parent_id: null, image_url: "javascript:alert(1)" }, "Pantofi & cizme", "https://magazin.ro/magazin/pantofi");
    valid(xml);
    assert.ok(!xml.includes("image_url"));
    const b = brandXml({ nume: "Dolce, Gabbana", segment: "dolce-gabbana", logo: null }, null);
    valid(b);
    assert.ok(b.includes("<id>dolce-gabbana</id>"));
  });
});

describe("comanda", () => {
  const PRODUSE = new Map<string, ProdusLinie>([
    ["p1", {
      id: "p1", name: "Geaca", sku: "G-1", slug: "geaca", images: ["https://cdn/x.jpg"], category: "Sneakers", price: 300, compare_at_price: 350,
      page_sections: { variants: { enabled: true, options: [{ id: "o", name: "Marime", values: ["S", "XS"] }], combinations: [
        { id: "s", title: "S", price: "", compare_at_price: "", sku: "G-S", stock_quantity: "", image: "", enabled: true },
        { id: "xs", title: "XS", price: "", compare_at_price: "", sku: "", stock_quantity: "", image: "", enabled: true },
      ] } },
    }],
    ["p2", { id: "p2", name: "Sapca", sku: null, slug: null, images: [], category: null, price: 50, compare_at_price: null, page_sections: {} }],
  ]);
  const COMANDA: ComandaTM = {
    order_number: "1001",
    customer_name: "Ion",
    customer_email: "Ion@Exemplu.ro",
    customer_phone: "0722 123 456",
    shipping_address: { address: "Str. Lunga 1", city: "Brasov", county: "Brasov", country: "RO" },
    items: [
      { product_id: "p1", name: "Geaca (XS)", price: 300, quantity: 1 },
      { product_id: "p2", name: "Sapca", price: 50, quantity: 2 },
      { product_id: "extra_ambalaj", name: "Ambalaj cadou", price: 10, quantity: 1 },
    ],
    shipping_cost: 20,
    total: 395,
    discount_code: "TOAMNA",
    discount_amount: 25,
    card_discount_amount: 0,
    offer_discount_amount: 5,
    cod_discount_amount: 0,
    cod_fee_amount: 5,
    vat_amount: 63.07,
    status: "pending",
    payment_status: "unpaid",
    payment_method: "cod",
    created_at: "2026-11-18T10:00:00Z",
  };

  test("varianta se regaseste din numele liniei, cel mai lung titlu castiga", () => {
    assert.equal(variantaDinNume("Geaca (XS)", ["S", "XS"]), "XS");
    assert.equal(variantaDinNume("Geaca (S)", ["S", "XS"]), "S");
    assert.equal(variantaDinNume("Geaca", ["S"]), null);
  });

  test("liniile: fara extraoptiuni, cu SKU-ul variantei sau al produsului", () => {
    const l = liniiTM(COMANDA.items, PRODUSE);
    assert.equal(l.length, 2);
    assert.equal(l[0].variation_sku, idVariantaTM("p1", "XS"), "combinatia fara SKU: ID-ul variantei");
    assert.equal(l[1].variation_sku, "p2", "produsul simplu fara SKU: id-ul lui");
    assert.equal(skuLinieTM({ productId: "p1", titluVarianta: "S", skuCombinatie: "G-S" }), "G-S");
  });

  test("`save_order`: toate campurile cerute, numele de familie completat, telefonul cu +40", () => {
    const c = corpComanda(COMANDA, liniiTM(COMANDA.items, PRODUSE))!;
    assert.equal(c.number, "1001");
    assert.equal(c.email_address, "Ion@Exemplu.ro");
    assert.equal(c.firstname, "Ion");
    assert.equal(c.lastname, "Ion", "un 422 ar fi pierdut comanda");
    assert.equal(c.phone, "+40722123456");
    assert.equal(c.discount_value, "30.00", "cuponul si oferta, impreuna");
    assert.equal(c.shipping, "25.00", "transportul, cu taxa de ramburs");
    assert.equal(c.tax, "63.07");
    assert.equal(c.total_value, "395.00");
    assert.equal((c.products as unknown[]).length, 2);
    assert.equal(c.city, "Brasov");
  });

  test("fara email nu pleaca; partea fara persoana nu are nimic personal", () => {
    assert.equal(corpComanda({ ...COMANDA, customer_email: " " }, liniiTM(COMANDA.items, PRODUSE)), null);
    const p = corpComandaFaraPersoana(COMANDA, liniiTM(COMANDA.items, PRODUSE))!;
    for (const camp of ["email_address", "phone", "firstname", "lastname", "city", "county", "address"]) {
      assert.ok(!(camp in p), camp);
    }
    assert.equal(corpComandaFaraPersoana(COMANDA, []), null);
  });

  test("ce pleaca pe fiecare eveniment al cozii", () => {
    assert.deepEqual(apelPentruEveniment("creata", "cod", "unpaid"), { apel: "save_order" });
    assert.ok("sarit" in apelPentruEveniment("platita", "cod", "paid"));
    assert.ok("sarit" in apelPentruEveniment("creata", "stripe", "unpaid"), "la card, abia la plata");
    assert.deepEqual(apelPentruEveniment("platita", "netopia", "paid"), { apel: "save_order" });
    assert.deepEqual(apelPentruEveniment("livrata", "cod", "paid"), { apel: "status", status: "Delivered" });
    assert.ok("sarit" in apelPentruEveniment("anulata", "stripe", "unpaid"), "plata neincasata n-a fost vanzare");
    assert.deepEqual(apelPentruEveniment("rambursata", "stripe", "refunded"), { apel: "status", status: "Refunded" });
  });

  test("statusurile pleaca in engleza, cu majuscula", () => {
    assert.equal(statusTM("delivered"), "Delivered");
    assert.equal(statusTM("processing"), "Processing");
    assert.equal(statusTM("pending", "refunded"), "Refunded");
    assert.equal(statusTM("cancelled", "refunded"), "Cancelled");
    assert.equal(statusTM("in_lucru"), "In_lucru");
  });

  test("feedul de import: forma lor, cu produsul de azi", () => {
    const f = comandaPentruFeed(COMANDA, liniiTM(COMANDA.items, PRODUSE), PRODUSE, {
      urlProdus: (p) => `https://magazin.ro/product/${p.slug ?? p.id}`, imagine: () => "https://cdn/x.jpg",
      ierarhie: CTX.ierarhie, baza: "https://magazin.ro",
    })!;
    assert.equal(f.order_no, "1001");
    assert.equal(f.order_status, "Pending");
    assert.equal(f.refund_value, "0.00");
    assert.equal(f.country, "RO");
    assert.equal(f.created_at, "2026-11-18 12:00");
    const pr = (f.products as Record<string, unknown>[])[0];
    assert.equal(pr.name, "Geaca");
    assert.equal(pr.price, "350.00");
    assert.equal(pr.sale_price, "300.00");
    assert.equal(pr.category, "Barbati|Incaltaminte|Sneakers");
  });
});

describe("identitatea si persoana", () => {
  test("ID-ul variantei e acelasi oricum ar fi scris titlul", () => {
    assert.equal(slugTitluVarianta("Mărime M / Roșu"), "marime-m-rosu");
    assert.equal(idVariantaTM("p", "Mărime M / Roșu"), "p-marime-m-rosu");
    assert.equal(skuVariantaTM("p", "M", "  "), "p-m");
    assert.equal(skuProdusTM("p", null), "p");
  });
  test("numele si telefonul", () => {
    assert.deepEqual(numeTM("  Ana   Maria Pop "), { firstname: "Ana", lastname: "Maria Pop" });
    assert.deepEqual(numeTM(""), { firstname: "", lastname: "" });
    assert.equal(telefonTM("+40 722 123 456"), "+40722123456");
    assert.equal(telefonTM("abc"), "abc");
  });
});

describe("generatorul de coduri", () => {
  const q = (s: string) => new URLSearchParams(s);
  const ACUM = new Date("2026-11-18T10:00:00Z");

  test("cele trei tipuri", () => {
    assert.deepEqual(citesteCererea(q("type=0&value=25"), ACUM), { tip: "fixed", valoare: 25, expira: null });
    assert.deepEqual(citesteCererea(q("type=1&value=10"), ACUM), { tip: "percent", valoare: 10, expira: null });
    assert.deepEqual(citesteCererea(q("type=2"), ACUM), { tip: "free_shipping", valoare: 0, expira: null });
  });

  test("plafoanele: nicio reducere peste 100% sau peste valoarea fixa maxima", () => {
    assert.ok("eroare" in citesteCererea(q("type=1&value=101"), ACUM));
    assert.ok("eroare" in citesteCererea(q(`type=0&value=${VALOARE_FIXA_MAXIMA + 1}`), ACUM));
    assert.ok("eroare" in citesteCererea(q("type=0&value=-5"), ACUM));
    assert.ok("eroare" in citesteCererea(q("type=3&value=5"), ACUM));
    assert.ok("eroare" in citesteCererea(q("value=5"), ACUM));
    assert.ok("eroare" in citesteCererea(q("type=1&value=abc"), ACUM));
  });

  test("expirarea: ziua expira la SFARSITUL ei, ora Romaniei; si forma cu ghilimele din documentatia lor", () => {
    assert.equal(expirareaCerute("2026-12-31"), "2026-12-31T21:59:59.999Z");
    assert.equal(expirareaCerute("2026-07-15 09:00"), "2026-07-15T06:00:00.000Z");
    assert.equal(expirareaCerute("”2026-07-15 09:00”"), "2026-07-15T06:00:00.000Z");
    assert.equal(expirareaCerute(null), null);
    assert.equal(expirareaCerute("31.12.2026"), "invalida");
    assert.equal(expirareaCerute("2026-02-31"), "invalida");
    assert.ok("eroare" in citesteCererea(q("type=1&value=10&expiration_date=2020-01-01"), ACUM), "o data trecuta");
  });

  test("codul: forma lor (`MKTR-` + 10 caractere A-Z0-9) si fara repetari", () => {
    const vazute = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const c = codNou();
      assert.match(c, /^MKTR-[A-Z0-9]{10}$/);
      vazute.add(c);
    }
    assert.equal(vazute.size, 2000);
    assert.ok(PREFIX_COD === "MKTR-");
  });
});

describe("recenziile", () => {
  const XML = `<?xml version="1.0" encoding="UTF-8"?>
<reviews>
  <review>
    <review_id>123</review_id>
    <review_date>2022-03-01 17:44:32</review_date>
    <review_author>John Doe</review_author>
    <review_email>John@Doe.com</review_email>
    <product_id>11111111-1111-4111-8111-111111111111</product_id>
    <product_sku>ABC123</product_sku>
    <rating>9</rating>
    <review_text><![CDATA[Foarte bun & ieftin <3]]></review_text>
    <media_files>
      <media type="image">https://cdn.themarketer.com/reviews/ABCFHE12/image1.jpg</media>
      <media type="video">https://cdn.themarketer.com/reviews/ABCFHE12/video.mp4</media>
      <media type="image">javascript:alert(1)</media>
    </media_files>
  </review>
  <review><review_id></review_id><product_id>x</product_id><rating>5</rating></review>
  <review><review_id>124</review_id><product_id>p</product_id><rating>abc</rating></review>
</reviews>`;

  test("forma din documentatia lor, cu CDATA si poze; ce e stricat se sare", () => {
    const r = citesteRecenziile(XML);
    assert.equal(r.length, 1);
    assert.equal(r[0].idExtern, "123");
    assert.equal(r[0].text, "Foarte bun & ieftin <3");
    assert.equal(r[0].email, "john@doe.com");
    assert.equal(r[0].nota, 9);
    assert.deepEqual(r[0].media.map((m) => m.tip), ["image", "video"], "numai adrese https");
    assert.equal(r[0].data, "2022-03-01T15:44:32.000Z", "ora lor e a Romaniei");
  });

  test("nota din 10 devine stele din 5; numele se arata prescurtat", () => {
    assert.equal(stele(9), 4.5);
    assert.equal(stele(10), 5);
    assert.equal(stele(0), 0);
    assert.equal(autorPublic("ion  popescu"), "ion P.");
    assert.equal(autorPublic(""), "Client");
    assert.equal(dataRecenziei("2026-07-01 12:00:00"), "2026-07-01T09:00:00.000Z");
  });
});

describe("webhookurile", () => {
  test("dezabonarea si spamul: adresa; respingerea: numai cea definitiva", () => {
    assert.deepEqual(adreseDinWebhook("dezabonat", { email: " Om@X.ro ", firstname: "Ion" }), ["om@x.ro"]);
    assert.deepEqual(adreseDinWebhook("spam", { email: "a@b.ro" }), ["a@b.ro"]);
    assert.deepEqual(adreseDinWebhook("respins", { email: "a@b.ro", bounce_type: "bounce_soft" }), []);
    assert.deepEqual(adreseDinWebhook("respins", { email: "a@b.ro", bounce_type: "bounce_hard" }), ["a@b.ro"]);
    assert.deepEqual(adreseDinWebhook("dezabonat", [{ email: "a@b.ro" }, { email: "a@b.ro" }, { email: "nu-e-email" }]), ["a@b.ro"]);
    assert.deepEqual(adreseDinWebhook("dezabonat", "text"), []);
  });
});

describe("configurarea si vitrina", () => {
  const LEGAT: TheMarketerConfig = { enabled: true, tracking_key: "TRK1", customer_id: "C1", rest_key: "rest-key-123" };

  test("lipsa unui modul inseamna implicitul lui; cele cu date personale pornesc oprite", () => {
    assert.equal(theMarketerGata(LEGAT), true);
    assert.equal(theMarketerGata({ ...LEGAT, rest_key: "" }), false);
    assert.equal(modulPornit(LEGAT, "comenzi"), true);
    assert.equal(modulPornit(LEGAT, "export_comenzi"), false);
    assert.equal(modulPornit(LEGAT, "captura_email"), false);
    assert.equal(modulPornit(LEGAT, "push"), false);
    assert.equal(modulPornit({ ...LEGAT, enabled: false }, "comenzi"), false);
    assert.equal(sursaPornita(LEGAT, "checkout"), true);
    assert.equal(sursaPornita({ ...LEGAT, abonati: { checkout: false } }, "checkout"), false);
    assert.equal(MODULE_IMPLICITE.export_comenzi, false);
  });

  test("vitrina: scriptul numai cu integrarea si urmarirea pornite, si numai cu o cheie care nu poate iesi din adresa", () => {
    assert.deepEqual(vitrinaTheMarketer({ tm_activ: true, tm_cheie: "ABC123" }), { cheie: "ABC123", captura: false, push: false, fidelitate: false, recenzii: false });
    assert.equal(vitrinaTheMarketer({ tm_activ: false, tm_cheie: "ABC123" }), null);
    assert.equal(vitrinaTheMarketer({ tm_activ: true, tm_cheie: "ABC123", tm_urmarire: false }), null);
    assert.equal(vitrinaTheMarketer({ tm_activ: true, tm_cheie: 'x";alert(1)//' }), null);
    assert.equal(vitrinaTheMarketer({ tm_activ: true, tm_cheie: "../../evil" }), null);
    assert.deepEqual(moduleServerVitrina({ tm_activ: true, tm_recenzii: true, tm_urmarire: false }), { fidelitate: false, recenzii: true });
    assert.deepEqual(faraCampuriTM({ a: 1, tm_activ: true, tm_recenzii: false }), { a: 1 });
  });
});

describe("fidelitatea", () => {
  test("raspunsul din specul lor", () => {
    const f = fidelitateDinRaspuns({
      stats: {
        current_tier: "Beginner", current_tier_points_start: 1000, current_tier_points_end: 2999, next_tier: "Apprentice",
        current_points: 1400, redeemed_points: 0, points_about_to_expire: 0, membership: true,
      },
    });
    assert.deepEqual(f, { puncte: 1400, nivel: "Beginner", nivelUrmator: "Apprentice", panaLaUrmator: 1600, expiraCurand: 0 });
    /* Modelul pe puncte: nivelurile sunt „null”. */
    assert.deepEqual(fidelitateDinRaspuns({ stats: { current_tier: "null", next_tier: null, current_points: 650, membership: true } }),
      { puncte: 650, nivel: null, nivelUrmator: null, panaLaUrmator: null, expiraCurand: 0 });
    assert.equal(fidelitateDinRaspuns({ stats: { membership: false, current_points: 5 } }), null);
    assert.equal(fidelitateDinRaspuns(null), null);
  });

  test("codurile primite: numai cele cu forma de cod", () => {
    const c = coduriDinRaspuns([
      { code: "MKTR-35UZVO1B7V", value: "10", type: "fixed", expire: "2026-07-25 12:30:02", campaign_name: null },
      { code: "<script>", value: "5" },
    ]);
    assert.equal(c.length, 1);
    assert.equal(c[0].cod, "MKTR-35UZVO1B7V");
    assert.deepEqual(coduriDinRaspuns({}), []);
  });
});
