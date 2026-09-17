import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { corpGa4, trimiteGa4, type MpItem } from "@/lib/google-analytics/mp";
import { sesiuneaPentru, valoriGa4, verdictTrimitere, type SemnaleComanda } from "@/lib/google-analytics/comanda-ga4";
import type { GoogleAnalyticsConfig } from "@/lib/google-analytics/types";
import { parseCookieBannerConfig } from "@/lib/cookie-consent";
import { logError } from "@/lib/error-logger";
import { asteaptaIncasareOnline } from "./vanzare-confirmata";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CONVERSIA DE SERVER A UNEI COMENZI, INTR-UN LOC DE UNDE O POT CHEMA TREI
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE A IESIT DIN `order.actions.ts`. Fisierul acela are `"use server"`, deci
  fiecare export al lui devine un capat HTTP. Ajutorul asta trebuie chemat si din
  finalizarea platii — care nu e o actiune de server — deci mutarea era singura
  cale care nu deschide o usa publica. Aceeasi lectie ca la `plata-stripe.ts`.

  Achizitia pleaca din locuri deosebite, si niciodata amandoua:
    - ramburs: la creare, fiindca acolo comanda ESTE vanzarea;
    - plata online: la confirmarea incasarii, din `finalizeazaPlataComenzii`, sau cand comerciantul
      bifeaza „platit” de mana.

  ═══ ⚠⚠ CE S-A SCHIMBAT PE 17.09.2026 (auditul GA4) ═══

  1. RAMBURSAREA pleca la orice anulare, si pentru comenzi a caror achizitie nu plecase niciodata
     (card neplatit, marketplace, comanda de mana). Acum pleaca doar daca `ga4_comenzi_raportate`
     are achizitia, adica doar daca Google a primit-o.
  2. ACHIZITIA pleca si pentru cine refuzase cookie-urile de analiza. Vezi `verdictTrimitere`.
  3. `value` era totalul, cu transport. Vezi `valoriGa4`.
  4. Comanda se CITESTE aici, din baza, in loc sa vina gata calculata de la trei apelanti: asa
     browserul, serverul si rambursarea pleaca din aceiasi bani.
  5. Raspunsul lui Google se citeste, iar un refuz se scrie in jurnal.
  6. Oprirea urmaririi din panou (`tracking_enabled: false`) opreste si serverul, nu doar tag-ul.
*/

type Admin = SupabaseClient;

export type RezultatRaportare =
  | "fara-comanda"
  | "fara-configurare"
  | "urmarire-oprita"
  | "deja-raportata"
  | "fara-acord"
  | "fara-achizitie"
  | "nu-e-plata-online"
  | "trimisa"
  | "respinsa"
  | "eroare";

type Comanda = {
  id: string; business_id: string; total: number | null; shipping_cost: number | null;
  cod_fee_amount: number | null; vat_amount: number | null; prices_include_vat: boolean | null;
  items: unknown; payment_method: string | null; order_source: (SemnaleComanda & Record<string, unknown>) | null;
};

const COLOANE_COMANDA =
  "id, business_id, total, shipping_cost, cod_fee_amount, vat_amount, prices_include_vat, items, payment_method, order_source";

async function citesteComanda(admin: Admin, orderId: string): Promise<Comanda | null> {
  const { data } = await admin.from("orders").select(COLOANE_COMANDA).eq("id", orderId).maybeSingle();
  return (data as Comanda | null) ?? null;
}

async function citesteMagazinul(admin: Admin, businessId: string) {
  const { data } = await admin
    .from("store_settings")
    .select("google_analytics_config, cookie_banner_config")
    .eq("business_id", businessId)
    .maybeSingle();
  const r = data as { google_analytics_config?: unknown; cookie_banner_config?: unknown } | null;
  return {
    cfg: (r?.google_analytics_config as GoogleAnalyticsConfig | null) ?? null,
    bannerPornit: parseCookieBannerConfig(r?.cookie_banner_config).enabled,
  };
}

function articole(items: unknown): MpItem[] {
  if (!Array.isArray(items)) return [];
  return (items as { product_id?: string; name?: string; price?: number; quantity?: number }[]).map((i) => ({
    item_id: i.product_id,
    item_name: String(i.name ?? ""),
    price: Number(i.price) || 0,
    quantity: Number(i.quantity) || 1,
  }));
}

/**
 * Trimite ACHIZITIA unei comenzi in GA4, daca are voie. NU arunca; se cheama prin `dupaRaspuns`.
 */
