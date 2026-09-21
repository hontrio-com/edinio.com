"use server";

import { createClient } from "@/lib/supabase/server";
import type { CustomerOrder } from "@/lib/customers";

const HISTORY_PAGE_SIZE = 50;

/**
 * Istoricul de comenzi al unui client (cheia de dedup din customers_aggregate),
 * paginat — modalul de detalii il incarca on-demand, ca sa nu care pagina de
 * clienti istoricul tuturor. Autorizarea o face RLS pe orders (owner-only):
 * un businessId strain intoarce pur si simplu zero randuri.
 */
export async function getCustomerOrders(
  businessId: string,
  customerKey: string,
  offset: number
): Promise<{ orders: CustomerOrder[]; total: number } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Trebuie sa fii autentificat." };

  const { data, error } = await supabase.rpc("customer_orders", {
    bid: businessId,
    cust_key: customerKey,
    page_limit: HISTORY_PAGE_SIZE,
    page_offset: Math.max(0, Math.floor(offset)),
  });
  if (error) return { error: "Nu am putut incarca istoricul comenzilor." };

  return {
    orders: (data ?? []).map((r) => ({
      id: r.id,
      order_number: r.order_number,
      total: Number(r.total),
      status: r.status,
      payment_method: r.payment_method,
      payment_status: r.payment_status,
      created_at: r.created_at,
      item_count: Number(r.item_count),
    })),
    total: data?.length ? Number(data[0].total_count) : 0,
  };
}

/** Un rand din cronologia clientului, asa cum il da `customer_activity`. */
export interface ActivitateClient {
  fel: string;
  cand: string;
  titlu: string | null;
  detaliu: string | null;
  suma: number | null;
  legaturaId: string | null;
}

/**
 * Cronologia unui client: comenzi, cosuri abandonate, SMS-uri, mesaje de recuperare.
 *
 * ⚠ SE CERE LA DESCHIDEREA FILEI, nu odata cu lista. Patru izvoare unite si
 * sortate pentru fiecare client din pagina ar fi insemnat cincizeci de cronologii
 * aduse degeaba — omul deschide una.
 *
 * ⚠ Legarea de client se face pe aceeasi cheie ca restul paginii (telefon
 * normalizat, apoi email). Vezi `migrations/2026-09-21-clienti-activitate.sql`.
 */
export async function getCustomerActivity(
  businessId: string,
  customerKey: string,
): Promise<{ activitate: ActivitateClient[] } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Trebuie sa fii autentificat." };

  const { data, error } = await supabase.rpc("customer_activity", {
    bid: businessId,
    cust_key: customerKey,
  });
  if (error) return { error: "Nu am putut incarca activitatea clientului." };

  return {
    activitate: (data ?? []).map((r) => ({
      fel: r.fel,
      cand: r.cand,
      titlu: r.titlu ?? null,
      detaliu: r.detaliu ?? null,
      suma: r.suma == null ? null : Number(r.suma),
      legaturaId: r.legatura_id ?? null,
    })),
  };
}
