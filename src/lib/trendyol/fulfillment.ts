// Trendyol fulfillment.
//
// Pe marketplace-ul international sunt DOUA feluri de curieri, si conteaza care:
//
//  - „platiti de Trendyol" (FAN Courier, DPD-RO, FANEX): Trendyol contracteaza
//    transportul si completeaza singur AWB-ul, care ne vine inapoi in comanda.
//    Vanzatorul doar semnaleaza Picking -> Invoiced.
//  - „platiti de vanzator" (DPD, DHL, GLS, PACKETA): comerciantul face AWB-ul cu
//    contul lui — la Edinio, chiar cu curierii nostri — si TREBUIE sa il trimita
//    catre Trendyol. Fara asta, coletul nu pleaca niciodata din „Picking".
//
// Ordinea ceruta: intai Picking, apoi AWB-ul (daca e cazul), apoi Invoiced. Dupa
// „Shipped" numarul nu mai poate fi schimbat. `params.invoiceNumber` se trimite
// doar pentru Invoiced.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { TrendyolSyncContext } from "./sync";
import { updatePackage, updateTrackingDetails, isTrendyolError } from "./client";
import { edinioStatusForTrendyol } from "./webhooks";
import { TRENDYOL_CARRIERS, curieriVitrina } from "./types";

type Db = SupabaseClient<Database>;

interface SideRow {
  id: string;
  shipment_package_id: string;
  status: string;
  lines: unknown;
  cargo_tracking_number: string | null;
  order_id: string | null;
}

export interface TrendyolFulfillmentState {
  shipmentPackageId: string;
  status: string;
  cargoTrackingNumber: string | null;
  lineCount: number;
  currency: string | null;
  /** Curierii pe care ii poate declara vanzatorul pe vitrina lui. */
  curieri: { code: string; name: string; platesteVanzatorul: boolean; nota?: string }[];
  /** Curierul deja folosit pentru acest pachet, daca se stie. */
  providerCode: string | null;
  /** AWB-ul poate fi inca trimis? Dupa expediere, Trendyol il refuza. */
  poateTrimiteAwb: boolean;
}

async function loadSideRow(admin: Db, ctx: TrendyolSyncContext, orderId: string): Promise<SideRow | null> {
  const { data } = await admin
    .from("trendyol_orders")
    .select("id, shipment_package_id, status, lines, cargo_tracking_number, order_id")
    .eq("business_id", ctx.businessId).eq("order_id", orderId).maybeSingle();
  return (data as SideRow) ?? null;
}

function packageLines(side: SideRow): { lineId: number; quantity: number }[] {
  const arr = Array.isArray(side.lines) ? side.lines : [];
  return arr
    .map((l) => {
      const o = (l ?? {}) as { lineId?: unknown; quantity?: unknown };
      const lineId = Number(o.lineId);
      const quantity = Number(o.quantity);
      if (!Number.isFinite(lineId)) return null;
      return { lineId, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1 };
    })
    .filter((x): x is { lineId: number; quantity: number } => x !== null);
}

export type FulfillOutcome = { ok: true; status: string } | { ok: false; error: string };

// Advance a Trendyol package to Picking or Invoiced and reflect it locally.
export async function setPackageStatus(
  admin: Db, ctx: TrendyolSyncContext, orderId: string,
  status: "Picking" | "Invoiced", invoiceNumber?: string,
): Promise<FulfillOutcome> {
  const side = await loadSideRow(admin, ctx, orderId);
  if (!side) return { ok: false, error: "Comanda nu are un pachet Trendyol asociat." };
  const packageId = Number(side.shipment_package_id);
  if (!Number.isFinite(packageId)) return { ok: false, error: "ID pachet Trendyol invalid." };

  const lines = packageLines(side);
  if (lines.length === 0) return { ok: false, error: "Pachetul Trendyol nu are linii de expediat." };

  const body: { lines: { lineId: number; quantity: number }[]; params?: Record<string, unknown>; status: "Picking" | "Invoiced" } = { lines, status };
  if (status === "Invoiced" && invoiceNumber) body.params = { invoiceNumber };

  const res = await updatePackage(ctx.auth, packageId, body);
  if (isTrendyolError(res)) return { ok: false, error: res.error };

  const now = new Date().toISOString();
  await admin.from("trendyol_orders")
    .update({ status, last_synced_at: now, updated_at: now } as never).eq("id", side.id);
  if (side.order_id) {
    await admin.from("orders")
      .update({ status: edinioStatusForTrendyol(status), updated_at: now } as never)
      .eq("id", side.order_id).eq("business_id", ctx.businessId);
  }
  return { ok: true, status };
}

