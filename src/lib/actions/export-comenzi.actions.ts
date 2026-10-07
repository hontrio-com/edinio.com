"use server";

import { createClient } from "@/lib/supabase/server";
import { esteUuid } from "@/lib/supabase/ids";
import { conturileComenzilor } from "@/lib/cont/panou";
import { aplicaFiltreleListei, type FiltreleListei } from "@/lib/orders/filtrele-listei";
import { tabelulExportului, type ComandaExport, type TabelExport } from "@/lib/orders/export-comenzi";
import { MARKETPLACE_ORIGINI } from "@/lib/orders/origin";
import { ORDER_STATUS } from "@/lib/orders/status";

/**
 * Exportul comenzilor in .xlsx: cele bifate, sau, fara bifa, TOATE comenzile filtrului de pe ecran.
 * Tabelul se face aici (`tabelulExportului`), fisierul in browser.
 *
 * ⚠ Plafonul se SPUNE, nu se taie in tacere: un export care ar da 5.000 din 7.000 de comenzi fara
 * niciun cuvant ar arata a export complet.
 */
const MAX_BIFATE = 500;
const MAX_FILTRU = 5000;
const PAGINA = 1000;

const COLOANE = "id, order_number, created_at, status, payment_method, payment_status, total, customer_name, customer_phone, customer_email, billing_company, shipping_address, notes, "
  + "cargus_awb_number, colete_awb_number, curiera_awb_number, curiera_partener, curiera_partener_awb, dhl_awb_number, dpd_awb_number, ecolet_awb_number, epacket_awb_number, "
  + "fan_courier_awb_number, fedex_awb_number, gls_awb_number, innoship_awb_number, packeta_packet_id, packeta_external_tracking, pallex_awb_number, posta_awb_number, "
  + "sameday_awb_number, shipo_awb_number, smartship_awb_number, ups_awb_number, woot_awb_number";

export async function exportaComenzileAction(
  businessId: string,
  cerere: { ids: string[] } | { filtre: FiltreleListei },
): Promise<{ ok: true; tabel: TabelExport } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Neautorizat" };
  if (!esteUuid(businessId)) return { ok: false, error: "Magazin negasit" };
  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  if (!biz) return { ok: false, error: "Magazin negasit" };

  let comenzi: ComandaExport[] = [];
  if ("ids" in cerere) {
    const ids = [...new Set((cerere.ids ?? []).filter(esteUuid))];
    if (ids.length === 0) return { ok: false, error: "Nicio comanda selectata." };
    if (ids.length > MAX_BIFATE) {
      return { ok: false, error: `Se pot exporta cel mult ${MAX_BIFATE} de comenzi bifate, iar aici sunt ${ids.length}.` };
    }
    const { data, error } = await supabase.from("orders").select(COLOANE)
      .eq("business_id", businessId).in("id", ids)
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: `Comenzile nu s-au putut citi: ${error.message}` };
    comenzi = (data ?? []) as unknown as ComandaExport[];
  } else {
    /* Aceeasi validare ca pagina: in filtru nu ajunge text arbitrar. */
    const f = cerere.filtre ?? { status: "all", source: "all", q: "" };
    const filtre: FiltreleListei = {
      status: f.status in ORDER_STATUS ? f.status : "all",
      source: f.source === "all" || f.source === "store" || f.source in MARKETPLACE_ORIGINI ? f.source : "all",
      q: String(f.q ?? "").trim().slice(0, 80),
    };
    let total: number | null = null;
    /* ⚠ PE PAGINI: PostgREST taie orice raspuns la 1000 de randuri, tacut. */
    for (let de = 0; de < MAX_FILTRU; de += PAGINA) {
      const { data, error, count } = await aplicaFiltreleListei(
        supabase.from("orders").select(COLOANE, { count: de === 0 ? "exact" : undefined }).eq("business_id", businessId),
        filtre,
      )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(de, de + PAGINA - 1);
      if (error) return { ok: false, error: `Comenzile nu s-au putut citi: ${error.message}` };
      if (de === 0) total = count ?? null;
      comenzi.push(...((data ?? []) as unknown as ComandaExport[]));
      if ((data ?? []).length < PAGINA) break;
    }
    if (total !== null && total > MAX_FILTRU) {
      return {
        ok: false,
        error: `Filtrul are ${total} de comenzi, iar exportul ia cel mult ${MAX_FILTRU}. Restrange-l (stare, sursa sau cautare) si exporta pe bucati.`,
      };
    }
    if (comenzi.length === 0) return { ok: false, error: "Nicio comanda in filtrul de acum." };
  }

  const [conturi, { data: setari }] = await Promise.all([
    conturileComenzilor(businessId, comenzi.map((o) => o.id)),
    supabase.from("store_settings").select("page_content").eq("business_id", businessId).maybeSingle(),
  ]);
  const pc = (setari?.page_content ?? null) as { checkout_config?: { custom_fields?: { id?: unknown; label?: unknown }[] } } | null;
  const campuri = (pc?.checkout_config?.custom_fields ?? [])
    .filter((c) => typeof c?.id === "string")
    .map((c) => ({ id: String(c.id), label: typeof c.label === "string" ? c.label : "" }));

  return { ok: true, tabel: tabelulExportului(comenzi, conturi, campuri) };
}
