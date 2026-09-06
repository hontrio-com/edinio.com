import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Configuratia liniei se vede pe TOATE suprafetele cosului?
 *
 * ═══ ⚠ CE SE INTAMPLA CAND NU SE VEDE ═══
 *
 * Doua cani cu gravuri diferite au acelasi nume, aceeasi poza si adesea acelasi pret. Fara
 * rezumat, sunt doua randuri identice — iar cumparatorul care vrea sa stearga cana cu „Maria”
 * nu are cum sa stie pe care apasa. Butonul lucreaza pe cheia liniei, deci greseala nu se vede
 * pana la comanda.
 *
 * ═══ ⚠ DE CE O PROBA, SI NU O COMPONENTA COMUNA ═══
 *
 * Piesa E comuna (`RezumatLinie` din `_shared/CartPieces.tsx`), dar SUPRAFETELE nu sunt: sertarul
 * si rezumatul de la finalizare isi scriu singure randul, fiindca au alte constrangeri de latime.
 * Deci nimic nu obliga o suprafata noua s-o cheme, si nimic n-ar cadea daca uita.
 *
 * Proiectul are tiparul asta scris de trei ori: al doilea meniu al panoului care „il oglindeste”
 * pe primul si nu-l oglindeste, cele doua cai de comanda care au divergit, si modelele de pagina
 * de produs.
 */

const RADACINA = path.resolve(process.cwd(), "src/components/storefront/sections");

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF, si potrivirile pe rand cad tacut. */
function sursa(relativ: string): string {
  return readFileSync(path.join(RADACINA, relativ), "utf8").replace(/\r\n/g, "\n");
}

/** Suprafetele care deseneaza o linie de cos. Se recunosc dupa faptul ca arata `variantTitle`. */
const SUPRAFETE = [
  "cart/_shared/CartPieces.tsx",
  "cart/CartDrawerClassic.tsx",
  "checkout/CheckoutSummary.tsx",
];

test("FIECARE suprafata care deseneaza o linie de cos arata si configuratia", () => {
  for (const f of SUPRAFETE) {
    const s = sursa(f);
    assert.ok(
      s.includes("item.variantTitle"),
      `${f} nu mai deseneaza o linie de cos — lista de suprafete s-a rupt`,
    );
    assert.ok(
      s.includes("<RezumatLinie item={item} />"),
      `${f} arata varianta, dar nu si configuratia: doua gravuri diferite ar fi doua randuri identice`,
    );
  }
});

test("piesa e UNA SINGURA, in _shared", () => {
  // ⚠ O a doua copie ar fi divergit: alt numar de campuri aratate, alta taiere.
  const definitii = SUPRAFETE.filter((f) => sursa(f).includes("export function RezumatLinie"));
  assert.deepEqual(definitii, ["cart/_shared/CartPieces.tsx"]);
});

test("rezumatul scurt se taie, nu se revarsa", () => {
  /*
   * ⚠ Piesa cheama `rezumatScurt`, care ia cel mult trei campuri. Chemata pe lista intreaga, o
   * configuratie cu doisprezece campuri ar fi umplut randul si ar fi facut cosul necitibil.
   */
  const s = sursa("cart/_shared/CartPieces.tsx");
  assert.ok(s.includes("rezumatScurt(item.rezumat)"), "piesa nu mai taie lista");
  assert.ok(s.includes("caUnRand(randuri)"), "piesa nu mai scrie randul din bucata taiata");
});
