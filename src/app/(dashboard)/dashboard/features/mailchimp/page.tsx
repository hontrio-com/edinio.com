import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { MailchimpClient } from "@/components/dashboard/MailchimpClient";
import { toPublicMailchimpConfig, type MailchimpConfig } from "@/lib/mailchimp";

// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function MailchimpPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  // Only the client-safe view is passed down — the API key never leaves the server.
  const config = (settings?.mailchimp_config as MailchimpConfig | null) ?? null;

  return <MailchimpClient businessId={business.id} initialConfig={toPublicMailchimpConfig(config)} />;
}
