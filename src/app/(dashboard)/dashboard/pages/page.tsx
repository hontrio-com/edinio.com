import { Suspense, type ComponentProps } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { PagesListClient } from "@/components/pages/PagesListClient";
import type { MenuItem } from "@/lib/pages/menu";
import { cartOnPage, checkoutOnPage, shopOnPage } from "@/lib/storefront/design/commerce";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { Skeleton } from "@/components/ui/skeleton";

/** Identitatea magazinului, asa cum o cere lista de pagini. */
type BusinessPagini = ComponentProps<typeof PagesListClient>["business"];

/**
 * Cadrul pleaca imediat; lista de pagini curge dupa el.
 *
 * Identitatea magazinului se stie dupa PRIMA interogare; lista de pagini si
 * setarile magazinului (din care se desface designul publicat, ca sa se vada
 * care pagini de sistem sunt pagini adevarate) sunt partea grea. Sub
 * `<Suspense>` comerciantul vede cadrul cat timp acelea se aduna.
 */
export default async function PagesPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, store_name, business_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!business) redirect("/dashboard");

  return (
    <Suspense fallback={<ScheletPagini />}>
      <ListaPagini business={business} />
    </Suspense>
  );
}

function ScheletPagini() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-11 w-36 shrink-0" />
      </div>
      <div className="flex items-center gap-2 mb-6">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-7 w-20" />
      </div>
      <div className="mb-8 space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-16" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

async function ListaPagini({ business }: { business: BusinessPagini }) {
  const supabase = await createClient();

  const [{ data: pages }, { data: ss }] = await Promise.all([
    supabase
      .from("custom_pages")
      .select("id, slug, title, is_published, updated_at")
      .eq("business_id", business.id)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("store_settings")
      .select("page_content, storefront_design")
      .eq("business_id", business.id)
      .single(),
  ]);

  const pc = ss?.page_content as { menu?: MenuItem[]; menu_fara_acasa?: boolean } | null;
  const menu = pc?.menu ?? [];

  // Catalogul, cosul si finalizarea comenzii apar in lista ca pagini de sistem,
  // dar numai designul PUBLICAT spune daca sunt pagini adevarate sau raman pe
  // pagina principala, respectiv panouri peste magazin.
  const design = parseStoreDesign(ss?.storefront_design, {
    primaryColor: "#1AB554",
    pageContent: (ss?.page_content as Record<string, unknown>) ?? {},
    features: {},
  });

  return (
    <PagesListClient
      business={business}
      pages={pages ?? []}
      initialMenu={menu}
      faraAcasaInitial={pc?.menu_fara_acasa === true}
      catalogPePagina={shopOnPage(design)}
      cosPePagina={cartOnPage(design)}
      comandaPePagina={checkoutOnPage(design)}
    />
  );
}
