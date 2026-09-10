import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CALITATE, LATIME_PNG, LATIMI, LATIMI_ECRAN, LATIMI_MICI, PREFIX_VARIANTE,
  cheieOptimizabila, cheieVarianta, latimeaDePeScara, sursaCerePngInEmail,
} from "./latimi-imagini";

/**
 * SCARA DE LATIMI — proba care tine cele trei cai impreuna.
 *
 * ═══ ⚠ CE APARA, IN BANI ═══
 *
 * Cloudflare factureaza TRANSFORMARI UNICE, unde unic = imagine × set de parametri, si contorul se
 * RESETEAZA LUNAR. Masurat pe 07.09.2026: 21.520 de transformari in noua zile, 8,50 $, proiectie
 * 29,28 $ pe ciclu, pe un catalog de 25.227 de imagini. Fiecare latime distincta pe care o cere
 * proiectul se inmulteste cu numarul de poze si se plateste in fiecare luna.
 *
 * Erau DOUA scari care nu se atingeau niciodata: implicitele Next
 * (640/750/828/1080/1200/1920/2048/3840) si numerele scrise de mana in apelurile `cdnImage`
 * (64/96/160/256/320/480/1600/2560). Acum e una singura, si probele de aici o tin asa.
 *
 * ⚠ SI SCARA TREBUIE SA SE POTRIVEASCA CU TREPTELE LUI `/api/img`: ruta urca latimea ceruta la
 * una din treptele EI inainte de a compune cheia variantei. O latime a scarii care nu e printre
 * ele ar fi taiata la alta marime decat cea ceruta — un fisier in plus in depozit, pentru fiecare
 * poza, si niciodata cel cerut.
 */

const sursa = (r: string) => readFileSync(path.resolve(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");

test("⚠ scara e crescatoare, fara dubluri, si miniaturile stau sub latimile de ecran", () => {
  /*
   * `latimeaDePeScara` se bazeaza pe `find`, adica pe ordine: nesortata, ar fi intors prima
   * valoare mai mare din lista, nu pe cea mai mica — adica o poza mult mai grea decat trebuie,
   * tacut.
   */
  assert.deepEqual([...LATIMI], [...LATIMI].sort((a, b) => a - b), "scara nu e crescatoare");
  assert.equal(new Set(LATIMI).size, LATIMI.length, "o latime apare de doua ori");

  /*
   * ⚠ CERINTA LUI NEXT, nu gustul meu: „the sizes in `imageSizes` should all be smaller than the
   * smallest size in `deviceSizes`" — vezi
   * `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`.
   */
  assert.ok(
    Math.max(...LATIMI_MICI) < Math.min(...LATIMI_ECRAN),
    "o latime de miniatura o depaseste pe cea mai mica latime de ecran",
  );
});

test("⚠ latimea URCA pe scara, si se plafoneaza", () => {
  /* Se urca: o poza ramane cel putin la fel de clara ca cea ceruta. */
  assert.equal(latimeaDePeScara(1), 64);
  assert.equal(latimeaDePeScara(64), 64, "o valoare exacta de pe scara nu trebuie sa urce");
  assert.equal(latimeaDePeScara(65), 128);
  assert.equal(latimeaDePeScara(639), 640);

  /*
   * ⚠ PLAFONUL: cine cere 2560 primeste 1920. Fara el, un singur numar scris intr-o componenta ar
   * fi nascut o latime in afara scarii — adica inca un fisier tinut pe veci in depozit, pentru
   * fiecare poza careia i se cere.
   */
  assert.equal(latimeaDePeScara(1921), 1920);
  assert.equal(latimeaDePeScara(2560), 1920);
  assert.equal(latimeaDePeScara(99999), 1920);

  /* Si nimic stramb nu arunca: ruta de randare n-are unde sa prinda o exceptie. */
  for (const rau of [0, -5, NaN, Infinity, undefined as unknown as number]) {
    assert.equal(latimeaDePeScara(rau), 64, `${String(rau)} n-a cazut pe cea mai mica latime`);
  }
});

test("⚠ TOATE latimile scarii exista in treptele lui `/api/img`", () => {
  /*
   * `/api/img` genereaza si pastreaza `_optim/w<W>q<Q>/<cheie>.webp` (si un singur `.png` pe poza, doar
   * la `f=png`, pentru emailuri), si el urca latimea ceruta la
   * una din treptele LUI inainte de a compune cheia. Daca scara ar cere o latime care nu e printre
   * ele — 828, sa zicem — loaderul ar cere 828 si ruta ar taia la 896: o poza mai grea decat trebuie,
   * un fisier in plus tinut pe veci, si niciodata marimea ceruta. Tacut, pe fiecare poza.
   *
   * ⚠ Se citeste din SURSA fiindca ruta importa `sharp` si `@/lib/r2`, adica lucruri care nu se
   * incarca intr-o proba pura. Deci se cere ca LISTA sa fie acolo, nu ca functia sa raspunda —
   * ceea ce e destul: lista e o constanta literala.
   */
  const ruta = sursa("src/app/api/img/route.ts");
  const m = /const TREPTE_LATIME = \[([^\]]+)\]/.exec(ruta);
  assert.ok(m, "nu s-a gasit `TREPTE_LATIME` in `/api/img` — s-a redenumit sau s-a mutat");

  const trepte = m[1].split(",").map((s) => Number(s.trim()));
  assert.ok(trepte.length > 0 && trepte.every(Number.isFinite), `trepte necitibile: ${m[1]}`);

  for (const l of LATIMI) {
    assert.ok(
      trepte.includes(l),
      `latimea ${l} din scara comuna nu e o treapta a lui /api/img (${trepte.join(", ")}): ` +
        "calea pregenerata ar cere un fisier care nu se face niciodata",
    );
  }
});

test("⚠ calitatea scarii e o treapta a lui `/api/img`, si e una singura", () => {
  const ruta = sursa("src/app/api/img/route.ts");
  const m = /const TREPTE_CALITATE = \[([^\]]+)\]/.exec(ruta);
  assert.ok(m, "nu s-a gasit `TREPTE_CALITATE` in `/api/img`");
  const trepte = m[1].split(",").map((s) => Number(s.trim()));
  assert.ok(trepte.includes(CALITATE), `calitatea ${CALITATE} nu e o treapta a lui /api/img`);
});

