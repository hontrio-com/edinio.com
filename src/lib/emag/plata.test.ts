import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { platitLaEi, stareaPlatiiPentruRamburs } from "./plata";
import { rambursDeIncasat } from "@/lib/orders/ramburs";

/* ══════════════════════════════════════════════════════════════════════════
   RAMBURSUL SE SOCOTESTE DIN CUVANTUL LOR (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE SE PUTEA INTAMPLA. O comanda eMAG cu plata la livrare, marcata de mana „Platit"
   din selectorul generic al Edinio, trimitea AWB cu `cod: 0`. Curierul livra si nu incasa
   nimic. Aceeasi familie cu comanda #0033 de la Suporti-Numar.ro — 105,50 lei plecati pe
   15.07.2026 — pentru care s-a scris chiar `rambursDeIncasat`.

   ⚠ SI DE CE N-AR FI FOST PRINSA. Regula casei spune anume ca „suma ramane EDITABILA in
   fiecare formular", si pe aia se bizuie. Dar pe calea eMAG suma e TEXT, nu camp — AWB-ul
   se emite prin ei. Deci singura plasa lipsea exact unde greseala costa bani. Iar urma se
   stergea singura: reconcilierea readuce `payment_status` la ce spun ei, deci randul se
   repara dupa ce coletul a plecat, si a doua zi nu se mai vede nimic.

   ⚠ MASURAT INAINTE DE REPARATIE: `raw` poarta `payment_status` pe 2 din 2 comenzi din
   productie, deci reparatia sta pe un camp adevarat. Si niciuna nu era cu ramburs
   (`payment_mode_id = 1` → zero), deci capcana n-a apucat sa muste.
*/

test("1 la ei inseamna platita; orice altceva inseamna de incasat", () => {
  assert.equal(platitLaEi(1), "paid");
  assert.equal(platitLaEi(0), "unpaid");
  assert.equal(platitLaEi(2), "unpaid");
});

test("⚠ campul lipsa inseamna DE INCASAT, nu platita", () => {
  /*
   * Sensul greselii e ales dinadins. O incasare in plus pe o comanda deja platita se vede
   * la usa si se repara pe loc; una lipsa se vede abia la socoteala de la sfarsitul lunii.
   */
  assert.equal(platitLaEi(undefined), "unpaid");
  assert.equal(platitLaEi(null), "unpaid");
  assert.equal(platitLaEi("1"), "unpaid", "sirul nu e numarul lor");
});

test("⚠ cuvantul LOR bate ce scrie la noi", () => {
  /* Miezul reparatiei. Omul a pus „platit" in Edinio; eMAG spune ca banii n-au intrat. */
  assert.equal(
    stareaPlatiiPentruRamburs({ payment_status: 0 }, { payment_status: "paid" }),
    "unpaid",
    "un „platit” pus de mana nu poate goli rambursul",
  );
  /* Si invers: ei au incasat, noi n-am aflat inca. Nu se cere de doua ori. */
  assert.equal(
    stareaPlatiiPentruRamburs({ payment_status: 1 }, { payment_status: "unpaid" }),
    "paid",
  );
});

test("fara raspunsul lor se cade inapoi pe ce stim noi", () => {
  /* ⚠ Singurul caz in care valoarea editabila mai conteaza — si se intampla numai daca
     `raw` e gol, iar `raw` se scrie la fiecare citire a comenzii. */
  assert.equal(stareaPlatiiPentruRamburs(null, { payment_status: "paid" }), "paid");
  assert.equal(stareaPlatiiPentruRamburs({}, { payment_status: "unpaid" }), "unpaid");
  assert.equal(stareaPlatiiPentruRamburs(undefined, undefined), null);
});

test("⚠ drumul intreg: comanda cu ramburs marcata „platit” tot se incaseaza", () => {
  /*
   * Proba care conteaza cel mai mult din fisier. Se leaga cele doua functii exact cum se
   * leaga in `emiteAwbEmag`.
   */
  const ramburs = rambursDeIncasat({
    payment_status: stareaPlatiiPentruRamburs(
      { payment_status: 0 },                 // ei: banii n-au intrat
      { payment_status: "paid" },            // noi: cineva a pus „platit”
    ),
    total: 105.5,                            // chiar suma comenzii #0033
  });
  assert.equal(ramburs, 105.5, "curierul are de incasat");
});

