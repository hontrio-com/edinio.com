import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { StatisticiClient } from "@/components/dashboard/StatisticiClient";
import fs from "fs";
import path from "path";

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, primary_color")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!business) redirect("/dashboard");

  const svgContent = fs.readFileSync(
    path.join(process.cwd(), "public", "ro.svg"),
    "utf-8",
  );

  /* Canalele pe care chiar a vandut magazinul: filtrul le arata doar daca sunt
     mai multe decat unul (aceeasi functie ca la graficul din panou). */
  const { data: canale } = await supabase.rpc("canale_vanzare", { p_business: business.id });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <StatisticiClient
        businessId={business.id}
        svgContent={svgContent}
        primaryColor={business.primary_color ?? "#1AB554"}
        canale={(canale ?? []).map((c) => ({ canal: c.canal, comenzi: Number(c.comenzi) }))}
      />
    </div>
  );
}
