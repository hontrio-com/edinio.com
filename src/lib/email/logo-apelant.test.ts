import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

/**
 * PROBA PE APELANT: emailul trimis chiar de `email.ts` poarta PNG-ul logoului, cu marimea lui.
 *
 * Probele din `logo-email.test.ts` cheama invelisul direct. Un apelant care l-ar chema altfel, de
 * pilda cu `{ editable: true }`, le-ar lasa pe toate verzi, iar clientii ar primi tot WebP-ul pe
 * negru. Aici se trece prin `sendCustomerMessage`, cel mai scurt drum public care ajunge la
 * `sendStoreOrEdinio`, si se inlocuieste doar livrarea.
 *
 * ⚠ Cheia Resend e una de proba: livrarea e inlocuita, deci nimic nu pleaca nicaieri.
 *
 * ⚠ MEDIUL SI INLOCUIREA SE PUN INAINTEA IMPORTURILOR: `r2-url.ts` isi citeste domeniile la
 * incarcare, iar `email.ts` isi leaga livrarea tot atunci.
 */

const CDN = "https://edinio-cdn.com";
process.env.NEXT_PUBLIC_CDN_URL = CDN;
process.env.R2_PUBLIC_URL = "https://pub-alnostru.r2.dev";
process.env.RESEND_API_KEY = "re_proba_nu_trimite_nimic";

const HOOK = `data:text/javascript,${encodeURIComponent(
  `export async function resolve(specifier, context, next) {
     if (specifier === "@/lib/email/deliver") {
       return {
         url: "data:text/javascript," + encodeURIComponent(
           "export async function deliverStoreEmail(expeditor, mesaj) { globalThis.__livrate.push({ expeditor, mesaj }); }"
         ),
         shortCircuit: true, format: "module",
       };
     }
     return next(specifier, context);
   }`,
)}`;

type Livrat = { expeditor: unknown; mesaj: { to: string; subject: string; html: string } };
const livrate: Livrat[] = [];
(globalThis as unknown as { __livrate: Livrat[] }).__livrate = livrate;
register(HOOK);

const { sendCustomerMessage } = await import("@/lib/email");
const { buildStoreSender } = await import("@/lib/email/config");

const CHEIE = "logos/545924b8-70f7-4963-bd79-e44b89eca1c5/1785676092941-s8wln.webp";

test("⚠ emailul trimis de-adevaratelea poarta PNG-ul logoului, cu marimea pentru Outlook", async () => {
  const s = buildStoreSender({}, {
    store_name: "BricoSmart",
    business_name: "Bricosmart SRL",
    logo_url: `${CDN}/${CHEIE}`,
    primary_color: "#F28C28",
    slug: "bricosmart",
    custom_domain: "bricosmart.ro",
    email: null,
  });
  const expeditor = { ...s, branding: { ...s.branding, logoDimensiuni: { latime: 1600, inaltime: 289 } } };

  const r = await sendCustomerMessage(
    "client@gmail.com",
    { subject: "Comanda ta", message: "Multumim!", businessName: "BricoSmart", orderNumber: "#0002" },
    expeditor,
  );

  assert.deepEqual(r, { success: true });
  assert.equal(livrate.length, 1, "emailul n-a ajuns la livrare");

  const img = /<img [^>]*>/.exec(livrate[0].mesaj.html)?.[0] ?? "";
  const src = (/src="([^"]*)"/.exec(img)?.[1] ?? "").replace(/&amp;/g, "&");
  assert.ok(src, "emailul trimis n-are logo");
  const u = new URL(src);
  assert.equal(u.pathname, "/api/img", `emailul trimis poarta alt logo: ${src}`);
  assert.equal(u.searchParams.get("f"), "png", `emailul trimis nu cere PNG: ${src}`);
  assert.equal(u.searchParams.get("p"), CHEIE);
  assert.match(img, / width="266" height="48"/, "emailul trimis n-are marimea pentru Outlook");
});
