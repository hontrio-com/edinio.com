import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeBaseUrl } from "@/lib/seo";
import { parseCookieBannerConfig } from "@/lib/cookie-consent";
import { parseMetaPixelId } from "@/lib/marketing-config";
import { logError } from "@/lib/error-logger";
import { trimiteLaMeta, cookieMetaValid, fbcDinFbclid, type EvenimentCapi } from "@/lib/facebook/capi";
import { normalizeazaPentruMeta, hashuieste, dateDinAdresa } from "@/lib/facebook/date-client";
import { continutComanda } from "@/lib/facebook/pixel-continut";
import { clientDeMarketplace } from "./client-de-marketplace";
import { vanzareaEConfirmata, asteaptaIncasareOnline } from "./vanzare-confirmata";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ACHIZITIA UNEI COMENZI, TRIMISA DE PE SERVER IN PIXELUL META AL COMERCIANTULUI
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ ACELEASI TREI MOMENTE CA GA4 (vezi `ga4-comanda.ts`), si din acelasi motiv:
    - ramburs: la creare, fiindca acolo comanda ESTE vanzarea;
    - plata online: la confirmarea incasarii (`finalizeazaPlataComenzii`) sau cand comerciantul bifeaza
      „platit” de mana.

  ⚠ `event_id` = id-ul comenzii, acelasi pe care il trimite pixelul pe pagina de confirmare
  (`FbPurchaseEvent`). Documentatia: „An order number or transaction ID are two potential identifiers
  that can be used for `event_id`.” Meta pastreaza o singura achizitie.

  ⚠ `meta_comenzi_raportate` o opreste sa plece a doua oara (Meta deduplica doar 48 de ore). Randul se
  scrie abia dupa `events_received`.

  ⚠ NUMAI CU SEMNALUL `facebook_capi_activ`, ca si capatul evenimentelor din browser. Il aprinde salvarea
  tokenului (verificat pe pixel) si il stinge schimbarea Pixel ID-ului: un token verificat pe pixelul vechi nu
  trimite achizitii in cel nou.

  ⚠ ACORDUL. Cu bannerul oprit, pixelul se incarca oricum, deci si serverul trimite. Cu bannerul pornit:
  daca s-a fotografiat decizia la checkout, trebuie acordul pentru MARKETING; daca nu (comenzi mai vechi),
  singurul semn ca pixelul rula e cookie-ul `_fbp` fotografiat; fara el nu se trimite.
*/

type Admin = SupabaseClient;

export type RezultatMeta =
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

export interface ConfigCapi {
  access_token?: string;
  /** Pixelul pe care a fost verificat tokenul. Alt pixel salvat in panou cere o verificare noua. */
  pixel_id?: string;
  test_event_code?: string;
  ultima_trimitere_la?: string;
  ultima_eroare?: string;
  ultima_eroare_la?: string;
}

/** Hotararea de acord, pura: se probeaza fara baza. */
export function acordPentruMeta(sursa: Record<string, unknown> | null | undefined, bannerPornit: boolean): boolean {
  if (!bannerPornit) return true;
  if (sursa?.consimtamant_citit === "da") return sursa.consimtamant_marketing === "da";
  return !!cookieMetaValid(sursa?.fbp);
}

/** Evenimentul `Purchase`, construit din comanda. Pur: se probeaza fara retea si fara baza. */
export function evenimentCumparare(
  comanda: Comanda,
  paginiSectiuni: ReadonlyMap<string, unknown>,
  adresaMagazin: string,
  acum: number = Date.now(),
): EvenimentCapi {
  const sursa = comanda.order_source ?? {};
  const linii = (Array.isArray(comanda.items) ? comanda.items : []) as LinieComanda[];
  const continut = continutComanda(linii, paginiSectiuni);

  const hash = hashuieste(normalizeazaPentruMeta({
    email: comanda.customer_email,
    telefon: comanda.customer_phone,
    nume: comanda.customer_name,
    ...dateDinAdresa(comanda.shipping_address),
  }));
  /* „string or list<string>”: listele sunt forma pe care o arata exemplele lor pentru datele hash-uite. */
  const user_data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(hash)) user_data[k] = [v];
  const ip = typeof sursa.client_ip === "string" ? sursa.client_ip : undefined;
  if (ip) user_data.client_ip_address = ip;
  if (typeof sursa.user_agent === "string") user_data.client_user_agent = sursa.user_agent;
  const fbp = cookieMetaValid(sursa.fbp);
  if (fbp) user_data.fbp = fbp;
  const fbc = cookieMetaValid(sursa.fbc) ?? fbcDinFbclid(sursa.fbclid, sursa.captured_at);
  if (fbc) user_data.fbc = fbc;

  const custom_data: Record<string, unknown> = {
    currency: "RON",
    value: Math.round((Number(comanda.total) || 0) * 100) / 100,
    order_id: comanda.id,
    num_items: linii.reduce((s, l) => s + (Number(l.quantity) || 1), 0),
  };
  if (continut.content_ids.length) {
    custom_data.content_ids = continut.content_ids;
    custom_data.contents = continut.contents;
    if (continut.content_type) custom_data.content_type = continut.content_type;
  }

  return {
    event_name: "Purchase",
    event_time: Math.floor(acum / 1000),
    event_id: comanda.id,
    action_source: "website",
    event_source_url: `${adresaMagazin}/confirm`,
    user_data,
    custom_data,
  };
}

