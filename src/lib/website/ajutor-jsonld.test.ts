import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PLATFORM_ORIGIN } from "@/lib/seo";
import { CATEGORII_AJUTOR, TOATE_GHIDURILE } from "./ajutor";
import { adresaCategorie, adresaGhid, RADACINA } from "./ajutor-cautare";
import { categorieAjutorJsonLd, ghidJsonLd, hubAjutorJsonLd } from "./ajutor-jsonld";
import { ID_ORGANIZATIE, ID_SITE } from "@/lib/website-jsonld";

/*
  ═══ CE APĂRĂ PROBA ═══

  Nu că datele structurate „există" — ci trei lucruri care se pot strica tăcut:

  1. FIECARE pagină de ajutor are exact UN nod de pagină. Zero e starea de
     dinainte de 04.09.2026; două e ce se întâmplă când cineva adaugă al doilea
     dintr-un helper care emite și firimituri.
  2. `BreadcrumbList` NU se emite de aici. `PageHero` îl pune deja; două noduri
     despre aceeași ierarhie e chiar defectul care trăia pe /preturi și /contact.
  3. Referințele prin `@id` chiar arată către noduri care EXISTĂ. Un `@id` scris
     greșit e cea mai tăcută greșeală din JSON-LD: fișierul rămâne valid, iar
     legătura pur și simplu nu se face.
*/

const AICI = dirname(fileURLToPath(import.meta.url));

/**
 * Nodurile, oricâte ar fi — și oricum le-ar fi împachetat `graf`.
 *
 * ⚠ `graf()` NU pune mereu `@graph`: cu un singur nod întoarce chiar nodul, cu
 * `@context` pe el, fiindcă un graf de unul singur e o împachetare fără rost.
 * Prima scriere a probei presupunea `@graph` mereu și cădea pe toate cele
 * cincisprezece — nu fiindcă emiterea era greșită, ci fiindcă ea presupunea.
 */
function noduri(x: unknown): Record<string, unknown>[] {
  assert.ok(x && typeof x === "object", "n-a ieșit niciun nod");
  const o = x as Record<string, unknown>;
  if (Array.isArray(o["@graph"])) return o["@graph"] as Record<string, unknown>[];
  assert.ok("@type" in o, "nodul singur n-are `@type`");
  return [o];
}

const tipurile = (x: unknown) => noduri(x).map((n) => n["@type"]);

describe("hub-ul /ajutor", () => {
  const g = hubAjutorJsonLd(CATEGORII_AJUTOR);

  test("e o CollectionPage, și SINGURA pagină din graf", () => {
    assert.deepEqual(tipurile(g), ["CollectionPage"]);
  });

  test("nu emite firimituri: e treapta de sus", () => {
    assert.ok(!tipurile(g).includes("BreadcrumbList"), "hub-ul emite BreadcrumbList");
  });

  test("poartă toate cele nouă categorii, cu adrese absolute", () => {
    const pagina = noduri(g)[0];
    const lista = pagina.mainEntity as { itemListElement?: { url?: string }[]; numberOfItems?: number };
    assert.equal(lista?.numberOfItems, CATEGORII_AJUTOR.length, "lista nu are toate categoriile");
    for (const c of CATEGORII_AJUTOR) {
      const asteptat = `${PLATFORM_ORIGIN}${adresaCategorie(c.slug)}`;
      assert.ok(
        lista.itemListElement?.some((e) => e.url === asteptat),
        `categoria ${c.slug} lipsește din ItemList`,
      );
    }
  });

  test("se leagă de WebSite prin `@id`, nu prin copie", () => {
    assert.deepEqual((noduri(g)[0] as { isPartOf?: unknown }).isPartOf, { "@id": ID_SITE });
  });
});

describe("categoriile", () => {
  test("fiecare e o CollectionPage cu ghidurile ei, legată de HUB", () => {
    for (const c of CATEGORII_AJUTOR) {
      const g = categorieAjutorJsonLd(c);
      assert.deepEqual(tipurile(g), ["CollectionPage"], `${c.slug}: alt graf decât o pagină`);
      const pagina = noduri(g)[0];
      /* ⚠ Sub HUB, nu sub `WebSite`: sărind treapta din mijloc am spune că o
         categorie stă direct sub site. */
      assert.deepEqual(
        (pagina as { isPartOf?: unknown }).isPartOf,
        { "@id": `${PLATFORM_ORIGIN}${RADACINA}#pagina` },
        `${c.slug}: nu se leagă de hub`,
      );
      const lista = pagina.mainEntity as { numberOfItems?: number } | undefined;
      assert.ok((lista?.numberOfItems ?? 0) > 0, `${c.slug}: lista de ghiduri e goală`);
    }
  });

  test("niciuna nu emite firimituri", () => {
    for (const c of CATEGORII_AJUTOR) {
      assert.ok(!tipurile(categorieAjutorJsonLd(c)).includes("BreadcrumbList"), `${c.slug} emite BreadcrumbList`);
    }
  });
});