/**
 * Trimite catre Trendyol AWB-ul facut de comerciant cu curierul lui.
 *
 * Obligatoriu pentru curierii pe care ii plateste vanzatorul. Trendyol cere ca
 * pachetul sa fie deja pe „Picking", asa ca il avansam noi daca inca nu e —
 * altfel comerciantul primea o eroare pe care nu avea cum sa o lege de nimic.
 */
export async function sendTrackingNumber(
  admin: Db, ctx: TrendyolSyncContext, orderId: string,
  input: { trackingNumber: string; providerCode: string; returnTrackingNumber?: string },
): Promise<FulfillOutcome> {
  const numar = (input.trackingNumber ?? "").trim();
  if (!numar) return { ok: false, error: "Completează numărul AWB." };
  const cod = (input.providerCode ?? "").trim();
  const curier = TRENDYOL_CARRIERS.find((c) => c.code === cod);
  if (!curier) return { ok: false, error: "Alege un curier acceptat de Trendyol." };
  if (!curier.vitrine.includes(ctx.config.storefront ?? "RO")) {
    return { ok: false, error: `Curierul ${curier.name} nu este disponibil pe vitrina aleasă.` };
  }

  const side = await loadSideRow(admin, ctx, orderId);
  if (!side) return { ok: false, error: "Comanda nu are un pachet Trendyol asociat." };
  const packageId = Number(side.shipment_package_id);
  if (!Number.isFinite(packageId)) return { ok: false, error: "ID pachet Trendyol invalid." };
  if (!poateTrimiteAwb(side.status)) {
    return { ok: false, error: "Coletul a fost deja expediat; Trendyol nu mai acceptă un AWB nou." };
  }

  // Conditia lor: pachetul trebuie sa fie pe „Picking" inainte de AWB.
  if ((side.status || "").toLowerCase() === "created" || (side.status || "").toLowerCase() === "awaiting") {
    const avans = await setPackageStatus(admin, ctx, orderId, "Picking");
    if (!avans.ok) return avans;
  }

  const res = await updateTrackingDetails(ctx.auth, packageId, {
    cargoSenderNumber: numar,
    providerCode: curier.code,
    ...(input.returnTrackingNumber?.trim() ? { returnTrackingNumber: input.returnTrackingNumber.trim() } : {}),
  });
  if (isTrendyolError(res)) return { ok: false, error: res.error };

  const now = new Date().toISOString();
  await admin.from("trendyol_orders")
    .update({ cargo_tracking_number: numar, last_synced_at: now, updated_at: now } as never).eq("id", side.id);
  if (side.order_id) {
    await admin.from("orders")
      .update({ tracking_number: numar, updated_at: now } as never)
      .eq("id", side.order_id).eq("business_id", ctx.businessId);
  }
  return { ok: true, status: "tracking" };
}

// Dupa expediere/livrare/retur, Trendyol refuza orice AWB nou.
function poateTrimiteAwb(status: string | null | undefined): boolean {
  return !["shipped", "delivered", "undelivered", "returned", "cancelled"].includes((status || "").toLowerCase());
}

export async function getFulfillmentState(admin: Db, ctx: TrendyolSyncContext, orderId: string): Promise<TrendyolFulfillmentState | null> {
  const { data } = await admin
    .from("trendyol_orders")
    .select("shipment_package_id, status, cargo_tracking_number, lines, currency")
    .eq("business_id", ctx.businessId).eq("order_id", orderId).maybeSingle();
  if (!data) return null;
  const row = data as { shipment_package_id: string; status: string; cargo_tracking_number: string | null; lines: unknown; currency: string | null };
  return {
    shipmentPackageId: row.shipment_package_id,
    status: row.status,
    cargoTrackingNumber: row.cargo_tracking_number,
    lineCount: Array.isArray(row.lines) ? row.lines.length : 0,
    currency: row.currency,
    curieri: curieriVitrina(ctx.config.storefront).map((c) => ({
      code: c.code, name: c.name, platesteVanzatorul: c.platesteVanzatorul, nota: c.nota,
    })),
    providerCode: ctx.config.default_carrier_code ?? null,
    poateTrimiteAwb: poateTrimiteAwb(row.status),
  };
}
