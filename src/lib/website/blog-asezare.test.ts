import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CONTINUTUL BLOGULUI NU STA LIPIT DE LINIA HERO-ULUI
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CE ERA GRESIT, MASURAT IN PRODUCTIE la 1920px (getBoundingClientRect, nu ochiul):

      pagina de articol   randul autorului incepea la 0.0 px sub separator
      lista de articole   chipurile de filtrare la 2.6 px sub separator
      amandoua            decalate cu 18 px la dreapta fata de titlu SI de sigla

  `PageHero` se termina cu `border-b`, iar containerul de dedesubt avea `pb-20` si
  NICIUN `pt`. Deci textul incepea exact pe linie.

  ⚠ SI DECALAJUL DE 18 px avea o cauza aritmetica, nu una de gust:

      antet si hero   max-w-[1200px] px-5 sm:px-6 lg:px-8  ->  1136 px de continut
      blog            max-w-[1140px] px-5                  ->  1100 px de continut

  Doua cutii centrate de latimi diferite nu incep in acelasi loc: (1200-1140)/2
  = 30, minus diferenta de padding (32-20=12), da fix 18. Paginile din `/ajutor`
  foloseau deja scara hero-ului — blogul era singurul care nu.

  ⚠ MASURAT DUPA REPARATIE, acelasi mod: 56 px sub linie (cat are hero-ul
  deasupra ei, `lg:pb-14`, deci simetric) si 0 px decalaj fata de sigla si titlu.

  ⚠ CE NU S-A MASURAT: latimile de telefon. Redimensionarea ferestrei nu a prins
  in sesiunea aceea, iar `innerWidth` a ramas 1920 — deci nu exista masuratoare
  pentru mobil, doar semantica claselor: sub `sm` amandoua cutiile au `px-5`,
  deci se aliniau si inainte, iar `pt-10` da 40 px de aer unde erau 0.
*/

const RAD = process.cwd();
const citeste = (c: string) => readFileSync(join(RAD, c), "utf8").replace(/\r\n/g, "\n");

/** Scara pe care o foloseste `PageHero` — si, de acum, tot ce vine sub el. */
const SCARA_HERO = /max-w-\[1200px\][^"]*\bpx-5\b[^"]*\bsm:px-6\b[^"]*\blg:px-8\b/;

const PAGINI_LATE = [
  "src/app/(website)/blog/page.tsx",
  "src/app/(website)/blog/autor/[slug]/page.tsx",
  "src/app/(website)/blog/categorie/[slug]/page.tsx",
  "src/app/(website)/blog/cautare/page.tsx",
  "src/app/(website)/blog/eticheta/[slug]/page.tsx",
  "src/components/website/blog/CorpArticol.tsx",
];

/** Containerul principal: primul `mx-auto max-w-[...]` din fisier. */
function containerul(cale: string): string {
  const m = citeste(cale).match(/className="(mx-auto[^"]*max-w-\[\d+px\][^"]*)"/);
  assert.ok(m, `n-am gasit containerul principal in ${cale}`);
  return m![1];
}

test("PageHero chiar se termina cu o linie — altfel proba de mai jos n-are obiect", () => {
  /*
    ⚠ MARTORUL. Daca hero-ul si-ar pierde `border-b`, n-ar mai exista separatorul
    de care se lipea continutul, iar toate cerintele de mai jos ar pazi o problema
    care nu mai exista. Atunci nota asta trebuie recitita, nu probele bifate.
  */
  const hero = citeste("src/components/website/PageHero.tsx");
  assert.match(hero, /<section className="border-b border-hairline/, "PageHero nu mai are linie de jos");
  assert.match(hero, SCARA_HERO, "PageHero si-a schimbat scara; blogul o urmeaza si trebuie schimbat odata cu el");
  assert.match(hero, /\blg:pb-14\b/, "hero-ul nu mai are `lg:pb-14` — simetria de 56 px de sub linie nu mai e simetrie");
});

for (const cale of PAGINI_LATE) {
  test(`${cale.replace("src/", "")} — nu incepe lipit de linie si e aliniat cu antetul`, () => {
    const c = containerul(cale);

    /* ⚠ Chiar defectul reclamat: 0 px, respectiv 2.6 px sub separator. */
    assert.match(
      c, /\bpt-10\b/,
      `containerul n-are aer sus, deci continutul se lipeste de linia lui PageHero:\n  ${c}`,
    );
    assert.match(
      c, /\blg:pt-14\b/,
      "lipseste lg:pt-14 — pe ecran mare hero-ul lasa 56 px deasupra liniei, " +
      "iar aici ar ramane 40. Simetria de care depinde asezarea se pierde.",
    );

    /* ⚠ Cei 18 px de decalaj. Latimea SI padding-ul, amandoua: una singura nu ajunge. */
    assert.match(
      c, SCARA_HERO,
      `containerul nu foloseste scara hero-ului (max-w-[1200px] + px-5/sm:px-6/lg:px-8).\n` +
      `  Orice alta pereche latime/padding muta marginea din stanga fata de sigla si titlu.\n  ${c}`,
    );
  });
}

test("paginile inguste primesc aer, dar isi pastreaza latimea lor", () => {
  /*
    `confirma` si `dezabonare` sunt coloane inguste, centrate — alinierea cu
    antetul nu li se aplica. Lipsa aerului de sus, insa, li se aplica la fel.
  */
  for (const cale of [
    "src/app/(website)/blog/confirma/page.tsx",
    "src/app/(website)/blog/dezabonare/page.tsx",
  ]) {
    const c = containerul(cale);
    assert.match(c, /max-w-\[640px\]/, `${cale} si-a schimbat latimea`);
    assert.match(c, /\bpt-10\b/, `${cale} n-are aer sus`);
  }
});

test("indiciul de latime al copertei urmeaza containerul, nu ramane in urma", () => {
  /*
    ⚠ CUPLARE USOR DE RATAT. `sizes` spune browserului cat de lat va fi afisata
    imaginea; el alege fisierul dupa numarul asta. Ramas la vechiul `1100px` dupa
    ce containerul a trecut la 1136, browserul ar fi cerut o imagine mai mica
    decat locul in care o pune — adica intinsa.

    Masurat dupa reparatie: caseta copertei are chiar 1136 px.
  */
  const corp = citeste("src/components/website/blog/CorpArticol.tsx");
  assert.match(
    corp,
    /sizes="\(max-width: 1200px\) 100vw, 1136px"/,
    "`sizes` nu mai descrie latimea adevarata a copertei (1200 - 2x32 = 1136)",
  );
});

test("masura de citit nu s-a latit odata cu containerul", () => {
  /*
    Containerul a crescut cu 36 px, deci coloana de text ar fi urcat singura de la
    820 la 856 px — o masura si mai lunga decat era. `lg:gap-x-16` tine diferenta
    in golul dintre text si cuprins: masurat, 832 px.
  */
  const corp = citeste("src/components/website/blog/CorpArticol.tsx");
  assert.match(
    corp,
    /grid gap-10 lg:grid-cols-\[minmax\(0,1fr\)_240px\] lg:gap-x-16/,
    "s-a pierdut `lg:gap-x-16`, deci coloana de text se latește la 856 px",
  );
});
