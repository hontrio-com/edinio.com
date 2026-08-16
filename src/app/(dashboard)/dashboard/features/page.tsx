import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { GOOGLE_MERCHANT_LIVE } from "@/lib/google-merchant/types";
import { Lock, ArrowRight, CheckCircle } from "lucide-react";
import type { SmsoConfig } from "@/lib/smso";
import type { SmartbillConfig } from "@/lib/smartbill";
import type { StripeConfig } from "@/components/dashboard/StripeConnectClient";
import type { NetopiaConfig } from "@/lib/netopia";
import type { IPayConfig } from "@/lib/ipay";
import type { KlarnaConfig } from "@/lib/klarna";
import type { RevolutConfig } from "@/lib/revolut";
import type { WootConfig } from "@/lib/woot";
import type { COConfig } from "@/lib/colete";
import type { GlsConfig } from "@/lib/gls/client";
import type { PallExConfig } from "@/lib/pallex/client";
import type { EcoletConfig } from "@/lib/ecolet/client";
import type { PostaConfig } from "@/lib/posta/client";
import type { InnoshipConfig } from "@/lib/innoship/client";
import type { OblioConfig } from "@/lib/oblio";
import type { FgoConfig } from "@/lib/fgo";
import type { CargusConfig } from "@/lib/cargus";
import type { DpdConfig } from "@/lib/dpd";
import type { FanCourierConfig } from "@/lib/fancourier";
import type { SamedayConfig } from "@/lib/sameday";
import type { MarketingConfig } from "@/lib/marketing";
import type { NoticeConfig } from "@/lib/notice";
import type { MailchimpConfig } from "@/lib/mailchimp";
import type { BrevoConfig } from "@/lib/brevo";
import type { KlaviyoConfig } from "@/lib/klaviyo";
import { aboutyouGloballyEnabled } from "@/lib/aboutyou/auth";
import { trendyolGloballyEnabled } from "@/lib/trendyol/auth";

type Integration = {
  name: string;
  logo: string;
  /**
   * Corectie pentru siglele desenate in ALB, pentru fundal inchis: pe cardul
   * deschis ies invizibile. `invert(1)` le face negre. Asa stau Netopia, Oblio
   * si Facturis — ultima e alba 100%, masurat, si cardul ei era gol.
   */
  filter?: string;
  /**
   * Marire peste locasul siglei. Nimeni nu o mai foloseste azi — locasul de
   * 64px face singur treaba pentru care fusese pusa (vezi comentariul lung de
   * la locas, in `CardInCurand`).
   *
   * ⚠ Daca se pune la loc pe ceva: `scale` INMULTESTE latimea locasului, deci
   * aceeasi valoare inseamna altceva dupa fiecare schimbare a acestuia, iar
   * sigla intra peste nume fara sa se planga nimic. Exact asta a patit
   * `Smso.ro`, care avea 1,3 potrivit pe locasul vechi de 40px.
   */
  scale?: number;
  id?: string;
  /**
   * Anuntata, dar nelivrata inca: se vede sigla si numele, cu eticheta
   * „IN CURAND", si cardul nu duce nicaieri.
   *
   * NU e acelasi lucru cu un card fara `id`, desi amandoua ajung tot pe o
   * ramura fara link. Cardul cu LACAT spune „exista, dar nu ai tu acces" — asa
   * arata About You si Trendyol cand steagul lor global e stins. Asta spune
   * „vine". Cine vede lacatul cauta de unde sa-l deschida, cine vede „IN
   * CURAND" asteapta; sunt doua mesaje diferite catre acelasi om.
   *
   * Cand integrarea se livreaza: se scoate `soon`, se pune `id`, id-ul se adauga
   * in lanturile `isUnlocked` / `href` de mai jos — si cardul SE MUTA la locul
   * lui, printre cele livrate. Vezi regula de la `SECTIONS`.
   */
  soon?: true;
};

/**
 * ⚠ IN FIECARE RUBRICA: INTAI CE E LIVRAT, LA URMA CE E „IN CURAND".
 *
 * Lista se randeaza in ordinea scrisa aici, deci ordinea din fisier E ordinea de
 * pe ecran. Un card livrat lasat printre cele „in curand" (unde statea cat timp
 * era doar anuntat) rupe sirul: omul citeste rubrica de sus in jos, se opreste la
 * primul „IN CURAND" si nu mai afla ca sub el mai e ceva ce poate folosi CHIAR
 * ACUM.
 *
 * S-a intamplat la Posta Romana: livrata, dar ramasa intre UPS si Packeta,
 * fiindca acolo statea inainte si acolo i s-a schimbat steagul.
 */
