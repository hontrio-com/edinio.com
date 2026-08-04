import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { SupportClient } from "@/components/dashboard/SupportClient";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export const metadata = { title: "Suport | Edinio" };

export default async function SupportPage() {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const [{ data: tickets }, { data: businesses }] = await Promise.all([
    supabase
      .from("support_tickets")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("businesses")
      .select("id, business_name, store_name")
      .eq("user_id", user.id),
  ]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <SupportClient
        tickets={tickets ?? []}
        businesses={businesses ?? []}
        userEmail={user.email ?? ""}
      />
    </div>
  );
}
