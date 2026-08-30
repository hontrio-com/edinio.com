// Shared (non-"use server") helpers for abandoned-cart capture & recovery.
// Lives outside the actions file so order creation can reuse markCartConverted
// with the admin client already in its scope.

import { construiesteTrepte, pretPeTrepte } from "@/lib/storefront/quantity-tiers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { hasVariants } from "@/lib/storefront/variants";
import { normalizeazaCantitate } from "@/lib/orders/quantity";

export interface AbandonedCartItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string | null;
}

export interface AbandonedProduct {
  name: string;
  quantity: number;
  value: number;
  carts: number;
  image_url: string | null;
}

export interface AbandonedCartRow {
  id: string;
  customer_name: string | null;
  email: string | null;
  phone: string | null;
  items: AbandonedCartItem[];
  item_count: number;
  subtotal: number;
  source: string;
  last_activity_at: string;
  created_at: string;
  recovery_email_sent_at: string | null;
  recovery_sms_sent_at: string | null;
  recovery_count: number;
}

export interface AbandonedCartsData {
  enabled: boolean;
  smsoEnabled: boolean;
  // SMS recovery is available if EITHER SMSO or notice.ro (abandoned-cart) is configured.
  smsEnabled: boolean;
  storeUrl: string;
  storeName: string;
  primaryColor: string;
  kpis: {
    abandonedCount: number;
    abandonedValue: number;
    avgCartValue: number;
    abandonRate: number;
    recoveredCount: number;
    recoveredValue: number;
  };
  potentialRevenueThisMonth: number;
  abandonedProducts: AbandonedProduct[];
  carts: AbandonedCartRow[];
  automation: AbandonedAutomationConfig;
  isPremium: boolean;
  discounts: { code: string; type: string; value: number }[];
}

// How long without activity before an open cart is considered "abandoned".
export const ABANDON_MINUTES = 60;

// ── Repretuirea unui cos salvat ────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Randul din catalog al unui produs dintr-un cos salvat. */
export interface ProdusCosSalvat {
  id: string;
  name: string;
  price: number | null;
  images: unknown;
  is_active: boolean | null;
  page_sections: unknown;
}

/**
 * Liniile unui cos salvat, aduse la zi din catalog.
 *
 * REGULA SE SCRIE AICI SI NUMAI AICI, fiindca are trei consumatori care trebuie
 * sa spuna acelasi lucru: linkul „recupereaza cosul", emailul de recuperare
 * trimis manual din panou si cel trimis de cron. Pana pe 2026-08-04 doar linkul
 * repretuia; cele doua emailuri randau `items` si `subtotal` exact asa cum
 * fusesera inghetate in localStorage la captura. Masurat in productie in ziua
 * aceea: 33 din 129 de linii salvate tineau alt pret decat catalogul, si 2
 * emailuri plecasera deja cu asemenea linii. (Cifra e pe TOATE liniile salvate,
 * ceea ce e potrivit aici: emailul le randeaza pe toate, si pe cele venite din
 * formularul de comanda. Pentru defectul de AFISARE din cos, populatia e alta —
 * vezi `CartPieces`.) Un email semnat de magazin care
 * promite un pret pe care magazinul nu-l mai onoreaza e mai rau decat niciun
 * email.
 *
 * O linie DISPARE cand produsul nu mai e in catalog, e dezactivat, sau are
 * variante. Nu e o alegere de afisare, ci consecinta: exact astea sunt liniile pe
 * care linkul de recuperare nu le mai poate pune inapoi in cos (produsul cu
 * variante n-are marimea salvata nicaieri — 0 din cele 129 de linii din productie
 * poarta vreuna). Daca emailul le-ar lista, clientul ar da clic si ar ajunge pe
 * un cos care nu contine ce i s-a promis. In productie asta goleste 6 cosuri din
 * 96, adica exact cele care oricum nu se pot recupera.
 */
/** Pretul unitar cu treptele aplicate, in unitatea in care emailul inmulteste. */
function pretEfectiv(p: ProdusCosSalvat, cantitate: number): number {
  const unitar = round2(Number(p.price) || 0);
  const trepte = construiesteTrepte((p.page_sections as { quantity_tiers?: unknown } | null)?.quantity_tiers, unitar);
  return pretPeTrepte(trepte, cantitate, unitar).subtotal / cantitate;
}

