import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SamedayConfigClient } from "@/components/dashboard/SamedayConfigClient";
import type { SamedayConfig } from "@/lib/sameday";

export default async function SamedayPage() {
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
    .select("sameday_config")
    .eq("business_id", business.id)
    .single();

  const config = (settings?.sameday_config as SamedayConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <img
          src="/integrations/sameday.svg"
          alt="Sameday"
          className="h-8 w-auto object-contain"
        />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Sameday</h1>
          <p className="text-sm text-muted-foreground">
            Genereaza AWB-uri Sameday direct din comenzile magazinului tau.
          </p>
        </div>
      </div>

      <SamedayConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
