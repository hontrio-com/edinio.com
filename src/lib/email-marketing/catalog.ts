/*
  ═══════════════════════════════════════════════════════════════════════════════
  CATALOGUL MAGAZINULUI, ASA CUM IL PRIMESC MAILCHIMP, BREVO SI KLAVIYO
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ PANA PE 18.09.2026 NU EXISTA O SINCRONIZARE A CATALOGULUI INTREG. Cand comerciantul pornea
  sincronizarea e-commerce, produsele existente nu plecau nicaieri: in catalogul furnizorului intrau
  doar cele editate de atunci incolo, deci recomandarile de produs din emailuri aveau de unde alege
  aproape nimic.

  ⚠ SI HOTARASTE BAZA, NU APELANTUL. Ce e activ se pune in catalog, ce e scos din vanzare se scoate
  din recomandari, ce nu mai exista in baza se sterge. Un apelant care spune „actualizeaza” pentru un
  produs stins ar fi republicat in email un produs care nu se mai vinde.
*/

import { createAdminClient } from "@/lib/supabase/admin";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { storeBaseUrl } from "@/lib/seo";
import { hrefProdus } from "@/lib/storefront/permalinkuri";
import { prefixProdusMagazin } from "@/lib/storefront/prefix-produs-server";

export type ProdusCatalog = {
  id: string;
  name: string;
  price: number;
  image: string | null;
  slug: string | null;
  description: string | null;
};

export type CatalogCitit = {
  /** Adresa publica a magazinului: domeniul propriu cand exista. */
  adresa: string | null;
  /** Prefixul produselor (Setari > Permalink-uri). */
  prefixProdus: string;
  active: ProdusCatalog[];
  inactive: ProdusCatalog[];
  /** Id-uri cerute care nu mai sunt in baza: sterse. */
  sterse: string[];
};

type Rand = { id: string; name: string; price: number | string | null; images: unknown; slug: string | null; description: string | null; is_active: boolean | null };

function produs(r: Rand): ProdusCatalog {
  const img = Array.isArray(r.images) ? (r.images as unknown[])[0] : null;
  return {
    id: r.id,
    name: r.name,
    price: Number(r.price) || 0,
    image: typeof img === "string" ? img : null,
    slug: r.slug,
    description: r.description,
  };
}

/** Linkul produsului: `slug`, altfel id-ul, ca in feedul Merchant Center (vitrina le rezolva pe amandoua). */
export function linkProdus(
  adresa: string | null | undefined, slug: string | null | undefined, id: string, prefixProdus?: string,
): string | undefined {
  return adresa ? hrefProdus(adresa, slug || id, prefixProdus) : undefined;
}

/**
 * Produsele magazinului: toate (`ids` lipsa) sau doar cele cerute. Arunca la o citire respinsa: un
 * catalog citit pe jumatate ar sterge din furnizor produse care exista.
 */
export async function citesteCatalogul(businessId: string, ids?: string[]): Promise<CatalogCitit> {
  const admin = createAdminClient();
  const { data: biz } = await admin.from("businesses").select("slug, custom_domain").eq("id", businessId).single();
  const adresa = biz?.slug ? storeBaseUrl(biz as { slug: string; custom_domain: string | null }) : null;
  const prefixProdus = await prefixProdusMagazin(businessId);

  const campuri = "id, name, price, images, slug, description, is_active";
  let randuri: Rand[] = [];
  if (ids) {
    /* Pe bucati: `.in()` intra in ADRESA si peste ~650 de id-uri cererea e respinsa la margine. */
    for (const bucata of bucatiDeIduri(ids)) {
      const { data, error } = await admin.from("products").select(campuri).eq("business_id", businessId).in("id", bucata);
      if (error) throw new Error(error.message);
      randuri.push(...((data ?? []) as Rand[]));
    }
  } else {
    randuri = (await fetchAllRowsStrict("email.catalog", (from, to) =>
      admin.from("products").select(campuri).eq("business_id", businessId).order("id").range(from, to),
    )) as Rand[];
  }

  const gasite = new Set(randuri.map((r) => r.id));
  return {
    adresa,
    prefixProdus,
    active: randuri.filter((r) => r.is_active !== false).map(produs),
    inactive: randuri.filter((r) => r.is_active === false).map(produs),
    sterse: (ids ?? []).filter((id) => !gasite.has(id)),
  };
}
