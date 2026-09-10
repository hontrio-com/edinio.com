import assert from "node:assert/strict";
import { test, before, beforeEach } from "node:test";
import { register } from "node:module";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { PREFIX_INCARCARI } from "@/lib/customization/adresa";

/**
 * `/api/img?…&f=png`: VARIANTA PNG, PENTRU EMAILURI.
 *
 * ═══ ⚠ CE APARA ═══
 *
 * Emailurile nu mai trimit logoul WebP din baza, ci varianta lui PNG prin ruta asta (vezi
 * `logoPentruEmail`): Gmail transforma WebP-ul in JPG, iar transparenta logoului BricoSmart a iesit
 * NEAGRA in emailul „Comanda noua" (10.09.2026).
 *
 * ⚠ SHARP E CEL ADEVARAT, nu inlocuit ca in `incarcari-private.test.ts`. Tot rostul variantei e ca
 * transparenta sa supravietuiasca, iar asta n-o poate spune decat decodorul adevarat, pe octetii
 * pe care ruta i-a scris in depozit. Se inlocuiesc doar depozitul si contorul durabil.
 *
 * ⚠ SI FIECARE AFIRMATIE ARE PERECHEA EI: fara `f`, ruta face exact ce facea (WebP); orice alt `f`,
 * sau `f=png` pe o sursa JPG ori PNG, cade tot pe WebP. Altfel „iese PNG" s-ar fi putut indeplini
 * facand PNG din toate pozele vitrinelor.
 */

const R2_PUBLIC = "https://pub-exemplu.r2.dev";
const ID = "545924b8-70f7-4963-bd79-e44b89eca1c5";
const CHEIE_LOGO = `logos/${ID}/logo.webp`;
const CHEIE_LOGO_MARE = `logos/${ID}/logo-mare.webp`;
const CHEIE_JPG = `products/${ID}/poza.jpg`;
const CHEIE_PNG = `logos/${ID}/logo.png`;
const VARIANTA_PNG = `_optim/w640q75/${CHEIE_LOGO}.png`;
const VARIANTA_WEBP = `_optim/w640q75/${CHEIE_LOGO}.webp`;
const SEMNATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/* ── Se inlocuiesc depozitul si contorul durabil. Ruta si `sharp` sunt cele adevarate. ───────── */

const HOOK = `data:text/javascript,${encodeURIComponent(
  `export async function resolve(specifier, context, next) {
     if (specifier === "@/lib/r2") {
       return {
         url: "data:text/javascript," + encodeURIComponent(
           "export const getFromR2 = async (k) => globalThis.__r2Citeste(k); export const uploadToR2 = async (b, k, t) => globalThis.__r2Scrie(b, k, t); export const existaInR2 = async (k) => globalThis.__r2Exista(k);"
         ),
         shortCircuit: true, format: "module",
       };
     }
     if (specifier === "@/lib/utils/limita-durabila") {
       return {
         url: "data:text/javascript," + encodeURIComponent(
           "export const consumaLimita = async (...a) => globalThis.__limita(...a); export const reseteazaLimita = async () => {}; export const mesajLimita = () => '';"
         ),
         shortCircuit: true, format: "module",
       };
     }
     return next(specifier, context);
   }`,
)}`;

type Global = typeof globalThis & {
  __r2Citeste: (k: string) => Promise<Buffer | null>;
  __r2Scrie: (b: Buffer, k: string, t: string) => Promise<string>;
  __r2Exista: (k: string) => Promise<boolean>;
  __limita: (...a: unknown[]) => Promise<{ permis: boolean; blocatPana: null }>;
};

let depozit: Record<string, Buffer> = {};
let citiri: string[] = [];
let scrieri: { cheie: string; tip: string; octeti: Buffer }[] = [];
let scriereaCade = false;
let limitaPermite = true;
let apeluriLimita: unknown[][] = [];
let GET: (req: NextRequest) => Promise<Response>;
let logoPentruEmail: (adresa: string | null | undefined) => string | null;

/** Un logo mic ca al lor: jumatatea stanga transparenta, cea dreapta portocalie si opaca. */
let LOGO: Buffer;
/** Unul de marimea logoului BricoSmart, ca sa se vada taierea la latimea fixa. */
let LOGO_MARE: Buffer;
let JPG: Buffer;
let PNG: Buffer;

