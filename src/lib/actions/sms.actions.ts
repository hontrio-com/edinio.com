"use server";

import { createClient } from "@/lib/supabase/server";
import { checkCredit, sendSms } from "@/lib/smso";
import type { SmsoConfig } from "@/lib/smso";

export interface SmsFilters {
  date_from?: string;
  date_to?: string;
  counties?: string[];
  min_amount?: number;
  order_statuses?: string[];
}

type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";

async function getSmsoConfigForBiz(businessId: string): Promise<SmsoConfig | null | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  const { data: settings } = await supabase
    .from("store_settings").select("smso_config").eq("business_id", businessId).single();
  return (settings?.smso_config as SmsoConfig | null) ?? null;
}

async function fetchOrderPhones(
  businessId: string,
  filters: SmsFilters
): Promise<string[]> {
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select("customer_phone, shipping_address")
    .eq("business_id", businessId);

  if (filters.date_from) query = query.gte("created_at", filters.date_from);
  if (filters.date_to)   query = query.lte("created_at", filters.date_to + "T23:59:59Z");
  if (filters.min_amount && filters.min_amount > 0) query = query.gte("total", filters.min_amount);
  if (filters.order_statuses && filters.order_statuses.length > 0) {
    query = query.in("status", filters.order_statuses as OrderStatus[]);
  }

  const { data: orders } = await query;
  if (!orders || orders.length === 0) return [];

  const filtered = orders.filter(o => {
    if (filters.counties && filters.counties.length > 0) {
      const addr = o.shipping_address as Record<string, string> | null;
      if (!addr?.county || !filters.counties!.includes(addr.county)) return false;
    }
    return !!o.customer_phone;
  });

  return filtered.map(o => o.customer_phone as string);
}

export async function getSmsoCredit(
  businessId: string
): Promise<{ credit: number } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  const { data: settings } = await supabase
    .from("store_settings").select("smso_config").eq("business_id", businessId).single();
  const config = settings?.smso_config as SmsoConfig | null;
  if (!config?.api_key) return { error: "SMSO nu este configurat." };

  return checkCredit(config.api_key);
}

export async function previewSmsRecipients(
  businessId: string,
  filters: SmsFilters
): Promise<{ uniqueCount: number; totalCount: number; duplicatesRemoved: number } | { error: string }> {
  const cfgOrErr = await getSmsoConfigForBiz(businessId);
  if (cfgOrErr && "error" in cfgOrErr) return cfgOrErr;

  const phones = await fetchOrderPhones(businessId, filters);
  const totalCount = phones.length;
  const uniquePhones = [...new Set(phones)];

  return {
    uniqueCount: uniquePhones.length,
    totalCount,
    duplicatesRemoved: totalCount - uniquePhones.length,
  };
}

export async function sendSmsCampaign(
  businessId: string,
  message: string,
  filters: SmsFilters
): Promise<{ sent: number; failed: number; campaignId: string } | { error: string }> {
  const cfgOrErr = await getSmsoConfigForBiz(businessId);
  if (cfgOrErr && "error" in cfgOrErr) return cfgOrErr;
  const config = cfgOrErr as SmsoConfig | null;
  if (!config?.enabled || !config.api_key || !config.sender_id) {
    return { error: "SMSO nu este activat sau configurat complet." };
  }

  const phones = await fetchOrderPhones(businessId, filters);
  const uniquePhones = [...new Set(phones)];
  if (uniquePhones.length === 0) return { error: "Nu exista destinatari pentru filtrele selectate." };

  let sentCount = 0;
  let failedCount = 0;

  for (const phone of uniquePhones) {
    const result = await sendSms(config.api_key, {
      to: phone,
      sender: config.sender_id,
      body: message,
      type: "marketing",
      remove_special_chars: true,
    });
    if (result.success) sentCount++;
    else failedCount++;
  }

  const status = failedCount === 0 ? "sent" : sentCount === 0 ? "failed" : "partial";

  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("sms_campaigns")
    .insert({
      business_id: businessId,
      message,
      recipient_count: uniquePhones.length,
      sent_count: sentCount,
      failed_count: failedCount,
      status,
      filters: filters as never,
    })
    .select("id")
    .single();

  return { sent: sentCount, failed: failedCount, campaignId: campaign?.id ?? "" };
}

export async function getSmsCampaigns(businessId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("sms_campaigns")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}
