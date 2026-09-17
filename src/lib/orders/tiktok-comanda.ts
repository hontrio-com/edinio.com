import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeBaseUrl } from "@/lib/seo";
import { parseCookieBannerConfig } from "@/lib/cookie-consent";
import { parseTikTokPixelId } from "@/lib/marketing-config";
import { logError } from "@/lib/error-logger";
import { trimiteLaTikTok, ttclidValid, ttpValid, type EvenimentTikTok } from "@/lib/tiktok/capi";
import { utilizatorulPentruTikTok, dateDinAdresaTikTok } from "@/lib/tiktok/date-client";
import { continutTikTokComanda } from "@/lib/tiktok/continut";
import { clientDeMarketplace } from "./client-de-marketplace";
import { vanzareaEConfirmata, asteaptaIncasareOnline } from "./vanzare-confirmata";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ACHIZITIA UNEI COMENZI, TRIMISA DE PE SERVER IN PIXELUL TIKTOK AL COMERCIANTULUI
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ ACELEASI TREI MOMENTE CA LA GA4 SI META: ramburs la creare, plata online la confirmarea incasarii sau
  cand comerciantul bifeaza „platit”.

  ⚠ `Purchase`, NU `PlaceAnOrder` + `CompletePayment`. Lista lor de azi („Supported Pixel events”, 18
  evenimente web) n-are niciunul din cele doua nume vechi: plata incheiata e `Purchase` (`SHOPPING`).

  ⚠ `event_id` = id-ul comenzii, acelasi pe care il trimite pixelul din pagina de confirmare. TikTok
  deduplica pe `event_source_id` + `event` + `event_id`.

  ⚠ `tiktok_comenzi_raportate` o opreste sa plece a doua oara.
*/

type Admin = SupabaseClient;

export type RezultatTikTokComanda =
  | "fara-comanda" | "de-marketplace" | "neincasata" | "fara-configurare" | "fara-acord"
  | "deja-raportata" | "trimisa" | "respinsa" | "eroare";

const COLOANE_COMANDA =
  "id, business_id, total, items, customer_name, customer_email, customer_phone, shipping_address, order_source, payment_method, payment_status";

type Comanda = {
  id: string; business_id: string; total: number | null; items: unknown;
  customer_name: string | null; customer_email: string | null; customer_phone: string | null;
  shipping_address: unknown; order_source: Record<string, unknown> | null;
  payment_method: string | null; payment_status: string | null;
};

type LinieComanda = { product_id?: string; name?: string | null; variant_title?: string | null; price?: number; quantity?: number };

export interface ConfigCapiTikTok {
  access_token?: string;
  /** Pixelul pentru care a fost pus tokenul. Alt Pixel ID salvat in panou cere o verificare noua. */
  pixel_id?: string;
  ultima_trimitere_la?: string;
  ultima_eroare?: string;
  ultima_eroare_la?: string;
}

/**
 * Hotararea de acord, pura.
 *
 * ⚠ Semnul ca pixelul TikTok chiar a rulat e `ttp` (cookie-ul lui) sau `ttclid`. Fara banner se trimite
 * oricum, fiindca pixelul se incarca oricum.
 */
export function acordPentruTikTok(sursa: Record<string, unknown> | null | undefined, bannerPornit: boolean): boolean {
  if (!bannerPornit) return true;
  if (sursa?.consimtamant_citit === "da") return sursa.consimtamant_marketing === "da";
  return !!ttpValid(sursa?.ttp) || !!ttclidValid(sursa?.ttclid);
}

/** Evenimentul `Purchase`, construit din comanda. Pur: se probeaza fara retea si fara baza. */
export function evenimentCumparareTikTok(
  comanda: Comanda,
  paginiSectiuni: ReadonlyMap<string, unknown>,
  adresaMagazin: string,
  acum: number = Date.now(),
): EvenimentTikTok {
  const sursa = comanda.order_source ?? {};
  const linii = (Array.isArray(comanda.items) ? comanda.items : []) as LinieComanda[];
  const continut = continutTikTokComanda(linii, paginiSectiuni);

  const user: Record<string, unknown> = {
    ...utilizatorulPentruTikTok({
      email: comanda.customer_email,
      telefon: comanda.customer_phone,
      nume: comanda.customer_name,
      ...dateDinAdresaTikTok(comanda.shipping_address),
    }),
  };
  const ip = typeof sursa.client_ip === "string" ? sursa.client_ip : undefined;
  if (ip) user.ip = ip;
  if (typeof sursa.user_agent === "string") user.user_agent = sursa.user_agent;
  const ttclid = ttclidValid(sursa.ttclid);
  if (ttclid) user.ttclid = ttclid;
  const ttp = ttpValid(sursa.ttp);
  if (ttp) user.ttp = ttp;

  const properties: Record<string, unknown> = {
    currency: "RON",
    value: Math.round((Number(comanda.total) || 0) * 100) / 100,
    order_id: comanda.id,
    num_items: linii.reduce((s, l) => s + (Number(l.quantity) || 1), 0),
  };
  if (continut.content_ids.length) {
    properties.content_ids = continut.content_ids;
    properties.contents = continut.contents;
    if (continut.content_type) properties.content_type = continut.content_type;
  }

  return {
    event: "Purchase",
    event_time: Math.floor(acum / 1000),
    event_id: comanda.id,
    user,
    /* ⚠ `page.url` e OBLIGATORIU la evenimentele web. */
    page: { url: `${adresaMagazin}/confirm` },
    properties,
  };
}

