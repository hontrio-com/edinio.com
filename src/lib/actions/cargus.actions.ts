"use server";

import { updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createCargusAwb,
  deleteCargusAwb,
  loadCargusAccount,
  type CargusConfig,
  type CargusAwbInput,
  type CargusPickupLocation,
  type CargusPriceTable,
} from "@/lib/cargus";

// ─── Config actions ───────────────────────────────────────────────────────────

export async function saveCargusConfig(
  businessId: string,
  config: CargusConfig,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const { error } = await supabase.from("store_settings").update({
    cargus_config: config as unknown as import("@/types/database.types").Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  updateTag(`store-settings-${businessId}`);
  updateTag(`businesses-${user.id}`);
  updateTag(`business-${user.id}`);
  return { success: true };
}

export async function disconnectCargus(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const { error } = await supabase.from("store_settings").update({
    cargus_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  updateTag(`store-settings-${businessId}`);
  updateTag(`businesses-${user.id}`);
  updateTag(`business-${user.id}`);
  return { success: true };
}

export async function loadCargusAccountAction(
  username: string,
  password: string,
  subscriptionKey: string,
): Promise<{
  locations: CargusPickupLocation[];
  priceTables: CargusPriceTable[];
} | { error: string }> {
  return loadCargusAccount(username, password, subscriptionKey);
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
      .select("cargus_config")
      .eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = settings?.cargus_config as CargusConfig | null;
  if (!config?.enabled || !config.username || !config.password || !config.subscription_key) {
    return { error: "Cargus nu este configurat complet" as const };
  }

  return { supabase, config, order };
}

export async function createCargusAwbAction(
  businessId: string,
  orderId: string,
  input: CargusAwbInput,
): Promise<{ barCode: string; serviceName: string } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & { cargus_awb_number?: string | null };
  if (orderData.cargus_awb_number) return { error: "AWB Cargus a fost deja creat" };

  try {
    const barCode = await createCargusAwb(config, input);

    // Determine service name from weight
    const serviceName =
      input.totalWeightKg <= 31 ? "Economic Standard" :
      input.totalWeightKg <= 50 ? "Standard Plus" : "Palet Standard";

    await supabase.from("orders").update({
      cargus_awb_number: barCode,
      cargus_service_name: serviceName,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    return { barCode, serviceName };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteCargusAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & { cargus_awb_number?: string | null };
  if (!orderData.cargus_awb_number) return { error: "Nu exista AWB Cargus pentru aceasta comanda" };

  try {
    await deleteCargusAwb(config, orderData.cargus_awb_number);

    await supabase.from("orders").update({
      cargus_awb_number: null,
      cargus_service_name: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
