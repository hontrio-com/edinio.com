import assert from "node:assert/strict";
import { test } from "node:test";
import { eroareVarianta, pretulLiniei, type ProdusPentruLinie } from "./variant-guard";

/**
 * O varianta scoasa din vanzare intra in comanda la pretul de baza, iar un produs
 * cu variante putea fi comandat fara nicio varianta — tot la pretul de baza.
 *
 * GEACA COOL TREND N: combinatie activa 116,00, baza 92,80. ANTIFOANE INT UF
 * REFILL: combinatie 438,00, baza 156,80 — 281,20 lei pe bucata, cu linia pe
 * factura fara nicio marime, pe care comerciantul n-are cum sa o expedieze.
 * In productie: 4942 de combinatii dezactivate pe 751 de produse active, 431 cu
 * pret propriu diferit de baza.
 */

const variabil = (combinations: unknown[]): ProdusPentruLinie => ({
  name: "GEACA COOL TREND N",
  price: 92.8,
  page_sections: {
    variants: {
      enabled: true,
      options: [{ id: "o1", name: "Marime", values: ["S", "M"] }],
      combinations,
    },
  },
});
const simplu: ProdusPentruLinie = { name: "Prosop", price: 19.99, page_sections: null };

test("produsul simplu se pretuieste la pretul lui", () => {
  assert.deepEqual(pretulLiniei(simplu), { fel: "ok", unitPrice: 19.99, nume: "Prosop" });
});

test("varianta activa isi da pretul EI si isi coace numele in linie", () => {
  const r = pretulLiniei(variabil([{ title: "S", enabled: true, price: 116 }]), "S");
  assert.deepEqual(r, { fel: "ok", unitPrice: 116, nume: "GEACA COOL TREND N (S)" });
});

test("varianta DEZACTIVATA nu cade pe pretul de baza", () => {
  // Asta e defectul: linia intra la 92,80 purtand numele unei marimi scoase din
  // vanzare, iar verificarea de stoc n-o prinde (sare peste combinatiile stinse).
  const r = pretulLiniei(variabil([{ title: "S", enabled: false, price: 116 }]), "S");
  assert.equal(r.fel, "eroare");
});

test("varianta care nu exista deloc se refuza", () => {
  const r = pretulLiniei(variabil([{ title: "S", enabled: true, price: 116 }]), "XXL");
  assert.equal(r.fel, "eroare");
});

test("produsul cu variante trimis FARA varianta se refuza", () => {
  // Formularul nu lasa asta sa se intample, dar amandoua actiunile de comanda
  // sunt exporturi „use server", adica endpointuri publice.
  const p = variabil([{ title: "S", enabled: true, price: 438 }]);
  for (const gol of [undefined, null, "", "   "]) {
    assert.equal(pretulLiniei(p, gol).fel, "eroare", JSON.stringify(gol));
  }
});

test("titlu de varianta pe un produs FARA variante: tot refuz", () => {
  // Comerciantul le-a stins intre timp. Pretuita la baza, comanda ar purta o
  // marime care nu exista in catalog.
  assert.equal(pretulLiniei(simplu, "S").fel, "eroare");
});

test("combinatia fara pret propriu cade pe pretul produsului, ca la comanda", () => {
  const r = pretulLiniei(variabil([{ title: "S", enabled: true, price: "" }]), "S");
  assert.deepEqual(r, { fel: "ok", unitPrice: 92.8, nume: "GEACA COOL TREND N (S)" });
});

test("titlul NU se normalizeaza: stocul il cauta exact asa cum vine", () => {
  // `eroareStocPeVarianta` si scaderea pe combinatie cheie pe sirul brut. Taiat
  // doar aici, „ S " ar trece garda si s-ar pretui corect, dar stocul l-ar cauta
  // sub alt titlu: o marime pusa pe zero ar redeveni comandabila.
  assert.equal(pretulLiniei(variabil([{ title: "S", enabled: true, price: 116 }]), " S ").fel, "eroare");
});

test("titlul de la client nu intra nemarginit in mesaj, deci nici in jurnal", () => {
  const r = pretulLiniei(variabil([{ title: "S", enabled: true, price: 116 }]), "X".repeat(5000));
  assert.equal(r.fel, "eroare");
  assert.ok(String((r as { error: string }).error).length < 200);
});

test("la titluri duplicate conteaza PRIMA, ca peste tot", () => {
  const r = pretulLiniei(variabil([
    { title: "S", enabled: true, price: 203 },
    { title: "S", enabled: true, price: 231 },
  ]), "S");
  assert.deepEqual(r, { fel: "ok", unitPrice: 203, nume: "GEACA COOL TREND N (S)" });
});

/* ─── Verdictul pe o comanda intreaga ──────────────────────────────────────── */

const catalog = new Map<string, ProdusPentruLinie>([
  ["p1", variabil([{ title: "S", enabled: true, price: 116 }])],
  ["p2", simplu],
]);

test("o comanda curata nu produce nicio eroare", () => {
  assert.equal(eroareVarianta(catalog, [
    { product_id: "p1", variant_title: "S" },
    { product_id: "p2" },
  ]), null);
});

test("o singura linie stricata opreste comanda, si spune care", () => {
  const e = eroareVarianta(catalog, [{ product_id: "p2" }, { product_id: "p1", variant_title: "XXL" }]);
  assert.match(String(e), /XXL/);
});

test("produsul care nu e in catalog nu e treaba garzii asteia", () => {
  // Are poarta lui, cu alt mesaj („nu mai este disponibil"). Aici un refuz
  // inventat ar ascunde cauza adevarata.
  assert.equal(eroareVarianta(catalog, [{ product_id: "strain", variant_title: "S" }]), null);
});
