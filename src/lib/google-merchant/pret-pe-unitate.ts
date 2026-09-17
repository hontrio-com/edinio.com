/**
 * Pretul pe unitate pentru Google Merchant: `unitPricingMeasure` si `unitPricingBaseMeasure`.
 *
 * ═══ ⚠⚠ DE CE (17.09.2026) ═══
 *
 * Specificatia (`unit_pricing_measure`): „Certain products advertised on Shopping ads and free listings in
 * the EU ... must be displayed with unit price based on local regulations, and require this attribute.
 * This includes products sold by weight, volume, length, and area." Romania e in UE. Feedul nostru nu avea
 * campul deloc, iar Google il cerea pe productie: la `mokka`, 31 din 38 de produse aveau „Missing unit
 * pricing measure", pe fiecare destinatie.
 *
 * Comerciantul scrie cantitatea neta ca pe eticheta („750ml”, „2,5 kg”), iar aici se valideaza dupa
 * regulile oficiale. Ce nu respecta regulile NU pleaca: un atribut invalid respinge produsul, pe cand unul
 * lipsa doar il avertizeaza.
 */

const DIMENSIUNI: Record<string, string> = {
  oz: "greutate", lb: "greutate", mg: "greutate", g: "greutate", kg: "greutate",
  floz: "volum", pt: "volum", qt: "volum", gal: "volum", ml: "volum", cl: "volum", l: "volum", cbm: "volum",
  in: "lungime", ft: "lungime", yd: "lungime", cm: "lungime", m: "lungime",
  sqft: "suprafata", sqm: "suprafata",
  /* ⚠ `sheet` si `item` lipsesc dinadins: „only available in New Zealand and Australia”. */
  ct: "bucata",
};

export interface Masura { value: number; unit: string }

function desface(text: string | null | undefined): { numar: string; unitate: string } | null {
  const m = String(text ?? "").trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*([a-z]+)$/);
  if (!m) return null;
  return { numar: m[1].replace(",", "."), unitate: m[2] };
}

/** `unitPricingMeasure`: „Positive number plus unit”. */
export function masuraPretPeUnitate(text: string | null | undefined): Masura | null {
  const d = desface(text);
  if (!d || !DIMENSIUNI[d.unitate]) return null;
  const value = Number(d.numar);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, unit: d.unitate };
}

/** Doua masuri de acelasi fel (greutate cu greutate, volum cu volum). */
export function aceeasiDimensiune(a: Masura, b: Masura): boolean {
  return DIMENSIUNI[a.unit] !== undefined && DIMENSIUNI[a.unit] === DIMENSIUNI[b.unit];
}

/** Numitorii acceptati: intregii 1, 2, 4, 8, 10, 100, plus perechile 75cl, 750ml, 50kg, 1000kg. */
const INTREGI_BAZA = new Set([1, 2, 4, 8, 10, 100]);
const PERECHI_BAZA = new Set(["75cl", "750ml", "50kg", "1000kg"]);

/**
 * `unitPricingBaseMeasure`, numai daca e unul dintre numitorii acceptati si are ACEEASI dimensiune ca
 * masura (nu se compara grame cu litri). Fara o masura valida, numitorul n-are sens si nu pleaca.
 */
export function bazaPretPeUnitate(text: string | null | undefined, masura: Masura | null): Masura | null {
  if (!masura) return null;
  const d = desface(text);
  if (!d || !DIMENSIUNI[d.unitate]) return null;
  if (!/^\d+$/.test(d.numar)) return null;
  const value = Number(d.numar);
  if (!INTREGI_BAZA.has(value) && !PERECHI_BAZA.has(`${value}${d.unitate}`)) return null;
  if (DIMENSIUNI[d.unitate] !== DIMENSIUNI[masura.unit]) return null;
  return { value, unit: d.unitate };
}
