import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { esteUuid } from "@/lib/supabase/ids";
import { conturilePornite, fisaContului } from "@/lib/cont/panou";
import { FisaContului } from "@/components/dashboard/clienti/conturi/FisaContului";

/**
 * Fisa unui cont de client, in panoul comerciantului (24.09.2026).
 *
 * ⚠⚠ Magazinul se ia din omul LOGAT, nu din adresa: `fisaContului` cere si
 * magazinul, si contul, deci un id de cont al altui magazin da 404, la fel ca unul
 * care nu exista. Cele doua nu au voie sa se deosebeasca.
 */
export default async function PaginaContului({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCachedUser();
  if (!user) redirect("/login");
  if (!esteUuid(id)) notFound();

  const supabase = await createClient();
  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .eq("type", "ministore")
    .limit(1)
    .single();
  if (!biz) redirect("/dashboard");

  const [fisa, pornite] = await Promise.all([fisaContului(biz.id, id), conturilePornite(biz.id)]);
  if (!fisa) notFound();

  return (
    <div className="mx-auto max-w-6xl p-6">
      <FisaContului businessId={biz.id} fisa={fisa} pornite={pornite} />
    </div>
  );
}
