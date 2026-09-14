import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * ISTORICUL UNEI COMENZI SE CITESTE DOAR DE PROPRIETAR            (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `getShippingOptions` e publica si anonima dinadins. Dar o singura ramura din ea face altceva
 * decat restul: la `destination.comanda` citeste `orders.items` cu ROL DE SERVICIU, adica ocolind
 * RLS, pentru un id venit de la apelant. Filtrul pe `business_id` opreste traversarea intre
 * magazine, nu si citirea unei comenzi a aceluiasi magazin.
 *
 * ⚠ CE APARA PROBA ASTA, SI CE NU. Actiunea cere sesiune, baza si furnizori de curierat, deci nu
 * se poate rula aici. Se apara CUSATURA, si mai ales perechea care face poarta gratuita: apelantul
 * public nu trimite `comanda`, cel din panou il trimite.
 */

const sursa = (cale: string) =>
  readFileSync(cale, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const COTARE = "src/lib/actions/shipping.actions.ts";
const PUBLIC = "src/components/ministore/CourierSelector.tsx";
const PANOU = "src/components/dashboard/OrderEditModal.tsx";

test("⚠ dovada se cere cu clientul de SESIUNE, nu cu cel de serviciu", () => {
  /*
   * Cu `createAdminClient` interogarea ar raspunde „da" pentru oricine: service role ocoleste RLS.
   * Tocmai `user_id` e dovada.
   */
  const s = sursa(COTARE);
  const i = s.indexOf("async function esteProprietarulMagazinului(");
  assert.ok(i > 0, "ajutorul de proprietate a disparut din cotare");
  const corp = s.slice(i, s.indexOf("\n}", i));

  assert.match(corp, /await createClient\(\)/, "dovada nu mai vine din sesiune");
  assert.match(corp, /auth\.getUser\(\)/, "nu se mai cere omul");
  assert.match(corp, /\.eq\("id", businessId\)\.eq\("user_id", user\.id\)/,
    "nu se mai cere ca magazinul sa fie AL LUI");
  assert.doesNotMatch(corp, /createAdminClient/,
    "dovada se ia cu rol de serviciu, deci raspunde «da» pentru oricine");
});

test("⚠⚠ ramura `comanda` chiar e pazita de dovada", () => {
  /*
   * ⚠ ASTA E AFIRMATIA CARE CONTEAZA. Ajutorul poate exista si sa nu fie chemat: atunci totul de
   * mai sus ar fi verde si citirea ar ramane deschisa.
   */
  const s = sursa(COTARE);
  assert.match(s, /const potCitiComanda = destination\.comanda \? await esteProprietarulMagazinului\(businessId\) : false;/,
    "dovada nu se mai cere inaintea ramurii");
  assert.match(s, /if \(destination\.comanda && potCitiComanda\) \{/,
    "citirea comenzii nu mai depinde de dovada");
  assert.doesNotMatch(s, /\n  if \(destination\.comanda\) \{\n    const \{ data: veche \}/,
    "s-a intors ramura care citea comanda fara nicio dovada");
});

test("⚠⚠ refuzul NU intoarce lista goala, si nu tace", () => {
  /*
   * ⚠ CAPCANA SCRISA DE DOUA ORI IN CHIAR FISIERUL ACELA: selectorul isi ascunde sectiunea cand
   * lista e goala, deci un `return []` aici ar lasa cumparatorul fara nicio metoda de livrare si
   * fara niciun mesaj. Se sare doar peste istoric, exact ca atunci cand `comanda` nu e trimis.
   */
  const s = sursa(COTARE);
  const i = s.indexOf("if (destination.comanda && !potCitiComanda) {");
  assert.ok(i > 0, "ramura de refuz a disparut");
  const ram = s.slice(i, s.indexOf("\n  }", i));

  assert.doesNotMatch(ram, /return \[\]/,
    "refuzul opreste cotarea: cumparatorul ramane fara nicio optiune de livrare");
  assert.match(ram, /logError\(/, "refuzul nu lasa nicio urma in jurnal");
  assert.match(ram, /getShippingOptions\.comandaFaraDrept/, "urma din jurnal nu are nume propriu");
});

test("⚠⚠ apelantul PUBLIC nu trimite `comanda`, si de asta poarta e gratuita", () => {
  /*
   * Perechea de mai jos e chiar temeiul reparatiei. `CourierSelector` e randat de amandoua
   * checkouturile; daca el ar incepe sa trimita `comanda`, poarta ar taia tacut preturile istorice
   * ale unui cumparator cinstit, iar un fototapet de 910 lei ar cadea inapoi pe 89.
   */
  const s = sursa(PUBLIC);
  const i = s.indexOf("getShippingOptions(businessId, {");
  assert.ok(i > 0, "nu mai gasesc chemarea din selectorul public");
  const apel = s.slice(i, s.indexOf(")", i));
  assert.doesNotMatch(apel, /comanda/,
    "selectorul public a inceput sa trimita `comanda`: poarta ii taie istoricul fara sa-i spuna");
});

test("⚠ si apelantul din PANOU chiar il trimite, altfel poarta n-ar pazi nimic", () => {
  /*
   * Cealalta jumatate: daca panoul nu l-ar mai trimite, ramura pazita n-ar mai fi atinsa de nimeni
   * si proba de mai sus ar ramane verde peste o poarta care nu apara nimic.
   */
  const s = sursa(PANOU);
  const i = s.indexOf("getShippingOptions(businessId, {");
  assert.ok(i > 0, "nu mai gasesc chemarea din panou");
  assert.match(s.slice(i, i + 900), /comanda: order\.id,/,
    "panoul nu mai trimite comanda, deci ramura pazita nu mai e folosita de nimeni");
});
