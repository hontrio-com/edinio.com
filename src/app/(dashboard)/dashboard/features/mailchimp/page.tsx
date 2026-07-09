import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { MailchimpClient } from "@/components/dashboard/MailchimpClient";
import { toPublicMailchimpConfig, type MailchimpConfig } from "@/lib/mailchimp";

export default async function MailchimpPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  // Only the client-safe view is passed down — the API key never leaves the server.
  const config = (settings?.mailchimp_config as MailchimpConfig | null) ?? null;

  return <MailchimpClient businessId={business.id} initialConfig={toPublicMailchimpConfig(config)} />;
}
