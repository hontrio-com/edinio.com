import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { OrdersClient } from "@/components/dashboard/OrdersClient";
import { Skeleton } from "@/components/ui/skeleton";
import { ORDERS_PAGE_SIZE, firstParam, pageParam, orSafeTerm } from "@/lib/orders/pagination";
import { MARKETPLACE_ORIGINI } from "@/lib/orders/origin";
import { ORDER_STATUS } from "@/lib/orders/status";
import type { SmartbillConfig } from "@/lib/smartbill";
import type { WootConfig } from "@/lib/woot";
import type { COConfig } from "@/lib/colete";
import type { OblioConfig } from "@/lib/oblio";
import type { FgoConfig } from "@/lib/fgo";
import type { CargusConfig } from "@/lib/cargus";
import type { DpdConfig } from "@/lib/dpd";
import type { GlsConfig } from "@/lib/gls/client";
import type { PallExConfig } from "@/lib/pallex/client";
import type { EcoletConfig } from "@/lib/ecolet/client";
import type { PostaConfig } from "@/lib/posta/client";
import type { InnoshipConfig } from "@/lib/innoship/client";
import type { FanCourierConfig } from "@/lib/fancourier";
import type { SamedayConfig } from "@/lib/sameday";

// Bulk invoice issuance runs sequentially (one document number at a time) and can
// span dozens of orders, so give this route's server actions ample headroom.
export const maxDuration = 300;

