import "../globals.css";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import { BottomNav } from "@/components/dashboard/BottomNav";
import { GracePeriodBanner } from "@/components/dashboard/GracePeriodBanner";
import { TrialBanner } from "@/components/dashboard/TrialBanner";
import { PaymentPastDueBanner } from "@/components/dashboard/PaymentPastDueBanner";
import { getInactiveReason } from "@/lib/subscription";
import { esteAdminConfirmat } from "@/lib/admin-guard";
import { sesiuneCurentaNeconfirmata } from "@/lib/auth/cere-mfa";
import { PlatformMetaPixel } from "@/components/platform/PlatformMetaPixel";
import { PlatformTikTokPixel } from "@/components/platform/PlatformTikTokPixel";
import { ScrollToTop } from "@/components/dashboard/ScrollToTop";
import { ImpersonationBanner } from "@/components/dashboard/ImpersonationBanner";
import { NotificariToast } from "@/components/ui/NotificariToast";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const esteImpersonare = (await cookies()).get("impersonare")?.value != null;

  const [{ data: profile }, { data: businesses }] = await Promise.all([
    supabase.from("users_profile").select("full_name, plan, role, onboarding_completed, plan_expires_at, orders_seen_at, payment_failed_at, mfa_email_enabled").eq("id", user.id).single(),
    supabase.from("businesses").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);

  /*
   * Poarta MFA, verificata pe SERVER.
   *
   * SEMANTICA NOUA (05.08.2026). Pana acum se intreba „exista o provocare MFA
   * neexpirata?", iar raspunsul devenea „nu" dupa 10 minute, cand codul expira —
   * adica „codul a expirat" insemna „liber". Sesiunea Supabase traieste mult
   * peste 10 minute, deci cine avea doar parola astepta si intra. Acum se
   * intreba „sesiunea ASTA a fost confirmata cu al doilea factor?", iar raspunsul
   * nu se schimba singur cu trecerea timpului. Detaliile in src/lib/auth/mfa.ts.
   *
   * Aceeasi poarta ruleaza acum si in proxy (rute /api/** si actiuni de server)
   * si in `requireAdmin`, nu doar aici.
   *
   * Conditia `!== false` in loc de `=== true`: cand `mfa_email_enabled` e citit
   * cu succes si e FALS, nu mai punem nicio intrebare — conturile fara al doilea
   * factor nu platesc nimic si se comporta exact ca inainte. Daca insa citirea
   * profilului a esuat (`profile` e null), intrebam poarta, care are propria ei
   * citire cu service role. Varianta veche trata „nu stiu" ca „e in regula".
   */
  if (profile?.mfa_email_enabled !== false) {
    if (await sesiuneCurentaNeconfirmata(user.id)) redirect("/login/mfa");
  }

  if (!profile?.onboarding_completed) redirect("/onboarding/details");

  const allBusinesses = businesses ?? [];
  const currentBusiness = allBusinesses[0] ?? null;
  const businessIds = allBusinesses.map(b => b.id);

  // Blocheaza COMPLET dashboard-ul cand contul e inactiv: trial gratuit expirat
  // SAU abonament platit neplatit (perioada de gratie expirata → magazin oprit).
  // Userul e trimis la /reactivare, unde poate plati; plata reactiveaza automat
  // accesul. Adminii sunt exceptati.
  // Exceptarea cere AMBELE surse de rol (claim din JWT + coloana blocata), nu
  // doar coloana: altfel „sunt admin" devenea si o cale de a sari peste plata.
  if (!esteAdminConfirmat(user, profile.role)) {
    const inactive = getInactiveReason({
      plan: profile.plan,
      planExpiresAt: profile.plan_expires_at,
      suspendedUntils: allBusinesses.map(b => b.suspended_until),
    });
    if (inactive) redirect("/reactivare");
  }

  const [ordersResult, smsoResult, supportResult, notificationsResult, returnsResult] = await Promise.all([
    businessIds.length > 0
      ? supabase
          .from("orders")
          .select("id, customer_name, created_at, total")
          .in("business_id", businessIds)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as { id: string; customer_name: string; created_at: string; total: number }[] }),
    currentBusiness
      ? supabase.from("store_settings").select("smso_config").eq("business_id", currentBusiness.id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("has_unread_reply", true),
    supabase
      .from("notifications")
      .select("id, title, message, type, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    businessIds.length > 0
      ? supabase
          .from("return_requests")
          .select("id", { count: "exact", head: true })
          .in("business_id", businessIds)
          .eq("is_read", false)
      : Promise.resolve({ count: 0 }),
  ]);

  const recentOrders = ordersResult.data ?? [];
  const smsoEnabled = (smsoResult.data?.smso_config as { enabled?: boolean } | null)?.enabled === true;
  const unreadSupportCount = supportResult.count ?? 0;
  const unreadReturnsCount = returnsResult.count ?? 0;
  const notifications = notificationsResult.data ?? [];

  const suspendedBusiness = allBusinesses.find(b => b.suspended_until !== null && b.suspended_until !== undefined);

  // Banner de plata restanta pentru abonamente platite aflate in dunning Stripe
  // (inainte de suspendarea publica gestionata de GracePeriodBanner). Semnalul e
  // `payment_failed_at` — starea REALA de esec setata din webhook-ul
  // invoice.payment_failed si stearsa la urmatoarea plata reusita. NU folosim
  // `plan_expires_at < now()`: acela devine true si in fereastra draft/finalizare
  // a Stripe (inainte de orice incercare de plata) → fals „plata esuata".
  const isPaidPlan = profile.plan !== "free" && profile.plan !== "trial";
  const showPastDueBanner = isPaidPlan && !suspendedBusiness && !!profile.payment_failed_at;

  return (
    <div className="min-h-screen bg-background">
      <ScrollToTop />
      {esteImpersonare && <ImpersonationBanner />}
      <PlatformMetaPixel />
      <PlatformTikTokPixel />
      <Sidebar
        currentBusiness={currentBusiness}
        plan={profile.plan}
        smsoEnabled={smsoEnabled}
        unreadSupportCount={unreadSupportCount}
        unreadReturnsCount={unreadReturnsCount}
        isAdmin={esteAdminConfirmat(user, profile.role)}
      />
      <div className="lg:pl-[var(--sidebar-width)]">
        {profile.plan === "free" && profile.plan_expires_at && (
          <TrialBanner planExpiresAt={profile.plan_expires_at} />
        )}
        {suspendedBusiness?.suspended_until && (
          <GracePeriodBanner suspendedUntil={suspendedBusiness.suspended_until} />
        )}
        {showPastDueBanner && <PaymentPastDueBanner />}
        <DashboardTopbar
          userFullName={profile.full_name}
          plan={profile.plan}
          recentOrders={recentOrders}
          notifications={notifications}
          ordersSeenAt={profile.orders_seen_at}
          currentBusiness={currentBusiness}
          smsoEnabled={smsoEnabled}
          unreadSupportCount={unreadSupportCount}
          isAdmin={esteAdminConfirmat(user, profile.role)}
        />
        <main className="min-h-screen pb-20 lg:pb-0">{children}</main>
      </div>
      <BottomNav isAdmin={esteAdminConfirmat(user, profile.role)} />
      <NotificariToast />
    </div>
  );
}
