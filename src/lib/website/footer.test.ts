import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existaPaginaStatica } from "./rute-pe-disc";
import { FOOTER_COLUMNS, SOCIAL_LINKS } from "./footer";
import { INDUSTRIES } from "./nav";

/*
 * Subsolul e locul in care se ascund cel mai bine linkurile moarte.
 *
 * E pe FIECARE pagina, deci un href gresit e vizibil peste tot, dar nimeni nu-l
 * apasa la testare — te uiti la antet si la continut, subsolul il derulezi. Iar
 * o adresa scrisa cu o litera in minus nu produce nicio eroare: nici `tsc`, nici
 * `eslint` nu stiu ce rute exista, si abia utilizatorul da de 404.
 *
 * Probele de aici CHESTIONEAZA SISTEMUL DE FISIERE, nu o lista scrisa de mana: o
 * lista de rute tinuta separat s-ar demoda exact ca href-urile pe care ar trebui
 * sa le pazeasca.
 */

const AICI = dirname(fileURLToPath(import.meta.url));
const APP = join(AICI, "..", "..", "app");

/**
 * Adevarat daca App Router-ul are o pagina STATICA pentru adresa data.
 *
 * ⚠ „Statica" e esential, si a costat o proba ca sa iasa la iveala.
 *
 * Prima forma accepta si segmentele dinamice — parea corect, fiindca asa
 * potriveste chiar App Router-ul. Dar aplicatia are `app/(public)/[slug]`, ruta
 * magazinelor, care prinde ORICE prim segment: `/pagina-inventata` „exista",
 * deci proba raspundea `true` la absolut orice si nu pazea nimic. Controlul
 * negativ de mai jos a prins-o.
 *
 * Acum se potrivesc doar segmentele scrise litera cu litera. Grupurile in
 * paranteze — `(website)`, `(landing)` — se traverseaza fara sa consume nimic,
 * pentru ca nu apar in adresa: NICIUN link din subsol nu sta in `app/<segment>`,
 * toate sunt intr-un grup, si o cautare naiva ar fi zis ca niciunul nu exista.
 * (Exact asta scria, gresit, o nota mai veche din repo.)
 *
 * Ca proba sa nu depinda de un singur grup, `/migrare` a fost mutata din
 * `(landing)` in `(website)` fara ca nimic de aici sa se schimbe — chiar asta
 * arata ca traversarea e generala, nu potrivita pe un caz anume.
 *
 * Industriile, care CHIAR trec printr-un segment dinamic, sunt verificate
 * separat, pe lista de sluguri.
 */
/*
  ⚠ REZOLVATORUL DE RUTE NU MAI E AICI. Statea si in fisierul asta, si in
  celalalt, cu aceleasi comentarii copiate — iar pe 31.08.2026 era pe cale sa
  apara a treia copie. Acum e unul singur, in `rute-pe-disc.ts`, unde scrie si
  de ce segmentele dinamice se potrivesc peste tot in afara de `(public)`.
*/

test("resolverul de rute chiar poate esua", () => {
  /* Fara controlul asta, un resolver care raspunde mereu `true` ar face restul
     probelor sa treaca fara sa verifice nimic — si chiar asta s-a intamplat la
     prima forma, din cauza rutei de magazin `[slug]`. */
  assert.equal(existaPaginaStatica("/pagina-care-nu-exista-nicaieri"), false);
  assert.equal(existaPaginaStatica("/contact"), true);
  /* Grup de rute: pagina sta in `app/(website)/migrare`, nu in `app/migrare`. */
  assert.equal(existaPaginaStatica("/migrare"), true);
});

test("fiecare link intern din subsol duce la o pagina care exista", () => {
  const interne = FOOTER_COLUMNS.flatMap((c) => c.links).filter(
    (l) => !l.extern && !l.href.startsWith("/industrii/"),
  );
  assert.ok(interne.length >= 10, `doar ${interne.length} linkuri interne — s-a taiat ceva?`);

  for (const link of interne) {
    assert.ok(
      link.href.startsWith("/"),
      `„${link.label}" are href-ul „${link.href}", care nu e o adresa interna`,
    );
    assert.ok(
      existaPaginaStatica(link.href),
      `„${link.label}" trimite la ${link.href}, unde nu exista nicio pagina`,
    );
  }
});

