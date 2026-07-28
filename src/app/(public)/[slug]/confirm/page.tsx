import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CheckCircle, Package, Phone, ArrowLeft, XCircle } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { ConfettiEffect } from "@/components/ministore/ConfettiEffect";
import { FbPurchaseEvent } from "@/components/public/FbPurchaseEvent";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { buildChromeData, loadSearchCategories } from "@/lib/storefront/chrome-value";
import { resolveDesign } from "@/lib/storefront/design/parse";
import { radacinaCatalog } from "@/lib/storefront/design/commerce";
import type { StorePageContent } from "@/lib/storefront/store-content.types";
import type { MarketingConfig } from "@/lib/marketing";
import type { Metadata } from "next";

// Order confirmation is personal + transient — keep it out of search.
// `openGraph`/`twitter` se sting explicit: nedeclarate, pagina ar fi mostenit
// cardul de marketing al Edinio din layout-ul radacina.
export const metadata: Metadata = { robots: { index: false }, openGraph: null, twitter: null };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ orderId?: string; name?: string; total?: string; status?: string; motiv?: string }>;
}

export default async function ConfirmPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { orderId, name, total, status, motiv } = await searchParams;

  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("id, user_id, slug, business_name, store_name, tagline, description, phone, whatsapp, email, address, city, county, cui, reg_com, store_address, store_city, store_county, logo_url, cover_url, primary_color, is_published, custom_domain, social, gallery, features")
    .eq("slug", slug)
    .single();
  if (!business) notFound();

  const color = business.primary_color ?? "#1AB554";

  // Detect custom domain access
  const headersList = await headers();
  const host = (headersList.get("host") ?? "").split(":")[0];
  const isCustomDomain = business.custom_domain && host === business.custom_domain;
  const basePath = isCustomDomain ? "" : `/${business.slug}`;

  // Fetch order details via admin client (orders RLS restricts anonymous SELECT)
  let orderItems: { product_id?: string; name: string; price: number; quantity: number }[] = [];
  let shippingCost = 0;
  let discountAmount = 0;
  let cardDiscountAmount = 0;
  let codDiscountAmount = 0;
  let discountCode: string | null = null;
  let orderNumber: string | null = null;
  // Customer identifiers for pixel Advanced Matching (hashed client-side).
  let customerName: string | null = null;
  let customerEmail: string | null = null;
  let customerPhone: string | null = null;
  let totalComanda: number | null = null;

  if (orderId) {
    const adminClient = createAdminClient();
    const { data: order } = await adminClient
      .from("orders")
      .select("order_number, items, shipping_cost, discount_amount, discount_code, card_discount_amount, cod_discount_amount, subtotal, total, customer_name, customer_email, customer_phone")
      .eq("id", orderId)
      .eq("business_id", business.id)
      .single();

    if (order) {
      orderItems = (order.items as { product_id?: string; name: string; price: number; quantity: number }[]) ?? [];
      shippingCost = order.shipping_cost ?? 0;
      discountAmount = order.discount_amount ?? 0;
      cardDiscountAmount = order.card_discount_amount ?? 0;
      codDiscountAmount = order.cod_discount_amount ?? 0;
      discountCode = order.discount_code ?? null;
      orderNumber = order.order_number ?? null;
      customerName = order.customer_name ?? null;
      customerEmail = order.customer_email ?? null;
      customerPhone = order.customer_phone ?? null;
      totalComanda = order.total != null ? Number(order.total) : null;
    }
  }

  const numItems = orderItems.reduce((s, i) => s + (i.quantity || 1), 0);
  // GA4/Meta/TikTok item payloads for the purchase conversion (item-level revenue).
  const purchaseItems = orderItems.map((i) => ({ item_id: i.product_id, item_name: i.name, price: i.price, quantity: i.quantity }));

  const subtotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
  // Totalul SALVAT al comenzii, nu unul recalculat din linii: recalcularea nu
  // stie de TVA-ul adaugat, deci magazinele cu preturi fara TVA aratau
  // clientului mai putin decat s-a comandat si decat scrie pe factura. Suma din
  // adresa ramane ultima rezerva, pentru linkurile vechi.
  const computedTotal = subtotal + shippingCost - discountAmount - cardDiscountAmount - codDiscountAmount;
  const displayTotal = totalComanda ?? (computedTotal || Number(total) || 0);

  const { data: storeSettings } = await createAdminClient()
    .from("store_settings")
    .select("marketing_config, page_content, storefront_design")
    .eq("business_id", business.id)
    .single();
  const marketingConfig = (storeSettings?.marketing_config as MarketingConfig | null) ?? null;

  // Acelasi header, footer si culori ca pe restul magazinului. Era singura pagina
  // publica fara invelis, deci clientul care tocmai platise nu avea pe ecran nici
  // datele de identificare ale vanzatorului, nici insignele ANPC, nici politicile.
  const pageContent = (storeSettings?.page_content ?? {}) as StorePageContent;
  const resolved = resolveDesign(storeSettings?.storefront_design, {
    primaryColor: color,
    pageContent: pageContent as Record<string, unknown>,
    features: (business.features as Record<string, unknown>) ?? {},
    coverUrl: business.cover_url,
    tagline: business.tagline,
  });
  const searchCategories = await loadSearchCategories(business.id, resolved.design);
  /*
   * „Inapoi la magazin" duce la PRODUSE, nu la radacina.
   *
   * Cel mai scump dintre cele opt linkuri de intoarcere: aici ajunge clientul
   * caruia i-a fost refuzata plata si care trebuie sa reia cumparaturile. Cand
   * catalogul si-a luat pagina lui, radacina nu mai are niciun produs.
   */
  const catreProduse = radacinaCatalog(basePath, resolved.design);

  const chrome = buildChromeData({
    searchCategories, business: business as never, pageContent, basePath, design: resolved.design });

  // Payment failure screen (used by iPay declines, where the reason is shown to the customer).
  if (status === "esuat") {
    return (
      <StorefrontThemeScope style={resolved.style}>
        <StorePageShell chrome={chrome} design={resolved.design} className="min-h-screen flex flex-col">
          <main className="flex-1 w-full flex flex-col items-center justify-center px-4 py-12">
            <div className="w-full max-w-md">
              <div className="bg-[var(--st-surface)] rounded-2xl shadow-lg border border-[var(--st-border)] overflow-hidden">
                <div className="px-8 py-10 text-center">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 bg-red-50">
                    <XCircle className="h-10 w-10 text-red-500" />
                  </div>
                  <h1 className="text-2xl font-black text-[var(--st-text)] mb-2 tracking-tight">Plata nu a reusit</h1>
                  <p className="text-[var(--st-muted)] text-sm leading-relaxed">
                    {motiv || "Tranzactia a fost refuzata. Te rugam incearca din nou sau foloseste alt card."}
                  </p>
                  {orderNumber && <p className="text-xs text-[var(--st-muted)] font-medium mt-3">{orderNumber}</p>}
                </div>
              </div>
              <a href={catreProduse}
                className="mt-6 flex items-center justify-center gap-2 w-full py-3.5 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90"
                style={{ backgroundColor: color }}>
                <ArrowLeft className="h-4 w-4" />
                Inapoi la magazin
              </a>
            </div>
          </main>
        </StorePageShell>
      </StorefrontThemeScope>
    );
  }

  return (
    <StorefrontThemeScope style={resolved.style}>
      <StorePageShell chrome={chrome} design={resolved.design} className="min-h-screen flex flex-col">
        <main className="flex-1 w-full flex flex-col items-center justify-center px-4 py-12">
          <ConfettiEffect color={color} />
          {orderId && (
            <FbPurchaseEvent
              orderId={orderId}
              total={displayTotal}
              numItems={numItems}
              items={purchaseItems}
              googleTagId={marketingConfig?.google_tag_id}
              googleAdsConversionLabel={marketingConfig?.google_ads_conversion_label}
              fbPixelId={marketingConfig?.facebook_pixel_id}
              ttPixelId={marketingConfig?.tiktok_pixel_id}
              customer={{ name: customerName, email: customerEmail, phone: customerPhone }}
            />
          )}

          <div className="w-full max-w-md">
            {/* Success card */}
            <div className="bg-[var(--st-surface)] rounded-2xl shadow-lg border border-[var(--st-border)] overflow-hidden">
              <div className="px-8 py-10 text-center">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
                  style={{ backgroundColor: `${color}20` }}>
                  <CheckCircle className="h-10 w-10" style={{ color }} />
                </div>

                <h1 className="text-2xl font-black text-[var(--st-text)] mb-2 tracking-tight">
                  Comanda plasata!
                </h1>
                {orderNumber && (
                  <p className="text-xs text-[var(--st-muted)] font-medium mb-2">{orderNumber}</p>
                )}
                {/* Numele vine din comanda, nu din adresa: e sursa sigura si nu
                    cere ca fiecare din cele opt cai catre pagina asta sa il puna
                    in URL. `?name=` ramane refugiu pentru linkurile vechi. */}
                <p className="text-[var(--st-muted)] text-sm leading-relaxed">
                  Multumim{customerName || name ? `, ${customerName ?? name}` : ""}! Comanda ta va fi pregatita si trimisa la curier cat mai rapid posibil.
                </p>
              </div>

              {/* Order summary */}
              {orderItems.length > 0 && (
                <div className="px-8 pb-6">
                  <div className="rounded-xl border border-[var(--st-border)] overflow-hidden">
                    <div className="px-4 py-3 bg-[var(--st-bg)] border-b border-[var(--st-border)]">
                      <p className="text-xs font-semibold text-[var(--st-muted)] uppercase tracking-wide">Sumar comanda</p>
                    </div>
                    <div className="divide-y divide-[var(--st-border)]">
                      {orderItems.map((item, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[var(--st-text)] truncate">{item.name}</p>
                            {item.quantity > 1 && (
                              <p className="text-xs text-[var(--st-muted)]">{item.quantity} x {formatPrice(item.price)}</p>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-[var(--st-text)] ml-4 shrink-0">
                            {formatPrice(item.price * item.quantity)}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-[var(--st-border)] px-4 py-3 space-y-2">
                      {shippingCost > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[var(--st-muted)]">Transport</span>
                          <span className="font-medium text-[var(--st-text)]">{formatPrice(shippingCost)}</span>
                        </div>
                      )}
                      {shippingCost === 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[var(--st-muted)]">Transport</span>
                          <span className="font-medium text-green-600">Gratuit</span>
                        </div>
                      )}
                      {discountAmount > 0 && discountCode && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[var(--st-muted)]">Reducere ({discountCode})</span>
                          <span className="font-medium text-green-600">- {formatPrice(discountAmount)}</span>
                        </div>
                      )}
                      {cardDiscountAmount > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[var(--st-muted)]">Reducere plata cu cardul</span>
                          <span className="font-medium text-green-600">- {formatPrice(cardDiscountAmount)}</span>
                        </div>
                      )}
                      {codDiscountAmount > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[var(--st-muted)]">Reducere plata ramburs</span>
                          <span className="font-medium text-green-600">- {formatPrice(codDiscountAmount)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-2 border-t border-[var(--st-border)]">
                        <span className="text-sm font-semibold text-[var(--st-text)]">Total de plata</span>
                        <span className="font-black text-lg" style={{ color }}>{formatPrice(displayTotal)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Fallback total (no order details fetched) */}
              {orderItems.length === 0 && (total) && (
                <div className="px-8 pb-6">
                  <div className="p-4 rounded-xl bg-[var(--st-bg)] border border-[var(--st-border)]">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--st-muted)] font-medium">Total de plata la livrare</span>
                      <span className="font-black text-lg" style={{ color }}>{formatPrice(Number(total))}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t border-[var(--st-border)] px-8 py-6 space-y-3">
                <div className="flex items-start gap-3">
                  <Package className="h-5 w-5 text-[var(--st-muted)] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--st-text)]">Livrare 24-48h</p>
                    <p className="text-xs text-[var(--st-muted)]">Curierul te va contacta la adresa furnizata</p>
                  </div>
                </div>
                {business.phone && (
                  <div className="flex items-start gap-3">
                    <Phone className="h-5 w-5 text-[var(--st-muted)] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-[var(--st-text)]">Suport clienti</p>
                      <a href={`tel:${business.phone}`} className="text-xs font-medium hover:underline" style={{ color }}>
                        {business.phone}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <a href={catreProduse}
              className="mt-6 flex items-center justify-center gap-2 w-full py-3.5 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90"
              style={{ backgroundColor: color }}>
              <ArrowLeft className="h-4 w-4" />
              Inapoi la magazin
            </a>

            {/* Linkul de retragere ramane si aici, nu doar in subsol: pe pagina asta
                poate duce numarul comenzii mai departe, ca formularul sa vina completat. */}
            <p className="text-center text-xs text-[var(--st-muted)] mt-4">
              Te-ai razgandit? Ai dreptul sa te{" "}
              <a href={`${basePath}/retur${orderNumber ? `?order=${encodeURIComponent(orderNumber)}` : ""}`} className="underline hover:opacity-70">retragi din contract</a>{" "}
              in 14 zile de la primire.
            </p>
          </div>
        </main>
      </StorePageShell>
    </StorefrontThemeScope>
  );
}
