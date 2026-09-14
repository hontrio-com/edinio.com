import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { diferentaDeRamburs } from "./diferenta-ramburs";

/**
 * Jurnalul `rambursSubdeclarat` a scris 17 randuri intre 05.08 si 10.09.2026, si NICIUNUL nu era
 * subdeclarare: erau nepotrivirea noastra de unitati. Comenzi reale: 5 lei extraoptiune la #0227,
 * #0219 si #0207 (de unde cele unsprezece diferente de fix 5,00), bump de 55 de lei la #0160 si
 * #0084.
 */

test("extraoptiunea singura NU mai e subdeclarare", () => {
  // #0227: marfa 95, declarat 90, iar cei 5 lei sunt chiar extraoptiunea.
  const d = diferentaDeRamburs({ marfaIncasata: 95, declarat: 90, extrasTotal: 5, venitBumpuri: 0 });
  assert.equal(d.explicabil, 5);
  assert.equal(d.nelamurit, 0);
});

test("bumpul singur NU mai e subdeclarare pe calea cosului", () => {
  // #0160: declarat 50, marfa 105, iar cei 55 sunt bumpul, pe care checkout-ul nu il declara.
  const d = diferentaDeRamburs({ marfaIncasata: 105, declarat: 50, extrasTotal: 0, venitBumpuri: 55 });
  assert.equal(d.explicabil, 55);
  assert.equal(d.nelamurit, 0);
});

test("⚠ dar subdeclararea ADEVARATA se vede in continuare", () => {
  /* Perechea obligatorie. Fara ea, „repara" ar putea insemna „nu mai raporta niciodata nimic",
     si atunci cine cere cotatia cu 0,01 si comanda 5000 de lei ar trece nevazut. */
  const d = diferentaDeRamburs({ marfaIncasata: 5000, declarat: 0.01, extrasTotal: 0, venitBumpuri: 0 });
  assert.equal(d.explicabil, 0);
  assert.ok(d.nelamurit > 4999, `nelamurit = ${d.nelamurit}`);
});

test("⚠ si se vede chiar cand exista si extraoptiuni si bump-uri", () => {
  /* Amandoua explicatiile la un loc nu au voie sa inghita o subdeclarare adevarata:
     marfa 1000, declarat 100, din care 5 extra si 55 bump; raman 840 nelamuriti. */
  const d = diferentaDeRamburs({ marfaIncasata: 1000, declarat: 100, extrasTotal: 5, venitBumpuri: 55 });
  assert.equal(d.explicabil, 60);
  assert.equal(d.nelamurit, 840);
});

test("o intrare stricata nu naste un semnal fals", () => {
  /* Greseala se face in favoarea TACERII: randul acuza un client, deci o valoare negativa sau
     necitibila nu are voie sa mareasca partea nelamurita. */
  for (const rau of [NaN, -5, undefined as unknown as number, null as unknown as number]) {
    const d = diferentaDeRamburs({ marfaIncasata: 100, declarat: 100, extrasTotal: rau, venitBumpuri: rau });
    assert.equal(d.explicabil, 0, `extras/bump: ${String(rau)}`);
    assert.equal(d.nelamurit, 0, `extras/bump: ${String(rau)}`);
  }
});

test("banii se rotunjesc la doi zecimali, nu se aduna in virgula mobila", () => {
  const d = diferentaDeRamburs({ marfaIncasata: 0.1 + 0.2, declarat: 0, extrasTotal: 0, venitBumpuri: 0 });
  assert.equal(d.nelamurit, 0.3);
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠⚠ PROBA CARE CONTEAZA E PE APELANTI, NU PE FUNCTIE
   ══════════════════════════════════════════════════════════════════════════

   Functia de mai sus nu stie de unde e chemata, deci nicio proba pe ea nu poate apara lucrul
   fragil: ca `venitBumpuri` are DOUA valori diferite, dupa formular.

     * `placeOrder` (OrderModal) trimite ZERO, fiindca `cod_declarat` e `subtotal`-ul din browser,
       care contine deja bump-urile. Scazute a doua oara, ar ierta o subdeclarare de exact atat.
     * `placeCartOrder` (checkout) trimite suma adevarata, fiindca acolo `cod_declarat` e totalul
       cosului, care nu le contine.

   Cine „uniformizeaza" cele doua chemari strica jumatate din masuratoare in tacere: `tsc` trece,
   suita trece, si jurnalul incepe sa minta invers. Proba de mai jos cade cu numele locului.
*/

const SURSA = "src/lib/actions/order.actions.ts";

function corpulFunctiei(text: string, nume: string): string {
  const start = text.indexOf(`export async function ${nume}(`);
  assert.ok(start >= 0, `nu mai exista \`${nume}\` in ${SURSA}: a fost redenumita?`);
  const urmatoare = text.indexOf("\nexport async function ", start + 1);
  return text.slice(start, urmatoare < 0 ? text.length : urmatoare);
}

test("⚠ placeOrder cheama diferentaDeRamburs cu venitBumpuri ZERO", () => {
  const corp = corpulFunctiei(readFileSync(SURSA, "utf8"), "placeOrder");
  assert.match(
    corp, /diferentaDeRamburs\(\{[^}]*venitBumpuri:\s*0\b/,
    "in `placeOrder`, `cod_declarat` e chiar subtotalul din browser, care CONTINE bump-urile. "
    + "Scazute si aici, o subdeclarare de exact cat bumpul ar trece nevazuta.",
  );
});

test("⚠ placeCartOrder cheama diferentaDeRamburs cu suma bump-urilor, nu cu zero", () => {
  const corp = corpulFunctiei(readFileSync(SURSA, "utf8"), "placeCartOrder");
  assert.match(
    corp, /diferentaDeRamburs\(\{[^}]*venitBumpuri:\s*venitBumpuri\b/,
    "in `placeCartOrder`, `cod_declarat` e totalul cosului, care NU contine bump-urile. "
    + "Cu zero aici, fiecare bump acceptat ar fi raportat ca subdeclarare, adica exact defectul reparat.",
  );
});

test("⚠ amandoua locurile jurnalizeaza pe `nelamurit`, nu pe diferenta bruta", () => {
  const text = readFileSync(SURSA, "utf8");
  for (const nume of ["placeOrder", "placeCartOrder"]) {
    const corp = corpulFunctiei(text, nume);
    assert.match(
      corp, /nelamurit\s*>\s*1/,
      `in \`${nume}\` pragul nu se mai uita la \`nelamurit\`. Asa jurnalul se intoarce la ce era: `
      + "masoara propria noastra nepotrivire de unitati si o numeste subdeclarare.",
    );
  }
});
