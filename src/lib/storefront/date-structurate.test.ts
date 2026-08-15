import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import {
  articolJsonLd, blogJsonLd, dataIso, firimituriJsonLd, graf, intrebariJsonLd,
  listaJsonLd, magazinJsonLd, paginaWebJsonLd, textCurat, urlAbsolut,
} from "./date-structurate";

/*
 * ⚠ CE APARA PROBELE ASTEA.
 *
 * Datele structurate sunt singura parte a paginii pe care n-o vede nimeni. O
 * pagina cu JSON-LD stricat arata identic cu una corecta, raspunde 200, trece de
 * `tsc` si de build — exact semnatura defectelor pentru care exista santinela.
 * Se afla ori din Search Console, ori de la comerciantul caruia nu-i mai apare
 * magazinul, ori niciodata.
 *
 * De aia probele nu verifica „s-a produs un obiect", ci FIECARE regula pentru
 * care exista o linie de cod: ce se emite, ce NU se emite, si ce dispare cand
 * valoarea lipseste.
 */

const EDITOR = { nume: "Caian Textile", url: "https://caian-textile.ro", logo: "https://cdn.tld/logo.png" };

describe("firimituri", () => {
  test("sub doua trepte nu se emite nimic", () => {
    assert.equal(firimituriJsonLd([{ nume: "Magazin", url: "https://a.tld" }]), null);
    assert.equal(firimituriJsonLd([]), null);
  });

  test("treptele fara adresa sau fara nume cad", () => {
    const f = firimituriJsonLd([
      { nume: "Magazin", url: "https://a.tld" },
      { nume: "", url: "https://a.tld/x" },
      { nume: "Prosoape", url: "https://a.tld/magazin/prosoape" },
    ]) as { itemListElement: { name: string; position: number }[] };
    assert.equal(f.itemListElement.length, 2);
    assert.deepEqual(f.itemListElement.map((e) => e.position), [1, 2]);
  });

  test("DOUA trepte catre aceeasi adresa se contopesc", () => {
    // Magazinul care tine catalogul chiar pe pagina principala: „Magazin" si
    // „Toate produsele" ar fi acelasi URL, iar Search Console raporteaza asta ca
    // firimitura invalida.
    const f = firimituriJsonLd([
      { nume: "Magazin", url: "https://a.tld" },
      { nume: "Toate produsele", url: "https://a.tld" },
    ]);
    assert.equal(f, null, "doua trepte identice nu fac un drum");
  });

  test("pozitiile sunt consecutive de la 1", () => {
    const f = firimituriJsonLd([
      { nume: "Magazin", url: "https://a.tld" },
      { nume: "Toate produsele", url: "https://a.tld/magazin" },
      { nume: "Prosoape", url: "https://a.tld/magazin/prosoape" },
      { nume: "Prosoape hotel", url: "https://a.tld/magazin/prosoape-hotel" },
    ]) as { itemListElement: { position: number; item: string }[] };
    assert.deepEqual(f.itemListElement.map((e) => e.position), [1, 2, 3, 4]);
    assert.equal(f.itemListElement[3].item, "https://a.tld/magazin/prosoape-hotel");
  });
});

describe("lista de produse", () => {
  test("adresele relative sau goale cad, si lista goala nu se emite", () => {
    assert.equal(listaJsonLd([{ url: "/product/x" }, { url: "" }]), null);
  });

  test("numara doar ce a ramas", () => {
    const l = listaJsonLd([
      { url: "https://a.tld/product/x", nume: "X", imagine: "https://cdn.tld/x.webp" },
      { url: "/relativ" },
    ]) as { numberOfItems: number; itemListElement: Record<string, unknown>[] };
    assert.equal(l.numberOfItems, 1, "numberOfItems trebuie sa numere elementele EMISE");
    assert.equal(l.itemListElement.length, 1);
    assert.equal(l.itemListElement[0].image, "https://cdn.tld/x.webp");
  });

  test("nu inventeaza pret sau disponibilitate", () => {
    const l = listaJsonLd([{ url: "https://a.tld/product/x", nume: "X" }]) as { itemListElement: Record<string, unknown>[] };
    const e = l.itemListElement[0];
    assert.ok(!("offers" in e), "forma sumara nu declara oferte");
    assert.ok(!("price" in e));
  });
});

