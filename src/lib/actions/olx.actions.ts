"use server";

import { revalidatePath } from "next/cache";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { patchOlxConfig, setOlxCategoryMapEntry } from "@/lib/olx/config";
import { invieScrisorileMoarteOlx } from "@/lib/olx/queue";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { logError } from "@/lib/error-logger";
import {
  buildAuthUrl, ensureMerchantToken, olxConfigured, signState,
} from "@/lib/olx/oauth";
import {
  advertCommand, getAccountBalance, getAdvert, getAvailablePackets, getBoughtPackets,
  getPaidFeatures, getPaymentMethods, getThreadMessages, getThreads, getUser, isOlxError,
  markThreadRead, postThreadMessage, purchaseAdvertPacket, purchaseCategoryPacket, purchasePaidFeature,
} from "@/lib/olx/client";
import {
  getOlxCategoriesCached, getOlxCategoryAttributesCached, getOlxCityDistrictsCached,
  searchOlxCities, suggestOlxCategoriesCached,
} from "@/lib/olx/categories";
import { loadOlxContext, syncProductNow, deactivateProductNow, activateProductNow, deleteAdvertNow } from "@/lib/olx/sync";
import { olxReadinessError, categoriaNuPrimesteProduse, atributeObligatoriiLipsa } from "@/lib/olx/mapping";
import type {
  OlxAttributeDef, OlxBoughtPacket, OlxCategory, OlxCategoryMapEntry, OlxCategorySuggestion,
  OlxCity, OlxConfig, OlxDistrict, OlxMessage, OlxPacket, OlxPaidFeature, OlxPaymentMethod, OlxThread,
} from "@/lib/olx/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

interface OwnBiz {
  id: string; slug: string; custom_domain: string | null; store_name: string | null; business_name: string;
}

async function ownedBusiness(supabase: ServerClient, businessId: string, userId: string): Promise<OwnBiz | null> {
  const { data } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, store_name, business_name")
    .eq("id", businessId).eq("user_id", userId).single();
  return (data as OwnBiz) ?? null;
}

/*
 * Citirea se face cu SERVICE ROLE, nu cu clientul utilizatorului.
 *
 * `privat.decripteaza_config` iese pe prima linie pentru `anon`/`authenticated`,
 * deci pe clientul utilizatorului vederea intoarce `access_token` si
 * `refresh_token` ca siruri `enc.v1.…`. La OLX asta era mai rau decat un 401:
 * `ensureMerchantToken` primea `invalid_grant` la reimprospatare si SCRIA
 * `needs_reconnect: true` in config, adica marca o conexiune sanatoasa drept
 * moarta, pe baza unui semnal fals.
 *
 * Service role ocoleste RLS, deci proprietatea magazinului TREBUIE dovedita
 * separat. Toti apelantii trec prin `guard()` inainte.
 *
 * Parametrul cu clientul utilizatorului a fost SCOS dinadins: `withToken` chiar
 * avea `admin` la indemana pe linia de deasupra si tot cu `g.supabase` citea.
 */
/*
 * ⚠ O CITIRE CAZUTA NU ARE VOIE SA ARATE CA O CONFIGURARE GOALA.
 *
 * Forma dinainte ignora `error` si intorcea `{}` cand citirea dadea gres. Iar apelantii
 * fac apoi `saveConfig(...)` cu INTREGUL obiect — deci un gol inchipuit se scria peste
 * acreditari, si integrarea se deconecta singura, fara nicio eroare nicaieri.
 *
 * S-a intamplat: 24.08.2026, un magazin cu Trendyol si 1272 de listari active a ramas
 * cu `trendyol_config = {"reconcile_page": 20}`. Comerciantul n-a atins nimic.
 *
 * ⚠ `maybeSingle`, nu `single`: un magazin FARA rand e o stare legitima (nou creat), si
 * acolo `{}` e chiar raspunsul corect. Ce nu e legitim e sa nu poti citi si sa spui gol.
 * `single` le confunda: lipsa randului iesea tot ca eroare.
 *
 * ⚠ Aruncarea e voita. Apelantii au deja ramuri de esec; un gol tacut n-are.
 */
async function loadConfig(businessId: string): Promise<OlxConfig> {
  const { data, error } = await createAdminClient()
    .from("store_settings").select("olx_config").eq("business_id", businessId).maybeSingle();
  if (error) {
    throw new Error(`Configurarea nu s-a putut citi: ${error.message}`);
  }
  return ((data?.olx_config as OlxConfig) ?? {}) || {};
}

async function saveConfig(supabase: ServerClient, businessId: string, config: OlxConfig): Promise<boolean> {
  const { data: existing } = await supabase
    .from("store_settings").select("id").eq("business_id", businessId).single();
  if (existing) {
    const { error } = await supabase.from("store_settings")
      .update({ olx_config: config as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId);
    return !error;
  }
  const { error } = await supabase.from("store_settings")
    .insert({ business_id: businessId, olx_config: config as never });
  return !error;
}

// Auth guard shared by every action: returns the owned business or an error.
async function guard(businessId: string): Promise<{ supabase: ServerClient; userId: string; biz: OwnBiz } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const biz = await ownedBusiness(supabase, businessId, user.id);
  if (!biz) return { error: "Magazin negasit" };
  return { supabase, userId: user.id, biz };
}