test("⚠ `next.config.ts` isi ia listele DIN scara, nu si le scrie pe ale lui", () => {
  /*
   * ⚠ DE CE O PROBA PE SURSA E DESTULA AICI: `next.config.ts` nu se poate importa intr-o proba
   * (are efecte la incarcare — verifica variabile de mediu si arunca la build de productie). Dar
   * ce se cere e o singura afirmatie structurala: ca listele vin din modulul comun, nu ca sunt
   * niste numere anume. Scrise literal acolo, s-ar fi despartit de scara la prima schimbare, si
   * NIMIC nu ar fi scartait — nici tsc, nici build-ul, doar factura de luna urmatoare.
   */
  const cfg = sursa("next.config.ts");
  assert.match(cfg, /from "\.\/src\/lib\/latimi-imagini"/, "config-ul nu mai importa scara comuna");
  assert.match(cfg, /deviceSizes: \[\.\.\.LATIMI_ECRAN\]/, "`deviceSizes` nu mai vine din scara");
  assert.match(cfg, /imageSizes: \[\.\.\.LATIMI_MICI\]/, "`imageSizes` nu mai vine din scara");
  assert.match(cfg, /qualities: \[CALITATE\]/, "`qualities` nu mai vine din scara");
});

test("⚠ `cdnImage` nu mai poate cere o latime din afara scarii", () => {
  /*
   * Apelantii scriu in continuare numarul care li se potriveste — locul de randare stie cat ii
   * trebuie. Ce nu mai pot e sa nasca un fisier nou din asta.
   *
   * ⚠ NUMERELE DE MAI JOS SUNT CELE ADEVARATE, culese din apeluri pe 07.09.2026: 64, 96, 160,
   * 256, 320, 480, 1600, 2560. Opt latimi, niciuna comuna cu ce cerea `next/image` — deci un logo
   * si un card de produs erau doua fisiere pentru marimi pe care ochiul nu le deosebeste.
   */
  const cerute = [64, 96, 160, 256, 320, 480, 1600, 2560];
  const iesite = new Set(cerute.map(latimeaDePeScara));

  for (const l of iesite) {
    assert.ok(LATIMI.includes(l), `${l} nu e pe scara`);
  }
  assert.ok(
    iesite.size < cerute.length,
    `cele ${cerute.length} latimi cerute n-au fost stranse deloc: ${[...iesite].join(", ")}`,
  );
  /* Si cea mai scumpa dintre ele, 2560 din lightbox, chiar coboara. */
  assert.equal(latimeaDePeScara(2560), 1920);
});

/* ═══════════════════════════════════════════════════════════════════════════
   CHEIA VARIANTEI — mutata aici cand a fost scos Workerul
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ terminatia originalului RAMANE in cheia variantei", () => {
  /*
   * ⚠ `poza.jpg` si `poza.webp` sunt DOUA fisiere. Daca varianta ar arunca terminatia
   * originalului, amandoua ar da `…/poza.webp` — adica una ar fi servita in locul celeilalte,
   * tacut, si comerciantul ar vedea alta poza decat a urcat.
   *
   * ⚠ Randurile astea vin din `varianta-si-worker.test.ts`, sters odata cu Workerul pe
   * 07.09.2026. Contractul cu Cloudflare a disparut; cerinta asupra cheii, nu.
   */
  const a = cheieVarianta("products/x/poza.jpg", 640, 75);
  const b = cheieVarianta("products/x/poza.webp", 640, 75);
  assert.notEqual(a, b, "doua originale diferite au ajuns la aceeasi varianta");
  assert.equal(a, "_optim/w640q75/products/x/poza.jpg.webp");
  assert.equal(b, "_optim/w640q75/products/x/poza.webp.webp");
});