before(async () => {
  process.env.R2_PUBLIC_URL = R2_PUBLIC;
  /* Redirectarea duce la `R2_PUBLIC_URL` numai fara CDN: probele cer o tinta cunoscuta. */
  delete process.env.NEXT_PUBLIC_CDN_URL;
  register(HOOK);
  const g = globalThis as Global;
  g.__r2Citeste = async (k) => {
    citiri.push(k);
    return depozit[k] ?? null;
  };
  g.__r2Scrie = async (b, k, t) => {
    if (scriereaCade) throw new Error("depozitul nu raspunde");
    scrieri.push({ cheie: k, tip: t, octeti: b });
    depozit[k] = b;
    return `${R2_PUBLIC}/${k}`;
  };
  g.__r2Exista = async (k) => {
    citiri.push(k);
    return depozit[k] !== undefined;
  };
  g.__limita = async (...a) => {
    apeluriLimita.push(a);
    return { permis: limitaPermite, blocatPana: null };
  };

  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  const portocaliu = { r: 242, g: 140, b: 40, alpha: 1 };
  LOGO = await sharp({ create: { width: 40, height: 10, channels: 4, background: transparent } })
    .composite([{ input: { create: { width: 20, height: 10, channels: 4, background: portocaliu } }, left: 20, top: 0 }])
    .webp({ lossless: true })
    .toBuffer();
  LOGO_MARE = await sharp({ create: { width: 1600, height: 289, channels: 4, background: transparent } })
    .composite([{ input: { create: { width: 800, height: 289, channels: 4, background: portocaliu } }, left: 800, top: 0 }])
    .webp({ quality: 80 })
    .toBuffer();
  JPG = await sharp({ create: { width: 30, height: 20, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();
  PNG = await sharp({ create: { width: 30, height: 20, channels: 4, background: portocaliu } }).png().toBuffer();

  ({ GET } = (await import("./route")) as unknown as { GET: typeof GET });
  ({ logoPentruEmail } = await import("@/lib/email/logo-email"));
});

beforeEach(() => {
  depozit = { [CHEIE_LOGO]: LOGO, [CHEIE_LOGO_MARE]: LOGO_MARE, [CHEIE_JPG]: JPG, [CHEIE_PNG]: PNG };
  citiri = [];
  scrieri = [];
  scriereaCade = false;
  limitaPermite = true;
  apeluriLimita = [];
});

function cere(p: string, extra: Record<string, string> = {}) {
  const u = new URL("https://www.edinio.com/api/img");
  u.searchParams.set("p", p);
  u.searchParams.set("w", "640");
  u.searchParams.set("q", "75");
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return new NextRequest(u.toString());
}

/** Culoarea si transparenta unui pixel, citite din octetii scrisi de ruta. */
async function pixel(octeti: Buffer, x: number, y: number) {
  const { data, info } = await sharp(octeti).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

/* ═══════════════════════════════════════════════════════════════════════════
   VARIANTA PNG
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ `f=png`: varianta e PNG, transparenta ramane INTREAGA, la 96 DPI, si ruta trimite la ea", async () => {
  const r = await GET(cere(CHEIE_LOGO, { f: "png" }));

  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), `${R2_PUBLIC}/${VARIANTA_PNG}`, "drumul nu duce la varianta PNG");
  assert.equal(scrieri.length, 1, "varianta nu s-a scris");
  const [s] = scrieri;
  assert.equal(s.cheie, VARIANTA_PNG);
  assert.equal(s.tip, "image/png", "varianta PNG s-a scris cu tipul altui format");
  assert.deepEqual(s.octeti.subarray(0, 8), SEMNATURA_PNG, "octetii scrisi nu sunt PNG");

  const m = await sharp(s.octeti).metadata();
  assert.equal(m.format, "png");
  assert.equal(m.hasAlpha, true, "PNG-ul a iesit fara canal de transparenta");
  assert.equal(m.width, 40, "logoul mic a fost marit");
  /* Fara densitate scrisa, libvips pune 25,4 DPI; un client care ar tine cont de ea l-ar mari. */
  assert.equal(m.density, 96, "PNG-ul n-are densitatea neutra");

  /* ⚠ ASTA E RECLAMATIA: partea transparenta ramane transparenta, nu se umple cu negru. */
  assert.equal((await pixel(s.octeti, 5, 5)).a, 0, "pixelul transparent a iesit opac");
  assert.deepEqual(await pixel(s.octeti, 30, 5), { r: 242, g: 140, b: 40, a: 255 }, "partea opaca si-a schimbat culoarea");
});

test("⚠ la PNG latimea e FIXA: `w=2048` si `w=16` dau acelasi, singur, PNG de 640", async () => {
  /*
   * Pe toate cele 18 trepte, un PNG de fotografie ar fi cantarit de 3 pana la 6 ori cat WebP-ul ei.
   * Emailul cere oricum doar 640, deci celelalte latimi nu le folosea nimeni.
   */
  const varianta = `_optim/w640q75/${CHEIE_LOGO_MARE}.png`;

  const mare = await GET(cere(CHEIE_LOGO_MARE, { f: "png", w: "2048" }));
  assert.equal(mare.headers.get("location"), `${R2_PUBLIC}/${varianta}`, "`w=2048` a nascut alt PNG");
  assert.deepEqual(scrieri.map((s) => s.cheie), [varianta]);
  assert.equal((await sharp(scrieri[0].octeti).metadata()).width, 640, "PNG-ul n-a fost taiat la 640");

  const mic = await GET(cere(CHEIE_LOGO_MARE, { f: "png", w: "16" }));
  assert.equal(mic.headers.get("location"), `${R2_PUBLIC}/${varianta}`, "`w=16` a nascut alt PNG");
  assert.equal(scrieri.length, 1, "s-a mai scris un PNG pentru aceeasi poza");
});

test("⚠ POZITIV: fara `f`, ruta face ce facea (WebP), deci vitrinele nu se schimba", async () => {
  const r = await GET(cere(CHEIE_LOGO));

  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), `${R2_PUBLIC}/${VARIANTA_WEBP}`);
  assert.equal(scrieri[0]?.tip, "image/webp");
  assert.equal((await sharp(scrieri[0].octeti).metadata()).format, "webp");

  /* Si latimea ceruta ramane a ei: fixarea e doar pentru PNG. */
  const lat = await GET(cere(CHEIE_LOGO_MARE, { w: "1024" }));
  assert.equal(lat.headers.get("location"), `${R2_PUBLIC}/_optim/w1024q75/${CHEIE_LOGO_MARE}.webp`);
});

