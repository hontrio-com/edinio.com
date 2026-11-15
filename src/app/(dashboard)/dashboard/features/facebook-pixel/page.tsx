import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { FacebookPixelConfigClient } from "@/components/dashboard/FacebookPixelConfigClient";
import { getMetaCapiStare } from "@/lib/actions/meta-capi.actions";
import type { MarketingConfig } from "@/lib/marketing-config";

export default async function FacebookPixelPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const config = (settings?.marketing_config as MarketingConfig | null) ?? null;
  /* ⚠ Starea, nu tokenul: `getMetaCapiStare` spune doar daca e salvat. */
  const capi = await getMetaCapiStare(business.id);

  return <FacebookPixelConfigClient businessId={business.id} initialConfig={config} capi={"error" in capi ? null : capi} />;
}
