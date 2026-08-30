"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import {
  isOfferType, parseOfferTrigger, parseOfferConfig, parseOfferDisplay, PHASE1_OFFER_TYPES,
  type OfferType, type OfferTrigger, type OfferConfig, type OfferDisplay, type ResolvedOffer,
} from "@/lib/offers/offer.types";
import { resolveCartOffers } from "@/lib/offers/offers";
import { idsDeAfisare, scrieStatisticiOferte } from "@/lib/offers/statistici";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function ownsBusiness(supabase: ServerClient, businessId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", userId).single();
  return !!data;
}

export interface OfferFormData {
  type: OfferType;
  name: string;
  is_active: boolean;
  priority: number;
  trigger: unknown; // sanitized server-side before storage
  config: unknown;
  display: unknown;
  starts_at?: string | null;
  ends_at?: string | null;
}

// A fully-parsed offer, ready for the dashboard UI.
export interface OfferRow {
  id: string;
  type: OfferType;
  name: string;
  is_active: boolean;
  priority: number;
  trigger: OfferTrigger;
  config: OfferConfig;
  display: OfferDisplay;
  starts_at: string | null;
  ends_at: string | null;
  impressions: number;
  conversions: number;
  revenue_added: number;
  created_at: string;
  updated_at: string;
}

// Sanitize form input into clean, storable values — raw client jsonb is NEVER stored.
function sanitizeWrite(data: OfferFormData): {
  name: string; is_active: boolean; priority: number;
  trigger: OfferTrigger; config: OfferConfig; display: OfferDisplay;
  starts_at: string | null; ends_at: string | null;
} {
  return {
    name: data.name.trim(),
    is_active: data.is_active !== false,
    priority: Number.isFinite(Number(data.priority)) ? Math.trunc(Number(data.priority)) : 0,
    trigger: parseOfferTrigger(data.trigger),
    config: parseOfferConfig(data.config),
    display: parseOfferDisplay(data.display, data.type),
    starts_at: data.starts_at || null,
    ends_at: data.ends_at || null,
  };
}

// Faza 1: an offer must offer at least one product (or auto-pick by category for cross_sell).
function validateOffer(data: OfferFormData): string | null {
  if (!isOfferType(data.type)) return "Tip de oferta invalid.";
  if (!data.name.trim()) return "Oferta are nevoie de un nume.";
  if (PHASE1_OFFER_TYPES.includes(data.type)) {
    const cfg = parseOfferConfig(data.config);
    const hasProducts = cfg.productIds.length > 0;
    const autoCat = data.type === "cross_sell" && cfg.autoByCategory;
    if (!hasProducts && !autoCat) return "Alege cel putin un produs pentru aceasta oferta.";
  }
  return null;
}

function toOfferRow(o: {
  id: string; type: string; name: string; is_active: boolean; priority: number;
  trigger: unknown; config: unknown; display: unknown;
  starts_at: string | null; ends_at: string | null;
  impressions: number; conversions: number; revenue_added: number;
  created_at: string; updated_at: string;
}): OfferRow {
  const type = (isOfferType(o.type) ? o.type : "cross_sell") as OfferType;
  return {
    id: o.id,
    type,
    name: o.name,
    is_active: o.is_active,
    priority: o.priority,
    trigger: parseOfferTrigger(o.trigger),
    config: parseOfferConfig(o.config),
    display: parseOfferDisplay(o.display, type),
    starts_at: o.starts_at,
    ends_at: o.ends_at,
    impressions: Number(o.impressions) || 0,
    conversions: Number(o.conversions) || 0,
    revenue_added: Number(o.revenue_added) || 0,
    created_at: o.created_at,
    updated_at: o.updated_at,
  };
}

export async function listOffers(businessId: string): Promise<OfferRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  if (!(await ownsBusiness(supabase, businessId, user.id))) return [];
  const { data } = await supabase
    .from("offers").select("*")
    .eq("business_id", businessId)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
  return (data ?? []).map(toOfferRow);
}

