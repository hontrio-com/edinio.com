import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import sharp from "sharp";

/**
 * CABLAREA: expeditorul adevarat (`getStoreEmailSender`) afla marimea logoului si o pune pe marca.
 *
 * `atributeLogo` si `dimensiuniLogo` au probele lor, iar invelisul pe a lui. Dar un expeditor care
 * nu le mai leaga ar lasa toate acele probe verzi, iar Outlook ar primi iar PNG-ul de 640px intreg.
 *
 * Se inlocuiesc doar clientul de baza (primit ca argument) si `fetch`-ul global. Clientul de admin
 * n-are ce cauta pe drumul de aici, deci e inlocuit cu unul care arunca.
 *
 * ⚠ MEDIUL SI INLOCUIREA SE PUN INAINTEA IMPORTURILOR: `r2-url.ts` isi citeste domeniile la
 * incarcare.
 */

process.env.NEXT_PUBLIC_CDN_URL = "https://edinio-cdn.com";
process.env.R2_PUBLIC_URL = "https://pub-alnostru.r2.dev";

const HOOK = `data:text/javascript,${encodeURIComponent(
  `export async function resolve(specifier, context, next) {
     if (specifier === "@/lib/supabase/admin") {
       return {
         url: "data:text/javascript," + encodeURIComponent(
           "export function createAdminClient() { throw new Error('clientul de admin n-are ce cauta pe drumul asta'); }"
         ),
         shortCircuit: true, format: "module",
       };
     }
     return next(specifier, context);
   }`,
)}`;
register(HOOK);

const { getStoreEmailSender } = await import("./sender");

const LOGO = "https://edinio-cdn.com/logos/545924b8-70f7-4963-bd79-e44b89eca1c5/1785676092941-s8wln.webp";

/** Clientul de baza, cat cere `getStoreEmailSender`: un rand de magazin, fara setari vizibile. */
function baza(logo_url: string | null) {
  const rand = {
    store_name: "BricoSmart",
    business_name: "Bricosmart SRL",
    logo_url,
    primary_color: "#F28C28",
    slug: "bricosmart",
    custom_domain: "bricosmart.ro",
    email: null,
    store_settings: null,
  };
  const lant = { select: () => lant, eq: () => lant, single: async () => ({ data: rand, error: null }) };
  return { from: () => lant } as unknown as Parameters<typeof getStoreEmailSender>[0];
}

test("⚠ expeditorul pune pe marca marimea logoului pe care emailul il trimite prin PNG", async (t) => {
  const octeti = new Uint8Array(
    await sharp({ create: { width: 1600, height: 289, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .webp({ quality: 80 })
      .toBuffer(),
  );
  const cereri: string[] = [];
  t.mock.method(globalThis, "fetch", async (adresa: string | URL | Request) => {
    cereri.push(String(adresa));
    return new Response(octeti, { status: 206 });
  });

  const s = await getStoreEmailSender(baza(LOGO), "545924b8-70f7-4963-bd79-e44b89eca1c5");

  assert.deepEqual(s?.branding.logoDimensiuni, { latime: 1600, inaltime: 289 }, "marimea n-a ajuns pe marca");
  assert.deepEqual(cereri, [LOGO]);
});

test("un logo care nu pleaca prin PNG nu se cere si nu primeste marime", async (t) => {
  const cereri: string[] = [];
  t.mock.method(globalThis, "fetch", async (adresa: string | URL | Request) => {
    cereri.push(String(adresa));
    return new Response("x");
  });

  const s = await getStoreEmailSender(
    baza("https://edinio-cdn.com/logos/545924b8-70f7-4963-bd79-e44b89eca1c5/logo.png"),
    "545924b8-70f7-4963-bd79-e44b89eca1c5",
  );

  assert.equal(s?.branding.logoDimensiuni, undefined);
  assert.deepEqual(cereri, []);
});
