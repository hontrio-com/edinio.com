import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  etichetaLivrare, etichetaPlata, metodaPlata, modLivrareCunoscut, modPlataCunoscut,
  starePlata, statusInitial,
} from "./mapare";

test("⚠ rambursul Pepita se scrie `cash_on_delivery`, ca sa-l vada toate caile de ramburs", () => {
  /*
   * La eMAG si Trendyol banii ii incaseaza marketplace-ul. La Pepita cu `cod` ii incaseaza
   * CURIERUL comerciantului, deci comanda e, in toate privintele care conteaza, una cu plata
   * la livrare. `dhl.actions.ts` verifica textual `payment_method === "cash_on_delivery"`.
   */
  assert.equal(metodaPlata("cod"), "cash_on_delivery");
  assert.equal(metodaPlata("creditcard"), "pepita");
  assert.equal(metodaPlata("transfer"), "pepita");
  assert.equal(metodaPlata(null), "pepita");
  /* ⚠ Un mod necunoscut NU devine ramburs: curierul ar mai cere o data banii deja platiti. */
  assert.equal(metodaPlata("bitcoin"), "pepita");
});

test("starea de plata se citeste de la ei cand o trimit", () => {
  assert.equal(starePlata("paid", "creditcard"), "paid");
  assert.equal(starePlata("unpaid", "creditcard"), "unpaid");
  assert.equal(starePlata("unpaid", "cod"), "unpaid");
});

test("⚠ starea lipsa se deduce din modul de plata, cu documentatia lor drept martor", () => {
  /* „paid: this status is normally assigned to payment by credit card". */
  assert.equal(starePlata(null, "creditcard"), "paid");
  assert.equal(starePlata(null, "cod"), "unpaid");
  assert.equal(starePlata(null, "transfer"), "unpaid");
  assert.equal(starePlata("ceva-nou", "cod"), "unpaid");
  assert.equal(starePlata(null, null), "unpaid");
});

test("modurile documentate se recunosc, cele nedocumentate nu", () => {
  for (const m of ["cod", "transfer", "creditcard"]) assert.equal(modPlataCunoscut(m), true, m);
  for (const m of [null, "", "bitcoin", "toString", "constructor"]) {
    assert.equal(modPlataCunoscut(m), false, `${m}`);
  }
  for (const m of ["shipping", "gls", "gls_parcelshop", "mpl"]) assert.equal(modLivrareCunoscut(m), true, m);
  for (const m of [null, "fan_courier", "hasOwnProperty"]) assert.equal(modLivrareCunoscut(m), false, `${m}`);
});

test("⚠ necunoscutul se ARATA, nu se ascunde intr-o eticheta linistitoare", () => {
  assert.equal(etichetaPlata("cod"), "Ramburs la curier");
  assert.equal(etichetaPlata("bitcoin"), "Necunoscut (bitcoin)");
  assert.equal(etichetaPlata(null), "Nespecificat de Pepita");
  assert.equal(etichetaLivrare("gls_parcelshop"), "GLS ParcelShop");
  assert.equal(etichetaLivrare("easybox"), "Necunoscut (easybox)");
});

test("⚠ comanda se naste „în așteptare”, oricare ar fi statusul lor", () => {
  /*
   * Documentatia lor despre `status`: „By default, this is not forwarded, but we can forward
   * any status that triggers an event at the partner store, if required". Un camp negarantat,
   * cu valori care se convin de la caz la caz. Nu exista nicio lista de tradus.
   */
  assert.equal(statusInitial(), "pending");
});

/* ══════════════════════════════════════════════════════════════════════════
   CE SCRIEM IN `orders` TREBUIE SA INCAPA IN CE PRIMESTE BAZA
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Multimile se CITESC din baseline, nu se scriu de mana: mutate in baza, proba se muta
   cu ele. Aceeasi regula ca in `orders/valori-permise.test.ts`, si din acelasi motiv: o
   comanda respinsa de o constrangere nu apare NICAIERI in panou, deci nu se vede.
*/

const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");

function valoriPermise(coloana: string): Set<string> {
  const ancora = `alter table public.orders add constraint orders_${coloana}_check CHECK`;
  const i = baseline.indexOf(ancora);
  assert.ok(i > 0, `nu s-a gasit regula pentru orders.${coloana} in baseline`);
  const clauza = baseline.slice(i, baseline.indexOf("]", i));
  const valori = [...clauza.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(valori.length > 0, `regula pentru orders.${coloana} n-are nicio valoare`);
  return new Set(valori);
}

test("⚠ proba stie sa citeasca regulile din baseline", () => {
  /* Perechea obligatorie a oricarei probe care citeste: un zero fals arata ca un zero bun. */
  assert.deepEqual([...valoriPermise("payment_status")].sort(), ["paid", "refunded", "unpaid"]);
});

test("⚠ `starePlata` nu poate intoarce ceva ce baza respinge", () => {
  const permise = valoriPermise("payment_status");
  for (const s of [null, "paid", "unpaid", "pending", "", "ceva-nou", "PAID"]) {
    for (const m of [null, "cod", "creditcard", "transfer", "bitcoin"]) {
      const v = starePlata(s, m);
      assert.ok(permise.has(v), `starePlata(${s}, ${m}) = „${v}”, respins de orders_payment_status_check`);
    }
  }
});

test("⚠ `statusInitial` nu poate intoarce ceva ce baza respinge", () => {
  assert.ok(valoriPermise("status").has(statusInitial()));
});
