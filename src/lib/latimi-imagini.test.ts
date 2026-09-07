import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CALITATE, LATIMI, LATIMI_ECRAN, LATIMI_MICI, latimeaDePeScara } from "./latimi-imagini";

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
 * ⚠ SI DE CE CONTEAZA MAI MULT DE ACUM INCOLO: pasul urmator e sa PREGENERAM variantele in R2 si
 * sa le servim ca obiecte simple, ca sa nu se mai transforme nimic lunar. Aia merge numai daca
 * toate caile cer EXACT aceleasi latimi. O latime ceruta de o cale si negenerata de alta nu e o
 * poza mai putin clara — e o poza care lipseste.
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
   * fi nascut o latime in afara scarii — adica o transformare noua in fiecare luna, si un fisier
   * pe care pregenerarea nu l-ar face niciodata.
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
   * ⚠ ASTA E PROBA CARE APARA PASUL URMATOR.
   *
   * `/api/img` genereaza si pastreaza `_optim/w<W>q<Q>/<cheie>.webp`, si el urca latimea ceruta la
   * una din treptele LUI. Daca scara comuna ar cere o latime care nu e printre ele, calea
   * pregenerata si calea Cloudflare ar arata catre fisiere DIFERITE — si atunci pregenerarea n-ar
   * mai scoate niciun ban din factura, fiindca fisierul cerut n-ar exista niciodata.
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
