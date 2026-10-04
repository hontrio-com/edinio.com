import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { rambursulDeCotat, TOLERANTA_RAMBURS_LEI } from "./recotarea";
import { pragulRambursului } from "./optiuni-de-rezerva";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * SUMA DE RAMBURS COTATA POARTA SI EXTRAOPTIUNILE                (04.10.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Serverul refuza comanda cu ramburs cand `subtotal + extrasTotal - discountAmount` trece de suma
 * semnata la cotare cu mai mult de `TOLERANTA_RAMBURS_LEI`. Formularele cereau cotatia doar pe
 * marfa, deci orice extraoptiune de peste un leu („Deschidere colet la livrare", 5 lei) facea
 * comanda imposibila: JHBijuterii si Suporti-Numar, refuzate cu diferenta de exact 5 lei.
 *
 * ⚠ Proba apara REGULA, nu doar cablarea: suma ceruta, trecuta prin podeaua ADEVARATA a
 * serverului (`pragulRambursului`), trebuie sa treaca de poarta comenzii. Si separat, pe
 * fiecare `<CourierSelector>` in parte, ca ambele formulare chiar o cer asa.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Poarta din `placeOrder` si `placeCartOrder`, copiata; forma ei e legata de sursa mai jos. */
function eRefuzata(marfa: number, extraoptiuni: number, reducere: number, rambursCerut: number, podeaCatalog: number) {
  const semnatBani = Math.max(0, Math.round(pragulRambursului(rambursCerut, podeaCatalog, true) * 100));
  return round2(marfa + extraoptiuni - reducere) - semnatBani / 100 > TOLERANTA_RAMBURS_LEI;
}

/* Cazurile masurate pe productie, plus marginile: podea zero (cart omis), reducere, zecimale. */
const CAZURI: { nume: string; marfa: number; extra: number; reducere: number; podea: number }[] = [
  { nume: "Suporti-Numar, o bucata", marfa: 50, extra: 5, reducere: 0, podea: 50 },
  { nume: "JHBijuterii, cos", marfa: 235, extra: 5, reducere: 0, podea: 235 },
  { nume: "extraoptiune de 30 lei", marfa: 120, extra: 30, reducere: 0, podea: 120 },
  { nume: "doua extraoptiuni", marfa: 99.9, extra: 25, reducere: 0, podea: 99.9 },
  { nume: "cu cupon", marfa: 200, extra: 20, reducere: 15, podea: 200 },
  { nume: "fara podea din catalog", marfa: 80, extra: 5, reducere: 0, podea: 0 },
  { nume: "zecimale", marfa: 47.2, extra: 5.55, reducere: 0, podea: 47.2 },
];

test("⚠⚠ cu extraoptiune bifata, comanda cu ramburs TRECE de poarta serverului", () => {
  for (const c of CAZURI) {
    assert.equal(
      eRefuzata(c.marfa, c.extra, c.reducere, rambursulDeCotat(c.marfa, c.extra), c.podea),
      false,
      `${c.nume}: refuzata desi cumparatorul n-a schimbat nimic`,
    );
  }
});

test("⚠ proba PRINDE defectul vechi: suma ceruta doar pe marfa e refuzata", () => {
  /* Fara asta, proba de mai sus ar putea trece si pe o poarta care nu mai refuza nimic. */
  assert.equal(eRefuzata(50, 5, 0, 50, 50), true, "suma fara extraoptiune trebuia refuzata");
  assert.equal(eRefuzata(235, 5, 0, 235, 235), true, "suma fara extraoptiune trebuia refuzata");
});

test("fara extraoptiuni, suma ceruta e chiar marfa, ca inainte", () => {
  assert.equal(rambursulDeCotat(123.45, 0), 123.45);
  assert.equal(rambursulDeCotat(50, 5), 55);
  assert.equal(rambursulDeCotat(0.1, 0.2), 0.3);
});

test("valorile stricate nu pleaca la curier ca NaN sau negative", () => {
  assert.equal(rambursulDeCotat(Number.NaN, 5), 5);
  assert.equal(rambursulDeCotat(50, Number.NaN), 50);
  assert.equal(rambursulDeCotat(-10, -3), 0);
});

test("⚠ poarta copiata in proba e chiar cea din server", () => {
  const cod = readFileSync("src/lib/actions/order.actions.ts", "utf8");
  const porti = cod.split("verdictTransport.rambursBaniSemnat != null").slice(1);
  assert.equal(porti.length, 2, "nu mai sunt doua porti de ramburs pe server");
  for (const p of porti) {
    assert.match(
      p.slice(0, 220),
      /&& round2\(subtotal \+ extrasTotal - discountAmount\) - verdictTransport\.rambursBaniSemnat \/ 100\s+> TOLERANTA_RAMBURS_LEI/,
      "poarta serverului s-a schimbat; proba de sus nu o mai reproduce",
    );
  }
});

/* ═══ CABLAREA, pe fiecare element ═══ */

function fisiereTsx(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: false })
    .map(String)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(dir, f));
}

test("⚠⚠ FIECARE <CourierSelector> cere ramburs cu extraoptiunile incluse", () => {
  const asteptate: Record<string, string> = {
    [join("src", "components", "ministore", "OrderModal.tsx")]: "subtotal",
    [join("src", "components", "storefront", "sections", "checkout", "CheckoutForm.tsx")]: "goodsTotal",
  };
  let gasite = 0;
  for (const fisier of fisiereTsx("src")) {
    const sursa = readFileSync(fisier, "utf8");
    const bucati = sursa.split("<CourierSelector").slice(1);
    for (const b of bucati) {
      gasite++;
      const marfa = asteptate[fisier];
      assert.ok(marfa, `${fisier}: un <CourierSelector> nou; cere-i rambursul cu \`rambursulDeCotat\``);
      const element = b.slice(0, b.indexOf("onSelect="));
      const cod = element.match(/\bcod=\{([^\n]+)\}\r?\n/);
      assert.ok(cod, `${fisier}: <CourierSelector> fara \`cod\``);
      assert.equal(
        cod[1].trim(),
        `paymentMethod === "cash_on_delivery" ? rambursulDeCotat(${marfa}, extrasTotal) : 0`,
        `${fisier}: rambursul cotat nu mai poarta extraoptiunile`,
      );
    }
  }
  assert.equal(gasite, 2, `${gasite} selectoare de curier gasite, nu cele doua formulare`);
});