export async function raporteazaCumparareaGa4(
  orderId: string,
  admin: Admin = createAdminClient(),
): Promise<RezultatRaportare> {
  try {
    const comanda = await citesteComanda(admin, orderId);
    if (!comanda) return "fara-comanda";

    const { cfg, bannerPornit } = await citesteMagazinul(admin, comanda.business_id);
    if (!cfg?.measurement_id || !cfg.api_secret) return "fara-configurare";
    if (cfg.tracking_enabled === false) return "urmarire-oprita";

    const { data: deja } = await admin
      .from("ga4_comenzi_raportate").select("cumparare_la").eq("order_id", orderId).maybeSingle();
    if ((deja as { cumparare_la: string | null } | null)?.cumparare_la) return "deja-raportata";

    const sursa = comanda.order_source;
    const verdict = verdictTrimitere(sursa, bannerPornit);
    if (!verdict.trimite) return "fara-acord";

    const corp = corpGa4("purchase", {
      transactionId: comanda.id,
      ...valoriGa4(comanda),
      items: articole(comanda.items),
      clientId: sursa?.ga_client_id,
      sessionId: sesiuneaPentru(sursa?.ga_sesiuni, cfg.measurement_id),
      consent: verdict.consent,
    });
    const r = await trimiteGa4({ measurementId: cfg.measurement_id, apiSecret: cfg.api_secret }, corp);
    if (!r.ok) {
      await logError({
        action: "ga4.cumparare", severity: "warning", businessId: comanda.business_id,
        message: `Google Analytics a refuzat achizitia (HTTP ${r.status})`, details: { orderId, status: r.status },
      });
      return "respinsa";
    }

    /* ⚠ Urma se scrie DUPA 2xx: fara ea, anularea de mai tarziu nu trimite rambursarea. */
    await admin.from("ga4_comenzi_raportate").upsert(
      { order_id: comanda.id, business_id: comanda.business_id, cumparare_la: new Date().toISOString() } as never,
      { onConflict: "order_id" },
    );
    return "trimisa";
  } catch {
    return "eroare";
  }
}

/**
 * Trimite RAMBURSAREA unei comenzi, NUMAI daca achizitia ei a ajuns in GA4 si n-a mai fost rambursata.
 */
export async function raporteazaRambursareaGa4(
  orderId: string,
  admin: Admin = createAdminClient(),
): Promise<RezultatRaportare> {
  try {
    const { data: urma } = await admin
      .from("ga4_comenzi_raportate").select("cumparare_la, rambursare_la").eq("order_id", orderId).maybeSingle();
    const u = urma as { cumparare_la: string | null; rambursare_la: string | null } | null;
    /*
     * ⚠⚠ FARA ACHIZITIE, FARA RAMBURSARE. Asta e reparatia. O rambursare pentru o tranzactie pe care GA
     * n-a vazut-o scade din venit bani care n-au intrat acolo niciodata.
     */
    if (!u?.cumparare_la) return "fara-achizitie";
    if (u.rambursare_la) return "deja-raportata";

    const comanda = await citesteComanda(admin, orderId);
    if (!comanda) return "fara-comanda";
    const { cfg } = await citesteMagazinul(admin, comanda.business_id);
    /*
     * ⚠ `tracking_enabled` NU opreste rambursarea: achizitia e deja in GA, iar a lasa-o fara pereche ar
     * lasa venitul umflat. Doar lipsa secretului o opreste, fiindca fara el nu se poate trimite nimic.
     */
    if (!cfg?.measurement_id || !cfg.api_secret) return "fara-configurare";

    const corp = corpGa4("refund", {
      transactionId: comanda.id,
      ...valoriGa4(comanda),
      items: articole(comanda.items),
      clientId: comanda.order_source?.ga_client_id,
    });
    const r = await trimiteGa4({ measurementId: cfg.measurement_id, apiSecret: cfg.api_secret }, corp);
    if (!r.ok) {
      await logError({
        action: "ga4.rambursare", severity: "warning", businessId: comanda.business_id,
        message: `Google Analytics a refuzat rambursarea (HTTP ${r.status})`, details: { orderId, status: r.status },
      });
      return "respinsa";
    }
    await admin.from("ga4_comenzi_raportate")
      .update({ rambursare_la: new Date().toISOString() } as never).eq("order_id", orderId);
    return "trimisa";
  } catch {
    return "eroare";
  }
}

/**
 * Achizitia unei comenzi ONLINE, dupa ce incasarea a fost confirmata.
 *
 * ⚠ SE CHEAMA DIN `finalizeazaPlataComenzii`, pe drumul care se aprinde o SINGURA
 * data (`platita-acum`). Acolo converg toti cei cinci procesatori — Netopia,
 * Stripe, Revolut, Klarna, iPay — deci o metoda noua intra sub regula fara sa fie
 * nevoie s-o adauge cineva aici.
 *
 * ⚠ SI NU FACE NIMIC LA RAMBURS: acolo achizitia a plecat deja la creare.
 */
export async function raporteazaCumparareaDupaIncasare(
  idComanda: string,
  admin: Admin = createAdminClient(),
): Promise<RezultatRaportare> {
  try {
    const { data } = await admin.from("orders").select("payment_method").eq("id", idComanda).maybeSingle();
    if (!data) return "fara-comanda";
    if (!asteaptaIncasareOnline((data as { payment_method: string | null }).payment_method)) return "nu-e-plata-online";
    return await raporteazaCumparareaGa4(idComanda, admin);
  } catch {
    return "eroare";
  }
}
