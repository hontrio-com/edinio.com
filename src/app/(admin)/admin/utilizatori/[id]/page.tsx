import { Suspense, type ComponentProps } from "react";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminUserDetail } from "@/components/admin/AdminUserDetail";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Detalii utilizator" };

type ProfilUtilizator = ComponentProps<typeof AdminUserDetail>["profile"];

/**
 * Profilul se citeste AICI, nu sub `<Suspense>`.
 *
 * E o cautare dupa cheia primara si de ea atarna `notFound()`: mutat in copil,
 * cadrul ar fi plecat deja spre browser si 404-ul ar veni peste un antet care nu
 * trebuia sa existe. Facturile, tichetele, magazinele si comenzile lor curg
 * dupa cadru.
 */
export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: profile } = await admin.from("users_profile").select("*").eq("id", id).single();

  if (!profile) notFound();

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <Suspense fallback={<ScheletUtilizator />}>
        <DetaliiUtilizator
          id={id}
          profile={{ ...profile, role: profile.role as string, suspended_until: profile.suspended_until ?? null, admin_notes: profile.admin_notes ?? null }}
        />
      </Suspense>
    </div>
  );
}

function ScheletUtilizator() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-32" />

      {/* fisa contului */}
      <Skeleton className="h-[196px] rounded-2xl" />

      {/* facturi si tichete, unul langa altul */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Skeleton className="h-[210px] rounded-2xl" />
        <Skeleton className="h-[210px] rounded-2xl" />
      </div>

      {/* magazinele si comenzile */}
      <Skeleton className="h-[180px] rounded-2xl" />
    </div>
  );
}

async function DetaliiUtilizator({ id, profile }: { id: string; profile: ProfilUtilizator }) {
  const admin = createAdminClient();

  const [
    authResult,
    { data: businesses },
    { data: invoices },
    { data: tickets },
    { data: orders },
  ] = await Promise.all([
    admin.auth.admin.getUserById(id),
    admin.from("businesses").select("id, business_name, store_name, slug, type, is_published, created_at, primary_color").eq("user_id", id).order("created_at", { ascending: false }),
    admin.from("invoices").select("*").eq("user_id", id).order("created_at", { ascending: false }),
    admin.from("support_tickets").select("*").eq("user_id", id).order("created_at", { ascending: false }),
    admin.from("orders").select("id, order_number, total, status, created_at, business_id").in("business_id", [id]).limit(10),
  ]);

  const authUser = authResult.data?.user;

  // Total orders across all user's businesses
  const bizIds = (businesses ?? []).map((b) => b.id);
  const { data: allOrders } = bizIds.length > 0
    ? await admin.from("orders").select("id, order_number, total, status, created_at, business_id").in("business_id", bizIds).order("created_at", { ascending: false }).limit(20)
    : { data: [] };

  const totalRevenue = (invoices ?? []).filter((i) => i.status === "paid" && i.plan !== "domain").reduce((s, i) => s + i.amount, 0);

  return (
    <AdminUserDetail
      profile={profile}
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
  );
}
