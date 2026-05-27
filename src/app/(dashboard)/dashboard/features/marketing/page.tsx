import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { MarketingConfigClient } from "@/components/dashboard/MarketingConfigClient";
import type { MarketingConfig } from "@/lib/marketing";

export default async function MarketingPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
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
    .select("marketing_config")
    .eq("business_id", business.id)
    .single();

  const config = (settings?.marketing_config as MarketingConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <img
          src="/integrations/facebook-pixel.svg"
          alt="Facebook Pixel"
          className="h-8 w-auto object-contain"
        />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Marketing</h1>
          <p className="text-sm text-muted-foreground">
            Conecteaza pixelii de tracking pentru a optimiza campaniile tale publicitare.
          </p>
        </div>
      </div>

      <MarketingConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
