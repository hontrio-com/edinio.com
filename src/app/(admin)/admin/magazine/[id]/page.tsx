import { requireAdmin } from "@/lib/admin-guard";
import { Suspense, type ComponentProps } from "react";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminBusinessDetailClient } from "@/components/admin/AdminBusinessDetailClient";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Detalii magazin" };

type Magazin = ComponentProps<typeof AdminBusinessDetailClient>["business"];

/**
 * Randul magazinului se citeste AICI, nu sub `<Suspense>`.
 *
 * E o cautare dupa cheia primara, deci ieftina, si de ea atarna `notFound()`:
 * daca ar sta in copil, coaja ar fi plecat deja spre browser si 404-ul ar veni
 * dupa un antet care nu trebuia sa existe. Restul — 200 de comenzi, toate
 * produsele, setarile, domeniile si contul de autentificare al proprietarului —
 * curge dupa cadru.
 */
export default async function AdminBusinessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  /* ⚠ Paza pe FIECARE pagina, nu doar in aspect. Vezi nota din layout. */
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const { data: business } = await admin.from("businesses").select("*").eq("id", id).single();

  if (!business) notFound();

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <Suspense fallback={<ScheletMagazin />}>
        <DetaliiMagazin id={id} business={business} />
      </Suspense>
    </div>
  );
}

function ScheletMagazin() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-32" />

      {/* antetul magazinului */}
      <Skeleton className="h-[188px] rounded-2xl" />

      {/* taburile */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24" />
        ))}
      </div>

      {/* tabelul din tab */}
      <Skeleton className="h-[440px] rounded-2xl" />
    </div>
  );
}

async function DetaliiMagazin({ id, business }: { id: string; business: Magazin }) {
  const admin = createAdminClient();

  const [{ data: orders }, { data: products }, { data: settings }, { data: domains }] = await Promise.all([
    admin.from("orders").select("id, order_number, customer_name, customer_email, customer_phone, total, status, payment_method, created_at, shipping_address").eq("business_id", id).order("created_at", { ascending: false }).limit(200),
    admin.from("products").select("id, name, price, is_active, created_at").eq("business_id", id).order("created_at", { ascending: false }),
    admin.from("store_settings").select("*").eq("business_id", id).single(),
    admin.from("domains").select("*").eq("business_id", id),
  ]);

  // Coloanele `*_config` din store_settings contin credentialele TERTILOR ale
  // comerciantului, in text clar: token SmartBill, client_secret Oblio, api_key
  // Netopia, parolele de curier FAN/DPD/Cargus/Sameday, api_token Notice.ro,
  // parola SMTP, chei Mailchimp/Brevo/Klaviyo. Randul intreg pleca inainte catre
  // o Client Component, deci ajungea in payload-ul RSC si se citea din Inspect
  // Element — pentru ORICE magazin de pe platforma.
  //
  // Panoul are nevoie doar de cateva valori scalare si de un bec aprins/stins per
  // integrare, deci proiectam EXACT atat, aici pe server. Tipurile TypeScript nu
  // filtreaza nimic la rulare; doar selectia asta conteaza.
  const esteActiv = (config: unknown): boolean =>
    !!config && typeof config === "object" && (config as { enabled?: boolean }).enabled === true;

  // Metodele de plata: doar cheie/eticheta/activ. Formatul nou e
  // [{ type, enabled, label }]; toleram si sirurile din formatul vechi.
  const listaPlati: { key: string; label: string; enabled: boolean }[] = Array.isArray(settings?.payment_methods)
    ? (settings.payment_methods as unknown[]).flatMap((m) => {
        if (m && typeof m === "object" && "type" in m) {
          const o = m as { type?: string; label?: string; enabled?: boolean };
          return [{ key: String(o.type ?? ""), label: o.label || String(o.type ?? ""), enabled: o.enabled !== false }];
        }
        if (typeof m === "string") return [{ key: m, label: m, enabled: true }];
        return [];
      })
    : [];

  const settingsSigure = settings
    ? {
        listaPlati,
        currency: settings.currency,
        default_shipping_cost: settings.default_shipping_cost,
        free_shipping_threshold: settings.free_shipping_threshold,
        min_order_amount: settings.min_order_amount,
        shipping_enabled: settings.shipping_enabled,
        prices_include_vat: settings.prices_include_vat,
        show_vat_breakdown: settings.show_vat_breakdown,
        order_counter: settings.order_counter,
        order_number_format: settings.order_number_format,
        activ: {
          sameday: esteActiv(settings.sameday_config),
          fanCourier: esteActiv(settings.fan_courier_config),
          cargus: esteActiv(settings.cargus_config),
          dpd: esteActiv(settings.dpd_config),
          colete: esteActiv(settings.colete_config),
          fgo: esteActiv(settings.fgo_config),
          stripe: esteActiv(settings.stripe_config),
          netopia: esteActiv(settings.netopia_config),
          smartbill: esteActiv(settings.smartbill_config),
          oblio: esteActiv(settings.oblio_config),
          smso: esteActiv(settings.smso_config),
          marketing: esteActiv(settings.marketing_config),
        },
      }
    : null;

  const { data: profile } = await admin.from("users_profile").select("id, full_name, plan, role, created_at").eq("id", business.user_id).single();
  const { data: authUser } = await admin.auth.admin.getUserById(business.user_id);

  return (
    <AdminBusinessDetailClient
      business={business}
      orders={orders ?? []}
      products={products ?? []}
      owner={profile ?? null}
      ownerEmail={authUser?.user?.email ?? ""}
      settings={settingsSigure}
      domains={domains ?? []}
    />
  );
}
