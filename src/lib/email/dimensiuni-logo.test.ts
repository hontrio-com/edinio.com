import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

/**
 * MARIMEA LOGOULUI, CITITA DIN PRIMII LUI OCTETI.
 *
 * Din ea invelisul scrie `width`/`height` pe `<img>`, pentru Outlook pe Windows (vezi
 * `atributeLogo`). Se citeste FARA `sharp`, fiindca drumul e cel al trimiterii emailurilor, deci si
 * al finalizarii comenzii; aici `sharp` e doar codorul care produce probele, cu octeti adevarati.
 *
 * ⚠ FIECARE RAMURA A CITITORULUI ARE PROBA EI, iar proba cere si FORMA pe care a scris-o codorul:
 * daca `sharp` ar scrie maine altfel un WebP, proba ar cadea pe forma, nu ar trece tacut pe alta
 * ramura.
 *
 * ⚠ MEDIUL SE PUNE INAINTEA IMPORTURILOR: `r2-url.ts` isi citeste domeniile la incarcare.
 */

process.env.NEXT_PUBLIC_CDN_URL = "https://edinio-cdn.com";
process.env.R2_PUBLIC_URL = "https://pub-alnostru.r2.dev";
const { dimensiuniDinAntet, dimensiuniLogo } = await import("./dimensiuni-logo");

/* Impare dinadins: o citire gresita cu unu (latimea „minus unu" din WebP) s-ar vedea. */
const LAT = 37;
const INA = 11;
const MARIME = { latime: LAT, inaltime: INA };

const panza = (canale: 3 | 4) =>
  sharp({ create: { width: LAT, height: INA, channels: canale, background: { r: 200, g: 100, b: 50, alpha: canale === 4 ? 0.5 : 1 } } });
const fel = (o: Uint8Array) => String.fromCharCode(...o.subarray(12, 16));

test("⚠ WebP, in toate cele trei forme, si PNG: marimea citita e cea adevarata", async () => {
  const cazuri: { nume: string; octeti: Buffer; fel: string | null }[] = [
    { nume: "WebP cu pierderi (VP8)", octeti: await panza(3).webp({ quality: 80 }).toBuffer(), fel: "VP8 " },
    { nume: "WebP fara pierderi (VP8L)", octeti: await panza(3).webp({ lossless: true }).toBuffer(), fel: "VP8L" },
    { nume: "WebP cu transparenta (VP8X)", octeti: await panza(4).webp({ quality: 80 }).toBuffer(), fel: "VP8X" },
    { nume: "PNG", octeti: await panza(4).png().toBuffer(), fel: null },
  ];
  for (const c of cazuri) {
    const o = new Uint8Array(c.octeti);
    if (c.fel) assert.equal(fel(o), c.fel, `${c.nume}: codorul a scris alta forma, proba nu mai acopera ramura`);
    assert.deepEqual(dimensiuniDinAntet(o), MARIME, c.nume);
    /* Si din primii 4 KB, cat cere `dimensiuniLogo`. */
    assert.deepEqual(dimensiuniDinAntet(o.subarray(0, 4096)), MARIME, `${c.nume}, taiat la 4 KB`);
  }
});

test("AVIF: marimea din cutia `ispe`", async () => {
  const o = new Uint8Array(await panza(4).avif({ quality: 50 }).toBuffer());
  assert.deepEqual(dimensiuniDinAntet(o), MARIME);
});

test("ce nu se recunoaste da `null`, nu o marime inventata", () => {
  const text = (s: string) => new TextEncoder().encode(s);
  for (const o of [
    new Uint8Array(0),
    new Uint8Array(3),
    text("<html>nu e o poza</html>"),
    text(`RIFF\0\0\0\0WEBPABCD${"\0".repeat(20)}`),
    text(`GIF89a${"\0".repeat(20)}`),
  ]) {
    assert.equal(dimensiuniDinAntet(o), null, new TextDecoder().decode(o.subarray(0, 12)));
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   CEREREA: doar de pe depozitul nostru, doar inceputul fisierului, o data
   ═══════════════════════════════════════════════════════════════════════════ */

const LOGO = "https://edinio-cdn.com/logos/545924b8-70f7-4963-bd79-e44b89eca1c5/1785676092941-s8wln.webp";

function aducator(raspuns: () => Promise<Response>) {
  const cereri: { adresa: string; range: string | null }[] = [];
  const f = (async (adresa: string | URL | Request, init?: RequestInit) => {
    cereri.push({ adresa: String(adresa), range: new Headers(init?.headers).get("range") });
    return raspuns();
  }) as typeof fetch;
  return { f, cereri };
}

test("⚠ logoul nostru: se cer doar primii 4 KB, si o singura data", async () => {
  const octeti = new Uint8Array(await panza(4).webp({ quality: 80 }).toBuffer());
  const { f, cereri } = aducator(async () => new Response(octeti, { status: 206 }));

  assert.deepEqual(await dimensiuniLogo(LOGO, f), MARIME);
  assert.deepEqual(await dimensiuniLogo(LOGO, f), MARIME);

  assert.equal(cereri.length, 1, "a doua oara s-a cerut din nou");
  assert.equal(cereri[0].adresa, LOGO);
  assert.equal(cereri[0].range, "bytes=0-4095", "s-a cerut fisierul intreg");
});

test("⚠ o adresa care nu pleaca prin PNG nu se cere NICIODATA de pe server", async () => {
  /* Serverul n-are voie sa ceara adrese scrise de altcineva: logoul de email se poate alege si de
     mana, iar o adresa interna ar fi fost ceruta din reteaua noastra. */
  const { f, cereri } = aducator(async () => new Response("x"));
  for (const a of [
    "https://exemplu.ro/logo.webp",
    "https://edinio-cdn.com/logos/545924b8-70f7-4963-bd79-e44b89eca1c5/logo.png",
    "http://169.254.169.254/latest/meta-data/logo.webp",
    "",
    null,
  ]) {
    assert.equal(await dimensiuniLogo(a, f), null, String(a));
  }
  assert.deepEqual(cereri, [], `serverul a cerut: ${cereri.map((c) => c.adresa).join(", ")}`);
});

test("⚠ orice esec da `null` si nu arunca: emailul pleaca oricum", async () => {
  const alt = "https://edinio-cdn.com/logos/545924b8-70f7-4963-bd79-e44b89eca1c5/alt.webp";
  const esecuri: [string, () => Promise<Response>][] = [
    ["reteaua cade", async () => { throw new Error("ECONNRESET"); }],
    ["404", async () => new Response("nu e", { status: 404 })],
    ["octeti fara forma", async () => new Response("<html></html>", { status: 200 })],
  ];
  for (const [cum, raspuns] of esecuri) {
    const { f, cereri } = aducator(raspuns);
    assert.equal(await dimensiuniLogo(alt, f), null, cum);
    /* Chiar s-a cerut: altfel `null` ar fi venit din paza de adresa, nu din esec. */
    assert.equal(cereri.length, 1, `${cum}: nu s-a ajuns la cerere`);
  }
});
