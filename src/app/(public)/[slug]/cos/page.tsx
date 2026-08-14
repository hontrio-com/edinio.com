import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { buildChromeData, loadSearchCategories } from "@/lib/storefront/chrome-value";
import { cartOnPage, checkoutOnPage } from "@/lib/storefront/design/commerce";
import { radacinaMagazin } from "@/lib/storefront/category-href";
import { resolveDesign } from "@/lib/storefront/design/parse";
import type { StorePageContent } from "@/lib/storefront/store-content.types";
import { CartPageClient } from "@/components/storefront/sections/cart/CartPageClient";
import { pragTransportGratuit } from "@/lib/storefront/prag-transport-gratuit";

/**
 * Pagina de cos.
 *
 * Exista doar pentru magazinele care si-au ales cosul ca pagina de sine
 * statatoare; restul il au ca sertar, iar aici sunt trimise inapoi in magazin.
 * Alegerea e a designului, deci se citeste din aceeasi configuratie ca header-ul
 * si footerul.
 *
 * Nu se indexeaza: continutul e al fiecarui vizitator in parte si se schimba la
 * fiecare adaugare in cos.
 */

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses").select("business_name, store_name").eq("slug", slug).single();
  if (!business) return {};
  return {
    // `absolute` scoate template-ul „%s | Edinio" al radacinii: pe domeniul
    // comerciantului, fila din browser n-are ce cauta cu numele platformei.
    title: { absolute: `Cosul tau | ${business.store_name ?? business.business_name}` },
    robots: { index: false, follow: false },
  };
}

export default async function CosPage({ params }: Props) {
  const { slug } = await params;

  const supabase = await createClient();
  const [{ data: business }, { data: { user } }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, user_id, slug, business_name, store_name, tagline, description, phone, whatsapp, email, address, city, county, cui, reg_com, store_address, store_city, store_county, logo_url, cover_url, primary_color, is_published, suspended_until, custom_domain, social, gallery, features")
      .eq("slug", slug)
      .single(),
    supabase.auth.getUser(),
  ]);
  if (!business) notFound();

  const isOwner = user?.id === business.user_id;

  const admin = createAdminClient();
  const [{ data: storeSettings }] = await Promise.all([
    admin
      .from("store_settings")
      // Coloanele de TVA: fara ele, cosul arata un total din care lipsea taxa la
      // magazinele cu preturi fara TVA, iar la finalizare aparea alt numar.
      .select("page_content, storefront_design, default_shipping_cost, free_shipping_threshold, min_order_amount, vat_enabled, vat_rate, prices_include_vat, show_vat_breakdown")
      .eq("business_id", business.id)
      .single(),
  ]);

  const pageContent = (storeSettings?.page_content ?? {}) as StorePageContent;
  const resolved = resolveDesign(storeSettings?.storefront_design, {
    primaryColor: business.primary_color ?? "#1AB554",
    pageContent: pageContent as Record<string, unknown>,
    features: (business.features as Record<string, unknown>) ?? {},
    coverUrl: business.cover_url,
    tagline: business.tagline,
  });

  // Custom-domain aware base path (proxy rewrites customdomain.ro/x -> /slug/x).
  const host = (await headers()).get("host")?.split(":")[0] ?? "";
  const isCustomDomain = business.custom_domain && host === business.custom_domain;
  const basePath = isCustomDomain ? "" : `/${slug}`;

  // Magazinul e pe sertar: aici n-are ce cauta nimeni. Redirect, nu 404 — un
  // link vechi catre cos trebuie sa duca la magazin, nu intr-o pagina de eroare.
  if (!cartOnPage(resolved.design)) redirect(radacinaMagazin(basePath));

  // Magazin suspendat sau abonament expirat. Pagina de magazin arata deja
  // „suspendat", dar de AICI se putea comanda mai departe, cu cosul din
  // localStorage: cand cosul e pagina iar comanda ramane in fereastra,
  // formularul se monteaza chiar aici. Aceeasi verificare ca pe ruta frate de
  // finalizare; proprietarul trece, ca sa isi poata vedea magazinul.
  if (!isOwner) {
    let suspendat = business.suspended_until ? new Date(business.suspended_until) < new Date() : false;
    if (!suspendat) {
      const { data: ownerProfile } = await admin
        .from("users_profile")
        .select("plan, plan_expires_at")
        .eq("id", business.user_id)
        .single();
      if ((ownerProfile?.plan === "free" || ownerProfile?.plan === "trial") && ownerProfile?.plan_expires_at) {
        suspendat = new Date(ownerProfile.plan_expires_at) < new Date();
      }
    }
    if (suspendat) redirect(radacinaMagazin(basePath));
  }

  const searchCategories = await loadSearchCategories(business.id, resolved.design);
  const chrome = buildChromeData({
    searchCategories,
    business: business as never,
    pageContent,
    basePath,
    design: resolved.design,
    // Doar modelul pe doua coloane are bara FIXATA de marginea de jos pe telefon;
    // cel compact isi lipeste bara in fluxul propriu si o elibereaza inainte de
    // footer, iar cel lat n-are bara deloc. Fara steag, bara sta peste ultimul
    // rand al footerului — copyright, credit si insignele ANPC/Netopia.
    hasStickyBottomBar: resolved.design.commerce.cartDrawer.variant === "page_split",
  });

  return (
    <StorefrontThemeScope style={resolved.style}>
      <StorePageShell chrome={chrome} design={resolved.design} className="min-h-screen flex flex-col">
        <main className="flex-1">
          <CartPageClient
            variant={resolved.design.commerce.cartDrawer.variant}
            settings={resolved.design.commerce.cartDrawer.settings}
            color={business.primary_color ?? "#1AB554"}
            basePath={basePath}
            businessId={business.id}
            shippingCost={Number(storeSettings?.default_shipping_cost ?? 20)}
            freeShippingThreshold={pragTransportGratuit(storeSettings?.free_shipping_threshold)}
            minOrderAmount={storeSettings?.min_order_amount ? Number(storeSettings.min_order_amount) : null}
            vat={{
              vat_enabled: storeSettings?.vat_enabled ?? false,
              vat_rate: Number(storeSettings?.vat_rate ?? 19),
              prices_include_vat: storeSettings?.prices_include_vat ?? true,
              show_vat_breakdown: storeSettings?.show_vat_breakdown ?? true,
            }}
            comandaPePagina={checkoutOnPage(resolved.design)}
            emailFieldConfig={pageContent.checkout_config?.email_field ?? { enabled: true, required: false }}
          />
        </main>
      </StorePageShell>
    </StorefrontThemeScope>
  );
}
