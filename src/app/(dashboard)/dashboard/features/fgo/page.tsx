import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FgoConfigClient } from "@/components/dashboard/FgoConfigClient";
import type { FgoConfig } from "@/lib/fgo";

export default async function FgoPage() {
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
    .select("fgo_config")
    .eq("business_id", business.id)
    .single();

  const config = (settings?.fgo_config as FgoConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <img
          src="/integrations/fgo.svg"
          alt="fGO"
          className="h-8 w-auto object-contain"
        />
        <div>
          <h1 className="text-xl font-semibold text-foreground">fGO Facturare</h1>
          <p className="text-sm text-muted-foreground">
            Genereaza automat facturi fGO pentru comenzile din magazinul tau.
          </p>
        </div>
      </div>

      <FgoConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
