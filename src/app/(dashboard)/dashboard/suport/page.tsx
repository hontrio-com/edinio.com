import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { SupportClient } from "@/components/dashboard/SupportClient";

export const metadata = { title: "Suport | Edinio" };

export default async function SupportPage() {
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
