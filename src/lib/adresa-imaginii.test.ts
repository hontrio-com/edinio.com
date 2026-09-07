import test from "node:test";
import assert from "node:assert/strict";
import { LATIMI } from "./latimi-imagini";

/**
 * CE ADRESA PRIMESTE O IMAGINE — cele doua cai, si de ce trebuie sa spuna acelasi lucru.
 *
 * ═══ ⚠ CE A COSTAT LIPSA FISIERULUI ASTEIA ═══
 *
 * Niciuna dintre cele doua functii care hotarasc adresa fiecarei imagini din platforma n-avea
 * vreo proba. Nimic nu spunea pe ce drum pleaca pozele, deci nimic n-a scartait cand drumul ala a
 * inceput sa coste: 8,50 $ in noua zile la Cloudflare, proiectie 29,28 $ pe ciclu, pentru
 * transformari care se REFAC in fiecare luna.
 *
 * ⚠ SI ERAU DOUA CAI CARE NU SE ATINGEAU: `next/image` cerea latimile lui Next, iar `cdnImage`
 * — pentru `<img>`-urile scrise de mana — cerea alte opt numere, niciunul comun. Un logo la 480
 * si un card de produs la 640 erau doua fisiere pentru marimi pe care ochiul nu le deosebeste,
 * platite amandoua. De-aia probele de aici cer mai ales UN LUCRU: ca cele doua cai sa dea, pentru
 * aceeasi poza si aceeasi marime, EXACT aceeasi adresa.
 *
 * ⚠ MEDIUL SE PUNE INAINTEA IMPORTURILOR: amandoua modulele isi citesc `NEXT_PUBLIC_CDN_URL` la
 * incarcare, nu la fiecare apel.
 */

const CDN = "https://cdn-de-proba.exemplu";
process.env.NEXT_PUBLIC_CDN_URL = CDN;

const { default: imageLoader } = await import("./supabase-image-loader");
const { cdnImage } = await import("./cdn-image");

const CHEIE = "products/11111111-1111-4111-8111-111111111111/poza.webp";
const PE_R2 = `https://pub-exemplu.r2.dev/${CHEIE}`;
const PE_CDN = `${CDN}/${CHEIE}`;

const params = (u: string) => new URL(u, "https://magazin.exemplu").searchParams;

/* ═══════════════════════════════════════════════════════════════════════════
   DRUMUL — si de ce NU mai e cel de la Cloudflare
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ nicio cale nu mai trimite prin redimensionatorul platit al Cloudflare", () => {
  /*
   * ⚠ ASTA E PROBA CARE APARA FACTURA.
   *
   * `/cdn-cgi/image/` factureaza transformari UNICE (imagine × set de parametri) si RESETEAZA
   * contorul lunar: rezultatul ramane in cache, dar in ciclul urmator se numara din nou.
   * Inchiriezi taietorul, nu poza taiata. `/api/img` taie o data, pastreaza varianta in depozit,
   * si de-atunci doar arata drumul.
   *
   * Se cere pe AMANDOUA caile, fiindca a fost readusa o data pe fiecare.
   */
  for (const src of [PE_R2, PE_CDN]) {
    const dinNext = imageLoader({ src, width: 640, quality: 75 });
    const dinImg = cdnImage(src, 640);
    for (const [cale, u] of [["next/image", dinNext], ["cdnImage", dinImg]] as const) {
      assert.equal(u.includes("/cdn-cgi/image/"), false, `${cale} inca trece prin Cloudflare: ${u}`);
      assert.ok(u.startsWith("/api/img?"), `${cale} nu trece prin optimizatorul nostru: ${u}`);
    }
  }
});

