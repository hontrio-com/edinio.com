import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * COSUL PRINDE CADEREA TRIMITERII, CA FEREASTRA PRODUSULUI (11.11.2026).
 *
 * ═══ ⚠ DEFECTUL ═══
 *
 * In `useCheckoutOrder` (cosul in fereastra si pagina /checkout), `placeCartOrder` si `fetch`-ul care porneste plata
 * stateau descoperite intr-un `startTransition(async ...)`. O actiune care arunca (retea, timp depasit, un raspuns
 * refuzat) e re-aruncata de React la randare, iar singurele bariere de erori sunt la radacina: cumparatorul primea
 * pagina „500” peste cos si pierdea formularul. Daca se pierduse doar raspunsul, comanda intrase deja, iar o a doua
 * trimitere, fara `placedRef` (pierdut odata cu pagina), facea a doua comanda. Existent si in productie.
 *
 * Clichetul de tranzitii (`callbackul-de-tranzitie-prinde-caderea.test.ts`) il socotea prins, fiindca gasea un `catch`
 * pe `res.json()`; de pe 11.11 el se uita la fiecare asteptare. Proba de aici pazeste ce VEDE omul: aceleasi doua
 * mesaje ca in `OrderModal`, fiecare spunand ce se stie in clipa aia.
 *
 * ⚠ Textele sunt de vitrina, deci FARA diacritice (regula lui; refuzurile din `order.actions.ts` la fel).
 */

const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");
const COS = cod("src/components/storefront/sections/checkout/checkout-core.ts");
const FEREASTRA = cod("src/components/ministore/OrderModal.tsx");

const NU_STIM = "Nu am primit raspuns de la server si nu stim daca s-a inregistrat comanda. Verifica-ti emailul sau scrie-ne inainte sa trimiti din nou.";
const PLATA_NEPORNITA = "Comanda s-a inregistrat, dar plata nu a pornit. Incearca din nou: nu se va crea o a doua comanda.";

const scapa = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("trimiterea comenzii din cos e prinsa, cu mesajul „nu stim daca s-a inregistrat”", () => {
  assert.match(COS, new RegExp(
    String.raw`try \{\s*result = await placeCartOrder\(payload\);\s*\} catch \{\s*setErrors\(\{ _: "${scapa(NU_STIM)}" \}\);\s*return;\s*\}`));
});

test("pornirea platii din cos e prinsa, iar mesajul spune ca o reincercare nu face a doua comanda", () => {
  assert.match(COS, new RegExp(
    String.raw`try \{\s*res = await fetch\(endpoint, \{[\s\S]*?\}\);\s*\} catch \{\s*setErrors\(\{ _: "${scapa(PLATA_NEPORNITA)}" \}\);\s*return;\s*\}`));
  // Comanda e tinuta minte INAINTE de plata: altfel reincercarea ar face a doua comanda.
  assert.ok(COS.indexOf("placedRef.current = { payloadKey, orderId };") < COS.indexOf("res = await fetch(endpoint"));
});

test("cele doua ecrane spun acelasi lucru, cu aceleasi cuvinte, fara diacritice", () => {
  for (const mesaj of [NU_STIM, PLATA_NEPORNITA]) {
    assert.ok(FEREASTRA.includes(mesaj), `OrderModal nu mai scrie: ${mesaj}`);
    assert.ok(COS.includes(mesaj), `checkout-core nu mai scrie: ${mesaj}`);
    assert.doesNotMatch(mesaj, /[ăâîșțĂÂÎȘȚ]/);
  }
});
