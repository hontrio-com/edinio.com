"use server";

import { updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createSamedayAwb,
  deleteSamedayAwb,
  loadSamedayAccount,
  type SamedayConfig,
  type SamedayAwbInput,
  type SamedayPickupPoint,
  type SamedayService,
} from "@/lib/sameday";

// ─── Config actions ───────────────────────────────────────────────────────────

export async function saveSamedayConfig(
  businessId: string,
  config: SamedayConfig,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const { error } = await supabase.from("store_settings").update({
    sameday_config: config as unknown as import("@/types/database.types").Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  updateTag(`store-settings-${businessId}`);
  updateTag(`businesses-${user.id}`);
  updateTag(`business-${user.id}`);
  return { success: true };
}

export async function disconnectSameday(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const { error } = await supabase.from("store_settings").update({
    sameday_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  updateTag(`store-settings-${businessId}`);
  updateTag(`businesses-${user.id}`);
  updateTag(`business-${user.id}`);
  return { success: true };
}

export async function loadSamedayAccountAction(
  username: string,
  password: string,
  sandbox: boolean,
): Promise<{
  pickupPoints: SamedayPickupPoint[];
  services: SamedayService[];
} | { error: string }> {
  return loadSamedayAccount(username, password, sandbox);
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
      .select("sameday_config")
      .eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = settings?.sameday_config as SamedayConfig | null;
  if (!config?.enabled || !config.username || !config.password) {
    return { error: "Sameday nu este configurat complet" as const };
  }

  return { supabase, config, order };
}

export async function createSamedayAwbAction(
  businessId: string,
  orderId: string,
  input: SamedayAwbInput,
): Promise<{ awbNumber: string } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & { sameday_awb_number?: string | null };
  if (orderData.sameday_awb_number) return { error: "AWB Sameday a fost deja creat" };

  try {
    const awbNumber = await createSamedayAwb(config, input);

    await supabase.from("orders").update({
      sameday_awb_number: awbNumber,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    return { awbNumber };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteSamedayAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & { sameday_awb_number?: string | null };
  if (!orderData.sameday_awb_number) return { error: "Nu exista AWB Sameday pentru aceasta comanda" };

  try {
    await deleteSamedayAwb(config, orderData.sameday_awb_number);

    await supabase.from("orders").update({
      sameday_awb_number: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
