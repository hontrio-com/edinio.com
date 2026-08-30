import { Suspense } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminActivityClient } from "@/components/admin/AdminActivityClient";
import { SkeletonPagina } from "@/components/ui/skeleton";

export const metadata = { title: "Activitate" };

/**
 * Coaja paginii pleaca imediat; jurnalul curge dupa ea.
 *
 * Inainte, citirea celor 200 de intrari statea direct in corpul paginii, deci
 * NIMIC nu pleca spre browser pana nu raspundea baza — `loading.tsx` tinea tot
 * ecranul gri. Sub `<Suspense>`, antetul si cadrul se trimit imediat, iar in
 * locul listei sta scheletul doar cat dureaza interogarea.
 *
 * Acesta e sablonul de urmat si pentru celelalte pagini grele: `loading.tsx`
 * acopera toata pagina si asteapta TOATE datele; `<Suspense>` asteapta doar
 * bucata lui.
 */
export default function AdminActivityPage() {
  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <Suspense fallback={<SkeletonPagina randuri={10} />}>
        <Jurnal />
      </Suspense>
    </div>
  );
}

async function Jurnal() {
  const admin = createAdminClient();

  const [{ data: logs }, { data: profiles }] = await Promise.all([
    admin
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    admin.from("users_profile").select("id, full_name").eq("role", "admin"),
  ]);

  const adminNames: Record<string, string> = {};
  for (const p of profiles ?? []) {
    adminNames[p.id] = p.full_name;
  }

  return <AdminActivityClient logs={logs ?? []} adminNames={adminNames} />;
}