describe("articol de blog", () => {
  test("campurile pe care Google le cere ajung toate", () => {
    const a = articolJsonLd({
      titlu: "Cum alegi prosoapele pentru hotel",
      url: "https://caian-textile.ro/ghid",
      descriere: "<p>Gramaj, material si <strong>certificari</strong>.</p>",
      imagine: "https://cdn.tld/p.webp",
      dataPublicarii: "2026-06-30T18:15:04.609Z",
      dataModificarii: "2026-07-23T14:36:13.269Z",
      editor: EDITOR,
    }) as Record<string, unknown>;
    assert.equal(a["@type"], "BlogPosting");
    assert.equal(a.headline, "Cum alegi prosoapele pentru hotel");
    assert.deepEqual(a.image, ["https://cdn.tld/p.webp"]);
    assert.equal(a.datePublished, "2026-06-30T18:15:04.609Z");
    assert.equal(a.dateModified, "2026-07-23T14:36:13.269Z");
    assert.equal((a.publisher as { name: string }).name, "Caian Textile");
    assert.equal(a.description, "Gramaj, material si certificari.", "HTML-ul din descriere se curata");
  });

  test("fara autor declarat semneaza magazinul; cu autor, o persoana", () => {
    const baza = { titlu: "T", url: "https://a.tld/t", editor: EDITOR };
    const fara = articolJsonLd(baza) as { author: { "@type": string; name: string } };
    assert.equal(fara.author["@type"], "Organization");
    assert.equal(fara.author.name, "Caian Textile");

    const cu = articolJsonLd({ ...baza, autor: "  Ana Pop " }) as { author: { "@type": string; name: string } };
    assert.equal(cu.author["@type"], "Person");
    assert.equal(cu.author.name, "Ana Pop");
  });

  test("o data invalida NU devine datePublished", () => {
    const a = articolJsonLd({
      titlu: "T", url: "https://a.tld/t", editor: EDITOR, dataPublicarii: "cand am avut chef",
    }) as Record<string, unknown>;
    assert.ok(!("datePublished" in a), "o data invalida e eroare de validare, nu o data");
  });

  test("dateModified lipseste cand e identic cu datePublished", () => {
    const a = articolJsonLd({
      titlu: "T", url: "https://a.tld/t", editor: EDITOR,
      dataPublicarii: "2026-06-30T00:00:00.000Z", dataModificarii: "2026-06-30T00:00:00.000Z",
    }) as Record<string, unknown>;
    assert.ok(!("dateModified" in a));
  });

  test("fara imagine NU se emite un tablou gol", () => {
    const a = articolJsonLd({ titlu: "T", url: "https://a.tld/t", editor: EDITOR }) as Record<string, unknown>;
    assert.ok(!("image" in a), "`image: []` e o eroare de validare, nu o imagine lipsa");
  });

  test("headline se taie la limita lui Google", () => {
    const a = articolJsonLd({ titlu: "x".repeat(400), url: "https://a.tld/t", editor: EDITOR }) as { headline: string };
    assert.equal(a.headline.length, 110);
  });

  test("fara titlu sau fara adresa nu se emite nimic", () => {
    assert.equal(articolJsonLd({ titlu: "  ", url: "https://a.tld/t", editor: EDITOR }), null);
    assert.equal(articolJsonLd({ titlu: "T", url: "/relativ", editor: EDITOR }), null);
  });
});

describe("blog", () => {
  test("listeaza articolele primite, fara sa le inventeze", () => {
    const b = blogJsonLd({
      nume: "Blog", url: "https://caian-textile.ro/blog", editor: EDITOR,
      articole: [
        { titlu: "A", url: "https://caian-textile.ro/a", dataPublicarii: "2026-07-01T00:00:00.000Z" },
        { titlu: "B", url: "/relativ" },
      ],
    }) as { blogPost: Record<string, unknown>[] };
    assert.equal(b.blogPost.length, 1, "articolul cu adresa relativa cade");
    assert.equal(b.blogPost[0].headline, "A");
  });

  test("blogul fara niciun articol marcat ramane un Blog valid, fara blogPost", () => {
    const b = blogJsonLd({ nume: "Blog", url: "https://a.tld/blog", editor: EDITOR, articole: [] }) as Record<string, unknown>;
    assert.equal(b["@type"], "Blog");
    assert.ok(!("blogPost" in b), "`blogPost: []` ar declara un blog gol, nu unul nemarcat");
  });
});

describe("intrebari frecvente", () => {
  test("perechile incomplete cad, si zero perechi nu emit nod", () => {
    assert.equal(intrebariJsonLd([{ q: "Intrebare?", a: "" }]), null);
    assert.equal(intrebariJsonLd([]), null);
  });

  test("intrebarile intregi devin Question/Answer", () => {
    const f = intrebariJsonLd([{ q: "Ce gramaj?", a: "500-620 GSM." }]) as { mainEntity: Record<string, unknown>[] };
    assert.equal(f.mainEntity.length, 1);
    assert.equal(f.mainEntity[0].name, "Ce gramaj?");
    assert.equal((f.mainEntity[0].acceptedAnswer as { text: string }).text, "500-620 GSM.");
  });
});

