"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esteUuid } from "@/lib/supabase/ids";
import { logError } from "@/lib/error-logger";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import { enqueueGmcSyncMany } from "@/lib/google-merchant/queue";
import { enqueueOlxSyncMany } from "@/lib/olx/queue";
import { enqueueAboutYouStockMany } from "@/lib/aboutyou/queue";
import { enqueueTrendyolInventoryMany } from "@/lib/trendyol/queue";
import { enqueueEmagStocMany } from "@/lib/emag/queue";
import { asteaptaPrimireaReturului } from "@/lib/curiera/statusuri";

/**
 * „Retur primit”: comerciantul confirma ca i-a ajuns coletul returnat, iar marfa lui revine in stoc.
 *
 * ═══ DE CE EXISTA (cerut de un magazin, 23.11.2026) ═══
 *
 * Curiera pune starea „returnat” cand coletul PORNESTE inapoi, nu cand ajunge, si nu are nicio
 * stare ulterioara (masurat din nou pe 23.11.2026, pe pagina lor publica de urmarire: doua retururi
 * vechi de 10 si 11 zile au ultimul eveniment „Expedierea va fi returnata”, iar „AWB retur” e gol).
 * Cu stocul eliberat la „returnat”, magazinul vindea o zi-doua marfa pe care n-o avea inca pe raft.
 * Magazinul care alege „la primire” in integrarea Curiera isi primeste stocul inapoi abia aici.
 *
 * ⚠ Nu se muta nimic altceva: comanda e DEJA „Rambursat” (a trecut-o cronul). Se cheama numai
 * `elibereaza_stoc_comanda`, care da inapoi exact ce a rezervat comanda si se apara singura de a
 * doua apasare (`stoc_eliberat_la`).
 *
 * ⚠ Comanda se citeste cu clientul OMULUI (regulile bazei ii arata numai comenzile lui); eliberarea
 * se face cu cheia de serviciu, fiindca functia nu e deschisa pentru `authenticated`.
 */
export async function confirmaReturulPrimit(
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!esteUuid(orderId)) return { error: "Comanda negasita" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, business_id, order_number, status, curiera_status_code, stoc_rezervat, stoc_eliberat_la")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { error: "Comanda negasita" };

  if (order.stoc_eliberat_la) return { error: "Stocul acestei comenzi a fost deja pus la loc." };
  if (!asteaptaPrimireaReturului(order)) {
    return { error: "Comanda nu are un retur care să aștepte confirmarea primirii." };
  }

  const { data: verdict, error } = await createAdminClient()
    .rpc("elibereaza_stoc_comanda", { p_order_id: order.id });
  if (error || (verdict !== "eliberat" && verdict !== "nimic")) {
    await logError({
      action: "confirmaReturulPrimit",
      message: error?.message ?? `eliberarea stocului a raspuns „${String(verdict)}”`,
      details: { orderId },
      businessId: order.business_id,
      userId: user.id,
      severity: "error",
    });
    return { error: "Stocul nu s-a putut pune la loc. Încearcă din nou." };
  }

  /* Canalele externe afla ca marfa s-a intors pe raft, ca la orice alta miscare de stoc. */
  const rezervat = order.stoc_rezervat as { produse?: { product_id?: unknown }[]; variante?: { product_id?: unknown }[] } | null;
  const atinse = [...new Set(
    [...(rezervat?.produse ?? []), ...(rezervat?.variante ?? [])]
      .map((r) => r?.product_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  )];
  if (atinse.length > 0) {
    const biz = order.business_id;
    dupaRaspuns(() => enqueueGmcSyncMany(biz, atinse), "enqueueGmcSyncMany", biz);
    dupaRaspuns(() => enqueueOlxSyncMany(biz, atinse), "enqueueOlxSyncMany", biz);
    dupaRaspuns(() => enqueueAboutYouStockMany(biz, atinse), "enqueueAboutYouStockMany", biz);
    dupaRaspuns(() => enqueueTrendyolInventoryMany(biz, atinse), "enqueueTrendyolInventoryMany", biz);
    dupaRaspuns(() => enqueueEmagStocMany(biz, atinse), "enqueueEmagStocMany", biz);
  }

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  return { success: true };
}
