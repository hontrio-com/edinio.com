import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { EXTENSII_STATICE, NON_STORE_SEGMENTS, primulSegment } from "./segmente-rezervate";

/*
  ═══ LISTA SE VERIFICA IMPOTRIVA DISCULUI ═══

  `NON_STORE_SEGMENTS` e citita de proxy (ce NU e magazin), de `createBusiness`
  (ce slug NU se poate lua) si de proba sitemapului platformei (ce E al
  platformei). O ruta de nivel intai care lipseste de aici e, in acelasi timp: o
  interogare degeaba la fiecare cerere, un 503 in timpul unei pene a bazei, un
  slug pe care un comerciant il poate lua si care ar fura ruta cu un 307 pe
  domeniul lui, si o pagina pe care proba sitemapului o refuza. Pana pe
  04.09.2026 lipseau `auth`, `reactivare` si `preview-sectiune`; nimeni n-a
  observat, fiindca nimic nu cadea.

  Proba deriva TOTUL de pe disc, nu dintr-o lista scrisa de mana:
    1. directoarele de nivel intai din `src/app` care contin o ruta (`page.*`
       sau `route.*` undeva sub ele), inclusiv cele din grupurile `(website)`,
       `(auth)`, `(public)`..., care nu apar in adresa; `[slug]` e chiar
       magazinul, deci se sare;
    2. rutele pe care Next le face din FISIERE de nivel intai (`robots.ts` →
       /robots.txt, `sitemap.ts` → /sitemap.xml, `manifest.*` →
       /manifest.webmanifest, `icon.*`, `apple-icon.*`, `opengraph-image.*`,
       `twitter-image.*`);
    3. fisierele din radacina lui `public/` a caror extensie NU e in
       `EXTENSII_STATICE` (acelea ies din proxy inainte de cautare): azi
       `site.webmanifest`; maine `ads.txt`, `BingSiteAuth.xml`...
*/

const AICI = dirname(fileURLToPath(import.meta.url));
const APP = join(AICI, "..", "app");
const PUBLIC = join(AICI, "..", "..", "public");

