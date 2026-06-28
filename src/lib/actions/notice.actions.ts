"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  testNoticeToken, getNoticeTemplates, sendNoticeSms,
  type NoticeConfig, type NoticeTemplate,
} from "@/lib/notice";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function updateNoticeConfig(
  businessId: string,
  config: NoticeConfig,
): Promise<{ success: true } | { error: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const { data: existing } = await supabase
    .from("store_settings").select("business_id").eq("business_id", businessId).single();

  let error;
  if (existing) {
    ({ error } = await supabase.from("store_settings")
      .update({ notice_config: config as never }).eq("business_id", businessId));
  } else {
    ({ error } = await supabase.from("store_settings")
      .insert({ business_id: businessId, notice_config: config as never }));
  }
  if (error) return { error: "Eroare la salvare." };

  revalidatePath("/dashboard/features/notice");
  revalidatePath("/dashboard/features");
  return { success: true };
}

// Validate the token by making an authenticated call (templates list). Free — no SMS sent.
export async function testNoticeConnection(
  token: string,
): Promise<{ ok: true; templateCount: number } | { ok: false; error: string }> {
  const { user } = await requireUser();
  if (!user) return { ok: false, error: "Neautorizat" };
  if (!token.trim()) return { ok: false, error: "Introdu tokenul API." };
  return testNoticeToken(token.trim());
}

export async function listNoticeTemplates(
  token: string,
): Promise<{ templates: NoticeTemplate[] } | { error: string }> {
  const { user } = await requireUser();
  if (!user) return { error: "Neautorizat" };
  if (!token.trim()) return { error: "Introdu tokenul API." };
  const res = await getNoticeTemplates(token.trim());
  if ("error" in res) return res;
  return { templates: res };
}

export async function sendNoticeTestSms(
  token: string,
  phone: string,
): Promise<{ success: true } | { error: string }> {
  const { user } = await requireUser();
  if (!user) return { error: "Neautorizat" };
  if (!token.trim()) return { error: "Introdu tokenul API." };
  if (!phone.trim()) return { error: "Introdu un numar de telefon." };
  const res = await sendNoticeSms(token.trim(), {
    number: phone.trim(),
    message: "Test notice.ro din magazinul tau Edinio. Integrarea SMS functioneaza!",
  });
  if (!res.success) return { error: res.error ?? "Trimitere esuata." };
  return { success: true };
}

export interface NoticeStats {
  total: number;
  today: number;
  failed: number;
  recent: { trigger_key: string; phone: string | null; success: boolean; created_at: string }[];
}

export async function getNoticeStats(businessId: string): Promise<NoticeStats | { error: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const base = () => supabase.from("notice_sms_log").select("id", { count: "exact", head: true }).eq("business_id", businessId);
  const [{ count: total }, { count: today }, { count: failed }, { data: recent }] = await Promise.all([
    base(),
    base().gte("created_at", startOfToday.toISOString()),
    base().eq("success", false),
    supabase.from("notice_sms_log")
      .select("trigger_key, phone, success, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  return {
    total: total ?? 0,
    today: today ?? 0,
    failed: failed ?? 0,
    recent: (recent ?? []).map(r => ({
      trigger_key: r.trigger_key,
      phone: r.phone,
      success: r.success,
      created_at: r.created_at,
    })),
  };
}
