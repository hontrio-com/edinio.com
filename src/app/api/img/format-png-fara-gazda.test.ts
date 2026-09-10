import assert from "node:assert/strict";
import { test, before, beforeEach } from "node:test";
import { register } from "node:module";
import sharp from "sharp";
import { NextRequest } from "next/server";

/**
 * Al TREILEA drum de raspuns al lui `/api/img`: fara nicio gazda publica (niciun CDN, niciun
 * `R2_PUBLIC_URL`), ruta serveste chiar octetii variantei.
 *
 * Pe productie drumul nu se umbla, fiindca CDN-ul e setat. Dar tipul de continut de pe el s-a
 * schimbat odata cu PNG-ul, iar un `image/webp` scris la loc de mana trebuie sa poata pica o proba.
 *
 * ⚠ FISIER SEPARAT: ruta citeste `R2_PUBLIC_URL` la incarcare, deci el trebuie sa fie gol INAINTEA
 * importului, intr-un proces al lui.
 */

const CHEIE = "logos/545924b8-70f7-4963-bd79-e44b89eca1c5/logo.webp";

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
           "export const consumaLimita = async () => ({ permis: true, blocatPana: null }); export const reseteazaLimita = async () => {}; export const mesajLimita = () => '';"
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
};

let depozit: Record<string, Buffer> = {};
let GET: (req: NextRequest) => Promise<Response>;
let LOGO: Buffer;

before(async () => {
  process.env.R2_PUBLIC_URL = "";
  delete process.env.NEXT_PUBLIC_CDN_URL;
  register(HOOK);
  const g = globalThis as Global;
  g.__r2Citeste = async (k) => depozit[k] ?? null;
  g.__r2Scrie = async (b, k) => {
    depozit[k] = b;
    return k;
  };
  g.__r2Exista = async (k) => depozit[k] !== undefined;

  LOGO = await sharp({ create: { width: 40, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .webp({ lossless: true })
    .toBuffer();

  ({ GET } = (await import("./route")) as unknown as { GET: typeof GET });
});

beforeEach(() => {
  depozit = { [CHEIE]: LOGO };
});

function cere(extra: Record<string, string> = {}) {
  const u = new URL("https://www.edinio.com/api/img");
  u.searchParams.set("p", CHEIE);
  u.searchParams.set("w", "640");
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return new NextRequest(u.toString());
}

test("⚠ fara gazda publica, PNG-ul pleaca prin noi cu tipul PNG", async () => {
  const r = await GET(cere({ f: "png" }));

  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png", "PNG-ul a plecat declarat altfel");
  const octeti = Buffer.from(await r.arrayBuffer());
  assert.equal((await sharp(octeti).metadata()).format, "png");
  assert.match(String(r.headers.get("cache-control")), /immutable/);
});

test("POZITIV: fara `f`, tot WebP, cu tipul WebP", async () => {
  const r = await GET(cere());

  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/webp");
  assert.equal((await sharp(Buffer.from(await r.arrayBuffer())).metadata()).format, "webp");
});