describe("ghidurile", () => {
  test("toate cele 406 sunt `Article`, cu `@type` ȘIR", () => {
    /*
      ⚠ ȘIR, NU ARRAY, și e o alegere măsurată: `areTip` din santinelă citește
      `typeof n["@type"] === "string"`. Un `["Article", "TechArticle"]` ar fi
      făcut sonda de producție oarbă pe toate cele 406 ghiduri, fără să cadă.
    */
    for (const g of TOATE_GHIDURILE) {
      const nod = noduri(ghidJsonLd(g))[0];
      assert.equal(nod["@type"], "Article", `${g.slug}: alt tip`);
      assert.equal(typeof nod["@type"], "string", `${g.slug}: @type nu mai e un șir`);
    }
  });

  test("fiecare se leagă de categoria LUI, printr-un `@id` care există", () => {
    /* Referința e către `<adresa categoriei>#pagina`, adică exact `@id`-ul pe
       care îl emite `categorieAjutorJsonLd`. Dacă unul din cele două se schimbă
       fără celălalt, legătura arată în gol — și nimic nu cade. */
    const idExistente = new Set(
      CATEGORII_AJUTOR.map((c) => (noduri(categorieAjutorJsonLd(c))[0] as { "@id"?: string })["@id"]),
    );
    for (const g of TOATE_GHIDURILE) {
      const nod = noduri(ghidJsonLd(g))[0] as { isPartOf?: { "@id"?: string } };
      const id = nod.isPartOf?.["@id"];
      assert.ok(id, `${g.slug}: n-are isPartOf`);
      assert.ok(idExistente.has(id), `${g.slug}: se leagă de un @id inexistent — ${id}`);
    }
  });

  test("autorul și editorul arată către organizația deja emisă de layout", () => {
    const nod = noduri(ghidJsonLd(TOATE_GHIDURILE[0]))[0] as { author?: unknown; publisher?: unknown };
    assert.deepEqual(nod.author, { "@id": ID_ORGANIZATIE });
    assert.deepEqual(nod.publisher, { "@id": ID_ORGANIZATIE });
  });

  test("NU se inventează date de publicare sau de modificare", () => {
    /*
      Toate cele 406 ghiduri stau în același fișier, deci o dată din git ar fi
      aceeași pentru sute de texte neatinse. O dată inventată e mai rea decât una
      lipsă: nu se poate deosebi de una adevărată.
    */
    for (const g of TOATE_GHIDURILE.slice(0, 20)) {
      const nod = noduri(ghidJsonLd(g))[0];
      for (const cheie of ["datePublished", "dateModified"]) {
        assert.ok(!(cheie in nod), `${g.slug}: a apărut ${cheie}, dar n-avem o dată adevărată`);
      }
    }
  });

  test("adresa e absolută și e chiar cea a paginii", () => {
    for (const g of TOATE_GHIDURILE.slice(0, 30)) {
      const nod = noduri(ghidJsonLd(g))[0] as { url?: string; "@id"?: string };
      const asteptat = `${PLATFORM_ORIGIN}${adresaGhid(g.categorie.slug, g.slug)}`;
      assert.equal(nod.url, asteptat, `${g.slug}: altă adresă`);
      assert.equal(nod["@id"], `${asteptat}#articol`);
    }
  });
});

describe("cablarea în pagini", () => {
  /* Funcțiile pot fi corecte și nechemate. Paginile sunt `.tsx`, deci se citește
     sursa — cu comentariile scoase, fiindcă notele de acolo pomenesc chiar
     numele căutate. */
  const faraComentarii = (cale: string) =>
    readFileSync(cale, "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

  const APP = join(AICI, "..", "..", "app", "(ajutor)", "ajutor");

  for (const [nume, cale, functie] of [
    ["hub", join(APP, "page.tsx"), "hubAjutorJsonLd"],
    ["categorie", join(APP, "[categorie]", "page.tsx"), "categorieAjutorJsonLd"],
    ["ghid", join(APP, "[categorie]", "[ghid]", "page.tsx"), "ghidJsonLd"],
  ] as [string, string, string][]) {
    test(`${nume} chiar emite nodul`, () => {
      const sursa = faraComentarii(cale);
      assert.match(sursa, new RegExp("\\b" + functie + "\\("), `${nume} nu mai cheamă ${functie}`);
      assert.match(sursa, /application\/ld\+json/, `${nume} nu mai scrie blocul în pagină`);
    });
  }

  test("niciuna nu emite firimituri pe cont propriu", () => {
    /* `PageHero` le pune. Un al doilea `firimituriJsonLd` chemat direct din
       pagină ar da două `BreadcrumbList` în același document. */
    for (const cale of [join(APP, "page.tsx"), join(APP, "[categorie]", "page.tsx"), join(APP, "[categorie]", "[ghid]", "page.tsx")]) {
      assert.doesNotMatch(faraComentarii(cale), /firimituriJsonLd\(/, `${cale} emite firimituri a doua oară`);
    }
  });
});
