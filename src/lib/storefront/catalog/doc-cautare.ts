import { COD_MIN, compactCod, type SearchableProduct } from "@/lib/storefront/product-search";
import type { StorefrontProduct } from "@/lib/storefront/product.types";

/**
 * Ce anume din produs intra in cautare.
 *
 * DE CE EXISTA FISIERUL ASTA. Aceeasi transformare era scrisa in DOUA locuri, si
 * cele doua nu spuneau acelasi lucru: grila din `MiniStoreRenderer` includea
 * valorile de varianta, iar panoul de sub caseta de cautare (`RezultateCautare`)
 * nu — desi comentariul lui promitea literal „un singur motor de cautare ca
 * grila". Deci „Rosu" gasea in grila si nu gasea in panou, pentru acelasi
 * magazin. Cu palierul server apare si un al treilea apelant, care ruleaza in
 * Node peste candidatii din SQL; a treia copie ar fi facut divergenta certa.
 *
 * Ponderile si regulile de potrivire NU sunt aici — alea stau in
 * `product-search.ts` si nu se ating. Aici se decide doar CE CAMPURI se dau
 * motorului, si asta trebuie sa fie un singur raspuns.
 */

type PageSectionsVariante = {
  variants?: { enabled?: boolean; options?: { name: string; values: string[] }[] };
} | null;

/**
 * Valorile de varianta ale produsului, ca text.
 *
 * Doar cand variantele sunt PORNITE: un produs cu variante dezactivate isi
 * pastreaza opțiunile in `page_sections`, iar cautarea in ele ar fi gasit produse
 * dupa o marime care nu se poate cumpara.
 */
function valoriDeVarianta(pageSections: StorefrontProduct["page_sections"]): string[] | undefined {
  const ps = pageSections as PageSectionsVariante;
  if (!ps?.variants?.enabled) return undefined;
  const valori = (ps.variants.options ?? []).flatMap((o) =>
    Array.isArray(o?.values) ? o.values.map(String) : [],
  );
  return valori.length > 0 ? valori : undefined;
}

/** Cate coduri tine un produs. eSAFE are pana la ~150 de combinatii pe produs. */
const CODURI_MAX = 400;

/**
 * Codurile dupa care se gaseste un produs: SKU-ul lui si al fiecarei variante ACTIVE.
 *
 * Variantele dezactivate (sau toate, cand variantele sunt oprite) nu intra, din acelasi
 * motiv ca la `valoriDeVarianta`: n-ai ce cumpara dupa codul lor. Le calculeaza
 * proiectorul, din `page_sections` INTREG; dupa slimuire combinatiile nu mai exista.
 */
export function coduriDeCautare(sku: unknown, pageSections: unknown): string[] {
  const brute: unknown[] = [sku];
  const v = (pageSections as {
    variants?: { enabled?: boolean; combinations?: { sku?: unknown; enabled?: boolean }[] };
  } | null)?.variants;
  if (v?.enabled && Array.isArray(v.combinations)) {
    for (const c of v.combinations) {
      if (c && c.enabled !== false) brute.push(c.sku);
    }
  }
  const out = new Set<string>();
  for (const b of brute) {
    if (typeof b !== "string") continue;
    const c = compactCod(b);
    if (c.length >= COD_MIN) out.add(c);
    if (out.size >= CODURI_MAX) break;
  }
  return [...out];
}

/** Produsul, redus la campurile pe care le indexeaza motorul de cautare. */
export function documentDeCautare(p: StorefrontProduct): SearchableProduct {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    /*
     * Descrierea e cea SCURTA, taiata la 300 de caractere.
     *
     * Asa a fost dintotdeauna in lista (vezi `descriereDeCautare`), iar acum vine
     * gata taiata din proiectie. Conteaza sa fie acelasi text si pe server: cu
     * descrierea INTREAGA, un cuvant aflat la caracterul 900 ar fi gasit produsul
     * pe palierul server si nu pe cel client.
     */
    description: p.description,
    optionValues: valoriDeVarianta(p.page_sections),
    codes: p.coduri,
  };
}