export async function getOffer(offerId: string, businessId: string): Promise<OfferRow | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (!(await ownsBusiness(supabase, businessId, user.id))) return null;
  const { data } = await supabase
    .from("offers").select("*").eq("id", offerId).eq("business_id", businessId).single();
  return data ? toOfferRow(data) : null;
}

export async function createOffer(
  businessId: string, data: OfferFormData,
): Promise<{ success: true; id: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownsBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };
  const invalid = validateOffer(data);
  if (invalid) return { error: invalid };

  const w = sanitizeWrite(data);
  const { data: created, error } = await supabase
    .from("offers")
    .insert({
      business_id: businessId,
      type: data.type,
      name: w.name,
      is_active: w.is_active,
      priority: w.priority,
      trigger: w.trigger as never,
      config: w.config as never,
      display: w.display as never,
      starts_at: w.starts_at,
      ends_at: w.ends_at,
    })
    .select("id")
    .single();
  if (error) {
    logError({ action: "createOffer", message: error.message, details: { code: error.code, businessId }, userId: user.id });
    return { error: "Eroare la salvarea ofertei. Incearca din nou." };
  }
  revalidatePath("/dashboard/offers");
  return { success: true, id: (created as { id: string }).id };
}

export async function updateOffer(
  offerId: string, businessId: string, data: OfferFormData,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownsBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };
  const invalid = validateOffer(data);
  if (invalid) return { error: invalid };

  const w = sanitizeWrite(data);
  const { error } = await supabase
    .from("offers")
    .update({
      type: data.type,
      name: w.name,
      is_active: w.is_active,
      priority: w.priority,
      trigger: w.trigger as never,
      config: w.config as never,
      display: w.display as never,
      starts_at: w.starts_at,
      ends_at: w.ends_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", offerId)
    .eq("business_id", businessId);
  if (error) {
    logError({ action: "updateOffer", message: error.message, details: { code: error.code, offerId, businessId }, userId: user.id });
    return { error: "Eroare la salvarea ofertei. Incearca din nou." };
  }
  revalidatePath("/dashboard/offers");
  revalidatePath(`/dashboard/offers/${offerId}`);
  return { success: true };
}

export async function toggleOffer(
  offerId: string, businessId: string, isActive: boolean,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownsBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };
  const { error } = await supabase
    .from("offers")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", offerId).eq("business_id", businessId);
  if (error) {
    logError({ action: "toggleOffer", message: error.message, details: { code: error.code, offerId, businessId }, userId: user.id });
    return { error: "Eroare la actualizarea ofertei." };
  }
  revalidatePath("/dashboard/offers");
  return { success: true };
}

export async function deleteOffer(
  offerId: string, businessId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownsBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };
  const { error } = await supabase
    .from("offers").delete().eq("id", offerId).eq("business_id", businessId);
  if (error) {
    logError({ action: "deleteOffer", message: error.message, details: { code: error.code, offerId, businessId }, userId: user.id });
    return { error: "Eroare la stergerea ofertei." };
  }
  revalidatePath("/dashboard/offers");
  return { success: true };
}

/**
 * AFISARILE ofertelor de pe pagina de produs, numarate din BROWSER.
 *
 * De ce nu la randare, in `resolveProductOffers`: pagina de produs se randeaza
 * la fiecare cerere (`headers()` o face dinamica), iar `next/link` o cere si la
 * simpla trecere cu mausul peste un card din catalog. Un contor crescut acolo ar
 * fi numarat preincarcarile si crawlerele ca pe niste clienti, si ar fi pus o
 * scriere in baza pe drumul critic al FIECAREI incarcari de pagina, la toate
 * magazinele — inclusiv la cele fara nicio oferta. Din browser se numara doar ce
 * a ajuns intr-adevar pe un ecran, si numai magazinele care chiar au oferte
 * platesc ceva (azi: 2 magazine publicate, 9 oferte).
 *
 * Cale publica si anonima, deci: limita pe IP, plafon pe cate id-uri se pot
 * revendica dintr-o data (`idsDeAfisare`) si verificarea ca ofertele apartin
 * magazinului — altfel oricine putea umfla contorul altui comerciant. Nu
 * intoarce nimic si nu arunca niciodata: apelantul e o pagina de magazin.
 */