/** Starea ultimei trimiteri, pentru panou. Tokenul se pastreaza: configurarea se citeste si se scrie intreaga. */
async function scrieStarea(admin: Admin, businessId: string, petic: Partial<ConfigCapi>) {
  const { data } = await admin.from("store_settings").select("meta_capi_config").eq("business_id", businessId).maybeSingle();
  const cfg = ((data as { meta_capi_config?: ConfigCapi | null } | null)?.meta_capi_config ?? null);
  if (!cfg?.access_token) return;
  /* ⚠ O reusita dupa alta reusita recenta nu rescrie configurarea (si tokenul) la fiecare comanda. */
  if (petic.ultima_trimitere_la && !cfg.ultima_eroare && cfg.ultima_trimitere_la
    && Date.parse(petic.ultima_trimitere_la) - Date.parse(cfg.ultima_trimitere_la) < 3_600_000) return;
  await admin.from("store_settings")
    .update({ meta_capi_config: { ...cfg, ...petic } as never })
    .eq("business_id", businessId);
}

/** Trimite ACHIZITIA unei comenzi prin Conversions API, daca are voie. NU arunca; se cheama prin `dupaRaspuns`. */
export async function raporteazaCumparareaMeta(orderId: string, admin: Admin = createAdminClient()): Promise<RezultatMeta> {
  try {
    const { data } = await admin.from("orders").select(COLOANE_COMANDA).eq("id", orderId).maybeSingle();
    const comanda = data as Comanda | null;
    if (!comanda) return "fara-comanda";
    if (clientDeMarketplace(comanda.order_source)) return "de-marketplace";
    if (!vanzareaEConfirmata(comanda.payment_method, comanda.payment_status)) return "neincasata";

    const [{ data: rand }, { data: biz }] = await Promise.all([
      admin.from("store_settings")
        .select("marketing_config, meta_capi_config, cookie_banner_config")
        .eq("business_id", comanda.business_id)
        .maybeSingle(),
      admin.from("businesses").select("slug, custom_domain").eq("id", comanda.business_id).maybeSingle(),
    ]);
    const r = rand as {
      marketing_config?: { facebook_pixel_id?: string; facebook_capi_activ?: boolean } | null;
      meta_capi_config?: ConfigCapi | null;
      cookie_banner_config?: unknown;
    } | null;
    const pixelId = parseMetaPixelId(r?.marketing_config?.facebook_pixel_id);
    const token = r?.meta_capi_config?.access_token?.trim();
    const magazin = biz as { slug: string; custom_domain: string | null } | null;
    if (!pixelId || !token || !magazin || r?.marketing_config?.facebook_capi_activ !== true) return "fara-configurare";

    if (!acordPentruMeta(comanda.order_source, parseCookieBannerConfig(r?.cookie_banner_config).enabled)) return "fara-acord";

    const { data: deja } = await admin.from("meta_comenzi_raportate").select("order_id").eq("order_id", orderId).maybeSingle();
    if (deja) return "deja-raportata";

    const ids = [...new Set(((Array.isArray(comanda.items) ? comanda.items : []) as LinieComanda[]).map((l) => l.product_id).filter((x): x is string => !!x))];
    const paginiSectiuni = new Map<string, unknown>();
    if (ids.length) {
      const { data: produse } = await admin.from("products").select("id, page_sections").in("id", ids);
      for (const p of (produse ?? []) as { id: string; page_sections: unknown }[]) paginiSectiuni.set(p.id, p.page_sections);
    }

    const eveniment = evenimentCumparare(comanda, paginiSectiuni, storeBaseUrl(magazin));
    const rezultat = await trimiteLaMeta({ pixelId, token, testEventCode: r?.meta_capi_config?.test_event_code }, [eveniment]);
    const acum = new Date().toISOString();
    if (!rezultat.ok) {
      await scrieStarea(admin, comanda.business_id, { ultima_eroare: rezultat.mesaj.slice(0, 300), ultima_eroare_la: acum });
      await logError({
        action: "meta.capi.cumparare", severity: "warning", businessId: comanda.business_id,
        message: `Meta a refuzat achizitia: ${rezultat.mesaj}`, details: { orderId, cod: rezultat.cod, subcod: rezultat.subcod },
      });
      return "respinsa";
    }
    await admin.from("meta_comenzi_raportate").upsert(
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
export async function raporteazaCumparareaMetaDupaIncasare(orderId: string, admin: Admin = createAdminClient()): Promise<RezultatMeta> {
  const { data } = await admin.from("orders").select("payment_method").eq("id", orderId).maybeSingle();
  if (!asteaptaIncasareOnline((data as { payment_method: string | null } | null)?.payment_method)) return "neincasata";
  return raporteazaCumparareaMeta(orderId, admin);
}
