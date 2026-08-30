import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { autorPagina, curataSeoPagina, dataPublicarii, imaginePagina, intrebariPagina, tipPagina } from "./pagina-seo";
import type { Block, PageSeo } from "./blocks.types";

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * `custom_pages.seo` e o coloana `Json`. Tipul `PageSeo` descrie ce ne asteptam
 * sa gasim acolo, nu ce se afla: randurile de dinainte de campul `tip` n-au
 * niciunul dintre campurile noi, iar de acolo valorile pleaca direct catre
 * `@type` intr-un `<script type="application/ld+json">` public.
 *
 * Si a doua clasa de defect, cea tacuta: o pagina construita cu coloane CLASICE
 * (paginile vechi) isi tine imaginea intr-un loc pe care `flattenBlocks` nu-l
 * viziteaza. Cine se bazeaza doar pe el n-o gaseste niciodata, si nimic nu cade.
 */

const bloc = (b: Partial<Block> & { type: Block["type"] }) => ({ id: "b1", ...b }) as Block;

describe("tipul paginii", () => {
  test("lipsa inseamna „pagina", () => {
    assert.equal(tipPagina(undefined), "pagina");
    assert.equal(tipPagina({}), "pagina");
    assert.equal(tipPagina(null), "pagina");
  });

  test("valoarea necunoscuta NU ajunge in JSON-LD", () => {
    assert.equal(tipPagina({ tip: "Product" } as unknown as PageSeo), "pagina");
    assert.equal(tipPagina({ tip: 42 } as unknown as PageSeo), "pagina");
  });

  test("valorile cunoscute trec", () => {
    assert.equal(tipPagina({ tip: "articol" }), "articol");
    assert.equal(tipPagina({ tip: "lista-articole" }), "lista-articole");
    assert.equal(tipPagina({ tip: "colectie" }), "colectie");
  });
});

describe("data publicarii", () => {
  test("cea declarata bate data crearii", () => {
    assert.equal(dataPublicarii({ dataPublicarii: "2020-01-05" }, "2026-07-01T00:00:00Z"), "2020-01-05");
  });

  test("fara declaratie ramane data crearii", () => {
    assert.equal(dataPublicarii({}, "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z");
  });

  test("o declaratie invalida NU inlocuieste data crearii", () => {
    assert.equal(dataPublicarii({ dataPublicarii: "acum doi ani" }, "2026-07-01T00:00:00Z"), "2026-07-01T00:00:00Z");
  });
});

describe("imaginea reprezentativa", () => {
  test("cea incarcata anume pentru distribuire bate orice bloc", () => {
    const blocks = [bloc({ type: "image", src: "https://cdn.tld/din-bloc.webp" })];
    assert.equal(imaginePagina({ ogImage: "https://cdn.tld/og.webp" }, blocks), "https://cdn.tld/og.webp");
  });

  test("altfel, prima imagine de pe pagina, in ordinea blocurilor", () => {
    const blocks = [
      bloc({ type: "heading", text: "T" }),
      bloc({ type: "hero", bgImage: "https://cdn.tld/hero.webp" }),
      bloc({ type: "image", src: "https://cdn.tld/img.webp" }),
    ];
    assert.equal(imaginePagina({}, blocks), "https://cdn.tld/hero.webp");
  });

  test("galeria: si forma noua, si cea veche", () => {
    assert.equal(
      imaginePagina({}, [bloc({ type: "gallery", items: [{ src: "https://cdn.tld/g1.webp" }] })]),
      "https://cdn.tld/g1.webp",
    );
    assert.equal(
      imaginePagina({}, [bloc({ type: "gallery", images: ["https://cdn.tld/vechi.webp"] })]),
      "https://cdn.tld/vechi.webp",
    );
  });

  test("de la video se ia POSTERUL, nu fisierul video", () => {
    const blocks = [bloc({ type: "video", src: "https://cdn.tld/film.mp4", poster: "https://cdn.tld/p.webp" })];
    assert.equal(imaginePagina({}, blocks), "https://cdn.tld/p.webp");
  });

  test("⚠ imaginea unei coloane CLASICE se gaseste (flattenBlocks n-o viziteaza)", () => {
    const blocks = [bloc({ type: "columns", items: [{ heading: "A", image: "https://cdn.tld/col.webp" }] })];
    assert.equal(imaginePagina({}, blocks), "https://cdn.tld/col.webp");
  });

  test("imaginea unui bloc din coloana FLEXIBILA se gaseste si ea", () => {
    const blocks = [bloc({
      type: "columns",
      items: [{ blocks: [bloc({ type: "image", src: "https://cdn.tld/nested.webp" })] }],
    })];
    assert.equal(imaginePagina({}, blocks), "https://cdn.tld/nested.webp");
  });

  test("fara nicio imagine intoarce sirul gol, nu o inventeaza", () => {
    assert.equal(imaginePagina({}, [bloc({ type: "text", html: "<p>x</p>" })]), "");
  });
});

describe("intrebarile frecvente de pe pagina", () => {
  test("se strang din toate blocurile faq, inclusiv din coloane", () => {
    const blocks = [
      bloc({ type: "faq", items: [{ q: "Q1", a: "A1" }, { q: "", a: "fara intrebare" }] }),
      bloc({ type: "columns", items: [{ blocks: [bloc({ type: "faq", items: [{ q: "Q2", a: "A2" }] })] }] }),
    ];
    assert.deepEqual(intrebariPagina(blocks).map((p) => p.q), ["Q1", "Q2"]);
  });

  test("o pagina fara bloc faq nu produce nimic", () => {
    assert.deepEqual(intrebariPagina([bloc({ type: "text", html: "Intrebari?" })]), []);
  });
});

describe("curatarea la salvare", () => {
  test("tipul necunoscut nu ajunge in coloana", () => {
    const out = curataSeoPagina({ tip: "Product" } as unknown as PageSeo);
    assert.ok(!("tip" in out), "implicitul nu se scrie deloc");
  });

  test("autorul si data raman DOAR pe articole", () => {
    const caArticol = curataSeoPagina({ tip: "articol", autor: "Ana", dataPublicarii: "2026-01-01" });
    assert.equal(caArticol.autor, "Ana");
    assert.equal(caArticol.dataPublicarii, "2026-01-01");

    // Pagina intoarsa din „Articol" in „Pagina obisnuita": campurile care nu mai
    // descriu nimic dispar din coloana, altfel ar fi reaparut la prima duplicare.
    const inapoi = curataSeoPagina({ tip: "pagina", autor: "Ana", dataPublicarii: "2026-01-01" });
    assert.ok(!("autor" in inapoi));
    assert.ok(!("dataPublicarii" in inapoi));
  });

  test("o data invalida nu se scrie", () => {
    const out = curataSeoPagina({ tip: "articol", dataPublicarii: "candva" });
    assert.ok(!("dataPublicarii" in out));
  });

  test("restul campurilor SEO trec neatinse", () => {
    const out = curataSeoPagina({ title: "T", description: "D", ogImage: "https://cdn.tld/x.webp", noindex: true });
    assert.equal(out.title, "T");
    assert.equal(out.description, "D");
    assert.equal(out.noindex, true);
  });

  test("autorul se taie, nu se refuza", () => {
    const out = curataSeoPagina({ tip: "articol", autor: "x".repeat(500) });
    assert.equal(out.autor?.length, 80);
  });

  test("autorPagina ignora ce nu e text", () => {
    assert.equal(autorPagina({ autor: 5 } as unknown as PageSeo), "");
  });
});
