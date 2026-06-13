import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { redirect } from "next/navigation";
import IPayConfigClient from "@/components/dashboard/IPayConfigClient";
import type { IPayConfig } from "@/lib/ipay";

export default async function IPayPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const ipayConfig = (settings?.ipay_config as IPayConfig | null) ?? null;

  return <IPayConfigClient businessId={business.id} initialConfig={ipayConfig} />;
}
