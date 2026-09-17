import assert from "node:assert/strict";
import { test, before, beforeEach } from "node:test";
import { register } from "node:module";
import sharp from "sharp";
import { NextRequest } from "next/server";

/**
 * `/api/img?…&f=jpg`: VARIANTA JPEG, PENTRU FEEDUL FACEBOOK CATALOG.
 *
 * ═══ ⚠ CE APARA (17.09.2026) ═══
 *
 * Specificatia catalogului Meta: „Images must be in JPEG or PNG format, at least 500 x 500 pixels”. Feedul
 * trimitea WebP-ul din depozit (1010 produse la esafe, toate cele 14 la yvelle). Acum trimite `f=jpg`.
 *
 * ⚠ SHARP E CEL ADEVARAT, ca in `format-png.test.ts`: doar decodorul adevarat spune daca a iesit JPEG si ce
 * s-a intamplat cu transparenta. Se inlocuiesc doar depozitul si contorul durabil.
 *
 * ⚠ SI PERECHILE: `f=jpg` pe o sursa JPG sau PNG cade pe WebP (lista alba), iar vitrina fara `f` ramane WebP.
 */

const R2_PUBLIC = "https://pub-exemplu.r2.dev";
const ID = "545924b8-70f7-4963-bd79-e44b89eca1c5";
const CHEIE_WEBP = `products/${ID}/tricou.webp`;
const CHEIE_MARE = `products/${ID}/tricou-mare.webp`;
const CHEIE_JPG = `products/${ID}/poza.jpg`;
const VARIANTA_JPG = `_optim/w1024q85/${CHEIE_WEBP}.jpg`;
const SEMNATURA_JPEG = Buffer.from([0xff, 0xd8, 0xff]);

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
let scrieri: { cheie: string; tip: string; octeti: Buffer }[] = [];
let apeluriLimita: unknown[][] = [];
let GET: (req: NextRequest) => Promise<Response>;
let imagineCatalog: (adresa: string) => string;
let WEBP: Buffer;
let WEBP_MARE: Buffer;
let JPG: Buffer;

before(async () => {
  process.env.R2_PUBLIC_URL = R2_PUBLIC;
  delete process.env.NEXT_PUBLIC_CDN_URL;
  register(HOOK);
  const g = globalThis as Global;
  g.__r2Citeste = async (k) => depozit[k] ?? null;
  g.__r2Scrie = async (b, k, t) => { scrieri.push({ cheie: k, tip: t, octeti: b }); depozit[k] = b; return `${R2_PUBLIC}/${k}`; };
  g.__r2Exista = async (k) => depozit[k] !== undefined;
  g.__limita = async (...a) => { apeluriLimita.push(a); return { permis: true, blocatPana: null }; };

  /* Jumatatea stanga TRANSPARENTA (sub ea, negru stocat), dreapta rosie opaca. */
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  const rosu = { r: 200, g: 30, b: 40, alpha: 1 };
  WEBP = await sharp({ create: { width: 600, height: 600, channels: 4, background: transparent } })
    .composite([{ input: { create: { width: 300, height: 600, channels: 4, background: rosu } }, left: 300, top: 0 }])
    .webp({ lossless: true }).toBuffer();
  WEBP_MARE = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: { r: 10, g: 120, b: 60 } } }).webp().toBuffer();
  JPG = await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();

  ({ GET } = (await import("./route")) as unknown as { GET: typeof GET });
  ({ imagineCatalog } = await import("@/lib/facebook/catalog-feed"));
});

beforeEach(() => {
  depozit = { [CHEIE_WEBP]: WEBP, [CHEIE_MARE]: WEBP_MARE, [CHEIE_JPG]: JPG };
  scrieri = [];
  apeluriLimita = [];
});

function cere(p: string, extra: Record<string, string> = {}) {
  const u = new URL("https://www.edinio.com/api/img");
  u.searchParams.set("p", p);
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return new NextRequest(u.toString());
}

