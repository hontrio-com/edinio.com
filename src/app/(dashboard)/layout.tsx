import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";

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

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        businesses={allBusinesses}
        currentBusiness={currentBusiness}
        plan={profile.plan}
      />
      <div className="lg:pl-[var(--sidebar-width)]">
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
