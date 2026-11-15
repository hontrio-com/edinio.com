import { primaPoza } from "@/lib/orders/miniaturi-produse";

/** Un rand din „produsele de pe marketplace”, cu produsul legat (`products(name, images)`). */
export type RandVitrina = {
  product_id: string | null;
  products: { name: string | null; images: unknown } | null;
};

/**
 * Pozele pentru banda „Pe … acum” din antetul paginilor de marketplace (`VitrinaMarketplace`).
 *
 * Prima poza a fiecarui produs, dupa aceeasi regula ca in comenzi (`primaPoza`), FARA DUBLURI: un produs
 * cu variante are cate un rand pe varianta, iar banda ar fi aratat aceeasi poza de trei ori. Produsele
 * fara poza se sar; cel mult `cate`.
 */
export function pozeleVitrinei(randuri: RandVitrina[] | null | undefined, cate = 6): { src: string; alt: string }[] {
  const vazute = new Set<string>();
  const poze: { src: string; alt: string }[] = [];
  for (const r of randuri ?? []) {
    if (!r.product_id || vazute.has(r.product_id)) continue;
    const src = primaPoza(r.products?.images);
    if (!src) continue;
    vazute.add(r.product_id);
    poze.push({ src, alt: r.products?.name ?? "Produs" });
    if (poze.length === cate) break;
  }
  return poze;
}