const FEATURE_PATH = "/dashboard/features/olx";

// ── Status (dashboard) ────────────────────────────────────────────────────────────
export interface OlxStatus {
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  olxUserName?: string;
  advertiserType: "private" | "business";
  cityId?: number;
  cityName?: string;
  districtId?: number;
  districtName?: string;
  contactName?: string;
  contactPhone?: string;
  courierEnabled: boolean;
  autoSync: boolean;
  autoExtend: boolean;
  lastSyncAt?: string;
  categoryMap: Record<string, OlxCategoryMapEntry>;
  ready: boolean;
  readinessError: string | null;
  counts: {
    total: number; published: number; active: number; pending: number;
    limited: number; rejected: number;
    /** Lucrari VII: se pot revendica, deci chiar se misca. */
    queued: number;
    /** Scrisori moarte: `abandonat_la` scris, deci nimic nu le mai atinge fara o apasare. */
    oprite: number;
  };
}

export async function getOlxStatus(businessId: string): Promise<OlxStatus | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { supabase } = g;
  const config = await loadConfig(businessId);

  // Count-only queries (exact at any volume; avoids the 1000-row PostgREST cap).
  const rejectedStatuses = ["moderated", "blocked", "disabled", "removed_by_moderator", "error"];
  const [{ count: total }, { count: published }, { count: active }, { count: pending }, { count: limited }, { count: rejected }, { count: queued }, { count: oprite }] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("is_active", true),
    supabase.from("olx_adverts").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("olx_adverts").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "active"),
    supabase.from("olx_adverts").select("id", { count: "exact", head: true }).eq("business_id", businessId).in("status", ["new", "unconfirmed", "unpaid"]),
    supabase.from("olx_adverts").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "limited"),
    supabase.from("olx_adverts").select("id", { count: "exact", head: true }).eq("business_id", businessId).in("status", rejectedStatuses),
    /*
     * ⚠ „IN COADA" SI „OPRITA" NU SUNT ACELASI LUCRU (31.08.2026).
     *
     * Numarul lua toate randurile, iar ecranul arata pentru el o rotita si textul „Se publică N
     * produse pe OLX…", cu reimprospatare din cinci in cinci secunde. Peste scrisori moarte, alea
     * se invart la nesfarsit deasupra unei cozi in care nu se mai misca NIMIC — adica ecranul
     * minte, cu cea mai linistitoare fata cu putinta.
     */
    supabase.from("olx_sync_queue").select("id", { count: "exact", head: true }).eq("business_id", businessId).is("abandonat_la", null),
    supabase.from("olx_sync_queue").select("id", { count: "exact", head: true }).eq("business_id", businessId).not("abandonat_la", "is", null),
  ]);

  return {
    configured: olxConfigured(),
    connected: !!config.connected && !!config.refresh_token,
    needsReconnect: config.needs_reconnect === true,
    olxUserName: config.olx_user_name,
    advertiserType: config.advertiser_type ?? "private",
    cityId: config.default_city_id,
    cityName: config.default_city_name,
    districtId: config.default_district_id ?? undefined,
    districtName: config.default_district_name ?? undefined,
    contactName: config.contact_name,
    contactPhone: config.contact_phone,
    courierEnabled: config.courier_enabled === true,
    autoSync: config.auto_sync !== false,
    autoExtend: config.auto_extend === true,
    lastSyncAt: config.last_sync_at,
    categoryMap: config.category_map ?? {},
    ready: olxReadinessError(config) === null,
    readinessError: olxReadinessError(config),
    counts: {
      total: total ?? 0, published: published ?? 0, active: active ?? 0,
      pending: pending ?? 0, limited: limited ?? 0, rejected: rejected ?? 0, queued: queued ?? 0,
      oprite: oprite ?? 0,
    },
  };
}

// ── OAuth ───────────────────────────────────────────────────────────────────────
export async function startOlxOAuth(businessId: string): Promise<{ url: string } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  if (!olxConfigured()) return { error: "Integrarea OLX nu este configurata pe server." };
  return { url: buildAuthUrl(signState(businessId)) };
}

export async function disconnectOlx(businessId: string): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { supabase } = g;
  /*
   * ═══ ⚠ DECONECTAREA MERGEA OARBA PE TREI SCRIERI (29.08.2026, noaptea) ═══
   *
   * Cea mai proasta iesire: configul NEsters, dar anunturile si coada sterse — un cont care pare
   * inca legat, fara nicio stare locala, deci nici nu mai poate trimite, nici nu mai poate retrage.
   *
   * ⚠ INTAI SE SCRIE CA E DECONECTAT, si daca asta nu intra nu se sterge nimic: cel mai rau caz
   * devine „a ramas conectat, mai incearca" — o stare intreaga, nu una pe jumatate. Aceeasi ordine
   * ca la About You.
   */
  if (!await saveConfig(supabase, businessId, {})) {
    return { error: "Nu am putut salva deconectarea. Încearcă din nou." };
  }
  const admin = createAdminClient();
  const resturi: string[] = [];
  for (const tabel of ["olx_sync_queue", "olx_adverts"] as const) {
    const { error } = await admin.from(tabel).delete().eq("business_id", businessId);
    if (error) resturi.push(`${tabel}: ${error.message}`);
  }
  if (resturi.length > 0) {
    /* ⚠ Nu opreste deconectarea — configul e deja sters, deci magazinul E deconectat — dar se
       scrie, ca resturile sa poata fi gasite. */
    logError({
      action: "olx.disconnect", severity: "warning",
      message: `magazinul e deconectat, dar au ramas randuri nesterse: ${resturi.join(" | ")}`,
      details: { businessId }, businessId,
    });
  }
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Settings ────────────────────────────────────────────────────────────────────
export interface OlxSettingsInput {
  advertiser_type?: "private" | "business";
  city_id?: number;
  city_name?: string;
  district_id?: number | null;
  district_name?: string | null;
  contact_name?: string;
  contact_phone?: string;
  courier_enabled?: boolean;
  auto_sync?: boolean;
  auto_extend?: boolean;
}

