import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  LUNGIME_DESCRIERE_COMPARI, LUNGIME_NUME_COMPARI, caiDeCategorii, construiesteArticolCompari,
  motivulLipseiDinCompari, rezumatulFeeduluiCompari, serializeazaFeedCompari, taieLaCuvant,
  type MagazinCompari, type ProdusCompari,
} from "./feed";
import { MOTIVE_COMPARI, type MotivLipsaCompari } from "./lasate-afara";
import { RESERVED_PAGE_SLUGS } from "@/lib/pages/reserved-slugs";
import { ghidulIntegrarii } from "@/lib/dashboard/ghiduri-integrari";
import { INTEGRARI } from "@/lib/website/integrari-catalog";

/**
 * Feedul pentru Compari.ro: ce pleaca, cu ce cifre si sub ce nume.
 *
 * ⚠ CE APARA PROBELE, IN ORDINEA BANILOR:
 *  1. Pretul e BRUT. Un magazin cu preturi fara TVA (cazul pentru care s-a scris feedul) ar aparea in comparator
 *     cu 21% mai ieftin decat vinde, pe primul loc, si fiecare clic platit ar duce omul la alt pret.
 *  2. Produsul epuizat pleaca „NO”, nu ca disponibil si nici scos din lista.
 *  3. Transportul gratuit se scrie „gratuit”, niciodata „0”.
 *  4. Numele elementelor sunt cele scrise pe pagina Compari; niciunul inventat.
 */

