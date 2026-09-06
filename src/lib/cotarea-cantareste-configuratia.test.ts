import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Cotarea si emiterea AWB-ului cantaresc ACELASI colet?
 *
 * ═══ ⚠ CE COSTA CAND NU ═══
 *
 * `awb-weight.ts` aduna gramele optiunilor din instantaneul comenzii. Daca cotarea nu le aduna si
 * ea, coletul pleaca mai greu decat s-a platit: curierul il cantareste la depozit, refactureaza
 * banda adevarata, si diferenta o plateste comerciantul — fara sa apara nicaieri in panou. La o
 * cutie de lemn pusa pe o optiune, diferenta e de kilograme, nu de grame.
 *
 * ═══ ⚠ SI DE CE SE TRIMIT VALORILE, NU GREUTATEA ═══
 *
 * `weightKg` a fost SCOS din semnatura lui `getShippingOptions` tocmai fiindca era un numar de la
 * browser din care iesea un pret SEMNAT: se cerea o cotatie pentru un kilogram si se comandau
 * cincisprezece la acelasi pret. Valorile nu sunt un numar — serverul le trece prin definitia
 * publicata si socoteste el gramele.
 */

const SRC = path.resolve(process.cwd(), "src");

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(relativ: string): string {
  return readFileSync(path.join(SRC, relativ), "utf8").replace(/\r\n/g, "\n");
}

test("cotarea socoteste gramele PE SERVER, din valori", () => {
  const s = sursa("lib/actions/shipping.actions.ts");
  assert.ok(s.includes("await gramelePeLinie("), "cotarea nu mai socoteste gramele configuratiei");
  assert.ok(
    s.includes("verificaRaspunsul(c.compilat, linie.configuratie, pret)"),
    "gramele nu mai trec prin definitia publicata",
  );
  assert.ok(
    s.includes("grameConfiguratie: grameleConfiguratiei("),
    "gramele nu mai vin din motor",
  );
});

test("cotarea NU primeste o greutate de la browser", () => {
  /*
   * ⚠ Regula scrisa deja acolo pentru `weightKg`. Un camp de greutate pe linia de cotare ar fi
   * refacut exact defectul inchis atunci: cotatie pentru un kilogram, comanda de cincisprezece.
   */
  const s = sursa("lib/actions/shipping.actions.ts");
  const semnatura = s.slice(s.indexOf("export async function getShippingOptions"), s.indexOf("): Promise<ShippingOptionSemnata[]>"));
  assert.ok(semnatura.length > 200, "nu am gasit semnatura — cititorul s-a rupt");
  assert.ok(!/weightKg\s*[?]?:/.test(semnatura), "a reaparut o greutate primita de la client");
  assert.ok(!/grame\w*\s*[?]?:\s*number/.test(semnatura), "linia de cotare primeste grame de la client");
});

test("TOATE cele doua formulare care coteaza trimit configuratia", () => {
  /*
   * ⚠ Sunt scrise separat: fereastra de comanda de pe pagina de produs, si formularul de
   * finalizare din cos. Unul singur lasat pe dinafara inseamna ca jumatate din comenzi se coteaza
   * pe coletul gresit.
   */
  /*
   * ⚠ Se cere FIECARE linie de cotare, nu „macar una".
   *
   * Prima forma a probei cerea doar o potrivire pe fisier. In fereastra de comanda sunt DOUA
   * linii — produsul din formular si cele purtate din cos — iar scoasa configuratia de pe a doua,
   * proba trecea verde fiindca prima o mai avea. Chiar asa a si supravietuit primul mutant.
   */
  const cerute: [string, RegExp[]][] = [
    ["components/ministore/OrderModal.tsx", [
      /\{ productId: product\.id, quantity, configuratie: product\.configuratie \}/,
      /cart\.map\(\(i\) => \(\{ productId: i\.productId, quantity: i\.quantity, configuratie: i\.configuratie \}\)\)/,
    ]],
    ["components/storefront/sections/checkout/CheckoutForm.tsx", [
      /items\.map\(\(i\) => \(\{ productId: i\.productId, quantity: i\.quantity, configuratie: i\.configuratie \}\)\)/,
    ]],
  ];
  for (const [f, tipare] of cerute) {
    const s = sursa(f);
    for (const t of tipare) {
      assert.match(s, t, `${f} are o linie de cotare care nu poarta configuratia`);
    }
  }
});

test("RECOTAREA se declanseaza cand se schimba configuratia", () => {
  /*
   * ⚠ Doua configuratii ale aceluiasi produs, in aceeasi cantitate, dau acelasi „produs x
   * cantitate". Cu semnatura veche, cotatia nu se mai cerea — iar cumparatorul care adauga o cutie
   * de doua kilograme ramanea cu pretul canii goale, si il si platea: pretul pleaca SEMNAT.
   */
  const s = sursa("components/ministore/CourierSelector.tsx");
  assert.ok(s.includes("amprentaConfiguratiei(normalizeazaValori(c.configuratie))"), "semnatura nu mai vede configuratia");
  assert.ok(
    !/const cartSig = \(cart \?\? \[\]\)\.map\(\(c\) => `\$\{c\.productId\}x\$\{c\.quantity\}`\)/.test(s),
    "a ramas semnatura veche, oarba la configuratie",
  );
});
