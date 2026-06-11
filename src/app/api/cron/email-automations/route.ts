import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sendAutomationEmail,
  emailOnboardingNotStarted, emailOnboardingStuck, emailOnboardingHelp, emailOnboardingLastChance,
  emailTrialTips, emailNoProducts, emailNoOrders,
  emailTrialExpires3d, emailTrialExpires1d, emailTrialExpired,
  emailInactive7d, emailInactive14d,
  emailFirstOrder, emailMilestone10, emailMilestone,
  emailReactivate3d, emailReactivate7d,
} from "@/lib/email-automations";

// Verify cron secret to prevent unauthorized calls
function verifyCron(req: NextRequest): boolean {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return secret === process.env.CRON_SECRET;
}

function hoursBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / 3600000;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / 86400000;
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const now = new Date();
  let sent = 0;

  // Get all sent automation keys to avoid duplicates
  const { data: allSent } = await admin.from("email_automations").select("user_id, email_key");
  const sentSet = new Set((allSent ?? []).map(s => `${s.user_id}:${s.email_key}`));

  function alreadySent(userId: string, key: string): boolean {
    return sentSet.has(`${userId}:${key}`);
  }

  async function markSent(userId: string, key: string): Promise<void> {
    sentSet.add(`${userId}:${key}`);
    await admin.from("email_automations").insert({ user_id: userId, email_key: key } as never).then(() => {}, () => {});
  }

  // ── Fetch all users with auth data ─────────────────────────────────────────
  const { data: profiles } = await admin
    .from("users_profile")
    .select("id, full_name, plan, plan_expires_at, onboarding_step, onboarding_completed, created_at");

  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const authMap = new Map((authList?.users ?? []).map(u => [u.id, u]));

  // ── Fetch businesses + product counts + order counts ───────────────────────
  const { data: businesses } = await admin.from("businesses").select("id, user_id, slug, business_name, created_at");
  const bizMap = new Map((businesses ?? []).map(b => [b.user_id, b]));

  const { data: productCounts } = await admin.from("products").select("business_id");
  const prodCountMap: Record<string, number> = {};
  for (const p of productCounts ?? []) {
    prodCountMap[p.business_id] = (prodCountMap[p.business_id] ?? 0) + 1;
  }

  const { data: orderCounts } = await admin.from("orders").select("business_id");
  const orderCountMap: Record<string, number> = {};
  for (const o of orderCounts ?? []) {
    orderCountMap[o.business_id] = (orderCountMap[o.business_id] ?? 0) + 1;
  }

  // ── Process each user ──────────────────────────────────────────────────────
  for (const profile of profiles ?? []) {
    const auth = authMap.get(profile.id);
    if (!auth?.email) continue;

    const email = auth.email;
    const name = profile.full_name ?? "";
    const createdAt = new Date(profile.created_at);
    const biz = bizMap.get(profile.id);
    const lastSignIn = auth.last_sign_in_at ? new Date(auth.last_sign_in_at) : null;

    // Skip admins
    if (auth.app_metadata?.role === "admin") continue;

    // ── A. ONBOARDING ABANDONAT (fara magazin) ────────────────────────────
    if (!profile.onboarding_completed && !biz) {
      const hoursOld = hoursBetween(createdAt, now);
      const daysOld = daysBetween(createdAt, now);

      // A1: +2 ore, nu a inceput onboarding
      if (hoursOld >= 2 && profile.onboarding_step === "registered") {
        const e = emailOnboardingNotStarted(name);
        if (!alreadySent(profile.id, e.key)) {
          if (await sendAutomationEmail(email, e)) { await markSent(profile.id, e.key); sent++; }
        }
      }

      // A2: +24 ore, blocat la detalii/personalizare
      if (hoursOld >= 24 && (profile.onboarding_step === "details" || profile.onboarding_step === "customize")) {
        const e = emailOnboardingStuck(name);
        if (!alreadySent(profile.id, e.key)) {
          if (await sendAutomationEmail(email, e)) { await markSent(profile.id, e.key); sent++; }
        }
      }

      // A3: +3 zile
      if (daysOld >= 3) {
        const e = emailOnboardingHelp(name);
        if (!alreadySent(profile.id, e.key)) {
          if (await sendAutomationEmail(email, e)) { await markSent(profile.id, e.key); sent++; }
        }
      }

      // A4: +7 zile
      if (daysOld >= 7) {
        const e = emailOnboardingLastChance(name);
        if (!alreadySent(profile.id, e.key)) {
          if (await sendAutomationEmail(email, e)) { await markSent(profile.id, e.key); sent++; }
        }
      }

      continue; // Skip other checks for users without business
    }

    if (!biz) continue;

    const bizCreatedAt = new Date(biz.created_at);
    const bizDaysOld = daysBetween(bizCreatedAt, now);
    const productCount = prodCountMap[biz.id] ?? 0;
    const orderCount = orderCountMap[biz.id] ?? 0;

    // ── B. TRIAL ACTIV ───────────────────────────────────────────────────
    if (profile.plan === "free" && profile.plan_expires_at) {
      const expiresAt = new Date(profile.plan_expires_at);
      const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / 86400000;
      const daysSinceExpiry = (now.getTime() - expiresAt.getTime()) / 86400000;

      // B5: +3 zile dupa creare magazin
      if (bizDaysOld >= 3 && daysUntilExpiry > 3) {
        const e = emailTrialTips(name, biz.slug);
        if (!alreadySent(profile.id, e.key)) {
          if (await sendAutomationEmail(email, e)) { await markSent(profile.id, e.key); sent++; }
        }
      }

      // B6: 0 produse, +2 zile
      if (productCount === 0 && bizDaysOld >= 2) {
        const e = emailNoProducts(name, biz.business_name);
        if (!alreadySent(profile.id, e.key)) {
          if (await sendAutomationEmail(email, e)) { await markSent(profile.id, e.key); sent++; }
        }
      }

      // B7: Are produse, 0 comenzi, +5 zile
      if (productCount > 0 && orderCount === 0 && bizDaysOld >= 5) {
        const e = emailNoOrders(name, biz.business_name);
        if (!alreadySent(profile.id, e.key)) {
          if (await sendAutomationEmail(email, e)) { await markSent(profile.id, e.key); sent++; }
        }
      }

      // B8: Trial expira in 3 zile
      if (daysUntilExpiry <= 3 && daysUntilExpiry > 1) {
        const e = emailTrialExpires3d(name, biz.business_name);
        if (!alreadySent(profile.id, e.key)) {
          if (await sendAutomationEmail(email, e)) { await markSent(profile.id, e.key); sent++; }
        }
      }

      // B9: Trial expira maine
      if (daysUntilExpiry <= 1 && daysUntilExpiry > 0) {
        const e = emailTrialExpires1d(name, biz.business_name);
        if (!alreadySent(profile.id, e.key)) {
          if (await sendAutomationEmail(email, e)) { await markSent(profile.id, e.key); sent++; }
        }
      }

      // B10: Trial expirat (ziua 0)
      if (daysSinceExpiry >= 0 && daysSinceExpiry < 1) {
        const e = emailTrialExpired(name, biz.business_name);
        if (!alreadySent(profile.id, e.key)) {
          if (await sendAutomationEmail(email, e)) { await markSent(profile.id, e.key); sent++; }
        }
      }

      // E17: +3 zile dupa expirare
      if (daysSinceExpiry >= 3) {
        const e = emailReactivate3d(name, biz.business_name);
        if (!alreadySent(profile.id, e.key)) {
          if (await sendAutomationEmail(email, e)) { await markSent(profile.id, e.key); sent++; }
        }
      }

      // E18: +7 zile dupa expirare
      if (daysSinceExpiry >= 7) {
        const e = emailReactivate7d(name, biz.business_name);
        if (!alreadySent(profile.id, e.key)) {
          if (await sendAutomationEmail(email, e)) { await markSent(profile.id, e.key); sent++; }
        }
      }
    }

    // ── C. RETENTIE (plan platit sau free activ) ─────────────────────────
    if (lastSignIn && profile.plan !== "free") {
      const inactiveDays = daysBetween(lastSignIn, now);

      // C11: 7 zile inactivitate
      if (inactiveDays >= 7 && inactiveDays < 14) {
        const e = emailInactive7d(name, biz.business_name);
        if (!alreadySent(profile.id, e.key)) {
          if (await sendAutomationEmail(email, e)) { await markSent(profile.id, e.key); sent++; }
        }
      }

      // C12: 14 zile inactivitate
      if (inactiveDays >= 14) {
        const e = emailInactive14d(name, biz.business_name);
        if (!alreadySent(profile.id, e.key)) {
          if (await sendAutomationEmail(email, e)) { await markSent(profile.id, e.key); sent++; }
        }
      }
    }

    // ── D. MILESTONES ────────────────────────────────────────────────────
    if (orderCount >= 1) {
      const e = emailMilestone10(name, biz.business_name); // reusing for key check
      // D15: 10 comenzi
      if (orderCount >= 10) {
        const e10 = emailMilestone10(name, biz.business_name);
        if (!alreadySent(profile.id, e10.key)) {
          if (await sendAutomationEmail(email, e10)) { await markSent(profile.id, e10.key); sent++; }
        }
      }
      // D16: 50 comenzi
      if (orderCount >= 50) {
        const e50 = emailMilestone(name, biz.business_name, 50);
        if (!alreadySent(profile.id, e50.key)) {
          if (await sendAutomationEmail(email, e50)) { await markSent(profile.id, e50.key); sent++; }
        }
      }
      // D16: 100 comenzi
      if (orderCount >= 100) {
        const e100 = emailMilestone(name, biz.business_name, 100);
        if (!alreadySent(profile.id, e100.key)) {
          if (await sendAutomationEmail(email, e100)) { await markSent(profile.id, e100.key); sent++; }
        }
      }
    }
  }

  // ── D14: Prima comanda (check recent orders) ──────────────────────────────
  // This checks orders placed in the last 2 hours
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600000).toISOString();
  const { data: recentOrders } = await admin
    .from("orders")
    .select("id, business_id, order_number, customer_name, total, created_at")
    .gte("created_at", twoHoursAgo);

  for (const order of recentOrders ?? []) {
    const biz = (businesses ?? []).find(b => b.id === order.business_id);
    if (!biz) continue;
    const profile = (profiles ?? []).find(p => p.id === biz.user_id);
    if (!profile) continue;
    const auth = authMap.get(profile.id);
    if (!auth?.email) continue;

    // Check if this is their first order ever
    const totalOrders = orderCountMap[biz.id] ?? 0;
    if (totalOrders === 1) {
      const e = emailFirstOrder(profile.full_name ?? "", biz.business_name, order.order_number, order.customer_name, order.total);
      if (!alreadySent(profile.id, e.key)) {
        if (await sendAutomationEmail(auth.email, e)) { await markSent(profile.id, e.key); sent++; }
      }
    }
  }

  console.log(`[email-automations] Processed ${(profiles ?? []).length} users, sent ${sent} emails`);
  return NextResponse.json({ ok: true, processed: (profiles ?? []).length, sent });
}
