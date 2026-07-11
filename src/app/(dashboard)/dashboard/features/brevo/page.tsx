import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { BrevoClient } from "@/components/dashboard/BrevoClient";
import { toPublicBrevoConfig, type BrevoConfig } from "@/lib/brevo";

export default async function BrevoPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  // Only the client-safe view is passed down — the API key never leaves the server.
  const config = (settings?.brevo_config as BrevoConfig | null) ?? null;

  return <BrevoClient businessId={business.id} initialConfig={toPublicBrevoConfig(config)} />;
}
