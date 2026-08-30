import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { statusEdinio } from "@/lib/emag/orders";
import { platitLaEi } from "@/lib/emag/plata";

/* ══════════════════════════════════════════════════════════════════════════
   CE SCRIU INTEGRARILE IN `orders` TREBUIE SA INCAPA IN CE PRIMESTE BAZA
   ══════════════════════════════════════════════════════════════════════════

   ⚠ A TREIA OARA IN DOUA ZILE, SI DE-AIA PROBA E GENERALA.

   1. 24.08.2026 — `statusEdinio(5)` intorcea „returned". `orders_status_check` n-a avut
      niciodata valoarea asta. O comanda DEJA returnata la prima conectare nu intra deloc:
      insertul cadea cu `23514`, cod trecut anume in lista „permanent", deci comanda era
      sarita DEFINITIV.

   2. 25.08.2026 — `platitLaEi(0)` intorcea „pending". `orders_payment_status_check` cere
      `unpaid | paid | refunded`. Deci FIECARE comanda eMAG cu ramburs — adica majoritatea —
      pica la inserare si se pierde intreaga. Prinsa pe comanda 501350435 de monitorul care
      urmareste erorile critice, la o ora dupa ce intrase.

   ⚠ AMANDOUA ARATAU SANATOS: comenzile platite cu cardul treceau (ies „paid"), iar cele
   livrate treceau (ies „delivered"). Se strica numai o parte din trafic, si numai aceea
   care nu se vede in panou — fiindca o comanda care nu s-a scris nu apare nicaieri.

   ⚠ DE-AIA PROBA NU INTREABA „ce intoarce functia", ci „raspunsul ei incape in ce primeste
   baza". Prima intrebare se scrie dupa cod si e mereu verde; a doua se scrie dupa regula
   din baza si prinde tocmai despartirea dintre ele. Multimile se CITESC din baseline, nu
   se scriu de mana: mutate in baza, proba se muta cu ele.
*/

const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");

/**
 * Valorile pe care `orders_<coloana>_check` le primeste, citite din baseline.
 *
 * ⚠ FARA REGEX PESTE TOT TEXTUL, dinadins: prima forma a acestei functii avea un `\s*` care
 * a ajuns in fisier ca `\s` intr-un sablon, iar JS il citeste ca simplu „s". Regexul se
 * compila, nu potrivea nimic, si proba ar fi cazut cu un mesaj despre baseline — nu despre
 * ea insasi. Se cauta clauza dupa nume si se citesc apostrofii dintre paranteze.
 */
function valoriPermise(coloana: string): Set<string> {
  /*
   * ⚠ ANCORA E INSTRUCTIUNEA INTREAGA, nu numele regulii. Cu `orders_status_check CHECK`,
   * `indexOf` gasea intai `domain_orders_status_check` — alta tabela, alte valori — fiindca
   * ea vine mai devreme in baseline. Proba iesea rosie aratand cu degetul spre `statusEdinio`,
   * care era in regula. E a cincea oara cand `indexOf` gaseste alta aparitie decat cea
   * cautata; de-aia se ancoreaza pe text unic, nu pe o bucata care se repeta.
   */
  const ancora = `alter table public.orders add constraint orders_${coloana}_check CHECK`;
  const i = baseline.indexOf(ancora);
  assert.ok(i > 0, `nu s-a gasit regula pentru orders.${coloana} in baseline`);

  /* Pana la primul `]`: acolo se inchide lista din `= ANY (ARRAY[...])`. */
  const clauza = baseline.slice(i, baseline.indexOf("]", i));
  const valori = [...clauza.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(valori.length > 0, `regula pentru orders.${coloana} n-are nicio valoare`);
  return new Set(valori);
}

test("⚠ proba stie sa citeasca regulile din baseline", () => {
  /*
   * ⚠ Perechea obligatorie a oricarei probe care citeste: daca regexul n-ar potrivi nimic,
   * multimea ar iesi goala si TOATE verificarile de mai jos ar cadea — sau, mai rau, daca
   * as fi scris `.size === 0 ? treci` ar fi trecut totul. Un zero fals arata ca un zero bun.
   */
  assert.deepEqual(
    [...valoriPermise("status")].sort(),
    ["cancelled", "confirmed", "delivered", "pending", "processing", "refunded", "shipped"],
  );
  assert.deepEqual([...valoriPermise("payment_status")].sort(), ["paid", "refunded", "unpaid"]);
});

test("⚠ statusEdinio nu poate intoarce ceva ce baza respinge", () => {
  const permise = valoriPermise("status");
  /* ⚠ Si numerele pe care ei NU le au azi: un status nou inventat de eMAG maine trece prin
     `return "pending"` de la sfarsit, si trebuie sa incapa si el. */
  for (const s of [0, 1, 2, 3, 4, 5, 6, 9, 99, -1]) {
    assert.ok(
      permise.has(statusEdinio(s)),
      `statusEdinio(${s}) = „${statusEdinio(s)}" — respins de orders_status_check`,
    );
  }
});

test("⚠ platitLaEi nu poate intoarce ceva ce baza respinge", () => {
  const permise = valoriPermise("payment_status");
  for (const p of [1, 0, 2, -1, undefined, null, "1", "paid", {}, []]) {
    assert.ok(
      permise.has(platitLaEi(p)),
      `platitLaEi(${JSON.stringify(p)}) = „${platitLaEi(p)}" — respins de orders_payment_status_check`,
    );
  }
});

test("⚠ si celelalte marketplace-uri scriu numai valori primite", () => {
  /*
   * Trendyol si About You nu au functii de potrivire pentru plata: scriu un literal, fiindca
   * acolo banii se incaseaza mereu de marketplace. Se citeste chiar literalul din sursa —
   * altfel un „pending" pus maine acolo ar repeta defectul intr-o integrare pe care proba
   * de mai sus n-o atinge.
   */
  const permise = valoriPermise("payment_status");
  for (const f of ["src/lib/trendyol/orders.ts", "src/lib/aboutyou/orders.ts"]) {
    const sursa = readFileSync(f, "utf8");
    const scrise = [...sursa.matchAll(/payment_status:\s*"([a-z_]+)"/g)].map((m) => m[1]);
    assert.ok(scrise.length > 0, `${f}: nu s-a gasit nicio scriere de payment_status`);
    for (const v of scrise) {
      assert.ok(permise.has(v), `${f} scrie „${v}", respins de orders_payment_status_check`);
    }
  }
});