/**
 * Ce facturier si ce curieri sunt gata se stie dupa PRIMA interogare; lista de
 * comenzi si numaratoarea pe stari cer inca doua drumuri la baza (cautarea cu
 * `ilike` pe cinci coloane e cea mai lenta dintre ele). Cadrul si butoanele in
 * bloc depind doar de setari, deci pleaca imediat, iar sub `<Suspense>` ramane
 * doar tabelul.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const q = (firstParam(sp.q) ?? "").trim().slice(0, 80);
  const statusRaw = firstParam(sp.status) ?? "all";
  const status = statusRaw in ORDER_STATUS ? statusRaw : "all";
  // Sursa comenzii: „all", „store" (magazinul propriu) sau cheia unui marketplace.
  // Validata contra listei cunoscute, ca sa nu ajunga text arbitrar in filtru.
  const sourceRaw = firstParam(sp.source) ?? "all";
  const source = sourceRaw === "all" || sourceRaw === "store" || sourceRaw in MARKETPLACE_ORIGINI ? sourceRaw : "all";
  const page = pageParam(sp.page);

  const { data: bizRow } = await supabase
    .from("businesses")
    .select("id, business_name, store_settings(smartbill_config, woot_config, colete_config, oblio_config, fgo_config, cargus_config, dpd_config, fan_courier_config, sameday_config, gls_config, pallex_config, ecolet_config, posta_config, innoship_config, packeta_config, smartship_config, shipo_config, fedex_config, ups_config)")
    .eq("user_id", user.id)
    .eq("type", "ministore")
    .limit(1)
    .single();

  if (!bizRow) redirect("/dashboard");
  const business = { id: bizRow.id, business_name: bizRow.business_name };
  const settings = Array.isArray(bizRow.store_settings) ? bizRow.store_settings[0] ?? null : bizRow.store_settings ?? null;

  const smartbillEnabled =
    (settings?.smartbill_config as SmartbillConfig | null)?.enabled === true;
  const wc = settings?.woot_config as WootConfig | null;
  const wootEnabled = !!(wc?.enabled && wc?.public_key && wc?.secret_key);
  const cc = settings?.colete_config as COConfig | null;
  const coleteEnabled = !!(cc?.enabled && cc?.client_id && cc?.client_secret);
  const oc = settings?.oblio_config as OblioConfig | null;
  const oblioEnabled = !!(oc?.enabled && oc?.client_id && oc?.cif && oc?.series_invoice);
  const fc = settings?.fgo_config as FgoConfig | null;
  const fgoEnabled = !!(fc?.enabled && fc?.cod_unic && fc?.private_key && fc?.serie);
  const cg = settings?.cargus_config as CargusConfig | null;
  const cargusEnabled = !!(cg?.enabled && cg?.username && cg?.subscription_key && cg?.location_id);
  const dg = settings?.dpd_config as DpdConfig | null;
  const dpdEnabled = !!(dg?.enabled && dg?.username && dg?.client_id);
  const gl = settings?.gls_config as GlsConfig | null;
  /* Client Number-ul e obligatoriu in fiecare cerere MyGLS. */
  const glsEnabled = !!(gl?.enabled && gl?.username && gl?.client_number);
  /* Aceeasi regula ca in orders/[orderId]/page.tsx. Desincronizate, butonul ar
     aparea intr-o pagina si ar lipsi din cealalta. */
  const pe = settings?.pallex_config as PallExConfig | null;
  const pallexEnabled = !!(pe?.enabled && pe?.username);
  const ec = settings?.ecolet_config as EcoletConfig | null;
  const ecoletEnabled = !!(ec?.enabled && ec?.api_token);
  /* Aceeasi regula ca in `postaGata` si ca in pagina comenzii. */
  const po = settings?.posta_config as PostaConfig | null;
  const postaEnabled = !!(po?.enabled && po?.username && po?.cod_trimitere);
  /* Aceeasi regula ca in `packetaGata`: parola API si eticheta de expeditor. */
  const pk = settings?.packeta_config as { enabled?: boolean; api_password?: string; eshop?: string } | null;
  const packetaEnabled = !!(pk?.enabled && pk?.api_password && pk?.eshop);
  /* Aceeasi regula ca in `smartshipGata`: cheia SI adresa de ridicare completa. */
  const sh = settings?.shipo_config as { enabled?: boolean; api_key?: string; sender_address_id?: number } | null;
  const shipoEnabled = !!(sh?.enabled && sh?.api_key && Number(sh?.sender_address_id) > 0);
  /* Aceeasi regula ca in `fedexGata` si ca in pagina comenzii: amandoua
     credentialele, contul, si adresa de expeditie cu cod postal. */
  const fx = settings?.fedex_config as {
    enabled?: boolean; client_id?: string; client_secret?: string; account_number?: string;
    expeditor?: { oras?: string; cod_postal?: string };
  } | null;
  const fedexEnabled = !!(
    fx?.enabled && fx?.client_id && fx?.client_secret && fx?.account_number
    && fx?.expeditor?.oras && fx?.expeditor?.cod_postal
  );

  /* Aceeasi regula ca in `upsGata` si ca in pagina comenzii: amandoua credentialele,
     contul de sase caractere, si adresa de expeditie cu cod postal. */
  const up = settings?.ups_config as {
    enabled?: boolean; client_id?: string; client_secret?: string; account_number?: string;
    expeditor?: { oras?: string; cod_postal?: string };
  } | null;
  const upsEnabled = !!(
    up?.enabled && up?.client_id && up?.client_secret && up?.account_number
    && up?.expeditor?.oras && up?.expeditor?.cod_postal
  );

  const ss = settings?.smartship_config as { enabled?: boolean; api_key?: string; expeditor?: { name?: string; address?: string; phone?: string; city?: number } } | null;
  const smartshipEnabled = !!(
    ss?.enabled && ss?.api_key && ss?.expeditor?.name && ss?.expeditor?.address
    && ss?.expeditor?.phone && Number(ss?.expeditor?.city) > 0
  );
  const io = settings?.innoship_config as InnoshipConfig | null;
  const innoshipEnabled = !!(io?.enabled && io?.api_key && io?.external_client_location);
  const pallexZile = { ridicare: pe?.zile_pana_la_ridicare ?? 1, livrare: pe?.zile_pana_la_livrare ?? 2 };
  const fg = settings?.fan_courier_config as FanCourierConfig | null;
  const fanCourierEnabled = !!(fg?.enabled && fg?.username && fg?.client_id);
  const sg = settings?.sameday_config as SamedayConfig | null;
  const samedayEnabled = !!(sg?.enabled && sg?.username && sg?.pickup_point_id);

  const integrari: Integrari = {
    smartbillEnabled, wootEnabled, coleteEnabled, oblioEnabled, fgoEnabled,
    cargusEnabled, dpdEnabled, glsEnabled, pallexEnabled, pallexZile, ecoletEnabled, postaEnabled, packetaEnabled, smartshipEnabled, shipoEnabled, fedexEnabled, upsEnabled, innoshipEnabled, fanCourierEnabled, samedayEnabled,
    fanPickup: { lastDate: fg?.last_pickup_date ?? null, lastId: fg?.last_pickup_id ?? null },
  };

  return (
    <div className="p-6">
      <Suspense fallback={<ScheletComenzi />}>
        <ListaComenzi
          businessId={business.id}
          q={q}
          status={status}
          source={source}
          page={page}
          integrari={integrari}
        />
      </Suspense>
    </div>
  );
}

/** Steagurile derivate din `store_settings` — se calculeaza o data, in parinte. */
type Integrari = {
  smartbillEnabled: boolean;
  wootEnabled: boolean;
  coleteEnabled: boolean;
  oblioEnabled: boolean;
  fgoEnabled: boolean;
  cargusEnabled: boolean;
  dpdEnabled: boolean;
  glsEnabled: boolean;
  pallexEnabled: boolean;
  postaEnabled: boolean;
  packetaEnabled: boolean;
  smartshipEnabled: boolean;
  shipoEnabled: boolean;
  fedexEnabled: boolean;
  upsEnabled: boolean;
  innoshipEnabled: boolean;
  pallexZile: { ridicare: number; livrare: number };
  ecoletEnabled: boolean;
  fanCourierEnabled: boolean;
  samedayEnabled: boolean;
  fanPickup: { lastDate: string | null; lastId: string | null };
};

function ScheletComenzi() {
  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-40 rounded-xl" />
      </div>
      {/*
        * Opt file: cele sapte stari din `ORDER_STATUS` plus „Toate" — vezi
        * `STATUS_TABS` din OrdersClient. Numarul era 5, preluat dintr-un
        * `loading.tsx` vechi, si randul chiar se reaseza cand soseau datele.
        */}
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24" />
        ))}
      </div>
      <Skeleton className="h-12 rounded-t-xl rounded-b-none" />
      <div className="space-y-px">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-none" />
        ))}
      </div>
    </>
  );
}

