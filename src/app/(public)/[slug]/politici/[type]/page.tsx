import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPolicyTemplates } from "@/lib/policy-templates";
import { sanitizeHtml } from "@/lib/utils/sanitize-html";
import { ArrowLeft } from "lucide-react";

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
    .select("id, business_name, store_name, primary_color, logo_url, address, city, county, phone, email, cui, custom_domain")
    .eq("slug", slug)
    .single();

  if (!business) notFound();

  const { data: storeSettings } = await createAdminClient()
    .from("store_settings")
    .select("store_policies")
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <a
            href={`${basePath}/`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Inapoi la magazin
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        {/* Business branding — free logo, like the storefront header (no frame, no name) */}
        <div className="flex items-center mb-8">
          {business.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logo_url} alt={business.store_name ?? business.business_name}
              style={{ height: 40, maxWidth: 40 * 4.2 }} className="w-auto object-contain" />
          ) : (
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
              style={{ backgroundColor: color }}>
              {(business.store_name ?? business.business_name)[0]?.toUpperCase()}
            </div>
          )}
        </div>

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

        <div className="mt-12 pt-6 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} {business.store_name ?? business.business_name}. Toate drepturile rezervate.
          </p>
        </div>
      </main>
    </div>
  );
}
