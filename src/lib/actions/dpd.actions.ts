"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createDpdShipment,
  createDpdIntlShipment,
  cancelDpdShipment,
  loadDpdAccount,
  type DpdConfig,
  type DpdShipmentInput,
} from "@/lib/dpd";
import { euCountryByIso2 } from "@/lib/eu-countries";

// ─── Config actions ───────────────────────────────────────────────────────────

export async function saveDpdConfig(
  businessId: string,
  config: DpdConfig,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const { error } = await supabase.from("store_settings").update({
    dpd_config: config as unknown as import("@/types/database.types").Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectDpd(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const { error } = await supabase.from("store_settings").update({
    dpd_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function loadDpdAccountAction(
  username: string,
  password: string,
): Promise<{ clientId: number; name: string } | { error: string }> {
  return loadDpdAccount(username, password);
}

// ─── AWB actions ──────────────────────────────────────────────────────────────

async function getConfigAndOrder(businessId: string, orderId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" as const };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" as const };

  const [{ data: settings }, { data: order }] = await Promise.all([
    supabase.from("store_settings")
      .select("dpd_config")
      .eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = settings?.dpd_config as DpdConfig | null;
  if (!config?.enabled || !config.username || !config.password || !config.client_id) {
    return { error: "DPD nu este configurat complet" as const };
  }

  return { supabase, config, order };
}

export async function createDpdShipmentAction(
  businessId: string,
  orderId: string,
  input: DpdShipmentInput,
): Promise<{ shipmentId: number; barcode: string } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & {
    dpd_shipment_id?: number | null;
    dpd_awb_number?: string | null;
  };
  if (orderData.dpd_shipment_id) return { error: "AWB DPD a fost deja creat" };

  // International order? The destination country + postcode are stored on the
  // order at checkout. Route to the DPD international flow when present.
  const shipping = (order.shipping_address ?? {}) as { country?: string; postal_code?: string };
  const eu = euCountryByIso2(shipping.country);

  try {
    if (eu) {
      if (!config.international_enabled) return { error: "Livrarea internationala DPD nu este activata." };
      const postCode = (shipping.postal_code ?? "").trim();
      if (!postCode) return { error: "Comanda nu are cod postal pentru expedierea internationala." };
      const result = await createDpdIntlShipment(config, { ...input, countryId: eu.dpdCountryId, postCode });
      await supabase.from("orders").update({
        dpd_shipment_id: result.shipmentId,
        dpd_awb_number: result.barcode,
        updated_at: new Date().toISOString(),
      }).eq("id", orderId);
      return result;
    }

    const result = await createDpdShipment(config, input);

    await supabase.from("orders").update({
      dpd_shipment_id: result.shipmentId,
      dpd_awb_number: result.barcode,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    return result;
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function cancelDpdShipmentAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & {
    dpd_shipment_id?: number | null;
    dpd_awb_number?: string | null;
  };
  if (!orderData.dpd_shipment_id) return { error: "Nu exista expeditie DPD pentru aceasta comanda" };

  try {
    await cancelDpdShipment(config, orderData.dpd_shipment_id);

    await supabase.from("orders").update({
      dpd_shipment_id: null,
      dpd_awb_number: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
