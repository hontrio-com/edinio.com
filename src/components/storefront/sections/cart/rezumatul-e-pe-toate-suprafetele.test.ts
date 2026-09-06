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

const RADACINA = path.resolve(process.cwd(), "src/components");

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF, si potrivirile pe rand cad tacut. */
function sursa(relativ: string): string {
  return readFileSync(path.join(RADACINA, relativ), "utf8").replace(/\r\n/g, "\n");
}

/** Suprafetele care deseneaza o linie de cos. Se recunosc dupa faptul ca arata `variantTitle`. */
const SUPRAFETE = [
  "storefront/sections/cart/_shared/CartPieces.tsx",
  "storefront/sections/cart/CartDrawerClassic.tsx",
  "storefront/sections/checkout/CheckoutSummary.tsx",
  /*
   * ⚠ A PATRA, si cea mai usor de uitat: fereastra de comanda deseneaza si ea liniile
   * purtate din cos, dar sta in alt dosar si nu se numeste „cart" nicaieri. Prima forma a probei
   * astea o rata, si tocmai ea era singura care nu arata configuratia.
   */
  "ministore/OrderModal.tsx",
];

test("FIECARE suprafata care deseneaza o linie de cos arata si configuratia", () => {
  for (const f of SUPRAFETE) {
    const s = sursa(f);
    assert.match(
      s,
      /\w+\.variantTitle &&/,
      `${f} nu mai deseneaza o linie de cos — lista de suprafete s-a rupt`,
    );
    // ⚠ Numele variabilei difera de la o suprafata la alta (`item`, `ci`), deci se cauta
    // chemarea, nu sirul exact.
    assert.match(
      s,
      /<RezumatLinie item=\{\w+\} \/>/,
      `${f} arata varianta, dar nu si configuratia: doua gravuri diferite ar fi doua randuri identice`,
    );
  }
});

test("piesa e UNA SINGURA, in _shared", () => {
  // ⚠ O a doua copie ar fi divergit: alt numar de campuri aratate, alta taiere.
  const definitii = SUPRAFETE.filter((f) => sursa(f).includes("export function RezumatLinie"));
  assert.deepEqual(definitii, ["storefront/sections/cart/_shared/CartPieces.tsx"]);
});

test("rezumatul scurt se taie, nu se revarsa", () => {
  /*
   * ⚠ Piesa cheama `rezumatScurt`, care ia cel mult trei campuri. Chemata pe lista intreaga, o
   * configuratie cu doisprezece campuri ar fi umplut randul si ar fi facut cosul necitibil.
   */
  const s = sursa("storefront/sections/cart/_shared/CartPieces.tsx");
  assert.ok(s.includes("rezumatScurt(item.rezumat ?? [])"), "piesa nu mai taie lista");
  assert.ok(s.includes("caUnRand(randuri)"), "piesa nu mai scrie randul din bucata taiata");
});

test("⚠ linia care NU se poate comanda o spune, pe toate cele patru suprafete", () => {
  /*
   * ⚠ `lineProblema` se socotea, se punea in context — si nu-l citea nimeni. Cosul cadea deci
   * tacut pe pretul salvat si arata un total perfect normal. Cumparatorul completa numele,
   * telefonul, adresa, alegea curierul, apasa „Trimite comanda” — si abia atunci afla ca linia
   * nu mai e buna. La ultimul clic, dupa toata munca: aia e o comanda pierduta.
   *
   * ⚠ Se cere pe PIESA COMUNA, nu pe fiecare suprafata: cele patru randeaza `RezumatLinie`,
   * iar scrisa in fiecare, a patra ar fi uitat-o.
   */
  const s = sursa("storefront/sections/cart/_shared/CartPieces.tsx");
  assert.ok(s.includes("const problema = lineProblema(item);"), "piesa nu mai intreaba daca linia e buna");
  assert.match(s, /\{problema && \(/, "raspunsul se socoteste si nu se deseneaza");
  assert.match(s, /role="alert"/, "avertismentul nu se anunta la cititorul de ecran");
});

test("FEREASTRA DE COMANDA foloseste ACEEASI cheie de linie ca restul cosului", () => {
  /*
   * ⚠ Isi scria singura cheia, in forma de dinaintea configuratoarelor: produs plus varianta.
   * Doua cani cu gravuri diferite cad pe aceeasi cheie, deci se contopeau intr-un singur rand —
   * iar `+`, `-` si stergerea lucrau pe AMANDOUA. Clientul ar fi scos din comanda o gravura pe
   * care n-o vedea, si ar fi aflat cand primea coletul.
   *
   * `lineKey` intoarce litera cu litera cheia veche pentru liniile fara configuratie, deci nimic
   * din ce mergea nu s-a schimbat.
   */
  const s = sursa("ministore/OrderModal.tsx");
  assert.ok(
    s.includes("const cartLineKey = lineKey;"),
    "fereastra de comanda si-a scris din nou propria cheie de linie",
  );
  assert.ok(
    !/\$\{l\.productId\}::\$\{l\.variantTitle\}/.test(s),
    "a ramas o cheie compusa de mana, care nu vede configuratia",
  );
});
