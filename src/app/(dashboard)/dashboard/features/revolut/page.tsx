import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { redirect } from "next/navigation";
import RevolutConfigClient from "@/components/dashboard/RevolutConfigClient";
import type { RevolutConfig, RevolutConfigInput } from "@/lib/revolut";

export default async function RevolutPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const full = (settings?.revolut_config as RevolutConfig | null) ?? null;
  // Only the editable fields reach the client — the server-side webhook signing
  // secret never leaves the server.
  const initialConfig: RevolutConfigInput | null = full
    ? { enabled: full.enabled, sandbox: full.sandbox, secret_key: full.secret_key, title: full.title }
    : null;

  return <RevolutConfigClient businessId={business.id} initialConfig={initialConfig} />;
}