const SECTIONS: { id: string; label: string; integrations: Integration[] }[] = [
  {
    id: "curieri",
    label: "Curieri",
    integrations: [
      { name: "Fan Courier",   logo: "/integrations/fan-courier.svg", id: "fan-courier" },
      { name: "DPD",           logo: "/integrations/dpd.svg", id: "dpd" },
      { name: "Cargus",        logo: "/integrations/cargus.svg", id: "cargus" },
      { name: "Sameday",       logo: "/integrations/sameday.webp", id: "sameday" },
      { name: "Woot",          logo: "/integrations/woot.webp",    id: "woot" },
      { name: "Colete Online", logo: "/integrations/colete-online.svg", id: "colete" },
      { name: "GLS",           logo: "/integrations/gls.svg", id: "gls" },
      { name: "Pall-Ex",       logo: "/integrations/pallex.avif", id: "pallex" },
      { name: "eColet",        logo: "/integrations/ecolet.png", id: "ecolet" },
      { name: "Poșta Română", logo: "/integrations/posta_romana.svg", id: "posta" },
      { name: "Innoship",      logo: "/integrations/innoship.svg", id: "innoship" },
      { name: "Packeta",       logo: "/integrations/packeta.png", id: "packeta" },
      { name: "SmartShip",     logo: "/integrations/smartship.png", id: "smartship" },
      { name: "Shipo.ro",      logo: "/integrations/shipo.ro.svg", id: "shipo" },
      { name: "FedEx",         logo: "/integrations/fedex.svg", id: "fedex" },
      { name: "UPS",           logo: "/integrations/ups.svg", id: "ups" },
      { name: "DHL",           logo: "/integrations/dhl.svg", id: "dhl" },
      /* Intai transportatorii, apoi brokerii — aceeasi ordine ca mai sus, unde
         Fan Courier si DPD stau inaintea lui Woot si eColet.
         ⚠ Rubrica asta nu mai are NICIUN card „IN CURAND": DHL, ultimul anuntat, s-a
         livrat si a urcat aici. Urmatorul curier doar anuntat se pune SUB linia asta,
         nu pe locul unde statea cat era doar o promisiune. */
    ],
  },
  {
    id: "facturare",
    label: "Facturare",
    integrations: [
      { name: "SmartBill", logo: "/integrations/smartbill.webp", id: "smartbill" },
      { name: "Oblio",     logo: "/integrations/oblio.webp",    filter: "invert(1)", id: "oblio" },
      { name: "fGo",       logo: "/integrations/fgo.svg", id: "fgo" },
      { name: "SAGA",          logo: "/integrations/saga.svg", soon: true },
      { name: "Facturis",      logo: "/integrations/facturis.png", filter: "invert(1)", soon: true },
      { name: "EasyBill",      logo: "/integrations/easybill.png", soon: true },
      { name: "Factureaza.ro", logo: "/integrations/factureaza.ro.webp", soon: true },
    ],
  },
  {
    id: "sms",
    label: "SMS",
    integrations: [
      { name: "Notice.ro", logo: "/integrations/notice.ro.png", id: "notice" },
      /* Avea `scale: 1.3`, potrivit pe locasul vechi de 40px. In cel de 64 sigla
         iesea la 4px de nume, iar marirea nici nu mai e necesara: locasul singur
         ii da cu 60% mai mult decat inainte. */
      { name: "Smso.ro", logo: "/integrations/smso.svg", id: "smso" },
    ],
  },
  {
    id: "email-marketing",
    label: "Email marketing",
    integrations: [
      { name: "Mailchimp", logo: "/integrations/mailchimp.svg", id: "mailchimp" },
      { name: "Brevo", logo: "/integrations/brevo.svg", id: "brevo" },
      { name: "Klaviyo", logo: "/integrations/klaviyo.svg", id: "klaviyo" },
      /* TheMarketer e automatizare de marketing (email, SMS, recomandari), deci
         sta langa Klaviyo, nu la „Marketing" — acolo sunt pixeli si feed-uri. */
      { name: "TheMarketer", logo: "/integrations/themarketer.svg", soon: true },
    ],
  },
  {
    id: "plati",
    label: "Procesatori de plati",
    integrations: [
      { name: "Stripe",           logo: "/integrations/stripe.svg", id: "stripe" },
      { name: "Netopia Payments", logo: "/integrations/netopia.svg", filter: "invert(1)", id: "netopia" },
      { name: "BT iPay",          logo: "/integrations/ipay.webp", id: "ipay" },
      { name: "Klarna",           logo: "/integrations/klarna.svg", id: "klarna" },
      { name: "Revolut",          logo: "/integrations/revolut.svg", id: "revolut" },
      { name: "ING WebPay",       logo: "/integrations/ing.webp", soon: true },
      { name: "PayU",             logo: "/integrations/payu.png", soon: true },
      { name: "EuPlatesc",        logo: "/integrations/euplatesc.svg", soon: true },
      { name: "TBI Bank",         logo: "/integrations/tbi.svg", soon: true },
      { name: "UniCredit",        logo: "/integrations/unicredit.png", soon: true },
      { name: "Viva.com",         logo: "/integrations/viva.png", soon: true },
      { name: "Libra Pay",        logo: "/integrations/librapay.png", soon: true },
      { name: "BCR",              logo: "/integrations/bcr.webp", soon: true },
      { name: "Salt Bank",        logo: "/integrations/saltbank.svg", soon: true },
    ],
  },
  {
    id: "marketplace",
    label: "Marketplace",
    integrations: [
      { name: "OLX", logo: "/integrations/olx.svg", id: "olx" },
      { name: "About You", logo: "/integrations/aboutyou.png", id: "aboutyou" },
      { name: "Trendyol", logo: "/integrations/trendyol.svg", id: "trendyol" },
      { name: "eMAG",        logo: "/integrations/emag.webp", soon: true },
      { name: "Altex",       logo: "/integrations/altex.webp", soon: true },
      { name: "Cel.ro",      logo: "/integrations/cel.ro.webp", soon: true },
      { name: "Okazii.ro",   logo: "/integrations/okazii.ro.svg", soon: true },
      { name: "Pepita.com",  logo: "/integrations/pepita.svg", soon: true },
      /* Doua care nu sunt marketplace-uri in sens strict, puse aici fiindca e
         cea mai apropiata rubrica si fiindca acolo le cauta un comerciant:
         Compari.ro e comparator de preturi (trimite trafic in magazinul TAU,
         ca Google Merchant Center), iar BaseLinker e un administrator de
         comenzi peste mai multe canale. Daca se face vreodata o rubrica
         „Canale de vanzare" sau „Comparatoare", acolo se muta amandoua. */
      { name: "Compari.ro",  logo: "/integrations/compari.ro.png", soon: true },
      { name: "BaseLinker",  logo: "/integrations/baselinker.png", soon: true },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    integrations: [
      { name: "Facebook Pixel", logo: "/integrations/facebook-pixel.svg", id: "facebook-pixel" },
      { name: "TikTok Pixel",   logo: "/integrations/tiktok-pixel.svg", id: "tiktok-pixel" },
      { name: "Google Ads",     logo: "/integrations/google-ads.svg", id: "google-ads" },
      { name: "Google Merchant Center", logo: "/integrations/google-merchant-center.svg", id: "google-merchant" },
      { name: "Facebook Catalog", logo: "/integrations/facebook-pixel.svg", id: "facebook-catalog" },
      { name: "OptinMonster",     logo: "/integrations/optinmonster.png", soon: true },
    ],
  },
  {
    id: "statistici",
    label: "Statistici",
    integrations: [
      { name: "Google Analytics", logo: "/integrations/google-analytics.svg", id: "google-analytics" },
    ],
  },
  {
    /* Rubrica noua: nu exista niciuna livrata inca, deci apare intreaga cu
       „IN CURAND". Sunt ferestre de chat si sisteme de tichete, adica altceva
       decat marketingul — acolo vorbesti TU catre client, aici clientul catre
       tine. */
    id: "suport",
    label: "Suport clienti",
    integrations: [
      { name: "Tidio",    logo: "/integrations/tidio.png", soon: true },
      { name: "Intercom", logo: "/integrations/intercom.svg", soon: true },
      { name: "Zendesk",  logo: "/integrations/zendesk.svg", soon: true },
      { name: "Tawk.to",  logo: "/integrations/tawkto.png", soon: true },
    ],
  },
];

export default async function IntegrationsPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings: preloadedSettings } = await getCachedBusinessWithSettings(user.id);

  // Google Merchant is live for everyone (OAuth verification approved 2026-07-21).
  // GOOGLE_MERCHANT_LIVE stays as a kill-switch: flip to false to hide it from
  // non-admins again.
  const supabase = await createClient();
  const { data: profile } = await supabase.from("users_profile").select("role").eq("id", user.id).single();
  const gmcAvailable = GOOGLE_MERCHANT_LIVE || profile?.role === "admin";
  const aboutyouAvailable = aboutyouGloballyEnabled();
  const trendyolAvailable = trendyolGloballyEnabled();
  // Google Analytics is unlocked for everyone: the manual Measurement ID path
  // works without OAuth, so the card no longer waits for verification.

  let smsoActive = false;
  let noticeActive = false;
  let smartbillActive = false;
  let stripeActive = false;
  let netopiaActive = false;
  let ipayActive = false;
  let klarnaActive = false;
  let revolutActive = false;
  let wootActive = false;
  let coleteActive = false;
  let glsActive = false;
  let pallexActive = false;
  let ecoletActive = false;
  let postaActive = false;
  let packetaActive = false;
  let smartshipActive = false;
  let shipoActive = false;
  let fedexActive = false;
  let upsActive = false;
  let dhlActive = false;
  let innoshipActive = false;
  let oblioActive = false;
  let fgoActive = false;
  let cargusActive = false;
  let dpdActive = false;
  let fanCourierActive = false;
  let samedayActive = false;
  let fbActive = false;
  let ttActive = false;
  let googleActive = false;
  let googleMerchantActive = false;
  let googleAnalyticsActive = false;
  let olxActive = false;
  let aboutyouActive = false;
  let trendyolActive = false;
  let mailchimpActive = false;
  let brevoActive = false;
  let klaviyoActive = false;
  if (business) {
    const settings = preloadedSettings;
    smsoActive = (settings?.smso_config as SmsoConfig | null)?.enabled === true;
    noticeActive = (settings?.notice_config as NoticeConfig | null)?.enabled === true;
    smartbillActive = (settings?.smartbill_config as SmartbillConfig | null)?.enabled === true;
    const sc = settings?.stripe_config as StripeConfig | null;
    stripeActive = !!(sc?.enabled && sc?.charges_enabled);
    const nc = settings?.netopia_config as NetopiaConfig | null;
    netopiaActive = !!(nc?.enabled && nc?.pos_signature && nc?.api_key);
    const ic = settings?.ipay_config as IPayConfig | null;
    ipayActive = !!(ic?.enabled && ic?.username && ic?.password);
    const kc = settings?.klarna_config as KlarnaConfig | null;
    klarnaActive = !!(kc?.enabled && kc?.username && kc?.password);
    const rc = settings?.revolut_config as RevolutConfig | null;
    revolutActive = !!(rc?.enabled && rc?.secret_key);
    const wc = settings?.woot_config as WootConfig | null;
    wootActive = !!(wc?.enabled && wc?.public_key && wc?.secret_key);
    const cc = settings?.colete_config as COConfig | null;
    coleteActive = !!(cc?.enabled && cc?.client_id && cc?.client_secret);
    /* Aceeasi regula de „configurat" ca in orders/[orderId]/page.tsx si in
       settings/page.tsx: fara `client_number` MyGLS nu stie pe ce contract emite. */
    const gc = settings?.gls_config as GlsConfig | null;
    glsActive = !!(gc?.enabled && gc?.username && gc?.client_number);
    /* Aceeasi regula de „configurat" ca in orders/[orderId]/page.tsx, in
       settings/page.tsx si in `pallexGata`: ClientPlus se autentifica prin HTTP
       Basic, deci fara utilizator si parola nu se poate crea nicio partida. */
    const pe = settings?.pallex_config as PallExConfig | null;
    pallexActive = !!(pe?.enabled && pe?.username);
    /* Aceeasi regula ca in `ecoletGata` si ca in settings/page.tsx: eColet are o
       singura credentiala, tokenul din panel.ecolet.ro. */
    const ec = settings?.ecolet_config as EcoletConfig | null;
    ecoletActive = !!(ec?.enabled && ec?.api_token);
    /* Aceeasi regula ca in `postaGata` si ca in settings/page.tsx. `cod_trimitere`
       intra in ea desi nu e credentiala: fara el nu pleaca niciun AWB, deci un
       card verde ar minti. */
    const ioc = settings?.innoship_config as InnoshipConfig | null;
    /* Aceeasi regula ca in `innoshipGata`: cheia si id-ul depozitului. */
    innoshipActive = !!(ioc?.enabled && ioc?.api_key && ioc?.external_client_location);
    const poc = settings?.posta_config as PostaConfig | null;
    postaActive = !!(poc?.enabled && poc?.username && poc?.cod_trimitere);
    /* Aceeasi regula ca in `packetaGata`: parola API si eticheta de expeditor.
       `eshop` intra in ea desi nu e credentiala — fara el nu pleaca niciun colet,
       iar un nume gresit CREEAZA tacut un expeditor nou la ei. */
    const pkc = settings?.packeta_config as { enabled?: boolean; api_password?: string; eshop?: string } | null;
    packetaActive = !!(pkc?.enabled && pkc?.api_password && pkc?.eshop);

    /* ⚠ Aceeasi regula ca in `smartshipGata`, in pagina comenzii si in checkout:
       cheia de API SI adresa de ridicare cu id-ul ei NUMERIC de localitate. Fara
       `city`, fiecare cerere cade pe validare, deci cardul ar arata „conectat"
       pentru o integrare care nu poate emite nimic. */
    const ssc = settings?.smartship_config as { enabled?: boolean; api_key?: string; expeditor?: { name?: string; address?: string; phone?: string; city?: number } } | null;
    smartshipActive = !!(
      ssc?.enabled && ssc?.api_key && ssc?.expeditor?.name && ssc?.expeditor?.address
      && ssc?.expeditor?.phone && Number(ssc?.expeditor?.city) > 0
    );
    /* ⚠ Aceeasi regula ca in `shipoGata`, in Setari → Livrare si in checkout:
       cheia de API SI adresa de ridicare. Fara `sender_address_id`, `POST /rates`
       nici nu se poate forma, deci cardul ar arata „conectat" pentru o integrare
       care nu poate produce niciun pret. */
    const shc = settings?.shipo_config as { enabled?: boolean; api_key?: string; sender_address_id?: number } | null;
    shipoActive = !!(shc?.enabled && shc?.api_key && Number(shc?.sender_address_id) > 0);

    /* ⚠ Aceeasi regula ca in `fedexGata`, in Setari → Livrare, in pagina comenzii
       si in checkout: amandoua credentialele, numarul de cont SI adresa de
       expeditie cu cod postal. Romania e tara „postal-aware" la FedEx — fara codul
       postal cotarea raspunde `POSTALCODE.ZIPCODE.REQUIRED`, deci cardul ar arata
       „conectat" pentru o integrare care nu poate produce niciun pret. */
    const fxc = settings?.fedex_config as {
      enabled?: boolean; client_id?: string; client_secret?: string; account_number?: string;
      expeditor?: { oras?: string; cod_postal?: string };
    } | null;
    fedexActive = !!(
      fxc?.enabled && fxc?.client_id && fxc?.client_secret && fxc?.account_number
      && fxc?.expeditor?.oras && fxc?.expeditor?.cod_postal
    );

    /* ⚠ Aceeasi regula ca in `upsGata`, in Setari → Livrare, in pagina comenzii si in
       checkout: amandoua credentialele, numarul de cont SI adresa de expeditie cu cod
       postal. UPS nu are nomenclator de judete romanesti, iar cotarea lor cere un cod de
       judet de exact doua caractere — deci codul postal ramane singurul semnal dupa care
       pot zona ruta, iar fara el cardul ar arata „conectat" pentru o integrare care nu
       poate produce niciun pret. */
    const upc = settings?.ups_config as {
      enabled?: boolean; client_id?: string; client_secret?: string; account_number?: string;
      expeditor?: { oras?: string; cod_postal?: string };
    } | null;
    upsActive = !!(
      upc?.enabled && upc?.client_id && upc?.client_secret && upc?.account_number
      && upc?.expeditor?.oras && upc?.expeditor?.cod_postal
    );

    /* ⚠ Aceeasi regula ca in `dhlGata`, in Setari → Livrare, in pagina comenzii si in
       checkout: utilizatorul, parola, numarul de cont SI adresa de expeditie cu cod
       postal. Codul postal e in ea fiindca `postalCode` e cheie obligatorie in
       `shipperDetails` la cotare — fara el DHL nu intoarce niciun tarif, deci cardul ar
       arata „conectat" pentru o integrare care nu poate produce niciun pret.
       ⚠ Campurile se numesc `username` / `password`, NU `client_id` / `client_secret` ca
       la FedEx si UPS de deasupra. Copiat de acolo fara redenumire, blocul ar citi
       campuri inexistente si cardul ar ramane vesnic „Configureaza", oricat de bine ar fi
       configurat DHL-ul — fara nicio eroare, fiindca `settings` e citit ca `unknown`. */
    const dhc = settings?.dhl_config as {
      enabled?: boolean; username?: string; password?: string; account_number?: string;
      expeditor?: { oras?: string; cod_postal?: string };
    } | null;
    dhlActive = !!(
      dhc?.enabled && dhc?.username && dhc?.password && dhc?.account_number
      && dhc?.expeditor?.oras && dhc?.expeditor?.cod_postal
    );

    const oc = settings?.oblio_config as OblioConfig | null;
    oblioActive = !!(oc?.enabled && oc?.client_id && oc?.cif && oc?.series_invoice);
    const fc = settings?.fgo_config as FgoConfig | null;
    fgoActive = !!(fc?.enabled && fc?.cod_unic && fc?.private_key && fc?.serie);
    const cg = settings?.cargus_config as CargusConfig | null;
    cargusActive = !!(cg?.enabled && cg?.username && cg?.subscription_key && cg?.location_id);
    const dg = settings?.dpd_config as DpdConfig | null;
    dpdActive = !!(dg?.enabled && dg?.username && dg?.client_id);
    const fg = settings?.fan_courier_config as FanCourierConfig | null;
    fanCourierActive = !!(fg?.enabled && fg?.username && fg?.client_id);
    const sg = settings?.sameday_config as SamedayConfig | null;
    samedayActive = !!(sg?.enabled && sg?.username && sg?.pickup_point_id);
    const mg = settings?.marketing_config as MarketingConfig | null;
    fbActive = !!mg?.facebook_pixel_id?.trim();
    ttActive = !!mg?.tiktok_pixel_id?.trim();
    googleActive = !!mg?.google_tag_id?.trim();
    const gmc = settings?.google_merchant_config as { connected?: boolean } | null;
    googleMerchantActive = !!gmc?.connected;
    const ga = settings?.google_analytics_config as { connected?: boolean } | null;
    googleAnalyticsActive = !!ga?.connected;
    const olx = settings?.olx_config as { connected?: boolean } | null;
    olxActive = !!olx?.connected;
    const ay = settings?.aboutyou_config as { connected?: boolean } | null;
    aboutyouActive = !!ay?.connected;
    const ty = settings?.trendyol_config as { connected?: boolean } | null;
    trendyolActive = !!ty?.connected;
    const mch = settings?.mailchimp_config as MailchimpConfig | null;
    mailchimpActive = !!(mch?.enabled && mch?.audience_id);
    const bv = settings?.brevo_config as BrevoConfig | null;
    brevoActive = !!(bv?.enabled && bv?.list_id);
    const kv = settings?.klaviyo_config as KlaviyoConfig | null;
    klaviyoActive = !!(kv?.enabled && kv?.list_id);
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground mb-1">Integrari</h1>
        <p className="text-sm text-muted-foreground">
          Conecteaza-ti magazinul cu servicii externe pentru a automatiza livrarea, facturarea, platile si marketingul.
        </p>
      </div>

      <div className="space-y-8">
        {SECTIONS.map((section) => (
          <div key={section.id}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                {section.label}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {section.integrations.map((integration) => {
                /* Decis INAINTE de lanturile de mai jos. Fara `id` ar cadea
                   oricum pe ramura fara link, dar ar iesi cu LACAT — vezi
                   comentariul de la `soon` in tipul `Integration`: lacatul si
                   „IN CURAND" spun doua lucruri diferite. */
                if (integration.soon) {
                  return <CardInCurand key={integration.name} integration={integration} />;
                }

                const isUnlocked = integration.id === "notice" || integration.id === "smso" || integration.id === "smartbill" || integration.id === "stripe" || integration.id === "netopia" || integration.id === "ipay" || integration.id === "klarna" || integration.id === "revolut" || integration.id === "woot" || integration.id === "colete" || integration.id === "gls" || integration.id === "pallex" || integration.id === "ecolet" || integration.id === "posta" || integration.id === "innoship" || integration.id === "packeta" || integration.id === "smartship" || integration.id === "shipo" || integration.id === "fedex" || integration.id === "ups" || integration.id === "dhl" || integration.id === "oblio" || integration.id === "fgo" || integration.id === "cargus" || integration.id === "dpd" || integration.id === "fan-courier" || integration.id === "sameday" || integration.id === "facebook-pixel" || integration.id === "tiktok-pixel" || integration.id === "google-ads" || integration.id === "facebook-catalog" || integration.id === "mailchimp" || integration.id === "brevo" || integration.id === "klaviyo" || (integration.id === "google-merchant" && gmcAvailable) || integration.id === "google-analytics" || integration.id === "olx" || (integration.id === "aboutyou" && aboutyouAvailable) || (integration.id === "trendyol" && trendyolAvailable);
                const isActive = integration.id === "notice" ? noticeActive : integration.id === "smso" ? smsoActive : integration.id === "smartbill" ? smartbillActive : integration.id === "stripe" ? stripeActive : integration.id === "netopia" ? netopiaActive : integration.id === "ipay" ? ipayActive : integration.id === "klarna" ? klarnaActive : integration.id === "revolut" ? revolutActive : integration.id === "woot" ? wootActive : integration.id === "colete" ? coleteActive : integration.id === "gls" ? glsActive : integration.id === "pallex" ? pallexActive : integration.id === "ecolet" ? ecoletActive : integration.id === "posta" ? postaActive : integration.id === "innoship" ? innoshipActive : integration.id === "packeta" ? packetaActive : integration.id === "smartship" ? smartshipActive : integration.id === "shipo" ? shipoActive : integration.id === "fedex" ? fedexActive : integration.id === "ups" ? upsActive : integration.id === "dhl" ? dhlActive : integration.id === "oblio" ? oblioActive : integration.id === "fgo" ? fgoActive : integration.id === "cargus" ? cargusActive : integration.id === "dpd" ? dpdActive : integration.id === "fan-courier" ? fanCourierActive : integration.id === "sameday" ? samedayActive : integration.id === "facebook-pixel" ? fbActive : integration.id === "tiktok-pixel" ? ttActive : integration.id === "google-ads" ? googleActive : integration.id === "google-merchant" ? googleMerchantActive : integration.id === "mailchimp" ? mailchimpActive : integration.id === "brevo" ? brevoActive : integration.id === "klaviyo" ? klaviyoActive : integration.id === "google-analytics" ? googleAnalyticsActive : integration.id === "olx" ? olxActive : integration.id === "aboutyou" ? aboutyouActive : integration.id === "trendyol" ? trendyolActive : false;
                const href = integration.id === "notice" ? "/dashboard/features/notice" : integration.id === "smso" ? "/dashboard/features/smso" : integration.id === "smartbill" ? "/dashboard/features/smartbill" : integration.id === "stripe" ? "/dashboard/features/stripe" : integration.id === "netopia" ? "/dashboard/features/netopia" : integration.id === "ipay" ? "/dashboard/features/ipay" : integration.id === "klarna" ? "/dashboard/features/klarna" : integration.id === "revolut" ? "/dashboard/features/revolut" : integration.id === "woot" ? "/dashboard/features/woot" : integration.id === "colete" ? "/dashboard/features/colete" : integration.id === "gls" ? "/dashboard/features/gls" : integration.id === "pallex" ? "/dashboard/features/pallex" : integration.id === "ecolet" ? "/dashboard/features/ecolet" : integration.id === "posta" ? "/dashboard/features/posta" : integration.id === "innoship" ? "/dashboard/features/innoship" : integration.id === "packeta" ? "/dashboard/features/packeta" : integration.id === "smartship" ? "/dashboard/features/smartship" : integration.id === "shipo" ? "/dashboard/features/shipo" : integration.id === "fedex" ? "/dashboard/features/fedex" : integration.id === "ups" ? "/dashboard/features/ups" : integration.id === "dhl" ? "/dashboard/features/dhl" : integration.id === "oblio" ? "/dashboard/features/oblio" : integration.id === "fgo" ? "/dashboard/features/fgo" : integration.id === "cargus" ? "/dashboard/features/cargus" : integration.id === "dpd" ? "/dashboard/features/dpd" : integration.id === "fan-courier" ? "/dashboard/features/fan-courier" : integration.id === "sameday" ? "/dashboard/features/sameday" : integration.id === "facebook-pixel" ? "/dashboard/features/facebook-pixel" : integration.id === "tiktok-pixel" ? "/dashboard/features/tiktok-pixel" : integration.id === "google-ads" ? "/dashboard/features/google-ads" : integration.id === "facebook-catalog" ? "/dashboard/features/facebook-catalog" : integration.id === "google-merchant" ? "/dashboard/features/google-merchant" : integration.id === "mailchimp" ? "/dashboard/features/mailchimp" : integration.id === "brevo" ? "/dashboard/features/brevo" : integration.id === "klaviyo" ? "/dashboard/features/klaviyo" : integration.id === "google-analytics" ? "/dashboard/features/google-analytics" : integration.id === "olx" ? "/dashboard/features/olx" : integration.id === "aboutyou" ? "/dashboard/features/aboutyou" : integration.id === "trendyol" ? "/dashboard/features/trendyol" : "#";

                if (isUnlocked) {
                  return (
                    <Link
                      key={integration.name}
                      href={href}
                      className="relative flex items-center gap-3.5 p-4 rounded-xl border border-primary/30 bg-surface hover:border-primary hover:shadow-sm transition-all group"
                    >
                      <div className="w-16 h-10 flex-shrink-0 flex items-center justify-center">
                        <img
                          src={integration.logo}
                          alt={integration.name}
                          className="w-full h-full object-contain"
                          style={{
                            filter: integration.filter ?? undefined,
                            transform: integration.scale ? `scale(${integration.scale})` : undefined,
                            transformOrigin: "center",
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-foreground">{integration.name}</p>
                          {/*
                            ⚠ ETICHETA „NOU" COSTA 36px DIN NUME, si aia sunt masurati.
                            Numele are 125px pe cardul real (275px la trei coloane) — de
                            acolo si locasul de sigla de 64px, ales tot pe masuratoare.
                            Eticheta ia 30px plus 6px de spatiu, deci orice nume peste
                            ~89px se rupe pe doua randuri cand o poarta.
                            „Poșta Română" cere ~92px: incape lat, dar nu si cu eticheta.
                            De aia nu e in lista. Inainte de a adauga un id nou aici,
                            uita-te cat de lung e numele.
                          */}
                          {["dhl", "ups", "fedex", "shipo", "smartship", "innoship", "ecolet", "pallex", "klarna", "mailchimp", "brevo", "klaviyo", "revolut", "olx", "aboutyou", "trendyol", "facebook-catalog"].includes(integration.id ?? "") && (
                            <span className="text-[9px] font-bold uppercase tracking-wide bg-primary text-white px-1.5 py-0.5 rounded-full leading-none">Nou</span>
                          )}
                        </div>
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded mt-0.5">
                            <CheckCircle className="h-2.5 w-2.5" />Activ
                          </span>
                        ) : (
                          <span className="inline-block text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded mt-0.5">
                            Configureaza
                          </span>
                        )}
                      </div>
                      <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <ArrowRight className="h-3.5 w-3.5 text-primary" />
                      </div>
                    </Link>
                  );
                }

                return (
                  <div
                    key={integration.name}
                    className="relative flex items-center gap-3.5 p-4 rounded-xl border border-border bg-surface opacity-60 cursor-not-allowed select-none"
                  >
                    <div className="w-16 h-10 flex-shrink-0 flex items-center justify-center">
                      <img
                        src={integration.logo}
                        alt={integration.name}
                        className="w-full h-full object-contain"
                        style={{
                          filter: integration.filter ?? undefined,
                          transform: integration.scale ? `scale(${integration.scale})` : undefined,
                          transformOrigin: "center",
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{integration.name}</p>
                    </div>
                    <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 p-4 rounded-xl bg-primary/5 border border-primary/15">
        <p className="text-sm font-medium text-foreground mb-1">Vrei o integrare specifica mai repede?</p>
        <p className="text-xs text-muted-foreground">
          Contacteaza-ne si o vom prioritiza in roadmap-ul nostru.
        </p>
      </div>
    </div>
  );
}

/**
 * Cardul unei integrari anuntate, dar nelivrate inca.
 *
 * Trei lucruri sunt dinadins asa:
 *
 * 1. **Chenar intrerupt, nu lacat.** Lacatul e semnul pentru „exista, dar nu ai
 *    tu acces". Aici nu exista inca, deci n-are ce debloca nimeni.
 * 2. **Sigla la culoarea ei, nestinsa.** Rostul randului asta e sa se vada ce
 *    marci vin; o sigla pala nu se recunoaste, si atunci cardul nu mai spune
 *    nimic. Ce recede e cardul (fundal, chenar), nu sigla.
 * 3. **`alt=""`.** Numele e chiar langa, ca text. Cu `alt={name}` cititoarele
 *    de ecran il spun de doua ori la rand. Cardurile de mai sus inca fac asta;
 *    daca se umbla la ele, e de reparat si acolo.
 */
function CardInCurand({ integration }: { integration: Integration }) {
  return (
    <div className="relative flex items-center gap-3.5 p-4 rounded-xl border border-dashed border-border bg-muted/20 select-none">
      {/*
        ═══ LOCASUL SIGLEI: 64 lat, 40 inalt. Aceleasi numere in toate cele trei
        feluri de card, si asta e obligatoriu. ═══

        Latimea e FIXA dinadins. Daca fiecare sigla si-ar lua latimea ei, numele
        de alaturi ar incepe fiecare in alt loc si marginea din stanga a coloanei
        ar iesi zimtata.

        De ce 64 si nu 40, cat era: locasul patrat plus `object-contain` potriveste
        latura MARE, deci un wordmark cu raportul 6 iesea de 40 lat si 6,7 inalt —
        o mazgalitura. Zece sigle erau sub 10px. La 64 aceleasi ajung la 10-17px.

        De ce nu si mai lat: 64 e ultima treapta care nu costa nimic. Masurat pe
        cardul real (275px la trei coloane), singurul nume care se taie la 64 e
        „Google Merchant Center", care se taia si la 40; urmatorul cel mai lung,
        „Netopia Payments", cere 123px si are 125. La 72 ar incepe sa se taie si
        el.

        ⚠ Ce NU rezolva latimea: peste raportul ~6 tot iese mic (OptinMonster
        9,6px, si About You, care are raportul 9,13, ajunge la 6,5). Acolo e
        nevoie de alt FISIER — semnul patrat al marcii in loc de wordmark.
      */}
      <div className="w-16 h-10 flex-shrink-0 flex items-center justify-center">
        <img
          src={integration.logo}
          alt=""
          className="w-full h-full object-contain"
          style={{
            filter: integration.filter ?? undefined,
            transform: integration.scale ? `scale(${integration.scale})` : undefined,
            transformOrigin: "center",
          }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{integration.name}</p>
        <span className="inline-block text-[10px] font-bold uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded mt-0.5">
          In curand
        </span>
      </div>
    </div>
  );
}