export function liniiRecuperabile(
  salvate: AbandonedCartItem[],
  catalog: Map<string, ProdusCosSalvat>,
): AbandonedCartItem[] {
  const out: AbandonedCartItem[] = [];
  for (const it of salvate ?? []) {
    const p = it && catalog.get(it.product_id);
    if (!p || !p.is_active) continue;
    if (hasVariants(p.page_sections)) continue;
    out.push({
      product_id: p.id,
      // Si numele, si poza vin din catalog: daca produsul a fost redenumit intre
      // timp, emailul trebuie sa spuna ce va gasi clientul in cos, nu ce scria
      // acolo acum trei saptamani.
      name: p.name,
      /*
       * Pretul purtat e cel EFECTIV, cu treptele de cantitate aplicate.
       *
       * Emailul randeaza `price * quantity`, iar cosul in care aterizeaza
       * clientul dupa clic trece prin `pretPeTrepte`. Scris cu pretul de baza,
       * emailul promitea 3 x 40 = 120 lei pentru un cos care arata 108 — si asta
       * pe 17 cosuri din productie care erau CORECTE inainte, cu 100,52 lei
       * supraevaluati in total. Un email semnat de magazin care cere mai mult
       * decat cosul e a doua fata a aceleiasi minciuni pe care o repara
       * constatarea asta.
       *
       * Se imparte inapoi la cantitate fiindca asta e unitatea in care emailul
       * inmulteste; `pretPeTrepte` lasa dinadins pretul unitar nerotunjit, ca
       * `pret x cantitate` sa dea exact subtotalul (vezi constatarea 15).
       */
      price: pretEfectiv(p, normalizeazaCantitate(it.quantity)),
      quantity: normalizeazaCantitate(it.quantity),
      image_url: (Array.isArray(p.images) && p.images.length ? (p.images[0] as string) : it.image_url) ?? null,
    });
  }
  return out;
}

/**
 * Cat face cosul repretuit — aceeasi suma pe care o va vedea clientul in cos,
 * fiindca liniile poarta pretul cu treptele deja aplicate.
 */
export function totalCosRecuperabil(items: AbandonedCartItem[]): number {
  return round2((items ?? []).reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0));
}

/**
 * Cosul salvat, adus la zi din catalog: liniile care se mai pot cumpara si cat
 * fac ele azi.
 *
 * Primeste clientul ca parametru, ca `markCartConverted`, ca sa poata fi chemat
 * si dintr-o actiune „use server", si din ruta de cron.
 *
 * `items` gol inseamna „nu mai e nimic de recuperat": apelantul NU trebuie sa
 * trimita un email pe cosul asta.
 */
export async function cosRecuperabil(
  client: SupabaseClient<Database>,
  businessId: string,
  salvate: AbandonedCartItem[],
): Promise<{ items: AbandonedCartItem[]; total: number }> {
  const ids = [...new Set((salvate ?? []).map((i) => i?.product_id).filter(Boolean))];
  if (ids.length === 0) return { items: [], total: 0 };

  const { data } = await client
    .from("products")
    .select("id, name, price, images, is_active, page_sections")
    .eq("business_id", businessId)
    .in("id", ids);

  const catalog = new Map<string, ProdusCosSalvat>((data ?? []).map((p) => [p.id, p as ProdusCosSalvat]));
  const items = liniiRecuperabile(salvate, catalog);
  return { items, total: totalCosRecuperabil(items) };
}

// Called from order creation (admin client in scope): when an order is placed,
// close any matching open cart so it leaves the "abandoned" set — and counts as
// recovered if a recovery message had been sent. Never throws.
export async function markCartConverted(
  admin: SupabaseClient<Database>,
  businessId: string,
  match: { sessionId?: string | null; email?: string | null; phone?: string | null; orderId: string },
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const patch = { status: "converted", order_id: match.orderId, converted_at: now, updated_at: now };

    let q = admin
      .from("abandoned_carts")
      .update(patch)
      .eq("business_id", businessId)
      .eq("status", "open");

    if (match.sessionId) {
      q = q.eq("session_id", match.sessionId);
    } else if (match.phone) {
      q = q.eq("phone", match.phone);
    } else if (match.email) {
      q = q.eq("email", match.email);
    } else {
      return; // nothing to match on
    }
    await q;
  } catch {
    // Recovery bookkeeping must never break an order.
  }
}

