import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  marketplaceCareTineComanda,
  deCeNuDeAici,
  MARKETPLACE_CU_CICLU_PROPRIU,
} from "./origin";

/* ══════════════════════════════════════════════════════════════════════════
   CICLUL COMENZII LOR NU SE SCHIMBA DIN PANOUL NOSTRU (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Selectorul generic de status si cel de plata se randau si pe comenzile eMAG, iar
   `updateOrder` le ducea pana la baza fara sa se uite la origine. Trei pagube, toate tacute:

     - „Platit" pus de mana pe o comanda cu ramburs golea rambursul AWB-ului;
     - „Anulat" elibera stocul, iar recitirea revendica marfa inapoi — daca intre timp se
       vanduse, stocul intra pe minus si ramanea doar un rand in jurnal;
     - orice stare pusa de om era stearsa la prima recitire, dar carligele pornite intre
       timp (factura, instiintarea) RAMANEAU pornite.

   ⚠ Si nu exista drum inapoi: `salveazaComenzi` (POST /order/save) n-are niciun apelant.
*/

const fisier = (p: string) => readFileSync(p, "utf8");
const faraComentarii = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("eMAG isi tine comanda; magazinul propriu nu", () => {
  assert.equal(marketplaceCareTineComanda({ marketplace: "emag" }), "emag");
  assert.equal(marketplaceCareTineComanda({}), null);
  assert.equal(marketplaceCareTineComanda(null), null);
  assert.equal(marketplaceCareTineComanda(undefined), null);
});

test("⚠ Trendyol NU e in lista, si e o alegere, nu o scapare", () => {
  /*
   * Scaparea e aceeasi la toate trei: nici la Trendyol selectorul generic nu duce nimic
   * afara — iesirea de acolo merge prin actiuni PROPRII (`setPackageStatus`,
   * `sendTrackingNumber`). Dar a opri butonul si acolo e o hotarare de produs, nu o
   * reparatie: ar lua ceva ce comerciantii folosesc azi. Se adauga cand se hotaraste.
   *
   * Proba asta exista ca sa nu para o omisiune celui care citeste peste sase luni.
   */
  assert.equal(marketplaceCareTineComanda({ marketplace: "trendyol" }), null);
  assert.equal(marketplaceCareTineComanda({ marketplace: "aboutyou" }), null);
  assert.deepEqual([...MARKETPLACE_CU_CICLU_PROPRIU], ["emag"]);
});

test("⚠ mesajul spune UNDE se face, nu doar ca nu se poate", () => {
  /* Un „nu se poate" fara urmatoarea miscare l-a pus deja pe comerciant sa apese de 208
     ori un buton care n-avea cum sa mearga. */
  for (const ce of ["starea", "plata"] as const) {
    const m = deCeNuDeAici("emag", ce);
    assert.match(m, /în contul eMAG/, `„${ce}” nu spune unde`);
    assert.match(m, /citim de la ei/, "si de ce se intoarce singura");
  }
  const st = deCeNuDeAici("emag", "stergerea");
  assert.match(st, /la ei rămâne/);
  assert.match(st, /filtrele/, "se ofera ce se poate face in schimb");
});

test("numele marketplace-ului se ia din tabelul lui, nu se scrie de mana", () => {
  assert.match(deCeNuDeAici("emag", "starea"), /eMAG/);
  /* ⚠ O cheie necunoscuta nu strica mesajul: iese cheia, nu „undefined". */
  assert.match(deCeNuDeAici("ceva-nou", "starea"), /ceva-nou/);
});

/* ── Si chiar se foloseste, pe SERVER ─────────────────────────────────────── */

test("⚠ updateOrder refuza starea si plata, dar NU si AWB-ul singur", () => {
  /*
   * Nuanta care conteaza: `updateOrder` primeste si `awb`. O salvare care duce doar
   * numarul de AWB n-are de ce sa fie oprita — altfel comerciantul ar ramane fara nicio
   * cale de a-l scrie pe o comanda eMAG expediata cu curierul lui.
   */
  const cod = faraComentarii(fisier("src/lib/actions/order.actions.ts"));
  assert.match(cod, /const tineEl = marketplaceCareTineComanda\(order\.order_source\);/);
  assert.match(cod, /if \(data\.status !== order\.status\) return \{ error: deCeNuDeAici\(tineEl, "starea"\) \};/);
  assert.match(cod, /if \(data\.payment_status !== order\.payment_status\) return \{ error: deCeNuDeAici\(tineEl, "plata"\) \};/);
  /* ⚠ NU e un refuz pe toata functia. */
  assert.doesNotMatch(cod, /if \(tineEl\) return \{ error: deCeNuDeAici\(tineEl, "starea"\) \}/);
});

test("⚠ stergerea unei comenzi de marketplace se refuza de tot", () => {
  /*
   * Aici nu exista nuanta: la ei comanda ramane. Stearsa la noi, `emag_orders` ramane
   * orfana, stocul se intoarce pe raft desi marfa a plecat, factura nu se mai urca
   * niciodata, iar la o reintrare comanda poate primi A DOUA factura fiscala.
   */
  const cod = faraComentarii(fisier("src/lib/actions/order.actions.ts"));
  assert.match(cod, /if \(tineEl\) return \{ error: deCeNuDeAici\(tineEl, "stergerea"\) \};/);
  /* ⚠ Si `order_source` chiar se citeste, altfel paza s-ar uita la `undefined`. */
  assert.match(cod, /select\("business_id, discount_code, gls_awb_number, order_source"\)/);
});

test("⚠ lotul le SARE si spune cate", () => {
  /*
   * Nu se refuza tot lotul: selectia amestecata e cazul obisnuit. Dar un „20 comenzi →
   * Livrat" pentru 30 selectate, fara nicio vorba despre celelalte zece, e chiar felul de
   * tacere pe care il reparam peste tot.
   */
  const cod = faraComentarii(fisier("src/lib/actions/bulk-orders.actions.ts"));
  assert.match(cod, /marketplaceCareTineComanda\(o\.order_source\)/);
  assert.match(cod, /const ids = idsCerute\.filter\(\(id\) => !tinuteDeEi\.has\(id\)\);/);
  assert.match(cod, /sarite: tinuteDeEi\.size/);

  /* ⚠ Si citirea are `error`: fara ea, o cadere ar fi dat lista goala de origini, adica
     „nicio comanda de marketplace" — si lotul ar fi trecut peste toate. */
  assert.match(cod, /if \(eOrigini\) return \{ error:/);

  /* ⚠ Iar ecranul chiar o spune. */
  const ui = faraComentarii(fisier("src/components/dashboard/OrdersClient.tsx"));
  assert.match(ui, /res\.sarite/);
});

test("⚠ si selectoarele din pagina comenzii sunt inchise", () => {
  /* Serverul refuza oricum; asta e ca sa nu fie o cursa. Regula se ia din acelasi loc,
     nu se scrie a doua oara. */
  const ui = fisier("src/components/dashboard/OrderDetailClient.tsx");
  assert.match(ui, /marketplaceCareTineComanda\(order\.order_source\) != null/);
  const fara = faraComentarii(ui);
  assert.match(fara, /disabled=\{tinutaDeEi\}/);
  /* ⚠ Butoanele raman VIZIBILE — omul trebuie sa vada in ce stare e comanda. */
  assert.match(fara, /STATUS_OPTIONS\.map/);
});
