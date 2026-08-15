import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { canonicalPagina, construiesteDateCatalog, titluSiDescriere } from "./date-catalog";
import type { FiltreCitite } from "./url";
import type { StorefrontProduct } from "@/lib/storefront/product.types";

/*
 * ⚠ DE CE EXISTA FISIERUL ASTA.
 *
 * Regulile de mai jos nu cad niciodata singure. O pagina de categorie cu date
 * structurate gresite arata identic cu una corecta, raspunde 200, trece de
 * `tsc`, de build si de ochiul comerciantului. Se afla ori din Search Console,
 * ori niciodata — exact semnatura defectelor pentru care exista santinela.
 *
 * Doua dintre probele de aici apara defecte care CHIAR au fost scrise si prinse
 * abia la a doua trecere peste propriile modificari:
 *   - lista de produse a unei adrese FILTRATE, lipita pe canonicalul catalogului
 *     intreg (`/magazin?q=bocanci` afirmand ce contine `/magazin`);
 *   - coperta magazinului declarata drept „imaginea principala a paginii" pe o
 *     pagina care n-o deseneaza niciodata.
 */

const BUSINESS = {
  slug: "caian-textile",
  custom_domain: null as string | null,
  business_name: "SC CAIAN SRL",
  store_name: "Caian Textile",
  store_city: "Bucuresti",
  cover_url: "https://cdn.tld/coperta.webp",
  is_published: true,
};

const FARA_FILTRE: FiltreCitite = {
  categorie: "", cautare: "", pagina: 1, sortare: "",
  reduceri: false, stoc: false, pretMin: "", pretMax: "", fatete: {},
};

const produs = (slug: string, nume: string): StorefrontProduct => ({
  id: `id-${slug}`, name: nume, slug, description: null, price: 100, compare_at_price: null,
  images: [`https://cdn.tld/${slug}.webp`], category: "Prosoape", is_featured: false, is_active: true,
  is_bundle: false, track_inventory: false, stock_quantity: null, sort_order: 0,
  created_at: "2026-01-01", business_id: "", page_sections: null, weight_grams: null,
  price_range: { min: 100, max: 100, hasRange: false, faraOferta: false },
  fara_stoc: false,
} as unknown as StorefrontProduct);

/** Nodurile emise, cu `@graph` desfacut — ca in santinela. */
function noduri(iesire: string | null): Record<string, unknown>[] {
  if (!iesire) return [];
  // `jsonLdSafe` escapeaza `<`, `>` si `&` ca `\uXXXX`; JSON.parse le citeste inapoi.
  const o = JSON.parse(iesire) as Record<string, unknown>;
  return Array.isArray(o["@graph"]) ? (o["@graph"] as Record<string, unknown>[]) : [o];
}

const nod = (iesire: string | null, tip: string) =>
  noduri(iesire).find((n) => n["@type"] === tip) as Record<string, unknown> | undefined;

const argumente = (peste: Partial<Parameters<typeof construiesteDateCatalog>[0]> = {}) => ({
  business: BUSINESS,
  seo: {},
  setari: { titlu: "Toate produsele" },
  sp: {} as Record<string, string | string[] | undefined>,
  filtre: FARA_FILTRE,
  numeCategorie: "",
  parinteCategorie: null,
  products: [],
  reusitPeServer: false,
  esteCiorna: false,
  ...peste,
});

describe("cand NU se emite nimic", () => {
  test("ciorna sau magazin nepublicat", () => {
    assert.equal(construiesteDateCatalog(argumente({ esteCiorna: true })), null);
  });

  test("magazinul cerut `noindex` din Setari > SEO", () => {
    assert.equal(construiesteDateCatalog(argumente({ seo: { noindex: true } })), null);
  });

  test("`?cat=` — forma veche, al carei canonical arata in ALTA parte", () => {
    assert.equal(construiesteDateCatalog(argumente({ sp: { cat: "Prosoape" } })), null);
  });

  test("doua filtre in plus — pagina e deja `noindex` in <head>", () => {
    // `canonicalCatalog` da `indexabila: false` de la doua filtre in plus incolo.
    const iesire = construiesteDateCatalog(argumente({ sp: { q: "prosop", stoc: "1", pmin: "10" } }));
    assert.equal(iesire, null);
  });
});