test("⚠ orice alt `f` cade pe WebP: pe aici nu se naste alt fel de fisier", async () => {
  for (const f of ["jpeg", "jpg", "svg", "gif", "avif", "PNG", " png", "png,webp", ""]) {
    depozit = { [CHEIE_LOGO]: LOGO };
    scrieri = [];
    const r = await GET(cere(CHEIE_LOGO, { f }));
    assert.equal(r.headers.get("location"), `${R2_PUBLIC}/${VARIANTA_WEBP}`, `f=${JSON.stringify(f)}`);
    assert.equal(scrieri[0]?.tip, "image/webp", `f=${JSON.stringify(f)}`);
  }
});

test("⚠ `f=png` pe o sursa JPG sau PNG da tot WebP: PNG se face doar din WebP si AVIF", async () => {
  /* Aceeasi regula ca in email (`sursaCerePngInEmail`): altfel ruta ar fi facut PNG si din cele
     27 de mii de poze de produs, pe care emailul nu le cere niciodata asa. */
  for (const cheie of [CHEIE_JPG, CHEIE_PNG]) {
    scrieri = [];
    const r = await GET(cere(cheie, { f: "png" }));
    assert.equal(r.headers.get("location"), `${R2_PUBLIC}/_optim/w640q75/${cheie}.webp`, cheie);
    assert.equal(scrieri[0]?.tip, "image/webp", cheie);
  }
});

test("⚠ la PNG, `q` nu naste fisiere identice: aceeasi cheie pentru orice calitate", async () => {
  await GET(cere(CHEIE_LOGO, { f: "png", q: "95" }));
  await GET(cere(CHEIE_LOGO, { f: "png", q: "50" }));
  const r = await GET(cere(CHEIE_LOGO, { f: "png" }));

  assert.deepEqual(scrieri.map((s) => s.cheie), [VARIANTA_PNG], "calitatea a nascut inca un PNG");
  assert.equal(r.headers.get("location"), `${R2_PUBLIC}/${VARIANTA_PNG}`);
});

