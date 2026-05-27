import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CargusConfigClient } from "@/components/dashboard/CargusConfigClient";
import type { CargusConfig } from "@/lib/cargus";

export default async function CargusPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();

  if (!business) redirect("/dashboard");

  const { data: settings } = await supabase
    .from("store_settings")
    .select("cargus_config")
    .eq("business_id", business.id)
    .single();

  const config = (settings?.cargus_config as CargusConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <img
          src="/integrations/cargus.svg"
          alt="Cargus"
          className="h-8 w-auto object-contain"
        />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Cargus</h1>
          <p className="text-sm text-muted-foreground">
            Genereaza AWB-uri Cargus direct din comenzile magazinului tau.
          </p>
        </div>
      </div>

      <CargusConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
