import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import { BottomNav } from "@/components/dashboard/BottomNav";
import { GracePeriodBanner } from "@/components/dashboard/GracePeriodBanner";
import { TrialBanner } from "@/components/dashboard/TrialBanner";
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

  const [ordersResult, smsoResult, supportResult, notificationsResult] = await Promise.all([
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
  ]);

  const recentOrders = ordersResult.data ?? [];
  const smsoEnabled = (smsoResult.data?.smso_config as { enabled?: boolean } | null)?.enabled === true;
  const unreadSupportCount = supportResult.count ?? 0;
  const notifications = notificationsResult.data ?? [];

  const suspendedBusiness = allBusinesses.find(b => b.suspended_until !== null && b.suspended_until !== undefined);

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
        isAdmin={profile.role === "admin"}
      />
      <div className="lg:pl-[var(--sidebar-width)]">
        {profile.plan === "free" && profile.plan_expires_at && (
          <TrialBanner planExpiresAt={profile.plan_expires_at} />
        )}
        {suspendedBusiness?.suspended_until && (
          <GracePeriodBanner suspendedUntil={suspendedBusiness.suspended_until} />
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
