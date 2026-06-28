"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/smso";
import type { SmsoConfig } from "@/lib/smso";
import { sendNoticeAbandonedSms } from "@/lib/notice-notify";
import type { NoticeConfig } from "@/lib/notice";
import { sendAbandonedCartRecovery } from "@/lib/email";
import { storeBaseUrl } from "@/lib/seo";
import { isPremiumPlan } from "@/lib/plans";
import { ABANDON_MINUTES, defaultRecoverySms, buildRecoverUrl, readAutomationConfig, interpolateRecoveryMessage, type AbandonedCartItem, type AbandonedCartsData, type AbandonedAutomationConfig } from "@/lib/abandoned-cart";
import type { Database } from "@/types/database.types";

type CartRow = Database["public"]["Tables"]["abandoned_carts"]["Row"];

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ── Capture (storefront, anonymous customers — admin client) ───────────────────
// Debounced, fire-and-forget from the checkout forms. Must never throw.
export async function trackAbandonedCart(input: {
  businessId: string;
  sessionId: string;
  source?: "cart" | "buy_now";
  name?: string;
  email?: string;
  phone?: string;
  items: AbandonedCartItem[];
}): Promise<void> {
  try {
    if (!input.businessId || !input.sessionId) return;

    const items = (Array.isArray(input.items) ? input.items : []).filter((i) => i && i.product_id);
    if (items.length === 0) return;

    const email = input.email?.trim() || null;
    const phone = input.phone?.trim() || null;
    // Need a usable recovery channel; otherwise there's nothing to act on.
    const hasContact = (!!email && email.includes("@")) || (!!phone && phone.replace(/\D/g, "").length >= 6);
    if (!hasContact) return;

    const admin = createAdminClient();

    // Respect the per-store opt-in flag.
    const { data: settings } = await admin
      .from("store_settings").select("abandoned_cart_enabled").eq("business_id", input.businessId).single();
    if (!settings?.abandoned_cart_enabled) return;

    // Don't resurrect a cart that already converted.
    const { data: existing } = await admin
      .from("abandoned_carts").select("status")
      .eq("business_id", input.businessId).eq("session_id", input.sessionId).maybeSingle();
    if (existing?.status === "converted") return;

    const subtotal = round2(items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0));
    const itemCount = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const now = new Date().toISOString();

    await admin.from("abandoned_carts").upsert(
      {
        business_id: input.businessId,
        session_id: input.sessionId,
        source: input.source ?? "cart",
        customer_name: input.name?.trim() || null,
        email,
        phone,
        items: items as never,
        item_count: itemCount,
        subtotal,
        status: "open",
        last_activity_at: now,
        updated_at: now,
      },
      { onConflict: "business_id,session_id" },
    );
  } catch {
    // Capture must never break the checkout flow.
  }
}

// ── Restore cart (storefront, anonymous) ──────────────────────────────────────
// Returns the cart's items refreshed against current products, for the "restore
// cart" recovery link. No personal data exposed; cartId is an unguessable uuid.
export async function getRecoverableCart(cartId: string): Promise<AbandonedCartItem[]> {
  try {
    if (!cartId) return [];
    const admin = createAdminClient();
    const { data: cart } = await admin
      .from("abandoned_carts").select("business_id, items, status").eq("id", cartId).single();
    if (!cart || cart.status === "converted") return [];

    const stored = (Array.isArray(cart.items) ? cart.items : []) as unknown as AbandonedCartItem[];
    const ids = stored.map((i) => i.product_id).filter(Boolean);
    if (ids.length === 0) return [];

    const { data: products } = await admin
      .from("products").select("id, name, price, images, is_active")
      .eq("business_id", cart.business_id).in("id", ids);
    const pmap = new Map((products ?? []).map((p) => [p.id, p]));

    const items: AbandonedCartItem[] = [];
    for (const it of stored) {
      const p = pmap.get(it.product_id);
      if (!p || !p.is_active) continue;
      items.push({
        product_id: p.id,
        name: p.name,
        price: Number(p.price) || 0,
        quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
        image_url: (Array.isArray(p.images) && p.images.length ? (p.images[0] as string) : it.image_url) ?? null,
      });
    }
    return items;
  } catch {
    return [];
  }
}

