import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminBusinessDetailClient } from "@/components/admin/AdminBusinessDetailClient";

export const metadata = { title: "Detalii magazin" };

export default async function AdminBusinessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: business }, { data: orders }, { data: products }, { data: settings }, { data: domains }] = await Promise.all([
    admin.from("businesses").select("*").eq("id", id).single(),
    admin.from("orders").select("id, order_number, customer_name, customer_email, customer_phone, total, status, payment_method, created_at, shipping_address").eq("business_id", id).order("created_at", { ascending: false }).limit(200),
    admin.from("products").select("id, name, price, is_active, created_at").eq("business_id", id).order("created_at", { ascending: false }),
    admin.from("store_settings").select("*").eq("business_id", id).single(),
    admin.from("domains").select("*").eq("business_id", id),
  ]);

  if (!business) notFound();

  const { data: profile } = await admin.from("users_profile").select("id, full_name, plan, role, created_at").eq("id", business.user_id).single();
  const { data: authUser } = await admin.auth.admin.getUserById(business.user_id);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <AdminBusinessDetailClient
        business={business}
        orders={orders ?? []}
        products={products ?? []}
        owner={profile ?? null}
        ownerEmail={authUser?.user?.email ?? ""}
        settings={settings ?? null}
        domains={domains ?? []}
      />
    </div>
  );
}
