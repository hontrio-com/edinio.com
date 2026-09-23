import { test } from "node:test";
import assert from "node:assert/strict";
import { randurileDeBani, type BaniDinCont } from "./banii-comenzii";
import { formatPrice } from "@/lib/utils/format";

/*
 * BANII UNEI COMENZI DIN CONT AU NUME, SI SE ADUNA PANA LA TOTAL.
 *
 * ⚠ CE APARA. Ecranul punea tot ce nu stia sa numeasca pe „Alte ajustari”. Masurat
 * pe productie, 23.09.2026: 41 de comenzi de vitrina din 344 ar fi aratat asa, 38
 * dintre ele cu reducerea pentru plata cu cardul, pe care emailul de confirmare al
 * aceluiasi om o scria pe nume.
 *
 * Formele de mai jos sunt CHIAR comenzile masurate: cele sase ale contului de
 * proba de pe demo si trei forme de pe productie (reducerea pentru card, TVA
 * adaugat peste pret cu regim inghetat, comanda Medclean cu TVA-ul adunat de doua
 * ori).
 */

const CU_TVA_INCLUS = { vat_enabled: true, prices_include_vat: true };
const CU_TVA_ADAUGAT = { vat_enabled: true, prices_include_vat: false };

function comanda(p: Partial<BaniDinCont> & Pick<BaniDinCont, "linii" | "total">): BaniDinCont {
  return {
    vedere: "intreaga",
    subtotal: 0, transport: 0, reducere: 0, taxaRamburs: 0,
    reducereCard: 0, reducereRamburs: 0, codReducere: null,
    tva: 0, cotaTva: 0, regimTva: null,
    ...p,
  };
}

const linie = (pret: number, cantitate = 1, produsId: string | null = "de000000-0101-4000-8000-000000000001") =>
  ({ nume: "Produs", pret, cantitate, produsId });

const etichete = (r: { eticheta: string }[]) => r.map((x) => x.eticheta);
const valoare = (r: { eticheta: string; valoare: string }[], eticheta: string) =>
  r.find((x) => x.eticheta === eticheta)?.valoare;

/* ═══ Formele de pe demo ═══ */

test("⚠ #1352: reducerea pentru plata cu cardul are numele ei, nu „Alte ajustari”", () => {
  const r = randurileDeBani(comanda({
    linii: [linie(2490)], subtotal: 2490, reducereCard: 124.5,
    tva: 410.54, cotaTva: 21, regimTva: true, total: 2365.5,
  }), CU_TVA_INCLUS);
  assert.deepEqual(etichete(r), ["Produse", "Reducere plata cu cardul", "Transport", "TVA (21%) inclus"]);
  assert.equal(valoare(r, "Reducere plata cu cardul"), `- ${formatPrice(124.5)}`);
});

test("⚠ #1353: extraoptiunea sta in „Produse”, cuponul isi poarta codul, ramburs cu taxa", () => {
  const r = randurileDeBani(comanda({
    linii: [linie(579.9), linie(49), linie(15, 1, "extra_ambalaj-cadou")],
    subtotal: 628.9, reducere: 125.78, codReducere: "TOAMNA20", taxaRamburs: 9.99,
    tva: 91.66, cotaTva: 21, regimTva: true, total: 528.11,
  }), CU_TVA_INCLUS);
  assert.deepEqual(etichete(r), ["Produse", "Reducere (TOAMNA20)", "Taxa plata ramburs", "Transport", "TVA (21%) inclus"]);
  assert.equal(valoare(r, "Produse"), formatPrice(643.9), "extraoptiunea a iesit din „Produse”");
});

test("#1356: reducerea din oferta e deja in pretul liniilor, deci nu se mai scade o data", () => {
  const r = randurileDeBani(comanda({
    linii: [linie(35.1, 2), linie(175), linie(69), linie(0)],
    subtotal: 314.2, taxaRamburs: 9.99, tva: 56.26, cotaTva: 21, regimTva: true, total: 324.19,
  }), CU_TVA_INCLUS);
  assert.equal(etichete(r).includes("Alte ajustari"), false, JSON.stringify(r));
});

