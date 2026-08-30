/**
 * Completarea automată a atributelor de categorie Trendyol.
 *
 * Trendyol cere pe fiecare categorie un set de atribute, iar o bună parte dintre
 * ele nu au nicio legătură cu produsul: numele, adresa și e-mailul producătorului
 * și ale importatorilor sunt cerințe de conformitate (GPSR) și au ACEEAȘI valoare
 * pe toate produsele magazinului. Cerute produs cu produs, un catalog de o mie de
 * articole înseamnă mii de completări identice.
 *
 * Fișierul separă net două feluri de completări:
 *
 *  - **fapte** (`sursa: "firma"`) — datele firmei comerciantului. Nu există altă
 *    valoare corectă, deci se completează singure;
 *  - **presupuneri** (`sursa: "produs"`) — deduse din numele sau descrierea
 *    produsului. Se propun doar când sunt fără echivoc: dacă textul se potrivește
 *    cu două opțiuni, nu alegem niciuna.
 *
 * Nimic nu se trimite fără să treacă prin ochii comerciantului: sugestiile intră
 * în formular, unde le poate schimba.
 */

import type { TrendyolCategoryAttribute, TrendyolProductAttribute } from "./types";

export type SursaAtribut = "firma" | "produs";

export interface SugestieAtribut extends TrendyolProductAttribute {
  sursa: SursaAtribut;
  /**
   * Sugestia e o DEDUCTIE slaba, nu o certitudine.
   *
   * ⚠ Nu se aplica singura pe atributele OBLIGATORII. Un atribut obligatoriu
   * completat gresit nu produce o respingere — produce o listare care SE VINDE
   * cu date false, ceea ce e mai rau. Comerciantul o vede propusa si o confirma.
   */
  slaba?: boolean;
}

export interface DateFirma {
  nume: string;
  email: string | null;
  adresa: string | null;
  oras: string | null;
  judet: string | null;
  cui: string | null;
  tara: string;
}

export interface DateProdus {
  nume: string;
  descriere: string | null;
  brand: string | null;
  gtin: string | null;
  weightGrams: number | null;
}

export type ValoriAtribut = Record<number, { attributeValueId: number; attributeValue: string }[]>;

// ── Normalizare ───────────────────────────────────────────────────────────────

function normalizeaza(s: string): string {
  return s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function contine(text: string, ...bucati: string[]): boolean {
  return bucati.some((b) => text.includes(b));
}

// ── Fapte despre firmă ────────────────────────────────────────────────────────

function adresaCompleta(f: DateFirma): string | null {
  const parti = [f.adresa, f.oras, f.judet, f.tara].map((p) => (p ?? "").trim()).filter(Boolean);
  return parti.length > 0 ? parti.join(", ") : null;
}

/**
 * Valoarea care vine din datele firmei, dacă atributul cere așa ceva.
 *
 * Recunoaștem denumirile în română și engleză: nomenclatorul vine tradus după
 * vitrină, dar nu toate categoriile sunt traduse complet.
 */
function dinFirma(numeAtribut: string, f: DateFirma): string | null {
  const n = normalizeaza(numeAtribut);
  const desprePersoana = contine(n, "importator", "importer", "producator", "manufacturer", "fabricant");
  if (!desprePersoana) return null;

  if (contine(n, "e mail", "email", "mail")) return f.email;
  if (contine(n, "adres", "address")) return adresaCompleta(f);
  if (contine(n, "nume", "name", "denumire")) return f.nume;
  // „Informații privind importatorul" fără alt cuvânt-cheie: numele plus adresa
  // sunt exact ce cere reglementarea.
  if (contine(n, "informatii", "information", "details", "detalii")) {
    const a = adresaCompleta(f);
    return a ? `${f.nume}, ${a}` : f.nume;
  }
  return null;
}

// ── Presupuneri din produs ────────────────────────────────────────────────────

/** Măsura din numele produsului: „Gel de duș 250 ml" -> „250 ml". */
export function masuraDinText(text: string): string | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(ml|l|litri|litru|g|gr|kg|cm|mm|m|buc|bucati)\b/i);
  return m ? `${m[1].replace(",", ".")} ${m[2].toLowerCase()}` : null;
}

