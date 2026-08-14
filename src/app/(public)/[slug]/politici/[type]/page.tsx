import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeBaseUrl } from "@/lib/seo";
import { politicaIndexabila } from "@/lib/storefront/policy-index";
import { adresaPublica } from "@/lib/storefront/identitate-publica";
import { buildPolicyTemplates } from "@/lib/policy-templates";
import { sanitizeHtml } from "@/lib/utils/sanitize-html";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { buildChromeData, loadSearchCategories } from "@/lib/storefront/chrome-value";
import { resolveDesign } from "@/lib/storefront/design/parse";
import type { StorePageContent } from "@/lib/storefront/store-content.types";

const POLICY_META: Record<string, { label: string; key: string }> = {
  termeni:          { label: "Termeni si conditii",           key: "terms" },
  livrare:          { label: "Politica de livrare",           key: "delivery" },
  retur:            { label: "Politica de retur",             key: "return" },
  confidentialitate:{ label: "Politica de confidentialitate", key: "privacy" },
  gdpr:             { label: "GDPR",                          key: "gdpr" },
  anulare:          { label: "Politica de anulare a comenzii",key: "cancellation" },
};

interface Props {
  params: Promise<{ slug: string; type: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, type } = await params;
  const meta = POLICY_META[type];
  if (!meta) return {};
  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses").select("id, slug, business_name, store_name, custom_domain, cover_url").eq("slug", slug).single();
  if (!business) return {};
  const numeMagazin = business.store_name ?? business.business_name;

  /*
   * Politicile sunt INDEXABILE, cu conditiile din `politicaIndexabila`.
   *
   * Erau toate pe `noindex`, iar Google Merchant Center cere retur si termeni
   * indexabili ca sa valideze contul: o regula de igiena SEO bloca vanzarea.
   * Interogarea in plus se face doar pe paginile de politici si citeste exact
   * ce citeste si sitemapul, ca sa nu ajungem la o pagina `noindex` listata in
   * sitemap — contradictia pe care Search Console o raporteaza ca eroare.
   */
  const { data: setari } = await createAdminClient()
    .from("store_settings").select("page_content, store_policies").eq("business_id", business.id).single();
  const indexabila = politicaIndexabila(setari?.page_content ?? null, setari?.store_policies ?? null, type);
  const titlu = `${meta.label} | ${numeMagazin}`;
  const url = `${storeBaseUrl(business)}/politici/${type}`;
  const imagine = business.cover_url ?? undefined;
  // openGraph si twitter se declara aici, nu se lasa mostenite: pagina e legata
  // din subsolul fiecarui magazin, iar fara ele previzualizarea linkului trimis
  // pe WhatsApp sau Facebook arata cardul de marketing al Edinio, nu magazinul.
  return {
    // `absolute` strips the root layout's "%s | Edinio" template.
    title: { absolute: titlu },
    robots: indexabila ? { index: true, follow: true } : { index: false, follow: true },
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "ro_RO",
      siteName: numeMagazin,
      title: titlu,
      url,
      ...(imagine ? { images: [{ url: imagine }] } : {}),
    },
    twitter: {
      card: imagine ? "summary_large_image" : "summary",
      title: titlu,
      ...(imagine ? { images: [imagine] } : {}),
    },
  };
}

