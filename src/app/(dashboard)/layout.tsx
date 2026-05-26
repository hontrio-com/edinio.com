import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import { GracePeriodBanner } from "@/components/dashboard/GracePeriodBanner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: businesses }] = await Promise.all([
    supabase.from("users_profile").select("*").eq("id", user.id).single(),
    supabase.from("businesses").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);

  if (!profile?.onboarding_completed) redirect("/onboarding/details");

  const allBusinesses = businesses ?? [];
  const currentBusiness = allBusinesses[0] ?? null;
  const businessIds = allBusinesses.map(b => b.id);

  let recentOrders: { id: string; customer_name: string; created_at: string; total: number }[] = [];
  if (businessIds.length > 0) {
    const { data } = await supabase
      .from("orders")
      .select("id, customer_name, created_at, total")
      .in("business_id", businessIds)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);
    recentOrders = data ?? [];
  }

  // Fetch smso_config to know if SMS Marketing is enabled
  let smsoEnabled = false;
  if (currentBusiness) {
    const { data: ss } = await supabase
      .from("store_settings")
      .select("smso_config")
      .eq("business_id", currentBusiness.id)
      .single();
    const cfg = ss?.smso_config as { enabled?: boolean } | null;
    smsoEnabled = cfg?.enabled === true;
  }

  // Check if any business is in grace period or suspended
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
