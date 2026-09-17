import { idArticolMeta, comboIdDupaTitlu, titluDinNumeleLiniei } from "@/lib/facebook/pixel-continut";
import { parseVariants } from "@/lib/storefront/variants";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE PRODUS ANUNTA UN EVENIMENT TIKTOK
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ ACELEASI ID-URI CA IN CATALOG, ca la Meta. TikTok, la `content_ids`: „We recommend using sku_id or
  item_group_id that matches the sku_id or item_group_id you set up in the catalog”. Catalogul de produse
  (Video Shopping Ads) se face din acelasi feed ca al Meta, deci ID-ul articolului e acelasi:
  `<produs>-<combinatie>` pentru varianta, `<produs>` pentru grup. Definitia sta intr-un singur loc
  (`pixel-continut.ts`), ca sa nu se desparta cele doua drumuri.

  ⚠ `content_type` STA LANGA EVENIMENT, nu in `contents`. Exemplul lor:

      ttq.track('AddToCart', { contents: [{ content_id, content_name, price, quantity }],
                               content_type: 'product', value, currency });

  Forma de dinainte punea `content_type` in fiecare articol din `contents`, unde TikTok nu-l citeste, iar
  evenimentul pleca fara felul continutului.

  ⚠ SI `content_ids`, pe langa `contents`: „This field is required for Video Shopping Ads (VSA)”.

  ⚠ Felul se OMITE cand cosul amesteca articole cu grupuri, exact ca la Meta: enumerarea lor are doar
  `product` si `product_group`, iar un fel gresit ar minti despre jumatate din cos.
*/

export interface LinieTikTok {
  productId: string;
  comboId?: string | null;
  areVariante?: boolean;
  cantitate: number;
  pret: number;
  nume?: string | null;
}

export interface ContinutTikTok {
  contents: { content_id: string; content_name?: string; price: number; quantity: number }[];
  content_ids: string[];
  content_type?: "product" | "product_group";
}

export function continutTikTok(linii: readonly LinieTikTok[]): ContinutTikTok {
  const feluri = new Set<"product" | "product_group">();
  const contents = linii.map((l) => {
    const eGrup = !l.comboId && !!l.areVariante;
    feluri.add(eGrup ? "product_group" : "product");
    const nume = l.nume?.trim();
    return {
      content_id: idArticolMeta(l.productId, l.comboId),
      ...(nume ? { content_name: nume.slice(0, 200) } : {}),
      price: Math.round((Number(l.pret) || 0) * 100) / 100,
      quantity: Math.max(1, Math.floor(Number(l.cantitate) || 1)),
    };
  });
  const rezultat: ContinutTikTok = { contents, content_ids: [...new Set(contents.map((c) => c.content_id))] };
  if (feluri.size === 1) rezultat.content_type = [...feluri][0];
  return rezultat;
}

/** Continutul unui cos: linia stie titlul combinatiei, nu ID-ul ei, deci se anunta ca GRUP. Vezi `continutDinCos`. */
export function continutTikTokDinCos(
  linii: readonly { productId: string; name?: string | null; variantTitle?: string | null; quantity: number; pret: number }[],
): ContinutTikTok {
  return continutTikTok(linii.map((l) => ({
    productId: l.productId, areVariante: !!l.variantTitle, cantitate: l.quantity, pret: l.pret, nume: l.name,
  })));
}

/** Continutul unei COMENZI, cu ID-urile exacte din catalog (combinatia din `variant_title`, altfel din nume). */
export function continutTikTokComanda(
  linii: readonly { product_id?: string | null; name?: string | null; variant_title?: string | null; quantity?: number | null; price?: number | null }[],
  paginiSectiuni: ReadonlyMap<string, unknown>,
): ContinutTikTok {
  return continutTikTok(linii.filter((l) => !!l.product_id).map((l) => {
    const ps = paginiSectiuni.get(l.product_id!);
    const titlu = l.variant_title || titluDinNumeleLiniei(l.name, ps);
    return {
      productId: l.product_id!,
      comboId: comboIdDupaTitlu(ps, titlu),
      areVariante: !!l.variant_title || parseVariants(ps) !== null,
      cantitate: Number(l.quantity) || 1,
      pret: Number(l.price) || 0,
      nume: l.name,
    };
  }));
}
