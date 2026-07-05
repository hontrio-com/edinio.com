"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createFanCourierAwb,
  deleteFanCourierAwb,
  createFanCourierPickupOrder,
  deleteFanCourierPickupOrder,
  loadFanCourierAccount,
  type FanCourierConfig,
  type FanCourierAwbInput,
  type FanCourierPickupInput,
  type FanCourierBranch,
} from "@/lib/fancourier";

// ─── Config actions ───────────────────────────────────────────────────────────

export async function saveFanCourierConfig(
  businessId: string,
  config: FanCourierConfig,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const { error } = await supabase.from("store_settings").update({
    fan_courier_config: config as unknown as import("@/types/database.types").Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectFanCourier(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const { error } = await supabase.from("store_settings").update({
    fan_courier_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function loadFanCourierAccountAction(
  username: string,
  password: string,
): Promise<{ branches: FanCourierBranch[] } | { error: string }> {
  return loadFanCourierAccount(username, password);
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
      .select("fan_courier_config")
      .eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = settings?.fan_courier_config as FanCourierConfig | null;
  if (!config?.enabled || !config.username || !config.password || !config.client_id) {
    return { error: "FAN Courier nu este configurat complet" as const };
  }

  return { supabase, config, order };
}

export async function createFanCourierAwbAction(
  businessId: string,
  orderId: string,
  input: FanCourierAwbInput,
): Promise<{ awbNumber: string } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & { fan_courier_awb_number?: string | null };
  if (orderData.fan_courier_awb_number) return { error: "AWB FAN Courier a fost deja creat" };

  try {
    const awbNumber = await createFanCourierAwb(config, input);

    await supabase.from("orders").update({
      fan_courier_awb_number: awbNumber,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    return { awbNumber };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─── Pickup (courier order) actions ──────────────────────────────────────────

async function getOwnedFanConfig(businessId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" as const };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" as const };

  const { data: settings } = await supabase
    .from("store_settings").select("fan_courier_config").eq("business_id", businessId).single();

  const config = settings?.fan_courier_config as FanCourierConfig | null;
  if (!config?.enabled || !config.username || !config.password || !config.client_id) {
    return { error: "FAN Courier nu este configurat complet" as const };
  }
  return { supabase, config };
}

export async function createFanCourierPickupAction(
  businessId: string,
  input: FanCourierPickupInput,
): Promise<{ orderId: string } | { error: string }> {
  const ctx = await getOwnedFanConfig(businessId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config } = ctx;

  try {
    const orderId = await createFanCourierPickupOrder(config, input);

    // Remember the last pickup so the UI can warn about duplicates / allow cancel.
    await supabase.from("store_settings").update({
      fan_courier_config: {
        ...config,
        last_pickup_date: input.pickupDate,
        last_pickup_id: orderId || null,
      } as unknown as import("@/types/database.types").Json,
      updated_at: new Date().toISOString(),
    }).eq("business_id", businessId);

    return { orderId };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function cancelFanCourierPickupAction(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getOwnedFanConfig(businessId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config } = ctx;

  if (!config.last_pickup_id) {
    return { error: "Nu exista o ridicare programata din platforma care sa poata fi anulata." };
  }

  try {
    await deleteFanCourierPickupOrder(config, config.last_pickup_id);

    await supabase.from("store_settings").update({
      fan_courier_config: {
        ...config,
        last_pickup_date: null,
        last_pickup_id: null,
      } as unknown as import("@/types/database.types").Json,
      updated_at: new Date().toISOString(),
    }).eq("business_id", businessId);

    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteFanCourierAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & { fan_courier_awb_number?: string | null };
  if (!orderData.fan_courier_awb_number) return { error: "Nu exista AWB FAN Courier pentru aceasta comanda" };

  try {
    await deleteFanCourierAwb(config, orderData.fan_courier_awb_number);

    await supabase.from("orders").update({
      fan_courier_awb_number: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
