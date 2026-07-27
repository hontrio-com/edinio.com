import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
    .from("businesses").select("business_name, store_name").eq("slug", slug).single();
  if (!business) return {};
  return {
    // `absolute` strips the root layout's "%s | Edinio" template.
    title: { absolute: `${meta.label} | ${business.store_name ?? business.business_name}` },
    robots: { index: false },
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
    .select("store_policies, page_content, storefront_design")
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
    const templates = buildPolicyTemplates({
      businessName: business.business_name,
      cui:          (business as Record<string, unknown>).cui as string | null ?? null,
      address:      (business as Record<string, unknown>).address as string | null ?? null,
      city:         (business as Record<string, unknown>).city as string | null ?? null,
      county:       (business as Record<string, unknown>).county as string | null ?? null,
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
    searchCategories, business: business as never, pageContent, basePath });

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