test("industriile din subsol au sluguri reale si o pagina care le serveste", () => {
  /* `[industrie]` prinde ORICE valoare, deci proba de mai sus n-ar fi observat
     un slug inventat: ruta ar fi raspuns, dar cu 404 din `notFound()`. Aici se
     verifica amandoua: ca exista pagina dinamica si ca slugul e cunoscut. */
  assert.ok(
    existsSync(join(APP, "(website)", "industrii", "[industrie]", "page.tsx")),
    "pagina dinamica de industrie s-a mutat sau a fost redenumita",
  );

  const cunoscute = new Set(INDUSTRIES.map((i) => i.slug));
  const linkuri = FOOTER_COLUMNS.flatMap((c) => c.links).filter((l) =>
    l.href.startsWith("/industrii/"),
  );
  /* ⚠ PATRU, nu cinci. Coloana fusese ceruta cu cinci, dar „Magazin online
     Bijuterii" a plecat odata cu industria, la cererea clientului (13.08).
     Numarul ramane fixat: o coloana care creste sau scade tacut e chiar lucrul
     pe care proba il pazeste. */
  assert.equal(linkuri.length, 4, "coloana Industrii a ramas cu 4 intrari dupa 13.08");

  for (const link of linkuri) {
    const slug = link.href.replace("/industrii/", "");
    assert.ok(
      cunoscute.has(slug),
      `„${link.label}" foloseste slugul „${slug}", care nu e in INDUSTRIES`,
    );
  }
});

test("niciun link din subsol nu e confundat cu un magazin", () => {
  /*
   * Proxy-ul trateaza orice prim segment necunoscut ca pe un slug de magazin.
   * Pentru o pagina de site asta inseamna o interogare Supabase degeaba la
   * fiecare cerere — si, daca vreun magazin are intamplator acelasi slug si
   * domeniu propriu, vizitatorul e trimis (307) pe domeniul ALTCUIVA.
   *
   * Lista se citeste din sursa proxy-ului, nu se copiaza aici: o copie ar fi
   * exact felul de dublura care ramane in urma. Comentariile se scot inainte de
   * citirea sirurilor, ca sa nu intre text de acolo in lista.
   */
  const sursa = readFileSync(join(AICI, "..", "..", "proxy.ts"), "utf8");
  const bloc = sursa.match(/NON_STORE_SEGMENTS = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(bloc, "NON_STORE_SEGMENTS nu mai arata ca inainte in `proxy.ts`");

  const faraComentarii = bloc[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const segmente = new Set(
    [...faraComentarii.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
  );
  assert.ok(segmente.size >= 20, `s-au citit doar ${segmente.size} segmente — regexul a ratat`);
  assert.ok(segmente.has("dashboard"), "citirea din `proxy.ts` a scos altceva decat lista");

  for (const link of FOOTER_COLUMNS.flatMap((c) => c.links)) {
    if (link.extern) continue;
    const primul = link.href.split("/").filter(Boolean)[0];
    assert.ok(
      segmente.has(primul),
      `„${link.label}" incepe cu „${primul}", care lipseste din NON_STORE_SEGMENTS`,
    );
  }
});

test("linkurile de contact sunt marcate ca externe si au schema buna", () => {
  /* `tel:` si `mailto:` trecute prin `next/link` sunt tratate ca navigari
     interne: pe unele browsere apasarea nu face NIMIC, tacut. Steagul `extern`
     e singurul lucru care le tine pe `<a>`. */
  for (const link of FOOTER_COLUMNS.flatMap((c) => c.links)) {
    const schemaSpeciala = link.href.startsWith("tel:") || link.href.startsWith("mailto:");
    assert.equal(
      schemaSpeciala,
      Boolean(link.extern),
      `„${link.label}" (${link.href}): steagul „extern" nu se potriveste cu adresa`,
    );
  }
});

test("siglele retelelor sociale exista in `public`", () => {
  assert.equal(SOCIAL_LINKS.length, 3);
  const publicDir = join(AICI, "..", "..", "..", "public");
  for (const s of SOCIAL_LINKS) {
    assert.ok(existsSync(join(publicDir, s.src)), `sigla ${s.label} lipseste: public${s.src}`);
    assert.ok(s.href.startsWith("https://"), `${s.label} nu are adresa https`);
    /* Fara raport, `width` iese gresit si Next se plange de aranjare. */
    assert.ok(s.ratio > 0 && s.inaltime > 0, `${s.label} n-are dimensiuni valide`);
  }
});
