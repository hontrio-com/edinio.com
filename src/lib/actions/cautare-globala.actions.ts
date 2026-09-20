"use server";

import { createClient } from "@/lib/supabase/server";
import { curataTermen } from "@/lib/cautare-termen";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CAUTAREA DIN BARA DE SUS
  ═══════════════════════════════════════════════════════════════════════════

  Pana acum, campul scria „Cauta produse, comenzi..." si, la Enter, trimitea
  omul la lista de produse cu un filtru. Adica promitea comenzi si nu le cauta.

  Acum cauta in trei locuri deodata si arata rezultatele sub camp:
  produse (nume, SKU), comenzi (numar, client, email, telefon) si clienti
  (nume, email, telefon).

  ⚠ RLS RAMANE POARTA: se foloseste clientul utilizatorului, nu cel de serviciu,
  si fiecare interogare e legata de magazin. `p_business` e filtru, nu permisiune.
*/

export type RezultatProdus = { id: string; nume: string; sku: string | null; pret: number; imagine: string | null };
export type RezultatComanda = { id: string; numar: string; client: string; total: number; status: string };
export type RezultatClient = { id: string; nume: string; email: string | null; telefon: string | null };

export type RezultateCautare = {
  produse: RezultatProdus[];
  comenzi: RezultatComanda[];
  clienti: RezultatClient[];
};

const GOL: RezultateCautare = { produse: [], comenzi: [], clienti: [] };

export async function cautaInPanou(businessId: string, termenBrut: string): Promise<RezultateCautare> {
  const termen = curataTermen(termenBrut);
  /* Sub doua litere, orice magazin intoarce tot: nu e o cautare, e o lista. */
  if (termen.length < 2 || !businessId) return GOL;

  const supabase = await createClient();
  const tipar = `*${termen}*`;

  const [produse, comenzi, clienti] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, price, images")
      .eq("business_id", businessId)
      .or(`name.ilike.${tipar},sku.ilike.${tipar}`)
      .order("is_active", { ascending: false })
      .limit(5),
    supabase
      .from("orders")
      .select("id, order_number, customer_name, total, status")
      .eq("business_id", businessId)
      .or(`order_number.ilike.${tipar},customer_name.ilike.${tipar},customer_email.ilike.${tipar},customer_phone.ilike.${tipar}`)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("customers")
      .select("id, name, email, phone")
      .eq("business_id", businessId)
      .or(`name.ilike.${tipar},email.ilike.${tipar},phone.ilike.${tipar}`)
      .limit(5),
  ]);

  return {
    produse: (produse.data ?? []).map((p) => ({
      id: p.id,
      nume: p.name,
      sku: p.sku,
      pret: Number(p.price ?? 0),
      imagine: Array.isArray(p.images) ? (p.images[0] as string | undefined) ?? null : null,
    })),
    comenzi: (comenzi.data ?? []).map((o) => ({
      id: o.id,
      numar: o.order_number,
      client: o.customer_name ?? "",
      total: Number(o.total ?? 0),
      status: o.status ?? "pending",
    })),
    clienti: (clienti.data ?? []).map((c) => ({
      id: c.id,
      nume: c.name ?? "",
      email: c.email,
      telefon: c.phone,
    })),
  };
}
