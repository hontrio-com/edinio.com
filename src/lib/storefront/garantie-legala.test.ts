import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { NOTIFICARE_GARANTIE } from "./garantie-legala";

/*
 * Notificarea armonizata privind garantia legala (obligatorie din 27.09.2026, OUG 18/2026).
 * Doua lucruri se pot strica fara sa se vada: fisierul (inlocuit, recomprimat, „optimizat")
 * si locurile in care apare (o macheta noua de produs sau de checkout, scrisa fara ea).
 */

test("imaginea e fisierul oficial al Comisiei, neschimbat", () => {
  const octeti = readFileSync(`public${NOTIFICARE_GARANTIE.src}`);
  const amprenta = createHash("sha256").update(octeti).digest("hex");
  assert.equal(
    amprenta,
    "51d641e25d29a9cd4d087a6540d474ade46fd52b2e38f1ac65befb1108caa032",
    "fisierul nu mai e `Legal guarantee_notice_RO.png` din pachetul oficial: ghidul interzice orice modificare sau conversie",
  );
});

test("linkul duce unde duce si codul QR din notificare", () => {
  assert.equal(decodeURIComponent(NOTIFICARE_GARANTIE.url), "https://europa.eu/youreurope/garanții");
});

for (const [unde, fisier] of [
  ["subsolul tuturor magazinelor", "src/components/storefront/sections/_shared/FooterLegal.tsx"],
  ["pagina de produs, modelul clasic", "src/components/storefront/sections/product/ProductPageClassic.tsx"],
  ["pagina de produs, modelul detaliat", "src/components/storefront/sections/product/ProductPageDetailed.tsx"],
  ["checkoutul (ambele modele)", "src/components/storefront/sections/checkout/CheckoutForm.tsx"],
  ["comanda rapida din fereastra", "src/components/ministore/OrderModal.tsx"],
] as const) {
  test(`notificarea apare in ${unde}`, () => {
    assert.match(readFileSync(fisier, "utf8"), /<ButonGarantieLegala\b/, `${fisier} nu mai arata notificarea`);
  });
}

test("emailul de confirmare a comenzii poarta notificarea", () => {
  const cod = readFileSync("src/lib/email.ts", "utf8");
  const i = cod.indexOf("export async function sendOrderConfirmationToCustomer(");
  const j = cod.indexOf("\nexport ", i + 10);
  assert.ok(i > 0 && j > i);
  assert.match(cod.slice(i, j), /\$\{blocGarantieLegala\(\)\}/, "confirmarea de comanda a pierdut notificarea");
});