test("⚠ cheia variantei poarta latimea SI calitatea, deosebite intre ele", () => {
  /*
   * Ele sunt tot ce deosebeste doua taieturi ale aceleiasi poze. Lipite fara despartitor, sau una
   * scrisa peste cealalta, `w64q75` si `w6q475` ar fi ajuns acelasi fisier.
   */
  const chei = new Set<string>();
  for (const l of LATIMI) for (const q of [50, 75, 95]) chei.add(cheieVarianta("products/x/p.webp", l, q));
  assert.equal(chei.size, LATIMI.length * 3, "doua combinatii de latime si calitate se calca");
});

test("⚠ toate cheile stau sub un singur prefix, cel pe care il curata unealta", () => {
  /*
   * `scripts/curata-optim-personalizari.mjs` si orice viitoare curatenie se sprijina pe prefixul
   * asta. Schimbat aici si nu acolo, unealta ar fi cautat intr-un dosar gol si ar fi raportat
   * linistita „nimic de sters".
   */
  for (const l of LATIMI) {
    assert.ok(cheieVarianta("products/x/p.webp", l, CALITATE).startsWith(`${PREFIX_VARIANTE}/`));
  }
  assert.equal(PREFIX_VARIANTE, "_optim");
});

test("⚠ varianta PNG isi are cheia ei si nu calca varianta WebP a aceleiasi poze", () => {
  /*
   * `png` exista doar pentru emailuri (vezi `FormatVarianta`). Fara formatul in cheie, PNG-ul
   * logoului s-ar fi scris peste WebP-ul lui: vitrina ar fi primit un PNG sub numele unui WebP, sau
   * emailul un WebP, adica exact dreptunghiul negru reclamat.
   */
  const webp = cheieVarianta("logos/x/logo.webp", 640, 75);
  const png = cheieVarianta("logos/x/logo.webp", 640, 75, "png");
  assert.equal(webp, "_optim/w640q75/logos/x/logo.webp.webp", "implicitul a incetat sa fie WebP");
  assert.equal(png, "_optim/w640q75/logos/x/logo.webp.png");
});

test("⚠ `cheieOptimizabila` primeste prefixele noastre si refuza restul", () => {
  for (const buna of ["logos/a/b.webp", "products/a/b.JPG", "covers/a/b.avif", "gallery/a/b.png", "avatars/a/b.gif"]) {
    assert.equal(cheieOptimizabila(buna), true, buna);
  }
  for (const rea of [
    "",
    "alt-dosar/a/b.webp",
    "logos/../facturi/x.webp",
    "logos/a/b.svg",
    "logos/a/b.webp?v=2",
    "logos/a b.webp",
    "_optim/w640q75/logos/a/b.webp.webp",
    /* Incarcarile cumparatorilor: ruta le refuza, deci si regula comuna, in orice scriere. */
    "products/customizations/11111111-1111-4111-8111-111111111111/poza.webp",
    "PRODUCTS/CUSTOMIZATIONS/11111111-1111-4111-8111-111111111111/poza.webp",
    "products//customizations/11111111-1111-4111-8111-111111111111/poza.webp",
  ]) {
    assert.equal(cheieOptimizabila(rea), false, rea);
  }
});

test("⚠ ruta citeste regula de chei din modulul comun, nu dintr-o copie", () => {
  /*
   * ⚠ DE CE SE CITESTE SURSA: ruta importa `sharp` si `@/lib/r2`, deci nu se incarca intr-o proba
   * pura; purtarea ei e probata in `src/app/api/img/*.test.ts`. Aici se cere doar ca regula sa fie
   * UNA: o copie scrisa din nou in ruta s-ar desparti de cea citita de emailuri, iar emailurile ar
   * compune adrese pe care ruta le refuza, adica logouri rupte.
   */
  const ruta = sursa("src/app/api/img/route.ts");
  assert.equal(/const KEY_RE\s*=/.test(ruta), false, "ruta si-a scris din nou propria regula de chei");
  assert.match(ruta, /cheieOptimizabila\(key\)/, "ruta nu mai trece cheia prin regula comuna");
  assert.equal(
    /function esteIncarcareDeCumparator/.test(ruta),
    false,
    "ruta si-a scris din nou refuzul incarcarilor, pe langa cel citit de regula comuna",
  );
});

test("⚠ PNG doar pentru WebP si AVIF, si la o singura latime, de pe scara", () => {
  /*
   * Amandoua capetele citesc aceeasi regula: emailul, ca sa hotarasca ce trimite prin PNG, si ruta,
   * ca sa nu faca PNG din nimic altceva. Latimea e una singura, ca sa existe cel mult un PNG pe poza.
   */
  for (const da of ["logos/a/b.webp", "logos/a/b.WEBP", "gallery/a/b.avif"]) {
    assert.equal(sursaCerePngInEmail(da), true, da);
  }
  for (const nu of ["logos/a/b.png", "logos/a/b.jpg", "logos/a/b.jpeg", "logos/a/b.gif", "logos/a/b.webp.png"]) {
    assert.equal(sursaCerePngInEmail(nu), false, nu);
  }
  assert.ok(LATIMI.includes(LATIME_PNG), `${LATIME_PNG} nu e pe scara comuna`);
});
