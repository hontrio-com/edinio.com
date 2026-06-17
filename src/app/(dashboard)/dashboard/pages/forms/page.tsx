import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { FormsListClient } from "@/components/pages/FormsListClient";

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

  const list = (forms ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    fieldCount: Array.isArray(f.fields) ? (f.fields as unknown[]).length : 0,
    emailEnabled: f.email_enabled,
  }));

  return <FormsListClient businessId={business.id} forms={list} />;
}
