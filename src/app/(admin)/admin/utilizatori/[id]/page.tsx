import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminUserDetail } from "@/components/admin/AdminUserDetail";

export const metadata = { title: "Detalii utilizator" };

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const [
    { data: profile },
    authResult,
    { data: businesses },
    { data: invoices },
    { data: tickets },
    { data: orders },
  ] = await Promise.all([
    admin.from("users_profile").select("*").eq("id", id).single(),
    admin.auth.admin.getUserById(id),
    admin.from("businesses").select("id, business_name, store_name, slug, type, is_published, created_at, primary_color").eq("user_id", id).order("created_at", { ascending: false }),
    admin.from("invoices").select("*").eq("user_id", id).order("created_at", { ascending: false }),
    admin.from("support_tickets").select("*").eq("user_id", id).order("created_at", { ascending: false }),
    admin.from("orders").select("id, order_number, total, status, created_at, business_id").in("business_id", [id]).limit(10),
  ]);

  if (!profile) notFound();

  const authUser = authResult.data?.user;

  // Total orders across all user's businesses
  const bizIds = (businesses ?? []).map((b) => b.id);
  const { data: allOrders } = bizIds.length > 0
    ? await admin.from("orders").select("id, order_number, total, status, created_at, business_id").in("business_id", bizIds).order("created_at", { ascending: false }).limit(20)
    : { data: [] };

  const totalRevenue = (invoices ?? []).filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <AdminUserDetail
        profile={{ ...profile, role: profile.role as string }}
        authUser={{
          email: authUser?.email ?? "",
          created_at: authUser?.created_at ?? profile.created_at,
          last_sign_in_at: authUser?.last_sign_in_at ?? null,
          email_confirmed_at: authUser?.email_confirmed_at ?? null,
        }}
        businesses={businesses ?? []}
        invoices={invoices ?? []}
        tickets={tickets ?? []}
        orders={allOrders ?? []}
        totalRevenue={totalRevenue}
      />
    </div>
  );
}
