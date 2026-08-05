"use server";

import { randomUUID } from "node:crypto";
import { consumaLimita, mesajLimita } from "@/lib/utils/limita-durabila";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mascheazaConfig } from "@/lib/integrari/secrete";
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
//
// Partea CITITA merge pe service role: vederea `store_settings` nu mai
// decripteaza pentru `authenticated`, deci `api_token` si `webhook_secret` ar
// veni de acolo ca siruri `enc.v1.…` si s-ar scrie inapoi criptate inca o data
// peste ele insele — tokenul si webhook-ul magazinului s-ar pierde definitiv.
// Scrierea ramane pe clientul utilizatorului, ca RLS sa se aplice mai departe;
// service role ocoleste RLS, iar dreptul asupra magazinului l-a verificat deja
// `requireOwned` in fiecare apelant.
async function mergeNoticeConfig(
  supabase: Supa,
  businessId: string,
  mutate: (c: NoticeConfig) => NoticeConfig,
): Promise<NoticeConfig | { error: string }> {
  const { data } = await createAdminClient()
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

  // `_completate` e harta pentru interfata, pusa de `mascheazaConfig` peste config
  // la incarcarea paginii — nu e un camp al integrarii. Clientul o primeste odata
  // cu restul formularului si o trimite inapoi la salvare; fara linia asta ajunge
  // SCRISA in `notice_config` si de acolo se reintoarce la fiecare salvare
  // urmatoare. (`pastreazaSecretele` o sterge pe celelalte 15 integrari; calea
  // asta nu trece prin el.)
  const primit: NoticeConfig = { ...config };
  delete (primit as { _completate?: unknown })._completate;

  const saved = await mergeNoticeConfig(owned.supabase, businessId, (current) => ({
    ...primit,
    // Server-managed fields the client must never clobber: the WhatsApp connection
    // state is owned entirely by the connect/disconnect/poll actions (a stale client
    // copy could otherwise flip it off on save), and the webhook secret persists.
    //
    // `webhook_secret` NU se mai ia deloc de la client, desi pana acum copia lui
    // avea intaietate. E criptat in baza si formularul il primeste doar ca sa-l
    // AFISEZE; de cand vederea nu mai decripteaza pentru `authenticated`, ce
    // trimite clientul inapoi poate fi sirul `enc.v1.…`, iar scris asa ar fi
    // criptat a doua oara si niciun webhook n-ar mai gasi magazinul. Campul e
    // oricum „server-managed", cum scrie mai sus — acum si in fapt.
    webhook_secret: current.webhook_secret || randomUUID(),
    // `api_token` ajunge in formular MASCAT (gol), deci trebuie pastrat la fel ca
    // `webhook_secret`. Fara linia asta, prima salvare obisnuita il sterge si se
    // opresc SMS-urile si WhatsApp-ul catre clientii magazinului.
    api_token: primit.api_token || current.api_token,
    whatsapp: current.whatsapp,
  }));
  if ("error" in saved) return saved;

  revalidatePath("/dashboard/features/notice");
  revalidatePath("/dashboard/features");
  /*
   * Raspunsul MERGE LA BROWSER: `NoticeConfigClient` face `setConfig(res.config)`
   * dupa salvare. Iar `saved` contine tokenul REAL — `current` vine de la
   * `mergeNoticeConfig`, care din 2026-08-05 citeste cu service role, deci
   * decriptat, si linia de mai sus il pune la loc tocmai fiindca formularul l-a
   * trimis gol.
   *
   * Deci fara masca de aici, salvarea ar fi trimis in clar exact secretul pe care
   * pagina si `getNoticeConfig` il ascund cu grija — si l-ar fi trimis la FIECARE
   * apasare pe „Salveaza", nu doar la incarcare. Aceeasi masca, acelasi
   * `_completate`, aceeasi forma ca la incarcarea paginii.
   */
  return { success: true, config: (mascheazaConfig("notice_config", saved) as NoticeConfig | null) ?? EMPTY_CONFIG };
}