// ── Opt-in toggle (owner) ──────────────────────────────────────────────────────
export async function setAbandonedCartEnabled(
  businessId: string,
  enabled: boolean,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id, slug").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const { data: existing } = await supabase
    .from("store_settings").select("id").eq("business_id", businessId).single();

  let error;
  if (existing) {
    ({ error } = await supabase.from("store_settings")
      .update({ abandoned_cart_enabled: enabled, updated_at: new Date().toISOString() })
      .eq("business_id", businessId));
  } else {
    ({ error } = await supabase.from("store_settings")
      .insert({ business_id: businessId, abandoned_cart_enabled: enabled }));
  }
  if (error) return { error: "Eroare la salvare." };
  revalidatePath("/dashboard/abandoned");
  return { success: true };
}

// ── Dashboard data (owner) ─────────────────────────────────────────────────────
export async function getAbandonedCartsData(
  businessId: string,
): Promise<AbandonedCartsData | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, store_name, business_name, primary_color")
    .eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const { data: settings } = await supabase
    .from("store_settings").select("abandoned_cart_enabled, smso_config, abandoned_cart_automation, notice_config").eq("business_id", businessId).single();

  const [{ data: profile }, { data: discountRows }] = await Promise.all([
    supabase.from("users_profile").select("plan").eq("id", user.id).single(),
    supabase.from("discounts").select("code, type, value, expires_at").eq("business_id", businessId).eq("is_active", true).order("code"),
  ]);
  const isPremium = isPremiumPlan(profile?.plan);
  const nowMs = Date.now();
  const discounts = (discountRows ?? [])
    .filter((d) => !d.expires_at || new Date(d.expires_at).getTime() > nowMs)
    .map((d) => ({ code: d.code, type: d.type, value: Number(d.value) || 0 }));

  const enabled = settings?.abandoned_cart_enabled ?? false;
  const smso = settings?.smso_config as SmsoConfig | null;
  const smsoEnabled = !!(smso?.enabled && smso?.api_key && smso?.sender_id);
  const notice = settings?.notice_config as NoticeConfig | null;
  const smsEnabled = smsoEnabled || !!(notice?.enabled && notice.api_token && notice.abandoned?.enabled);

  const storeUrl = storeBaseUrl({ slug: biz.slug, custom_domain: biz.custom_domain });
  const primaryColor = biz.primary_color ?? "#1AB554";

  const windowStart = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data: rowsData } = await supabase
    .from("abandoned_carts")
    .select("id, customer_name, email, phone, items, item_count, subtotal, source, status, created_at, last_activity_at, converted_at, recovery_email_sent_at, recovery_sms_sent_at, recovery_count")
    .eq("business_id", businessId)
    .gte("created_at", windowStart)
    .order("last_activity_at", { ascending: false })
    .limit(1000);

  const all = (rowsData ?? []) as unknown as CartRow[];
  const now = Date.now();
  const threshold = now - ABANDON_MINUTES * 60_000;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  const t = (s: string | null) => (s ? new Date(s).getTime() : 0);
  const isAbandoned = (r: CartRow) => r.status === "open" && t(r.last_activity_at) < threshold;

  const abandoned = all.filter(isAbandoned);
  const abandonedMonth = abandoned.filter((r) => t(r.created_at) >= monthStart);
  const convertedMonth = all.filter((r) => r.status === "converted" && t(r.converted_at) >= monthStart);
  const recoveredMonth = convertedMonth.filter((r) => r.recovery_email_sent_at || r.recovery_sms_sent_at);

  const sum = (arr: CartRow[]) => round2(arr.reduce((s, r) => s + Number(r.subtotal || 0), 0));
  const abandonedValue = sum(abandoned);
  const denom = abandonedMonth.length + convertedMonth.length;
  const abandonRate = denom > 0 ? Math.round((abandonedMonth.length / denom) * 100) : 0;

  // Aggregate items across abandoned carts -> top abandoned products.
  const prodMap = new Map<string, { name: string; quantity: number; value: number; carts: number; image_url: string | null }>();
  for (const r of abandoned) {
    const items = (Array.isArray(r.items) ? r.items : []) as unknown as AbandonedCartItem[];
    const seen = new Set<string>();
    for (const it of items) {
      const key = it.product_id || it.name;
      if (!key) continue;
      const cur = prodMap.get(key) ?? { name: it.name || "Produs", quantity: 0, value: 0, carts: 0, image_url: it.image_url ?? null };
      cur.quantity += Number(it.quantity) || 0;
      cur.value = round2(cur.value + (Number(it.price) || 0) * (Number(it.quantity) || 0));
      if (!seen.has(key)) { cur.carts += 1; seen.add(key); }
      if (!cur.image_url && it.image_url) cur.image_url = it.image_url;
      prodMap.set(key, cur);
    }
  }
  const abandonedProducts = [...prodMap.values()].sort((a, b) => b.value - a.value).slice(0, 8);

  return {
    enabled,
    smsoEnabled,
    smsEnabled,
    storeUrl,
    storeName: biz.store_name ?? biz.business_name,
    primaryColor,
    kpis: {
      abandonedCount: abandoned.length,
      abandonedValue,
      avgCartValue: abandoned.length ? round2(abandonedValue / abandoned.length) : 0,
      abandonRate,
      recoveredCount: recoveredMonth.length,
      recoveredValue: sum(recoveredMonth),
    },
    potentialRevenueThisMonth: sum(abandonedMonth),
    abandonedProducts,
    carts: abandoned.slice(0, 100).map((r) => ({
      id: r.id,
      customer_name: r.customer_name,
      email: r.email,
      phone: r.phone,
      items: (Array.isArray(r.items) ? r.items : []) as unknown as AbandonedCartItem[],
      item_count: r.item_count,
      subtotal: Number(r.subtotal || 0),
      source: r.source,
      last_activity_at: r.last_activity_at,
      created_at: r.created_at,
      recovery_email_sent_at: r.recovery_email_sent_at,
      recovery_sms_sent_at: r.recovery_sms_sent_at,
      recovery_count: r.recovery_count,
    })),
    automation: readAutomationConfig(settings?.abandoned_cart_automation),
    isPremium,
    discounts,
  };
}