export async function recordOfferImpressions(businessId: string, offerIds: string[]): Promise<void> {
  try {
    if (!businessId) return;
    const ids = idsDeAfisare(offerIds);
    if (ids.length === 0) return;

    // Un magazin adevarat trimite o cerere pe incarcare de pagina. Pragul lasa
    // loc navigarii normale (produs dupa produs) si taie doar bucatile.
    const ip = clientIpFromHeaders(await headers());
    if (!rateLimit(`recordOfferImpressions:${ip}`, 60, 60_000)) return;

    const admin = createAdminClient();
    // Ofertele revendicate trebuie sa fie CHIAR ale magazinului: id-ul unei
    // oferte ajunge in browser (`ResolvedOffer.id`), deci fara filtrul asta
    // contorul unui magazin s-ar putea umfla de pe pagina altuia.
    const { data } = await admin
      .from("offers").select("id").eq("business_id", businessId).in("id", ids);
    const aleMagazinului = (data ?? []).map((o) => o.id);
    if (aleMagazinului.length === 0) return;

    await scrieStatisticiOferte(admin, aleMagazinului.map((id) => ({ offerId: id, impressions: 1 })));
  } catch {
    // statistica e best-effort
  }
}

/**
 * Storefront: order-bump offers applicable to the current cart, for the checkout
 * modals. Public (anonymous customers) — reads via the admin client since offers are
 * owner-only. Returns only display data (products + special price), all public info.
 */
export async function getCheckoutBumps(businessId: string, cartProductIds: string[]): Promise<ResolvedOffer[]> {
  if (!businessId || !Array.isArray(cartProductIds)) return [];
  const ids = cartProductIds.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (ids.length === 0) return [];
  const admin = createAdminClient();
  /*
   * Afisarile NU se numara aici.
   *
   * Actiunea se re-cheama la fiecare schimbare a cosului si la fiecare
   * redeschidere a formularului — masurat: doua cereri la o singura deschidere
   * cand cosul s-a schimbat intre timp, plus cate una la fiecare linie adaugata
   * sau stearsa. Numarate aici, cele trei suprafete n-ar mai fi comparabile intre
   * ele in acelasi contor: pagina de produs numara o singura data pe incarcare,
   * prin baliza din browser, iar rata de acceptare a bump-urilor ar fi iesit de
   * cateva ori mai mica decat cea adevarata. Balizele browserului le numara pe
   * toate trei la fel.
   */
  return resolveCartOffers(admin, businessId, ids, "checkout");
}

/**
 * Storefront: cross-sell recommendations for the cart drawer ("S-ar putea sa-ti placa").
 * Public — reads via the admin client (offers are owner-only). Pure recommendation,
 * no discount, so nothing here touches the order path.
 */
export async function getCartCrossSell(businessId: string, cartProductIds: string[]): Promise<ResolvedOffer[]> {
  if (!businessId || !Array.isArray(cartProductIds)) return [];
  const ids = cartProductIds.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (ids.length === 0) return [];
  const admin = createAdminClient();
  // Ca mai sus: afisarea se numara din browser, o singura data, prin aceeasi
  // baliza ca pe pagina de produs. In plus, aici oferta poate desena ecran gol —
  // `CartRecommendations` arunca produsele epuizate si nu mai randeaza nimic —
  // deci numarata pe server ar fi contorizat o afisare care nu s-a vazut.
  return resolveCartOffers(admin, businessId, ids, "cart");
}

