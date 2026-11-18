/**
 * Identitatea produselor si a variantelor la theMarketer: O SINGURA definitie, folosita de feed, de
 * evenimentele din browser (cos, comanda) si de comenzile trimise de server.
 *
 * ═══ DE CE CONTEAZA ═══
 *
 * theMarketer leaga o comanda de produsele din catalog dupa `product_id` + `variation_sku`, iar un
 * „adaugat in cos” dupa `product_id` + `variation.id`/`variation.sku`. Un singur loc care ar scrie altfel
 * (feedul cu SKU-ul combinatiei, cosul cu titlul ei) ar face ca recomandarile si cosul abandonat sa nu-si
 * mai gaseasca produsul, fara nicio eroare nicaieri.
 *
 * ═══ CE SE FOLOSESTE SI DE CE ═══
 *
 * - produsul: id-ul lui (UUID), care exista peste tot si nu se schimba;
 * - SKU-ul produsului simplu: `products.sku`, altfel id-ul (feedul cere `sku` obligatoriu);
 * - ID-ul variantei: id-ul produsului + titlul combinatiei, curatat. Cosul din browser stie DOAR titlul
 *   (`CartItem.variantTitle`), nu `combo.id`, deci identitatea nu poate depinde de nimic altceva;
 * - SKU-ul variantei: cel scris de comerciant pe combinatie, altfel ID-ul variantei. Cosul il stie
 *   (`CartItem.variantSku`), comanda il gaseste in `page_sections`.
 *
 * ⚠ Fara `server-only`: o folosesc si componentele din vitrina.
 */

/** Titlul combinatiei ca segment: fara diacritice, litere mici, cratime. Determinist. */
export function slugTitluVarianta(titlu: string): string {
  return titlu
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** ID-ul variantei: `<id produs>-<titlu curatat>`. Pentru un titlu care nu lasa nimic, id-ul produsului. */
export function idVariantaTM(productId: string, titluVarianta: string): string {
  const slug = slugTitluVarianta(titluVarianta);
  return slug ? `${productId}-${slug}` : productId;
}

/** SKU-ul variantei: al combinatiei cand comerciantul l-a scris, altfel ID-ul variantei. */
export function skuVariantaTM(productId: string, titluVarianta: string, skuCombinatie?: string | null): string {
  const scris = (skuCombinatie ?? "").trim();
  return scris || idVariantaTM(productId, titluVarianta);
}

/** SKU-ul produsului (simplu sau parinte): `products.sku`, altfel id-ul. */
export function skuProdusTM(productId: string, skuProdus?: string | null): string {
  const scris = (skuProdus ?? "").trim();
  return scris || productId;
}

/**
 * `variation_sku` al unei linii de comanda: SKU-ul variantei cand linia are una, altfel SKU-ul produsului.
 * ⚠ Aceeasi regula si in browser (`__sm__order`) si pe server (`save_order`, feedul de comenzi).
 */
export function skuLinieTM(a: {
  productId: string;
  skuProdus?: string | null;
  titluVarianta?: string | null;
  skuCombinatie?: string | null;
}): string {
  const titlu = (a.titluVarianta ?? "").trim();
  return titlu ? skuVariantaTM(a.productId, titlu, a.skuCombinatie) : skuProdusTM(a.productId, a.skuProdus);
}
