"use server";
import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";

import { createClient } from "@/lib/supabase/server";
import {
  createDpdShipment,
  createDpdIntlShipment,
  cancelDpdShipment,
  requestDpdCourierPickup,
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
  const shipping = (order.shipping_address ?? {}) as {
    country?: string;
    postal_code?: string;
    courier?: string;
    delivery_type?: string;
    locker_id?: string;
    locker_city?: string;
    locker_county?: string;
  };
  const eu = euCountryByIso2(shipping.country);

  // Server-derived extras: insured value from the order when the merchant
  // opted in, and the pickup point chosen by the customer at checkout. For
  // pickup deliveries the service discovery runs on the OFFICE's locality.
  const isDpdPickupDelivery =
    shipping.courier === "dpd" && shipping.delivery_type === "locker" && !!shipping.locker_id;
  const enriched: DpdShipmentInput = {
    ...input,
    declaredValue: config.declared_value_enabled ? (Number(order.subtotal) || undefined) : undefined,
    pickupOfficeId: isDpdPickupDelivery ? (Number(shipping.locker_id) || undefined) : input.pickupOfficeId,
    ...(isDpdPickupDelivery && shipping.locker_city
      ? { recipientCity: shipping.locker_city, recipientCounty: shipping.locker_county ?? input.recipientCounty }
      : {}),
  };

  try {
    if (eu) {
      if (!config.international_enabled) return { error: "Livrarea internationala DPD nu este activata." };
      const postCode = (shipping.postal_code ?? "").trim();
      if (!postCode) return { error: "Comanda nu are cod postal pentru expedierea internationala." };
      const result = await createDpdIntlShipment(config, { ...enriched, pickupOfficeId: undefined, countryId: eu.dpdCountryId, postCode });
      await supabase.from("orders").update({
        dpd_shipment_id: result.shipmentId,
        dpd_awb_number: result.barcode,
        updated_at: new Date().toISOString(),
      }).eq("id", orderId);
      void enqueueAboutYouShip(businessId, orderId);
      return result;
    }

    const result = await createDpdShipment(config, enriched);

    await supabase.from("orders").update({
      dpd_shipment_id: result.shipmentId,
      dpd_awb_number: result.barcode,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);
    void enqueueAboutYouShip(businessId, orderId);

    return result;
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─── Courier pickup ───────────────────────────────────────────────────────────

/**
 * Requests the DPD courier for every AWB generated in the last 24 hours.
 * DPD's model wants the explicit shipment list (same as the official module's
 * bulk action), so we collect the recent shipments server-side.
 */
export async function requestDpdPickupAction(
  businessId: string,
): Promise<{ count: number } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  const { data: settings } = await supabase
    .from("store_settings").select("dpd_config").eq("business_id", businessId).single();
  const config = settings?.dpd_config as DpdConfig | null;
  if (!config?.enabled || !config.username || !config.password || !config.client_id) {
    return { error: "DPD nu este configurat complet" };
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("business_id", businessId)
    .not("dpd_shipment_id", "is", null)
    .gte("updated_at", since);

  const ids = (orders ?? [])
    .map((o) => (o as { dpd_shipment_id?: number | string | null }).dpd_shipment_id)
    .filter((id): id is number | string => id != null && String(id) !== "0")
    .map((id) => String(id));

  if (ids.length === 0) {
    return { error: "Nu exista AWB-uri DPD generate in ultimele 24 de ore. Genereaza AWB-urile inainte de a chema curierul." };
  }

  try {
    await requestDpdCourierPickup(config, ids);
    return { count: ids.length };
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
