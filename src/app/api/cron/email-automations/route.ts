import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { listAllAuthUsers } from "@/lib/supabase/admin";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { logError } from "@/lib/error-logger";
import {
  sendAutomationEmail,
  emailOnboardingNotStarted, emailOnboardingStuck, emailOnboardingHelp, emailOnboardingLastChance,
  emailTrialTips, emailNoProducts, emailNoOrders,
  emailTrialExpires3d, emailTrialExpires1d, emailTrialExpired,
  emailInactive7d, emailInactive14d,
  emailFirstOrder, emailMilestone10, emailMilestone,
  emailReactivate3d, emailReactivate7d,
  emailStoreOffline,
} from "@/lib/email-automations";

// Verify cron secret to prevent unauthorized calls
function verifyCron(req: NextRequest): boolean {
  // Vezi src/lib/cron-auth.ts: varianta de dinainte trecea cand CRON_SECRET
  // lipsea din mediu (undefined === undefined).
  return verificaCron(req);
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

  // Get all sent automation keys to avoid duplicates. Windowed (.range) —
  // taiat la 1000 de cap-ul PostgREST, dedup-ul uita emailuri deja trimise
  // si automatiile ajung sa RETRIMITA aceleasi mailuri.
  const allSent = await fetchAllRowsStrict("cron.emailAutomations.sent", (f, t) =>
    admin.from("email_automations").select("user_id, email_key").order("user_id").order("email_key").range(f, t));
  const sentSet = new Set(allSent.map(s => `${s.user_id}:${s.email_key}`));

  function alreadySent(userId: string, key: string): boolean {
    return sentSet.has(`${userId}:${key}`);
  }

  /**
   * Revendica dreptul de a trimite, INAINTE de trimitere.
   *
   * ═══ CE REPARA ═══
   *
   * Era `markSent`, chemata DUPA trimitere, cu insertul inghitit:
   *
   *     .insert(...).then(() => {}, () => {})
   *
   * Doua greseli. Intai, `.then(succes, esec)` nu prinde nimic: clientul Supabase
   * NU ARUNCA la eroare de SQL, intoarce `{ error }` — deci ramura de esec nu se
   * executa niciodata. Al doilea, si mai important: ordinea. Email trimis ->
   * marcaj picat -> la rularea urmatoare omul primeste ACELASI email. Constrangerea
   * de unicitate nu salveaza ordinea; ea opreste randul dublat, nu mesajul dublat.
   *
   * Inversat, cel mai rau caz devine un email de automatizare PIERDUT. Aceeasi
   * alegere ca la recuperarea cosurilor: pentru marketing, o trimitere lipsa costa
   * mai putin decat una repetata.
   *
   * `23505` (unicitate incalcata) inseamna „altcineva l-a luat deja, sau s-a
   * trimis" — nu e o eroare, e raspunsul corect. Orice ALTA eroare inseamna „nu
   * stim", si atunci nu se trimite: la indoiala, tacere.
   */
  async function revendicaTrimiterea(userId: string, key: string): Promise<boolean> {
    const { error } = await admin
      .from("email_automations")
      .insert({ user_id: userId, email_key: key } as never);
    if (error) {
      if (error.code !== "23505") {
        await logError({
          action: "email-automations",
          message: `marcajul de trimitere nu s-a putut scrie, deci NU s-a trimis: ${error.message}`,
          details: { userId, key, code: error.code }, severity: "critical",
        });
      }
      return false;
    }
    sentSet.add(`${userId}:${key}`);
    return true;
  }

  // ── Fetch all users with auth data (windowed — vezi nota de la allSent) ────
  const profiles = await fetchAllRowsStrict("cron.emailAutomations.profiles", (f, t) =>
    admin
      .from("users_profile")
      .select("id, full_name, plan, plan_expires_at, onboarding_step, onboarding_completed, created_at")
      .order("id").range(f, t));

  const authList = await listAllAuthUsers(admin);
  const authMap = new Map(authList.map(u => [u.id, u]));

  // ── Fetch businesses + product counts + order counts ───────────────────────
  const businesses = await fetchAllRowsStrict("cron.emailAutomations.businesses", (f, t) =>
    admin.from("businesses").select("id, user_id, slug, business_name, created_at, suspended_until").order("id").range(f, t));
  const bizMap = new Map(businesses.map(b => [b.user_id, b]));

  /*
   * Cate produse si cate comenzi are fiecare magazin — NUMARATE IN BAZA.
   *
   * Se citeau TOATE randurile de produse si TOATE cele de comenzi, cate o
   * coloana, doar ca sa fie numarate aici. Masurat: 5.862 de randuri de produse
   * in SASE dus-intorsuri secventiale (fereastra PostgREST e de 1000) plus inca
   * unul pentru comenzi, la fiecare ora, pentru doua numere pe magazin. Acum e un
   * singur apel care intoarce ~3,5 kB.
   *
   * Semantica e IDENTICA (toate randurile, fara filtru pe `is_active` sau pe
   * starea comenzii), verificata pe productie grup cu grup: 49 din 49 si 18 din
   * 18, zero nepotriviri. Conteaza fiindca de numerele astea atarna cine primeste
   * „nu ai niciun produs" si „nu ai nicio comanda".
   *
   * RPC-ul intoarce `jsonb`, un singur rand, si nu `setof`: `db-max-rows` taie si
   * rezultatele procedurilor, deci un `setof` ar fi facut magazinul numarul 1001
   * sa para cu zero produse — adica exact emailul gresit, trimis automat.
   */
  const { data: numarRaw, error: eNumar } = await admin.rpc("numar_produse_si_comenzi");
  if (eNumar) {
    // Fara numere, automatiile „nu ai produse"/„nu ai comenzi" ar suna la toata
    // lumea. Se opreste rularea; urmatoarea ora reia de unde a ramas, fiindca
    // dedup-ul e in `email_automations`, nu in memoria rularii.
    console.error("[cron.emailAutomations] numaratorile au esuat:", eNumar.message);
    return NextResponse.json({ error: "counts unavailable" }, { status: 500 });
  }
  const numar = (numarRaw ?? {}) as { produse?: Record<string, number>; comenzi?: Record<string, number> };
  const prodCountMap: Record<string, number> = numar.produse ?? {};
  const orderCountMap: Record<string, number> = numar.comenzi ?? {};

  // ── Process each user ──────────────────────────────────────────────────────
  for (const profile of profiles) {
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
          if (await revendicaTrimiterea(profile.id, e.key) && await sendAutomationEmail(email, e)) sent++;
        }
      }

      // A2: +24 ore, blocat la detalii/personalizare
      if (hoursOld >= 24 && (profile.onboarding_step === "details" || profile.onboarding_step === "customize")) {
        const e = emailOnboardingStuck(name);
        if (!alreadySent(profile.id, e.key)) {
          if (await revendicaTrimiterea(profile.id, e.key) && await sendAutomationEmail(email, e)) sent++;
        }
      }

      // A3: +3 zile
      if (daysOld >= 3) {
        const e = emailOnboardingHelp(name);
        if (!alreadySent(profile.id, e.key)) {
          if (await revendicaTrimiterea(profile.id, e.key) && await sendAutomationEmail(email, e)) sent++;
        }
      }

      // A4: +7 zile
      if (daysOld >= 7) {
        const e = emailOnboardingLastChance(name);
        if (!alreadySent(profile.id, e.key)) {
          if (await revendicaTrimiterea(profile.id, e.key) && await sendAutomationEmail(email, e)) sent++;
        }
      }

      continue; // Skip other checks for users without business
    }

    if (!biz) continue;

    const bizCreatedAt = new Date(biz.created_at);
    const bizDaysOld = daysBetween(bizCreatedAt, now);
    const productCount = prodCountMap[biz.id] ?? 0;
    const orderCount = orderCountMap[biz.id] ?? 0;

    // ── F. MAGAZIN OPRIT (gratie expirata dupa plata esuata) ─────────────
    // Abonament platit anulat de Stripe → suspended_until = start + 15 zile.
    // Cand a trecut, magazinul devine invizibil public — anuntam userul o
    // singura data per ciclu (cheie versionata pe suspended_until, care se
    // schimba la fiecare noua suspendare, deci re-notifica daca lapseaza iar).
    if (biz.suspended_until && new Date(biz.suspended_until) < now) {
      const offlineKey = `store_offline:${biz.suspended_until}`;
      if (!alreadySent(profile.id, offlineKey)) {
        const e = emailStoreOffline(name, biz.business_name);
        if (await revendicaTrimiterea(profile.id, offlineKey) && await sendAutomationEmail(email, e)) sent++;
      }
    }

    // ── B. TRIAL ACTIV ───────────────────────────────────────────────────
    if (profile.plan === "free" && profile.plan_expires_at) {
      const expiresAt = new Date(profile.plan_expires_at);
      const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / 86400000;
      const daysSinceExpiry = (now.getTime() - expiresAt.getTime()) / 86400000;

      // B5: +3 zile dupa creare magazin
      if (bizDaysOld >= 3 && daysUntilExpiry > 3) {
        const e = emailTrialTips(name, biz.slug);
        if (!alreadySent(profile.id, e.key)) {
          if (await revendicaTrimiterea(profile.id, e.key) && await sendAutomationEmail(email, e)) sent++;
        }
      }

      // B6: 0 produse, +2 zile
      if (productCount === 0 && bizDaysOld >= 2) {
        const e = emailNoProducts(name, biz.business_name);
        if (!alreadySent(profile.id, e.key)) {
          if (await revendicaTrimiterea(profile.id, e.key) && await sendAutomationEmail(email, e)) sent++;
        }
      }

      // B7: Are produse, 0 comenzi, +5 zile
      if (productCount > 0 && orderCount === 0 && bizDaysOld >= 5) {
        const e = emailNoOrders(name, biz.business_name);
        if (!alreadySent(profile.id, e.key)) {
          if (await revendicaTrimiterea(profile.id, e.key) && await sendAutomationEmail(email, e)) sent++;
        }
      }

      // B8: Trial expira in 3 zile
      if (daysUntilExpiry <= 3 && daysUntilExpiry > 1) {
        const e = emailTrialExpires3d(name, biz.business_name);
        if (!alreadySent(profile.id, e.key)) {
          if (await revendicaTrimiterea(profile.id, e.key) && await sendAutomationEmail(email, e)) sent++;
        }
      }

      // B9: Trial expira maine
      if (daysUntilExpiry <= 1 && daysUntilExpiry > 0) {
        const e = emailTrialExpires1d(name, biz.business_name);
        if (!alreadySent(profile.id, e.key)) {
          if (await revendicaTrimiterea(profile.id, e.key) && await sendAutomationEmail(email, e)) sent++;
        }
      }

      // B10: Trial expirat (ziua 0)
      if (daysSinceExpiry >= 0 && daysSinceExpiry < 1) {
        const e = emailTrialExpired(name, biz.business_name);
        if (!alreadySent(profile.id, e.key)) {
          if (await revendicaTrimiterea(profile.id, e.key) && await sendAutomationEmail(email, e)) sent++;
        }
      }

      // E17: +3 zile dupa expirare
      if (daysSinceExpiry >= 3) {
        const e = emailReactivate3d(name, biz.business_name);
        if (!alreadySent(profile.id, e.key)) {
          if (await revendicaTrimiterea(profile.id, e.key) && await sendAutomationEmail(email, e)) sent++;
        }
      }

      // E18: +7 zile dupa expirare
      if (daysSinceExpiry >= 7) {
        const e = emailReactivate7d(name, biz.business_name);
        if (!alreadySent(profile.id, e.key)) {
          if (await revendicaTrimiterea(profile.id, e.key) && await sendAutomationEmail(email, e)) sent++;
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
          if (await revendicaTrimiterea(profile.id, e.key) && await sendAutomationEmail(email, e)) sent++;
        }
      }

      // C12: 14 zile inactivitate
      if (inactiveDays >= 14) {
        const e = emailInactive14d(name, biz.business_name);
        if (!alreadySent(profile.id, e.key)) {
          if (await revendicaTrimiterea(profile.id, e.key) && await sendAutomationEmail(email, e)) sent++;
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
          if (await revendicaTrimiterea(profile.id, e10.key) && await sendAutomationEmail(email, e10)) sent++;
        }
      }
      // D16: 50 comenzi
      if (orderCount >= 50) {
        const e50 = emailMilestone(name, biz.business_name, 50);
        if (!alreadySent(profile.id, e50.key)) {
          if (await revendicaTrimiterea(profile.id, e50.key) && await sendAutomationEmail(email, e50)) sent++;
        }
      }
      // D16: 100 comenzi
      if (orderCount >= 100) {
        const e100 = emailMilestone(name, biz.business_name, 100);
        if (!alreadySent(profile.id, e100.key)) {
          if (await revendicaTrimiterea(profile.id, e100.key) && await sendAutomationEmail(email, e100)) sent++;
        }
      }
    }
  }

  // ── D14: Prima comanda (check recent orders) ──────────────────────────────
  // This checks orders placed in the last 2 hours
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600000).toISOString();
  const recentOrders = await fetchAllRowsStrict("cron.emailAutomations.recentOrders", (f, t) =>
    admin
      .from("orders")
      .select("id, business_id, order_number, customer_name, total, created_at")
      .gte("created_at", twoHoursAgo)
      .order("id").range(f, t));

  for (const order of recentOrders) {
    const biz = businesses.find(b => b.id === order.business_id);
    if (!biz) continue;
    const profile = profiles.find(p => p.id === biz.user_id);
    if (!profile) continue;
    const auth = authMap.get(profile.id);
    if (!auth?.email) continue;

    // Check if this is their first order ever
    const totalOrders = orderCountMap[biz.id] ?? 0;
    if (totalOrders === 1) {
      const e = emailFirstOrder(profile.full_name ?? "", biz.business_name, order.order_number, order.customer_name, order.total);
      if (!alreadySent(profile.id, e.key)) {
        if (await revendicaTrimiterea(profile.id, e.key) && await sendAutomationEmail(auth.email, e)) sent++;
      }
    }
  }

  console.log(`[email-automations] Processed ${(profiles ?? []).length} users, sent ${sent} emails`);
  return NextResponse.json({ ok: true, processed: (profiles ?? []).length, sent });
}
