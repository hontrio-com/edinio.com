import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { paginaSiteJsonLd } from "./website-jsonld";

/*
  ═══ O SINGURĂ AFIRMAȚIE DESPRE IERARHIE, PE PAGINĂ ═══

  Firimiturile pot veni din două locuri: desenate de `PageHero`/`PageShell`,
  care le emit și structurat din CHIAR șirul desenat, sau construite de
  `paginaSiteJsonLd`, care le deduce din numele paginii.

  Amândouă deodată înseamnă două noduri `BreadcrumbList` în același document —
  două afirmații despre aceeași ierarhie. Nu strică nimic vizibil, nu cade nicio
  probă, iar un validator îl raportează fără ca cineva să caute. Trăia pe
  `/preturi` și `/contact` până pe 04.09.2026.

  Regula, de acum: cine DESENEAZĂ firimituri nu le mai CONSTRUIEȘTE. Cele patru
  pagini juridice nu desenează niciunele, deci și le construiesc — acolo nodul
  structurat e singura urmă a ierarhiei, și e bine să existe.
*/

const AICI = dirname(fileURLToPath(import.meta.url));
const WEBSITE = join(AICI, "..", "app", "(website)");

/** Sursa fără comentarii, ca proba să se agațe de cod, nu de vorbele despre el. */
function faraComentarii(cale: string): string {
  return readFileSync(cale, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Nodurile, oricum le-ar fi împachetat `graf` (unul singur nu primește `@graph`). */
function noduri(x: unknown): Record<string, unknown>[] {
  assert.ok(x && typeof x === "object", "n-a ieșit niciun nod");
  const o = x as Record<string, unknown>;
  if (Array.isArray(o["@graph"])) return o["@graph"] as Record<string, unknown>[];
  return [o];
}

const tipurile = (x: unknown) => noduri(x).map((n) => n["@type"]);

describe("`faraFirimituri` chiar face ce spune", () => {
  const argumente = { cale: "preturi", nume: "Prețuri", descriere: "Descriere." };

  test("fără el, ies pagina ȘI firimiturile", () => {
    const t = tipurile(paginaSiteJsonLd(argumente));
    assert.ok(t.includes("BreadcrumbList"), "firimiturile n-au mai fost construite");
    assert.ok(t.includes("WebPage"), "nodul paginii a dispărut");
  });

  test("cu el, rămâne DOAR pagina", () => {
    const t = tipurile(paginaSiteJsonLd({ ...argumente, faraFirimituri: true }));
    assert.ok(!t.includes("BreadcrumbList"), "firimiturile se construiesc în continuare");
    assert.ok(t.includes("WebPage"), "a dispărut și nodul paginii");
  });
});

describe("treapta din mijloc, pentru paginile care chiar stau sub alta", () => {
  /** Numele din firimituri, în ordine. */
  const trepte = (x: unknown) => {
    const noduri = (x as { "@graph"?: Record<string, unknown>[] })["@graph"] ?? [x];
    const f = (noduri as Record<string, unknown>[]).find((n) => n["@type"] === "BreadcrumbList");
    assert.ok(f, "n-a ieșit niciun BreadcrumbList");
    return ((f.itemListElement as { name?: string }[]) ?? []).map((e) => e.name);
  };

  test("fără `parinte`, ierarhia rămâne de DOUĂ trepte", () => {
    assert.deepEqual(trepte(paginaSiteJsonLd({ cale: "vs", nume: "Comparatii" })), ["Acasa", "Comparatii"]);
  });

  test("cu `parinte`, treapta din mijloc intră ÎNTRE Acasă și pagină", () => {
    /*
      ⚠ ORDINEA E TOT ÎNȚELESUL. Pusă la coadă, treapta ar fi spus că /vs stă
      sub pagina de comparație, adică ierarhia pe dos — și nimic n-ar fi căzut.
    */
    assert.deepEqual(
      trepte(paginaSiteJsonLd({
        cale: "vs/shopify",
        nume: "O alternativa romaneasca la Shopify",
        parinte: { nume: "Comparatii", cale: "vs" },
      })),
      ["Acasa", "Comparatii", "O alternativa romaneasca la Shopify"],
    );
  });

  test("adresele treptelor sunt absolute și chiar ale paginilor lor", () => {
    const noduri = (paginaSiteJsonLd({
      cale: "vs/shopify", nume: "X", parinte: { nume: "Comparatii", cale: "vs" },
    }) as { "@graph": Record<string, unknown>[] })["@graph"];
    const f = noduri.find((n) => n["@type"] === "BreadcrumbList")!;
    assert.deepEqual(
      ((f.itemListElement as { item?: string }[]) ?? []).map((e) => e.item),
      ["https://www.edinio.com", "https://www.edinio.com/vs", "https://www.edinio.com/vs/shopify"],
    );
  });
});

describe("cine desenează firimituri nu le mai construiește", () => {
  /**
   * Paginile de sub `(website)` care cheamă `paginaSiteJsonLd`.
   *
   * ⚠ CĂUTAREA E RECURSIVĂ, ȘI N-A FOST MEREU. Prima scriere se uita doar la
   * dosarele de pe primul nivel, fiindcă atunci toate paginile stăteau acolo.
   * `/vs/{concurent}` stă pe al doilea — adică exact pagina cu ierarhia cea mai
   * adâncă, singura cu `parinte`, scăpa neverificată. Regula de mai jos e cu
   * atât mai importantă acolo: o pagină de adâncime 2 care ar emite două
   * `BreadcrumbList` ar fi și cea mai încurcată de citit pentru un motor.
   */
  function paginile(dir: string, out: string[] = []): string[] {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      paginile(join(dir, d.name), out);
      const cale = join(dir, d.name, "page.tsx");
      try {
        if (faraComentarii(cale).includes("paginaSiteJsonLd(")) out.push(cale);
      } catch {
        /* dosar fără `page.tsx` — nimic de măsurat */
      }
    }
    return out;
  }
  const pagini = paginile(WEBSITE);

  test("proba nu e goală: s-au găsit paginile", () => {
    assert.ok(pagini.length >= 6, `doar ${pagini.length} pagini cheamă paginaSiteJsonLd`);
  });

  for (const cale of pagini) {
    const nume = cale.split(/[\\/]/).at(-2);
    test(`${nume}`, () => {
      const sursa = faraComentarii(cale);
      /*
        ⚠ NU E DE AJUNS SĂ RANDEZE `PageHero`/`PageShell` — trebuie să le și DEA
        un șir. Amândouă emit `BreadcrumbList` doar sub `{sir ? … : null}`
        (`PageShell.tsx:66`, `PageHero.tsx`), deci o pagină care le folosește
        fără `sir` NU desenează nicio ierarhie.

        ⚠ MĂSURAT, ȘI TOCMAI DE ASTA S-A SCHIMBAT RÂNDUL: /vs randează
        `<PageShell>` fără `sir`, iar în producție documentul ei chiar n-are
        niciun `BreadcrumbList`. Cu heuristica veche, /vs ar fi fost socotită
        „desenează", i s-ar fi cerut `faraFirimituri: true`, și ar fi rămas fără
        NICIO ierarhie — tăcut, cu proba verde. Regula era dormindă doar fiindcă
        nicio pagină fără `sir` nu chema încă `paginaSiteJsonLd`.
      */
      const deseneaza = /<PageHero|<PageShell/.test(sursa) && /\bsir=/.test(sursa);
      const construieste = !/faraFirimituri:\s*true/.test(sursa);
      assert.equal(
        deseneaza && construieste,
        false,
        `${nume} desenează firimituri ȘI le construiește: ies DOUĂ noduri BreadcrumbList în ` +
          "același document. Pune `faraFirimituri: true` — cele desenate câștigă, fiindcă vin " +
          "din chiar șirul pe care îl vede omul.",
      );
      /* ⚠ Și partea cealaltă: o pagină care NU desenează n-are voie să rămână
         fără nicio urmă a ierarhiei. */
      assert.equal(
        !deseneaza && !construieste,
        false,
        `${nume} nu desenează firimituri și nici nu le construiește: pagina n-are nicio ierarhie`,
      );
    });
  }
});

describe("regula chiar poate cădea", () => {
  test("tiparele prind formele care contează, și nu comentariile", () => {
    const scoate = (t: string) =>
      t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    assert.match(scoate("      <PageHero sir={[ACASA]} />"), /<PageHero|<PageShell/);
    assert.match(scoate("  faraFirimituri: true,"), /faraFirimituri:\s*true/);
    assert.doesNotMatch(scoate("{/* <PageHero> era aici */}"), /<PageHero|<PageShell/, "s-a aprins pe un comentariu JSX");
    assert.doesNotMatch(scoate("/* faraFirimituri: true */"), /faraFirimituri:\s*true/, "s-a aprins pe un comentariu");
  });
});
