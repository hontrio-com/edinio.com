import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkoutPaymentMethods, processorReadiness, type PaymentMethodType } from "@/lib/payment-methods";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CE INTEGRARI ARE MAGAZINUL, PENTRU BLOCURILE PAGINILOR           (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el: blocuri care apar dupa integrarile active (Brevo, Mailchimp...).
  Trei, fiindca doar la trei integrarea chiar schimba ce vede cumparatorul:
   - Newsletter: Mailchimp, Brevo, Klaviyo (abonarea ajunge la cele conectate);
   - Metode de plata: procesatorii GATA de incasat, plus rambursul;
   - Curierii: cei porniti la livrare (ce vede cumparatorul la comanda).

  ⚠ La newsletter se cer numai caile JSON (`enabled`, lista, sursele), nu
  cheile. Procesatorii de plata au nevoie de configuratia lor intreaga, ca sa
  treaca prin ACEEASI regula ca finalizarea comenzii (`processorReadiness` +
  `checkoutPaymentMethods`), exact cum face `getPublicStoreConfig`; din ea
  pleaca spre pagina numai tipul si eticheta. Un bloc care arata Klarna cand
  checkout-ul nu-l ofera ar promite o plata care nu exista.
*/

export interface MetodaAfisata {
  cheie: string;
  nume: string;
  logo: string | null;
  /** Sigla e doar un semn (fara nume), deci numele se scrie alaturi. */
  arataNumele?: boolean;
  /** Sigla e alba (facuta pentru fundal inchis): pe fundal deschis se inegreste. */
  alba?: boolean;
}

export interface IntegrariPagini {
  newsletter: { mailchimp: boolean; brevo: boolean; klaviyo: boolean };
  plati: MetodaAfisata[];
  curieri: MetodaAfisata[];
}

const LOGO_PLATA: Partial<Record<PaymentMethodType, string>> = {
  netopia: "/integrations/netopia.svg",
  stripe: "/integrations/stripe.svg",
  ipay: "/integrations/ipay.webp",
  klarna: "/integrations/klarna.svg",
  revolut: "/integrations/revolut.svg",
};

/** Curierii propriu-zisi (nu agregatorii), cu sigla lor si cheia din `shipping_zones`. */
const CURIERI: MetodaAfisata[] = [
  { cheie: "sameday", nume: "Sameday", logo: "/integrations/sameday.webp", arataNumele: true },
  { cheie: "fan-courier", nume: "FAN Courier", logo: "/integrations/fan-courier.svg", arataNumele: true },
  { cheie: "dpd", nume: "DPD", logo: "/integrations/dpd.svg" },
  { cheie: "cargus", nume: "Cargus", logo: "/integrations/cargus.svg" },
  { cheie: "gls", nume: "GLS", logo: "/integrations/gls.svg" },
  { cheie: "posta", nume: "Poșta Română", logo: "/integrations/posta_romana.svg" },
  { cheie: "packeta", nume: "Packeta", logo: "/integrations/packeta.png" },
  { cheie: "dhl", nume: "DHL", logo: "/integrations/dhl.svg" },
  { cheie: "ups", nume: "UPS", logo: "/integrations/ups.svg" },
  { cheie: "fedex", nume: "FedEx", logo: "/integrations/fedex.svg" },
  { cheie: "pallex", nume: "Pall-Ex", logo: "/integrations/pallex.avif" },
  { cheie: "own", nume: "Livrare proprie", logo: null },
  { cheie: "pickup", nume: "Ridicare personală", logo: null },
];

export async function integrariPentruPagini(businessId: string): Promise<IntegrariPagini> {
  const { data } = await createAdminClient()
    .from("store_settings")
    .select([
      "payment_methods", "shipping_zones",
      "stripe_config", "netopia_config", "ipay_config", "klarna_config", "revolut_config",
      "mc_on:mailchimp_config->enabled", "mc_lista:mailchimp_config->audience_id", "mc_surse:mailchimp_config->sources",
      "bv_on:brevo_config->enabled", "bv_lista:brevo_config->list_id", "bv_surse:brevo_config->sources",
      "kv_on:klaviyo_config->enabled", "kv_lista:klaviyo_config->list_id", "kv_surse:klaviyo_config->sources",
    ].join(", "))
    .eq("business_id", businessId)
    .maybeSingle();

  const r = (data ?? {}) as Record<string, unknown>;
  const formulareOk = (surse: unknown) => (surse as { forms?: boolean } | null)?.forms !== false;

  const plati = checkoutPaymentMethods(r.payment_methods, processorReadiness(r)).map((m) => ({
    cheie: m.type, nume: m.label, logo: LOGO_PLATA[m.type] ?? null, alba: m.type === "netopia",
  }));

  const zone = (r.shipping_zones ?? {}) as Record<string, { enabled?: boolean } | undefined>;
  const curieri = CURIERI.filter((c) => zone[c.cheie]?.enabled === true);

  return {
    newsletter: {
      mailchimp: r.mc_on === true && !!r.mc_lista && formulareOk(r.mc_surse),
      brevo: r.bv_on === true && !!r.bv_lista && formulareOk(r.bv_surse),
      klaviyo: r.kv_on === true && !!r.kv_lista && formulareOk(r.kv_surse),
    },
    plati,
    curieri,
  };
}

/** Macar un furnizor de newsletter conectat: altfel blocul n-are unde trimite adresa. */
export const areNewsletter = (i: IntegrariPagini) => i.newsletter.mailchimp || i.newsletter.brevo || i.newsletter.klaviyo;
