/*
 * ═══════════════════════════════════════════════════════════════════════════
 * DE UNDE VINE VALOAREA UNUI ATRIBUT OLX
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pana azi maparea era o CONSTANTA pe categorie:
 *
 *     Categoria Edinio „Pantofi"  ->  OLX Brand = Nike
 *
 * Adica toti pantofii magazinului deveneau Nike. Pentru un catalog adevarat nu ajunge: brandul e
 * al produsului, marimea e a variantei, iar „Stare: nou" chiar e o constanta.
 *
 * ⚠ MAPARILE VECHI RAMAN VALABILE. Un sir sau o lista de siruri inseamna, ca pana acum, o
 * constanta. Nicio migratie de date, nicio zi in care maparea unui comerciant nu mai inseamna
 * nimic — iar cand deschide ecranul, o vede ca „Valoare fixa" si o poate schimba.
 *
 * ⚠ LANTUL CU REZERVA E CHIAR ROSTUL. `Brand` din campul produsului, si daca produsul n-are, din
 * specificatia „Producător", si daca nici aia, constanta „Altul". Fara rezerva, un singur produs
 * fara brand ar bloca publicarea intr-o categorie unde OLX cere atributul.
 *
 * Fisierul e PUR dinadins: nicio citire, nicio retea. Asa se poate proba direct, iar regula de
 * unde vine o valoare nu se afla scanand sursa.
 */

import type { MappableProduct } from "./mapping";
import type { OlxAttributeDef } from "./types";

/** De unde se ia valoarea unui atribut OLX. */
export type OlxLegaturaAtribut =
  /** O valoare scrisa de mana, aceeasi pentru toate produsele categoriei. */
  | { sursa: "constanta"; valoare: string | string[] }
  /** Un camp al produsului. */
  | { sursa: "camp"; camp: "brand" | "sku" | "gtin" | "nume" }
  /** O specificatie din editorul de produs (`page_sections.specifications`), dupa eticheta. */
  | { sursa: "specificatie"; eticheta: string }
  /** O optiune de varianta (`page_sections.variants.options`), dupa nume. */
  | { sursa: "varianta"; optiune: string };

/**
 * Ce s-a legat la un atribut OLX: o singura sursa, sau un LANT de rezerve.
 *
 * ⚠ `string | string[]` e forma VECHE, si ramane inteleasa: constanta.
 */
export type OlxMaparecAtribut = string | string[] | OlxLegaturaAtribut | OlxLegaturaAtribut[];

/* ── Citiri prudente din `page_sections` ─────────────────────────────────── */