test("⚠ daca depozitul nu primeste varianta, octetii serviti poarta tipul PNG", async () => {
  /*
   * Drumul de rezerva al rutei: scrierea cade, deci raspunde cu octetii insisi. Cu tipul scris de
   * mana `image/webp`, cum era, clientul de email ar fi primit un PNG declarat WebP.
   */
  scriereaCade = true;
  const r = await GET(cere(CHEIE_LOGO, { f: "png" }));

  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await r.arrayBuffer()).subarray(0, 8), SEMNATURA_PNG);
});

/* ═══════════════════════════════════════════════════════════════════════════
   PLAFONUL SI REZERVA
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ o ratare PNG cantareste cat patru in plafonul durabil; una WebP, cat una", async () => {
  /* Plafonul numara ratari, nu octeti, iar un PNG are de cateva ori octetii WebP-ului aceleiasi
     poze. Cu greutatea asta, un IP scrie pe ora cam cat scria si inainte. */
  await GET(cere(CHEIE_LOGO, { f: "png" }));
  assert.equal(apeluriLimita.length, 1, "ratarea PNG n-a trecut prin plafon");
  assert.match(String(apeluriLimita[0][0]), /^img-variante:ip:/);
  assert.deepEqual(apeluriLimita[0].slice(1), [600, 3600, 0, 4]);

  apeluriLimita = [];
  await GET(cere(CHEIE_LOGO_MARE));
  assert.deepEqual(apeluriLimita[0]?.slice(1), [600, 3600, 0, 1], "ratarea WebP si-a schimbat greutatea");
});

test("⚠ plafonul atins pe PNG: se cade pe original, fara scriere, si se spune in jurnal", async (t) => {
  const jurnal = t.mock.method(console, "warn", () => {});
  limitaPermite = false;

  const r = await GET(cere(CHEIE_LOGO, { f: "png" }));

  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), `${R2_PUBLIC}/${CHEIE_LOGO}`, "rezerva nu e originalul");
  assert.deepEqual(scrieri, []);
  assert.ok(
    jurnal.mock.calls.some((c) => String(c.arguments[0]).includes("PNG")),
    "intoarcerea la WebP-ul original, adica la fondul negru din email, a trecut nevazuta",
  );
});

test("originalul lipsa pe PNG: tot originalul (302), nu o poza rupta", async () => {
  depozit = {};
  const r = await GET(cere(CHEIE_LOGO, { f: "png" }));
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), `${R2_PUBLIC}/${CHEIE_LOGO}`);
  assert.deepEqual(scrieri, []);
});

test("⚠ refuzurile raman in fata formatului: nici cheia straina, nici incarcarea cumparatorului", async () => {
  const incarcare = `${PREFIX_INCARCARI}11111111-1111-4111-8111-111111111111/poza.webp`;
  depozit[incarcare] = LOGO;

  const r1 = await GET(cere(incarcare, { f: "png" }));
  assert.equal(r1.status, 404, "fisierul unui cumparator s-a servit ca PNG");

  const r2 = await GET(cere("facturi/x/y.webp", { f: "png" }));
  assert.equal(r2.status, 404, "o cheie din afara prefixelor noastre a trecut");

  assert.deepEqual(citiri, [], `depozitul a fost atins: ${citiri.join(", ")}`);
  assert.deepEqual(scrieri, [], "s-a scris o varianta pentru o cheie refuzata");
});

/* ═══════════════════════════════════════════════════════════════════════════
   CUSATURA: adresa scrisa de email si ruta care o primeste
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ CUSATURA: adresa pe care o scrie emailul ajunge, prin ruta, la varianta PNG", async () => {
  /*
   * Emailul si ruta citesc aceleasi reguli (`LATIME_PNG`, `sursaCerePngInEmail`, `cheieOptimizabila`),
   * dar proba de fata nu se bizuie pe asta: ia adresa exact cum o scrie emailul si o da rutei.
   */
  const adresa = logoPentruEmail(`${R2_PUBLIC}/${CHEIE_LOGO}`);
  assert.ok(adresa && adresa.includes("f=png"), `emailul n-a cerut PNG: ${adresa}`);

  const r = await GET(new NextRequest(adresa));
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), `${R2_PUBLIC}/${VARIANTA_PNG}`, "adresa din email nu duce la PNG");
  assert.equal(scrieri[0]?.tip, "image/png");
});
