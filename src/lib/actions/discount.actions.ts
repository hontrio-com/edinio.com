"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
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

/*
 * UN SINGUR mesaj pentru toate esecurile.
 *
 * Erau patru, distincte: „nu este valid" / „a expirat" / „a atins limita maxima"
 * / „valoarea minima a comenzii este X lei". Diferenta dintre ele confirma ca un
 * cod EXISTA, deci actiunea putea fi folosita ca oracol de dictionar
 * (BLACKFRIDAY, WELCOME10, REDUCERE20 — codurile scrise de mana de comerciant,
 * nu cele generate). Iar `subtotal` vine de la client si nu e validat nicaieri,
 * deci trimitand 0 se forta mereu ramura care tiparea pragul minim al
 * comerciantului.
 *
 * Cine desparte mesajele la loc redeschide oracolul, si nu doar pe jumatate:
 * ajunge UNA dintre cele trei ramuri „codul exista, dar..." ca enumerarea sa
 * functioneze din nou. Pragul minim se anunta pe pagina magazinului, unde
 * comerciantul alege sa-l spuna, nu ca raspuns la un cod ghicit.
 */
const ESEC_CUPON = "Codul introdus nu este valid sau nu poate fi folosit pentru aceasta comanda.";

/*
 * Depasirea plafonului pe magazin inseamna ori o incercare de enumerare, ori un
 * prag pus prea jos — in amandoua cazurile cineva trebuie sa afle, fiindca in
 * intervalul acela cumparatorii reali nu-si mai pot folosi cupoanele.
 *
 * Cel mult o alerta pe ora pe magazin: contorul durabil folosit pe dos, ca
 * `error_logs` sa nu se umple exact in timpul abuzului pe care il semnaleaza.
 */
async function alertaCupoane(businessId: string): Promise<void> {
  if (!(await consumaLimita(`alerta:cupon:${businessId}`, 1, 3600)).permis) return;
  await logError({
    action: "validateDiscount.plafonMagazin",
    message: "Prea multe coduri respinse pe magazin intr-un interval scurt (posibila enumerare de cupoane)",
    details: { businessId },
    businessId,
    severity: "warning",
  });
}

/*
 * Raspunsul comun la orice cod respins — si singurul loc unde se atinge contorul
 * PE MAGAZIN.
 *
 * Contorul pe magazin NU are voie sa fie o poarta inaintea cautarii, si asta nu
 * e o subtilitate: `placeOrder` re-valideaza cuponul server-side si, daca
 * validarea nu iese cu „valid", OPRESTE COMANDA (`order.actions.ts:962` si
 * `:2599` — `if (!dres.valid) return { error: dres.error }`). Un contor pe
 * magazin verificat inainte de cautare inseamna deci ca oricine trimite ~300 de
 * coduri inventate la 10 minute (0,5 cereri pe secunda, pe ID-ul de magazin din
 * pachetul public) blocheaza plasarea ORICAREI comenzi care poarta un cod de
 * reducere, la toti cumparatorii magazinului. Si nu se desface singur: contorul
 * se stergea doar la o validare REUSITA, iar cat timp e epuizat nicio validare
 * nu mai reuseste.
 *
 * Asa, contorul se consuma NUMAI pe esecuri si nu refuza niciodata: un cod
 * VALID trece intotdeauna, indiferent cat s-a acumulat. Ce ramane e un semnal de
 * enumerare in `error_logs`. Frana propriu-zisa e `cupon:ip` de mai sus — o
 * limita pe apelant, care nu poate fi intoarsa de un tert impotriva
 * cumparatorilor magazinului.
 *
 * Nu se reseteaza la validare reusita: contorul numara acum doar respingeri,
 * deci o stergere n-ar face decat sa acopere enumerarea care intercaleaza un cod
 * bun la fiecare rafala.
 */
async function esecCupon(businessId: string): Promise<{ valid: false; error: string }> {
  const lim = await consumaLimita(`cupon:biz:${businessId}`, 300, 600);
  if (!lim.permis) await alertaCupoane(businessId);
  return { valid: false, error: ESEC_CUPON };
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
   * A doua linie, DURABILA, si tot PE APELANT.
   *
   * Cea de mai sus e o harta in memoria procesului: pe Vercel plafonul efectiv se
   * inmulteste cu numarul de instante calde si se pierde la fiecare desfasurare.
   * Asta tine in Postgres, deci e singura care chiar numara.
   *
   * Frana ramane cheiata pe IP dinadins. Un plafon PE MAGAZIN pus aici, inaintea
   * cautarii, ar opri plasarea comenzilor tuturor cumparatorilor magazinului —
   * vezi `esecCupon`, unde contorul pe magazin numara doar respingerile si nu
   * refuza pe nimeni.
   */
  const limIp = await consumaLimita(`cupon:ip:${ip}`, 60, 600);
  if (!limIp.permis) {
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
  if (!cod) return esecCupon(businessId);

  const { data } = await supabase
    .from("discounts")
    .select("*")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .eq("code", cod)
    .maybeSingle();

  // Toate cele patru esecuri raspund identic — vezi `ESEC_CUPON`.
  if (!data) return esecCupon(businessId);

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return esecCupon(businessId);
  }

  if (data.max_uses !== null && data.uses_count >= data.max_uses) {
    return esecCupon(businessId);
  }

  if (data.min_order_amount !== null && subtotal < data.min_order_amount) {
    return esecCupon(businessId);
  }

  let discountAmount = 0;
  if (data.type === "percent") {
    discountAmount = Math.round((subtotal * data.value) / 100 * 100) / 100;
  } else if (data.type === "fixed") {
    discountAmount = Math.min(Number(data.value), subtotal);
  }
  // free_shipping: discountAmount stays 0, OrderModal handles shipping separately

  // Codul e bun: nu se atinge niciun contor pe magazin, nici la consum, nici la
  // stergere. Vezi `esecCupon` — pe magazin se numara doar respingerile.
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
