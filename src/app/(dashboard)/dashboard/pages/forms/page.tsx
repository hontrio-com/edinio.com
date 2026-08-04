import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { FormsListClient } from "@/components/pages/FormsListClient";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function FormsPage() {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
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
