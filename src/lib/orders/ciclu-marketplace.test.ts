import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  marketplaceCareTineComanda,
  deCeNuDeAici,
  MARKETPLACE_CU_CICLU_PROPRIU,
  cineTineComanda,
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

test("⚠ Trendyol E in lista, si numai fiindca are iesire adevarata", () => {
  /*
   * ═══ ⚠ PROBA ASTA CEREA PANA AZI EXACT PE DOS ═══
   *
   * Scria: „a opri butonul si la Trendyol e o hotarare de produs, nu o reparatie". Argumentul
   * era bun cat timp singura cale de anulare era selectorul generic — luat, comerciantul ar fi
   * ramas cu o comanda pe care n-o poate nici onora, nici anula.
   *
   * ⚠ A INCETAT SA FIE BUN CAND A APARUT `nuPotFurniza`: anuleaza INTAI la ei, cu motiv din
   * lista lor, si abia daca ei au primit-o o inchide si la noi, cu stocul intors pe raft.
   *
   * ⚠ CE FACEA „ANULAT" DIN SELECTOR: elibera stocul la noi, iar la ei comanda ramanea activa
   * si pleca la client. Recitirea o aducea inapoi si revendica marfa — vanduta intre timp,
   * stocul intra pe minus.
   *
   * Ordinea a contat, si se scrie aici ca sa nu se repete pe dos: intai calea oficiala, pe
   * urma blocarea celei gresite.
   */
  assert.equal(marketplaceCareTineComanda({ marketplace: "trendyol" }), "trendyol");
  /* About You a ramas pe dinafara, si ASTA e acum alegerea nescrisa: n-are inca o cale proprie
     de anulare. Se adauga aici cand o capata. */
  assert.equal(marketplaceCareTineComanda({ marketplace: "aboutyou" }), null);
  assert.deepEqual([...MARKETPLACE_CU_CICLU_PROPRIU], ["emag", "trendyol"]);
});

test("⚠ blocarea vine cu inlocuitor: butonul de anulare exista in panou", () => {
  /* O blocare fara iesire ar fi lasat comenzi pe care omul nu le poate nici onora, nici
     anula. Proba leaga cele doua schimbari una de alta, ca sa nu poata fi despartite. */
  const panou = readFileSync("src/components/dashboard/TrendyolFulfillmentPanel.tsx", "utf8");
  assert.match(panou, /anuleazaComandaTrendyol\(businessId, orderId, Number\(motivAnulare\)\)/);
  assert.match(panou, /Nu pot furniza comanda asta/);
  /* ⚠ Si NU se arata dupa expediere: coletul e la curier, iar ei refuza anularea. */
  assert.match(panou, /\{!shipped && !terminal && \(/);
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
  /* ⚠ Forma s-a schimbat cand textul a inceput sa-si ia numele din comanda: ecranul tine acum
     si CINE o tine, nu doar daca o tine cineva. Regula se ia tot din acelasi loc. */
  assert.match(ui, /const cineTine = marketplaceCareTineComanda\(order\.order_source\);/);
  assert.match(ui, /const tinutaDeEi = cineTine != null;/);
  const fara = faraComentarii(ui);
  assert.match(fara, /disabled=\{tinutaDeEi\}/);
  /* ⚠ Butoanele raman VIZIBILE — omul trebuie sa vada in ce stare e comanda. */
  assert.match(fara, /STATUS_OPTIONS\.map/);
});

test("⚠ textul isi ia numele din comanda, nu il are scris de mana", () => {
  /*
   * ═══ ⚠ A TREIA OARA IN TREI ZILE (26.08.2026) ═══
   *
   * Panoul comenzii scria „Starea și plata acestei comenzi le ține eMAG" ORICARE ar fi fost
   * marketplace-ul, fiindca atunci eMAG era singurul din lista. In clipa in care a intrat si
   * Trendyol, o comanda Trendyol si-ar fi trimis comerciantul in contul eMAG sa caute o
   * comanda care acolo nu exista.
   *
   * ⚠ SI URMATOAREA MISCARE E ALTA LA FIECARE: la eMAG, AWB-ul si factura se fac tot la noi;
   * la Trendyol, expedierea o duce curierul lor, iar anularea are butonul ei. Un text comun ar
   * fi fost adevarat pe jumatate la fiecare.
   */
  assert.match(cineTineComanda("emag").titlu, /le ține eMAG/);
  assert.match(cineTineComanda("trendyol").titlu, /le ține Trendyol/);
  assert.doesNotMatch(cineTineComanda("trendyol").titlu, /eMAG/, "nu-l trimite in contul altcuiva");
  /* Urmatoarea miscare, pe fiecare: */
  assert.match(cineTineComanda("emag").urmator, /AWB-ul și factura se fac de aici/);
  assert.match(cineTineComanda("trendyol").urmator, /Expediere Trendyol/);
  assert.match(cineTineComanda("trendyol").urmator, /anulezi comanda/);

  /* ⚠ Si ecranul CHEAMA functia, nu isi scrie textul lui. */
  const ecran = readFileSync("src/components/dashboard/OrderDetailClient.tsx", "utf8");
  assert.match(ecran, /cineTineComanda\(cineTine!\)\.titlu/);
  assert.doesNotMatch(ecran, /le ține eMAG\. Se schimbă din contul eMAG/, "textul vechi a plecat");
});
