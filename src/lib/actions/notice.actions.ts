"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  testNoticeToken, getNoticeTemplates, sendNoticeSms, sendNoticeWhatsapp, sendNoticeAudio,
  registerNoticeWaDevice, refreshNoticeWaQr, requestNoticeWaPairing,
  pollNoticeWaStatus, deleteNoticeWaDevice,
  type NoticeConfig, type NoticeTemplate, type NoticeWaDevice,
} from "@/lib/notice";

type Supa = Awaited<ReturnType<typeof createClient>>;

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

// Verify the caller owns the business; returns the client or an error.
async function requireOwned(
  businessId: string,
): Promise<{ supabase: Supa } | { error: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Neautorizat" };
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };
  return { supabase };
}

const EMPTY_CONFIG: NoticeConfig = { enabled: false, api_token: "", strip_diacritics: true, triggers: {} };

// Read-modify-write the store's notice_config jsonb (server-managed fields like
// whatsapp.device_id / webhook_secret live here and must survive client saves).
async function mergeNoticeConfig(
  supabase: Supa,
  businessId: string,
  mutate: (c: NoticeConfig) => NoticeConfig,
): Promise<NoticeConfig | { error: string }> {
  const { data } = await supabase
    .from("store_settings").select("business_id, notice_config").eq("business_id", businessId).single();
  const current = (data?.notice_config as NoticeConfig | null) ?? EMPTY_CONFIG;
  const next = mutate({ ...current });

  const exists = !!data?.business_id;
  const { error } = exists
    ? await supabase.from("store_settings").update({ notice_config: next as never }).eq("business_id", businessId)
    : await supabase.from("store_settings").insert({ business_id: businessId, notice_config: next as never });
  if (error) return { error: "Eroare la salvare." };
  return next;
}

export async function updateNoticeConfig(
  businessId: string,
  config: NoticeConfig,
): Promise<{ success: true; config: NoticeConfig } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;

  const saved = await mergeNoticeConfig(owned.supabase, businessId, (current) => ({
    ...config,
    // Server-managed fields the client must never clobber: the WhatsApp connection
    // state is owned entirely by the connect/disconnect/poll actions (a stale client
    // copy could otherwise flip it off on save), and the webhook secret persists.
    webhook_secret: config.webhook_secret || current.webhook_secret || randomUUID(),
    whatsapp: current.whatsapp,
  }));
  if ("error" in saved) return saved;

  revalidatePath("/dashboard/features/notice");
  revalidatePath("/dashboard/features");
  return { success: true, config: saved };
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
  recent: { trigger_key: string; phone: string | null; success: boolean; created_at: string; channel: string; delivery_status: string | null }[];
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
      .select("trigger_key, phone, success, created_at, channel, delivery_status")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(10),
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
      channel: (r as { channel?: string }).channel ?? "sms",
      delivery_status: (r as { delivery_status?: string | null }).delivery_status ?? null,
    })),
  };
}

// ── WhatsApp device lifecycle ───────────────────────────────────────────────────

export async function connectNoticeWhatsapp(
  businessId: string, token: string,
): Promise<{ device: NoticeWaDevice } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  if (!token.trim()) return { error: "Introdu tokenul API." };

  const res = await registerNoticeWaDevice(token.trim(), "Edinio");
  if ("error" in res) return res;

  await mergeNoticeConfig(owned.supabase, businessId, (c) => ({
    ...c,
    whatsapp: { enabled: false, device_id: res.device.id, device_name: res.device.name ?? "Edinio", status: res.device.status },
  }));
  revalidatePath("/dashboard/features/notice");
  return { device: res.device };
}

export async function refreshNoticeWhatsappQr(
  token: string, deviceId: string,
): Promise<{ qr_code: string | null } | { error: string }> {
  const { user } = await requireUser();
  if (!user) return { error: "Neautorizat" };
  if (!token.trim() || !deviceId) return { error: "Lipsesc datele." };
  return refreshNoticeWaQr(token.trim(), deviceId);
}