// Validate the token by making an authenticated call (templates list). Free — no SMS sent.
export async function testNoticeConnection(
  businessId: string,
  token: string,
): Promise<{ ok: true; templateCount: number } | { ok: false; error: string }> {
  const { user } = await requireUser();
  if (!user) return { ok: false, error: "Neautorizat" };
  const tokenReal = await tokenulNotice(businessId, token);
  if (!tokenReal) return { ok: false, error: "Introdu tokenul API." };
  return testNoticeToken(tokenReal);
}

export async function listNoticeTemplates(
  businessId: string,
  token: string,
): Promise<{ templates: NoticeTemplate[] } | { error: string }> {
  const { user } = await requireUser();
  if (!user) return { error: "Neautorizat" };
  const tokenReal = await tokenulNotice(businessId, token);
  if (!tokenReal) return { error: "Introdu tokenul API." };
  const res = await getNoticeTemplates(tokenReal);
  if ("error" in res) return res;
  return { templates: res };
}

export async function sendNoticeTestSms(
  businessId: string,
  token: string,
  phone: string,
): Promise<{ success: true } | { error: string }> {
  const { user } = await requireUser();
  if (!user) return { error: "Neautorizat" };
  if (!phone.trim()) return { error: "Introdu un numar de telefon." };
  const tokenReal = await tokenulNotice(businessId, token);
  if (!tokenReal) return { error: "Introdu tokenul API." };

  // Trimite un SMS real catre un numar ales de apelant. Vezi si /api/sms/test:
  // fara plafon, e o unealta de bombardare cu SMS-uri.
  const lim = await consumaLimita(`notice-test:${user.id}`, 5, 3600, 3600);
  if (!lim.permis) return { error: mesajLimita(lim, "Ai trimis deja destule mesaje de test. Incearca peste o ora.") };
  const res = await sendNoticeSms(tokenReal, {
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
  businessId: string, token: string, deviceId: string,
): Promise<{ qr_code: string | null } | { error: string }> {
  const { user } = await requireUser();
  if (!user) return { error: "Neautorizat" };
  if (!deviceId) return { error: "Lipsesc datele." };
  const tokenReal = await tokenulNotice(businessId, token);
  if (!tokenReal) return { error: "Introdu tokenul API." };
  return refreshNoticeWaQr(tokenReal, deviceId);
}

export async function requestNoticeWhatsappPairing(
  businessId: string, token: string, deviceId: string, phone: string,
): Promise<{ pairing_code: string | null } | { error: string }> {
  const { user } = await requireUser();
  if (!user) return { error: "Neautorizat" };
  if (!deviceId) return { error: "Lipsesc datele." };
  if (!phone.trim()) return { error: "Introdu numarul de WhatsApp." };
  const tokenReal = await tokenulNotice(businessId, token);
  if (!tokenReal) return { error: "Introdu tokenul API." };
  return requestNoticeWaPairing(tokenReal, deviceId, phone.trim());
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
  const tokenReal = await tokenulNotice(businessId, token);
  if (deviceId && tokenReal) await deleteNoticeWaDevice(tokenReal, deviceId); // best-effort

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


/**
 * Tokenul real al magazinului, pentru orice apel catre notice.ro pornit din formular.
 *
 * Formularul primeste `api_token` MASCAT (gol), deci orice actiune care se bazeaza
 * pe valoarea venita de la client ar pleca spre notice.ro cu sirul gol si ar
 * raspunde mereu „neautorizat" — arata ca o integrare stricata, desi e doar
 * mascarea. Cand clientul nu trimite nimic, citim valoarea salvata.
 *
 * Se aplica la TOATE cele sase actiuni care consuma tokenul, nu doar la testele
 * de trimitere: si validarea conexiunii, si lista de sabloane, si imperecherea
 * WhatsApp treceau prin aceeasi valoare.
 *
 * Citirea din baza merge pe SERVICE ROLE, fiindca tokenul pleaca spre notice.ro
 * si trebuie sa fie in clar: vederea `store_settings` nu mai decripteaza pentru
 * `authenticated`, deci cu clientul utilizatorului am trimite sirul `enc.v1.…` si
 * am primi „neautorizat" — adica exact simptomul pe care functia asta il repara.
 * Service role ocoleste RLS, de aceea `requireOwned` ramane INAINTE de citire.
 */
async function tokenulNotice(businessId: string, primit: string): Promise<string> {
  if (primit.trim()) return primit.trim();
  const owned = await requireOwned(businessId);
  if ("error" in owned) return "";
  const { data } = await createAdminClient()
    .from("store_settings").select("notice_config").eq("business_id", businessId).single();
  const cfg = (data?.notice_config as NoticeConfig | null) ?? EMPTY_CONFIG;
  return (cfg.api_token ?? "").trim();
}

export async function sendNoticeTestWhatsapp(businessId: string, token: string, phone: string): Promise<{ success: true } | { error: string }> {
  const { user } = await requireUser();
  if (!user) return { error: "Neautorizat" };
  if (!phone.trim()) return { error: "Introdu un numar de telefon." };
  const tokenReal = await tokenulNotice(businessId, token);
  if (!tokenReal) return { error: "Introdu tokenul API." };

  // Trimite un SMS real catre un numar ales de apelant. Vezi si /api/sms/test:
  // fara plafon, e o unealta de bombardare cu SMS-uri.
  const lim = await consumaLimita(`notice-test:${user.id}`, 5, 3600, 3600);
  if (!lim.permis) return { error: mesajLimita(lim, "Ai trimis deja destule mesaje de test. Incearca peste o ora.") };
  const res = await sendNoticeWhatsapp(tokenReal, { number: phone.trim(), message: "Test WhatsApp din magazinul tau Edinio. Integrarea functioneaza!" });
  if (!res.success) return { error: res.error ?? "Trimitere esuata." };
  return { success: true };
}

export async function sendNoticeTestVoice(businessId: string, token: string, phone: string): Promise<{ success: true } | { error: string }> {
  const { user } = await requireUser();
  if (!user) return { error: "Neautorizat" };
  if (!phone.trim()) return { error: "Introdu un numar de telefon." };
  const tokenReal = await tokenulNotice(businessId, token);
  if (!tokenReal) return { error: "Introdu tokenul API." };

  // Trimite un SMS real catre un numar ales de apelant. Vezi si /api/sms/test:
  // fara plafon, e o unealta de bombardare cu SMS-uri.
  const lim = await consumaLimita(`notice-test:${user.id}`, 5, 3600, 3600);
  if (!lim.permis) return { error: mesajLimita(lim, "Ai trimis deja destule mesaje de test. Incearca peste o ora.") };
  const res = await sendNoticeAudio(tokenReal, { number: phone.trim(), text: "Acesta este un apel de test de la magazinul tau Edinio. Integrarea vocala functioneaza.", type: "draft" });
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
//
// Citirea merge pe service role fiindca `webhook_secret` e criptat in baza si
// clientul chiar are nevoie de valoarea REALA: din ea isi compune URL-ul de
// webhook pe care comerciantul il lipeste in contul lui de notice.ro. Cu clientul
// utilizatorului ar primi sirul `enc.v1.…` si ar afisa un URL pe care nicio
// notificare nu l-ar mai potrivi cu vreun magazin.
//
// Fiindca service role decripteaza TOT, raspunsul trece obligatoriu prin
// `mascheazaConfig`: `api_token` pleaca gol spre browser, insotit de `_completate`,
// exact ca la incarcarea paginii. Altfel citirea asta ar redeschide, mai larg,
// chiar gaura pentru care s-a scris migratia.
export async function getNoticeConfig(businessId: string): Promise<{ config: NoticeConfig } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  const { data } = await createAdminClient()
    .from("store_settings").select("notice_config").eq("business_id", businessId).single();
  const mascat = mascheazaConfig("notice_config", data?.notice_config) as NoticeConfig | null;
  return { config: mascat ?? EMPTY_CONFIG };
}
