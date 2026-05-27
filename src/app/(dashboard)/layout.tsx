import { redirect } from "next/navigation";
import { getCachedUser, getCachedProfile, getCachedBusinesses } from "@/lib/supabase/cached-queries";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import { GracePeriodBanner } from "@/components/dashboard/GracePeriodBanner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const [profile, allBusinesses] = await Promise.all([
    getCachedProfile(user.id),
    getCachedBusinesses(user.id),
  ]);

  if (!profile?.onboarding_completed) redirect("/onboarding/details");

  const currentBusiness = allBusinesses[0] ?? null;
  const businessIds = allBusinesses.map(b => b.id);

  const supabase = await createClient();
  const [ordersResult, smsoResult] = await Promise.all([
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
  ]);

  const recentOrders = ordersResult.data ?? [];
  const smsoEnabled = (smsoResult.data?.smso_config as { enabled?: boolean } | null)?.enabled === true;

  const suspendedBusiness = allBusinesses.find(b => b.suspended_until !== null && b.suspended_until !== undefined);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        businesses={allBusinesses}
        currentBusiness={currentBusiness}
        plan={profile.plan}
        smsoEnabled={smsoEnabled}
      />
      <div className="lg:pl-[var(--sidebar-width)]">
        {suspendedBusiness?.suspended_until && (
          <GracePeriodBanner suspendedUntil={suspendedBusiness.suspended_until} />
        )}
        <DashboardTopbar
          userFullName={profile.full_name}
          plan={profile.plan}
          recentOrders={recentOrders}
          businesses={allBusinesses}
          currentBusiness={currentBusiness}
        />
        <main className="min-h-screen">{children}</main>
      </div>
    </div>
  );
}
