import { createAdminClient } from "@/lib/supabase/admin";
import { sendGa4Purchase, sendGa4Refund } from "@/lib/google-analytics/mp";
import type { GoogleAnalyticsConfig } from "@/lib/google-analytics/types";
import { asteaptaIncasareOnline } from "./vanzare-confirmata";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CONVERSIA DE SERVER A UNEI COMENZI, INTR-UN LOC DE UNDE O POT CHEMA TREI
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE A IESIT DIN `order.actions.ts`. Fisierul acela are `"use server"`, deci
  fiecare export al lui devine un capat HTTP. Ajutorul asta trebuie chemat si din
  finalizarea platii — care nu e o actiune de server — deci mutarea era singura
  cale care nu deschide o usa publica. Aceeasi lectie ca la `plata-stripe.ts`.

  ⚠ CE S-A SCHIMBAT ODATA CU MUTAREA, si e chiar defectul. Conversia pleca la
  CREAREA comenzii, pentru orice metoda de plata. La card, asta inseamna inainte ca
  omul sa fi ajuns macar la procesator: GA4 primea venit pentru comenzi care nu se
  plateau niciodata. Masurat pe 03.09.2026: 15 din 32 de comenzi Netopia neplatite.

  Acum pleaca de doua ori din locuri deosebite, si niciodata amandoua:
    - ramburs (si marketplace): la creare, fiindca acolo comanda ESTE vanzarea;
    - plata online: la confirmarea incasarii, din `finalizeazaPlataComenzii`.

  ⚠ SI DACA TOTUSI PLEACA DE DOUA ORI? GA4 deduplica dupa `transaction_id`, si pe
  asta se sprijina deja perechea browser+server de mai demult. Deci greseala in
  directia „de doua ori" e inghitita; cea in directia „venit fals" nu era.
*/

type ArticolComanda = { product_id?: string; name: string; price: number; quantity: number };

/**
 * Trimite GA4 (Measurement Protocol) evenimentul unei comenzi.
 *
 * ⚠ NU ARUNCA NICIODATA in apelant si nu se asteapta dupa el: e o masuratoare, nu
 * o parte din comanda. Un magazin fara configurare GA4 iese tacut.
 */
export async function raporteazaComandaGa4(
  businessId: string,
  fel: "purchase" | "refund",
  o: { transactionId: string; value: number; clientId?: string; items: ArticolComanda[] },
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("store_settings")
      .select("google_analytics_config")
      .eq("business_id", businessId)
      .single();
    const cfg = (data?.google_analytics_config as GoogleAnalyticsConfig | null) ?? null;
    if (!cfg?.measurement_id || !cfg?.api_secret) return;
    const mp = { measurementId: cfg.measurement_id, apiSecret: cfg.api_secret };
    const items = o.items.map((i) => ({ item_id: i.product_id, item_name: i.name, price: i.price, quantity: i.quantity }));
    const payload = { transactionId: o.transactionId, value: o.value, clientId: o.clientId, items };
    if (fel === "purchase") await sendGa4Purchase(mp, payload);
    else await sendGa4Refund(mp, payload);
  } catch {
    // best-effort
  }
}

/**
 * Conversia unei comenzi ONLINE, dupa ce incasarea a fost confirmata.
 *
 * ⚠ SE CHEAMA DIN `finalizeazaPlataComenzii`, pe drumul care se aprinde o SINGURA
 * data (`platita-acum`). Acolo converg toti cei cinci procesatori — Netopia,
 * Stripe, Revolut, Klarna, iPay — deci o metoda noua intra sub regula fara sa fie
 * nevoie s-o adauge cineva aici.
 *
 * ⚠ SI NU FACE NIMIC LA RAMBURS: acolo conversia a plecat deja la creare, si a
 * doua ar fi o repetare inutila (chiar daca GA4 ar deduplica-o).
 */
export async function raporteazaCumparareaDupaIncasare(idComanda: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: comanda } = await admin
      .from("orders")
      .select("id, business_id, total, items, payment_method, order_source")
      .eq("id", idComanda)
      .single();
    if (!comanda) return;

    const c = comanda as unknown as {
      business_id: string; total: number | null; items: unknown;
      payment_method: string | null; order_source: { ga_client_id?: string } | null;
    };
    if (!asteaptaIncasareOnline(c.payment_method)) return;

    await raporteazaComandaGa4(c.business_id, "purchase", {
      transactionId: idComanda,
      value: c.total ?? 0,
      clientId: c.order_source?.ga_client_id,
      items: Array.isArray(c.items) ? (c.items as ArticolComanda[]) : [],
    });
  } catch {
    // best-effort: o masuratoare nu are voie sa strice finalizarea unei plati
  }
}
