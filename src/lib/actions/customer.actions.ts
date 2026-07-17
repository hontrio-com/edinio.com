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