describe("catalogul intreg", () => {
  const iesire = construiesteDateCatalog(argumente());

  test("emite CollectionPage pe canonicalul lui", () => {
    const c = nod(iesire, "CollectionPage")!;
    assert.equal(c.url, "https://www.edinio.com/caian-textile/magazin");
    assert.equal(c.name, "Toate produsele");
    assert.equal(c.inLanguage, "ro-RO");
  });

  test("⚠ NU declara coperta magazinului ca imagine a paginii", () => {
    // Coperta nu se randeaza niciodata pe suprafata de catalog; declarata,
    // ar fi fost aceeasi poza pe toate paginile de categorie, si niciuna n-o arata.
    const c = nod(iesire, "CollectionPage")!;
    assert.ok(!("primaryImageOfPage" in c), "pagina nu are imagine principala de declarat");
  });

  test("firimituri de doua trepte: magazinul si catalogul", () => {
    const f = nod(iesire, "BreadcrumbList") as { itemListElement: { name: string; item: string }[] };
    assert.deepEqual(f.itemListElement.map((e) => e.name), ["Caian Textile", "Toate produsele"]);
  });

  test("magazinul e REFERIT, nu redeclarat cu alte date", () => {
    const m = nod(iesire, "Organization")!;
    assert.equal(m["@id"], "https://www.edinio.com/caian-textile#magazin");
    assert.ok(!("address" in m), "nodul intreg sta pe pagina principala, nu aici");
  });
});

describe("pagina unei categorii", () => {
  const iesire = construiesteDateCatalog(argumente({
    numeCategorie: "Prosoape Hotel",
    parinteCategorie: "PROSOAPE",
  }));

  test("se numeste dupa categoria REALA, nu dupa segmentul din adresa", () => {
    const c = nod(iesire, "CollectionPage")!;
    assert.equal(c.name, "Prosoape Hotel");
    assert.equal(c.url, "https://www.edinio.com/caian-textile/magazin/prosoape-hotel");
  });

  test("firimiturile poarta si treapta parintelui", () => {
    const f = nod(iesire, "BreadcrumbList") as { itemListElement: { name: string; item: string }[] };
    assert.deepEqual(f.itemListElement.map((e) => e.name),
      ["Caian Textile", "Toate produsele", "PROSOAPE", "Prosoape Hotel"]);
    assert.equal(f.itemListElement[2].item, "https://www.edinio.com/caian-textile/magazin/prosoape");
  });

  test("pe domeniu propriu, toate adresele sunt ale domeniului", () => {
    const c = nod(construiesteDateCatalog(argumente({
      business: { ...BUSINESS, custom_domain: "caian-textile.ro" },
      numeCategorie: "Prosoape Hotel",
    })), "CollectionPage")!;
    assert.equal(c.url, "https://caian-textile.ro/magazin/prosoape-hotel");
  });
});

