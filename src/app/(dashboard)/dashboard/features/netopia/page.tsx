import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import NetopiaConfigClient from "@/components/dashboard/NetopiaConfigClient";
import type { NetopiaConfig } from "@/lib/netopia";

export default async function NetopiaPage() {
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

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: settings } = await admin
    .from("store_settings")
    .select("netopia_config")
    .eq("business_id", business.id)
    .single();

  const netopiaConfig = (settings?.netopia_config as NetopiaConfig | null) ?? null;

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Netopia Payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Accepta plati cu cardul prin Netopia. Clientii vor fi redirectionati catre pagina de plata Netopia.
        </p>
      </div>

      <NetopiaConfigClient businessId={business.id} initialConfig={netopiaConfig} />
    </div>
  );
}
