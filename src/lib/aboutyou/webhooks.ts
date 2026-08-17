// About You webhook helpers: subscription event set, signature verification, and
// event handlers. About You returns a `client_secret` when a subscription is
// created; events are signed with it.
//
// SEMNATURA NU E CONFIRMATA. Documentatia About You nu publica nici antetul, nici
// algoritmul; presupunerea de mai jos (HMAC-SHA256 peste corpul brut, in hex) e
// dedusa, nu citita. Pana la confirmare, un eveniment care nu trece verificarea
// este logat si IGNORAT — nu actionam niciodata pe date neverificate.
//
// CONSECINTA, de stiut inainte de a te baza pe webhookuri: daca schema difera,
// TOATE evenimentele cad tacut. Plasa de siguranta e cronul, care intreaba direct
// `GET /orders/` si aduce comenzile oricum, cu o intarziere de pana la un minut.

import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// Subscribe to the full set now so the merchant does not re-subscribe later; order
// events are handled starting in Faza 3.
export const ABOUTYOU_WEBHOOK_EVENTS = [
  "order.created", "order.updated", "order.cancelled", "order.shipped", "order.returned",
  "order_items.shipped", "order_items.cancelled", "order_items.returned",
  "stock.updated", "product_master.status_updated",
];

const SIGNATURE_HEADERS = ["x-signature", "x-aboutyou-signature", "x-scayle-signature", "signature"];

export function readSignatureHeader(headers: Headers): string | null {
  for (const h of SIGNATURE_HEADERS) {
    const v = headers.get(h);
    if (v) return v;
  }
  return null;
}

export function verifyAboutYouSignature(secret: string | undefined | null, signatureHeader: string | null, rawBody: string): boolean {
  if (!secret || !signatureHeader) return false;
  const hex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const candidates = [hex, `sha256=${hex}`];
  return signatureHeader
    .split(/[\s,]+/)
    .filter(Boolean)
    .some((sig) => candidates.some((exp) => {
      const a = Buffer.from(sig);
      const b = Buffer.from(exp);
      if (a.length !== b.length) return false;
      try { return timingSafeEqual(a, b); } catch { return false; }
    }));
}

/*
 * stock.updated: aducem starea de stoc de la About You pe variantele locale.
 *
 * Plicul e `{id, event, timestamp, message, subscription_id}`, iar la evenimentul
 * asta `message` e o LISTA de `{sku, quantity, quantity_fbm}` — nu un obiect.
 * Codul citea `data.sku` de pe un obiect: pe o lista, `sku` e mereu `undefined`,
 * deci fiecare eveniment se pierdea in tacere.
 */
export async function handleStockUpdated(
  admin: SupabaseClient<Database>, businessId: string, payload: unknown,
): Promise<void> {
  const root = (payload ?? {}) as Record<string, unknown>;
  const brut = root.message ?? root.data ?? root;
  const linii = (Array.isArray(brut) ? brut : [brut]) as Record<string, unknown>[];

  const now = new Date().toISOString();
  for (const linie of linii) {
    if (!linie || typeof linie !== "object") continue;
    const sku = typeof linie.sku === "string" ? linie.sku : undefined;
    // `quantity` e stocul din depozitul comerciantului; `quantity_fbm` e cel din
    // depozitele About You si nu ne priveste aici.
    const qtyRaw = linie.quantity ?? linie.stock;
    const qty = typeof qtyRaw === "number" ? qtyRaw : undefined;
    if (!sku || qty == null) continue;
    await admin.from("aboutyou_variants")
      .update({ quantity: Math.max(0, Math.round(qty)), updated_at: now } as never)
      .eq("business_id", businessId).eq("sku", sku);
  }
}

/*
 * product_master.status_updated: statusul si MOTIVELE respingerii.
 *
 * Evenimentul era abonat, dar aruncat fara handler. E singura cale prin care
 * motivele ajung la noi fara sa mai intrebam nimic: `GET /products/` nu le are
 * deloc in schema, iar `GET /products/rejected` inseamna inca o cerere si o
 * intarziere de pana la un minut.
 *
 * `external_reference_key` e `style_key`-ul nostru, adica id-ul produsului Edinio.
 */
export async function handleProductMasterStatus(
  admin: SupabaseClient<Database>, businessId: string, payload: unknown,
): Promise<void> {
  const root = (payload ?? {}) as Record<string, unknown>;
  const msg = (root.message ?? root.data ?? root) as Record<string, unknown>;
  const styleKey = typeof msg.external_reference_key === "string" ? msg.external_reference_key : null;
  if (!styleKey) return;

  const status = typeof msg.status === "string" ? msg.status : null;
  const motive = Array.isArray(msg.rejection_reasons) ? msg.rejection_reasons : [];
  const mesaj = typeof msg.rejection_message === "string" ? msg.rejection_message : null;
  const now = new Date().toISOString();

  /*
   * `error` are TREI cazuri, nu doua.
   *
   * Scris necondiționat, un eveniment de status fara `rejection_message` punea
   * `error: null` peste un mesaj de la ultima trimitere — un eșec de articol la
   * actualizare, de exemplu — si comerciantul rămânea convins ca totul a intrat.
   * Dar tacerea singura nu e de ajuns in celalalt sens: evenimentul de APROBARE
   * nu aduce niciun motiv, deci mesajul respingerii de dinainte ar rămâne lipit pe
   * un produs sanatos, si nimic altceva nu-l mai sterge. Deci: motiv nou -> scrie;
   * status sanatos -> goleste; altfel -> nu atinge.
   */
  /*
   * Golirea se face DOAR cand mesajul de acolo era chiar unul de respingere.
   *
   * Prima varianta golea `error` la orice status sanatos — dar in aceeasi coloana
   * scrie si `pollOpenBatches` esecurile de ARTICOL la actualizare, iar un articol
   * respins nu schimba statusul produsului: ramane `active`. Deci un eveniment de
   * status stergea mesajul unei actualizari care chiar picase, si comerciantul
   * ramanea convins ca modificarea a intrat — exact ce interzice reconcilierea.
   * Citim statusul de dinainte: doar o listare care ERA respinsa isi pierde
   * mesajul cand About You retrage respingerea.
   */
  const { data: veche } = await admin
    .from("aboutyou_listings").select("status")
    .eq("business_id", businessId).eq("style_key", styleKey).maybeSingle();
  const eraRespinsa = ["rejected", "problem"].includes((veche as { status?: string } | null)?.status ?? "");
  const eSanatos = status != null && status !== "rejected" && status !== "problem";

  await admin.from("aboutyou_listings")
    .update({
      ...(status ? { status } : {}),
      rejection_reasons: motive as never,
      ...(mesaj ? { error: mesaj } : eraRespinsa && eSanatos ? { error: null } : {}),
      last_status_at: now,
      updated_at: now,
    } as never)
    .eq("business_id", businessId).eq("style_key", styleKey);
}