describe("lista de produse", () => {
  const produse = [produs("prosop-alb", "Prosop alb"), produs("prosop-gri", "Prosop gri")];

  test("⚠ pe palierul CLIENT nu se emite: `products` e catalogul INTREG, nu felia paginii", () => {
    const c = nod(construiesteDateCatalog(argumente({
      numeCategorie: "Prosoape Hotel", products: produse, reusitPeServer: false,
    })), "CollectionPage")!;
    assert.ok(!("mainEntity" in c), "ar fi declarat drept membri ai raftului produse din alte rafturi");
  });

  test("pe palierul server se emite felia randata", () => {
    const c = nod(construiesteDateCatalog(argumente({
      numeCategorie: "Prosoape Hotel", products: produse, reusitPeServer: true,
    })), "CollectionPage")!;
    const lista = c.mainEntity as { numberOfItems: number; itemListElement: Record<string, unknown>[] };
    assert.equal(lista.numberOfItems, 2);
    assert.equal(lista.itemListElement[0].url, "https://www.edinio.com/caian-textile/product/prosop-alb");
  });

  test("produsele fara slug cad — adresa cu uuid ar fi o redirectare", () => {
    const faraSlug = { ...produs("x", "Fara slug"), slug: null } as unknown as StorefrontProduct;
    const c = nod(construiesteDateCatalog(argumente({
      products: [produse[0], faraSlug], reusitPeServer: true,
    })), "CollectionPage")!;
    assert.equal((c.mainEntity as { numberOfItems: number }).numberOfItems, 1);
  });

  /*
   * ⚠ PROBA CENTRALA A FISIERULUI.
   *
   * `canonicalCatalog` pastreaza in canonical doar `cat`, `sale` si `page`.
   * Cautarea, fatetele, pretul, stocul si sortarea nu intra in adresa si NICI nu
   * fac pagina `noindex` — dar taie produsele pe server. Deci lista lor s-ar fi
   * lipit pe `@id`-ul catalogului INTREG.
   */
  const filtreCareTaie: [string, Partial<FiltreCitite>][] = [
    ["cautare", { cautare: "bocanci" }],
    ["doar in stoc", { stoc: true }],
    ["pret minim", { pretMin: "100" }],
    ["pret maxim", { pretMax: "500" }],
    ["sortare", { sortare: "price_asc" }],
    ["fateta", { fatete: { Brand: ["ARDON"] } }],
  ];
  for (const [nume, patch] of filtreCareTaie) {
    test(`⚠ ${nume}: pagina ramane descrisa, dar FARA lista`, () => {
      const c = nod(construiesteDateCatalog(argumente({
        products: produse, reusitPeServer: true, filtre: { ...FARA_FILTRE, ...patch },
      })), "CollectionPage")!;
      assert.ok(c, "nodul de pagina ramane: numele si firimiturile sunt adevarate pentru canonical");
      assert.ok(!("mainEntity" in c), `lista filtrata dupa ${nume} s-ar fi lipit pe canonicalul NEfiltrat`);
    });
  }

  test("`sale` si `page` NU opresc lista: pe amandoua le poarta canonicalul", () => {
    const c = nod(construiesteDateCatalog(argumente({
      products: produse, reusitPeServer: true,
      sp: { sale: "1", page: "2" },
      filtre: { ...FARA_FILTRE, reduceri: true, pagina: 2 },
    })), "CollectionPage")!;
    assert.ok("mainEntity" in c);
    assert.equal(c.url, "https://www.edinio.com/caian-textile/magazin?sale=1&page=2");
  });
});

describe("canonicalPagina si titluSiDescriere", () => {
  test("categoria intra in CALE, niciodata in interogare", () => {
    const { url } = canonicalPagina("https://a.tld", "Prosoape Hotel", { cat: "Prosoape Hotel" });
    assert.equal(url, "https://a.tld/magazin/prosoape-hotel");
  });

  test("titlul si descrierea sunt aceleasi pe care le pune <head>", () => {
    const t = titluSiDescriere({}, "Prosoape", "Caian Textile", "Bucuresti");
    assert.equal(t.titlu, "Prosoape | Caian Textile");
    assert.ok(t.descriere.startsWith("Prosoape de la Caian Textile"));

    const fara = titluSiDescriere({}, "", "Caian Textile", "Bucuresti");
    assert.equal(fara.titlu, "Toate produsele | Caian Textile");
  });

  test("descrierea scrisa de comerciant bate implicitul", () => {
    const t = titluSiDescriere({ description: "A mea" }, "Prosoape", "X", null);
    assert.equal(t.descriere, "A mea");
  });
});
