import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
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
    .from("businesses").select("business_name").eq("slug", slug).single();
  if (!business) return {};
  return {
    title: `${meta.label} | ${business.business_name}`,
    robots: { index: false },
  };
}

export default async function PolicyPage({ params }: Props) {
  const { slug, type } = await params;
  const meta = POLICY_META[type];
  if (!meta) notFound();

  const supabase = await createClient();

  const [{ data: business }, ] = await Promise.all([
    supabase.from("businesses").select("id, business_name, primary_color, logo_url").eq("slug", slug).single(),
  ]);

  if (!business) notFound();

  const { data: storeSettings } = await supabase
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

  const color = business.primary_color ?? "#1AB554";
  const isEmpty = !content || content === "<p></p>";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <a
            href={`/${slug}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Inapoi la magazin
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        {/* Business branding */}
        <div className="flex items-center gap-3 mb-8">
          {business.logo_url ? (
            <img src={business.logo_url} alt={business.business_name}
              className="w-10 h-10 rounded-xl object-cover border border-border flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ backgroundColor: color }}>
              {business.business_name[0]?.toUpperCase()}
            </div>
          )}
          <span className="text-sm font-semibold text-foreground">{business.business_name}</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-foreground mb-2">{meta.label}</h1>
        <div className="w-12 h-1 rounded-full mb-8" style={{ backgroundColor: color }} />

        {(!enabled || isEmpty) ? (
          <div className="text-center py-20 border border-dashed border-border rounded-2xl">
            <p className="text-muted-foreground text-sm">
              Aceasta politica nu a fost configurata inca.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Proprietarul magazinului o va adauga in curand.
            </p>
          </div>
        ) : (
          <div
            className="policy-content text-sm text-foreground"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}

        <div className="mt-12 pt-6 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} {business.business_name}. Toate drepturile rezervate.
          </p>
        </div>
      </main>
    </div>
  );
}
