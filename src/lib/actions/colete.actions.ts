"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  getCOToken,
  getBalance,
  getPrices,
  createCOOrder,
  type COConfig,
  type COReceiver,
  type COParcel,
} from "@/lib/colete";

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function saveCOConfig(
  businessId: string,
  config: COConfig,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const { error } = await supabase.from("store_settings").update({ colete_config: config as unknown as import("@/types/database.types").Json, updated_at: new Date().toISOString() }).eq("business_id", businessId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectCO(businessId: string): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const { error } = await supabase.from("store_settings").update({ colete_config: null, updated_at: new Date().toISOString() }).eq("business_id", businessId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function testCOConnection(
  clientId: string,
  clientSecret: string,
  sandbox: boolean,
): Promise<{ balance: number; bonus: number } | { error: string }> {
  try {
    const token = await getCOToken(clientId, clientSecret);
    const balance = await getBalance(token, sandbox);
    return { balance: balance.amount, bonus: balance.bonus };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─── Prices ───────────────────────────────────────────────────────────────────

export async function getCOPrices(
  businessId: string,
  receiver: COReceiver,
  parcels: COParcel[],
  repayment: number,
): Promise<{ list: { serviceId: number; courierName: string; serviceName: string; total: number; noVat: number }[] } | { error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Neautorizat" };

    const admin = adminClient();
    const { data: settings } = await admin.from("store_settings").select("colete_config").eq("business_id", businessId).single();
    const config = settings?.colete_config as COConfig | null;
    if (!config?.client_id || !config?.client_secret) return { error: "Colete Online nu este configurat" };

    const token = await getCOToken(config.client_id, config.client_secret);
    const result = await getPrices(token, config.sandbox ?? false, config.sender, receiver, parcels, repayment);

    const list = (result.list ?? []).map(item => ({
      serviceId: item.service.id,
      courierName: item.service.courierName,
      serviceName: item.service.name,
      total: item.price.total,
      noVat: item.price.noVat,
    }));

    return { list };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─── Create AWB ───────────────────────────────────────────────────────────────

export async function createCOAwb(
  businessId: string,
  orderId: string,
  serviceId: number,
  serviceName: string,
  receiver: COReceiver,
  parcels: COParcel[],
  repayment: number,
): Promise<{ awb: string; uniqueId: string } | { error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Neautorizat" };

    const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
    if (!biz) return { error: "Business negasit" };

    const admin = adminClient();
    const [{ data: order }, { data: settings }] = await Promise.all([
      admin.from("orders").select("id, order_number, payment_method, payment_status").eq("id", orderId).eq("business_id", businessId).single(),
      admin.from("store_settings").select("colete_config").eq("business_id", businessId).single(),
    ]);

    if (!order) return { error: "Comanda negasita" };
    const config = settings?.colete_config as COConfig | null;
    if (!config?.client_id || !config?.client_secret) return { error: "Colete Online nu este configurat" };

    const token = await getCOToken(config.client_id, config.client_secret);
    const result = await createCOOrder(token, config.sandbox ?? false, config.sender, receiver, parcels, repayment, serviceId);

    // Save to order
    await admin.from("orders").update({
      colete_order_id: result.uniqueId,
      colete_awb_number: result.awb,
      colete_service_name: serviceName,
      tracking_number: result.awb,
      status: "processing",
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    return { awb: result.awb, uniqueId: result.uniqueId };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