export async function saveOlxSettings(businessId: string, input: OlxSettingsInput): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(businessId);

  const next: OlxConfig = {
    /*
     * ═══ ⚠ COMENTARIUL DE MAI JOS MINTEA (30.08.2026, tarziu) ═══
     *
     * Scria „PETIC, NU CONFIG INTREG" — dar obiectul incepea cu `...config`, adica peticul purta
     * TOT ce fusese citit cu o clipa inainte, inclusiv `access_token`, `refresh_token` si
     * `token_updated_at`. `jsonb_merge_config` nu ajuta cu nimic cand peticul e configul vechi:
     *
     *     Setarile citesc: refresh R1
     *     cronul reimprospateaza: R1 -> R2
     *     omul salveaza telefonul -> peticul contine si R1
     *     -> R2 e inlocuit cu R1, iar conexiunea moare la urmatoarea reimprospatare
     *
     * ⚠ Acum peticul poarta DOAR ce a atins omul in ecranul de setari. Ce nu e aici nu se atinge.
     */
    advertiser_type: input.advertiser_type ?? config.advertiser_type ?? "private",
    default_city_id: input.city_id ?? config.default_city_id,
    default_city_name: input.city_name ?? config.default_city_name,
    /*
     * ═══ `undefined` NU STERGE NIMIC (31.08.2026) ═══
     *
     * Cand omul schimba orasul si noul oras n-are cartierul ales, ecranul trimite `district_id:
     * null`. Peticul punea atunci `undefined` — iar `JSON.stringify` scoate cheia cu totul din
     * corpul cererii, deci `jsonb_merge_config` nici n-o vede:
     *
     *     Cluj-Napoca + Mănăștur  ->  omul alege București
     *     peticul trimite doar orasul
     *     -> in baza ramane București cu ID-ul de cartier din Cluj
     *     -> anuntul pleaca la OLX cu o localizare care nu exista, sau e refuzat
     *
     * `null` se trimite si se scrie. `mapping.ts` il citeste ca lipsa (`if (config.default_...)`).
     */
    default_district_id: input.district_id === null ? null : (input.district_id ?? config.default_district_id),
    default_district_name: input.district_id === null ? null : (input.district_name ?? config.default_district_name),
    contact_name: input.contact_name?.trim() ?? config.contact_name,
    contact_phone: input.contact_phone?.trim() ?? config.contact_phone,
    courier_enabled: input.courier_enabled ?? config.courier_enabled,
    auto_sync: input.auto_sync ?? config.auto_sync,
    auto_extend: input.auto_extend ?? config.auto_extend,
  };
  try {
    await patchOlxConfig(createAdminClient(), businessId, next);
  } catch {
    return { error: "Eroare la salvare." };
  }
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Location pickers ──────────────────────────────────────────────────────────────
export async function searchCities(businessId: string, q: string): Promise<{ cities: OlxCity[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const cities = await searchOlxCities(q);
  if (cities === null) return { error: "Nu am putut incarca localitatile OLX. Reincearca." };
  return { cities };
}

export async function getCityDistricts(businessId: string, cityId: number): Promise<{ districts: OlxDistrict[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const districts = await getOlxCityDistrictsCached(cityId);
  if (districts === null) return { error: "Nu am putut incarca cartierele." };
  return { districts };
}

// ── Category mapping ──────────────────────────────────────────────────────────────
export async function getOlxCategoryChildren(businessId: string, parentId?: number): Promise<{ categories: OlxCategory[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const categories = await getOlxCategoriesCached(parentId);
  if (categories === null) return { error: "Nu am putut incarca categoriile OLX." };
  return { categories };
}

export async function suggestOlxCategory(businessId: string, q: string): Promise<{ suggestions: OlxCategorySuggestion[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const suggestions = await suggestOlxCategoriesCached(q);
  if (suggestions === null) return { error: "Nu am putut obtine sugestii." };
  return { suggestions };
}

export async function getOlxCategoryAttributes(businessId: string, categoryId: number): Promise<{ attributes: OlxAttributeDef[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const attributes = await getOlxCategoryAttributesCached(categoryId);
  if (attributes === null) return { error: "Nu am putut incarca atributele categoriei." };
  return { attributes };
}

// Save/replace the mapping for one Edinio category.
export async function saveOlxCategoryMapEntry(
  businessId: string, edinioCategory: string, entry: OlxCategoryMapEntry | null,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  /*
   * ⚠ SE VERIFICA AICI, NU NUMAI IN ECRAN. Actiunea de server e o adresa: cine n-o cheama din
   * ecran nu trece prin nicio verificare, iar pretul unei mapari stricate se plateste mai tarziu
   * si in alta parte — la publicare, cu un mesaj despre un cod de atribut care nu spune ce sa faci.
   */
  if (entry !== null) {
    const attributes = await getOlxCategoryAttributesCached(entry.category_id);
    /*
     * ⚠ Daca nu putem VERIFICA, nu SALVAM. O mapare nevalidata nu strica nimic acum, dar face
     * produsele sa taca mai tarziu — iar omul reincearca peste un minut, fara sa piarda nimic.
     */
    if (attributes === null) return { error: "Nu am putut verifica categoria la OLX. Încearcă din nou." };
    const nepotrivita = categoriaNuPrimesteProduse(attributes);
    if (nepotrivita) return { error: nepotrivita };
    const lipsa = atributeObligatoriiLipsa(attributes, entry.attributes);
    if (lipsa.length > 0) return { error: `Completează atributele obligatorii: ${lipsa.join(", ")}` };
  }
  /*
   * ⚠ NU SE MAI CITESTE HARTA CA S-O SCRIEM INAPOI. Citeste-modifica-scrie pe un obiect impartit
   * pierde maparea celeilalte file, tacut — vezi nota de la `setOlxCategoryMapEntry`. Baza schimba
   * acum exact cheia asta, sub lacatul randului.
   */
  try {
    await setOlxCategoryMapEntry(createAdminClient(), businessId, edinioCategory, entry);
  } catch {
    return { error: "Eroare la salvare." };
  }
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

/**
 * „Reincearca lucrarile oprite" — apasarea omului peste scrisorile moarte.
 *
 * O sesiune expirata omoara toata coada in cincisprezece minute (vezi `invieScrisorileMoarteOlx`).
 * Reconectarea le invie singura, dar o coada poate muri si din alte cauze trecatoare — o pana lunga
 * la ei, o limitare de o zi — si atunci omul are nevoie de o usa.
 */
export async function reincearcaOlxOprite(
  businessId: string,
): Promise<{ success: true; reluate: number } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const r = await invieScrisorileMoarteOlx(createAdminClient(), businessId);
  if (!r.ok) return { error: "Nu am putut relua lucrările oprite. Încearcă din nou." };
  revalidatePath(FEATURE_PATH);
  return { success: true, reluate: r.reluate };
}

// ── Publishing ────────────────────────────────────────────────────────────────────
export async function publishOlxProduct(businessId: string, productId: string): Promise<{ success: true; status?: string; url?: string | null } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(businessId);
  const readiness = olxReadinessError(config);
  if (readiness) return { error: readiness };

  // Actionable pre-checks so a single "Postează pe OLX" gives a clear reason
  // instead of silently doing nothing (unmapped category / inactive product).
  const { data: prod } = await g.supabase
    .from("products").select("category, is_active").eq("id", productId).eq("business_id", businessId).single();
  if (!prod) return { error: "Produs negasit." };
  if (!prod.is_active) return { error: "Produsul este inactiv. Activeaza-l ca sa il poti publica pe OLX." };
  if (!prod.category || !config.category_map?.[prod.category]) {
    return { error: "Categoria produsului nu este mapata la OLX. Mapeaz-o in Integrari > OLX." };
  }

  const admin = createAdminClient();
  const r = await loadOlxContext(admin, businessId);
  if (r.stare !== "gata") {
    /*
     * ⚠ Cele trei feluri de „nu acum" nu se spun la fel: unul cere o apasare pe „Conectează",
     * altul cere doar rabdare. Spuse la fel, omul reconecteaza degeaba un cont sanatos.
     */
    return {
      error: r.stare === "deconectat"
        ? "Contul OLX nu este conectat. Conectează-l din Integrări > OLX."
        : r.stare === "cere-reconectare"
          ? "Sesiunea OLX a expirat. Reconectează contul OLX."
          : "OLX nu răspunde acum. Încearcă din nou peste câteva minute.",
    };
  }
  const ctx = r.ctx;

  /*
   * ⚠ APASAREA ASTA E CHIAR IESIREA DIN „STERS DE OM". Stergerea unui anunt lasa o urma tocmai ca
   * sincronizarea sa nu-l recreeze singura la prima editare de pret; dar cand omul cere el
   * publicarea, urma nu mai are ce pazi — ar bloca chiar butonul facut ca sa se razgandeasca.
   *
   * ⚠ SE STERGE INAINTE de trimitere: lasata, `syncProductNow` ar iesi `skipped` si comerciantul
   * ar apasa degeaba, fara sa afle de ce.
   */
  const { error: eUrma } = await admin.from("olx_adverts")
    .update({ sters_de_om_la: null } as never)
    .eq("business_id", businessId).eq("offer_id", productId)
    .not("sters_de_om_la", "is", null);
  if (eUrma) return { error: "Nu am putut porni publicarea. Incearca din nou." };

  const res = await syncProductNow(admin, ctx, businessId, productId);
  if (!res.ok) {
    logError({ action: "olx.publishProduct", message: res.error, details: { businessId, productId }, businessId, userId: g.userId });
    return { error: res.error };
  }
  revalidatePath(FEATURE_PATH);
  revalidatePath("/dashboard/products");
  return { success: true, status: res.status, url: res.url ?? null };
}

// Bulk publish a specific set of products (from the Products list). Enqueues the
// ones that are active AND have a mapped category; reports the rest as skipped.
export async function publishProductsToOlx(
  businessId: string, productIds: string[],
): Promise<{ queued: number; skipped: number } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(businessId);
  const readiness = olxReadinessError(config);
  if (readiness) return { error: readiness };
  const mapped = new Set(Object.keys(config.category_map ?? {}));
  if (mapped.size === 0) return { error: "Mapeaza mai intai cel putin o categorie la OLX (Integrari > OLX)." };

  /*
   * ⚠ Aici era `.slice(0, 1000)`, adica o TAIERE TACUTA. Cu 3351 de produse
   * selectate (eSAFE, azi), 2351 dispareau fara ca nimeni sa afle, iar mesajul
   * de la final spunea „1000 trimise la OLX" — un numar adevarat despre o
   * lucrare pe jumatate facuta. Si cele 1000 ramase cadeau oricum: `.in()` e
   * respins peste ~650 de id-uri (vezi `id-chunks.ts`).
   *
   * Acum nu se mai taie nimic; citirea merge pe bucati, iar coada era deja
   * scrisa pe bucati mai jos.
   */
  const ids = [...new Set((productIds ?? []).filter(Boolean))];
  if (ids.length === 0) return { error: "Niciun produs selectat." };

  const prods: { id: string; category: string | null; is_active: boolean }[] = [];
  for (const bucata of bucatiDeIduri(ids)) {
    const { data } = await g.supabase
      .from("products").select("id, category, is_active").eq("business_id", businessId).in("id", bucata);
    prods.push(...((data ?? []) as typeof prods));
  }
  const rows = prods
    .filter((p) => p.is_active && p.category && mapped.has(p.category as string))
    .map((p) => ({ business_id: businessId, product_id: p.id, offer_id: p.id, op: "upsert" as const }));

  if (rows.length > 0) {
    const admin = createAdminClient();
    /*
     * ═══ ⚠ SELECTIA ANUME E CHIAR IESIREA DIN „STERS DE OM" (30.08.2026) ═══
     *
     * `publishOlxProduct` sterge urma, fiindca acolo omul apasa pe un produs anume. Aici alege el
     * produsele si apasa „Publică pe OLX" — deci cere acelasi lucru, doar pentru mai multe deodata.
     * Fara pasul asta, elementele intrau in coada, sincronizarea le sarea din cauza urmei, iar
     * ecranul ii spunea totusi „N trimise". Un numar adevarat despre o lucrare care nu se face.
     */
    for (const bucata of bucatiDeIduri(rows.map((r) => r.offer_id))) {
      const { error: eUrma } = await admin.from("olx_adverts")
        .update({ sters_de_om_la: null } as never)
        .eq("business_id", businessId).in("offer_id", bucata)
        .not("sters_de_om_la", "is", null);
      if (eUrma) return { error: "Nu am putut porni publicarea. Incearca din nou." };
    }
    /*
     * ⚠ SI SCRIEREA IN COADA ISI CITESTE RASPUNSUL. Oarba, functia raporta „N trimise la OLX" cand
     * baza acceptase zero — chiar tiparul din antetul lui `queue.ts`, pe alta cale.
     */
    for (let i = 0; i < rows.length; i += 1000) {
      const { error: eCoada } = await admin.from("olx_sync_queue")
        .upsert(rows.slice(i, i + 1000) as never, { onConflict: "business_id,offer_id,op" });
      if (eCoada) return { error: `Nu am putut pune produsele in coada OLX: ${eCoada.message}` };
    }
  }
  revalidatePath(FEATURE_PATH);
  revalidatePath("/dashboard/products");
  return { queued: rows.length, skipped: ids.length - rows.length };
}

export async function deactivateOlxProduct(businessId: string, productId: string): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  const r = await loadOlxContext(admin, businessId);
  if (r.stare !== "gata") {
    /*
     * ⚠ Cele trei feluri de „nu acum" nu se spun la fel: unul cere o apasare pe „Conectează",
     * altul cere doar rabdare. Spuse la fel, omul reconecteaza degeaba un cont sanatos.
     */
    return {
      error: r.stare === "deconectat"
        ? "Contul OLX nu este conectat. Conectează-l din Integrări > OLX."
        : r.stare === "cere-reconectare"
          ? "Sesiunea OLX a expirat. Reconectează contul OLX."
          : "OLX nu răspunde acum. Încearcă din nou peste câteva minute.",
    };
  }
  const ctx = r.ctx;
  const res = await deactivateProductNow(admin, ctx, businessId, productId);
  if (!res.ok) return { error: res.error };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function activateOlxProduct(businessId: string, productId: string): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  const r = await loadOlxContext(admin, businessId);
  if (r.stare !== "gata") {
    /*
     * ⚠ Cele trei feluri de „nu acum" nu se spun la fel: unul cere o apasare pe „Conectează",
     * altul cere doar rabdare. Spuse la fel, omul reconecteaza degeaba un cont sanatos.
     */
    return {
      error: r.stare === "deconectat"
        ? "Contul OLX nu este conectat. Conectează-l din Integrări > OLX."
        : r.stare === "cere-reconectare"
          ? "Sesiunea OLX a expirat. Reconectează contul OLX."
          : "OLX nu răspunde acum. Încearcă din nou peste câteva minute.",
    };
  }
  const ctx = r.ctx;
  const res = await activateProductNow(admin, ctx, businessId, productId);
  if (!res.ok) return { error: res.error };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function deleteOlxAdvert(businessId: string, offerId: string): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  const r = await loadOlxContext(admin, businessId);
  if (r.stare !== "gata") {
    /*
     * ⚠ Cele trei feluri de „nu acum" nu se spun la fel: unul cere o apasare pe „Conectează",
     * altul cere doar rabdare. Spuse la fel, omul reconecteaza degeaba un cont sanatos.
     */
    return {
      error: r.stare === "deconectat"
        ? "Contul OLX nu este conectat. Conectează-l din Integrări > OLX."
        : r.stare === "cere-reconectare"
          ? "Sesiunea OLX a expirat. Reconectează contul OLX."
          : "OLX nu răspunde acum. Încearcă din nou peste câteva minute.",
    };
  }
  const ctx = r.ctx;
  const res = await deleteAdvertNow(admin, ctx, businessId, offerId);
  if (!res.ok) return { error: res.error };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// Bulk: enqueue every sellable product that has a mapped category.
export async function publishAllOlx(businessId: string): Promise<{ queued: number; sarite: number } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { supabase } = g;
  const config = await loadConfig(businessId);
  const readiness = olxReadinessError(config);
  if (readiness) return { error: readiness };
  const mappedCategories = new Set(Object.keys(config.category_map ?? {}));
  if (mappedCategories.size === 0) return { error: "Mapeaza mai intai cel putin o categorie la OLX." };

  // Windowed over the 1000-row cap — whole catalog, not just the first page.
  const products = await fetchAllRowsStrict("olx.publishAll.products", (from, to) =>
    supabase.from("products").select("id, category").eq("business_id", businessId).eq("is_active", true).order("id").range(from, to)
  );
  const admin = createAdminClient();

  /*
   * ═══ ⚠ „PUBLICĂ TOATE" NU INVIE CE A STERS OMUL (30.08.2026) ═══
   *
   * Deosebirea fata de o selectie anume: aici omul n-a numit produsul. „Toate" inseamna „tot ce e
   * de publicat", nu „desfa si hotararile mele de dinainte". Sters, un anunt ramane sters pana cand
   * comerciantul cere el republicarea — pe produsul acela.
   *
   * ⚠ DAR SE SI SPUNE CATE S-AU SARIT. Puse in coada si sarite mai tarziu de sincronizare, ele ar fi
   * intrat in numarul raportat — „N trimise" pentru o lucrare care nu se face. Numarul trebuie sa
   * fie adevarat, chiar daca e mai mic.
   */
  const sterseDeOm = new Set<string>();
  for (const bucata of bucatiDeIduri(products.map((p) => p.id as string))) {
    const { data, error } = await admin.from("olx_adverts")
      .select("offer_id").eq("business_id", businessId)
      .in("offer_id", bucata).not("sters_de_om_la", "is", null);
    if (error) return { error: `Nu am putut citi anunturile sterse: ${error.message}` };
    for (const r of (data ?? []) as { offer_id: string }[]) sterseDeOm.add(r.offer_id);
  }

  const rows = products
    .filter((p) => p.category && mappedCategories.has(p.category as string))
    .filter((p) => !sterseDeOm.has(p.id as string))
    .map((p) => ({ business_id: businessId, product_id: p.id, offer_id: p.id, op: "upsert" as const }));
  if (rows.length === 0) return { queued: 0, sarite: sterseDeOm.size };

  /* ⚠ Si aici scrierea isi citeste raspunsul: altfel „N trimise" e o cifra despre nimic. */
  for (let i = 0; i < rows.length; i += 1000) {
    const { error: eCoada } = await admin.from("olx_sync_queue")
      .upsert(rows.slice(i, i + 1000) as never, { onConflict: "business_id,offer_id,op" });
    if (eCoada) return { error: `Nu am putut pune produsele in coada OLX: ${eCoada.message}` };
  }
  revalidatePath(FEATURE_PATH);
  return { queued: rows.length, sarite: sterseDeOm.size };
}

export async function retryOlxProduct(businessId: string, productId: string): Promise<{ success: true } | { error: string }> {
  return publishOlxProduct(businessId, productId).then((r) => ("error" in r ? r : { success: true }));
}

// ── Product table ───────────────────────────────────────────────────────────────
export interface OlxAdvertRow {
  product_id: string | null;
  offer_id: string;
  name: string;
  status: string;
  olx_advert_id: number | null;
  olx_url: string | null;
  valid_to: string | null;
  error: string | null;
  last_synced_at: string | null;
}

export async function getOlxAdverts(businessId: string): Promise<OlxAdvertRow[]> {
  const g = await guard(businessId);
  if ("error" in g) return [];
  const { supabase } = g;
  const { data } = await supabase
    .from("olx_adverts")
    .select("product_id, offer_id, status, olx_advert_id, olx_url, valid_to, error, last_synced_at, products(name)")
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false })
    .limit(200);

  return (data ?? []).map((r) => {
    const prod = r.products as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(prod) ? prod[0]?.name : prod?.name;
    return {
      product_id: r.product_id,
      offer_id: r.offer_id,
      name: name ?? "Produs",
      status: r.status,
      olx_advert_id: r.olx_advert_id,
      olx_url: r.olx_url,
      valid_to: r.valid_to,
      error: r.error,
      last_synced_at: r.last_synced_at,
    };
  });
}