/** Starea ultimei trimiteri, pentru panou. Tokenul se pastreaza: configurarea se citeste si se scrie intreaga. */
async function scrieStarea(admin: Admin, businessId: string, petic: Partial<ConfigCapiTikTok>) {
  const { data } = await admin.from("store_settings").select("tiktok_capi_config").eq("business_id", businessId).maybeSingle();
  const cfg = ((data as { tiktok_capi_config?: ConfigCapiTikTok | null } | null)?.tiktok_capi_config ?? null);
  if (!cfg?.access_token) return;
  /* ⚠ O reusita dupa alta reusita recenta nu rescrie configurarea (si tokenul) la fiecare comanda. */
  if (petic.ultima_trimitere_la && !cfg.ultima_eroare && cfg.ultima_trimitere_la
    && Date.parse(petic.ultima_trimitere_la) - Date.parse(cfg.ultima_trimitere_la) < 3_600_000) return;
  await admin.from("store_settings")
    .update({ tiktok_capi_config: { ...cfg, ...petic } as never })
    .eq("business_id", businessId);
}

/** Trimite ACHIZITIA unei comenzi prin Events API, daca are voie. NU arunca; se cheama prin `dupaRaspuns`. */
export async function raporteazaCumparareaTikTok(orderId: string, admin: Admin = createAdminClient()): Promise<RezultatTikTokComanda> {
  try {
    const { data } = await admin.from("orders").select(COLOANE_COMANDA).eq("id", orderId).maybeSingle();
    const comanda = data as Comanda | null;
    if (!comanda) return "fara-comanda";
    if (clientDeMarketplace(comanda.order_source)) return "de-marketplace";
    if (!vanzareaEConfirmata(comanda.payment_method, comanda.payment_status)) return "neincasata";

    const [{ data: rand }, { data: biz }] = await Promise.all([
      admin.from("store_settings")
        .select("marketing_config, tiktok_capi_config, cookie_banner_config")
        .eq("business_id", comanda.business_id)
        .maybeSingle(),
      admin.from("businesses").select("slug, custom_domain").eq("id", comanda.business_id).maybeSingle(),
    ]);
    const r = rand as {
      marketing_config?: { tiktok_pixel_id?: string; tiktok_capi_activ?: boolean } | null;
      tiktok_capi_config?: ConfigCapiTikTok | null;
      cookie_banner_config?: unknown;
    } | null;
    const pixelId = parseTikTokPixelId(r?.marketing_config?.tiktok_pixel_id);
    const token = r?.tiktok_capi_config?.access_token?.trim();
    const magazin = biz as { slug: string; custom_domain: string | null } | null;
    if (!pixelId || !token || !magazin || r?.marketing_config?.tiktok_capi_activ !== true) return "fara-configurare";

    if (!acordPentruTikTok(comanda.order_source, parseCookieBannerConfig(r?.cookie_banner_config).enabled)) return "fara-acord";

    const { data: deja } = await admin.from("tiktok_comenzi_raportate").select("order_id").eq("order_id", orderId).maybeSingle();
    if (deja) return "deja-raportata";

    const ids = [...new Set(((Array.isArray(comanda.items) ? comanda.items : []) as LinieComanda[]).map((l) => l.product_id).filter((x): x is string => !!x))];
    const paginiSectiuni = new Map<string, unknown>();
    if (ids.length) {
      const { data: produse } = await admin.from("products").select("id, page_sections").in("id", ids);
      for (const p of (produse ?? []) as { id: string; page_sections: unknown }[]) paginiSectiuni.set(p.id, p.page_sections);
    }

    const eveniment = evenimentCumparareTikTok(comanda, paginiSectiuni, storeBaseUrl(magazin));
    const rezultat = await trimiteLaTikTok({ pixelId, token }, [eveniment]);
    const acum = new Date().toISOString();
    if (!rezultat.ok) {
      await scrieStarea(admin, comanda.business_id, { ultima_eroare: rezultat.mesaj.slice(0, 300), ultima_eroare_la: acum });
      await logError({
        action: "tiktok.capi.cumparare", severity: "warning", businessId: comanda.business_id,
        message: `TikTok a refuzat achizitia: ${rezultat.mesaj}`, details: { orderId, cod: rezultat.cod, trecator: rezultat.trecator },
      });
      return "respinsa";
    }
    await admin.from("tiktok_comenzi_raportate").upsert(
      { order_id: comanda.id, business_id: comanda.business_id, trimisa_la: acum } as never,
      { onConflict: "order_id" },
    );
    await scrieStarea(admin, comanda.business_id, { ultima_trimitere_la: acum, ultima_eroare: undefined, ultima_eroare_la: undefined });
    return "trimisa";
  } catch {
    return "eroare";
  }
}

/** Achizitia unei comenzi ONLINE, dupa confirmarea incasarii. La ramburs nu face nimic: a plecat la creare. */
export async function raporteazaCumparareaTikTokDupaIncasare(orderId: string, admin: Admin = createAdminClient()): Promise<RezultatTikTokComanda> {
  const { data } = await admin.from("orders").select("payment_method").eq("id", orderId).maybeSingle();
  if (!asteaptaIncasareOnline((data as { payment_method: string | null } | null)?.payment_method)) return "neincasata";
  return raporteazaCumparareaTikTok(orderId, admin);
}