describe("pagina web", () => {
  test("tipul necunoscut cade pe WebPage", () => {
    // Valoarea vine dintr-o coloana `Json` scrisa din editor: fara lista alba,
    // cine scrie in coloana scrie direct `@type` in pagina publica.
    const p = paginaWebJsonLd({ tip: "Nascocit" as never, nume: "X", url: "https://a.tld/x" }) as Record<string, unknown>;
    assert.equal(p["@type"], "WebPage");
  });

  test("subtipul cerut se pastreaza", () => {
    const p = paginaWebJsonLd({ tip: "CollectionPage", nume: "Prosoape", url: "https://a.tld/x" }) as Record<string, unknown>;
    assert.equal(p["@type"], "CollectionPage");
  });

  test("fara nume sau fara adresa absoluta nu se emite nimic", () => {
    assert.equal(paginaWebJsonLd({ nume: "", url: "https://a.tld/x" }), null);
    assert.equal(paginaWebJsonLd({ nume: "X", url: "/x" }), null);
  });
});

describe("nodul de magazin", () => {
  const baza = { business_name: "SC X SRL", store_name: "Caian Textile", logo_url: "https://cdn.tld/l.png" };

  test("fara nicio bucata de adresa e OnlineStore, nu Store", () => {
    // `Store` e un `LocalBusiness`: afirma un punct de lucru fizic si cere adresa.
    const m = magazinJsonLd(baza, "https://caian-textile.ro") as Record<string, unknown>;
    assert.equal(m["@type"], "OnlineStore");
    assert.ok(!("address" in m));
  });

  test("cu adresa completata devine Store", () => {
    const m = magazinJsonLd({ ...baza, city: "Bucuresti" }, "https://caian-textile.ro") as Record<string, unknown>;
    assert.equal(m["@type"], "Store");
    assert.equal((m.address as { addressLocality: string }).addressLocality, "Bucuresti");
  });

  test("`sameAs` pastreaza doar adresele absolute, deduplicate", () => {
    const m = magazinJsonLd({
      ...baza,
      social: { facebook: "https://facebook.com/x", instagram: "instagram.com/x", website: "https://caian-textile.ro" },
      website: "https://caian-textile.ro",
    }, "https://caian-textile.ro") as { sameAs: string[] };
    assert.deepEqual(m.sameAs, ["https://facebook.com/x", "https://caian-textile.ro"]);
  });

  test("`@id` e stabil si derivat din canonical", () => {
    const m = magazinJsonLd(baza, "https://caian-textile.ro") as Record<string, unknown>;
    assert.equal(m["@id"], "https://caian-textile.ro#magazin");
  });
});

describe("graful", () => {
  test("nodurile nule dispar", () => {
    const g = graf(null, { "@type": "WebPage" }, undefined) as Record<string, unknown>;
    assert.equal(g["@type"], "WebPage", "un singur nod ramane nod, nu graf");
    assert.equal(g["@context"], "https://schema.org");
  });

  test("zero noduri intoarce null, ca apelantul sa nu emita un <script> gol", () => {
    assert.equal(graf(null, undefined), null);
  });

  test("`@context` din nodurile gata construite nu se dubleaza inauntru", () => {
    const g = graf(
      { "@context": "https://schema.org", "@type": "Product", name: "P" },
      { "@type": "BreadcrumbList" },
    ) as { "@graph": Record<string, unknown>[] };
    assert.ok(!("@context" in g["@graph"][0]), "contextul se declara o singura data, sus");
    assert.equal(g["@graph"][0]["@type"], "Product");
  });
});

describe("curatatoare", () => {
  test("textCurat scoate etichetele si taie", () => {
    assert.equal(textCurat("<p>Un <b>text</b></p>"), "Un text");
    assert.equal(textCurat("x".repeat(900)).length, 500);
    assert.equal(textCurat(null), "");
  });

  test("urlAbsolut refuza tot ce nu e http(s)", () => {
    assert.equal(urlAbsolut("https://a.tld/x"), "https://a.tld/x");
    assert.equal(urlAbsolut("javascript:alert(1)"), "");
    assert.equal(urlAbsolut("//a.tld/x"), "");
    assert.equal(urlAbsolut("a.tld/x"), "");
  });

  test("dataIso normalizeaza si refuza gunoiul", () => {
    assert.equal(dataIso("2026-06-30"), "2026-06-30T00:00:00.000Z");
    assert.equal(dataIso("maine"), "");
    assert.equal(dataIso(""), "");
  });
});