// ── Monetization: balance, packets, paid features ──────────────────────────────────
async function withToken<T>(businessId: string, fn: (token: string, config: OlxConfig) => Promise<T>): Promise<T | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };
  const admin = createAdminClient();
  const config = await loadConfig(businessId);
  if (!config.connected || !config.refresh_token) return { error: "Conecteaza mai intai contul OLX." };
  const tok = await ensureMerchantToken(admin, businessId, config);
  if ("error" in tok) return { error: tok.error };
  return fn(tok.token, tok.config);
}

export interface OlxAccountInfo {
  balance: { sum: number; wallet: number; bonus: number; currency: string } | null;
  paymentMethods: OlxPaymentMethod[];
}

export async function getOlxAccountInfo(businessId: string): Promise<OlxAccountInfo | { error: string }> {
  return withToken(businessId, async (token) => {
    const [balRes, pmRes] = await Promise.all([getAccountBalance(token), getPaymentMethods(token)]);
    return {
      balance: isOlxError(balRes) ? null : {
        sum: balRes.data.sum, wallet: balRes.data.wallet, bonus: balRes.data.bonus, currency: balRes.data.currency,
      },
      paymentMethods: isOlxError(pmRes) ? [] : (Array.isArray(pmRes.data) ? pmRes.data : []),
    };
  });
}

