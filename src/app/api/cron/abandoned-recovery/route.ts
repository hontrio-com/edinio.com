import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { sendAbandonedCartRecovery } from "@/lib/email";
import { getStoreEmailSender } from "@/lib/email/sender";
import { sendSms, type SmsoConfig } from "@/lib/smso";
import { sendNoticeAbandonedSms } from "@/lib/notice-notify";
import type { NoticeConfig } from "@/lib/notice";
import { storeBaseUrl, PLATFORM_ORIGIN } from "@/lib/seo";
import { isPremiumPlan } from "@/lib/plans";
import {
  readAutomationConfig, isQuietHour, buildRecoverUrl, defaultRecoverySms, interpolateRecoveryMessage,
  ABANDON_MINUTES, type AbandonedCartItem,
} from "@/lib/abandoned-cart";

type Admin = SupabaseClient<Database>;

function verifyCron(req: NextRequest): boolean {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return secret === process.env.CRON_SECRET;
}

// Advance a cart's automation pointer; record the send when a channel fired.
async function advance(
  admin: Admin, cartId: string,
  cart: { automation_step: number; recovery_count: number },
  now: Date, channel?: "email" | "sms",
): Promise<void> {
  const patch: Record<string, unknown> = {
    automation_step: (cart.automation_step ?? 0) + 1,
    last_recovery_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  if (channel) {
    patch.recovery_count = (cart.recovery_count ?? 0) + 1;
    if (channel === "email") patch.recovery_email_sent_at = now.toISOString();
    else patch.recovery_sms_sent_at = now.toISOString();
  }
  await admin.from("abandoned_carts").update(patch as never).eq("id", cartId);
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const now = new Date();
  const nowHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bucharest", hour: "2-digit", hour12: false }).format(now),
  );
  const thresholdIso = new Date(now.getTime() - ABANDON_MINUTES * 60_000).toISOString();
  let sent = 0;

  // Stores opted in + with automation enabled. Windowed — un query simplu e
  // taiat silentios la 1000 de randuri (cap PostgREST).
  const settingsRows: { business_id: string; abandoned_cart_automation: unknown; smso_config: unknown; notice_config: unknown }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("store_settings")
      .select("business_id, abandoned_cart_automation, smso_config, notice_config")
      .eq("abandoned_cart_enabled", true)
      .order("business_id")
      .range(from, from + 999);
    settingsRows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const active = settingsRows
    .map((s) => ({
      businessId: s.business_id,
      automation: readAutomationConfig(s.abandoned_cart_automation),
      smso: s.smso_config as SmsoConfig | null,
      notice: s.notice_config as NoticeConfig | null,
    }))
    .filter((s) => s.automation.enabled && s.automation.steps.length > 0);

  if (active.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  // Lookup-urile pe .in() merg in chunk-uri de 500 de id-uri: o lista mai mare
  // depaseste limita de URL si raspunsul oricum se taie la 1000 de randuri.
  const bizIds = active.map((a) => a.businessId);
  const businesses: { id: string; user_id: string; slug: string; custom_domain: string | null; store_name: string | null; business_name: string; primary_color: string | null }[] = [];
  for (let i = 0; i < bizIds.length; i += 500) {
    const { data } = await admin
      .from("businesses").select("id, user_id, slug, custom_domain, store_name, business_name, primary_color").in("id", bizIds.slice(i, i + 500));
    businesses.push(...(data ?? []));
  }
  const bizMap = new Map(businesses.map((b) => [b.id, b]));

  // Automations are a Premium feature — skip stores whose owner isn't on Premium/Ultra.
  const ownerIds = [...new Set(businesses.map((b) => b.user_id))];
  const profiles: { id: string; plan: string }[] = [];
  for (let i = 0; i < ownerIds.length; i += 500) {
    const { data } = await admin.from("users_profile").select("id, plan").in("id", ownerIds.slice(i, i + 500));
    profiles.push(...(data ?? []));
  }
  const planMap = new Map(profiles.map((p) => [p.id, p.plan]));

  // Optout-urile pot fi multe per magazin — ferestre .range() per chunk.
  const optouts: { business_id: string; email: string }[] = [];
  for (let i = 0; i < bizIds.length; i += 500) {
    const chunk = bizIds.slice(i, i + 500);
    for (let from = 0; ; from += 1000) {
      const { data } = await admin
        .from("recovery_optout").select("business_id, email").in("business_id", chunk)
        .order("business_id").order("email").range(from, from + 999);
      optouts.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
  }
  const optoutSet = new Set(optouts.map((o) => `${o.business_id}:${o.email.toLowerCase()}`));

  for (const store of active) {
    const biz = bizMap.get(store.businessId);
    if (!biz) continue;
    if (!isPremiumPlan(planMap.get(biz.user_id))) continue; // Premium-only
    const storeUrl = storeBaseUrl({ slug: biz.slug, custom_domain: biz.custom_domain });
    const storeName = biz.store_name ?? biz.business_name;
    const smsoReady = !!(store.smso?.enabled && store.smso.api_key && store.smso.sender_id);
    const noticeReady = !!(store.notice?.enabled && store.notice.api_token && store.notice.abandoned?.enabled);

    const { data: carts } = await admin
      .from("abandoned_carts")
      .select("id, customer_name, email, phone, items, subtotal, created_at, automation_step, recovery_count, last_recovery_at")
      .eq("business_id", store.businessId)
      .eq("status", "open")
      .lt("last_activity_at", thresholdIso)
      .limit(500);

    for (const cart of carts ?? []) {
      const step = store.automation.steps[cart.automation_step];
      if (!step) continue; // sequence finished

      if (store.automation.min_cart_value && Number(cart.subtotal || 0) < store.automation.min_cart_value) continue;
      const hoursOld = (now.getTime() - new Date(cart.created_at).getTime()) / 3_600_000;
      if (hoursOld < step.delay_hours) continue;
      // Anti-spam: never send two automation messages within an hour of each other
      // (matters when automation is enabled on already-old carts that catch up).
      if (cart.last_recovery_at && now.getTime() - new Date(cart.last_recovery_at).getTime() < 3_600_000) continue;

      const recoverUrl = buildRecoverUrl(storeUrl, cart.id, step.discount_code ?? null);

      if (step.channel === "email") {
        const optedOut = !!(cart.email && optoutSet.has(`${store.businessId}:${cart.email.toLowerCase()}`));
        if (!cart.email || optedOut) { await advance(admin, cart.id, cart, now); continue; }
        try {
          const emailSender = await getStoreEmailSender(admin, store.businessId);
          await sendAbandonedCartRecovery(cart.email, {
            storeName,
            recoverUrl,
            customerName: cart.customer_name,
            items: (Array.isArray(cart.items) ? cart.items : []) as unknown as AbandonedCartItem[],
            total: Number(cart.subtotal || 0),
            color: biz.primary_color ?? "#1AB554",
            message: step.message ? interpolateRecoveryMessage(step.message, { name: cart.customer_name, store: storeName }) : undefined,
            discountCode: step.discount_code ?? undefined,
            unsubscribeUrl: `${PLATFORM_ORIGIN}/api/recovery/unsubscribe?b=${store.businessId}&e=${encodeURIComponent(cart.email)}`,
          }, emailSender);
          await advance(admin, cart.id, cart, now, "email");
          sent++;
        } catch { /* leave for next run */ }
      } else {
        if (!cart.phone || (!smsoReady && !noticeReady)) { await advance(admin, cart.id, cart, now); continue; }
        if (isQuietHour(store.automation.quiet_hours, nowHour)) continue; // defer SMS
        const body = step.message
          ? `${interpolateRecoveryMessage(step.message, { name: cart.customer_name, store: storeName })} ${recoverUrl}`
          : defaultRecoverySms({ name: cart.customer_name, storeName, url: recoverUrl, code: step.discount_code ?? null });
        // Prefer notice.ro when enabled for abandoned carts, else SMSO.
        let smsOk = false;
        if (noticeReady) {
          const r = await sendNoticeAbandonedSms(admin, store.notice, { businessId: store.businessId, phone: cart.phone, body });
          smsOk = r.success;
        } else {
          const res = await sendSms(store.smso!.api_key, {
            to: cart.phone, sender: store.smso!.sender_id, body, type: "marketing", remove_special_chars: true,
          });
          smsOk = res.success;
        }
        if (smsOk) { await advance(admin, cart.id, cart, now, "sms"); sent++; }
      }
    }
  }

  console.log(`[abandoned-recovery] sent ${sent}`);
  return NextResponse.json({ ok: true, sent });
}
