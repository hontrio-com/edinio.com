import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import { BottomNav } from "@/components/dashboard/BottomNav";
import { GracePeriodBanner } from "@/components/dashboard/GracePeriodBanner";
import { TrialBanner } from "@/components/dashboard/TrialBanner";
import { PaymentPastDueBanner } from "@/components/dashboard/PaymentPastDueBanner";
import { getInactiveReason } from "@/lib/subscription";
import { PlatformMetaPixel } from "@/components/platform/PlatformMetaPixel";
import { PlatformTikTokPixel } from "@/components/platform/PlatformTikTokPixel";
import { ScrollToTop } from "@/components/dashboard/ScrollToTop";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: businesses }] = await Promise.all([
    supabase.from("users_profile").select("full_name, plan, role, onboarding_completed, plan_expires_at, orders_seen_at").eq("id", user.id).single(),
    supabase.from("businesses").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);

  if (!profile?.onboarding_completed) redirect("/onboarding/details");

  const allBusinesses = businesses ?? [];
  const currentBusiness = allBusinesses[0] ?? null;
  const businessIds = allBusinesses.map(b => b.id);

  // Blocheaza COMPLET dashboard-ul cand contul e inactiv: trial gratuit expirat
  // SAU abonament platit neplatit (perioada de gratie expirata → magazin oprit).
  // Userul e trimis la /reactivare, unde poate plati; plata reactiveaza automat
  // accesul. Adminii sunt exceptati.
  if (profile.role !== "admin") {
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

  // Abonament platit cu data de reinnoire trecuta = candidat pentru bannerul de
  // plata restanta (plata esuata, inca in dunning Stripe — inainte de suspendarea
  // publica gestionata de GracePeriodBanner). Verificarea efectiva a expirarii
  // (fata de "acum") o face bannerul client, ca layout-ul sa ramana pur.
  const isPaidPlan = profile.plan !== "free" && profile.plan !== "trial";
  const showPastDueBanner = isPaidPlan && !suspendedBusiness && !!profile.plan_expires_at;

  return (
    <div className="min-h-screen bg-background">
      <ScrollToTop />
      <PlatformMetaPixel />
      <PlatformTikTokPixel />
      <Sidebar
        currentBusiness={currentBusiness}
        plan={profile.plan}
        smsoEnabled={smsoEnabled}
        unreadSupportCount={unreadSupportCount}
        unreadReturnsCount={unreadReturnsCount}
        isAdmin={profile.role === "admin"}
      />
      <div className="lg:pl-[var(--sidebar-width)]">
        {profile.plan === "free" && profile.plan_expires_at && (
          <TrialBanner planExpiresAt={profile.plan_expires_at} />
        )}
        {suspendedBusiness?.suspended_until && (
          <GracePeriodBanner suspendedUntil={suspendedBusiness.suspended_until} />
        )}
        {showPastDueBanner && (
          <PaymentPastDueBanner planExpiresAt={profile.plan_expires_at!} />
        )}
        <DashboardTopbar
          userFullName={profile.full_name}
          plan={profile.plan}
          recentOrders={recentOrders}
          notifications={notifications}
          ordersSeenAt={profile.orders_seen_at}
          currentBusiness={currentBusiness}
          smsoEnabled={smsoEnabled}
          unreadSupportCount={unreadSupportCount}
          isAdmin={profile.role === "admin"}
        />
        <main className="min-h-screen pb-20 lg:pb-0">{children}</main>
      </div>
      <BottomNav isAdmin={profile.role === "admin"} />
    </div>
  );
}