export interface OlxPacketGroup { categoryId: number; label: string; packets: OlxPacket[] }

export interface OlxPacketsResult {
  groups: OlxPacketGroup[];
  bought: OlxBoughtPacket[];
  paymentMethod: OlxPaymentMethod;
  hasMappedCategories: boolean;
}

export async function getOlxPackets(businessId: string): Promise<OlxPacketsResult | { error: string }> {
  return withToken(businessId, async (token, config) => {
    // Price packets against the wallet-credit method when available.
    const pmRes = await getPaymentMethods(token);
    const methods = isOlxError(pmRes) ? [] : (Array.isArray(pmRes.data) ? pmRes.data : []);
    const paymentMethod: OlxPaymentMethod = methods.includes("account") ? "account" : (methods[0] ?? "account");

    // Packets are per category — fetch for each distinct mapped OLX category.
    const cats = new Map<number, string>();
    for (const entry of Object.values(config.category_map ?? {})) {
      if (entry?.category_id) cats.set(entry.category_id, entry.label);
    }
    const groups: OlxPacketGroup[] = [];
    let fetched = 0;
    for (const [categoryId, label] of cats) {
      if (fetched >= 20) break; // bound the panel load
      fetched++;
      const res = await getAvailablePackets(token, { category_id: categoryId, payment_method: paymentMethod, type: "all", with_features: true });
      if (!isOlxError(res) && Array.isArray(res.data) && res.data.length > 0) {
        groups.push({ categoryId, label, packets: res.data });
      }
      await new Promise((r) => setTimeout(r, 250)); // pace OLX calls
    }

    // Bought packets — paginate past the default page size of 50.
    const bought: OlxBoughtPacket[] = [];
    for (let offset = 0; offset < 1000; offset += 50) {
      const res = await getBoughtPackets(token, { availability: "active", offset, limit: 50 });
      if (isOlxError(res)) break;
      const batch = Array.isArray(res.data) ? res.data : [];
      bought.push(...batch);
      if (batch.length < 50) break;
    }

    return { groups, bought, paymentMethod, hasMappedCategories: cats.size > 0 };
  });
}

