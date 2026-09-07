import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { apiFaraPoarta } from "@/lib/auth/poarta-mfa";
import {
  MARKETPLACE_CU_CICLU_PROPRIU, MARKETPLACE_ORIGINI, deriveOrigin,
  marketplaceCareTineComanda, mementoulMarketplace,
} from "@/lib/orders/origin";
import { PEPITA } from "./types";
import { sablonMesajPepita } from "./activare";

/* ══════════════════════════════════════════════════════════════════════════
   POARTA
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ cele trei adrese Pepita trec pe langa poarta MFA", () => {
  /*
   * Sunt chemate de o masina, fara cookie, cu cheia lor in cale. Feedul de stoc e citit din
   * ora in ora pentru fiecare magazin conectat; o cerere spre serverul de autentificare la
   * fiecare citire ar fi cost curat.
   */
  assert.equal(apiFaraPoarta("/api/pepita/produse/abc.xml"), true);
  assert.equal(apiFaraPoarta("/api/pepita/stoc/abc.xml"), true);
  assert.equal(apiFaraPoarta("/api/pepita/comenzi/abc"), true);
  assert.equal(apiFaraPoarta("/api/pepita/comenzi"), true);
});

test("scutirea nu se scurge peste alte rute", () => {
  /* `startsWith` e larg: o scutire scrisa „/api/pep" ar fi deschis si alte cai. */
  assert.equal(apiFaraPoarta("/api/products/export"), false);
  assert.equal(apiFaraPoarta("/api/pepitax/ceva"), false);
});

/* ══════════════════════════════════════════════════════════════════════════
   PANOUL COMENZII
   ══════════════════════════════════════════════════════════════════════════ */

const sursa = { marketplace: PEPITA, order_number: "555001" };

test("comanda Pepita se recunoaste in lista, cu eticheta ei", () => {
  /* Fara randul din `MARKETPLACE_ORIGINI`, s-ar vedea in tabel exact ca una din magazin. */
  assert.ok(MARKETPLACE_ORIGINI[PEPITA], "Pepita are eticheta si culoare");
  assert.equal(deriveOrigin(sursa).marketplace, PEPITA);
});

test("⚠ Pepita NU e printre marketplace-urile care tin starea comenzii", () => {
  /*
   * Acolo sunt cele care ne spun ele starea, deci butoanele noastre se INCHID, fiindca
   * exista o cale oficiala alternativa. La Pepita nu exista NICIO cale, in niciun sens.
   * Inchise, butoanele l-ar fi lasat pe comerciant fara nicio posibilitate de a-si duce
   * comanda la capat, si fara factura si AWB.
   */
  assert.equal(MARKETPLACE_CU_CICLU_PROPRIU.has(PEPITA), false);
  assert.equal(marketplaceCareTineComanda(sursa), null);
});

test("⚠ dar comanda poarta mementoul: aceeasi miscare se face si in Pepita Admin", () => {
  /* Fara el, comerciantul ar apasa „expediat" in Edinio si ar crede ca a confirmat comanda
     la ei. Pepita cere confirmarea in cel mult o zi. */
  const m = mementoulMarketplace(sursa);
  assert.ok(m && m.includes("Pepita Admin"));
  assert.equal(mementoulMarketplace({ marketplace: "emag" }), null, "numai unde chiar e nevoie");
  assert.equal(mementoulMarketplace(null), null);
  assert.equal(mementoulMarketplace({}), null);
});

/* ══════════════════════════════════════════════════════════════════════════
   CE NU ARE VOIE SA SCRIE IN PANOU
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Proba de mai jos SCANEAZA TEXTUL, si stie ce poate si ce nu poate: nu spune ca panoul
   se poarta bine, spune doar ca nu contine promisiuni pe care integrarea nu le poate tine.
   E chiar felul de greseala care se strecoara la a treia reparatie de interfata, cand
   cineva adauga un buton „Confirmă la Pepita" fiindca pare firesc sa existe.
*/

/**
 * Sursa panoului, FARA comentarii.
 *
 * ⚠ A CAZUT PE PROPRIUL MEU COMENTARIU la prima rulare: panoul explica, in comentariu, de ce
 * NU scrie „Conectat la Pepita”, iar scanarea a citit chiar explicatia drept incalcare. O
 * plasa care nu deosebeste codul de comentarii pedepseste tocmai nota care apara regula.
 */
const PANOU = readFileSync("src/components/dashboard/PepitaClient.tsx", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

test("⚠ panoul nu promite nicio actiune trimisa spre Pepita", () => {
  const interzise = [
    /Confirmă comanda la Pepita/i,
    /Trimite (AWB|statusul|factura) (la|către) Pepita/i,
    /Anulează la Pepita/i,
    /Sincroniz\w* cu Pepita/i,
    /Conectat la Pepita/i,
    /Pepita Sandbox/i,
  ];
  for (const r of interzise) {
    assert.ok(!r.test(PANOU), `panoul nu are voie sa contina ${r}`);
  }
});

test("⚠ panoul spune limpede ca statusul se opereaza si la ei", () => {
  assert.match(PANOU, /Pepita Admin/);
});

/* ══════════════════════════════════════════════════════════════════════════
   MESAJUL DE ACTIVARE
   ══════════════════════════════════════════════════════════════════════════ */

test("mesajul catre Pepita raspunde la tot ce cere Seller Center-ul lor", () => {
  const m = sablonMesajPepita({
    feedProduse: "https://www.edinio.com/api/pepita/produse/CHEIE.xml",
    feedStoc: "https://www.edinio.com/api/pepita/stoc/CHEIE.xml",
    comenzi: "https://www.edinio.com/api/pepita/comenzi/CHEIE2",
  });
  assert.ok(m.includes("https://www.edinio.com/api/pepita/produse/CHEIE.xml"));
  assert.ok(m.includes("https://www.edinio.com/api/pepita/stoc/CHEIE.xml"));
  assert.ok(m.includes("https://www.edinio.com/api/pepita/comenzi/CHEIE2"));
  /*
   * ⚠ Cele trei raspunsuri pe care le cer: variatii, cost de transport, termen de livrare.
   * Iar raspunsul la primul e „nu", fiindca aplatizam: crezand altceva, ar astepta structura
   * `<Variations>` si ar putea grupa gresit articolele.
   */
  assert.match(m, /NU conține produse cu variații/);
  assert.match(m, /transport/i);
  assert.match(m, /termen/i);
});