async function pixel(octeti: Buffer, x: number, y: number) {
  const { data, info } = await sharp(octeti).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

test("⚠ `f=jpg` pe WebP: varianta e JPEG, transparenta pe ALB (nu negru), si ruta trimite la ea", async () => {
  const r = await GET(cere(CHEIE_WEBP, { w: "1024", f: "jpg" }));

  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), `${R2_PUBLIC}/${VARIANTA_JPG}`);
  assert.equal(scrieri.length, 1);
  assert.equal(scrieri[0].tip, "image/jpeg");
  assert.deepEqual(scrieri[0].octeti.subarray(0, 3), SEMNATURA_JPEG, "octetii scrisi nu sunt JPEG");
  const m = await sharp(scrieri[0].octeti).metadata();
  assert.equal(m.format, "jpeg");
  assert.equal(m.width, 600, "poza mai mica decat treapta a fost marita");
  const stanga = await pixel(scrieri[0].octeti, 50, 300);
  assert.ok(stanga.r > 245 && stanga.g > 245 && stanga.b > 245, `partea transparenta a iesit ${JSON.stringify(stanga)}, nu alba`);
  const dreapta = await pixel(scrieri[0].octeti, 500, 300);
  assert.ok(Math.abs(dreapta.r - 200) < 12 && dreapta.g < 50, "partea opaca si-a schimbat culoarea");
});

test("la JPEG latimea e FIXA (1024): orice `w` da acelasi, singur, JPEG", async () => {
  const varianta = `_optim/w1024q85/${CHEIE_MARE}.jpg`;
  const a = await GET(cere(CHEIE_MARE, { w: "2048", f: "jpg", q: "50" }));
  const b = await GET(cere(CHEIE_MARE, { w: "16", f: "jpg" }));
  assert.equal(a.headers.get("location"), `${R2_PUBLIC}/${varianta}`);
  assert.equal(b.headers.get("location"), `${R2_PUBLIC}/${varianta}`);
  assert.equal(scrieri.length, 1, "s-a nascut al doilea JPEG pentru aceeasi poza");
  const m = await sharp(scrieri[0].octeti).metadata();
  assert.equal(m.width, 1024);
  assert.ok((m.height ?? 0) >= 500, "JPEG-ul a iesit sub pragul Meta de 500 de pixeli");
});

test("un JPEG cantareste dublu in plafonul de variante (un WebP, simplu)", async () => {
  await GET(cere(CHEIE_WEBP, { w: "1024", f: "jpg" }));
  await GET(cere(CHEIE_MARE, { w: "640" }));
  assert.deepEqual(apeluriLimita.map((a) => a[4]), [2, 1]);
});

test("POZITIV: `f=jpg` pe o sursa JPG cade pe WebP, iar vitrina fara `f` ramane WebP", async () => {
  const r = await GET(cere(CHEIE_JPG, { w: "640", f: "jpg" }));
  assert.equal(r.headers.get("location"), `${R2_PUBLIC}/_optim/w640q75/${CHEIE_JPG}.webp`);
  assert.equal(scrieri[0]?.tip, "image/webp");
  const v = await GET(cere(CHEIE_WEBP, { w: "640" }));
  assert.equal(v.headers.get("location"), `${R2_PUBLIC}/_optim/w640q75/${CHEIE_WEBP}.webp`);
});

test("feedul trimite WebP-ul din depozit prin JPEG, iar JPG-ul si adresele straine neatinse", () => {
  assert.equal(
    imagineCatalog(`${R2_PUBLIC}/${CHEIE_WEBP}`),
    `https://www.edinio.com/api/img?p=${encodeURIComponent(CHEIE_WEBP)}&w=1024&f=jpg`,
  );
  assert.equal(imagineCatalog(`${R2_PUBLIC}/${CHEIE_JPG}`), `${R2_PUBLIC}/${CHEIE_JPG}`);
  assert.equal(imagineCatalog("https://alt-site.ro/poza.webp"), "https://alt-site.ro/poza.webp");
});
