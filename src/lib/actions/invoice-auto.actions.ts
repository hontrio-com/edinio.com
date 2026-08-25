"use server";

import { clientFacturare, type SistemClient } from "@/lib/invoicing-context";

/**
 * Central auto-invoicing dispatcher. On an order status/payment change it issues
 * exactly ONE automatic invoice, with the highest-priority provider that has
 * auto-invoicing enabled and whose trigger matches the change.
 *
 * Priority: SmartBill → Oblio → fGO. A merchant normally enables auto on just one
 * provider, so priority only decides the rare case where several are enabled. If
 * the order already has an invoice from ANY provider (auto OR manual), nothing
 * happens — we never double-invoice. Fire-and-forget: never throws, never blocks
 * the order update.
 */
export async function maybeAutoInvoice(
  businessId: string,
  orderId: string,
  newStatus: string,
  newPaymentStatus: string,
  sistem?: SistemClient,
): Promise<void> {
  try {
    const supabase = await clientFacturare(sistem);
    const { data: order } = await supabase
      .from("orders")
      .select("smartbill_invoice_number, oblio_invoice_number, fgo_invoice_number, payment_method, order_source")
      .eq("id", orderId)
      .eq("business_id", businessId)
      .single();
    if (!order) return;

    const o = order as Record<string, unknown>;
    /*
     * Marketplaces (About You, Trendyol, ...) collect payment and invoice the end
     * customer themselves, so we never auto-invoice their orders (the merchant
     * invoices the marketplace B2B instead).
     *
     * ═══ ⚠ eMAG E EXCEPTIA, SI E O DEOSEBIRE FISCALA, NU TEHNICA ═══
     *
     * La eMAG, comerciantul factureaza CLIENTUL FINAL si TREBUIE sa incarce factura
     * inapoi la ei — documentatia lor, `/order/attachments/save`: „For invoices: use
     * type = 1". Nu e o optiune si nu e ceva ce face eMAG in locul lui.
     *
     * Lasata sub regula de mai sus, fiecare comanda eMAG ar fi ramas fara factura:
     * si la ei, si la client. Iar lipsa nu s-ar fi vazut nicaieri in Edinio, fiindca
     * „nu facturam comenzile de marketplace" arata ca o hotarare, nu ca o scapare.
     *
     * Urcarea propriu-zisa nu se face de aici (ar trage modulele eMAG in fiecare
     * schimbare de status). Se face din cronul `emag-sync`, care ia comenzile cu
     * factura si fara `invoice_uploaded_at`.
     */
    const src = o.order_source as { marketplace?: string } | null;
    const eEmag = src?.marketplace === "emag" || o.payment_method === "emag";
    if (!eEmag && (src?.marketplace || o.payment_method === "aboutyou" || o.payment_method === "trendyol")) return;

    /*
     * ═══ ⚠ O COMANDĂ eMAG INCOMPLETĂ NU SE FACTUREAZĂ ═══
     *
     * `is_complete: 0` înseamnă, în cuvintele lor, „incomplete order": liniile ei se
     * mai pot schimba. Facturată așa, documentul pleacă pe cantități care apoi se
     * modifică — iar o factură fiscală greșită nu se retrage, se stornează.
     *
     * ⚠ GARDA STĂ AICI, NU ÎN CALEA DE INGEST eMAG. `maybeAutoInvoice` e chemată din
     * douăsprezece cronuri de urmărire a coletelor (GLS, DHL, FedEx, UPS, Poșta,
     * Pallex, Ecolet, Packeta, Shipo, Smartship…), din acțiunile în masă și din
     * schimbarea manuală de status. Iar comenzile eMAG pot fi expediate cu curierul
     * propriu al comerciantului — deci drumul cel mai probabil către facturare NU
     * trece prin codul eMAG deloc.
     *
     * Pusă doar în ingest, o comandă incompletă expediată cu GLS ar fi fost trecută
     * „livrată" de cronul GLS și facturată pe loc.
     *
     * ⚠ Se citește din `emag_orders`, nu din `order_source`: acolo valoarea se
     * ÎMPROSPĂTEAZĂ la fiecare re-citire a comenzii. Copiată o dată în `order_source`,
     * ar fi rămas „incompletă" pe veci, iar comanda n-ar mai fi primit factură
     * niciodată.
     */
    if (eEmag) {
      const { data: randEmag, error: eRandEmag } = await supabase
        .from("emag_orders")
        .select("is_complete")
        .eq("business_id", businessId)
        .eq("order_id", orderId)
        .maybeSingle();

      /*
       * ═══ ⚠ „BAZA N-A RĂSPUNS” NU E „NU NE-AU SPUS” (25.08.2026) ═══
       *
       * Forma dinainte destructura numai `data`. PostgREST nu aruncă la un refuz — întoarce
       * `{ data: null, error }` — iar tot corpul stă într-un `try/catch` care înghite. Deci
       * o citire picată dădea `randEmag === null`, `complet === undefined`, garda de mai jos
       * NU se declanșa, și o comandă eMAG **incompletă pleca la facturare**.
       *
       * ⚠ AICI SE STĂ PE LOC, nu se merge mai departe, și e singurul loc din funcție unde
       * o necunoscută blochează. Motivul e asimetria costului, scrisă chiar mai sus: o
       * trecere sărită se reia — `maybeAutoInvoice` e chemată din douăsprezece cronuri de
       * curier — dar o factură fiscală greșită nu se retrage, se stornează.
       *
       * ⚠ Se deosebește de `randEmag === null`, care rămâne dinadins „mergi mai departe":
       * acela înseamnă că n-avem rând pentru comanda asta, nu că n-am putut întreba.
       */
      if (eRandEmag) return;

      const complet = (randEmag as { is_complete: number | null } | null)?.is_complete;
      /* ⚠ `null` = nu ne-au spus. Nu se blochează pe o necunoscută: o comandă fără
         steag ar fi rămas fără factură fără ca nimeni să afle de ce. */
      if (complet === 0) return;
    }
    if (o.smartbill_invoice_number || o.oblio_invoice_number || o.fgo_invoice_number) return;

    const smartbill = await import("@/lib/actions/smartbill.actions");
    if (await smartbill.maybeAutoGenerateInvoice(businessId, orderId, newStatus, newPaymentStatus, sistem)) return;

    const oblio = await import("@/lib/actions/oblio.actions");
    if (await oblio.maybeAutoGenerateInvoice(businessId, orderId, newStatus, newPaymentStatus, sistem)) return;

    const fgo = await import("@/lib/actions/fgo.actions");
    if (await fgo.maybeAutoGenerateInvoice(businessId, orderId, newStatus, newPaymentStatus, sistem)) return;
  } catch {
    // best-effort; auto-invoicing must never block an order update
  }
}
