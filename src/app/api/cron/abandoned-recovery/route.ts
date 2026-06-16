import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { sendAbandonedCartRecovery } from "@/lib/email";
import { sendSms, type SmsoConfig } from "@/lib/smso";
import { storeBaseUrl, PLATFORM_ORIGIN } from "@/lib/seo";
import {
  readAutomationConfig, isQuietHour, buildRecoverUrl, defaultRecoverySms,
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

  // Stores opted in + with automation enabled.
  const { data: settingsRows } = await admin
    .from("store_settings")
    .select("business_id, abandoned_cart_automation, smso_config")
    .eq("abandoned_cart_enabled", true);

  const active = (settingsRows ?? [])
    .map((s) => ({
      businessId: s.business_id,
      automation: readAutomationConfig(s.abandoned_cart_automation),
      smso: s.smso_config as SmsoConfig | null,
    }))
    .filter((s) => s.automation.enabled && s.automation.steps.length > 0);

  if (active.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const bizIds = active.map((a) => a.businessId);
  const { data: businesses } = await admin
    .from("businesses").select("id, slug, custom_domain, store_name, business_name, primary_color").in("id", bizIds);
  const bizMap = new Map((businesses ?? []).map((b) => [b.id, b]));

  const { data: optouts } = await admin
    .from("recovery_optout").select("business_id, email").in("business_id", bizIds);
  const optoutSet = new Set((optouts ?? []).map((o) => `${o.business_id}:${o.email.toLowerCase()}`));

  for (const store of active) {
    const biz = bizMap.get(store.businessId);
    if (!biz) continue;
    const storeUrl = storeBaseUrl({ slug: biz.slug, custom_domain: biz.custom_domain });
    const storeName = biz.store_name ?? biz.business_name;
    const smsoReady = !!(store.smso?.enabled && store.smso.api_key && store.smso.sender_id);

    const { data: carts } = await admin
      .from("abandoned_carts")
      .select("id, customer_name, email, phone, items, subtotal, created_at, automation_step, recovery_count")
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

      const recoverUrl = buildRecoverUrl(storeUrl, cart.id, step.discount_code ?? null);

      if (step.channel === "email") {
        const optedOut = !!(cart.email && optoutSet.has(`${store.businessId}:${cart.email.toLowerCase()}`));
        if (!cart.email || optedOut) { await advance(admin, cart.id, cart, now); continue; }
        try {
          await sendAbandonedCartRecovery(cart.email, {
            storeName,
            recoverUrl,
            customerName: cart.customer_name,
            items: (Array.isArray(cart.items) ? cart.items : []) as unknown as AbandonedCartItem[],
            total: Number(cart.subtotal || 0),
            color: biz.primary_color ?? "#1AB554",
            message: step.message,
            discountCode: step.discount_code ?? undefined,
            unsubscribeUrl: `${PLATFORM_ORIGIN}/api/recovery/unsubscribe?b=${store.businessId}&e=${encodeURIComponent(cart.email)}`,
          });
          await advance(admin, cart.id, cart, now, "email");
          sent++;
        } catch { /* leave for next run */ }
      } else {
        if (!cart.phone || !smsoReady) { await advance(admin, cart.id, cart, now); continue; }
        if (isQuietHour(store.automation.quiet_hours, nowHour)) continue; // defer SMS
        const body = step.message
          ? `${step.message} ${recoverUrl}`
          : defaultRecoverySms({ name: cart.customer_name, storeName, url: recoverUrl, code: step.discount_code ?? null });
        const res = await sendSms(store.smso!.api_key, {
          to: cart.phone, sender: store.smso!.sender_id, body, type: "marketing", remove_special_chars: true,
        });
        if (res.success) { await advance(admin, cart.id, cart, now, "sms"); sent++; }
      }
    }
  }

  console.log(`[abandoned-recovery] sent ${sent}`);
  return NextResponse.json({ ok: true, sent });
}
