import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Amandoua caile de comanda repretuiesc configuratia?
 *
 * ═══ ⚠ DE CE O PROBA PE SURSA, SI NU UNA DE COMPORTAMENT ═══
 *
 * `placeOrder` si `placeCartOrder` sunt doua functii de peste o mie de randuri fiecare, cu baza
 * de date, cotatii de transport, cupoane si oferte in mijloc. O proba de comportament ar fi cerut
 * toate astea. Dar intrebarea la care raspundem aici e mica si nu are nevoie de ele: TRECE oare
 * fiecare cale prin repretuire, si REFUZA cand raspunsul nu e bun?
 *
 * ⚠ SUNT DOUA CAI SCRISE SEPARAT, SI AU DIVERGIT DEJA. Proiectul are scris, in chiar fisierul
 * asta de actiuni, ca verificarea de stoc pe varianta exista doar pe una dintre ele, si ca
 * treptele de cantitate erau onorate doar de cealalta. O regula noua pusa intr-una singura e
 * felul obisnuit in care se strica lucrurile aici.
 *
 * ═══ CE PAZESTE ═══
 *
 *   1. Fiecare cale cheama `repretuiesteLinii`.
 *   2. Fiecare cale REFUZA linia respinsa, nu o duce mai departe la pretul de baza.
 *   3. Fiecare cale cere `category` din catalog — fara ea, mostenirea din categorie nu se rezolva
 *      si produsul pare ca n-are configurator.
 *   4. Fiecare cale scrie instantaneul configuratiei in linia comenzii.
 *   5. Liniile configurate NU trec prin treptele de cantitate.
 */

const FISIER = path.resolve(process.cwd(), "src/lib/actions/order.actions.ts");

/** ⚠ Terminatiile se normalizeaza: pe Windows git scrie CRLF, iar potrivirile pe rand cad tacut. */
function sursa(): string {
  return readFileSync(FISIER, "utf8").replace(/\r\n/g, "\n");
}

/** Corpul unei actiuni, de la semnatura pana la urmatorul export de nivel zero. */
function corpul(nume: string): string {
  const s = sursa();
  const start = s.indexOf(`export async function ${nume}(`);
  assert.ok(start > 0, `nu am gasit ${nume}`);
  const urmator = s.indexOf("\nexport ", start + 10);
  const corp = s.slice(start, urmator > 0 ? urmator : s.length);
  // ⚠ Garda de marime: o cautare care s-a rupt ar fi intors cateva randuri, si toate potrivirile
  // de mai jos ar fi cazut pe gol.
  assert.ok(corp.length > 5000, `am citit doar ${corp.length} caractere din ${nume} — cititorul s-a rupt`);
  return corp;
}

const CAI = ["placeOrder", "placeCartOrder"];

test("AMANDOUA caile de comanda repretuiesc configuratia pe server", () => {
  for (const cale of CAI) {
    assert.ok(
      corpul(cale).includes("await repretuiesteLinii("),
      `${cale} nu repretuieste configuratiile: ar incasa pretul trimis de browser`,
    );
  }
});

test("AMANDOUA REFUZA linia respinsa, nu o vand la pretul de baza", () => {
  /*
   * ⚠ Pe vitrina, orice necaz inseamna „produsul se vinde simplu" — o pagina cazuta e mai rea.
   * Aici e invers: dusa mai departe la pretul de baza, linia ar fi dat gratis tot ce a configurat
   * cumparatorul, iar atelierul ar fi primit o comanda fara specificatie.
   */
  for (const cale of CAI) {
    const c = corpul(cale);
    assert.match(
      c,
      /fel === "refuz"/,
      `${cale} nu se uita niciodata la un refuz de configuratie`,
    );
    assert.match(
      c,
      /configuratieRespinsa/,
      `${cale} nu jurnalizeaza refuzul, deci nimeni n-ar afla de ce cad comenzile`,
    );
  }
});

test("AMANDOUA cer `category` din catalog", () => {
  /*
   * ⚠ Un configurator legat de o categorie se mosteneste prin NUMELE ei. Fara coloana, produsul
   * ar fi parut ca n-are configurator si s-ar fi vandut la pretul de baza cu tot ce a configurat
   * clientul — si nimic n-ar fi cazut, fiindca „fara configurator" e un raspuns legitim.
   */
  for (const cale of CAI) {
    /*
     * ⚠ TOATE citirile de produse, nu una singura. `placeOrder` are doua — produsul din formular
     * si cele purtate din cos — iar o proba care se multumeste cu prima trece si cand a doua a
     * pierdut coloana. (Chiar asa a si supravietuit primul mutant scris pentru proba asta.)
     */
    const selecturi = [...corpul(cale).matchAll(/\.select\("([^"]*page_sections[^"]*)"\)/g)]
      .map((m) => m[1]);
    assert.ok(selecturi.length >= 1, `${cale} n-are nicio citire de produse — cititorul s-a rupt`);
    for (const s of selecturi) {
      assert.ok(s.includes("category"), `${cale} citeste produse fara categorie: ${s}`);
    }
  }
});

test("AMANDOUA scriu instantaneul configuratiei in linia comenzii", () => {
  // Atelierul citeste comanda, nu configuratorul. Vezi `rezumat.ts`.
  for (const cale of CAI) {
    const c = corpul(cale);
    assert.ok(c.includes("configuratie: {"), `${cale} nu scrie instantaneul`);
    for (const camp of ["configuratorId:", "versiuneId:", "numarVersiune:", "amprenta:", "valori:", "rezumat:"]) {
      assert.ok(c.includes(camp), `${cale} scrie instantaneul fara ${camp}`);
    }
  }
});

test("liniile CONFIGURATE nu trec prin treptele de cantitate", () => {
  /*
   * ⚠ Treptele sunt preturi de PACHET scrise pentru produsul din catalog: „3 bucati 250 lei".
   * Aplicate peste o configuratie de 300 de lei bucata, trei bucati configurate s-ar fi vandut cu
   * 250 — adica pretul pachetului simplu, cu toata configurarea pe gratis.
   */
  for (const cale of CAI) {
    assert.match(
      corpul(cale),
      /cfg\.fel === "ok"\s*\n?\s*\?\s*\{\s*unitPrice: cfg\.unitar \}/,
      `${cale} lasa treptele sa se aplice peste o configuratie`,
    );
  }
});

test("pretul cerut de client NU se citeste cand linia e configurata", () => {
  /*
   * `authoritativeSubtotal` potriveste pretul cerut cu unul dintre preturile legitime din catalog.
   * Pretul unei configuratii nu e niciunul dintre ele, deci calea aceea nu doar ca n-ar fi ajutat
   * — ar fi refuzat orice comanda configurata.
   */
  const c = corpul("placeOrder");
  assert.match(
    c,
    /cfgPrincipal\.fel === "ok"\s*\n?\s*\?\s*round2\(cfgPrincipal\.unitar \* cantitate\)/,
    "pretul liniei principale configurate nu se calculeaza pe server",
  );
});
