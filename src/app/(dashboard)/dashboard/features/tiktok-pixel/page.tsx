import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { TikTokPixelConfigClient } from "@/components/dashboard/TikTokPixelConfigClient";
import type { MarketingConfig } from "@/lib/marketing";

export default async function TikTokPixelPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (settings?.marketing_config as MarketingConfig | null) ?? null;

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <img
          src="/integrations/tiktok-pixel.svg"
          alt="TikTok Pixel"
          className="h-8 w-auto object-contain"
        />
        <div>
          <h1 className="text-xl font-semibold text-foreground">TikTok Pixel</h1>
          <p className="text-sm text-muted-foreground">
            Urmareste conversiile si optimizeaza campaniile tale pe TikTok.
          </p>
        </div>
      </div>

      <TikTokPixelConfigClient businessId={business.id} initialConfig={config} />
    </div>
  );
}
