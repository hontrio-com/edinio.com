import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  handleProductMasterStatus, handleStockUpdated, readSignatureHeader, verifyAboutYouSignature,
} from "@/lib/aboutyou/webhooks";
import { extractOrderNumber, ingestOrderByNumber } from "@/lib/aboutyou/orders";
import type { AboutYouConfig } from "@/lib/aboutyou/types";

/**
 * About You signed webhook. Registered per merchant with `?businessId=…`, so we
 * load the right signing secret. The HMAC signature is verified over the exact raw
 * body BEFORE any DB write; unverified events are logged and ignored. Always
 * answers 200 so About You does not retry-storm (it retries hourly for up to 2
 * days). Order events are handled starting in Faza 3.
 */
export async function POST(request: NextRequest) {
  const ok = () => NextResponse.json({ received: true });
  const businessId = request.nextUrl.searchParams.get("businessId");
  const rawBody = await request.text();
  if (!businessId) return ok();

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: settings } = await admin
    .from("store_settings").select("aboutyou_config").eq("business_id", businessId).single();
  const cfg = settings?.aboutyou_config as AboutYouConfig | null;
  if (!cfg?.webhook_secret) return ok();

  /*
   * DOUA INCUIETORI, pentru ca prima nu e sigura.
   *
   * Schema de semnatura a lui About You nu e publicata nicaieri: antetul si
   * algoritmul din `verifyAboutYouSignature` sunt DEDUSE. Daca sunt gresite,
   * verificarea pica mereu si ruta nu ar avea nicio aparare reala — sau, mai rau,
   * cineva ar putea fi tentat sa o scoata ca „sa mearga".
   *
   * De aceea adaugam un secret propriu in chiar URL-ul cu care ne abonam
   * (`?token=`). El nu depinde de nimic ce trebuie ghicit: doar About You il
   * cunoaste, pentru ca doar lui i l-am dat. Cand tokenul e prezent si corect,
   * evenimentul e autentic chiar daca semnatura nu se poate verifica.
   */
  const token = request.nextUrl.searchParams.get("token");
  const tokenOk = !!cfg.webhook_token && !!token && egalConstant(token, cfg.webhook_token);
  const semnaturaOk = verifyAboutYouSignature(cfg.webhook_secret, readSignatureHeader(request.headers), rawBody);
  if (!tokenOk && !semnaturaOk) {
    console.error("[aboutyou/webhook] eveniment neautentificat", { businessId, areToken: !!token });
    return ok();
  }

  let event: { event?: string; type?: string; data?: unknown; message?: unknown };
  try { event = JSON.parse(rawBody); } catch { return ok(); }
  const name = event.event ?? event.type;
  const ctx = cfg.api_key
    ? { auth: { apiKey: cfg.api_key, environment: cfg.environment }, config: cfg, businessId }
    : null;

  if (name === "stock.updated") {
    await handleStockUpdated(admin, businessId, event);
  } else if (name === "product_master.status_updated") {
    // Singura cale prin care motivele de respingere ajung la noi fara sa mai
    // intrebam: `GET /products/` nu le contine deloc.
    await handleProductMasterStatus(admin, businessId, event);
  } else if (name && name.startsWith("order") && ctx) {
    const orderNumber = extractOrderNumber(event);
    if (orderNumber) {
      await ingestOrderByNumber(admin, ctx, orderNumber);
    } else {
      /*
       * Evenimentele `order_items.*` NU poarta numarul comenzii: sarcina lor e un
       * `GetShipmentSchema` — `{items, carrier_key, tracking_key,
       * return_tracking_key}`. Codul cauta `order_number`, nu-l gasea si iesea
       * tacut, deci expedierile si retururile pe articole nu ajungeau niciodata.
       * Comanda o gasim dupa id-urile articolelor, pe care le avem deja salvate.
       */
      const numar = await orderNumberDinArticole(admin, businessId, event);
      if (numar) await ingestOrderByNumber(admin, ctx, numar);
    }
  }

  return ok();
}

// Comparatie in timp constant: o comparatie obisnuita se opreste la prima
// diferenta, deci scurgerea de timp lasa tokenul sa fie ghicit caracter cu caracter.
function egalConstant(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  try { return timingSafeEqual(x, y); } catch { return false; }
}

async function orderNumberDinArticole(
  admin: SupabaseClient<Database>, businessId: string, event: unknown,
): Promise<string | null> {
  const e = (event ?? {}) as Record<string, unknown>;
  const msg = (e.message ?? e.data) as Record<string, unknown> | undefined;
  const items = Array.isArray(msg?.items) ? (msg.items as unknown[]) : [];
  const ids = items
    .map((it) => (typeof it === "number" ? it : (it as { id?: number })?.id))
    .filter((x): x is number => typeof x === "number");
  if (ids.length === 0) return null;

  const { data } = await admin
    .from("aboutyou_orders").select("aboutyou_order_number, items")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(200);
  for (const row of (data ?? []) as { aboutyou_order_number: string; items: unknown }[]) {
    const ale = Array.isArray(row.items) ? (row.items as { order_item_id?: number }[]) : [];
    if (ale.some((i) => typeof i.order_item_id === "number" && ids.includes(i.order_item_id))) {
      return row.aboutyou_order_number;
    }
  }
  return null;
}
