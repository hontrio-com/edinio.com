"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { logError } from "@/lib/error-logger";

export interface DiscountData {
  code: string;
  type: "percent" | "fixed" | "free_shipping";
  value: number;
  min_order_amount: number | null;
  max_uses: number | null;
  is_active: boolean;
  expires_at: string | null;
}

export interface ValidatedDiscount {
  id: string;
  code: string;
  type: "percent" | "fixed" | "free_shipping";
  value: number;
  discountAmount: number; // 0 for free_shipping
}

export async function validateDiscount(
  code: string,
  businessId: string,
  subtotal: number,
): Promise<{ valid: true; discount: ValidatedDiscount } | { valid: false; error: string }> {
  /*
   * Limita de incercari, ca la plasarea comenzii.
   *
   * `validateDiscount` e un export `use server`, adica un endpoint public care
   * raspunde „valid" sau „nu": fara limita, cupoanele unui magazin se afla prin
   * incercari, una dupa alta, fara nicio urma. `placeOrder` are limita de mult;
   * asta n-o avea. Pragul e mai larg, fiindca un om chiar poate gresi codul de
   * cateva ori la rand.
   */
  const ip = clientIpFromHeaders(await headers());
  if (!rateLimit(`validateDiscount:${ip}`, 20, 60_000)) {
    return { valid: false, error: "Prea multe incercari. Asteapta un minut si incearca din nou." };
  }

  /*
   * Client ADMIN, nu cel al vizitatorului.
   *
   * Cumparatorul e anonim, iar tabelul avea o politica de citire publica
   * (`is_active = true`) care ii dadea oricui, printr-o singura cerere cu cheia
   * din pachetul public, TOATE cupoanele active ale platformei: cod, tip,
   * valoare, limite. Politica aceea a fost stearsa, iar singurul drum catre
   * cupoane ramane functia asta, care raspunde doar „valid" sau „nu" pentru un
   * cod anume, si e limitata la incercari.
   */
  const supabase = createAdminClient();

  /*
   * Potrivire EXACTA, nu `ilike`.
   *
   * `ilike` trimite sirul mai departe ca SABLON, iar `%` si `_` raman
   * metacaractere. Cine tasta `%` primea inapoi un cupon adevarat, cu tot cu cod,
   * iar formularul il trimitea mai departe si serverul il acorda. Masurat pe
   * productie: `C%` scotea un cupon de 30%, `B%` unul de 15%. Adica oricine putea
   * lua reducerea magazinului fara sa stie niciun cod.
   *
   * Codurile se scriu cu majuscule la salvare, deci potrivirea exacta pe forma
   * majusculata pastreaza purtarea buna de pana acum: clientul poate scrie cu
   * litere mici.
   */
  const cod = code.trim().toUpperCase();
  if (!cod) return { valid: false, error: "Codul de discount nu este valid." };

  const { data } = await supabase
    .from("discounts")
    .select("*")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .eq("code", cod)
    .maybeSingle();

  if (!data) return { valid: false, error: "Codul de discount nu este valid." };

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { valid: false, error: "Codul de discount a expirat." };
  }

  if (data.max_uses !== null && data.uses_count >= data.max_uses) {
    return { valid: false, error: "Codul a atins limita maxima de utilizari." };
  }

  if (data.min_order_amount !== null && subtotal < data.min_order_amount) {
    return {
      valid: false,
      error: `Valoarea minima a comenzii pentru acest cod este ${data.min_order_amount} lei.`,
    };
  }

  let discountAmount = 0;
  if (data.type === "percent") {
    discountAmount = Math.round((subtotal * data.value) / 100 * 100) / 100;
  } else if (data.type === "fixed") {
    discountAmount = Math.min(Number(data.value), subtotal);
  }
  // free_shipping: discountAmount stays 0, OrderModal handles shipping separately

  return {
    valid: true,
    discount: {
      id: data.id,
      code: data.code,
      type: data.type as "percent" | "fixed" | "free_shipping",
      value: Number(data.value),
      discountAmount,
    },
  };
}

export async function createDiscount(businessId: string, data: DiscountData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { error: "Magazin negasit" };

  const { error } = await supabase.from("discounts").insert({
    business_id: businessId,
    code: data.code.trim().toUpperCase(),
    type: data.type,
    value: data.value,
    min_order_amount: data.min_order_amount,
    max_uses: data.max_uses,
    is_active: data.is_active,
    expires_at: data.expires_at,
  });

  if (error) {
    if (error.code === "23505") return { error: "Acest cod exista deja." };
    logError({ action: "createDiscount", message: error.message, details: { code: error.code, hint: error.hint, businessId }, userId: user.id });
    return { error: "Eroare la salvare. Incearca din nou." };
  }

  revalidatePath("/dashboard/discounts");
  return { success: true };
}

export async function updateDiscount(discountId: string, businessId: string, data: DiscountData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { error: "Magazin negasit" };

  const { error } = await supabase
    .from("discounts")
    .update({
      code: data.code.trim().toUpperCase(),
      type: data.type,
      value: data.value,
      min_order_amount: data.min_order_amount,
      max_uses: data.max_uses,
      is_active: data.is_active,
      expires_at: data.expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", discountId)
    .eq("business_id", businessId);

  if (error) {
    if (error.code === "23505") return { error: "Acest cod exista deja." };
    logError({ action: "updateDiscount", message: error.message, details: { code: error.code, hint: error.hint, discountId, businessId }, userId: user.id });
    return { error: "Eroare la salvare. Incearca din nou." };
  }

  revalidatePath("/dashboard/discounts");
  return { success: true };
}

export async function toggleDiscount(discountId: string, businessId: string, isActive: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { error: "Magazin negasit" };

  const { error } = await supabase
    .from("discounts")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", discountId)
    .eq("business_id", businessId);

  if (error) return { error: "Eroare la actualizare." };
  revalidatePath("/dashboard/discounts");
  return { success: true };
}

export async function deleteDiscount(discountId: string, businessId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { error: "Magazin negasit" };

  const { error } = await supabase
    .from("discounts")
    .delete()
    .eq("id", discountId)
    .eq("business_id", businessId);

  if (error) return { error: "Eroare la stergere." };
  revalidatePath("/dashboard/discounts");
  return { success: true };
}