test("⚠ cele doua cai dau EXACT aceeasi adresa pentru aceeasi poza si aceeasi marime", () => {
  /*
   * Fara randul asta, fiecare cale isi face fisierul ei si aceeasi poza se taie de doua ori — ceea
   * ce s-a si intamplat pana pe 07.09.2026. Egalitatea e ce face ca a doua cerere sa fie gratuita.
   */
  for (const latime of LATIMI) {
    assert.equal(
      cdnImage(PE_R2, latime),
      imageLoader({ src: PE_R2, width: latime, quality: 75 }),
      `cele doua cai se despart la latimea ${latime}`,
    );
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   CHEIA — din amandoua formele de adresa stocata
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ cheia se citeste si de pe `*.r2.dev`, si de pe domeniul CDN", () => {
  /*
   * Randurile vechi poarta adresa galetii brute, incarcarile noi pe cea a CDN-ului. Citita doar
   * una, jumatate din catalog ar fi plecat NEOPTIMIZATA — adica poza intreaga, la marimea ei de pe
   * disc, pe telefoanele oamenilor.
   */
  for (const src of [PE_R2, PE_CDN]) {
    const u = cdnImage(src, 640);
    assert.equal(params(u).get("p"), CHEIE, `cheia nu s-a citit din ${src}`);
  }
});

test("⚠ ce NU e al nostru pleaca neatins", () => {
  /*
   * ⚠ PERECHEA NEGATIVA, si e neaparata: fara ea, „totul trece prin /api/img" s-ar fi putut
   * indeplini trimitand acolo si adrese straine — iar ruta le-ar fi refuzat pe toate (`KEY_RE`),
   * deci ar fi fost poze rupte, nu poze neoptimizate.
   */
  for (const strain of [
    "https://exemplu.ro/poza.jpg",
    "/local/poza.png",
    "data:image/png;base64,iVBORw0KGgo=",
    "",
  ]) {
    assert.equal(cdnImage(strain, 640), strain, `s-a atins o adresa straina: ${strain}`);
    assert.equal(imageLoader({ src: strain, width: 640 }), strain, `loaderul a atins: ${strain}`);
  }
});

test("⚠ o adresa deja transformata nu intra a doua oara in optimizator", () => {
  const deja = `${CDN}/cdn-cgi/image/width=640,quality=75,format=auto/${CHEIE}`;
  assert.equal(cdnImage(deja, 640), deja);
  assert.equal(imageLoader({ src: deja, width: 640 }), deja);

  const alNostru = `/api/img?p=${encodeURIComponent(CHEIE)}&w=640&q=75`;
  assert.equal(imageLoader({ src: alNostru, width: 640 }), alNostru);
});

/* ═══════════════════════════════════════════════════════════════════════════
   MARIMEA — ce ajunge in adresa
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ `cdnImage` urca latimea pe scara; loaderul o primeste deja de pe ea", () => {
  /*
   * Deosebirea nu e o scapare: `next/image` cere DOAR latimi din `deviceSizes`/`imageSizes`, care
   * sunt chiar scara. `cdnImage` primeste numere scrise de mana in componente, deci el e cel care
   * trebuie sa le urce.
   */
  for (const [cerut, asteptat] of [[96, 128], [160, 256], [480, 640], [1600, 1920], [2560, 1920]] as const) {
    const u = cdnImage(PE_R2, cerut);
    assert.equal(Number(params(u).get("w")), asteptat, `${cerut} n-a urcat la ${asteptat}`);
  }

  /* Si nicio latime iesita de aici nu e in afara scarii. */
  for (const cerut of [1, 63, 64, 300, 999, 5000]) {
    assert.ok(LATIMI.includes(Number(params(cdnImage(PE_R2, cerut)).get("w"))), `latime straina din ${cerut}`);
  }
});

test("⚠ cheia se INVELESTE in interogare, nu se lipeste", () => {
  /*
   * O cheie poate purta caractere pe care interogarea le citeste altfel. Lipita, `&` sau `#` din
   * ea ar fi rupt adresa si ar fi schimbat `w` — adica alt fisier decat cel cerut, sau niciunul.
   */
  const cuSemne = "products/11111111-1111-4111-8111-111111111111/a&b#c.webp";
  const u = cdnImage(`https://pub-exemplu.r2.dev/${cuSemne}`, 640);
  assert.equal(params(u).get("p"), cuSemne, "cheia n-a ajuns intreaga");
  assert.equal(params(u).get("w"), "640", "interogarea s-a rupt");
});

test("⚠ calitatea implicita e una singura, si e cea a scarii", () => {
  /*
   * Fiecare calitate distincta e un set INTREG de variante paralele, in depozit si — cat timp
   * eram pe Cloudflare — pe factura. `next.config.ts` o si ingusteaza la o singura valoare
   * permisa; randul asta cere ca implicitul celor doua cai sa fie chiar aceea.
   */
  assert.equal(params(cdnImage(PE_R2, 640)).get("q"), "75");
  assert.equal(params(imageLoader({ src: PE_R2, width: 640 })).get("q"), "75");
});
