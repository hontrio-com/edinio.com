import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { getBundleEligibleProducts } from "@/lib/actions/bundle.actions";
import { getOffer } from "@/lib/actions/offer.actions";
import { OfferForm } from "@/components/dashboard/OfferForm";

export default async function EditOfferPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id, categories(id, name)").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  const offer = await getOffer(offerId, biz.id);
  if (!offer) notFound();

  const products = await getBundleEligibleProducts(biz.id);
  const categories = Array.isArray(biz.categories) ? biz.categories.map((c) => ({ id: c.id, name: c.name })) : [];

  return (
    <div className="p-6">
      <OfferForm businessId={biz.id} products={products} categories={categories} offer={offer} />
    </div>
  );
}