export async function requestNoticeWhatsappPairing(
  token: string, deviceId: string, phone: string,
): Promise<{ pairing_code: string | null } | { error: string }> {
  const { user } = await requireUser();
  if (!user) return { error: "Neautorizat" };
  if (!token.trim() || !deviceId) return { error: "Lipsesc datele." };
  if (!phone.trim()) return { error: "Introdu numarul de WhatsApp." };
  return requestNoticeWaPairing(token.trim(), deviceId, phone.trim());
}

// Poll the device; once authenticated, flip whatsapp.enabled on and persist status.
export async function checkNoticeWhatsappStatus(
  businessId: string, token: string, deviceId: string,
): Promise<{ status: string } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  if (!token.trim() || !deviceId) return { error: "Lipsesc datele." };

  const res = await pollNoticeWaStatus(token.trim(), deviceId);
  if ("error" in res) return res;

  const authed = res.status === "authenticated";
  await mergeNoticeConfig(owned.supabase, businessId, (c) => ({
    ...c,
    whatsapp: { enabled: authed, device_id: deviceId, device_name: c.whatsapp?.device_name ?? "Edinio", status: res.status },
  }));
  if (authed) revalidatePath("/dashboard/features/notice"); // only when the state actually changes
  return { status: res.status };
}

export async function disconnectNoticeWhatsapp(
  businessId: string, token: string, deviceId: string,
): Promise<{ success: true } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  if (deviceId && token.trim()) await deleteNoticeWaDevice(token.trim(), deviceId); // best-effort

  await mergeNoticeConfig(owned.supabase, businessId, (c) => {
    const triggers = Object.fromEntries(
      Object.entries(c.triggers ?? {}).map(([k, t]) => [k, { ...t, whatsapp: false }]),
    ) as NoticeConfig["triggers"];
    return { ...c, whatsapp: { enabled: false }, triggers };
  });
  revalidatePath("/dashboard/features/notice");
  return { success: true };
}

// ── Channel tests ───────────────────────────────────────────────────────────────

export async function sendNoticeTestWhatsapp(token: string, phone: string): Promise<{ success: true } | { error: string }> {
  const { user } = await requireUser();
  if (!user) return { error: "Neautorizat" };
  if (!token.trim()) return { error: "Introdu tokenul API." };
  if (!phone.trim()) return { error: "Introdu un numar de telefon." };
  const res = await sendNoticeWhatsapp(token.trim(), { number: phone.trim(), message: "Test WhatsApp din magazinul tau Edinio. Integrarea functioneaza!" });
  if (!res.success) return { error: res.error ?? "Trimitere esuata." };
  return { success: true };
}

export async function sendNoticeTestVoice(token: string, phone: string): Promise<{ success: true } | { error: string }> {
  const { user } = await requireUser();
  if (!user) return { error: "Neautorizat" };
  if (!token.trim()) return { error: "Introdu tokenul API." };
  if (!phone.trim()) return { error: "Introdu un numar de telefon." };
  const res = await sendNoticeAudio(token.trim(), { number: phone.trim(), text: "Acesta este un apel de test de la magazinul tau Edinio. Integrarea vocala functioneaza.", type: "draft" });
  if (!res.success) return { error: res.error ?? "Trimitere esuata." };
  return { success: true };
}

// ── Inbox (inbound replies captured by the webhook) ─────────────────────────────

export interface NoticeInboxItem {
  id: string;
  channel: string;
  from_number: string | null;
  body: string | null;
  received_at: string;
}

export async function getNoticeInbox(businessId: string): Promise<{ items: NoticeInboxItem[] } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  const { data } = await owned.supabase
    .from("notice_inbox").select("id, channel, from_number, body, received_at")
    .eq("business_id", businessId).order("received_at", { ascending: false }).limit(20);
  return { items: (data ?? []) as NoticeInboxItem[] };
}

// Re-read the stored config — used by the client to sync server-managed fields
// (whatsapp device + webhook secret) after a WhatsApp connect/disconnect.
export async function getNoticeConfig(businessId: string): Promise<{ config: NoticeConfig } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  const { data } = await owned.supabase
    .from("store_settings").select("notice_config").eq("business_id", businessId).single();
  return { config: (data?.notice_config as NoticeConfig | null) ?? EMPTY_CONFIG };
}
