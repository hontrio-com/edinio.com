"use server";

import { createClient } from "@/lib/supabase/server";
import { type MarketingConfig, parseMetaPixelId, parseTikTokPixelId, parseGoogleTagId, parseGoogleAdsLabel } from "@/lib/marketing-config";
import { parseIdConversieAds } from "@/lib/google-ads/conversie";

/**
 * Validate + clean the marketing config before persisting. IDs are interpolated
 * into inline <script> tags on the shared edinio.com storefront origin, so an
 * unvalidated value is a stored-XSS / cross-tenant vector. Merchants also often
 * paste the whole base-code snippet, so the parsers extract the bare ID.
 */
function cleanMarketingConfig(config: MarketingConfig): { ok: true; value: MarketingConfig } | { ok: false; error: string } {
  const out: MarketingConfig = {};

  if (config.facebook_pixel_id?.trim()) {
    const id = parseMetaPixelId(config.facebook_pixel_id);
    if (!id) return { ok: false, error: "Facebook Pixel ID invalid. Copiaza doar ID-ul numeric (15-16 cifre) din Events Manager." };
    out.facebook_pixel_id = id;
  }

  if (config.tiktok_pixel_id?.trim()) {
    const id = parseTikTokPixelId(config.tiktok_pixel_id);
    if (!id) return { ok: false, error: "TikTok Pixel ID invalid. Copiaza ID-ul din TikTok Events Manager (ex: C4ABCDEF...)." };
    out.tiktok_pixel_id = id;
  }

  if (config.google_tag_id?.trim()) {
    const id = parseGoogleTagId(config.google_tag_id);
    if (!id) return { ok: false, error: "Google Tag ID invalid. Foloseste formatul G-XXXX, AW-XXXX sau GT-XXXX." };
    out.google_tag_id = id;
  }

  /*
   * ⚠ ID-ul de conversie Ads si eticheta merg IMPREUNA. Eticheta singura n-are unde pleca, iar pana la
   * 18.09.2026 se salva linistita langa un tag GA4, de unde nu ajungea nicio conversie in Google Ads.
   */
  const idAds = parseIdConversieAds(config.google_ads_conversion_id);
  if (config.google_ads_conversion_id?.trim() && !idAds) {
    return { ok: false, error: "ID-ul de conversie Google Ads are forma AW-123456789 (il gasesti in Google Ads > Obiective > Conversii)." };
  }
  if (idAds) out.google_ads_conversion_id = idAds;

  if (config.google_ads_conversion_label?.trim()) {
    const label = parseGoogleAdsLabel(config.google_ads_conversion_label);
    if (!label) return { ok: false, error: "Eticheta de conversie Google Ads invalida." };
    if (!idAds) {
      return { ok: false, error: "Eticheta de conversie are nevoie de ID-ul de conversie Google Ads (AW-…): fara el conversia nu ajunge nicaieri." };
    }
    out.google_ads_conversion_label = label;
  }

  return { ok: true, value: out };
}

export async function saveMarketingConfig(
  businessId: string,
  config: MarketingConfig,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const cleaned = cleanMarketingConfig(config);
  if (!cleaned.ok) return { error: cleaned.error };
  /*
   * ⚠ `facebook_capi_activ` NU vine din formular: il scrie doar salvarea tokenului Conversions API. Se ia din
   * baza, altfel orice salvare a unui ID de pixel l-ar fi stins, iar evenimentele n-ar mai fi plecat spre
   * server fara ca cineva sa stie. Fara pixel Meta, nici semnalul nu mai are sens.
   *
   * ⚠ Nici cu ALT pixel: tokenul a fost verificat pe cel vechi. Semnalul se stinge, iar panoul cere verificarea
   * tokenului pe pixelul nou (`saveMetaCapi`).
   */
  const { data: existent } = await supabase.from("store_settings").select("marketing_config").eq("business_id", businessId).maybeSingle();
  const vechi = existent?.marketing_config as MarketingConfig | null;
  if (vechi?.facebook_capi_activ === true && cleaned.value.facebook_pixel_id
    && cleaned.value.facebook_pixel_id === parseMetaPixelId(vechi.facebook_pixel_id)) {
    cleaned.value.facebook_capi_activ = true;
  }
  if (vechi?.tiktok_capi_activ === true && cleaned.value.tiktok_pixel_id
    && cleaned.value.tiktok_pixel_id === parseTikTokPixelId(vechi.tiktok_pixel_id)) {
    cleaned.value.tiktok_capi_activ = true;
  }

  const { error } = await supabase.from("store_settings").update({
    marketing_config: cleaned.value as unknown as import("@/types/database.types").Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}
