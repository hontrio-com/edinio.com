import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Un produs CONFIGURABIL nu se poate oferi dintr-o apasare.
 *
 * ═══ ⚠ DOUA PAGUBE DIFERITE, DUPA CALE ═══
 *
 * O oferta — bump, „cumparate frecvent impreuna", „merge bine cu" — se adauga dintr-o singura
 * apasare: nu exista unde sa se aleaga latimea, materialul sau gravura. Lasat cumparabil, un
 * produs configurabil gresea in doua feluri:
 *
 *   - din FORMULARUL de produs ajungea in `additional_items` fara nicio configuratie, iar
 *     repretuirea REFUZA toata comanda (un camp obligatoriu necompletat). Clientul nu putea
 *     cumpara nimic, si nu afla de ce;
 *   - din COS era adaugat de `applyOfferPricing` DUPA repretuire, deci se vindea simplu, la
 *     pretul ofertei, fara nicio specificatie. Atelierul primea o cana nescrisa.
 *
 * ═══ ⚠ DE CE O PROBA PE SURSA ═══
 *
 * Regula sta in trei locuri care aduc produse pentru oferte, si toate trei o pot pierde separat.
 * O proba de comportament ar fi cerut baza de date, oferte reale si un configurator publicat;
 * intrebarea de aici e mica: TRECE fiecare dintre cele trei prin acelasi filtru?
 */

const FISIER = path.resolve(process.cwd(), "src/lib/offers/offers.ts");

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(): string {
  return readFileSync(FISIER, "utf8").replace(/\r\n/g, "\n");
}

test("TOATE cele trei locuri care aduc produse pentru oferte afla ce e configurabil", () => {
  const s = sursa();
  const chemari = s.split("await celeConfigurabile(").length - 1;
  assert.equal(
    chemari, 3,
    `filtrul e chemat in ${chemari} locuri, nu in 3: un drum a ramas care ofera produse configurabile`,
  );
  // ⚠ Se numara CHEMARILE, nu potrivirile pe nume:  prinde si declaratia.
  const mapari = s.split("out.push(toOfferProduct(p").length - 1
    + s.split("oferibile.set(p.id, toOfferProduct(p").length - 1;
  assert.equal(mapari, 3, `am gasit ${mapari} chemari de mapare — cititorul s-a rupt`);
  assert.equal(
    s.split("toOfferProduct(p, configurabile)").length - 1, 3,
    "o mapare nu primeste multimea de configurabile, deci acolo steagul lipseste",
  );
});

test("steagul e `needsChoice`, adica exact mecanismul care exista deja", () => {
  /*
   * ⚠ Nu un filtru nou. `esteCumparabil` (offer-pricing.ts) si lista `buyable` folosesc de mult
   * `needsChoice` pentru variante si personalizare; un al doilea mecanism, doar pentru
   * configuratoare, ar fi trebuit tinut la zi in aceleasi locuri, si n-ar fi fost.
   */
  const s = sursa();
  assert.match(
    s,
    /needsChoice: hasVariants\(p\.page_sections\) \|\| cerePersonalizare\(p\.page_sections\)\s*\n?\s*\|\| configurabile\?\.has\(p\.id\) === true/,
    "configurabilul nu mai intra in `needsChoice`",
  );
});

test("filtrul nu costa nimic la magazinele fara configuratoare", () => {
  /*
   * ⚠ `configuratoarePentruProduse` intreaba INTAI daca magazinul are vreun configurator activ, si
   * se opreste acolo. Chemata cu o lista goala, nici atat. Un filtru care ar fi citit legaturile
   * tuturor produselor ar fi adaugat munca pe fiecare pagina de produs din platforma.
   */
  const s = sursa();
  assert.ok(
    s.includes("if (randuri.length === 0) return new Set();"),
    "ajutorul nu mai iese scurt pe lista goala",
  );
  assert.ok(
    s.includes("configuratoarePentruProduse(businessId, randuri)"),
    "ajutorul nu mai trece prin citirea in masa",
  );
});
