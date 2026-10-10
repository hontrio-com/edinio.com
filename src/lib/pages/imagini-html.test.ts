import test from "node:test";
import assert from "node:assert/strict";

/**
 * POZELE DIN HTML-UL BLOCURILOR trec prin optimizator — si NIMIC altceva nu se schimba.
 *
 * ⚠ CE APARA: functia ruleaza pe HTML deja curatat si e ultima atingere inainte de pagina. O
 * rescriere prea larga ar putea schimba ce a hotarat curatarea (sa deschida un atribut, sa lipeasca
 * marcaj). Deci probele cer mai ales ce NU se atinge.
 *
 * ⚠ Mediul se pune inaintea importurilor (modulele isi citesc variabilele la incarcare). Calea
 * directa e STINSA aici: adresa iesita e `/api/img?…`, cu `&`, adica exact cazul care cere
 * escaparea in atribut.
 */
const CDN = "https://cdn-de-proba.exemplu";
process.env.NEXT_PUBLIC_CDN_URL = CDN;
delete process.env.NEXT_PUBLIC_IMAGINI_DIRECTE;

const { optimizeazaImaginiHtml } = await import("./imagini-html");
const { prepareBlocksForPublic } = await import("./prepare-blocks");
const { cereIzolare } = await import("./cod-personalizat");

const CHEIE = "products/u1/poza.webp";
const ORIGINAL = `${CDN}/${CHEIE}`;
const OPTIMIZAT = `/api/img?p=${encodeURIComponent(CHEIE)}&amp;w=1536&amp;q=75`;

test("src-ul unei poze din depozit devine varianta de 1536, cu & escapat in atribut", () => {
  assert.equal(
    optimizeazaImaginiHtml(`<p>x</p><img src="${ORIGINAL}" alt="a">`),
    `<p>x</p><img src="${OPTIMIZAT}" alt="a">`,
  );
  assert.equal(
    optimizeazaImaginiHtml(`<img alt="a" class="c" src="${ORIGINAL}" width="300">`),
    `<img alt="a" class="c" src="${OPTIMIZAT}" width="300">`,
  );
  assert.equal(
    optimizeazaImaginiHtml(`<IMG SRC="${ORIGINAL}"><img\nsrc="${ORIGINAL}">`),
    `<IMG SRC="${OPTIMIZAT}"><img\nsrc="${OPTIMIZAT}">`,
  );
});

test("⚠ ce nu e o poza a noastra, intr-un src curat, ramane OCTET CU OCTET", () => {
  const neatinse = [
    `<img src="https://altcineva.exemplu/poza.webp">`,
    `<img srcset="${ORIGINAL} 1x" src="https://altcineva.exemplu/a.png">`,
    `<img data-src="${ORIGINAL}">`,
    `<img src='${ORIGINAL}'>`, // ghilimele simple: nu e forma pe care o scrie curatarea
    `<img src="${ORIGINAL}?v=2">`,
    `<img src="${ORIGINAL}&amp;x">`,
    `<img src="http://cdn-de-proba.exemplu/${CHEIE}">`,
    `<a href="${ORIGINAL}">link</a>`,
    `<p>src="${ORIGINAL}"</p>`,
    `<video src="${ORIGINAL}"></video>`,
    `<img src="${CDN}/cdn-cgi/image/width=1200/${CHEIE}">`,
    `<img src="/api/img?p=x&amp;w=640">`,
    "",
    "<p>fara poze</p>",
  ];
  for (const h of neatinse) assert.equal(optimizeazaImaginiHtml(h), h, h);
});

test("⚠ un GIF ramane originalul (sharp ar fi pastrat doar primul cadru al animatiei)", () => {
  const gif = `<img src="${CDN}/products/u1/banner.gif">`;
  assert.equal(optimizeazaImaginiHtml(gif), gif);
});

test("⚠ rescrierea nu schimba hotararea despre codul activ", () => {
  const h = `<div style="color:red"><img src="${ORIGINAL}" alt="x"></div>`;
  assert.equal(cereIzolare(optimizeazaImaginiHtml(h), undefined), cereIzolare(h, undefined));
});

test("prepareBlocksForPublic optimizeaza pozele blocului HTML din pagina", () => {
  const [h] = prepareBlocksForPublic([
    { id: "h", type: "html", html: `<div><img src="${ORIGINAL}" alt="x"></div>` },
  ] as never) as unknown as { html: string }[];
  assert.equal(h.html.includes(ORIGINAL), false, `a ramas originalul: ${h.html}`);
  assert.equal(h.html.split("/api/img?").length - 1, 1, h.html);
});

test("codul activ (cadrul izolat) ramane NEATINS, ca pana acum", () => {
  /* Merge intreg in cadrul izolat (vezi `cereIzolare`); nu-l curatam, deci nici nu-l rescriem. */
  const brut = `<div><img src="${ORIGINAL}" onclick="x()"></div>`;
  const [h] = prepareBlocksForPublic([{ id: "h", type: "html", html: brut }] as never) as unknown as { html: string }[];
  assert.equal(h.html, brut);
});

test("textul bogat nu lasa deloc <img> (editorul lui n-are poze), deci n-are ce rescrie", () => {
  const [t] = prepareBlocksForPublic([{ id: "t", type: "text", html: `<p>a</p><img src="${ORIGINAL}">` }] as never) as unknown as { html: string }[];
  assert.equal(t.html, "<p>a</p>");
});