function obiect(x: unknown): Record<string, unknown> | null {
  return x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

/** Specificatiile produsului: `[{ label, value }]`, oricat de stricat ar fi jsonb-ul. */
function specificatii(ps: unknown): { label: string; value: string }[] {
  const lista = obiect(ps)?.specifications;
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((r) => {
    const o = obiect(r);
    const label = typeof o?.label === "string" ? o.label : null;
    const value = typeof o?.value === "string" ? o.value : null;
    return label && value ? [{ label, value }] : [];
  });
}

/** Optiunile de varianta: `[{ name, values }]`. */
function optiuniVarianta(ps: unknown): { name: string; values: string[] }[] {
  const v = obiect(obiect(ps)?.variants);
  const lista = v?.options;
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((r) => {
    const o = obiect(r);
    const name = typeof o?.name === "string" ? o.name : null;
    const values = Array.isArray(o?.values) ? o.values.filter((x): x is string => typeof x === "string") : [];
    return name && values.length > 0 ? [{ name, values }] : [];
  });
}

function campulProdusului(produs: MappableProduct, camp: "brand" | "sku" | "gtin" | "nume"): string | null {
  if (camp === "nume") return produs.name || null;
  const google = obiect(obiect(produs.page_sections)?.google);
  if (camp === "brand") return typeof google?.brand === "string" ? google.brand : null;
  if (camp === "gtin") return typeof google?.gtin === "string" ? google.gtin : null;
  /* `sku` n-are coloana in `MappableProduct`; sta tot in sectiuni la produsele fara variante. */
  const sku = obiect(produs.page_sections)?.sku;
  return typeof sku === "string" ? sku : null;
}

/* ── Rezolvarea ──────────────────────────────────────────────────────────── */

function dinLegatura(l: OlxLegaturaAtribut, produs: MappableProduct): string | string[] | null {
  if (l.sursa === "constanta") {
    const v = l.valoare;
    if (Array.isArray(v)) return v.length > 0 ? v : null;
    return v.trim() ? v : null;
  }
  if (l.sursa === "camp") return campulProdusului(produs, l.camp);
  if (l.sursa === "specificatie") {
    /* ⚠ Potrivire fara diacritice si fara majuscule: etichetele le scrie omul, iar „Culoare" si
       „culoare" sunt acelasi lucru pentru el. */
    const cheie = normalizeaza(l.eticheta);
    const gasit = specificatii(produs.page_sections).find((s) => normalizeaza(s.label) === cheie);
    return gasit?.value.trim() || null;
  }
  const cheie = normalizeaza(l.optiune);
  const opt = optiuniVarianta(produs.page_sections).find((o) => normalizeaza(o.name) === cheie);
  return opt ? opt.values : null;
}

/** Fara diacritice, fara majuscule, fara spatii la capete. */
export function normalizeaza(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/**
 * Valoarea unui atribut OLX pentru un produs anume. `undefined` = n-avem ce trimite.
 *
 * ⚠ LANTUL SE PARCURGE IN ORDINE, si prima sursa care da ceva castiga. Ordinea e a omului, scrisa
 * in ecran: el stie daca „Brand" se ia mai intai din campul produsului sau din specificatii.
 */
export function rezolvaAtribut(
  mapare: OlxMaparecAtribut, produs: MappableProduct,
): string | string[] | undefined {
  /* Forma VECHE: un sir sau o lista inseamna constanta. */
  if (typeof mapare === "string") return mapare.trim() || undefined;
  if (Array.isArray(mapare) && (mapare.length === 0 || typeof mapare[0] === "string")) {
    const v = mapare as string[];
    return v.length > 0 ? v : undefined;
  }
  const lant = Array.isArray(mapare) ? (mapare as OlxLegaturaAtribut[]) : [mapare as OlxLegaturaAtribut];
  for (const l of lant) {
    const v = dinLegatura(l, produs);
    if (v != null && (!Array.isArray(v) || v.length > 0)) return v;
  }
  return undefined;
}

/** Toate atributele categoriei, rezolvate pentru produsul asta. */
export function rezolvaAtributele(
  mapari: Record<string, OlxMaparecAtribut> | undefined, produs: MappableProduct,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [cod, mapare] of Object.entries(mapari ?? {})) {
    const v = rezolvaAtribut(mapare, produs);
    if (v !== undefined) out[cod] = v;
  }
  return out;
}

/* ── Validarea, dupa regulile LOR ────────────────────────────────────────── */

/**
 * Ce nu e in regula cu valoarea trimisa, dupa schema atributului.
 *
 * ═══ SE VERIFICA TOT CE NE-AU SPUS, NU DOAR „OBLIGATORIU" (01.09.2026) ═══
 *
 * Schema lor poarta `values[]`, `numeric`, `min`, `max`, `allow_multiple_values` — si le foloseam
 * numai pe `required`. Deci o valoare care nu e in lista lor, sau un numar sub minim, pleca la ei
 * si se intorcea ca refuz, la publicare, pe produsul comerciantului. O verificare pe care o putem
 * face aici, inainte, il scuteste de o cursa pe care n-are cum s-o inteleaga.
 *
 * ⚠ Se compara pe CODURI, nu pe etichete: `values[].code` e ce accepta ei, `label` e ce vede omul.
 */
export function nuSePotriveste(def: OlxAttributeDef, valoare: string | string[]): string | null {
  const val = def.validation ?? {};
  const multe = Array.isArray(valoare);

  if (multe && !val.allow_multiple_values) {
    return `„${def.label}" primește o singură valoare.`;
  }
  const bucati = multe ? valoare : [valoare];
  if (bucati.length === 0) return null;

  if (Array.isArray(def.values) && def.values.length > 0) {
    const permise = new Set(def.values.map((v) => v.code));
    const strain = bucati.find((b) => !permise.has(b));
    if (strain !== undefined) {
      return `„${strain}" nu e o valoare acceptată pentru „${def.label}".`;
    }
    return null;
  }

  if (val.numeric) {
    for (const b of bucati) {
      const n = Number(String(b).replace(",", "."));
      if (!Number.isFinite(n)) return `„${def.label}" trebuie să fie un număr.`;
      if (val.min != null && n < val.min) return `„${def.label}" trebuie să fie cel puțin ${val.min}.`;
      const max = typeof val.max === "string" ? Number(val.max) : val.max;
      if (max != null && Number.isFinite(max) && n > max) {
        return `„${def.label}" trebuie să fie cel mult ${max}.`;
      }
    }
  }
  return null;
}

/** Toate neregulile unui set de valori fata de schema categoriei. */
export function nereguliAtribute(
  definitii: OlxAttributeDef[], valori: Record<string, string | string[]>,
): string[] {
  const dupaCod = new Map(definitii.map((d) => [d.code, d]));
  const out: string[] = [];
  for (const [cod, v] of Object.entries(valori)) {
    const def = dupaCod.get(cod);
    /*
     * ⚠ Un atribut care nu mai exista in schema LOR nu e o greseala a omului — e nomenclatorul care
     * s-a schimbat sub maparea lui. Se spune, ca sa poata reface maparea, dar se spune altfel.
     */
    if (!def) { out.push(`Atributul „${cod}" nu mai există în categoria OLX. Reface maparea.`); continue; }
    const nereg = nuSePotriveste(def, v);
    if (nereg) out.push(nereg);
  }
  return out;
}

/**
 * „Are atributul asta o sursa?", in forma pe care o asteapta `atributeObligatoriiLipsa`.
 *
 * ⚠ La SALVAREA maparii nu exista un produs anume, deci nu se poate sti ce valoare va iesi. Se
 * verifica doar ca legatura EXISTA. Daca ea nu da nimic pentru un produs, aflam la publicare — si
 * atunci mesajul e despre produsul acela, nu despre mapare.
 */
export function legatoriDeAtribute(
  mapari: Record<string, OlxMaparecAtribut> | undefined,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [cod, m] of Object.entries(mapari ?? {})) {
    if (typeof m === "string") { if (m.trim()) out[cod] = m; continue; }
    if (Array.isArray(m) && (m.length === 0 || typeof m[0] === "string")) {
      const v = m as string[];
      if (v.length > 0) out[cod] = v;
      continue;
    }
    const lant = Array.isArray(m) ? (m as OlxLegaturaAtribut[]) : [m as OlxLegaturaAtribut];
    if (lant.length > 0) out[cod] = "(sursă)";
  }
  return out;
}
