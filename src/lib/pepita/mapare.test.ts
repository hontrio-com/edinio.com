import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  esteLivrarePepita, etichetaLivrare, etichetaPlata, incaseazaPepita, metodaPlata,
  modLivrareCunoscut, modPlataCunoscut, starePlata, statusInitial,
} from "./mapare";

test("⚠ `cash_on_delivery` NUMAI cand incaseaza curierul comerciantului", () => {
  /*
   * ⚠ DEFECTUL PE CARE IL APARA, gasit la auditul din 08.09.2026: pana atunci ORICE `cod`
   * primea `cash_on_delivery`, indiferent de livrare. Pentru o comanda Pepita Delivery,
   * clientul ar fi platit o data curierului Pepita si inca o data curierului comerciantului.
   *
   * Seller Center, pagina romaneasca: „In cazul comenzilor Pepita Delivery (momentan automat
   * de colet GLS sau livrare GLS la adresa), suma ramburs ajunge la Pepita."
   */
  assert.equal(metodaPlata("cod", "shipping"), "cash_on_delivery", "curierul lui incaseaza");
  assert.equal(metodaPlata("cod", "mpl"), "cash_on_delivery", "MPL: contract direct cu el");
  assert.equal(metodaPlata("cod", null), "cash_on_delivery", "livrare nespecificata: cade pe curierul lui");
  assert.equal(metodaPlata("cod", "gls"), "pepita", "⚠ Pepita Delivery: NU e rambursul lui");
  assert.equal(metodaPlata("cod", "gls_parcelshop"), "pepita", "⚠ automat de colet GLS: la fel");

  assert.equal(metodaPlata("creditcard", "shipping"), "pepita");
  assert.equal(metodaPlata("transfer", "shipping"), "pepita");
  assert.equal(metodaPlata(null, "shipping"), "pepita");
  /* ⚠ Un mod necunoscut NU devine ramburs: curierul ar mai cere o data banii deja platiti. */
  assert.equal(metodaPlata("bitcoin", "shipping"), "pepita");
});

test("⚠ cine ia banii: un singur caz e al comerciantului", () => {
  /* „In cazul curierilor proprii sau al serviciilor terte (inclusiv MPL), decontarea se face
     direct intre tine si compania de curierat." Restul ajunge la Pepita, sau prin banca. */
  assert.equal(incaseazaPepita("cod", "shipping"), false, "singurul caz al comerciantului");
  assert.equal(incaseazaPepita("cod", "mpl"), false);
  assert.equal(incaseazaPepita("cod", null), false, "necunoscut: se presupune curierul lui, si se avertizeaza");

  assert.equal(incaseazaPepita("cod", "gls"), true);
  assert.equal(incaseazaPepita("cod", "gls_parcelshop"), true);
  assert.equal(incaseazaPepita("creditcard", "shipping"), true, "cardul se incaseaza pe site-ul lor");
  /* ⚠ Transferul ajunge la comerciant, dar prin BANCA, in avans. La usa nu se ia nimic. */
  assert.equal(incaseazaPepita("transfer", "shipping"), true);
});

test("⚠ NOI NU SCHIMBAM METODA DE PLATA ALEASA LA EI", () => {
  /*
   * O vreme functia a cerut si starea platii: pe „unpaid" raspundea ca banii nu sunt la nimeni,
   * iar rambursul se precompleta cu totalul. Adica un transfer bancar nefacut se transforma
   * singur in ramburs, si clientul — care alesese sa plateasca prin banca — se trezea cu
   * curierul cerandu-i numerar la usa. Un singur caz produce ramburs: `cod` dus de curierul
   * COMERCIANTULUI. Restul se lamureste inainte de expediere, nu la usa.
   */
  for (const mod of ["transfer", "creditcard", "bitcoin", null]) {
    assert.equal(incaseazaPepita(mod, "shipping"), true, `${mod}: la usa nu se incaseaza nimic`);
  }
});

test("⚠ ORICE mod de livrare care incepe cu «gls» e transportul LOR", () => {
  /*
   * Documentele lor nu sunt de acord intre ele: cel de impingere a comenzilor scrie
   * `gls_parcelshop`, pagina despre Pepita Delivery scrie `gls_parcellocker` si `gls_xxl`. O
   * lista inchisa ar fi lasat o valoare noua sa treaca drept livrare PROPRIE, iar atunci
   * rambursul s-ar fi precompletat pe un colet dus de GLS-ul contractat de EI: clientul ar fi
   * platit a doua oara la usa.
   */
  for (const mod of ["gls", "gls_parcelshop", "gls_parcellocker", "gls_xxl", "GLS_XXL", "gls_ceva_nou"]) {
    assert.equal(esteLivrarePepita(mod), true, mod);
    assert.equal(incaseazaPepita("cod", mod), true, `${mod}: rambursul e al lor`);
    assert.equal(metodaPlata("cod", mod), "pepita", `${mod}: nu se scrie plata la livrare`);
  }
  for (const mod of ["shipping", "mpl", "", null, "glas"]) {
    assert.equal(esteLivrarePepita(mod), false, `${mod}`);
  }
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
  /* ⚠ Eticheta spune CE E, nu cum se cheama campul lor: documentatia maghiara traduce
     `gls_parcelshop` prin „csomagautomata" (automat de colet), iar cea romaneasca prin
     „automat de colet GLS". Numele campului induce in eroare. */
  assert.equal(etichetaLivrare("gls_parcelshop"), "Automat de colet GLS (livrare Pepita)");
  assert.match(etichetaLivrare("gls"), /livrare Pepita/);
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
