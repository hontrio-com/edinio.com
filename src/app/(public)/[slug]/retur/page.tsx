import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";
import { ReturnRequestClient } from "@/components/ministore/ReturnRequestClient";

// Funcția de retragere din contract — OUG 18/2026. Pagină personală/tranzitorie: noindex.
export const metadata: Metadata = { robots: { index: false } };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ order?: string }>;
}

export default async function ReturPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { order } = await searchParams;

  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("id, business_name, store_name, primary_color, logo_url, custom_domain")
    .eq("slug", slug)
    .single();
  if (!business) notFound();

  const color = business.primary_color ?? "#1AB554";
  const storeName = business.store_name ?? business.business_name;

  // Custom-domain aware base path (proxy rewrites customdomain.ro/x -> /slug/x).
  const host = (await headers()).get("host")?.split(":")[0] ?? "";
  const isCustomDomain = business.custom_domain && host === business.custom_domain;
  const basePath = isCustomDomain ? "" : `/${slug}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <a href={`${basePath}/`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Inapoi la magazin
          </a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 sm:py-10">
        <div className="flex items-center mb-6">
          {business.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logo_url} alt={storeName} style={{ height: 40, maxWidth: 40 * 4.2 }} className="w-auto object-contain" />
          ) : (
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0" style={{ backgroundColor: color }}>
              {storeName[0]?.toUpperCase()}
            </div>
          )}
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-foreground mb-2">Retrage-te din contract</h1>
        <div className="w-12 h-1 rounded-full mb-5" style={{ backgroundColor: color }} />
        <p className="text-sm text-muted-foreground leading-relaxed mb-8">
          Conform OUG nr. 34/2014 si OUG nr. 18/2026, ai dreptul sa te retragi din contract in termen de 14 zile
          calendaristice de la primirea produsului, fara sa invoci vreun motiv. Completeaza formularul de mai jos, iar
          noi iti trimitem imediat, pe email, confirmarea cererii.
        </p>

        <ReturnRequestClient
          businessId={business.id}
          basePath={basePath}
          color={color}
          storeName={storeName}
          prefillOrder={order?.trim() ?? ""}
        />
      </main>
    </div>
  );
}
