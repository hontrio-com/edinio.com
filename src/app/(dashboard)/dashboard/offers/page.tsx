import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { listOffers } from "@/lib/actions/offer.actions";
import { OffersClient } from "@/components/dashboard/OffersClient";

export default async function OffersPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  const offers = await listOffers(biz.id);

  return (
    <div className="p-6">
      <OffersClient businessId={biz.id} offers={offers} />
    </div>
  );
}
