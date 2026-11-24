"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esteUuid } from "@/lib/supabase/ids";
import { logError } from "@/lib/error-logger";
import { campuriAditionaleDinConfigurare, noteleDupaEditare } from "@/lib/orders/campuri-aditionale";

/**
 * Salveaza „Campurile aditionale” ale unei comenzi, din „Editeaza comanda”.
 *
 * ⚠ Actiune SEPARATA de `updateOrderDetails`, dinadins. Aceea resocoteste liniile, transportul
 * si stocul si are refuzurile ei (comanda cu AWB, comanda de marketplace, comanda mutata intre
 * timp); un punct de reper corectat n-are de ce sa treaca prin ele si nici sa fie oprit de ele.
 * Aici se scrie O coloana, `notes`, si nimic altceva.
 *
 * ⚠ Ce se poate scrie hotaraste `noteleDupaEditare`: numai campurile magazinului si cheile deja
 * de pe comanda. Tipul parametrului nu exista la rulare, deci `valori` se ia drept orice.
 *
 * ⚠ Comanda se citeste cu clientul OMULUI (regulile bazei ii arata numai comenzile lui), iar
 * scrierea se face cu cheia de serviciu, filtrata pe `id` SI pe magazinul citit.
 */
export async function salveazaCampurileAditionale(
  orderId: string,
  valori: Record<string, string>,
): Promise<{ success: true; schimbat: boolean } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!esteUuid(orderId)) return { error: "Comanda negasita" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, business_id, notes")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { error: "Comanda negasita" };

  const { data: setari, error: eSetari } = await supabase
    .from("store_settings")
    .select("checkout:page_content->checkout_config")
    .eq("business_id", order.business_id)
    .maybeSingle();
  /* ⚠ Fara configurare citita nu se stie ce campuri are magazinul: nu se scrie pe ghicite. */
  if (eSetari) return { error: "Nu am putut citi formularul de comandă al magazinului. Încearcă din nou." };

  const campuri = campuriAditionaleDinConfigurare((setari as { checkout?: unknown } | null)?.checkout);
  const rez = noteleDupaEditare(order.notes, valori, campuri);
  if (!rez.ok) return { error: rez.error };
  if (!rez.schimbat) return { success: true, schimbat: false };

  const { data: scris, error } = await createAdminClient()
    .from("orders")
    .update({ notes: rez.note })
    .eq("id", order.id)
    .eq("business_id", order.business_id)
    .select("id");
  if (error || !scris || scris.length !== 1) {
    await logError({
      action: "salveazaCampurileAditionale",
      message: error?.message ?? "scrierea n-a atins niciun rand",
      details: { orderId },
      businessId: order.business_id,
      userId: user.id,
      severity: "error",
    });
    return { error: "Câmpurile adiționale nu s-au putut salva. Încearcă din nou." };
  }

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  return { success: true, schimbat: true };
}