/** Numele care nu sunt segmente de adresa: grupuri, dinamice, paralele, private. */
const NU_E_SEGMENT = /^[([@_]/;

const RUTA = /^(page|route)\.(ts|tsx|js|jsx|mjs)$/;

/** Directorul contine o ruta undeva sub el? Un director doar cu componente nu e ruta. */
function contineRuta(dir: string): boolean {
  for (const nume of readdirSync(dir)) {
    const cale = join(dir, nume);
    if (statSync(cale).isDirectory()) {
      if (contineRuta(cale)) return true;
    } else if (RUTA.test(nume)) {
      return true;
    }
  }
  return false;
}

function segmenteDinDirectoare(dir: string): string[] {
  const gasite: string[] = [];
  for (const nume of readdirSync(dir)) {
    const cale = join(dir, nume);
    if (!statSync(cale).isDirectory()) continue;
    if (nume.startsWith("(")) {
      gasite.push(...segmenteDinDirectoare(cale)); // grupul nu apare in adresa
      continue;
    }
    if (NU_E_SEGMENT.test(nume)) continue;
    if (!contineRuta(cale)) continue;
    gasite.push(nume);
  }
  return gasite;
}

/** Conventiile Next pentru fisierele de metadate de la radacina: nume pe disc → adresa publica. */
const FISIERE_CONVENTIE: Record<string, string> = {
  robots: "robots.txt",
  sitemap: "sitemap.xml",
  manifest: "manifest.webmanifest",
  icon: "icon",
  "apple-icon": "apple-icon",
  "opengraph-image": "opengraph-image",
  "twitter-image": "twitter-image",
};

function segmenteDinFisiereleLuiNext(dir: string): string[] {
  const gasite: string[] = [];
  for (const nume of readdirSync(dir)) {
    if (statSync(join(dir, nume)).isDirectory()) continue;
    if (/\.test\.(ts|tsx)$/.test(nume)) continue;
    const baza = nume.replace(/\.(ts|tsx|js|jsx|mjs|xml|txt|webmanifest|json|png|jpg|jpeg|svg|ico)$/i, "");
    const adresa = FISIERE_CONVENTIE[baza];
    if (adresa) gasite.push(adresa);
  }
  return gasite;
}

/** Fisierele din radacina lui public/ care ar ajunge la cautarea de slug. */
function fisierePubliceNestatice(dir: string): string[] {
  return readdirSync(dir).filter((nume) => {
    if (statSync(join(dir, nume)).isDirectory()) return false;
    return !EXTENSII_STATICE.test(nume);
  });
}

describe("fiecare ruta de nivel intai a aplicatiei e rezervata", () => {
  const dinDirectoare = segmenteDinDirectoare(APP);
  const dinFisiere = segmenteDinFisiereleLuiNext(APP);
  const dinPublic = fisierePubliceNestatice(PUBLIC);

  test("s-au gasit rute pe disc (proba nu e goala)", () => {
    assert.ok(dinDirectoare.length >= 20, `doar ${dinDirectoare.length} rute gasite in ${APP}`);
    assert.ok(dinDirectoare.includes("dashboard") && dinDirectoare.includes("blog"), "parcurgerea a ratat grupurile de rute");
    assert.ok(dinFisiere.includes("robots.txt") && dinFisiere.includes("sitemap.xml"), "fisierele-conventie ale lui Next n-au fost vazute");
    assert.ok(dinPublic.includes("site.webmanifest"), "fisierele nestatice din public/ n-au fost vazute");
  });

  for (const seg of dinDirectoare) {
    test(`directorul de ruta „/${seg}" e in NON_STORE_SEGMENTS`, () => {
      assert.ok(NON_STORE_SEGMENTS.has(seg), `ruta /${seg} exista in src/app, dar lipseste din NON_STORE_SEGMENTS: un magazin ar putea lua slugul asta`);
    });
  }

  for (const adresa of dinFisiere) {
    test(`ruta din fisier „/${adresa}" e in NON_STORE_SEGMENTS`, () => {
      assert.ok(NON_STORE_SEGMENTS.has(adresa), `/${adresa} e servit de un fisier-conventie din src/app, dar lipseste din lista: proxy-ul ar intreba baza la fiecare cerere si ar da 503 la o pana`);
    });
  }

  for (const fisier of dinPublic) {
    test(`fisierul public „/${fisier}" (fara extensie statica) e in NON_STORE_SEGMENTS`, () => {
      assert.ok(NON_STORE_SEGMENTS.has(fisier), `public/${fisier} nu se termina cu o extensie din EXTENSII_STATICE, deci ajunge la cautarea de slug: pune-l in lista`);
    });
  }

  test("extensiile statice sunt cele pe care le foloseste si proxy-ul", () => {
    /* Proxy-ul importa acelasi regex; aici doar se fixeaza ca el chiar spune
       „fisier", nu „pagina": o pagina .html sau un feed .xml NU sunt statice. */
    for (const f of ["logo.svg", "og-image.png", "x.woff2", "a.css", "b.js"]) assert.ok(EXTENSII_STATICE.test(f), `${f} ar trebui sa fie static`);
    for (const f of ["robots.txt", "sitemap.xml", "site.webmanifest", "ads.txt", "pagina.html", "date.json"]) assert.ok(!EXTENSII_STATICE.test(f), `${f} NU e static`);
  });

  test("lista e formata din segmente curate: minuscule, fara / si fara spatii", () => {
    for (const s of NON_STORE_SEGMENTS) {
      assert.match(s, /^[a-z0-9][a-z0-9.-]*$/, `„${s}" nu arata ca un segment de adresa`);
      assert.equal(extname(s).includes("/"), false);
    }
  });
});

describe("primulSegment", () => {
  test("ia primul segment, fara slash-uri", () => {
    assert.equal(primulSegment("/floraria-mea/product/x"), "floraria-mea");
    assert.equal(primulSegment("/floraria-mea"), "floraria-mea");
    assert.equal(primulSegment("/floraria-mea/"), "floraria-mea");
    assert.equal(primulSegment("/"), "");
    assert.equal(primulSegment(""), "");
  });

  test("decodifica codificarea procentuala, ca ruta si baza sa vada acelasi slug", () => {
    /* `/floraria%2Dmea` e servit de Next ca `floraria-mea`; fara decodificare
       proxy-ul cauta in baza `floraria%2Dmea`, nu-l gaseste, si vitrina iese
       fara `X-Robots-Tag`. */
    assert.equal(primulSegment("/floraria%2Dmea/product/x"), "floraria-mea");
    assert.equal(primulSegment("/%66loraria-mea"), "floraria-mea");
    assert.equal(primulSegment("/caf%C3%A9"), "café");
  });

  test("o secventa invalida nu arunca: ramane bruta", () => {
    assert.equal(primulSegment("/%E0%A4%A"), "%E0%A4%A");
    assert.equal(primulSegment("/100%"), "100%");
  });

  test("un slash codificat nu deschide al doilea segment ca pe primul", () => {
    /* `%2F` decodificat e `/`, dar segmentul ramane intreg — nu e un slug
       valid, deci nu e magazin; proba doar fixeaza purtarea. */
    assert.equal(primulSegment("/floraria-mea%2Fproduct"), "floraria-mea/product");
  });
});
