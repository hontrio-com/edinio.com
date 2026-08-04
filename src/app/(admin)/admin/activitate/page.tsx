import { Suspense } from "react";
import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminActivityClient } from "@/components/admin/AdminActivityClient";
import { SkeletonPagina } from "@/components/ui/skeleton";

export const metadata = { title: "Activitate" };

/**
 * Coaja paginii se prerandeaza; jurnalul curge la cerere.
 *
 * Inainte, citirea celor 200 de intrari statea direct in corpul paginii, deci
 * nimic nu pleca spre browser pana nu raspundea baza. Cu `cacheComponents`, asta
 * insemna si ca prerandarea incerca sa deschida un client de service role in
 * timpul build-ului — ceea ce nici n-ar avea sens (datele de la build ar fi
 * vechi in clipa in care cineva deschide pagina), nici nu merge acolo unde
 * cheile nu sunt disponibile la build.
 *
 * Mutata sub `<Suspense>`, bucata care are nevoie de baza se randeaza la cerere,
 * iar restul paginii pleaca imediat. De asta nu mai are nevoie de
 * `instant = false`.
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
  // `connection()` opreste prerandarea aici: tot ce urmeaza ruleaza doar la o
  // cerere reala. Fara el, Next executa componenta si in timpul build-ului, ca
  // sa afle daca o poate prerandă — iar un jurnal de audit citit la build ar fi
  // oricum vechi in clipa in care cineva deschide pagina.
  await connection();
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
