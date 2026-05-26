import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "@/components/dashboard/SettingsClient";

interface Props {
  searchParams: Promise<{ plan_success?: string }>;
}

export default async function SettingsPage({ searchParams }: Props) {
  const { plan_success } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: business }] = await Promise.all([
    supabase.from("users_profile").select("*").eq("id", user.id).single(),
    supabase
      .from("businesses")
      .select("id, business_name, address, city, county, phone, email")
      .eq("user_id", user.id)
      .order("created_at")
      .limit(1)
      .single(),
  ]);

  if (!profile) redirect("/login");

  const { data: storeSettings } = business
    ? await supabase
        .from("store_settings")
        .select("store_policies, order_number_format")
        .eq("business_id", business.id)
        .single()
    : { data: null };

  return (
    <SettingsClient
      profile={profile}
      email={user.email ?? ""}
      businessId={business?.id ?? null}
      businessData={business ?? null}
      storePolicies={(storeSettings?.store_policies as Record<string, unknown>) ?? {}}
      orderNumberFormat={storeSettings?.order_number_format ?? "sequential"}
      planSuccess={plan_success === "1"}
    />
  );
}
