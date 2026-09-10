import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import {
  canonicalPagina, construiesteDateCatalog, descriereProprieAPaginii, emiteDateCatalog, metadataCatalog,
  titluSiDescriere,
} from "./date-catalog";
import type { ContextDescriere } from "./descriere-generata";
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
 *
 * A treia apara reclamatia caian-textile.ro (10.09.2026): catalogul si fiecare
 * categorie purtau descrierea PAGINII PRINCIPALE, din Setari > SEO. Proba de aici
 * o fixa ca regula („descrierea scrisa de comerciant bate implicitul"); acum e
 * intoarsa.
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

/** Contextul unei pagini ale carei date n-au putut fi citite: doar deschiderea. */
const CONTEXT_NECITIT: ContextDescriere = { parinte: null, subcategorii: [], continut: null, faraTva: false, reduceri: false };

/** Un context oarecare, cu produse. */
const CONTEXT_CU_PRODUSE: ContextDescriere = {
  parinte: null, subcategorii: [], faraTva: false, reduceri: false,
  continut: { numar: 12, pretMinim: 19.9, interval: false, produse: ["Prosop alb"] },
};

/*
 * Datele REALE caian-textile.ro, citite pe 10.09.2026 (vezi `descriere-generata.test.ts`):
 * descrierea paginii principale din Setari > SEO, subtitlul paginii de catalog, si ce
 * a raspuns `catalog_pagina` pentru „Prosoape Salon & Beauty" si pentru catalogul intreg.
 */
const DESCRIERE_ACASA_CAIAN = "Textile hoteliere CAIAN: prosoape, lenjerii de pat și protecții saltea 100% bumbac, certificate OEKO-TEX. Livrare rapidă în România, prețuri speciale HoReCa.";
const SUBTITLU_CAIAN = "Prosoape, lenjerii de pat si protectii saltea certificate OEKO-TEX, pentru hoteluri, pensiuni si uz casnic.";
const CONTEXT_SALON: ContextDescriere = {
  parinte: "PROSOAPE", subcategorii: [], faraTva: false, reduceri: false,
  continut: {
    numar: 9, pretMinim: 8.63, interval: false,
    produse: ["Prosop CAIAN Greek Border Verde 70x130 cm - 500 GSM", "Prosop CAIAN Greek Border Verde 30x50 cm - 500 GSM", "Prosop CAIAN Greek Border Verde 50x90 cm - 500 GSM"],
  },
};
const CONTEXT_CATALOG_CAIAN: ContextDescriere = {
  parinte: null, faraTva: false, reduceri: false,
  subcategorii: ["PROSOAPE", "LENJERII DE PAT", "PERNE SI PILOTE", "HALATE SI PAPUCI", "PROTECTII SI ACCESORII"],
  continut: {
    numar: 41, pretMinim: 2.1, interval: false,
    produse: ["Husa de Pat CAIAN Elastic Jersey 100% Bumbac 140x200 cm Alb", "Protectie Saltea Caian Impermeabila cu Fermoar 180x200 cm Alba", "Protectie Saltea Caian Impermeabila cu Fermoar 90x200 cm Alba"],
  },
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

const argumente = (peste: Partial<Parameters<typeof construiesteDateCatalog>[0]> = {}): Parameters<typeof construiesteDateCatalog>[0] => ({
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
  esteCautare: false,
  subarboreCuProduse: null,
  descriere: CONTEXT_NECITIT,
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

  test("⚠ `/cautare`: pagina e `noindex`, iar CollectionPage ar fi descris catalogul intreg", () => {
    // Live pe 10.09.2026: `caian-textile.ro/cautare?q=prosop` emitea CollectionPage.
    assert.equal(construiesteDateCatalog(argumente({ esteCautare: true, sp: { q: "prosop" } })), null);
  });

  test("decizia 6: categoria fara niciun produs e `noindex`, deci nu se descrie", () => {
    assert.equal(construiesteDateCatalog(argumente({ numeCategorie: "HOME & DECO", subarboreCuProduse: false })), null);
    // `null` = rezumatul lipseste: nu stim, deci pagina ramane descrisa.
    assert.ok(construiesteDateCatalog(argumente({ numeCategorie: "HOME & DECO", subarboreCuProduse: null })));
    assert.ok(construiesteDateCatalog(argumente({ numeCategorie: "PROSOAPE", subarboreCuProduse: true })));
  });
});

describe("emiteDateCatalog: predicatul pe care il intreaba randarea INAINTE de a cere contextul", () => {
  const cazuri: [string, Partial<Parameters<typeof construiesteDateCatalog>[0]>, boolean][] = [
    ["catalogul curat", {}, true],
    ["categoria curata", { numeCategorie: "Prosoape Hotel" }, true],
    ["ciorna", { esteCiorna: true }, false],
    ["noindex din Setari > SEO", { seo: { noindex: true } }, false],
    ["cautarea", { esteCautare: true }, false],
    ["?cat=", { sp: { cat: "Prosoape" } }, false],
    ["?cat= tablou", { sp: { cat: ["Prosoape", "Altceva"] } }, false],
    ["categoria fara produse", { numeCategorie: "Goala", subarboreCuProduse: false }, false],
    ["doua filtre in plus", { sp: { q: "a", stoc: "1" } }, false],
    ["sale si page raman descrise", { sp: { sale: "1", page: "2" } }, true],
  ];
  for (const [nume, peste, asteptat] of cazuri) {
    test(`${nume}: ${asteptat}, si exact cand construiesteDateCatalog emite`, () => {
      const a = argumente(peste);
      assert.equal(emiteDateCatalog(a), asteptat);
      assert.equal(construiesteDateCatalog(a) !== null, asteptat);
    });
  }
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

describe("⚠ descrierea paginii principale NU mai ajunge pe catalog si pe categorii (caian-textile.ro)", () => {
  const caian = { ...BUSINESS, custom_domain: "caian-textile.ro", store_name: "CAIAN TEXTILE" };

  test("categoria primeste textul ei, generat din date, nu pe cel din Setari > SEO", () => {
    const c = nod(construiesteDateCatalog(argumente({
      business: caian,
      seo: { description: DESCRIERE_ACASA_CAIAN },
      numeCategorie: "Prosoape Salon & Beauty",
      parinteCategorie: "PROSOAPE",
      descriere: CONTEXT_SALON,
    })), "CollectionPage")!;
    assert.equal(
      c.description,
      "Prosoape Salon & Beauty (PROSOAPE) la CAIAN TEXTILE, de la 8,63 lei. Printre produse: Prosop CAIAN Greek Border Verde 70x130 cm - 500 GSM.",
    );
    assert.ok(!String(c.description).includes("Textile hoteliere"), "descrierea paginii principale s-a intors");
  });

  test("catalogul fara text propriu: textul generat, cu categoriile lui", () => {
    const c = nod(construiesteDateCatalog(argumente({
      business: caian,
      seo: { description: DESCRIERE_ACASA_CAIAN },
      descriere: CONTEXT_CATALOG_CAIAN,
    })), "CollectionPage")!;
    assert.equal(
      c.description,
      "Catalogul CAIAN TEXTILE: 41 de produse în 5 categorii, printre care PROSOAPE, LENJERII DE PAT, PERNE SI PILOTE și HALATE SI PAPUCI.",
    );
  });

  test("catalogul cu subtitlu propriu (decizia 5): subtitlul, tot nu Setari > SEO", () => {
    const seo = { description: DESCRIERE_ACASA_CAIAN };
    const descriereProprie = descriereProprieAPaginii({
      numeCategorie: "", descriereCategorie: null, subtitlu: SUBTITLU_CAIAN, seo, business: { tagline: null, description: null }, displayName: "CAIAN TEXTILE",
    });
    const c = nod(construiesteDateCatalog(argumente({
      business: caian, seo, descriere: CONTEXT_CATALOG_CAIAN, descriereProprie,
    })), "CollectionPage")!;
    assert.equal(c.description, SUBTITLU_CAIAN);
  });
});

describe("descriereProprieAPaginii (decizia 5)", () => {
  const baza = { descriereCategorie: null, subtitlu: SUBTITLU_CAIAN, seo: { description: DESCRIERE_ACASA_CAIAN }, business: { tagline: null, description: null }, displayName: "CAIAN TEXTILE" };

  test("pe categorie fara text scris: nimic, deci ramane textul generat", () => {
    assert.equal(descriereProprieAPaginii({ ...baza, numeCategorie: "PROSOAPE" }), null);
  });

  test("etapa 2: pe categorie, textul scris de comerciant; niciodata subtitlul catalogului", () => {
    const scris = "Prosoape hoteliere de 500 GSM, pentru hoteluri si pensiuni.";
    assert.equal(descriereProprieAPaginii({ ...baza, numeCategorie: "PROSOAPE", descriereCategorie: scris }), scris);
  });

  test("pe catalog, un text de categorie ratacit nu conteaza: tot subtitlul (decizia 5)", () => {
    assert.equal(descriereProprieAPaginii({ ...baza, numeCategorie: "", descriereCategorie: "Text de categorie" }), SUBTITLU_CAIAN);
  });

  test("subtitlul diferit de descrierea paginii principale: el", () => {
    assert.equal(descriereProprieAPaginii({ ...baza, numeCategorie: "" }), SUBTITLU_CAIAN);
  });

  test("subtitlul copiat din Setari > SEO nu se foloseste", () => {
    assert.equal(descriereProprieAPaginii({ ...baza, numeCategorie: "", subtitlu: DESCRIERE_ACASA_CAIAN }), null);
  });

  test("fara Setari > SEO, comparatia e cu descrierea DERIVATA a paginii principale (sloganul)", () => {
    const slogan = "Prosoape hoteliere de la producator";
    assert.equal(descriereProprieAPaginii({
      numeCategorie: "", descriereCategorie: null, subtitlu: slogan, seo: {}, business: { tagline: slogan, description: null }, displayName: "CAIAN TEXTILE",
    }), null);
  });

  test("fara subtitlu: nimic", () => {
    assert.equal(descriereProprieAPaginii({ ...baza, numeCategorie: "", subtitlu: "" }), null);
  });
});

describe("canonicalPagina si titluSiDescriere", () => {
  test("categoria intra in CALE, niciodata in interogare", () => {
    const { url } = canonicalPagina("https://a.tld", "Prosoape Hotel", { cat: "Prosoape Hotel" });
    assert.equal(url, "https://a.tld/magazin/prosoape-hotel");
  });

  test("titlul si descrierea sunt aceleasi pe care le pune <head>", () => {
    const t = titluSiDescriere("Prosoape", "Caian Textile", CONTEXT_CU_PRODUSE);
    assert.equal(t.titlu, "Prosoape | Caian Textile");
    assert.equal(t.descriere, "Prosoape la Caian Textile: 12 produse, de la 19,90 lei. Printre produse: Prosop alb.");

    const fara = titluSiDescriere("", "Caian Textile", CONTEXT_CU_PRODUSE);
    assert.equal(fara.titlu, "Toate produsele | Caian Textile");
    assert.equal(fara.descriere, "Catalogul Caian Textile: 12 produse.");
  });

  test("textul propriu castiga cand nu e gol; pe reduceri, nu", () => {
    assert.equal(titluSiDescriere("", "X", CONTEXT_CU_PRODUSE, "Textul meu").descriere, "Textul meu");
    assert.equal(titluSiDescriere("", "X", CONTEXT_CU_PRODUSE, "   ").descriere, "Catalogul X: 12 produse.");
    assert.equal(
      titluSiDescriere("", "X", { ...CONTEXT_CU_PRODUSE, reduceri: true }, "Textul meu").descriere,
      "Reduceri: Catalogul X: 12 produse.",
    );
  });
});

/** Caile din `m` la care sta o valoare `undefined`: in Next 16, o asemenea cheie STERGE mostenirea. */
function nedefinite(m: unknown, cale = ""): string[] {
  if (m === undefined) return [cale || "(radacina)"];
  if (m === null || typeof m !== "object") return [];
  return Object.entries(m as Record<string, unknown>).flatMap(([k, v]) => nedefinite(v, cale ? `${cale}.${k}` : k));
}

describe("metadataCatalog", () => {
  const ARGS = {
    titlu: "Prosoape | CAIAN TEXTILE", descriere: "Descrierea", displayName: "CAIAN TEXTILE",
    url: "https://caian-textile.ro/magazin/prosoape", indexabila: true, noindex: false, images: ["https://cdn.tld/c.webp"],
  };

  /*
   * Numele reale: spatii duble (atelierullarisei.ro, unde meta difera de JSON-LD pe
   * 10.09.2026) si un `<` care arata a eticheta. Pe amandoua, cele patru locuri trebuie
   * sa spuna ACELASI text, prin constructie: o singura trecere prin `textCurat`.
   */
  for (const nume of ["Brichetă personalizată  /  Scrumieră personalizată", "Saci <60L>"]) {
    test(`meta = og = twitter = CollectionPage, pe „${nume}”`, () => {
      const magazin = "Atelierul Larisei - cadouri unice";
      const ctx: ContextDescriere = { ...CONTEXT_CU_PRODUSE, parinte: "Obiecte personalizate" };
      const { titlu, descriere } = titluSiDescriere(nume, magazin, ctx);
      const m = metadataCatalog({ ...ARGS, titlu, descriere, displayName: magazin });
      const c = nod(construiesteDateCatalog(argumente({
        business: { ...BUSINESS, store_name: magazin }, numeCategorie: nume, descriere: ctx,
      })), "CollectionPage")!;
      assert.ok(typeof m.description === "string" && m.description.length > 0);
      assert.equal((m.openGraph as { description?: string }).description, m.description);
      assert.equal((m.twitter as { description?: string }).description, m.description);
      assert.equal(c.description, m.description);
      assert.ok(!String(m.description).includes("  "), String(m.description));
    });
  }

  test("og si twitter COMPLETE: Next inlocuieste obiectul intreg al layout-ului", () => {
    const m = metadataCatalog(ARGS);
    assert.deepEqual(m.openGraph, {
      type: "website", locale: "ro_RO", siteName: "CAIAN TEXTILE", title: ARGS.titlu,
      description: "Descrierea", url: ARGS.url, images: ARGS.images,
    });
    assert.deepEqual(m.twitter, { card: "summary_large_image", title: ARGS.titlu, description: "Descrierea", images: ARGS.images });
    assert.deepEqual(m.alternates, { canonical: ARGS.url });
    assert.deepEqual(m.title, { absolute: ARGS.titlu });
    assert.ok(!("robots" in m), "o pagina indexabila nu-si declara robots: il mosteneste");
  });

  test("titlul din fila poate diferi de cel partajat (termenul cautat)", () => {
    const m = metadataCatalog({ ...ARGS, titluFila: `Rezultate pentru „prosop” · CAIAN TEXTILE` });
    assert.deepEqual(m.title, { absolute: `Rezultate pentru „prosop” · CAIAN TEXTILE` });
    assert.equal((m.openGraph as { title?: string }).title, ARGS.titlu);
    assert.equal((m.twitter as { title?: string }).title, ARGS.titlu);
  });

  test("noindex sau neindexabila: `noindex, follow`", () => {
    assert.deepEqual(metadataCatalog({ ...ARGS, noindex: true }).robots, { index: false, follow: true });
    assert.deepEqual(metadataCatalog({ ...ARGS, indexabila: false }).robots, { index: false, follow: true });
  });

  test("⚠ nicio valoare `undefined`, pe nicio ramura", () => {
    for (const noindex of [true, false]) {
      for (const indexabila of [true, false]) {
        for (const images of [[], ["https://cdn.tld/c.webp"]]) {
          for (const titluFila of [undefined, "Fila"]) {
            const m = metadataCatalog({ ...ARGS, noindex, indexabila, images, ...(titluFila ? { titluFila } : {}) });
            assert.deepEqual(nedefinite(m), [], JSON.stringify({ noindex, indexabila, images, titluFila }));
          }
        }
      }
    }
    // Fara imagini: nici cheia `images` in twitter, nu `images: undefined`.
    assert.ok(!("images" in (metadataCatalog({ ...ARGS, images: [] }).twitter as object)));
  });
});