function dinProdus(numeAtribut: string, p: DateProdus): string | null {
  const n = normalizeaza(numeAtribut);
  if (contine(n, "origine", "origin", "made in", "tara de origine")) return "România";
  if (contine(n, "marca", "brand")) return p.brand;
  if (contine(n, "barcode", "gtin", "ean", "cod de bare")) return p.gtin;
  if (contine(n, "volum", "capacitate", "capacity", "gramaj", "cantitate")) {
    return masuraDinText(p.nume) ?? (p.descriere ? masuraDinText(p.descriere) : null);
  }
  if (contine(n, "greutate", "weight") && p.weightGrams && p.weightGrams > 0) {
    return `${p.weightGrams} g`;
  }
  return null;
}

// ── Potrivirea unei valori pe o listă cu opțiuni ──────────────────────────────

/**
 * Găsește opțiunea care corespunde textului.
 *
 * Doar potrivire exactă (după normalizare) sau o singură opțiune conținută în
 * text. Când se potrivesc mai multe, nu alegem: o valoare greșită trece de
 * validarea Trendyol și ajunge pe fișa publică a produsului.
 */
export function potrivesteValoare(
  text: string,
  optiuni: { attributeValueId: number; attributeValue: string }[],
): number | null {
  const t = normalizeaza(text);
  if (!t) return null;

  const exacte = optiuni.filter((o) => normalizeaza(o.attributeValue) === t);
  if (exacte.length === 1) return exacte[0].attributeValueId;
  if (exacte.length > 1) return null;

  const continute = optiuni.filter((o) => {
    const v = normalizeaza(o.attributeValue);
    return v.length >= 3 && ` ${t} `.includes(` ${v} `);
  });
  return continute.length === 1 ? continute[0].attributeValueId : null;
}

// ── Sugestiile ────────────────────────────────────────────────────────────────

/** Atributul e cerut de categorie? Trendyol il marcheaza in doua feluri, dupa versiune. */
function esteObligatoriu(a: TrendyolCategoryAttribute): boolean {
  const brut = a as TrendyolCategoryAttribute & { required?: boolean; isRequired?: boolean };
  return brut.required === true || brut.isRequired === true;
}

export function sugereazaAtribute(
  atribute: TrendyolCategoryAttribute[],
  valori: ValoriAtribut,
  firma: DateFirma,
  produs: DateProdus,
): SugestieAtribut[] {
  const textProdus = `${produs.nume} ${produs.descriere ?? ""}`;
  const out: SugestieAtribut[] = [];

  for (const a of atribute) {
    const id = a.attribute?.id;
    if (!id) continue;
    const optiuni = valori[id] ?? a.attributeValues?.map((v) => ({ attributeValueId: v.id, attributeValue: v.name })) ?? [];
    const areOptiuni = optiuni.length > 0;

    const fapt = dinFirma(a.attribute.name, firma);
    const presupunere = fapt === null ? dinProdus(a.attribute.name, produs) : null;
    const text = fapt ?? presupunere;
    const sursa: SursaAtribut = fapt !== null ? "firma" : "produs";

    if (text) {
      if (areOptiuni) {
        const valId = potrivesteValoare(text, optiuni);
        if (valId != null) { out.push({ attributeId: id, attributeValueId: valId, sursa }); continue; }
        // Fără opțiune potrivită, textul liber e acceptat doar dacă atributul îl permite.
        if (a.allowCustom) { out.push({ attributeId: id, customAttributeValue: text, sursa }); continue; }
      } else if (a.allowCustom !== false) {
        out.push({ attributeId: id, customAttributeValue: text, sursa });
        continue;
      }
    }

    /*
     * Ultima încercare, pentru atributele fără regulă: dacă exact O SINGURĂ
     * opțiune apare în numele sau descrierea produsului, e aproape sigur cea
     * corectă („Formular: Gel" pentru „Gel de duș"). Mai multe potriviri = nu
     * ghicim.
     *
     * ⚠ Pe un atribut OBLIGATORIU, deducția se marchează `slaba` și nu se aplică
     * singură. O potrivire unică tot poate fi greșită — „Negru" apare în „husă
     * neagră pentru telefon alb" — iar un obligatoriu greșit nu e respins de
     * Trendyol: se publică, se vinde, și ajunge pe fișa produsului.
     */
    if (areOptiuni && optiuni.length <= 200) {
      const valId = potrivesteValoare(textProdus, optiuni);
      if (valId != null) {
        out.push({
          attributeId: id, attributeValueId: valId, sursa: "produs",
          ...(esteObligatoriu(a) ? { slaba: true } : {}),
        });
      }
    }
  }
  return out;
}
