"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  getWootToken, getPrices, createOrder, cancelWootOrder,
  getAccountInfo, getCredit,
  type WootConfig, type WootParcel, type WootPriceResult,
} from "@/lib/woot";

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function checkAccess(businessId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  return !!data;
}

async function loadConfig(businessId: string): Promise<WootConfig | null> {
  const admin = adminClient();
  const { data } = await admin
    .from("store_settings")
    .select("woot_config")
    .eq("business_id", businessId)
    .single();
  return (data?.woot_config as WootConfig | null) ?? null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function saveWootConfig(
  businessId: string,
  config: WootConfig
): Promise<{ success: boolean; error?: string }> {
  if (!(await checkAccess(businessId))) return { success: false, error: "Neautorizat" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("store_settings")
    .update({ woot_config: config })
    .eq("business_id", businessId);

  if (error) return { success: false, error: "Eroare la salvare" };
  revalidatePath("/dashboard/features/woot");
  revalidatePath("/dashboard/features");
  revalidatePath("/dashboard/orders");
  return { success: true };
}

export async function disconnectWoot(
  businessId: string
): Promise<{ success: boolean; error?: string }> {
  if (!(await checkAccess(businessId))) return { success: false, error: "Neautorizat" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("store_settings")
    .update({ woot_config: null })
    .eq("business_id", businessId);

  if (error) return { success: false, error: "Eroare la stergere" };
  revalidatePath("/dashboard/features/woot");
  revalidatePath("/dashboard/features");
  revalidatePath("/dashboard/orders");
  return { success: true };
}

export async function testWootConnection(businessId: string): Promise<{
  success: boolean;
  error?: string;
  name?: string;
  email?: string;
  credit?: number;
}> {
  if (!(await checkAccess(businessId))) return { success: false, error: "Neautorizat" };

  const config = await loadConfig(businessId);
  if (!config?.public_key || !config?.secret_key) return { success: false, error: "Chei API lipsa" };

  try {
    const token = await getWootToken(config.public_key, config.secret_key);
    const [info, credit] = await Promise.all([getAccountInfo(token), getCredit(token)]);
    return { success: true, name: `${info.first_name} ${info.last_name}`, email: info.email, credit: credit.total };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ─── AWB ──────────────────────────────────────────────────────────────────────

export async function getWootPrices(
  businessId: string,
  receiver: {
    contact: string;
    phone: string;
    email?: string;
    country_id: number;
    city_id: number;
    address: string;
  },
  parcels: WootParcel[],
  repayment?: number
): Promise<{ success: boolean; error?: string; prices?: WootPriceResult[] }> {
  if (!(await checkAccess(businessId))) return { success: false, error: "Neautorizat" };

  const config = await loadConfig(businessId);
  if (!config?.enabled || !config.public_key || !config.secret_key) {
    return { success: false, error: "Woot nu este configurat" };
  }

  try {
    const token = await getWootToken(config.public_key, config.secret_key);
    const sender = buildSender(config);
    const prices = await getPrices(token, {
      sender,
      receiver: { company: 0, ...receiver },
      parcels,
      repayment: repayment && repayment > 0 ? repayment : undefined,
    });
    const valid = prices.filter(p => p.errors.length === 0);
    return { success: true, prices: valid };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function createWootAwb(
  businessId: string,
  orderId: string,
  serviceId: number,
  serviceName: string,
  receiver: {
    contact: string;
    phone: string;
    email?: string;
    country_id: number;
    city_id: number;
    address: string;
  },
  parcels: WootParcel[],
  repayment?: number,
  options?: { opd?: boolean; sat?: boolean }
): Promise<{ success: boolean; error?: string; awbNumber?: string; wootOrderId?: number }> {
  if (!(await checkAccess(businessId))) return { success: false, error: "Neautorizat" };

  const config = await loadConfig(businessId);
  if (!config?.enabled || !config.public_key || !config.secret_key) {
    return { success: false, error: "Woot nu este configurat" };
  }

  try {
    const token = await getWootToken(config.public_key, config.secret_key);
    const result = await createOrder(token, {
      service_id: serviceId,
      sender: buildSender(config),
      receiver: { company: 0, ...receiver },
      parcels,
      repayment: repayment && repayment > 0 ? repayment : undefined,
      options,
    });

    if (!result.success) throw new Error("Creare AWB esuata");

    const admin = adminClient();
    await admin
      .from("orders")
      .update({
        woot_order_id: String(result.order_id),
        woot_awb_number: result.awb_number ?? "",
        woot_service_name: serviceName,
        tracking_number: result.awb_number ?? undefined,
        status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("business_id", businessId);

    revalidatePath("/dashboard/orders");
    revalidatePath(`/dashboard/orders/${orderId}`);
    return { success: true, awbNumber: result.awb_number ?? undefined, wootOrderId: result.order_id };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function cancelWootAwb(
  businessId: string,
  orderId: string,
  wootOrderId: string
): Promise<{ success: boolean; error?: string }> {
  if (!(await checkAccess(businessId))) return { success: false, error: "Neautorizat" };

  const config = await loadConfig(businessId);
  if (!config?.public_key || !config?.secret_key) return { success: false, error: "Woot nu este configurat" };

  try {
    const token = await getWootToken(config.public_key, config.secret_key);
    await cancelWootOrder(token, Number(wootOrderId));

    const admin = adminClient();
    await admin
      .from("orders")
      .update({
        woot_order_id: null,
        woot_awb_number: null,
        woot_service_name: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("business_id", businessId);

    revalidatePath("/dashboard/orders");
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSender(config: WootConfig): object {
  return {
    company: config.sender.company,
    ...(config.sender.company === 1 && config.sender.company_name
      ? { company_name: config.sender.company_name }
      : {}),
    contact: config.sender.contact,
    phone: config.sender.phone,
    email: config.sender.email,
    country_id: 189,
    city_id: config.sender.city_id,
    address: config.sender.address,
    ...(config.sender.zipcode ? { zipcode: config.sender.zipcode } : {}),
  };
}