test("celelalte trei comenzi ale contului de proba se inchid fara rest", () => {
  const cazuri: [string, BaniDinCont][] = [
    ["#1355 locker, ramburs", comanda({ linii: [linie(89, 2), linie(79)], subtotal: 257, transport: 17.99, taxaRamburs: 9.99, tva: 49.46, cotaTva: 21, regimTva: true, total: 284.98 })],
    ["#1354 Netopia", comanda({ linii: [linie(349), linie(39, 4)], subtotal: 505, reducereCard: 25.25, tva: 83.26, cotaTva: 21, regimTva: true, total: 479.75 })],
    ["#1351 Klarna", comanda({ linii: [linie(39, 2)], subtotal: 78, transport: 19.99, reducereCard: 3.9, tva: 16.33, cotaTva: 21, regimTva: true, total: 94.09 })],
  ];
  for (const [nume, c] of cazuri) {
    const r = randurileDeBani(c, CU_TVA_INCLUS);
    assert.equal(etichete(r).includes("Alte ajustari"), false, `${nume}: ${JSON.stringify(r)}`);
  }
});

/* ═══ TVA-ul si regimul inghetat ═══ */

test("⚠ TVA adaugat peste pret (forma #0003 de pe productie) e un rand care se aduna", () => {
  const r = randurileDeBani(comanda({
    linii: [linie(338)], subtotal: 338, transport: 45, taxaRamburs: 20,
    tva: 84.63, cotaTva: 21, regimTva: false, total: 487.63,
  }), CU_TVA_ADAUGAT);
  assert.equal(valoare(r, "TVA (21%)"), formatPrice(84.63));
  assert.equal(etichete(r).includes("Alte ajustari"), false, JSON.stringify(r));
});

test("⚠⚠ regimul INGHETAT pe comanda bate setarea de azi a magazinului, in amandoua sensurile", () => {
  /* Comanda facuta cu TVA adaugat, magazinul trecut intre timp pe preturi cu TVA. */
  const adaugat = randurileDeBani(comanda({
    linii: [linie(338)], subtotal: 338, transport: 45, taxaRamburs: 20,
    tva: 84.63, cotaTva: 21, regimTva: false, total: 487.63,
  }), CU_TVA_INCLUS);
  assert.equal(valoare(adaugat, "TVA (21%)"), formatPrice(84.63), JSON.stringify(adaugat));
  assert.equal(etichete(adaugat).includes("Alte ajustari"), false, JSON.stringify(adaugat));

  /* Si invers: comanda cu TVA inclus, magazinul trecut pe TVA adaugat. */
  const inclus = randurileDeBani(comanda({
    linii: [linie(121)], subtotal: 121, tva: 21, cotaTva: 21, regimTva: true, total: 121,
  }), CU_TVA_ADAUGAT);
  assert.equal(valoare(inclus, "TVA (21%) inclus"), formatPrice(21), JSON.stringify(inclus));
  assert.equal(etichete(inclus).includes("Alte ajustari"), false, JSON.stringify(inclus));
});

test("fara regim inghetat (comenzile vechi) se cade pe setarea de azi", () => {
  const r = randurileDeBani(comanda({
    linii: [linie(121)], subtotal: 121, tva: 21, cotaTva: 21, regimTva: null, total: 121,
  }), CU_TVA_INCLUS);
  assert.equal(valoare(r, "TVA (21%) inclus"), formatPrice(21));
});

test("⚠ ce nu se explica ramane VAZUT: Medclean #0001, cu TVA-ul adunat de doua ori", () => {
  const r = randurileDeBani(comanda({
    linii: [linie(44)], subtotal: 44, tva: 7.64, cotaTva: 21, regimTva: null, total: 51.64,
  }), CU_TVA_INCLUS);
  assert.equal(valoare(r, "Alte ajustari"), formatPrice(7.64), JSON.stringify(r));
});

/* ═══ Vederea redusa ═══ */

test("⚠ vederea REDUSA nu primeste defalcare: suma liniilor si o diferenta fara detalii", () => {
  /* Baza intoarce NULL pe toti banii la vederea redusa. */
  const r = randurileDeBani({
    vedere: "redusa", linii: [linie(2490)], total: 2365.5,
    subtotal: null, transport: null, reducere: null, taxaRamburs: null,
    reducereCard: null, reducereRamburs: null, codReducere: null,
    tva: null, cotaTva: null, regimTva: null,
  }, CU_TVA_INCLUS);
  assert.deepEqual(etichete(r), ["Produse", "Transport, taxe si reduceri"]);
  assert.equal(valoare(r, "Transport, taxe si reduceri"), `- ${formatPrice(124.5)}`);
});

test("vederea redusa care se inchide din linii nu are al doilea rand", () => {
  const r = randurileDeBani({
    vedere: "redusa", linii: [linie(50, 2)], total: 100,
    subtotal: null, transport: null, reducere: null, taxaRamburs: null,
    reducereCard: null, reducereRamburs: null, codReducere: null,
    tva: null, cotaTva: null, regimTva: null,
  }, CU_TVA_ADAUGAT);
  assert.deepEqual(etichete(r), ["Produse"]);
});
