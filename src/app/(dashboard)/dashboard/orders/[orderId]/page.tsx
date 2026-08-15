import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { OrderDetailClient } from "@/components/dashboard/OrderDetailClient";
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
import type { SmsoConfig } from "@/lib/smso";

interface Props {
  params: Promise<{ orderId: string }>;
}

export default async function OrderDetailPage({ params }: Props) {
  const { orderId } = await params;
  const supabase = await createClient();

  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (!order) notFound();

  const [{ data: biz }, { data: settings }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id")
      .eq("id", order.business_id)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("store_settings")
      .select("smartbill_config, woot_config, colete_config, oblio_config, fgo_config, cargus_config, dpd_config, fan_courier_config, sameday_config, gls_config, pallex_config, ecolet_config, posta_config, innoship_config, packeta_config, smartship_config, smso_config, vat_enabled, prices_include_vat")
      .eq("business_id", order.business_id)
      .single(),
  ]);

  if (!biz) notFound();

  const sbConfig = settings?.smartbill_config as SmartbillConfig | null;
  const smartbillEnabled = sbConfig?.enabled === true;
  const hasEstimateSeries = !!(sbConfig?.estimate_series_name);

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
  /* Client Number-ul e obligatoriu in fiecare cerere MyGLS: fara el butonul ar
     aparea si ar esua la prima apasare. */
  const glsEnabled = !!(gl?.enabled && gl?.username && gl?.client_number);
  /* Aceeasi regula ca in orders/page.tsx, in features/page.tsx si in `pallexGata`:
     Pall-Ex se autentifica prin HTTP Basic, deci nu are ce cere fara cele doua. */
  const pe = settings?.pallex_config as PallExConfig | null;
  const pallexEnabled = !!(pe?.enabled && pe?.username);
  /* Aceeasi regula ca in `ecoletGata`, in features/page.tsx si in settings. */
  const ec = settings?.ecolet_config as EcoletConfig | null;
  const ecoletEnabled = !!(ec?.enabled && ec?.api_token);
  /* Aceeasi regula ca in `postaGata`, in orders/page.tsx si in features:
     `cod_trimitere` intra in ea desi nu e credentiala, fiindca fara el Posta
     respinge fiecare AWB. */
  const po = settings?.posta_config as PostaConfig | null;
  const postaEnabled = !!(po?.enabled && po?.username && po?.cod_trimitere);
  const postaZilePrezentare = po?.zile_pana_la_prezentare ?? 0;
  /* Aceeasi regula ca in `packetaGata` si in features/page.tsx: parola API si
     eticheta de expeditor. `eshop` intra in ea desi nu e credentiala — un nume
     gresit CREEAZA tacut un expeditor nou la ei si strica facturarea. */
  const pk = settings?.packeta_config as { enabled?: boolean; api_password?: string; eshop?: string } | null;
  const packetaEnabled = !!(pk?.enabled && pk?.api_password && pk?.eshop);

  /* ⚠ Aceeasi regula ca in `smartshipGata`, in features/page.tsx si in checkout:
     cheia de API SI adresa de ridicare cu id-ul ei de localitate. Fara `city` (id
     numeric) fiecare cerere cade pe validare, deci butonul ar promite ceva ce nu
     se poate face. */
  const ss = settings?.smartship_config as { enabled?: boolean; api_key?: string; expeditor?: { name?: string; address?: string; phone?: string; city?: number } } | null;
  const smartshipEnabled = !!(
    ss?.enabled && ss?.api_key && ss?.expeditor?.name && ss?.expeditor?.address
    && ss?.expeditor?.phone && Number(ss?.expeditor?.city) > 0
  );
  const io = settings?.innoship_config as InnoshipConfig | null;
  const innoshipEnabled = !!(io?.enabled && io?.api_key && io?.external_client_location);
  /* Termenele implicite ale formularului de partida: aceleasi pe care le
     foloseste si serverul cand datele lipsesc din cerere. */
  const pallexZile = { ridicare: pe?.zile_pana_la_ridicare ?? 1, livrare: pe?.zile_pana_la_livrare ?? 2 };
  const fg = settings?.fan_courier_config as FanCourierConfig | null;
  const fanCourierEnabled = !!(fg?.enabled && fg?.username && fg?.client_id);
  const sg = settings?.sameday_config as SamedayConfig | null;
  const samedayEnabled = !!(sg?.enabled && sg?.username && sg?.pickup_point_id);
  const sm = settings?.smso_config as SmsoConfig | null;
  const smsoEnabled = !!(sm?.enabled && sm?.api_key && sm?.sender_id);

  /*
   * Regimul de preturi decide daca randul de TVA din caseta de totaluri se ADUNA
   * sau doar se arata. Pagina nu il cerea deloc, iar caseta presupunea „se aduna
   * mereu": pe 20 din cele 96 de comenzi din productie randurile dadeau altceva
   * decat Totalul de sub ele. Implicitele sunt cele din `store_settings`
   * (`prices_include_vat` implicit adevarat), ca un magazin fara rand de setari
   * sa nu inceapa dintr-odata sa adune TVA-ul peste total.
   */
  const setariTva = {
    vat_enabled: settings?.vat_enabled ?? false,
    prices_include_vat: settings?.prices_include_vat ?? true,
  };

  return (
    <OrderDetailClient
      order={order}
      businessId={biz.id}
      setariTva={setariTva}
      smartbillEnabled={smartbillEnabled}
      hasEstimateSeries={hasEstimateSeries}
      wootEnabled={wootEnabled}
      coleteEnabled={coleteEnabled}
      oblioEnabled={oblioEnabled}
      fgoEnabled={fgoEnabled}
      cargusEnabled={cargusEnabled}
      dpdEnabled={dpdEnabled}
      glsEnabled={glsEnabled}
      pallexEnabled={pallexEnabled}
      ecoletEnabled={ecoletEnabled}
      postaEnabled={postaEnabled}
      packetaEnabled={packetaEnabled}
      smartshipEnabled={smartshipEnabled}
      postaZilePrezentare={postaZilePrezentare}
      innoshipEnabled={innoshipEnabled}
      pallexZile={pallexZile}
      fanCourierEnabled={fanCourierEnabled}
      samedayEnabled={samedayEnabled}
      smsoEnabled={smsoEnabled}
    />
  );
}