// ── Save automation config (owner) ─────────────────────────────────────────────
export async function saveAbandonedCartAutomation(
  businessId: string,
  config: AbandonedAutomationConfig,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const { data: profile } = await supabase.from("users_profile").select("plan").eq("id", user.id).single();
  if (!isPremiumPlan(profile?.plan)) {
    return { error: "Automatizarile sunt disponibile doar pe planurile Premium." };
  }

  const clean = readAutomationConfig(config);

  const { data: existing } = await supabase
    .from("store_settings").select("id").eq("business_id", businessId).single();

  let error;
  if (existing) {
    ({ error } = await supabase.from("store_settings")
      .update({ abandoned_cart_automation: clean as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId));
  } else {
    ({ error } = await supabase.from("store_settings")
      .insert({ business_id: businessId, abandoned_cart_automation: clean as never }));
  }
  if (error) return { error: "Eroare la salvarea automatizarii." };
  revalidatePath("/dashboard/abandoned");
  return { success: true };
}

// ── Recovery: email (owner) ────────────────────────────────────────────────────
export async function sendAbandonedCartEmail(
  businessId: string,
  cartId: string,
  message?: string,
  discountCode?: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, store_name, business_name, primary_color")
    .eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const { data: cart } = await supabase
    .from("abandoned_carts").select("id, customer_name, email, items, subtotal, recovery_count")
    .eq("id", cartId).eq("business_id", businessId).single();
  if (!cart) return { error: "Cosul nu a fost gasit." };
  if (!cart.email) return { error: "Clientul nu a lasat un email." };

  try {
    const storeUrl = storeBaseUrl({ slug: biz.slug, custom_domain: biz.custom_domain });
    await sendAbandonedCartRecovery(cart.email, {
      storeName: biz.store_name ?? biz.business_name,
      recoverUrl: buildRecoverUrl(storeUrl, cartId, discountCode?.trim() || null),
      customerName: cart.customer_name,
      items: (Array.isArray(cart.items) ? cart.items : []) as unknown as AbandonedCartItem[],
      total: Number(cart.subtotal || 0),
      color: biz.primary_color ?? "#1AB554",
      message: message?.trim() ? interpolateRecoveryMessage(message, { name: cart.customer_name, store: biz.store_name ?? biz.business_name }) : undefined,
      discountCode: discountCode?.trim() || undefined,
    });
  } catch {
    return { error: "Emailul nu a putut fi trimis." };
  }

  await supabase.from("abandoned_carts")
    .update({
      recovery_email_sent_at: new Date().toISOString(),
      recovery_count: (cart.recovery_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cartId).eq("business_id", businessId);

  revalidatePath("/dashboard/abandoned");
  return { success: true };
}

// ── Recovery: SMS (owner, requires SMSO) ───────────────────────────────────────
export async function sendAbandonedCartSms(
  businessId: string,
  cartId: string,
  message?: string,
  discountCode?: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id, slug, custom_domain, store_name, business_name")
    .eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const { data: settings } = await supabase
    .from("store_settings").select("smso_config, notice_config").eq("business_id", businessId).single();
  const smso = settings?.smso_config as SmsoConfig | null;
  const notice = settings?.notice_config as NoticeConfig | null;
  const smsoReady = !!(smso?.enabled && smso.api_key && smso.sender_id);
  const noticeReady = !!(notice?.enabled && notice.api_token && notice.abandoned?.enabled);
  if (!smsoReady && !noticeReady) return { error: "Activeaza SMSO sau notice.ro (cos abandonat) ca sa trimiti SMS." };

  const { data: cart } = await supabase
    .from("abandoned_carts").select("id, customer_name, phone, recovery_count")
    .eq("id", cartId).eq("business_id", businessId).single();
  if (!cart) return { error: "Cosul nu a fost gasit." };
  if (!cart.phone) return { error: "Clientul nu a lasat un numar de telefon." };

  const storeUrl = storeBaseUrl({ slug: biz.slug, custom_domain: biz.custom_domain });
  const recoverUrl = buildRecoverUrl(storeUrl, cartId, discountCode?.trim() || null);
  const body = message?.trim()
    ? `${interpolateRecoveryMessage(message, { name: cart.customer_name, store: biz.store_name ?? biz.business_name })} ${recoverUrl}`
    : defaultRecoverySms({
        name: cart.customer_name,
        storeName: biz.store_name ?? biz.business_name,
        url: recoverUrl,
        code: discountCode?.trim() || null,
      });

  // Prefer notice.ro when the merchant enabled it for abandoned carts, else SMSO.
  if (noticeReady) {
    const r = await sendNoticeAbandonedSms(supabase, notice, { businessId, phone: cart.phone, body });
    if (!r.success) return { error: r.error ?? "SMS-ul nu a putut fi trimis." };
  } else {
    const res = await sendSms(smso!.api_key, {
      to: cart.phone, sender: smso!.sender_id, body, type: "marketing", remove_special_chars: true,
    });
    if (!res.success) return { error: res.error ?? "SMS-ul nu a putut fi trimis." };
  }

  await supabase.from("abandoned_carts")
    .update({
      recovery_sms_sent_at: new Date().toISOString(),
      recovery_count: (cart.recovery_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cartId).eq("business_id", businessId);

  revalidatePath("/dashboard/abandoned");
  return { success: true };
}

// ── Delete (owner) ─────────────────────────────────────────────────────────────
export async function deleteAbandonedCart(
  businessId: string,
  cartId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { error } = await supabase
    .from("abandoned_carts").delete().eq("id", cartId).eq("business_id", businessId);
  if (error) return { error: "Eroare la stergere." };

  revalidatePath("/dashboard/abandoned");
  return { success: true };
}
