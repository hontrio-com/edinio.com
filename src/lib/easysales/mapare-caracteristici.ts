import { normalizeaza } from "@/lib/emag/caracteristici";
import type { VariantCombo, VariantsData } from "@/lib/storefront/variants";
import { desparteTitlu } from "@/lib/storefront/variante-identitate";

/**
 * Caracteristicile unui articol, din trei surse (planul, §5.4.3):
 *
 *   1. axele variantelor (`page_sections.variants.options[].name`), cu valoarea combinatiei;
 *   2. specificatiile (`page_sections.specifications`, `{label, value}`);
 *   3. atributele Google (`page_sections.google`: culoare, marime, material, gen, grupa de varsta).
 *
 * ⚠ ORDINEA E PRECEDENTA. Aceeasi cheie din doua surse pleaca o singura data, cu valoarea celei mai
 * precise: axa variantei („Mărime: M" pe combinatie) bate specificatia produsului („Mărime: S-XL").
 *
 * ⚠ CHEIA SE NORMALIZEAZA cu aceeasi regula ca la eMAG (`normalizeaza`): fara diacritice, litere mici,
 * spatii stranse. „Mărime " si „MARIME" sunt aceeasi caracteristica, deci acelasi
 * `characteristic_website_id`; altfel lista lor s-ar umple de dubluri pe care comerciantul ar trebui
 * sa le mapeze de mana, de doua ori.
 *
 * ⚠ VALOAREA COMBINATIEI SE SCOATE CU `desparteTitlu`, nu cu `split(" / ")`: unele valori contin
 * separatorul („Alb / Crem"), iar o despartire gresita ar pune marimea in locul culorii.
 */

export interface CaracteristicaDorita {
  /** Cheia normalizata, unica pe magazin in `easysales_caracteristici`. */
  cheie: string;
  /** Numele de afisat la ei, cum l-a scris prima oara comerciantul. */
  nume: string;
  valoare: string;
}

/** Plafonul unei valori; lungimea lor nu e documentata, iar 191 e plafonul altor campuri ale lor. */
export const VALOARE_MAXIMA = 191;

export function cheiaCaracteristicii(nume: string): string {
  return normalizeaza(nume);
}

function curat(s: unknown): string {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
}

const NUME_GOOGLE: Record<string, string> = {
  color: "Culoare",
  size: "Mărime",
  material: "Material",
  gender: "Gen",
  age_group: "Grupă de vârstă",
};

/** Valorile Google sunt coduri in engleza; pe marketplace pleaca in romana. */
const VALORI_GOOGLE: Record<string, Record<string, string>> = {
  gender: { male: "Bărbați", female: "Femei", unisex: "Unisex" },
  age_group: { newborn: "Nou-născuți", infant: "Bebeluși", toddler: "Copii mici", kids: "Copii", adult: "Adulți" },
};

interface FormaPageSections {
  specifications?: unknown;
  google?: Record<string, unknown> | null;
}

/** Valorile axelor pentru o combinatie, pe ordinea optiunilor; `null` daca titlul nu se poate desparti sigur. */
export function valorileCombinatiei(variante: VariantsData, combo: VariantCombo): string[] | null {
  const optiuni = variante.options;
  if (optiuni.length === 1) return [combo.title];
  return desparteTitlu(combo.title, optiuni);
}

/**
 * Caracteristicile articolului, fara dubluri pe cheie.
 *
 * `axeNedespartite` e adevarat cand titlul combinatiei nu s-a putut desparti in valorile axelor:
 * atunci axele lipsesc (nu se ghicesc), iar apelantul spune omului.
 */
export function caracteristicileArticolului(
  pageSections: unknown, variante: VariantsData | null, combo: VariantCombo | null,
): { caracteristici: CaracteristicaDorita[]; axeNedespartite: boolean } {
  const out: CaracteristicaDorita[] = [];
  const vazute = new Set<string>();
  const adauga = (nume: string, valoare: string) => {
    const n = curat(nume);
    const v = curat(valoare).slice(0, VALOARE_MAXIMA);
    const cheie = cheiaCaracteristicii(n);
    if (!n || !v || !cheie || vazute.has(cheie)) return;
    vazute.add(cheie);
    out.push({ cheie, nume: n.slice(0, VALOARE_MAXIMA), valoare: v });
  };

  let axeNedespartite = false;
  if (variante && combo) {
    const valori = valorileCombinatiei(variante, combo);
    if (valori && valori.length === variante.options.length) {
      variante.options.forEach((o, i) => adauga(o.name, valori[i]));
    } else {
      axeNedespartite = true;
    }
  }

  const ps = (pageSections && typeof pageSections === "object" ? pageSections : {}) as FormaPageSections;
  if (Array.isArray(ps.specifications)) {
    for (const s of ps.specifications as { label?: unknown; value?: unknown }[]) {
      adauga(curat(s?.label), curat(s?.value));
    }
  }
  const g = ps.google && typeof ps.google === "object" ? ps.google : {};
  for (const [camp, nume] of Object.entries(NUME_GOOGLE)) {
    const brut = curat(g[camp]);
    if (!brut) continue;
    adauga(nume, VALORI_GOOGLE[camp]?.[brut.toLowerCase()] ?? brut);
  }
  return { caracteristici: out, axeNedespartite };
}