async function ListaComenzi({
  businessId,
  q,
  status,
  source,
  page,
  integrari,
}: {
  businessId: string;
  q: string;
  status: string;
  source: string;
  page: number;
  integrari: Integrari;
}) {
  const supabase = await createClient();

  // Paginare/cautare/filtrare in SQL: aducem DOAR pagina curenta de comenzi,
  // niciodata tot istoricul (PostgREST trunchiaza silentios la 1000 de
  // randuri, iar la volum mare payload-ul ar fi oricum inutilizabil).
  let listQuery = supabase
    .from("orders")
    .select("*", { count: "exact" })
    .eq("business_id", businessId);
  if (status !== "all") listQuery = listQuery.eq("status", status);
  /*
   * Filtrarea dupa sursa se face in SQL, pe `order_source->>marketplace`, nu in
   * pagina: altfel „doar Trendyol" ar filtra numai comenzile paginii curente si
   * ar arata gol chiar cand exista comenzi Trendyol mai jos.
   *
   * „Magazin" inseamna „fara marker de marketplace" — inclusiv comenzile vechi,
   * de dinainte de atribuire, care n-au deloc `order_source`.
   */
  if (source === "store") listQuery = listQuery.is("order_source->>marketplace", null);
  else if (source !== "all") listQuery = listQuery.eq("order_source->>marketplace", source);
  const term = orSafeTerm(q);
  if (term) {
    // Denumirea firmei si CUI-ul intra si ele in cautare: lista le AFISEAZA pe
    // comenzile pe persoana juridica, iar un camp care se vede pe ecran dar nu se
    // poate cauta arata ca o comanda disparuta.
    //
    // In baza, CUI-ul e numai cifre; panoul, emailul si factura il scriu insa cu
    // „RO" in fata la platitorii de TVA. Comerciantul copiaza fix ce vede, deci
    // prefixul se taie pentru ramura de CUI — si NUMAI pentru ea: o firma se poate
    // numi „Rodbun", iar cautarea dupa nume n-are de ce sa piarda primele doua
    // litere.
    const termCui = term.replace(/^ro(?=\d)/i, "");
    listQuery = listQuery.or(
      `order_number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%,` +
      `billing_company->>company_name.ilike.%${term}%,billing_company->>cui.ilike.%${termCui}%`
    );
  }
  const fromIdx = (page - 1) * ORDERS_PAGE_SIZE;

  const [{ data: orders, count: totalCount }, { data: statusRows }] = await Promise.all([
    listQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(fromIdx, fromIdx + ORDERS_PAGE_SIZE - 1),
    supabase.rpc("orders_status_counts", { bid: businessId }),
  ]);

  // Cate comenzi are fiecare sursa. Se numara doar sursele care chiar exista,
  // ca sa nu arate un filtru „Trendyol" unui magazin care n-a vandut acolo.
  const surseCount: Record<string, number> = {};
  await Promise.all(["store", ...Object.keys(MARKETPLACE_ORIGINI)].map(async (cheie) => {
    let cq = supabase.from("orders").select("id", { count: "exact", head: true }).eq("business_id", businessId);
    cq = cheie === "store"
      ? cq.is("order_source->>marketplace", null)
      : cq.eq("order_source->>marketplace", cheie);
    const { count } = await cq;
    surseCount[cheie] = count ?? 0;
  }));

  const statusCounts: Record<string, number> = {};
  for (const r of statusRows ?? []) statusCounts[r.status] = Number(r.cnt);
  const pendingCount = statusCounts.pending ?? 0;

  return (
    <OrdersClient orders={orders ?? []} totalCount={totalCount ?? 0} statusCounts={statusCounts} page={page} searchQuery={q} statusFilter={status} sourceFilter={source} sourceCounts={surseCount} pendingCount={pendingCount} smartbillEnabled={integrari.smartbillEnabled} wootEnabled={integrari.wootEnabled} coleteEnabled={integrari.coleteEnabled} oblioEnabled={integrari.oblioEnabled} fgoEnabled={integrari.fgoEnabled} cargusEnabled={integrari.cargusEnabled} dpdEnabled={integrari.dpdEnabled} glsEnabled={integrari.glsEnabled} pallexEnabled={integrari.pallexEnabled} pallexZile={integrari.pallexZile} ecoletEnabled={integrari.ecoletEnabled} postaEnabled={integrari.postaEnabled} packetaEnabled={integrari.packetaEnabled} smartshipEnabled={integrari.smartshipEnabled} shipoEnabled={integrari.shipoEnabled} fedexEnabled={integrari.fedexEnabled} upsEnabled={integrari.upsEnabled} innoshipEnabled={integrari.innoshipEnabled} fanCourierEnabled={integrari.fanCourierEnabled} samedayEnabled={integrari.samedayEnabled} businessId={businessId} fanPickup={integrari.fanPickup} />
  );
}
