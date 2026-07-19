"use server";
import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  getCOToken,
  getBalance,
  getPrices,
  createCOOrder,
  type COConfig,
  type COOrderExtras,
  type COReceiver,
  type COParcel,
} from "@/lib/colete";

/** Config-driven extras (repayment routing + insurance), shared by quote and AWB. */
function configExtras(config: COConfig, subtotal?: number): COOrderExtras {
  return {
    repaymentType: config.repayment_type ?? "cash",
    repaymentIban: config.repayment_iban,
    repaymentHolder: config.repayment_holder,
    ...(config.insurance_enabled && subtotal && subtotal > 0
      ? { insurance: Math.round(subtotal * 100) / 100 }
      : {}),
  };
}

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
  /** Toggles from the AWB modal; insurance is resolved from the order when orderId is set. */
  options?: { openAtDelivery?: boolean; saturday?: boolean; orderId?: string },
): Promise<{ list: { serviceId: number; courierName: string; serviceName: string; total: number; noVat: number }[] } | { error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Neautorizat" };

    const admin = adminClient();
    const { data: settings } = await admin.from("store_settings").select("colete_config").eq("business_id", businessId).single();
    const config = settings?.colete_config as COConfig | null;
    if (!config?.client_id || !config?.client_secret) return { error: "Colete Online nu este configurat" };

    let subtotal: number | undefined;
    if (options?.orderId && config.insurance_enabled) {
      const { data: order } = await admin
        .from("orders")
        .select("subtotal")
        .eq("id", options.orderId)
        .eq("business_id", businessId)
        .single();
      subtotal = Number(order?.subtotal) || undefined;
    }

    const token = await getCOToken(config.client_id, config.client_secret);
    const result = await getPrices(token, config.sandbox ?? false, config.sender, receiver, parcels, repayment, {
      ...configExtras(config, subtotal),
      openAtDelivery: options?.openAtDelivery,
      saturday: options?.saturday,
    });

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
  options?: { openAtDelivery?: boolean; saturday?: boolean },
): Promise<{ awb: string; uniqueId: string } | { error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Neautorizat" };

    const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
    if (!biz) return { error: "Business negasit" };

    const admin = adminClient();
    const [{ data: order }, { data: settings }] = await Promise.all([
      admin.from("orders").select("id, order_number, payment_method, payment_status, subtotal").eq("id", orderId).eq("business_id", businessId).single(),
      admin.from("store_settings").select("colete_config").eq("business_id", businessId).single(),
    ]);

    if (!order) return { error: "Comanda negasita" };
    const config = settings?.colete_config as COConfig | null;
    if (!config?.client_id || !config?.client_secret) return { error: "Colete Online nu este configurat" };

    const token = await getCOToken(config.client_id, config.client_secret);
    const result = await createCOOrder(token, config.sandbox ?? false, config.sender, receiver, parcels, repayment, serviceId, {
      ...configExtras(config, Number(order.subtotal) || undefined),
      openAtDelivery: options?.openAtDelivery,
      saturday: options?.saturday,
      clientReference: order.order_number, // shows up in COD payout reports
    });

    // Save to order
    await admin.from("orders").update({
      colete_order_id: result.uniqueId,
      colete_awb_number: result.awb,
      colete_service_name: serviceName,
      tracking_number: result.awb,
      status: "processing",
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);
    void enqueueAboutYouShip(businessId, orderId);

    return { awb: result.awb, uniqueId: result.uniqueId };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─── Detach AWB (manual cancellation) ─────────────────────────────────────────
// Colete Online has NO cancellation endpoint: the merchant cancels the shipment
// in their Colete Online account, then detaches the AWB here so the order can
// get a fresh one (e.g. after editing a wrong address).

export async function detachCOAwb(businessId: string, orderId: string): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const admin = adminClient();
  const { data: order } = await admin.from("orders")
    .select("id, colete_awb_number, tracking_number")
    .eq("id", orderId).eq("business_id", businessId).single();
  if (!order) return { error: "Comanda negasita" };
  if (!order.colete_awb_number) return { error: "Comanda nu are AWB Colete Online." };

  const { error } = await admin.from("orders").update({
    colete_awb_number: null,
    colete_order_id: null,
    colete_unique_id: null,
    colete_service_name: null,
    // tracking_number is shared across couriers — clear it only if it belongs to this AWB.
    ...(order.tracking_number === order.colete_awb_number ? { tracking_number: null } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", orderId);
  if (error) return { error: "Eroare la actualizare." };

  revalidatePath(`/dashboard/orders/${orderId}`);
  return { success: true };
}
