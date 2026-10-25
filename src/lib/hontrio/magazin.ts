import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { storeBaseUrl } from "@/lib/seo";
import { parseEtichetaAds, parseIdConversieAds } from "@/lib/google-ads/conversie";
import { parseGoogleTagId, type MarketingConfig } from "@/lib/marketing-config";
import type { GoogleAnalyticsConfig } from "@/lib/google-analytics/types";
import {
  DEFAULT_CONTENT_LANGUAGE, DEFAULT_COUNTRY, DEFAULT_FEED_LABEL, type GoogleMerchantConfig,
} from "@/lib/google-merchant/types";

/**
 * `GET /api/hontrio/v1/magazin`: cine e magazinul si ce are deja legat la Google.
 *
 * ═══ ⚠ CE NU PLEACA NICIODATA DE AICI ═══
 *
 * Configurarile Google din `store_settings` tin si secrete: `refresh_token` (Merchant Center,
 * Analytics) si `api_secret` (Measurement Protocol). Vederea le decripteaza pentru cheia de serviciu,
 * deci aici le avem in clar. De aceea raspunsul se scrie camp cu camp, dintr-o lista alba: un
 * `...config` ar fi trimis tokenul Google al comerciantului catre alta platforma.
 *
 * ⚠ CE SE TRIMITE E CE STIE SI VITRINA: ID-ul tagului, al conversiei si eticheta stau oricum in sursa
 * fiecarei pagini a magazinului. Hontrio le foloseste ca sa nu dubleze conversia de cumparare cand
 * construieste campaniile: o a doua conversie „primara" ar numara fiecare comanda de doua ori.
 */

type Db = SupabaseClient<Database>;

/**
 * Fusul orar al magazinului.
 *
 * ⚠ EDINIO N-ARE UNUL PE MAGAZIN: comenzile si rapoartele se socotesc peste tot in ora Romaniei. Se
 * trimite totusi explicit, ca Hontrio sa nu-l ghiceasca din tara: zilele de raport trebuie sa cada la
 * fel la amandoi.
 */
export const FUS_ORAR = "Europe/Bucharest";

export interface MagazinHontrio {
  id: string;
  nume: string;
  url: string;
  publicat: boolean;
  /** Moneda preturilor din catalog si a comenzilor facute in magazin. */
  moneda: string;
  tara: string;
  limba: string;
  fus_orar: string;
  preturi_cu_tva: boolean;
  google_merchant: {
    conectat: true;
    cont_id: string | null;
    nume_cont: string | null;
    tara: string;
    limba: string;
    eticheta_feed: string;
  } | null;
  google_ads: {
    tag_id: string | null;
    /** `AW-…`: unde pleaca acum conversia de cumparare din vitrina. */
    conversie_id: string | null;
    conversie_eticheta: string | null;
  } | null;
  google_analytics: { masurare_id: string } | null;
}

export interface RandMagazin {
  id: string;
  slug: string;
  custom_domain: string | null;
  store_name: string | null;
  business_name: string;
  is_published: boolean;
}

export interface SetariMagazin {
  currency?: string | null;
  prices_include_vat?: boolean | null;
  google_merchant_config?: unknown;
  marketing_config?: unknown;
  google_analytics_config?: unknown;
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Pura: randul magazinului si setarile lui, scrise pentru Hontrio. Vezi lista alba de mai sus. */
export function magazinPentruHontrio(biz: RandMagazin, setari: SetariMagazin | null): MagazinHontrio {
  const gmc = (setari?.google_merchant_config ?? null) as GoogleMerchantConfig | null;
  const mk = (setari?.marketing_config ?? null) as MarketingConfig | null;
  const ga = (setari?.google_analytics_config ?? null) as GoogleAnalyticsConfig | null;

  const tara = text(gmc?.country)?.toUpperCase() ?? DEFAULT_COUNTRY;
  const limba = text(gmc?.content_language)?.toLowerCase() ?? DEFAULT_CONTENT_LANGUAGE;

  const tagId = parseGoogleTagId(mk?.google_tag_id);
  /* ⚠ Aceeasi alegere ca in vitrina (`FbPurchaseEvent`): ID-ul conversiei, altfel tagul, si numai `AW-`. */
  const conversieId = parseIdConversieAds(mk?.google_ads_conversion_id ?? mk?.google_tag_id);
  const conversieEticheta = parseEtichetaAds(mk?.google_ads_conversion_label);
  const masurareId = ga?.connected && ga?.tracking_enabled !== false ? text(ga?.measurement_id) : null;

  return {
    id: biz.id,
    nume: text(biz.store_name) ?? biz.business_name,
    url: storeBaseUrl({ slug: biz.slug, custom_domain: biz.custom_domain }),
    publicat: biz.is_published,
    moneda: text(setari?.currency)?.toUpperCase() ?? "RON",
    tara,
    limba,
    fus_orar: FUS_ORAR,
    preturi_cu_tva: setari?.prices_include_vat !== false,
    google_merchant: gmc?.connected
      ? {
          conectat: true,
          cont_id: text(gmc.account_id),
          nume_cont: text(gmc.account_name),
          tara,
          limba,
          eticheta_feed: text(gmc.feed_label) ?? DEFAULT_FEED_LABEL,
        }
      : null,
    google_ads: tagId || conversieId ? { tag_id: tagId, conversie_id: conversieId, conversie_eticheta: conversieEticheta } : null,
    google_analytics: masurareId ? { masurare_id: masurareId } : null,
  };
}

export async function citesteMagazinul(admin: Db, businessId: string): Promise<MagazinHontrio | null> {
  const [{ data: biz, error: eBiz }, { data: setari, error: eSet }] = await Promise.all([
    admin.from("businesses")
      .select("id, slug, custom_domain, store_name, business_name, is_published")
      .eq("id", businessId).maybeSingle(),
    admin.from("store_settings")
      .select("currency, prices_include_vat, google_merchant_config, marketing_config, google_analytics_config")
      .eq("business_id", businessId).maybeSingle(),
  ]);
  if (eBiz) throw eBiz;
  if (eSet) throw eSet;
  if (!biz) return null;
  return magazinPentruHontrio(biz as RandMagazin, (setari ?? null) as SetariMagazin | null);
}
