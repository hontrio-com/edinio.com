import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CheckCircle, Package, Phone, ArrowLeft } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { ConfettiEffect } from "@/components/ministore/ConfettiEffect";
import { FbPurchaseEvent } from "@/components/public/FbPurchaseEvent";
import type { MarketingConfig } from "@/lib/marketing";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ orderId?: string; name?: string; total?: string }>;
}

export default async function ConfirmPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { orderId, name, total } = await searchParams;

  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses").select("id, business_name, primary_color, logo_url, phone, slug, custom_domain").eq("slug", slug).single();
  if (!business) notFound();

  const color = business.primary_color ?? "#1AB554";

  // Detect custom domain access
  const headersList = await headers();
  const host = (headersList.get("host") ?? "").split(":")[0];
  const isCustomDomain = business.custom_domain && host === business.custom_domain;
  const basePath = isCustomDomain ? "" : `/${business.slug}`;

  // Fetch order details for summary
  let orderItems: { name: string; price: number; quantity: number }[] = [];
  let shippingCost = 0;
  let discountAmount = 0;
  let discountCode: string | null = null;
  let orderNumber: string | null = null;

  if (orderId) {
    const { data: order } = await supabase
      .from("orders")
      .select("order_number, items, shipping_cost, discount_amount, discount_code, subtotal, total")
      .eq("id", orderId)
      .single();

    if (order) {
      orderItems = (order.items as { name: string; price: number; quantity: number }[]) ?? [];
      shippingCost = order.shipping_cost ?? 0;
      discountAmount = order.discount_amount ?? 0;
      discountCode = order.discount_code ?? null;
      orderNumber = order.order_number ?? null;
    }
  }

  const subtotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const computedTotal = subtotal + shippingCost - discountAmount;
  const displayTotal = computedTotal || Number(total) || 0;

  const { data: storeSettings } = await supabase
    .from("store_settings")
    .select("marketing_config")
    .eq("business_id", business.id)
    .single();
  const marketingConfig = (storeSettings?.marketing_config as MarketingConfig | null) ?? null;

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center px-4 py-12">
      <ConfettiEffect color={color} />
      {orderId && (
        <FbPurchaseEvent
          orderId={orderId}
          total={displayTotal}
          googleTagId={marketingConfig?.google_tag_id}
          googleAdsConversionLabel={marketingConfig?.google_ads_conversion_label}
        />
      )}

      <div className="w-full max-w-md">
        {/* Success card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="px-8 py-10 text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ backgroundColor: `${color}20` }}>
              <CheckCircle className="h-10 w-10" style={{ color }} />
            </div>

            <h1 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">
              Comanda plasata!
            </h1>
            {orderNumber && (
              <p className="text-xs text-gray-400 font-medium mb-2">{orderNumber}</p>
            )}
            <p className="text-gray-500 text-sm leading-relaxed">
              Multumim{name ? `, ${name}` : ""}! Comanda ta va fi pregatita si trimisa la curier cat mai rapid posibil.
            </p>
          </div>

          {/* Order summary */}
          {orderItems.length > 0 && (
            <div className="px-8 pb-6">
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sumar comanda</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {orderItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                        {item.quantity > 1 && (
                          <p className="text-xs text-gray-400">{item.quantity} x {formatPrice(item.price)}</p>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-gray-900 ml-4 shrink-0">
                        {formatPrice(item.price * item.quantity)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-100 px-4 py-3 space-y-2">
                  {shippingCost > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Transport</span>
                      <span className="font-medium text-gray-700">{formatPrice(shippingCost)}</span>
                    </div>
                  )}
                  {shippingCost === 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Transport</span>
                      <span className="font-medium text-green-600">Gratuit</span>
                    </div>
                  )}
                  {discountAmount > 0 && discountCode && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Reducere ({discountCode})</span>
                      <span className="font-medium text-green-600">- {formatPrice(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <span className="text-sm font-semibold text-gray-900">Total de plata</span>
                    <span className="font-black text-lg" style={{ color }}>{formatPrice(displayTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Fallback total (no order details fetched) */}
          {orderItems.length === 0 && (total) && (
            <div className="px-8 pb-6">
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 font-medium">Total de plata la livrare</span>
                  <span className="font-black text-lg" style={{ color }}>{formatPrice(Number(total))}</span>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-gray-100 px-8 py-6 space-y-3">
            <div className="flex items-start gap-3">
              <Package className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-gray-900">Livrare 24-48h</p>
                <p className="text-xs text-gray-500">Curierul te va contacta la adresa furnizata</p>
              </div>
            </div>
            {business.phone && (
              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Suport clienti</p>
                  <a href={`tel:${business.phone}`} className="text-xs font-medium hover:underline" style={{ color }}>
                    {business.phone}
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        <a href={`${basePath}/`}
          className="mt-6 flex items-center justify-center gap-2 w-full py-3.5 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90"
          style={{ backgroundColor: color }}>
          <ArrowLeft className="h-4 w-4" />
          Inapoi la magazin
        </a>

        <p className="text-center text-xs text-gray-400 mt-4">
          Creat cu <span className="font-semibold" style={{ color }}>Edinio</span>
        </p>
      </div>
    </div>
  );
}
