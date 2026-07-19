// Trendyol fulfillment. Unlike About You (where we push OUR courier AWB), Trendyol
// ships with its own contracted cargo: the seller only advances the shipment
// package Picking -> Invoiced. When the cargo picks it up Trendyol flips it to
// Shipped automatically and assigns the tracking number (which flows back via the
// order webhook / poll). So there is no AWB to create here — only status signalling.
//
// Flow (per Trendyol): notify Picking FIRST, then Invoiced (optional, before the
// package is handed to cargo). `params.invoiceNumber` is sent only for Invoiced.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { TrendyolSyncContext } from "./sync";
import { updatePackage, isTrendyolError } from "./client";
import { edinioStatusForTrendyol } from "./webhooks";

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
  };
}