// Standard recovery message templates (with {nume}/{magazin} placeholders that are
// filled in per customer). Shown pre-filled in the UI so the merchant sees exactly
// what will be sent, and editable.
export const STANDARD_SMS_TEMPLATE = "Salut {nume}! Ai uitat produse in cosul tau la {magazin}. Finalizeaza comanda mai jos.";
export const STANDARD_EMAIL_TEMPLATE = "Buna {nume}! Ai lasat cateva produse in cosul tau la {magazin}. Le-am pastrat pentru tine, finalizeaza comanda inainte sa se epuizeze.";

export function standardRecoveryTemplate(channel: RecoveryChannel): string {
  return channel === "sms" ? STANDARD_SMS_TEMPLATE : STANDARD_EMAIL_TEMPLATE;
}

// Fill {nume}/{magazin} and tidy up spacing/punctuation if the name is empty.
export function interpolateRecoveryMessage(tpl: string, opts: { name?: string | null; store: string }): string {
  const first = opts.name?.trim().split(/\s+/)[0] ?? "";
  return tpl
    .replace(/\{nume\}/gi, first)
    .replace(/\{magazin\}/gi, opts.store)
    .replace(/\s+([!,.?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Default recovery SMS body (editable by the merchant before sending).
export function defaultRecoverySms(opts: { name?: string | null; storeName: string; url: string; code?: string | null }): string {
  const first = opts.name?.trim().split(/\s+/)[0];
  const hi = first ? `Salut ${first}! ` : "Salut! ";
  const codePart = opts.code ? ` Foloseste codul ${opts.code} pentru reducere.` : "";
  return `${hi}Ai uitat produse in cosul tau la ${opts.storeName}.${codePart} Finalizeaza comanda aici: ${opts.url}`;
}

// ── Automations ────────────────────────────────────────────────────────────────
export type RecoveryChannel = "email" | "sms";

export interface AbandonedAutomationStep {
  id: string;
  delay_hours: number;
  channel: RecoveryChannel;
  message?: string;
  discount_code?: string;
}

export interface AbandonedAutomationConfig {
  enabled: boolean;
  min_cart_value: number | null;
  quiet_hours: { start: number; end: number } | null; // hours 0-23
  steps: AbandonedAutomationStep[];
}

// Parse + sanitize a raw automation config from store_settings.
export function readAutomationConfig(raw: unknown): AbandonedAutomationConfig {
  const c = (raw ?? {}) as Partial<AbandonedAutomationConfig>;
  const steps = Array.isArray(c.steps) ? c.steps : [];
  const qh = c.quiet_hours;
  return {
    enabled: c.enabled === true,
    min_cart_value: typeof c.min_cart_value === "number" && c.min_cart_value > 0 ? c.min_cart_value : null,
    quiet_hours: qh && typeof qh.start === "number" && typeof qh.end === "number"
      ? { start: clampHour(qh.start), end: clampHour(qh.end) } : null,
    steps: steps
      .filter((s): s is AbandonedAutomationStep => !!s && (s.channel === "email" || s.channel === "sms"))
      .map((s) => ({
        id: String(s.id ?? Math.random().toString(36).slice(2)),
        delay_hours: Math.max(0, Number(s.delay_hours) || 0),
        channel: s.channel,
        message: typeof s.message === "string" && s.message.trim() ? s.message.trim() : undefined,
        discount_code: typeof s.discount_code === "string" && s.discount_code.trim() ? s.discount_code.trim() : undefined,
      })),
  };
}

function clampHour(h: number): number {
  return Math.min(23, Math.max(0, Math.floor(h)));
}

// Is `hour` within quiet hours? Handles ranges that wrap past midnight.
export function isQuietHour(quiet: { start: number; end: number } | null, hour: number): boolean {
  if (!quiet || quiet.start === quiet.end) return false;
  return quiet.start < quiet.end
    ? hour >= quiet.start && hour < quiet.end
    : hour >= quiet.start || hour < quiet.end;
}

// Build the "restore cart" link: opening it rebuilds the customer's cart and
// jumps to checkout (handled on the storefront), optionally pre-applying a code.
export function buildRecoverUrl(storeUrl: string, cartId: string, discountCode?: string | null): string {
  try {
    const u = new URL(storeUrl);
    u.searchParams.set("recover", cartId);
    if (discountCode) u.searchParams.set("code", discountCode);
    return u.toString();
  } catch {
    const sep = storeUrl.includes("?") ? "&" : "?";
    return `${storeUrl}${sep}recover=${encodeURIComponent(cartId)}${discountCode ? `&code=${encodeURIComponent(discountCode)}` : ""}`;
  }
}