const RAD = process.cwd();
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8").replace(/\r\n/g, "\n");
}
/** Sursa fara comentarii: o proba care gaseste o secventa citata doar in comentariu nu probeaza nimic. */
function codul(relativ: string): string {
  return sursa(relativ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const CU_TVA_ADAUGAT = { vat_enabled: true, vat_rate: 21, prices_include_vat: false };
const CU_TVA_INCLUS = { vat_enabled: true, vat_rate: 21, prices_include_vat: true };

function magazin(peste: Partial<MagazinCompari> = {}): MagazinCompari {
  return {
    slug: "exemplu",
    custom_domain: "exemplu.ro",
    store_name: "Exemplu",
    business_name: "Exemplu SRL",
    tva: CU_TVA_ADAUGAT,
    zileLivrare: 4,
    transport: { activ: true, cost: 45, pragGratuit: 999 },
    ...peste,
  };
}

function produs(peste: Partial<ProdusCompari> = {}): ProdusCompari {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    name: "Sosete de lucru 400 Long",
    slug: "400-long-b2202",
    sku: "B2202",
    description: "<p>Zona c&acirc;lc&acirc;iului &icirc;nt&#259;rit&#259;.</p><li>Banda elastica</li>",
    price: 97.29,
    images: ["https://edinio-cdn.com/products/x/poza.jpg"],
    category: "Sosete de lucru",
    track_inventory: true,
    stock_quantity: 12,
    page_sections: { google: { brand: "Portwest" }, stock_status: "in_stock" },
    ...peste,
  };
}

const faraCale = (nume: string) => nume;

function variante(combinatii: { title: string; price?: string; stock?: string; enabled?: boolean }[]) {
  return {
    enabled: true,
    options: [{ id: "marime", name: "Marime", values: combinatii.map((c) => c.title) }],
    combinations: combinatii.map((c) => ({
      id: c.title.toLowerCase(), title: c.title, price: c.price ?? "", compare_at_price: "", sku: `B2202${c.title}`,
      stock_quantity: c.stock ?? "", image: "", enabled: c.enabled ?? true,
    })),
  };
}

/* ═══ Pretul ═══ */

test("⚠ pretul pleaca BRUT: la preturi fara TVA se adauga cota magazinului", () => {
  const a = construiesteArticolCompari(magazin(), produs(), faraCale);
  assert.ok(a);
  assert.equal(a.price, "117.72", "97,29 fara TVA + 21% = 117,72");
});

test("pretul ramane cel din magazin cand TVA-ul e deja inclus sau magazinul nu e platitor", () => {
  assert.equal(construiesteArticolCompari(magazin({ tva: CU_TVA_INCLUS }), produs(), faraCale)?.price, "97.29");
  const neplatitor = { vat_enabled: false, vat_rate: 21, prices_include_vat: false };
  assert.equal(construiesteArticolCompari(magazin({ tva: neplatitor }), produs(), faraCale)?.price, "97.29");
});

test("produsul cu variante pleaca O DATA, cu cel mai mic pret la care se poate cumpara", () => {
  const p = produs({
    price: 100,
    page_sections: {
      google: { brand: "Portwest" },
      variants: variante([{ title: "M", price: "120" }, { title: "L", price: "90" }, { title: "XL", price: "60", enabled: false }]),
    },
  });
  const a = construiesteArticolCompari(magazin({ tva: CU_TVA_INCLUS }), p, faraCale);
  assert.ok(a);
  assert.equal(a.price, "90.00", "combinatia oprita (60) nu e de vanzare, deci nu da pretul");
  assert.equal(a.identifier, p.id, "un singur rand, cu id-ul produsului");
});

/* ═══ Stocul si termenul ═══ */

test("⚠ produsul epuizat ramane in feed cu delivery_time NO, fara cost de livrare", () => {
  const zero = construiesteArticolCompari(magazin(), produs({ stock_quantity: 0 }), faraCale);
  assert.equal(zero?.deliveryTime, "NO");
  assert.equal(zero?.deliveryCost, undefined);

  const marcat = construiesteArticolCompari(magazin(), produs({ page_sections: { stock_status: "out_of_stock" } }), faraCale);
  assert.equal(marcat?.deliveryTime, "NO", "marcajul din editor bate inventarul");

  const toateEpuizate = produs({
    page_sections: { variants: variante([{ title: "M", stock: "0" }, { title: "L", stock: "0" }]) },
  });
  assert.equal(construiesteArticolCompari(magazin(), toateEpuizate, faraCale)?.deliveryTime, "NO");

  const faraOferta = produs({ page_sections: { variants: variante([{ title: "M", enabled: false }]) } });
  assert.equal(construiesteArticolCompari(magazin(), faraOferta, faraCale)?.deliveryTime, "NO");
});

test("stocul nu conteaza cand magazinul nu il urmareste", () => {
  const a = construiesteArticolCompari(magazin(), produs({ track_inventory: false, stock_quantity: 0 }), faraCale);
  assert.equal(a?.deliveryTime, "4");
});

test("termenul e cel declarat de comerciant; nedeclarat, campul lipseste; niciodata sub 1", () => {
  assert.equal(construiesteArticolCompari(magazin({ zileLivrare: 4 }), produs(), faraCale)?.deliveryTime, "4");
  assert.equal(construiesteArticolCompari(magazin({ zileLivrare: null }), produs(), faraCale)?.deliveryTime, undefined);
  assert.equal(construiesteArticolCompari(magazin({ zileLivrare: 0 }), produs(), faraCale)?.deliveryTime, "1");
  /* Epuizat ramane NO si fara termen declarat: e despre stoc, nu despre zile. */
  assert.equal(construiesteArticolCompari(magazin({ zileLivrare: null }), produs({ stock_quantity: 0 }), faraCale)?.deliveryTime, "NO");
});

test("precomanda nu primeste termenul marfii din stoc", () => {
  const a = construiesteArticolCompari(magazin(), produs({ page_sections: { stock_status: "preorder" } }), faraCale);
  assert.ok(a);
  assert.equal(a.deliveryTime, undefined);
});

test("pachetul isi ia disponibilitatea de la apelant, nu din stocul lui", () => {
  const pachet = produs({ is_bundle: true, track_inventory: false, stock_quantity: null });
  assert.equal(construiesteArticolCompari(magazin(), { ...pachet, pachetDisponibil: false }, faraCale)?.deliveryTime, "NO");
  assert.equal(construiesteArticolCompari(magazin(), { ...pachet, pachetDisponibil: true }, faraCale)?.deliveryTime, "4");
});

/* ═══ Costul livrarii ═══ */

test("⚠ costul livrarii: brut sub prag, „gratuit” de la prag, niciodata „0”", () => {
  const subPrag = construiesteArticolCompari(magazin(), produs(), faraCale);
  assert.equal(subPrag?.deliveryCost, "54.45", "45 fara TVA + 21%");

  const cuTvaInclus = construiesteArticolCompari(magazin({ tva: CU_TVA_INCLUS }), produs(), faraCale);
  assert.equal(cuTvaInclus?.deliveryCost, "45", "suma intreaga, fara zecimale");

  /* Pragul se compara in preturile magazinului, ca la finalizarea comenzii: 999 fara TVA, nu 999 brut. */
  assert.equal(construiesteArticolCompari(magazin(), produs({ price: 998.99 }), faraCale)?.deliveryCost, "54.45");
  assert.equal(construiesteArticolCompari(magazin(), produs({ price: 999 }), faraCale)?.deliveryCost, "gratuit");

  const tarifZero = magazin({ transport: { activ: true, cost: 0, pragGratuit: null } });
  assert.equal(construiesteArticolCompari(tarifZero, produs(), faraCale)?.deliveryCost, "gratuit");
});

test("costul livrarii lipseste cand nu e stiut: tarif nescris sau livrare oprita", () => {
  const nescris = magazin({ transport: { activ: true, cost: null, pragGratuit: null } });
  assert.equal(construiesteArticolCompari(nescris, produs(), faraCale)?.deliveryCost, undefined);
  const oprita = magazin({ transport: { activ: false, cost: 45, pragGratuit: 999 } });
  assert.equal(construiesteArticolCompari(oprita, produs(), faraCale)?.deliveryCost, undefined);
});

/* ═══ Campurile de identificare ═══ */

test("identificatorul e id-ul produsului, iar codul producatorului pleaca separat", () => {
  const a = construiesteArticolCompari(magazin(), produs(), faraCale);
  assert.ok(a);
  assert.equal(a.identifier, "11111111-2222-3333-4444-555555555555");
  assert.equal(a.productNumber, "B2202");
  assert.equal(a.manufacturer, "Portwest");
  assert.equal(a.productUrl, "https://exemplu.ro/product/400-long-b2202");

  /* SKU-ul schimbat de comerciant NU schimba identificatorul. */
  const altSku = construiesteArticolCompari(magazin(), produs({ sku: "ALT-COD" }), faraCale);
  assert.equal(altSku?.identifier, a.identifier);
  assert.equal(altSku?.productNumber, "ALT-COD");
});

test("codul de producator scris anume (mpn) bate SKU-ul; fara marca, pleaca numele magazinului", () => {
  const p = produs({ page_sections: { google: { mpn: "PW-B2202" } } });
  const a = construiesteArticolCompari(magazin(), p, faraCale);
  assert.equal(a?.productNumber, "PW-B2202");
  assert.equal(a?.manufacturer, "Exemplu");
  const faraNume = construiesteArticolCompari(magazin({ store_name: null }), p, faraCale);
  assert.equal(faraNume?.manufacturer, "Exemplu SRL");
});

test("codul de bare pleaca numai cand trece cifra de control", () => {
  const bun = produs({ page_sections: { google: { brand: "Portwest", gtin: "5036108249879" } } });
  const stricat = produs({ page_sections: { google: { brand: "Portwest", gtin: "5036108249870" } } });
  assert.equal(construiesteArticolCompari(magazin(), bun, faraCale)?.eanCode, "5036108249879");
  assert.equal(construiesteArticolCompari(magazin(), stricat, faraCale)?.eanCode, undefined);
  assert.equal(construiesteArticolCompari(magazin(), produs(), faraCale)?.eanCode, undefined);
});

test("adresa produsului urmeaza adresa magazinului si prefixul din Permalink-uri", () => {
  const peEdinio = magazin({ custom_domain: null, prefix_produs: "produs" });
  assert.equal(
    construiesteArticolCompari(peEdinio, produs(), faraCale)?.productUrl,
    "https://www.edinio.com/exemplu/produs/400-long-b2202",
  );
  const faraSlug = construiesteArticolCompari(magazin(), produs({ slug: null }), faraCale);
  assert.equal(faraSlug?.productUrl, "https://exemplu.ro/product/11111111-2222-3333-4444-555555555555");
});

/* ═══ Textele ═══ */

test("numele se taie la 100 de caractere, la hotar de cuvant", () => {
  const lung = "Geaca de iarna impermeabila cu banda reflectorizanta si captuseala detasabila pentru lucru in exterior model Premium Plus";
  const a = construiesteArticolCompari(magazin(), produs({ name: lung }), faraCale);
  assert.ok(a);
  assert.ok(a.name.length <= LUNGIME_NUME_COMPARI, String(a.name.length));
  assert.ok(lung.startsWith(a.name) && lung[a.name.length] === " ", "nu taie prin mijlocul unui cuvant");
  assert.equal(taieLaCuvant("scurt", 100), "scurt");
  assert.equal(taieLaCuvant("unu doi trei, patru", 13), "unu doi trei");
});

test("descrierea pleaca text simplu, cu entitatile decodate, sub limita lor", () => {
  const a = construiesteArticolCompari(magazin(), produs(), faraCale);
  assert.equal(a?.description, "Zona câlcâiului întărită. Banda elastica");
  const uriasa = produs({ description: `<p>${"cuvant ".repeat(2000)}</p>` });
  const b = construiesteArticolCompari(magazin(), uriasa, faraCale);
  assert.ok(b?.description && b.description.length <= LUNGIME_DESCRIERE_COMPARI);
  assert.ok(b.description.endsWith("cuvant"), "taiata la hotar de cuvant");
  assert.equal(construiesteArticolCompari(magazin(), produs({ description: null }), faraCale)?.description, undefined);
});

/* ═══ Categoriile ═══ */

test("categoria pleaca cu calea intreaga, parinte > copil", () => {
  const cai = caiDeCategorii([
    { id: "a", name: "Imbracaminte de lucru", parent_id: null },
    { id: "b", name: "Sosete de lucru", parent_id: "a" },
    { id: "c", name: "Termice", parent_id: "b" },
  ]);
  assert.equal(cai.get("Sosete de lucru"), "Imbracaminte de lucru > Sosete de lucru");
  assert.equal(cai.get("Termice"), "Imbracaminte de lucru > Sosete de lucru > Termice");
  assert.equal(cai.get("Imbracaminte de lucru"), "Imbracaminte de lucru");

  const a = construiesteArticolCompari(magazin(), produs(), (n) => cai.get(n) ?? n);
  assert.equal(a?.category, "Imbracaminte de lucru > Sosete de lucru");
  /* O categorie care nu e in arbore pleaca asa cum e scrisa pe produs. */
  const necunoscuta = construiesteArticolCompari(magazin(), produs({ category: "Diverse" }), (n) => cai.get(n) ?? n);
  assert.equal(necunoscuta?.category, "Diverse");
});

test("un lant de parinti inchis in cerc nu invarte la nesfarsit; primul nume castiga la dubluri", () => {
  const cerc = caiDeCategorii([
    { id: "a", name: "A", parent_id: "b" },
    { id: "b", name: "B", parent_id: "a" },
  ]);
  assert.equal(cerc.get("A"), "B > A");
  assert.equal(cerc.get("B"), "A > B");

  const dubluri = caiDeCategorii([
    { id: "p1", name: "Incaltaminte", parent_id: null },
    { id: "p2", name: "Imbracaminte", parent_id: null },
    { id: "x", name: "Accesorii", parent_id: "p1" },
    { id: "y", name: "Accesorii", parent_id: "p2" },
  ]);
  assert.equal(dubluri.get("Accesorii"), "Incaltaminte > Accesorii");
});

/* ═══ Cine ramane afara ═══ */

test("raman afara: fara imagine, fara categorie, fara pret, pret care minte", () => {
  const m = magazin();
  assert.equal(motivulLipseiDinCompari(m, produs()), null);
  assert.equal(motivulLipseiDinCompari(m, produs({ images: [] })), "fara-imagine");
  assert.equal(motivulLipseiDinCompari(m, produs({ images: ["", "  "] })), "fara-imagine");
  assert.equal(motivulLipseiDinCompari(m, produs({ images: null })), "fara-imagine");
  assert.equal(motivulLipseiDinCompari(m, produs({ category: "  " })), "fara-categorie");
  assert.equal(motivulLipseiDinCompari(m, produs({ price: 0 })), "fara-pret");
  for (const p of [produs({ images: [] }), produs({ category: null }), produs({ price: 0 })]) {
    assert.equal(construiesteArticolCompari(m, p, faraCale), null, "generatorul aplica aceeasi hotarare");
  }
});

test("⚠ produsul epuizat NU e intre cele lasate afara", () => {
  assert.equal(motivulLipseiDinCompari(magazin(), produs({ stock_quantity: 0 })), null);
  assert.ok(construiesteArticolCompari(magazin(), produs({ stock_quantity: 0 }), faraCale));
});

/* ═══ Scrierea ═══ */

test("XML-ul are forma si numele de elemente scrise pe pagina Compari", () => {
  const a = construiesteArticolCompari(
    magazin(),
    produs({ page_sections: { google: { brand: "Portwest", gtin: "5036108249879" }, stock_status: "in_stock" } }),
    faraCale,
  );
  assert.ok(a);
  const x = serializeazaFeedCompari([a]);
  assert.ok(x.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<products>\n<product>'));
  assert.ok(x.trimEnd().endsWith("</product>\n</products>"));
  const elemente = [...x.matchAll(/<([a-z_]+)>/g)].map((m) => m[1]);
  assert.deepEqual(elemente, [
    "products", "product", "identifier", "manufacturer", "name", "category", "product_url", "price",
    "productnumber", "ean_code", "image_url", "description", "delivery_time", "delivery_cost",
  ]);
  assert.match(x, /<price>117\.72<\/price>/);
  assert.match(x, /<delivery_time>4<\/delivery_time>/);
  assert.match(x, /<delivery_cost>54\.45<\/delivery_cost>/);
  assert.doesNotMatch(x, /<delivery_cost>0/);
});

test("campurile goale nu se scriu; un feed fara produse ramane XML valid", () => {
  const a = construiesteArticolCompari(
    magazin({ zileLivrare: null, transport: { activ: false, cost: null, pragGratuit: null } }),
    produs({ sku: null, description: null }),
    faraCale,
  );
  assert.ok(a);
  const x = serializeazaFeedCompari([a]);
  for (const lipsa of ["productnumber", "ean_code", "description", "delivery_time", "delivery_cost"]) {
    assert.ok(!x.includes(`<${lipsa}>`), lipsa);
  }
  assert.equal(serializeazaFeedCompari([]), '<?xml version="1.0" encoding="UTF-8"?>\n<products>\n</products>\n');
});

test("⚠ textul e scapat, iar caracterele care nu sunt XML se scot", () => {
  const a = construiesteArticolCompari(
    magazin(),
    produs({ name: "Manusi <Grip> & Protect\u0001\u000b", description: "Rezista la 5 < 6 & taieturi" }),
    faraCale,
  );
  assert.ok(a);
  const x = serializeazaFeedCompari([a]);
  assert.ok(x.includes("<name>Manusi &lt;Grip&gt; &amp; Protect</name>"));
  assert.ok(x.includes("5 &lt; 6 &amp; taieturi"));
  assert.doesNotMatch(x, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
});

/* ═══ Legaturile care nu se vad din tipuri ═══ */

const RUTA = "src/app/(public)/[slug]/compari.xml/route.ts";
const CITIRI = "src/lib/compari/server.ts";
const ACTIUNE = "src/lib/actions/compari.actions.ts";
const PAGINA = "src/app/(dashboard)/dashboard/features/compari/page.tsx";
const HUB = "src/app/(dashboard)/dashboard/features/page.tsx";

test("citirile sunt stricte, sar produsele demo, iar ruta raspunde 503 la o citire cazuta", () => {
  const citiri = codul(CITIRI);
  assert.match(citiri, /fetchAllRowsStrict\("feedCompari\.products"/);
  assert.match(citiri, /fetchAllRowsStrict\("feedCompari\.categories"/);
  assert.match(citiri, /\.eq\("is_active", true\)/);
  assert.match(citiri, /\.or\(FARA_PRODUSE_DEMO\)/);
  assert.match(citiri, /if \(error\) throw/, "o citire cazuta a magazinului nu devine „magazin inexistent”");

  const ruta = codul(RUTA);
  assert.match(ruta, /status: 503/);
  assert.match(ruta, /"cache-control": "no-store"/);
  assert.match(ruta, /if \(!citit \|\| !citit\.publicat\) return new Response\("Not found", \{ status: 404 \}\)/);
});

test("cifrele vin din aceleasi locuri ca pagina produsului si finalizarea comenzii", () => {
  const citiri = codul(CITIRI);
  assert.match(citiri, /parseTimpDeLivrare\(/);
  assert.match(citiri, /fereastraDeLivrare\(timp\)\.max/);
  assert.match(citiri, /pragTransportGratuit\(setari\.free_shipping_threshold\)/);
  assert.match(citiri, /prices_include_vat: setari\.prices_include_vat !== false/);
  assert.match(citiri, /disponibilitatePachet\(/);
  /* Din `page_content` se cer numai caile folosite, nu tot designul magazinului. */
  assert.match(citiri, /permalinks:page_content->permalinks/);
  assert.doesNotMatch(citiri, /store_settings\(\*\)|, page_content[,)]/);

  const generator = codul("src/lib/compari/feed.ts");
  assert.match(generator, /getProductPriceRange\(/);
  assert.match(generator, /pretBrut\(/);
  assert.match(generator, /pretulDinCatalogMinte\(/);
});

test("⚠ ruta si panoul citesc prin ACELEASI functii, nu fiecare cu regula lui", () => {
  for (const fisier of [RUTA, ACTIUNE, PAGINA]) {
    const cod = codul(fisier);
    assert.match(cod, /magazinulPentruCompari\(/, fisier);
    /* Niciunul nu citeste produsele sau setarile pe cont propriu. */
    assert.doesNotMatch(cod, /\.from\("products"\)|\.from\("store_settings"\)/, fisier);
  }
  assert.match(codul(RUTA), /produselePentruCompari\(/);
  assert.match(codul(ACTIUNE), /produselePentruCompari\(/);
  assert.match(codul(ACTIUNE), /rezumatulFeeduluiCompari\(/);
});

test("adresa feedului e rezervata: nicio pagina a magazinului nu o poate lua", () => {
  assert.ok(RESERVED_PAGE_SLUGS.has("compari.xml"));
});

/* ═══ Ce i se spune comerciantului ═══ */

test("rezumatul numara ce pleaca, ce ascunde Compari si ce ramane afara, pe TOATE produsele", () => {
  const produse = [
    produs({ id: "a" }),
    produs({ id: "b", stock_quantity: 0 }),
    produs({ id: "c", images: [], name: "Fara poza 1" }),
    produs({ id: "d", images: [], name: "Fara poza 2" }),
    produs({ id: "e", category: null, name: "Fara categorie" }),
  ];
  const r = rezumatulFeeduluiCompari(magazin(), produse, 2);
  assert.equal(r.active, 5);
  assert.equal(r.inFeed, 2, "epuizatul e in feed");
  assert.equal(r.epuizate, 1);
  assert.equal(r.lasate, 3, "numarul e pe toate, nu doar pe cele aratate");
  assert.deepEqual(r.exemple, [
    { id: "c", name: "Fara poza 1", motiv: "fara-imagine" },
    { id: "d", name: "Fara poza 2", motiv: "fara-imagine" },
  ]);
  /* Aceeasi hotarare ca generatorul: ce numara rezumatul „in feed” e exact ce construieste el. */
  const construite = produse.filter((p) => construiesteArticolCompari(magazin(), p, faraCale)).length;
  assert.equal(r.inFeed, construite);
  assert.equal(r.inFeed + r.lasate, r.active);
});

test("fiecare motiv are textul lui, cu diacritice, si niciunul in plus", () => {
  const motive: MotivLipsaCompari[] = ["pret-care-minte", "fara-imagine", "fara-categorie", "fara-pret"];
  assert.deepEqual(Object.keys(MOTIVE_COMPARI).sort(), [...motive].sort());
  for (const m of motive) {
    assert.ok(MOTIVE_COMPARI[m].eticheta.length > 5 && MOTIVE_COMPARI[m].explicatie.length > 30, m);
  }
  assert.match(MOTIVE_COMPARI["fara-imagine"].explicatie, /poză/);
});

/* ═══ Legata peste tot ═══ */

test("⚠ actiunea din panou isi verifica omul inainte de citirea cu cheia de serviciu", () => {
  const cod = codul(ACTIUNE);
  assert.ok(sursa(ACTIUNE).startsWith('"use server";'));
  const iOm = cod.indexOf("auth.getUser()");
  const iServiciu = cod.indexOf("createAdminClient()");
  assert.ok(iOm > 0 && iServiciu > iOm, "intai omul, apoi cheia de serviciu");
  assert.match(cod, /\.eq\("user_id", user\.id\)/);
  assert.match(cod, /magazinulPentruCompari\(admin, \{ id: biz\.id \}\)/, "magazinul vine din sesiune, nu din cerere");
  /* Un singur export: fiecare export dintr-un fisier „use server” e un punct de intrare din browser. */
  assert.deepEqual([...cod.matchAll(/^export /gm)].length, 1);
  assert.match(cod, /export async function rezumatulFeeduluiCompariAlMeu\(\)/, "fara argumente venite din browser");
});

test("pagina din panou gaseste magazinul cu clientul omului si da adresa feedului de pe domeniul lui", () => {
  const cod = codul(PAGINA);
  assert.match(cod, /getCachedUser\(\)/);
  assert.match(cod, /\.eq\("user_id", user\.id\)/);
  assert.match(cod, /feedUrl=\{`\$\{baza\}\/compari\.xml`\}/);
  assert.match(cod, /storeBaseUrl\(/);
});

test("cardul din Integrari e viu: are id, adresa, sigla, ghid si e „activa” in catalogul site-ului", () => {
  const hub = codul(HUB);
  assert.match(hub, /\{ name: "Compari\.ro",\s+logo: "\/integrations\/compari\.ro\.png", id: "compari" \}/);
  assert.doesNotMatch(hub, /name: "Compari\.ro"[^}]*soon: true/);
  assert.ok(hub.includes('integration.id === "compari" ? "/dashboard/features/compari"'));
  assert.ok(hub.includes('|| integration.id === "compari"'));

  assert.match(codul("src/components/dashboard/IntegrationHeader.tsx"), /compari: \{ src: "\/integrations\/compari\.ro\.png", alt: "Compari\.ro" \}/);
  assert.ok(ghidulIntegrarii("compari")?.endsWith("/cum-listezi-produsele-in-compari"));
  assert.equal(INTEGRARI.find((i) => i.cheie === "compari")?.stare, "activa");
  assert.match(codul("src/components/dashboard/CompariClient.tsx"), /<PaginaIntegrare\s+id="compari"/);
});
