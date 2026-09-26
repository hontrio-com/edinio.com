import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { FormsListClient } from "@/components/pages/FormsListClient";
import { statisticiFormulare } from "@/lib/pages/statistici-formulare";
import { acumCatTimp } from "@/lib/utils/format";

export default async function FormsPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).single();
  if (!business) redirect("/dashboard");

  const { data: forms } = await supabase
    .from("forms").select("id, name, fields, email_enabled, updated_at")
    .eq("business_id", business.id).order("created_at");

  const statistici = await statisticiFormulare(supabase, business.id, (forms ?? []).map((f) => f.id));
  const list = (forms ?? []).map((f) => {
    const s = statistici[f.id];
    return {
      id: f.id,
      name: f.name,
      fieldCount: Array.isArray(f.fields) ? (f.fields as unknown[]).length : 0,
      emailEnabled: f.email_enabled,
      total: s?.total ?? 0,
      ultimele30: s?.ultimele30 ?? 0,
      peZile: s?.peZile ?? [],
      // Scris pe server: „acum 3 ore” din browser n-ar fi acelasi text la hidratare.
      ultima: s?.ultima ? acumCatTimp(s.ultima) : null,
      pagini: s?.pagini.length ?? 0,
    };
  });

  return <FormsListClient businessId={business.id} forms={list} />;
}
