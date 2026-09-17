import { findCombo, parseVariants } from "@/lib/storefront/variants";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE PRODUS ANUNTA UN EVENIMENT META, SPUS CU ID-UL DIN CATALOG
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE (17.09.2026). Specificatia catalogului: „For dynamic ads, this ID must exactly match the
  content ID for the same item in your Meta Pixel.” Catalogul nostru da fiecarei variante ID-ul
  `<produs>-<combinatie>` si leaga variantele cu `item_group_id = <produs>`, dar pixelul trimitea
  MEREU ID-ul produsului, cu `content_type: "product"`. Pentru un produs cu variante, niciun articol
  din catalog n-are ID-ul acela, deci Meta nu lega vizitatorul de nimic: reclamele dinamice pierdeau
  3047 din 3351 de produse la esafe si toate cele 113 la rallsro.

  Referinta pixelului, la `content_type`: „If the IDs being passed ... are IDs of products, then the value
  should be `product`. If product group IDs are being passed, then the value should be `product_group`. If
  no `content_type` is provided, Meta will match the event to every item that has the same ID, independent
  of its type.” Regulile de aici o urmeaza cuvant cu cuvant:

    - varianta CUNOSCUTA  -> ID-ul variantei, fel `product`;
    - produs cu variante, varianta NECUNOSCUTA (pagina inainte de alegere, o linie veche de cos) -> ID-ul
      produsului, care e `item_group_id`, fel `product_group`;
    - produs simplu -> ID-ul produsului, fel `product`;
    - felurile AMESTECATE in acelasi eveniment -> `content_type` LIPSESTE, iar Meta potriveste fiecare ID cu
      orice articol sau grup care il poarta. Un fel gresit ar fi spus lucruri false despre jumatate din cos.

  ⚠ Fisier curat, fara efecte si fara runtime: il citesc pagina (client), pagina de confirmare (server),
  Conversions API (server) si feedul catalogului. O singura definitie a ID-ului, altfel feedul si pixelul
  s-ar desparti la prima schimbare.
*/

/** Limita ID-ului in catalogul Meta: „Max character limit: 100”. */
const LUNGIME_ID = 100;

/** ID-ul articolului in catalogul Meta: al variantei, cand combinatia e cunoscuta, altfel al produsului. */
export function idArticolMeta(productId: string, comboId?: string | null): string {
  return comboId ? `${productId}-${comboId}`.slice(0, LUNGIME_ID) : productId;
}

/** ID-ul combinatiei cu titlul dat, din `page_sections` (doar combinatiile active). */
export function comboIdDupaTitlu(pageSections: unknown, titlu: string | null | undefined): string | null {
  if (!titlu) return null;
  const variante = parseVariants(pageSections);
  return variante ? (findCombo(variante, titlu)?.id ?? null) : null;
}

export interface LiniePixel {
  productId: string;
  /** ID-ul combinatiei alese, cand se stie. */
  comboId?: string | null;
  /** Produsul are variante. Fara `comboId`, linia se anunta ca GRUP. */
  areVariante?: boolean;
  cantitate: number;
  pret: number;
}

export interface ContinutPixel {
  content_ids: string[];
  contents: { id: string; quantity: number; item_price: number }[];
  content_type?: "product" | "product_group";
}

/**
 * Continutul unui cos, pentru `InitiateCheckout` si `AddPaymentInfo`.
 *
 * ⚠ Linia de cos stie TITLUL combinatiei, nu ID-ul ei (la 3222 de combinatii, ID-ul nu mai iese din titlu:
 * au fost redenumite). Deci linia cu varianta se anunta ca GRUP, cu ID-ul produsului, iar un cos amestecat
 * pleaca fara `content_type`. Achizitia, care are baza la indemana, trimite ID-urile exacte.
 */
export function continutDinCos(linii: readonly { productId: string; variantTitle?: string | null; quantity: number; pret: number }[]): ContinutPixel {
  return continutPixel(linii.map((l) => ({
    productId: l.productId, areVariante: !!l.variantTitle, cantitate: l.quantity, pret: l.pret,
  })));
}

/**
 * Titlul combinatiei vandute, citit din NUMELE liniei de comanda.
 *
 * ⚠ LINIILE DE VITRINA N-AU `variant_title` (masurat 17.09.2026: 0 din 173 de linii in 30 de zile; il au
 * doar comenzile de marketplace). Serverul coace varianta in nume, `${produs.name} (${titlu})`, si numai cu
 * o combinatie ACTIVA (`pretulLiniei`). Deci combinatia e cea al carei titlu inchide numele ca „ (titlu)”;
 * cea mai lunga castiga, iar „ (” din fata le desparte pe „S” de „XS”. Produsul redenumit intre timp nu
 * strica nimic: se potriveste doar coada.
 */
export function titluDinNumeleLiniei(nume: string | null | undefined, pageSections: unknown): string | null {
  const variante = parseVariants(pageSections);
  if (!variante || !nume) return null;
  let ales: string | null = null;
  for (const c of variante.combinations) {
    if (!c.enabled || !c.title || !nume.endsWith(` (${c.title})`)) continue;
    if (!ales || c.title.length > ales.length) ales = c.title;
  }
  return ales;
}

/**
 * Continutul unei COMENZI, cu ID-urile exacte din catalog: combinatia fiecarei linii se cauta dupa titlu
 * (`variant_title`, altfel cel din nume) in `page_sections` ale produsului, citite de apelant.
 *
 * ⚠ O SINGURA DEFINITIE pentru amandoua achizitiile: cea din browser (pagina de confirmare) si cea de pe
 * server (Conversions API). Meta le deduplica pe `event_id`, dar pastreaza continutul celei care ajunge
 * prima; doua calcule separate ar fi putut spune doua lucruri diferite despre aceeasi comanda.
 *
 * ⚠ Produsul care ARE variante, dar a carui combinatie nu se mai gaseste (stinsa sau redenumita de la
 * comanda), se anunta ca GRUP: ID-ul lui e `item_group_id` in catalog, nu un articol.
 */
export function continutComanda(
  linii: readonly { product_id?: string | null; name?: string | null; variant_title?: string | null; quantity?: number | null; price?: number | null }[],
  paginiSectiuni: ReadonlyMap<string, unknown>,
): ContinutPixel {
  return continutPixel(linii.filter((l) => !!l.product_id).map((l) => {
    const ps = paginiSectiuni.get(l.product_id!);
    const titlu = l.variant_title || titluDinNumeleLiniei(l.name, ps);
    return {
      productId: l.product_id!,
      comboId: comboIdDupaTitlu(ps, titlu),
      areVariante: !!l.variant_title || parseVariants(ps) !== null,
      cantitate: Number(l.quantity) || 1,
      pret: Number(l.price) || 0,
    };
  }));
}

export function continutPixel(linii: readonly LiniePixel[]): ContinutPixel {
  const feluri = new Set<"product" | "product_group">();
  const contents = linii.map((l) => {
    const eGrup = !l.comboId && !!l.areVariante;
    feluri.add(eGrup ? "product_group" : "product");
    return {
      id: idArticolMeta(l.productId, l.comboId),
      quantity: Math.max(1, Math.floor(Number(l.cantitate) || 1)),
      item_price: Math.round((Number(l.pret) || 0) * 100) / 100,
    };
  });
  const rezultat: ContinutPixel = { content_ids: [...new Set(contents.map((c) => c.id))], contents };
  if (feluri.size === 1) rezultat.content_type = [...feluri][0];
  return rezultat;
}
