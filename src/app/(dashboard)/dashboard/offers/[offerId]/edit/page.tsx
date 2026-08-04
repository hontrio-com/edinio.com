import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { getBundleEligibleProducts } from "@/lib/actions/bundle.actions";
import { getOffer } from "@/lib/actions/offer.actions";
import { OfferForm } from "@/components/dashboard/OfferForm";

import { connection } from "next/server";
// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

export default async function EditOfferPage({ params }: { params: Promise<{ offerId: string }> }) {
  // Pagina citeste date necachuite la fiecare cerere — exact ca pana acum.
  // `connection()` spune asta explicit, ca prerandarea sa nu incerce sa o
  // execute in timpul build-ului. Comportamentul la rulare e neschimbat.
  await connection();
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