export async function buyOlxCategoryPacket(
  businessId: string, categoryId: number, size: number, paymentMethod: OlxPaymentMethod, type: "base" | "mega" = "base",
): Promise<{ success: true } | { error: string }> {
  const res = await withToken(businessId, (token) =>
    purchaseCategoryPacket(token, { category_id: categoryId, size, payment_method: paymentMethod, type }));
  if ("error" in res) return res;
  if (isOlxError(res)) return { error: mapPaymentError(res.error) };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// Buy a packet for a single advert and activate it (the direct fix for a
// `limited` advert). Resolves the payment method server-side.
export async function buyOlxAdvertPacket(
  businessId: string, advertId: number, isPremium = false,
): Promise<{ success: true } | { error: string }> {
  const res = await withToken(businessId, async (token) => {
    const pmRes = await getPaymentMethods(token);
    const methods = isOlxError(pmRes) ? [] : (Array.isArray(pmRes.data) ? pmRes.data : []);
    const method: OlxPaymentMethod = methods.includes("account") ? "account" : (methods[0] ?? "account");
    const buy = await purchaseAdvertPacket(token, advertId, { payment_method: method, is_premium: isPremium });
    if (isOlxError(buy)) return buy;
    // After buying, activate the (previously limited) advert.
    return advertCommand(token, advertId, "activate");
  });
  if ("error" in res) return res;
  if (isOlxError(res)) return { error: mapPaymentError(res.error) };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function getOlxPaidFeatures(businessId: string): Promise<{ features: OlxPaidFeature[] } | { error: string }> {
  const res = await withToken(businessId, (token) => getPaidFeatures(token));
  if ("error" in res) return res;
  if (isOlxError(res)) return { error: res.error };
  return { features: Array.isArray(res.data) ? res.data : [] };
}

export async function buyOlxPaidFeature(
  businessId: string, advertId: number, code: string, paymentMethod: OlxPaymentMethod,
): Promise<{ success: true } | { error: string }> {
  const res = await withToken(businessId, (token) => purchasePaidFeature(token, advertId, { code, payment_method: paymentMethod }));
  if ("error" in res) return res;
  if (isOlxError(res)) return { error: mapPaymentError(res.error) };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Inbox (buyer leads) ────────────────────────────────────────────────────────────
export async function getOlxThreads(businessId: string): Promise<{ threads: OlxThread[] } | { error: string }> {
  const res = await withToken(businessId, (token) => getThreads(token, { limit: 50 }));
  if ("error" in res) return res;
  if (isOlxError(res)) return { error: res.error };
  return { threads: Array.isArray(res.data) ? res.data : [] };
}

export interface OlxConversation {
  messages: OlxMessage[];
  buyer: { id: number; name: string; avatar: string | null } | null;
  advert: { id: number; title: string; url: string | null; price: string | null; image: string | null } | null;
}

// One round-trip for a full OLX-style conversation view: messages + the buyer's
// profile (name/avatar) + the advert card (title/price/thumbnail). Marks read.
export async function getOlxConversation(
  businessId: string, threadId: number, opts: { advertId?: number; interlocutorId?: number } = {},
): Promise<OlxConversation | { error: string }> {
  const res = await withToken(businessId, async (token, config) => {
    const [msgsRes, buyerRes, advertRes] = await Promise.all([
      getThreadMessages(token, threadId),
      opts.interlocutorId ? getUser(token, opts.interlocutorId) : Promise.resolve(null),
      opts.advertId ? getAdvert(token, opts.advertId) : Promise.resolve(null),
    ]);
    void markThreadRead(token, threadId);
    return { msgsRes, buyerRes, advertRes, sellerName: config.olx_user_name ?? "" };
  });
  if ("error" in res) return res;
  const { msgsRes, buyerRes, advertRes, sellerName } = res;
  if (isOlxError(msgsRes)) return { error: msgsRes.error };

  // API can return newest-first — sort ascending by id for a chat view.
  const messages = (Array.isArray(msgsRes.data) ? msgsRes.data : []).slice().sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  // Buyer profile: keep it only when it's a real, distinct name. OLX sometimes
  // returns the seller's own account here — drop it so the UI falls back to a
  // generic label instead of showing the shop's own name as the "buyer".
  let buyer: OlxConversation["buyer"] = null;
  if (buyerRes && !isOlxError(buyerRes) && buyerRes.data) {
    const name = (buyerRes.data.name ?? "").trim();
    if (name && name.toLowerCase() !== sellerName.trim().toLowerCase()) {
      buyer = { id: buyerRes.data.id, name, avatar: buyerRes.data.avatar ?? null };
    }
  }
  let advert: OlxConversation["advert"] = null;
  if (advertRes && !isOlxError(advertRes) && advertRes.data) {
    const a = advertRes.data;
    advert = {
      id: a.id,
      title: a.title ?? "",
      url: a.url ?? null,
      price: a.price?.value != null ? `${a.price.value} ${a.price.currency ?? "RON"}` : null,
      image: a.images?.[0]?.url ?? null,
    };
  }
  return { messages, buyer, advert };
}

export async function replyOlxThread(businessId: string, threadId: number, text: string): Promise<{ success: true } | { error: string }> {
  const clean = text.trim();
  if (!clean) return { error: "Mesajul este gol." };
  const res = await withToken(businessId, (token) => postThreadMessage(token, threadId, clean));
  if ("error" in res) return res;
  if (isOlxError(res)) return { error: res.error };
  return { success: true };
}

// Translate OLX payment error details into actionable Romanian guidance.
function mapPaymentError(detail: string): string {
  if (/not enough credits/i.test(detail)) {
    return "Sold insuficient pe contul OLX. Alimenteaza portofelul pe olx.ro (plata cu cardul nu este disponibila prin API), apoi reincearca.";
  }
  if (/postpaid.*not activated/i.test(detail)) {
    return "Plata pe factura (postpaid) nu este activata pe contul tau OLX. Contacteaza suportul OLX pentru a o activa.";
  }
  if (/invalid payment method/i.test(detail)) {
    return "Metoda de plata selectata nu este disponibila pe contul tau OLX.";
  }
  if (/no variant with size/i.test(detail)) {
    return "Marimea pachetului nu este disponibila pentru aceasta categorie. Alege alta marime.";
  }
  return detail;
}