test("si o comanda chiar platita la ei ramane cu zero", () => {
  /* Perechea. Fara ea, „repara” ar putea insemna „cere banii de doua ori”. */
  const ramburs = rambursDeIncasat({
    payment_status: stareaPlatiiPentruRamburs({ payment_status: 1 }, { payment_status: "unpaid" }),
    total: 105.5,
  });
  assert.equal(ramburs, 0);
});

/* ── Si chiar se foloseste, in amandoua locurile ──────────────────────────── */

test("⚠ emiterea SI pregatirea folosesc aceeasi socoteala", () => {
  /*
   * ⚠ Trebuie sa fie amandoua. Ecranul arata suma NEEDITABIL, deci daca cele doua socoteli
   * s-ar departa, omul ar vedea o cifra si ar pleca alta — iar el n-are cum sa observe.
   */
  const cod = readFileSync("src/lib/actions/emag.actions.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const cate = (cod.match(/stareaPlatiiPentruRamburs\(/g) ?? []).length;
  assert.equal(cate, 2, `asteptam 2 folosiri (emitere + pregatire), sunt ${cate}`);

  /* ⚠ Si nu mai citeste nimeni starea de plata DIRECT din comanda noastra pentru ramburs. */
  assert.doesNotMatch(
    cod, /rambursDeIncasat\(\s*\(comand/,
    "forma veche, care lua starea din randul editabil",
  );
});

test("regula lor e scrisa o singura data in tot depozitul", () => {
  /* ⚠ Era scrisa de doua ori in `orders.ts`. A treia oara ar fi fost in AWB — si acolo
     s-ar fi despartit, ca de fiecare data. */
  const orders = readFileSync("src/lib/emag/orders.ts", "utf8");
  assert.doesNotMatch(orders, /payment_status === 1 \? "paid" : "(pending|unpaid)"/);
  assert.match(orders, /platitLaEi\(c\.payment_status\)/);
});

test("⚠ VALOAREA TREBUIE SA FIE UNA PE CARE BAZA O PRIMESTE", () => {
  /*
   * ═══ COMANDA NU INTRA DELOC, SI PROBA DE DEASUPRA ERA VERDE (25.08.2026) ═══
   *
   * `orders.payment_status` are `check (payment_status in ('unpaid','paid','refunded'))`.
   * „pending" n-a fost niciodata printre ele. Deci fiecare comanda eMAG cu ramburs — adica
   * majoritatea — pica la inserare cu `23514`, iar ingestul o pierde INTREAGA. Nu o stare
   * gresita pe o comanda: o comanda pe care comerciantul n-o vede nicaieri.
   *
   * Prinsa pe comanda 501350435 de monitorul care se uita la erorile critice. Cele doua
   * comenzi eMAG din sistem trecusera fiindca erau platite cu cardul, deci ieseau „paid" —
   * si totul arata sanatos.
   *
   * ⚠ IAR PROBELE DE MAI SUS CEREAU ANUME „pending". Verzi, peste un defect care oprea
   * comenzi. De-aia proba asta nu intreaba ce intoarce functia, ci daca raspunsul ei incape
   * in ce primeste baza — singura intrebare pe care o proba scrisa dupa cod n-o pune singura.
   */
  const INGADUITE = new Set(["unpaid", "paid", "refunded"]);
  for (const intrare of [1, 0, 2, -1, undefined, null, "1", "paid", {}, []]) {
    assert.ok(
      INGADUITE.has(platitLaEi(intrare)),
      `platitLaEi(${JSON.stringify(intrare)}) = „${platitLaEi(intrare)}" — respinsa de orders_payment_status_check`,
    );
  }
});

test("⚠ si rambursul se poarta la fel ca inainte", () => {
  /* Schimbarea n-are voie sa mute banii. `rambursDeIncasat` nu incaseaza doar la
     `paid`/`refunded`, iar „unpaid" e in afara acelei multimi exact ca „pending". */
  assert.equal(rambursDeIncasat({ payment_status: platitLaEi(0), total: 105.5 }), 105.5);
  assert.equal(rambursDeIncasat({ payment_status: platitLaEi(1), total: 105.5 }), 0);
});