export default async function PolicyPage({ params }: Props) {
  const { slug, type } = await params;
  const meta = POLICY_META[type];
  if (!meta) notFound();

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, user_id, slug, business_name, store_name, tagline, description, phone, whatsapp, email, address, city, county, cui, reg_com, store_address, store_city, store_county, logo_url, cover_url, primary_color, is_published, custom_domain, social, gallery, features")
    .eq("slug", slug)
    .single();

  if (!business) notFound();

  const { data: storeSettings } = await createAdminClient()
    .from("store_settings")
    .select("store_policies, page_content, storefront_design, default_shipping_cost, free_shipping_threshold, min_order_amount, vat_enabled, vat_rate, prices_include_vat, show_vat_breakdown")
    .eq("business_id", business.id)
    .single();

  const rawPolicies = (storeSettings?.store_policies ?? {}) as Record<string, unknown>;
  const policyVal = rawPolicies[meta.key];

  let content = "";
  let enabled = true;
  if (typeof policyVal === "string") {
    content = policyVal;
  } else if (policyVal && typeof policyVal === "object") {
    content = String((policyVal as Record<string, unknown>).content ?? "");
    enabled = (policyVal as Record<string, unknown>).enabled !== false;
  }

  // Fall back to auto-generated template if content is empty
  const isEmpty = !content.trim() || content === "<p></p>";
  if (isEmpty && enabled) {
    /*
     * ⚠ Adresa vine din AMANDOUA familiile de coloane.
     *
     * Ecranul „Datele magazinului" scrie `address`/`city`/`county`, iar „Editeaza
     * magazinul > Locatie" scrie `store_*`. Sablonul citea doar prima familie,
     * asa ca un comerciant care completase a doua avea tiparit pe pagina lui
     * publica de Termeni, negru pe alb, literalul „[adresa completă]". Pe o
     * pagina cu valoare juridica. Vezi `identitate-publica.ts`.
     */
    const adr = adresaPublica(business);
    const templates = buildPolicyTemplates({
      businessName: business.business_name,
      cui:          (business as Record<string, unknown>).cui as string | null ?? null,
      address:      adr.strada || null,
      city:         adr.oras || null,
      county:       adr.judet || null,
      phone:        (business as Record<string, unknown>).phone as string | null ?? null,
      email:        (business as Record<string, unknown>).email as string | null ?? null,
    });
    content = templates[meta.key] ?? "";
  }

  const color = business.primary_color ?? "#1AB554";
  const showContent = enabled && content.trim() !== "";

  // Detect custom domain access
  const headersList = await headers();
  const host = (headersList.get("host") ?? "").split(":")[0];
  const isCustomDomain = business.custom_domain && host === business.custom_domain;
  const basePath = isCustomDomain ? "" : `/${slug}`;

  // Header-ul si footerul magazinului, ca pe orice alta pagina publica. Pana
  // acum pagina avea doar un link „Inapoi la magazin" si nu afisa insignele
  // ANPC, desi tocmai aici sunt cele mai cautate. Logo-ul si drepturile de autor
  // din continut au disparut: le are acum chrome-ul.
  const pageContent = (storeSettings?.page_content ?? {}) as StorePageContent;
  const resolved = resolveDesign(storeSettings?.storefront_design, {
    primaryColor: color,
    pageContent: pageContent as Record<string, unknown>,
    features: (business.features as Record<string, unknown>) ?? {},
    coverUrl: business.cover_url,
    tagline: business.tagline,
  });
  const searchCategories = await loadSearchCategories(business.id, resolved.design);
  const chrome = buildChromeData({
    searchCategories, business: business as never, pageContent, basePath, design: resolved.design,
    // Transportul, pragul de livrare gratuita si comanda minima: sertarul de cos
    // se deschide acum si pe paginile fara catalog, iar fara ele n-ar putea arata
    // un total. Vezi `StoreCartPanels`.
    comert: {
      shippingCost: Number(storeSettings?.default_shipping_cost ?? 0),
      freeShippingThreshold: storeSettings?.free_shipping_threshold ?? null,
      minOrderAmount: storeSettings?.min_order_amount ?? null,
      vat: {
        vat_enabled: storeSettings?.vat_enabled ?? false,
        vat_rate: Number(storeSettings?.vat_rate ?? 19),
        prices_include_vat: storeSettings?.prices_include_vat ?? true,
        show_vat_breakdown: storeSettings?.show_vat_breakdown ?? true,
      },
    },
  });

  return (
    <StorefrontThemeScope style={resolved.style}>
      <StorePageShell chrome={chrome} design={resolved.design} className="min-h-screen flex flex-col">
        <main className="max-w-3xl w-full mx-auto px-4 py-10 flex-1">
          <h1 className="text-2xl sm:text-3xl font-black text-foreground mb-2">{meta.label}</h1>
          <div className="w-12 h-1 rounded-full mb-8" style={{ backgroundColor: color }} />

          {!showContent ? (
            <div className="text-center py-20 border border-dashed border-border rounded-2xl">
              <p className="text-muted-foreground text-sm">
                Aceasta politica nu este disponibila momentan.
              </p>
            </div>
          ) : (
            <div
              className="policy-content text-sm text-foreground"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
            />
          )}
        </main>
      </StorePageShell>
    </StorefrontThemeScope>
  );
}
