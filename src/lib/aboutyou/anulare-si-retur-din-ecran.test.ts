import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   ANULAREA SI RETURUL EXISTAU SI NU LE CHEMA NIMENI (27.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   `cancelOrderNow` si `returnOrderNow` erau scrise de mult, cu garzile lor pe stari, si nu aveau
   NICIUN punct de chemare in tot depozitul. Comerciantul trebuia sa intre in Seller Center ca sa
   anuleze sau sa marcheze un retur, iar la noi comanda ramanea cum era - deci cele doua liste se
   despartaeu tacut, si nimic nu spunea asta.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const actiuni = viu("src/lib/actions/aboutyou.actions.ts");
const ecran = readFileSync("src/components/dashboard/AboutYouOrders.tsx", "utf8");

test("⚠ cele doua functii au in sfarsit un punct de chemare", () => {
  assert.match(actiuni, /export async function anuleazaComandaAboutYou\(/);
  assert.match(actiuni, /export async function returneazaComandaAboutYou\(/);
  assert.match(actiuni, /await cancelOrderNow\(admin, ctx, orderId\)/);
  assert.match(actiuni, /await returnOrderNow\(admin, ctx, orderId, awbRetur\)/);
  /* Si ecranul le cheama chiar pe ele. */
  assert.match(ecran, /await anuleazaComandaAboutYou\(businessId, orderId\)/);
  assert.match(ecran, /await returneazaComandaAboutYou\(businessId, orderId, awb\)/);
});

test("⚠ butoanele se arata din LINII, nu din statusul comenzii", () => {
  /*
   * La ei starea sta pe LINIE, iar comanda cu linii in stari diferite e „mixed". Un buton legat de
   * statusul comenzii ar fi fost si ascuns cand trebuia, si aratat cand nu trebuia. Regula lor:
   * anularea numai pe `open`, returul numai pe `shipped`.
   */
  assert.match(actiuni, /sePoateAnula: !aleLor && linii\.some\(\(l\) => l\.status === "open"\)/);
  assert.match(actiuni, /sePoateReturna: !aleLor && linii\.some\(\(l\) => l\.status === "shipped"\)/);
  /* Si `items` chiar se cere in `select`: fara el, `linii` ar fi mereu gol si butoanele n-ar apărea. */
  assert.match(actiuni, /select\("order_id, aboutyou_order_number, status, shop_country, fulfillment_type, items,/);
});

test("⚠ comenzile onorate de ei nu primesc butoanele", () => {
  /* Pe modelul lor de fulfillment marfa nici nu e la comerciant: n-are ce anula si ce returna. */
  assert.match(actiuni, /const aleLor = r\.fulfillment_type === "fulfillment_by_marketplace";/);
});

test("⚠ AWB-ul de retur se verifica pe SERVER, nu doar in ecran", () => {
  /*
   * O actiune de server e o ruta, si oricine o poate chema. Verificarea din ecran e comoditate;
   * cea de aici e regula.
   */
  assert.match(actiuni, /if \(!awbRetur\.trim\(\)\) return \{ error: "Completează numărul AWB de retur\." \}/);
  /* Si ecranul nu lasa butonul apasabil pe gol, ca sa nu ceara degeaba. */
  assert.match(ecran, /disabled=\{pending \|\| !awb\.trim\(\)\}/);
});

test("⚠ amandoua cer o confirmare, cu ce se intampla scris pe fata", () => {
  /* Sunt cereri catre About You care nu se pot lua inapoi. */
  assert.match(ecran, /Cererea nu poate fi anulată după ce pleacă\./);
  assert.match(ecran, /doar liniile care nu au plecat încă/);
  assert.match(ecran, /doar liniile expediate/);
  /* ⚠ Si textul spune adevarul despre stoc: returul NU repune marfa singur. */
  assert.match(ecran, /Marfa NU se pune\s+singură înapoi în stoc/);
});
