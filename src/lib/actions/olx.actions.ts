"use server";

import { revalidatePath } from "next/cache";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { patchOlxConfig, setOlxCategoryMapEntry } from "@/lib/olx/config";
import { invieScrisorileMoarteOlx, enqueueOlxDezactivareMany } from "@/lib/olx/queue";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { logError } from "@/lib/error-logger";
import {
  buildAuthUrl, ensureMerchantToken, olxConfigured, signState,
} from "@/lib/olx/oauth";
import type { OlxResult } from "@/lib/olx/client";
import {
  advertCommand, getAccountBalance, getAdvert, getAdvertPaidFeatures, getAvailablePackets, getBoughtPackets,
  getPaidFeatures, getPaymentMethods, isOlxError,
  postThreadMessage, purchaseAdvertPacket, purchaseCategoryPacket, purchasePaidFeature,
  suggestLocationByCoords,
} from "@/lib/olx/client";
import {
  getOlxCategoriesCached, getOlxCategoryAttributesCached, getOlxCityDistrictsCached,
  searchOlxCities, suggestOlxCategoriesCached,
} from "@/lib/olx/categories";
import { loadOlxContext, syncProductNow, deactivateProductNow, activateProductNow, deleteAdvertNow, rezolvaConflictul } from "@/lib/olx/sync";
import { olxReadinessError, categoriaNuPrimesteProduse, atributeObligatoriiLipsa } from "@/lib/olx/mapping";
import { cuRegistru, cheieOperatie, deblocheazaOperatie, eAtarnata, PRAG_ATARNATA_MS,
  type RezultatOperatie, type Verdict } from "@/lib/operatii/registru";
import { FORMA_INTENTIEI, cePachetAnunt, cePachetCategorie, cePromovare } from "@/lib/olx/intentie-de-cumparare";
import { verdictulPlatii } from "@/lib/olx/verdictul-platii";
import {
  citesteLista, lamurestePlata, platiNelamurite, promovareaEActiva,
  type LamurireOlx, type OlxPlataNelamurita,
} from "@/lib/olx/plati";
import { legatoriDeAtribute, nereguliAtribute } from "@/lib/olx/atribute";
import type {
  OlxAttributeDef, OlxBoughtPacket, OlxCategory, OlxCategoryMapEntry, OlxCategorySuggestion,
  OlxCity, OlxConfig, OlxDistrict, OlxLocationSuggestion, OlxPacket, OlxPaidFeature,
  OlxPaymentMethod,
} from "@/lib/olx/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

interface OwnBiz {
  id: string; slug: string; custom_domain: string | null; store_name: string | null; business_name: string;
}

/**
 * ⚠ O CITIRE CAZUTA NU E ACELASI LUCRU CU „NU E AL TAU" (02.09.2026)
 *
 * `supabase-js` nu arunca: o pana de baza intoarce `data: null` — exact ce intoarce si un magazin
 * strain. Confundate, comerciantului i se spunea „Magazin negasit" tocmai cand magazinul era al
 * lui si baza sughitase; el pleca sa caute in locul gresit, si nimeni nu afla de ce.
 *
 * ⚠ Aici doare mai tare decat oriunde: prin poarta asta trec CUMPARARILE. „Magazin negasit" pe o
 * plata suna a greseala a lui, nu a noastra, si il face sa reincerce din alt cont.
 *
 * `maybeSingle`, nu `single`: zero randuri e un raspuns legitim („nu e al tau"), nu o eroare.
 */
type Proprietate = { biz: OwnBiz } | { nuEAlTau: true } | { cazut: true };

async function ownedBusiness(supabase: ServerClient, businessId: string, userId: string): Promise<Proprietate> {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, store_name, business_name")
    .eq("id", businessId).eq("user_id", userId).maybeSingle();
  if (error) return { cazut: true };
  return data ? { biz: data as OwnBiz } : { nuEAlTau: true };
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

/**
 * `loadConfig`, cu locul de cadere pus la vedere.
 *
 * ═══ ARUNCAREA CERE UN LOC DE CADERE (02.09.2026) ═══
 *
 * `loadConfig` arunca dinadins cand baza nu raspunde: asa o configurare NECITITA nu se poate
 * confunda cu una goala, si nimeni nu declara „nu e conectat" pe baza unei pene. Aruncarea e buna.
 *
 * ⚠ Dar sapte actiuni exportate o chemau direct, fara nimic care s-o prinda. `getOlxStatus` e
 * asteptata de o componenta de SERVER, deci o pana de baza nu dadea un mesaj intr-un panou: arunca
 * toata pagina OLX cu „a aparut o eroare neasteptata", fara buton de reincercare si fara vreun
 * cuvant despre ce s-a intamplat.
 *
 * ⚠ Intoarce un INVELIS, nu configurarea goala: `OlxConfig` are numai campuri optionale, deci
 * `{}` trece drept configurare valida si un `{ error }` alaturat de ea nu s-ar putea deosebi la
 * citire. Invelisul face deosebirea imposibil de ratat, si `tsc` o cere.
 */
async function configSauEroare(
  businessId: string,
): Promise<{ config: OlxConfig } | { error: string }> {
  try {
    return { config: await loadConfig(businessId) };
  } catch {
    return { error: "Nu am putut citi setările OLX. Încearcă din nou peste câteva momente." };
  }
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
  const p = await ownedBusiness(supabase, businessId, user.id);
  if ("cazut" in p) return { error: "Nu am putut verifica magazinul. Încearcă din nou peste câteva momente." };
  if ("nuEAlTau" in p) return { error: "Magazin negăsit" };
  return { supabase, userId: user.id, biz: p.biz };
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
    /** Produse cu doua anunturi vii la ei: publicarea sta pana alege omul. */
    conflicte: number;
  };
}

export async function getOlxStatus(businessId: string): Promise<OlxStatus | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { supabase } = g;
  const cfg = await configSauEroare(businessId);
  if ("error" in cfg) return cfg;
  const config = cfg.config;

  // Count-only queries (exact at any volume; avoids the 1000-row PostgREST cap).
  const rejectedStatuses = ["moderated", "blocked", "disabled", "removed_by_moderator", "error"];
  const [{ count: total }, { count: published }, { count: active }, { count: pending }, { count: limited }, { count: rejected }, { count: queued }, { count: oprite }, { count: conflicte }] = await Promise.all([
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
    supabase.from("olx_adverts").select("id", { count: "exact", head: true }).eq("business_id", businessId).not("conflict_la", "is", null),
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
      conflicte: conflicte ?? 0,
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
   * ⚠ O PLATA NELAMURITA NU ARE VOIE SA DISPARA DIN OCHI (02.09.2026)
   *
   * Deconectarea sterge coada si anunturile, dar nu atinge `operatii_externe`. Iar din clipa aceea
   * ecranul arata „Conecteaza contul OLX" si nu mai monteaza panoul de sanatate deloc: platile
   * neconfirmate deveneau INVIZIBILE. Si nici verificabile, fiindca lamurirea trece prin
   * `withToken`, care iese pe `!config.connected`.
   *
   * ⚠ Iar la reconectare, mai ales pe alt cont OLX, ar fi revenit un rand vechi despre un anunt
   * al carui rand local fusese sters — adica o intrebare fara raspuns posibil.
   *
   * Deci nu se deconecteaza peste ele: se arata, si omul le lamureste sau isi asuma deblocarea.
   */
  const nelamurite = await platiNelamurite(createAdminClient(), businessId);
  if (nelamurite.error) return { error: nelamurite.error };
  if (nelamurite.plati.length > 0) {
    return {
      error: `Ai ${nelamurite.plati.length} ${nelamurite.plati.length === 1 ? "cumpărare neconfirmată" : "cumpărări neconfirmate"} către OLX. Lămurește-le din panoul de sănătate înainte de deconectare, altfel dispar din ecran fără să dispară din registru.`,
    };
  }

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
  const cfg = await configSauEroare(businessId);
  if ("error" in cfg) return cfg;
  const config = cfg.config;

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

/**
 * Localitatea pe care o are magazinul in Edinio, cautata in nomenclatorul OLX.
 *
 * ═══ OMUL A SCRIS-O DEJA O DATA (01.09.2026) ═══
 *
 * Ecranul de setari OLX ii cerea sa caute din nou localitatea, desi magazinul are `store_city` de
 * la inregistrare. E o intrebare pusa a doua oara — si tocmai la pasul in care oricine se
 * plictiseste si alege primul lucru din lista.
 *
 * ⚠ E O SUGESTIE, NU O HOTARARE. Adresa magazinului poate fi un depozit, iar anunturile pot trebui
 * puse in alt oras. Se arata si se confirma; nu se scrie singura.
 *
 * ⚠ COMENTARIUL DE AICI SPUNEA CA NU AVEM COORDONATE, SI ERA FALS (02.09.2026). Scria „Edinio nu
 * are latitudine si longitudine nicaieri". `businesses.lat` si `businesses.lng` exista in schema
 * si se pot scrie. Adevarul e mai ingust: COLOANELE exista, dar nimic nu le populeaza azi.
 *
 * ⚠ E aceeasi greseala ca „precautia noastra nu e regula lor", doar ca despre propria noastra baza:
 * o afirmatie de fapt, scrisa ca justificare a unei hotarari, pe care cine o citeste peste trei
 * luni n-o mai verifica.
 *
 * Cautarea dupa nume ramane calea de-a dreptul, fiindca numele chiar exista. Pentru coordonate e
 * `suggestOlxLocationByCoords`, care foloseste ruta lor `/locations` si primeste punctul de la
 * browser — singura sursa de coordonate pe care o avem cu adevarat.
 */
export async function suggestOlxCityFromShop(
  businessId: string,
): Promise<{ oras: string; potriviri: OlxCity[] } | { error: string } | { oras: null }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { data, error } = await g.supabase
    .from("businesses").select("store_city, city").eq("id", businessId).single();
  if (error) return { error: "Nu am putut citi localitatea magazinului." };
  const oras = (data?.store_city ?? data?.city ?? "").trim();
  if (!oras) return { oras: null };
  /* ⚠ `null` inseamna „n-am putut cauta", nu „nu exista": nu se pretinde ca orasul lipseste. */
  const potriviri = await searchOlxCities(oras);
  if (potriviri === null) return { error: "Nu am putut căuta localitatea la OLX. Încearcă din nou." };
  return { oras, potriviri: potriviri.slice(0, 5) };
}

/**
 * Localitatea si cartierul, dupa un punct pe harta.
 *
 * ⚠ RUTA LOR EXISTA SI ERA NEFOLOSITA. `suggestLocationByCoords` (`/locations`) a fost reparata
 * runda trecuta — era `/cities?latitude=…`, o ruta care nu exista — si de atunci statea in client
 * fara sa o cheme nimeni. Cod care exista si nu se poate atinge arata, dintr-un inventar de
 * functii, exact ca o functie livrata.
 *
 * ⚠ PUNCTUL VINE DE LA BROWSER, la apasarea omului. E singura sursa de coordonate pe care o avem:
 * `businesses.lat`/`lng` exista ca ni-i cere schema, dar nimic nu le scrie. Iar cartierul conteaza
 * mai mult decat pare — la Bucuresti, un anunt fara sector se vede mult mai prost.
 *
 * ⚠ Si tot o SUGESTIE ramane. Punctul e unde sta omul cand apasa, nu neaparat unde e marfa.
 */
export async function suggestOlxLocationByCoords(
  businessId: string, lat: number, lon: number,
): Promise<{ oras: OlxCity; cartier: OlxDistrict | null } | { error: string } | { gasit: false }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)
      || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { error: "Coordonatele primite nu sunt valide." };
  }
  const r = await withToken(businessId, (token) => suggestLocationByCoords(token, lat, lon));
  if ("error" in r && !("status" in r)) return { error: r.error };
  const rr = r as OlxResult<OlxLocationSuggestion[]>;
  if (isOlxError(rr)) return { error: "Nu am putut căuta localitatea la OLX. Încearcă din nou." };
  /*
   * ⚠ O citire fara lista NU e „nu s-a gasit nimic". `call` intoarce `{ data: {} }` pentru un corp
   * stricat; luata drept lista goala, i-am fi spus omului ca nu exista nicio localitate acolo.
   */
  if (!Array.isArray(rr.data)) return { error: "Răspunsul OLX nu a putut fi citit. Încearcă din nou." };
  const prima = rr.data.find((x) => x?.city?.id != null);
  if (!prima?.city) return { gasit: false };
  return { oras: prima.city, cartier: prima.district ?? null };
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
/**
 * Ce se face cu anunturile deja publicate cand se scoate maparea unei categorii.
 *
 * ⚠ NU HOTARAM NOI. Sunt comercianti care scot maparea tocmai ca sa OPREASCA sincronizarea si sa
 * lase anunturile in pace — o alegere legitima. Si sunt altii care nu banuiesc ca anunturile raman
 * la vanzare cu pretul de atunci. Intrebarea li se pune o data, cu numarul in fata.
 */
export type PoliticaScoatereMapare = "pastreaza" | "dezactiveaza";

export async function saveOlxCategoryMapEntry(
  businessId: string, edinioCategory: string, entry: OlxCategoryMapEntry | null,
  politica?: PoliticaScoatereMapare,
): Promise<{ success: true } | { error: string } | { intreaba: { cate: number } }> {
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
    /*
     * ⚠ SI REGULILE LOR, NU DOAR „OBLIGATORIU" (01.09.2026). Schema atributului poarta `values[]`,
     * `numeric`, `min`, `max`, `allow_multiple_values` — si le foloseam numai pe `required`. Deci o
     * valoare care nu e in lista lor pleca la ei si se intorcea ca refuz, la publicare, pe produsul
     * comerciantului. Verificata aici, il scuteste de o cursa pe care n-are cum s-o inteleaga.
     *
     * ⚠ Se verifica doar CONSTANTELE: o legatura catre un camp al produsului n-are inca valoare in
     * clipa salvarii, iar valoarea aceea se verifica la publicare, cand exista produsul.
     */
    const constante: Record<string, string | string[]> = {};
    for (const [cod, m] of Object.entries(entry.attributes ?? {})) {
      if (typeof m === "string") { if (m.trim()) constante[cod] = m; continue; }
      if (Array.isArray(m) && m.length > 0 && typeof m[0] === "string") constante[cod] = m as string[];
    }
    const nereguli = nereguliAtribute(attributes, constante);
    if (nereguli.length > 0) return { error: nereguli.join(" ") };
    /*
     * ⚠ La SALVAREA maparii nu exista un produs anume, deci se verifica LEGATURILE: un atribut
     * obligatoriu e „completat" daca are o sursa, oricare. Daca sursa aceea nu da nimic pentru un
     * produs, aflam la publicare — si atunci mesajul e despre produsul acela, nu despre mapare.
     */
    const lipsa = atributeObligatoriiLipsa(attributes, legatoriDeAtribute(entry.attributes));
    if (lipsa.length > 0) return { error: `Completează atributele obligatorii: ${lipsa.join(", ")}` };
  }
  /*
   * ═══ O MAPARE SCOASA LASA ANUNTURI CARE SE VAND MAI DEPARTE (01.09.2026) ═══
   *
   * Fara mapare, sincronizarea nu mai poate construi corpul cererii pentru produsele categoriei —
   * dar anunturile RAMAN la OLX, cu pretul si stocul de atunci:
   *
   *     Edinio: pret 200 lei
   *     OLX:    pret 150 lei, ACTIV, se vinde
   *
   * ⚠ Se intreaba o data, cu numarul in fata, si abia dupa raspuns se face ceva. Iar daca omul cere
   * dezactivarea, ea se SCRIE in coada INAINTE ca maparea sa dispara: ordinea inversa ar lasa
   * lucrarea nescrisa peste o mapare deja stearsa.
   */
  if (entry === null) {
    const cuAnunturi = await produseleCuAnunturi(businessId, edinioCategory);
    if ("error" in cuAnunturi) return cuAnunturi;
    if (cuAnunturi.ids.length > 0) {
      if (!politica) return { intreaba: { cate: cuAnunturi.ids.length } };
      if (politica === "dezactiveaza") {
        const r = await enqueueOlxDezactivareMany(businessId, cuAnunturi.ids);
        if (r.fel === "nesigur") {
          return { error: `Maparea n-a fost ștearsă: dezactivarea anunțurilor nu s-a putut programa (${r.motiv})` };
        }
      }
    }
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

/**
 * Produsele dintr-o categorie Edinio care au un anunt VIU la OLX.
 *
 * ⚠ Numai cele vii: unul deja stins sau sters n-are ce sa mai patä de la scoaterea maparii, iar
 * numarul aratat omului trebuie sa fie cel despre care chiar e vorba.
 */
async function produseleCuAnunturi(
  businessId: string, edinioCategory: string,
): Promise<{ ids: string[] } | { error: string }> {
  const admin = createAdminClient();
  const { data: prods, error: eProduse } = await admin
    .from("products").select("id").eq("business_id", businessId).eq("category", edinioCategory);
  if (eProduse) return { error: "Nu am putut citi produsele categoriei." };
  const ids = ((prods ?? []) as { id: string }[]).map((p) => p.id);
  if (ids.length === 0) return { ids: [] };

  const cuAnunt: string[] = [];
  for (const bucata of bucatiDeIduri(ids)) {
    const { data, error } = await admin
      .from("olx_adverts").select("offer_id")
      .eq("business_id", businessId).in("offer_id", bucata)
      .not("olx_advert_id", "is", null)
      .in("status", ["active", "new", "unconfirmed", "limited"]);
    if (error) return { error: "Nu am putut citi anunțurile categoriei." };
    for (const r of (data ?? []) as { offer_id: string }[]) cuAnunt.push(r.offer_id);
  }
  return { ids: cuAnunt };
}

/**
 * Cat de bine merge integrarea, in numere care se pot citi dintr-o privire.
 *
 * ═══ TACEREA ARATA EXACT CA FUNCTIONAREA (01.09.2026) ═══
 *
 * Toate reparatiile din ultimele runde au acelasi capat: cand ceva nu merge, se scrie undeva — in
 * `last_error`, in `abandonat_la`, intr-un conflict, in jurnal. Dar nimic nu ADUNA. Comerciantul,
 * si noi, ne uitam la un ecran care arata la fel si cand totul merge, si cand coada n-a mai fost
 * atinsa de trei ore.
 *
 * ⚠ CEA MAI IMPORTANTA CIFRA E VECHIMEA CELEI MAI VECHI LUCRARI. Numarul din coada nu spune nimic
 * singur — treizeci de lucrari puse acum o clipa sunt sanatate curata, iar UNA singura de acum
 * doua ore inseamna ca ceva s-a oprit.
 */
export interface OlxSanatate {
  inCoada: number;
  celMaiVechiMinute: number | null;
  oprite: number;
  conflicte: number;
  respinse: number;
  /** Plati catre OLX al caror rezultat n-a fost confirmat. Vezi `getOlxPlatiNelamurite`. */
  platiNelamurite: number;
  ultimaSincronizare: string | null;
  cereReconectare: boolean;
}

export async function getOlxSanatate(businessId: string): Promise<OlxSanatate | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();

  const [coada, oprite, conflicte, respinse, plati, ceaMaiVeche] = await Promise.all([
    admin.from("olx_sync_queue").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).is("abandonat_la", null),
    admin.from("olx_sync_queue").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).not("abandonat_la", "is", null),
    admin.from("olx_adverts").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).not("conflict_la", "is", null),
    admin.from("olx_adverts").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).not("moderation_text", "is", null),
    /*
     * ⚠ SE ADUC RANDURILE, NU UN NUMAR. Pragul dupa care o operatie „atarna" se hotaraste in
     * `eAtarnata`, unde se poate proba; numarata cu `head: true`, cifra ar fi inclus si plata care
     * TOCMAI a plecat, iar panoul ar fi cazut pe rosu pentru o operatie perfect sanatoasa, cu un
     * buton alaturi care i-ar fi raspuns „mai asteapta". Sunt cel mult cateva randuri.
     */
    admin.from("operatii_externe").select("stare, creat_la")
      .eq("business_id", businessId).eq("furnizor", "olx").eq("fel", "plata")
      .in("stare", ["in_curs", "necunoscut"]).limit(50),
    admin.from("olx_sync_queue").select("created_at")
      .eq("business_id", businessId).is("abandonat_la", null)
      .order("created_at", { ascending: true }).limit(1).maybeSingle(),
  ]);

  /*
   * ⚠ O CITIRE PICATA NU E UN ZERO. Un panou de sanatate care arata „0 probleme" fiindca n-a putut
   * intreba e mai rau decat unul care lipseste: linisteste exact cand n-ar trebui.
   */
  for (const r of [coada, oprite, conflicte, respinse, plati, ceaMaiVeche]) {
    if (r.error) return { error: "Nu am putut citi starea integrării OLX." };
  }

  const cfg = await configSauEroare(businessId);
  if ("error" in cfg) return cfg;
  const config = cfg.config;
  const nascut = ceaMaiVeche.data?.created_at ? Date.parse(ceaMaiVeche.data.created_at) : NaN;
  return {
    inCoada: coada.count ?? 0,
    celMaiVechiMinute: Number.isFinite(nascut) ? Math.floor((Date.now() - nascut) / 60_000) : null,
    oprite: oprite.count ?? 0,
    conflicte: conflicte.count ?? 0,
    respinse: respinse.count ?? 0,
    platiNelamurite: ((plati.data ?? []) as { stare: string; creat_la: string }[])
      .filter((r) => eAtarnata({ stare: r.stare as "in_curs" | "necunoscut", creatLa: r.creat_la })).length,
    ultimaSincronizare: config.last_sync_at ?? null,
    cereReconectare: config.needs_reconnect === true,
  };
}

/* ── Platile ramase nelamurite ────────────────────────────────────────────── */

/**
 * ═══ O INDOIALA CARE NU SE LAMURESTE E UN FUND DE SAC (01.09.2026) ═══
 *
 * Registrul tine slotul dinadins cand nu stie ce s-a intamplat — asa nu se plateste de doua ori.
 * Dar mecanismul generic de deblocare lucreaza pe pagina unei COMENZI (`operatiiAtarnate` se
 * ingusteaza cu `.eq("order_id", …)`), iar platile OLX au `orderId: null`. Deci un `POST` cu
 * raspuns pierdut lasa cumpararea blocata, si comerciantul nu vede nicaieri de ce.
 *
 * ⚠ SI PANA ACUM DEFECTUL ERA MASCAT. Cheia purta ziua, deci blocajul se desfacea singur peste
 * noapte. De cand cheia poarta intentia — si bine face — blocajul e permanent, iar iesirea asta a
 * trecut din „bine de avut" in „obligatoriu".
 *
 * ⚠ MIEZUL STA IN `src/lib/olx/plati.ts`, nu aici. Actiunile incep toate cu `guard()`, care cere o
 * sesiune de OM; cronul n-are cookie-uri, deci un pas de reconciliere scris peste actiunile astea
 * ar fi raspuns „Neautorizat" pe fiecare rand, la fiecare trecere, fara sa se planga nimanui. Si
 * nici exportate de aici nu puteau fi: ce se exporta dintr-un modul `"use server"` e un capat
 * public.
 */
export async function getOlxPlatiNelamurite(
  businessId: string,
): Promise<{ plati: OlxPlataNelamurita[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { plati, error } = await platiNelamurite(createAdminClient(), businessId);
  if (error) return { error };
  return { plati };
}

export async function lamuresteOlxPlata(
  businessId: string, operatieId: string,
): Promise<LamurireOlx | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const r = await lamurestePlata(createAdminClient(), businessId, operatieId);
  if (!("error" in r) && r.stare === "intrat") revalidatePath(FEATURE_PATH);
  return r;
}

/**
 * „Am verificat pe olx.ro, plata nu e acolo. Deblocheaz-o."
 *
 * ⚠ HOTARAREA E A OMULUI, SI SE SCRIE CINE A LUAT-O. Deblocarea elibereaza cheia, deci urmatoarea
 * apasare CHEAMA OLX. Daca plata intrase totusi, asta e a doua plata — de aceea nu o ia niciun
 * automatism, nici macar cronul, si de aceea ramane o urma in jurnal. `deblocheazaOperatie` isi
 * scrie singura regula: „se scrie in jurnal la APELANT, fiindca deblocarea e o decizie asumata".
 */
export async function renuntaLaOlxPlata(
  businessId: string, operatieId: string,
): Promise<{ success: true; mesaj: string } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("operatii_externe").select("id, cheie, stare, creat_la")
    .eq("id", operatieId).eq("business_id", businessId)
    .eq("furnizor", "olx").eq("fel", "plata").maybeSingle();
  if (error) return { error: "Nu am putut citi operația." };
  if (!data) return { error: "Operația nu mai există." };

  const nascut = Date.parse(String(data.creat_la));
  /* ⚠ Aceeasi rabdare: o operatie care CHIAR se executa acum nu are voie sa fie deblocata. */
  if (Number.isFinite(nascut) && Date.now() - nascut < PRAG_ATARNATA_MS) {
    return { error: "Cumpărarea a plecat acum câteva momente și încă poate primi răspuns. Mai așteaptă un minut." };
  }

  const r = await deblocheazaOperatie(admin, businessId, operatieId,
    "comerciantul a verificat pe olx.ro si a declarat ca plata nu a intrat");
  if (!r.ok) return { error: r.mesaj };

  await logError({
    action: "olx.renuntaLaOlxPlata", severity: "warning", businessId,
    message: `plata OLX deblocata de comerciant: ${data.cheie}`,
    details: { operatieId, cheie: data.cheie, stareVeche: data.stare, stabilizata: r.stabilizata },
  });

  /*
   * ⚠ `stabilizata` NU SE INGHITE. Inseamna ca randul s-a asezat singur intre afisarea panoului si
   * apasare, deci deblocarea n-a scris nimic. Daca s-a asezat pe `reusit`, cheia blocheaza in
   * continuare — si pe buna dreptate. „Poti incerca din nou" ar fi fost o minciuna linistitoare
   * care il trimite spre un buton ce va fi refuzat.
   */
  revalidatePath(FEATURE_PATH);
  if (r.stabilizata) {
    return { success: true, mesaj: "Operația se încheiase deja singură între timp. Reîncarcă pagina ca să vezi starea reală." };
  }
  return { success: true, mesaj: "Cumpărarea e deblocată. Poți încerca din nou." };
}

/** Un produs cu doua anunturi vii la OLX, si ce are omul de ales. */
export interface OlxConflict {
  offerId: string;
  productName: string | null;
  iduri: number[];
  vazutLa: string;
}

/**
 * Conflictele nerezolvate ale magazinului.
 *
 * ⚠ Se citesc separat de numaratori fiindca omul are de FACUT ceva cu ele, nu doar de vazut un
 * numar. Un conflict tacut inseamna un produs care nu se mai publica si nimeni nu stie de ce.
 */
export async function getOlxConflicts(businessId: string): Promise<{ conflicte: OlxConflict[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("olx_adverts")
    .select("offer_id, conflict_la, conflict_iduri")
    .eq("business_id", businessId).not("conflict_la", "is", null)
    .order("conflict_la", { ascending: true }).limit(50);
  if (error) return { error: "Nu am putut citi conflictele." };
  const randuri = (data ?? []) as { offer_id: string; conflict_la: string; conflict_iduri: number[] | null }[];
  if (randuri.length === 0) return { conflicte: [] };

  /* Numele produsului, ca omul sa stie despre ce e vorba fara sa caute UUID-uri. */
  const { data: prods } = await admin
    .from("products").select("id, name").eq("business_id", businessId)
    .in("id", randuri.map((r) => r.offer_id));
  const nume = new Map(((prods ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));

  return {
    conflicte: randuri.map((r) => ({
      offerId: r.offer_id,
      productName: nume.get(r.offer_id) ?? null,
      iduri: Array.isArray(r.conflict_iduri) ? r.conflict_iduri : [],
      vazutLa: r.conflict_la,
    })),
  };
}

/** Omul a ales care anunt ramane. */
export async function rezolvaConflictOlx(
  businessId: string, offerId: string, pastreazaId: number,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const admin = createAdminClient();
  const rCtx = await loadOlxContext(admin, businessId);
  if (rCtx.stare !== "gata") return { error: "Conexiunea OLX nu este disponibilă acum. Încearcă din nou." };
  const r = await rezolvaConflictul(admin, rCtx.ctx, businessId, offerId, pastreazaId);
  if (!r.ok) return { error: r.error };
  revalidatePath(FEATURE_PATH);
  return { success: true };
}

// ── Publishing ────────────────────────────────────────────────────────────────────
export async function publishOlxProduct(businessId: string, productId: string): Promise<{ success: true; status?: string; url?: string | null } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const cfg = await configSauEroare(businessId);
  if ("error" in cfg) return cfg;
  const config = cfg.config;
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
  const cfg = await configSauEroare(businessId);
  if ("error" in cfg) return cfg;
  const config = cfg.config;
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
    const { data, error } = await g.supabase
      .from("products").select("id, category, is_active").eq("business_id", businessId).in("id", bucata);
    /*
     * ⚠ O BUCATA PICATA FACEA PRODUSELE SA DISPARA IN TACERE (31.08.2026).
     *
     * `data ?? []` da acelasi lucru si pentru „interogare reusita, zero produse", si pentru
     * „interogarea a picat". Iar mai jos se raporteaza `queued: rows.length`, deci omul vedea
     * „N produse trimise catre OLX" pentru o lucrare din care lipseau tocmai cele necitite —
     * si nimic, nicaieri, nu spunea ca s-a pierdut ceva.
     *
     * ⚠ Nu se trimite o parte si se tace despre rest: ori intra toate, ori omul afla si reia.
     */
    if (error) return { error: `Nu am putut citi produsele selectate: ${error.message}` };
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
  const cfg = await configSauEroare(businessId);
  if ("error" in cfg) return cfg;
  const config = cfg.config;
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
  /** De ce l-au respins, spus de ei. `null` cand n-au avut ce spune sau n-am intrebat inca. */
  moderation_text: string | null;
  /** Cati s-au uitat. `null` inseamna „nu stim", nu „nimeni" — de-aia nu se pune zero. */
  stat_vizualizari: number | null;
  stat_telefon: number | null;
  stat_urmaritori: number | null;
}

/**
 * ⚠ ZEROUL E O AFIRMATIE (02.09.2026)
 *
 * Se citea numai `data`, si o citire picata intorcea lista goala. Ecranul spunea atunci „niciun
 * anunt trimis inca", iar cifrele de sus aratau toate zero — adica exact imaginea unui magazin
 * curat, pe un magazin care putea avea doua sute de anunturi vii la OLX.
 *
 * ⚠ Si de aici pornesc hotarari: cine vede zero apasa „Publica tot". Aceeasi lectie ca la veghea
 * care arata zero — un zero nu se raporteaza pana nu s-a confruntat cu sursa.
 */
export async function getOlxAdverts(
  businessId: string,
): Promise<{ adverts: OlxAdvertRow[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const { supabase } = g;
  const { data, error } = await supabase
    .from("olx_adverts")
    .select("product_id, offer_id, status, olx_advert_id, olx_url, valid_to, error, last_synced_at, moderation_text, stat_vizualizari, stat_telefon, stat_urmaritori, products(name)")
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return { error: "Nu am putut citi anunțurile OLX. Reîncarcă pagina peste câteva momente." };

  const adverts = (data ?? []).map((r) => {
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
      moderation_text: r.moderation_text,
      stat_vizualizari: r.stat_vizualizari,
      stat_telefon: r.stat_telefon,
      stat_urmaritori: r.stat_urmaritori,
    };
  });
  return { adverts };
}

// ── Monetization: balance, packets, paid features ──────────────────────────────────
/**
 * ⚠ ARUNCAREA CERE UN LOC DE CADERE (02.09.2026)
 *
 * `loadConfig` arunca dinadins cand baza nu raspunde — asa o configurare necitita nu se poate
 * confunda cu una goala. Dar aici nimeni nu prindea aruncarea: ea urca prin actiunea de server si
 * iesea in ecran ca eroare nedigerata („An error occurred in the Server Components render"), fara
 * niciun cuvant despre ce s-a intamplat si fara vreun buton de reincercare.
 *
 * Aruncarea e buna, locul de cadere lipsea.
 */
async function withToken<T>(businessId: string, fn: (token: string, config: OlxConfig) => Promise<T>): Promise<T | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };
  const admin = createAdminClient();
  let config: OlxConfig;
  try {
    config = await loadConfig(businessId);
  } catch {
    return { error: "Nu am putut citi setările OLX. Încearcă din nou peste câteva momente." };
  }
  if (!config.connected || !config.refresh_token) return { error: "Conectează mai întâi contul OLX." };
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
  /** Categoriile pentru care intrebarea la OLX a picat. Golul lor nu e „n-are pachete". */
  nereusite: string[];
  /** Lista pachetelor cumparate s-a citit INTREAGA? O lista scurtata arata la fel ca una completa. */
  boughtIntreg: boolean;
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
    const nereusite: string[] = [];
    let fetched = 0;
    for (const [categoryId, label] of cats) {
      if (fetched >= 20) break; // bound the panel load
      fetched++;
      const res = await getAvailablePackets(token, { category_id: categoryId, payment_method: paymentMethod, type: "all", with_features: true });
      /*
       * ⚠ O CATEGORIE A CAREI CITIRE PICA NU E O CATEGORIE FARA PACHETE (02.09.2026). Sarita
       * tacut, ecranul spunea „nu sunt pachete disponibile pentru categoriile tale" — o afirmatie
       * despre contul LUI, pe o intrebare la care n-am primit raspuns.
       */
      if (isOlxError(res)) { nereusite.push(label); continue; }
      if (Array.isArray(res.data) && res.data.length > 0) {
        groups.push({ categoryId, label, packets: res.data });
      }
      await new Promise((r) => setTimeout(r, 250)); // pace OLX calls
    }

    // Bought packets — paginate past the default page size of 50.
    const bought: OlxBoughtPacket[] = [];
    let boughtIntreg = true;
    for (let offset = 0; offset < 1000; offset += 50) {
      const res = await getBoughtPackets(token, { availability: "active", offset, limit: 50 });
      /*
       * ⚠ O PAGINA PICATA TAIA LISTA IN TACERE. Iesirea cu `break` intoarcea o lista SCURTA care
       * arata exact ca una completa. Pe un ecran unde omul se uita ca sa hotarasca daca mai cumpara
       * un pachet, o lista scurtata il face sa cumpere ce are deja.
       */
      if (isOlxError(res)) { boughtIntreg = false; break; }
      const batch = Array.isArray(res.data) ? res.data : [];
      bought.push(...batch);
      if (batch.length < 50) break;
    }

    return {
      groups, bought, paymentMethod, hasMappedCategories: cats.size > 0,
      nereusite, boughtIntreg,
    };
  });
}

/*
 * ═══ OPERATIILE CU BANI SE FAC O SINGURA DATA (01.09.2026) ═══
 *
 * Cele trei cumparari de mai jos erau apeluri goale: `POST`, si atat. Iar raspunsul lor poate fi
 * AMBIGUU — timeout, instanta taiata, retea — si atunci:
 *
 *     omul apasa „Cumpără promovare"
 *     OLX ia banii si aplica promovarea ✅
 *     raspunsul se pierde ❌ -> ecranul arata eroare
 *     omul apasa din nou -> A DOUA promovare, platita
 *
 * Si mai rau la pachetul pe anunt, unde sunt DOUA efecte: cumpararea reuseste, activarea pica,
 * actiunea intoarce eroare — iar reluarea cumpara inca o data.
 *
 * ⚠ Registrul operatiilor externe exista deja in depozit exact pentru asta, si `olx` e de mult in
 * lista lui de furnizori. Rezervarea se scrie INAINTE de apel: daca incheierea de dupa se pierde,
 * randul ramane `in_curs` si a doua apasare e REFUZATA, cu cheia in mesaj. Adica pierderea unei
 * scrieri nu mai poate produce o plata dubla, ci cel mult o operatie de lamurit.
 *
 * ⚠ CHEIA E DETERMINISTA SI POARTA CE SE CUMPARA. Doua promovari deosebite pe acelasi anunt sunt
 * doua operatii legitime; a doua apasare pe ACEEASI promovare nu e.
 *
 * ⚠ Nu se da `legaturaVie`: „deja" inseamna aici ca banii s-au dus o data, si asta nu se desface.
 */
/**
 * Refuzurile pe care le RECUNOASTEM, si numai ele, inseamna „sigur nu s-a intamplat nimic".
 *
 * ═══ „UNKNOWN" NU E O DOVADA CA PLATA N-A INTRAT (01.09.2026) ═══
 *
 * Prima varianta cauta `/insufficient|not enough|invalid|unknown|refuz/` si, la potrivire, elibera
 * slotul. Dar „Unknown error" spune exact pe dos: SERVERUL nu stie ce s-a intamplat. Eliberat pe
 * un mesaj ca acela, slotul lasa a doua apasare sa treaca — si atunci plata se face de doua ori,
 * tocmai in cazul in care nimeni nu stie daca prima a intrat.
 *
 * ⚠ LISTA E ALBA, NU NEAGRA. Se numesc situatiile in care ei ne-au spus limpede ca n-au facut
 * nimic; orice altceva, inclusiv un text pe care nu-l recunoastem, ramane `necunoscut`. Pentru o
 * operatie cu bani, indoiala se plateste cu o intrebare, nu cu inca o plata.
 */
/**
 * Ce s-a rupt la o plata: mesajul pentru OM, si ce ne-au spus EI, separat.
 *
 * ⚠ TRADUCEREA NOASTRA OMORA LISTA ALBA. Se arunca `new Error(mapPaymentError(res.error))` —
 * textul deja tradus in romana — iar verdictul cauta tiparele englezesti tocmai in textul ala.
 * Cel mai obisnuit refuz, soldul insuficient, nu se putea potrivi niciodata: iesea `necunoscut`,
 * slotul RAMANEA blocat, si omul care alimenta portofelul primea „o cumparare identica e deja in
 * curs". Vezi `src/lib/olx/verdictul-platii.ts`, unde hotararea se poate proba cu mesaje adevarate.
 */
class EroareDePlataOlx extends Error {
  constructor(mesaj: string, readonly brut: string, readonly status: number) {
    super(mesaj);
    this.name = "EroareDePlataOlx";
  }
}

function verdictOlxPlata(e: unknown): Verdict {
  if (e instanceof EroareDePlataOlx) return verdictulPlatii({ brut: e.brut, status: e.status });
  /*
   * ⚠ Orice altceva a picat INAINTE de apelul lor (o aruncare din codul nostru), deci nimic nu
   * s-a intamplat la ei. Dar aici nu se poate DOVEDI asta, si o cheie eliberata pe o presupunere
   * costa bani: ramane `necunoscut`, iar omul are butonul de lamurire.
   */
  return "necunoscut";
}

/**
 * Jetonul, luat INAINTE de registru.
 *
 * ⚠ `withToken` faceau si el trei lucruri care pot cadea: `guard`, `loadConfig` (care ARUNCA la o
 * pana de baza) si `ensureMerchantToken` (o cerere HTTP la ei, plus o scriere de config). Chemat
 * dinauntrul lui `executa`, oricare dintre ele bloca cheia unei plati pe care OLX n-o vazuse
 * niciodata — „Sesiunea OLX a expirat" ajungea sa opreasca urmatoarea cumparare.
 *
 * ⚠ Inauntrul registrului ramane acum EXACT apelul ireversibil, si nimic altceva.
 */
async function jetonulPentruPlata(
  businessId: string,
): Promise<{ token: string } | { error: string }> {
  const cfg = await configSauEroare(businessId);
  if ("error" in cfg) return cfg;
  if (!cfg.config.connected || !cfg.config.refresh_token) {
    return { error: "Conectează mai întâi contul OLX." };
  }
  const tok = await ensureMerchantToken(createAdminClient(), businessId, cfg.config);
  if ("error" in tok) return { error: tok.error };
  return { token: tok.token };
}

/** Aruncarea din `executa`, cu amandoua fetele: cea pentru om si cea pentru verdict. */
function aruncaPlata(r: OlxResult<unknown>): never {
  const e = r as { error: string; status: number };
  throw new EroareDePlataOlx(mapPaymentError(e.error), e.error, e.status);
}

/**
 * Cheia unei plati: ce se cumpara, plus INTENTIA sub care se cumpara.
 *
 * ═══ ZIUA FACEA DOUA TREBURI, SI LE FACEA PROST PE AMANDOUA (02.09.2026) ═══
 *
 * Cheia purta ziua: `promovare:123:top_ad:2026-09-01`. Deci:
 *
 *   ⚠ DEDUBLA PREA MULT. Doua cumparari legitime ale aceluiasi lucru in aceeasi zi UTC primeau
 *     aceeasi cheie. A doua intorcea `deja`, OLX nu era chemat, si Edinio raporta succes.
 *
 *   ⚠ DEDUBLA PREA PUTIN. Un timeout la 23:59, reluat la 00:01, primea alta cheie si putea plati
 *     a doua oara.
 *
 * Lucrul dupa care se deduplica nu e ziua, ci apasarea omului si toate reluarile ei. Id-ul vine de
 * la apelant si traieste in `localStorage` — vezi `src/lib/olx/intentie-de-cumparare.ts` pentru de
 * ce nu are voie sa traiasca intr-un `useRef`.
 *
 * ⚠ ID-UL SE PUNE LA COADA, niciodata in locul discriminantului. `descrieCheiaDePlata` si
 * lamurirea citesc cheia POZITIONAL (`b[2]` felul, `b[3]` anuntul, `b[4]` codul); un id pus in
 * fata ar face felul sa nu se mai potriveasca cu nicio ramura, iar orice plata nelamurita ar
 * raspunde pe veci „inca nu stim".
 */
function cheiaPlatii(ceSeCumpara: string, intentId: string): string {
  return cheieOperatie("plata", "olx", `${ceSeCumpara}:${intentId}`);
}

/**
 * ⚠ NU SE CERE FORMA DE UUID. `crypto.randomUUID` exista numai in secure context; pe
 * `http://192.168.…:3000` browserul arunca si rezerva folosita in tot depozitul nu are cratimele
 * la locul lor. Un server care ar cere strict UUID ar face cumpararea imposibila acolo, cu un
 * refuz pe care comerciantul nu-l poate nici repara, nici intelege.
 */
function intentieValida(intentId: string): boolean {
  return FORMA_INTENTIEI.test(intentId);
}

const INTENTIE_STRICATA = "Cumpărarea nu a pornit corect din pagină. Reîncarcă și încearcă din nou.";

/**
 * Raspunsul unei cumparari.
 *
 * ⚠ `nou: false` inseamna ca registrul GASISE cumpararea deja facuta sub aceeasi intentie, si OLX
 * n-a fost chemat. Deosebirea nu e cosmetica: ecranul trebuie s-o spuna, si trebuie sa ARUNCE
 * intentia, altfel un om care chiar vrea al doilea pachet ar primi „gata" la nesfarsit fara sa
 * cumpere nimic — chiar defectul de la care a pornit runda asta, mutat din cheie in browser.
 */
export type RezultatCumparare = { success: true; nou: boolean } | { error: string };

/**
 * Metoda de plata, confruntata cu ce accepta CHIAR contul lui.
 *
 * ⚠ SE CHEAMA INAINTE DE `cuRegistru`, MEREU. Pusa inauntrul lui `executa`, o citire picata ar fi
 * aruncat, iar `verdictOlxPlata` ar fi scris `necunoscut` — adica ar fi BLOCAT cheia pentru o
 * cumparare care nu s-a intamplat niciodata, fiindca OLX n-a fost chemat deloc. Inauntrul
 * registrului are voie sa stea exact un singur apel ireversibil, si nimic altceva.
 */
async function metodaDePlata(
  businessId: string, ceruta?: OlxPaymentMethod,
): Promise<{ metoda: OlxPaymentMethod } | { error: string }> {
  const r = await withToken(businessId, (token) => getPaymentMethods(token));
  const stim = citesteLista<OlxPaymentMethod>(r as OlxResult<OlxPaymentMethod[]> | { error: string });
  if (!stim.stiu) {
    /*
     * ⚠ Fail-closed, si aici pe bune: se ghicea `"account"`. Ghicitul nu producea plati duble (OLX
     * refuza limpede o metoda gresita, iar refuzul elibereaza slotul), dar producea un DIAGNOSTIC
     * MINCINOS: omului i se spunea „metoda nu e disponibila pe contul tau" cand adevarul era ca
     * n-am putut citi lista. El se apuca sa repare ceva ce n-avea nimic.
     */
    await logError({
      action: "olx.metodaDePlata", severity: "warning", businessId,
      message: `nu am putut citi metodele de plata OLX; cumpararea a fost OPRITA: ${stim.motiv}`,
    });
    return { error: "Nu am putut citi metodele de plată din contul tău OLX. Încearcă din nou peste câteva momente." };
  }
  const acceptate = stim.date;
  if (acceptate.length === 0) {
    return { error: "Contul tău OLX nu are nicio metodă de plată disponibilă prin API. Alimentează portofelul pe olx.ro." };
  }
  if (ceruta && !acceptate.includes(ceruta)) {
    return { error: `Metoda „${ceruta}" nu e disponibilă pe contul tău OLX. Disponibile: ${acceptate.join(", ")}.` };
  }
  return { metoda: ceruta ?? (acceptate.includes("account") ? "account" : acceptate[0]) };
}

/**
 * Ce se raporteaza dupa `cuRegistru`, ca sa nu se piarda tocmai sfatul potrivit.
 *
 * ⚠ MESAJUL LOR SE TRECEA PESTE. Se raspundea „Reîncarcă pagina peste câteva momente" si pentru
 * `in_curs`, si pentru `necunoscut`. Dar `mesajBlocat` are doua texte diferite, si pentru
 * `necunoscut` sfatul corect e „verifica in contul furnizorului INAINTE sa incerci din nou".
 * Sfatul gresit il trimitea pe om exact spre a doua plata.
 */
function raportCumparare(r: RezultatOperatie<true>): RezultatCumparare {
  if (r.fel === "eroare") return { error: r.mesaj };
  if (r.fel === "blocat") return { error: r.mesaj };
  return { success: true, nou: r.fel === "facut" };
}

/**
 * Pachetul cerut exista chiar asa la ei?
 *
 * ═══ ACTIUNEA DE SERVER E O ADRESA, NU UN FORMULAR (02.09.2026) ═══
 *
 * `categoryId`, `size` si `type` veneau din ecran si plecau nemodificate in `POST`-ul de
 * cumparare. Regula casei e scrisa la doua sute de linii mai sus, la harta categoriilor: „se
 * verifica AICI, nu numai in ecran". Pe un drum cu bani cu atat mai mult — o marime care nu exista
 * inseamna, in cel mai bun caz, un refuz al lor tradus intr-un mesaj care nu ajuta.
 *
 * ⚠ Si tot fail-closed: daca nu putem citi ce ofera, nu cumparam. Aceeasi regula ca la promovari.
 */
async function pachetulExista(
  token: string, categoryId: number, size: number, type: string, metoda: OlxPaymentMethod,
): Promise<{ ok: true; pret: number | null } | { error: string }> {
  const r = await getAvailablePackets(token, {
    category_id: categoryId, payment_method: metoda, type: "all", with_features: true,
  });
  const stim = citesteLista<OlxPacket>(r);
  if (!stim.stiu) {
    return { error: "Nu am putut citi pachetele oferite de OLX pentru categoria asta. Încearcă din nou peste câteva momente." };
  }
  const gasit = stim.date.find((p) => Number(p.size) === size && String(p.type ?? "base") === type);
  if (!gasit) {
    return { error: "Pachetul ales nu mai e disponibil la OLX. Reîncarcă panoul și alege din nou." };
  }
  return { ok: true, pret: typeof gasit.price === "number" ? gasit.price : null };
}

export async function buyOlxCategoryPacket(
  businessId: string, categoryId: number, size: number, paymentMethod: OlxPaymentMethod,
  intentId: string, type: "base" | "mega" = "base",
): Promise<RezultatCumparare> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  if (!intentieValida(intentId)) return { error: INTENTIE_STRICATA };

  /* ⚠ Inainte de registru: aici inca nu s-a rezervat nimic, deci un refuz nu blocheaza nicio cheie. */
  const m = await metodaDePlata(businessId, paymentMethod);
  if ("error" in m) return m;
  const jeton = await jetonulPentruPlata(businessId);
  if ("error" in jeton) return jeton;

  const oferit = await pachetulExista(jeton.token, categoryId, size, type, m.metoda);
  if ("error" in oferit) return oferit;

  const r = await cuRegistru(
    createAdminClient(),
    {
      businessId, orderId: null, fel: "plata", furnizor: "olx",
      cheie: cheiaPlatii(cePachetCategorie(categoryId, size, type), intentId),
    },
    /* ⚠ Inauntru sta EXACT apelul ireversibil: jetonul e deja luat, metoda e deja aflata. */
    async () => {
      const res = await purchaseCategoryPacket(
        jeton.token, { category_id: categoryId, size, payment_method: m.metoda, type });
      if (isOlxError(res)) aruncaPlata(res);
      return { referinta: `${categoryId}:${size}:${type}`, valoare: true as const };
    },
    verdictOlxPlata,
  );
  if (r.fel === "facut") revalidatePath(FEATURE_PATH);
  return raportCumparare(r);
}

/**
 * Cumpara un pachet pentru UN anunt si il activeaza (leacul direct pentru un anunt `limited`).
 *
 * ⚠ DOUA EFECTE, SI NUMAI UNUL COSTA BANI. Sub cheie sta numai CUMPARAREA; activarea de dupa e
 * idempotenta la ei (`400 invalid status` pe un anunt deja activ) si se poate relua oricat. Puse
 * impreuna, o activare picata ar fi tinut slotul „in curs" si a doua apasare ar fi fost refuzata,
 * desi tocmai activarea, care e gratis, mai avea de facut.
 */
export async function buyOlxAdvertPacket(
  businessId: string, advertId: number, intentId: string, isPremium = false,
): Promise<RezultatCumparare> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  if (!intentieValida(intentId)) return { error: INTENTIE_STRICATA };

  /*
   * ⚠ METODA SE AFLA INAINTE DE REGISTRU. Aici alegerea o face serverul, nu omul — dar tot
   * fail-closed: se ghicea `"account"` cand lista nu se putea citi. Ghicitul nu producea plati
   * duble (OLX refuza limpede o metoda gresita, iar refuzul limpede elibereaza slotul), dar
   * producea un DIAGNOSTIC MINCINOS: omului i se spunea „metoda de plata nu e disponibila pe
   * contul tau" cand adevarul era ca n-am putut citi lista. El se apuca sa repare ceva ce n-avea
   * nimic.
   */
  const m = await metodaDePlata(businessId);
  if ("error" in m) return m;
  const jeton = await jetonulPentruPlata(businessId);
  if ("error" in jeton) return jeton;

  const r = await cuRegistru(
    createAdminClient(),
    {
      businessId, orderId: null, fel: "plata", furnizor: "olx",
      cheie: cheiaPlatii(cePachetAnunt(advertId, isPremium), intentId),
    },
    async () => {
      const res = await purchaseAdvertPacket(
        jeton.token, advertId, { payment_method: m.metoda, is_premium: isPremium });
      if (isOlxError(res)) aruncaPlata(res);
      return { referinta: String(advertId), valoare: true as const };
    },
    verdictOlxPlata,
  );
  if (r.fel === "eroare") return { error: r.mesaj };
  /* ⚠ Mesajul LOR, nu unul fix: pentru `necunoscut` sfatul corect e altul decat „reincarca". */
  if (r.fel === "blocat") return { error: r.mesaj };

  /* Pachetul e cumparat (acum sau mai devreme). Activarea se reia fara sa mai coste nimic. */
  const act = await withToken(businessId, (token) => advertCommand(token, advertId, "activate"));
  if ("error" in act) return { error: act.error };
  if (isOlxError(act)) {
    /* ⚠ Aceeasi regula: `400` se confirma din starea LOR, nu se ia drept „deja activ". */
    if (act.status !== 400) return { error: mapPaymentError(act.error) };
    const lor = await withToken(businessId, (token) => getAdvert(token, advertId));
    if ("error" in lor || isOlxError(lor)) {
      return { error: "Pachetul e cumpărat, dar nu am putut confirma activarea. Reîncarcă pagina peste câteva momente." };
    }
    const stare = String(lor.data?.status ?? "").toLowerCase();
    if (!["active", "new", "unconfirmed"].includes(stare)) {
      return { error: `Pachetul e cumpărat, dar anunțul e în continuare „${stare}". Încearcă activarea din listă.` };
    }
  }
  revalidatePath(FEATURE_PATH);
  return { success: true, nou: r.fel === "facut" };
}

/**
 * Inchide un anunt ramas blocat de cota gratuita.
 *
 * ═══ „LIMITED" ERA UN FUND DE SAC (01.09.2026) ═══
 *
 * Un anunt `limited` exista la ei dar nu se vede: cota gratuita a categoriei s-a epuizat. Ecranul
 * ii spunea omului sa cumpere un pachet — si atat. Daca nu voia sa cumpere, anuntul ramanea acolo,
 * numarat in „limitate", pentru totdeauna.
 *
 * OLX are comanda `finish` tocmai pentru asta: muta un anunt inactiv in „incheiate". Nu e o
 * stergere — istoricul ramane la ei, si omul il poate reactiva mai tarziu cumparand un pachet.
 *
 * ⚠ Se scrie si local, altfel sondarea l-ar aduce inapoi in numarul de „limitate" la trecerea
 * urmatoare, si omul ar crede ca apasarea lui n-a facut nimic.
 */
export async function finishOlxAdvert(
  businessId: string, advertId: number,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const res = await withToken(businessId, (token) => advertCommand(token, advertId, "finish"));
  if ("error" in res) return res;
  if (isOlxError(res)) {
    /*
     * ═══ UN `400` NU E O DOVADA DE STARE (01.09.2026) ═══
     *
     * Aici se socotea orice `400` drept „e deja incheiat, deci gata". Dar `400` e familia intreaga
     * de refuzuri de validare la ei, iar concluzia gresita ii spune omului ca anuntul s-a inchis
     * cand el e in continuare acolo. Aceeasi regula ca la `stingeLaEi`: se intreaba.
     */
    if (res.status !== 400) return { error: res.error };
    const lor = await withToken(businessId, (token) => getAdvert(token, advertId));
    if ("error" in lor) return { error: "OLX a refuzat închiderea și nu am putut citi starea anunțului. Încearcă din nou." };
    if (isOlxError(lor)) {
      /* `404` = nu mai e acolo. Starea dorita e atinsa, cu varf. */
      if (lor.status !== 404) return { error: res.error };
    } else {
      const stare = String(lor.data?.status ?? "").toLowerCase();
      const INCHEIAT = ["finished", "removed_by_user", "outdated", "removed_by_moderator", "blocked", "disabled"];
      if (!INCHEIAT.includes(stare)) {
        return { error: `OLX a refuzat închiderea, iar anunțul e în continuare „${stare}": ${res.error}` };
      }
    }
  }

  const admin = createAdminClient();
  const { error } = await admin.from("olx_adverts")
    .update({ status: "finished", last_status_at: null, updated_at: new Date().toISOString() } as never)
    .eq("business_id", businessId).eq("olx_advert_id", advertId);
  if (error) {
    /* ⚠ Comanda a intrat la ei; daca marcajul local n-a intrat, sondarea il indreapta. Se spune. */
    logError({
      action: "olx.finish", severity: "warning",
      message: `anuntul s-a incheiat la OLX, dar starea locala nu s-a scris: ${error.message}`,
      details: { advertId }, businessId,
    });
  }
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
  intentId: string,
): Promise<RezultatCumparare> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  if (!intentieValida(intentId)) return { error: INTENTIE_STRICATA };

  /*
   * ⚠ SE INTREABA EI INAINTE SA SE PLATEASCA. OLX nu refuza o promovare pusa peste una care merge
   * deja: o ia, o incaseaza, si o pune peste. Cheia din registru apara de APASAREA dubla; asta
   * apara de HOTARAREA dubla — omul care a uitat ca a cumparat saptamana trecuta.
   *
   * ═══ FAIL-OPEN-UL ERA SCRIS, SI ERA SI MUT (02.09.2026) ═══
   *
   * Pana acum, daca intrebarea nu primea raspuns, se cumpara oricum. Comentariul de atunci spunea
   * „se spune insa in jurnal" — si nu exista niciun `logError` in toata functia. Deci nimeni nu
   * putea numara de cate ori a sarit verificarea, adica nimeni nu putea sti daca hotararea „riscul
   * e mic" e adevarata in productie. Comentariul minte pe cine il citeste mai tarziu.
   *
   * ⚠ DAR REPARATIA EVIDENTA AR FI FOST MAI REA DECAT DEFECTUL. „Orice eroare opreste cumpararea"
   * inseamna sa iei si `404` drept „n-am putut verifica" — iar `404` e chiar raspunsul lor pentru
   * un anunt care n-a fost promovat NICIODATA. Adica prima promovare a fiecarui anunt, pentru
   * fiecare comerciant. S-ar fi trecut de la o pierdere rara de bani la un magazin oprit pentru
   * toata lumea. `citesteLista` face tocmai deosebirea asta.
   */
  const stim = citesteLista<OlxPaidFeature>(
    await withToken(businessId, (token) => getAdvertPaidFeatures(token, advertId)),
  );
  if (!stim.stiu) {
    await logError({
      action: "olx.buyOlxPaidFeature", severity: "warning", businessId,
      message: `nu am putut verifica promovarile active pe anuntul ${advertId}; cumpararea a fost OPRITA: ${stim.motiv}`,
      details: { advertId, code },
    });
    return { error: "Nu am putut verifica ce promovări sunt active pe anunț, așa că nu am cumpărat nimic. Încearcă din nou peste câteva momente." };
  }
  const inca = promovareaEActiva(stim.date, code);
  if (inca) {
    const pana = (inca as { valid_to?: unknown }).valid_to;
    return {
      error: typeof pana === "string"
        ? `Promovarea e deja activă pe acest anunț, până pe ${new Date(pana).toLocaleDateString("ro-RO")}. Nu se cumpără a doua oară.`
        : "Promovarea e deja activă pe acest anunț. Nu se cumpără a doua oară.",
    };
  }

  const m = await metodaDePlata(businessId, paymentMethod);
  if ("error" in m) return m;
  const jeton = await jetonulPentruPlata(businessId);
  if ("error" in jeton) return jeton;

  /*
   * ⚠ SI CODUL PROMOVARII SE CONFRUNTA CU CE OFERA EI. Venea din ecran si pleca nemodificat in
   * `POST`. Actiunea de server e o adresa, nu un formular — regula e scrisa in fisierul asta, la
   * harta categoriilor. Fail-closed, ca peste tot pe drumul cu bani.
   */
  const toate = citesteLista<OlxPaidFeature>(await getPaidFeatures(jeton.token));
  if (!toate.stiu) {
    return { error: "Nu am putut citi promovările oferite de OLX. Încearcă din nou peste câteva momente." };
  }
  if (!toate.date.some((f) => f.code === code)) {
    return { error: "Promovarea aleasă nu mai e oferită de OLX. Reîncarcă panoul și alege din nou." };
  }

  const r = await cuRegistru(
    createAdminClient(),
    {
      businessId, orderId: null, fel: "plata", furnizor: "olx",
      cheie: cheiaPlatii(cePromovare(advertId, code), intentId),
    },
    async () => {
      const res = await purchasePaidFeature(jeton.token, advertId, { code, payment_method: m.metoda });
      if (isOlxError(res)) aruncaPlata(res);
      return { referinta: `${advertId}:${code}`, valoare: true as const };
    },
    verdictOlxPlata,
  );
  if (r.fel === "facut") revalidatePath(FEATURE_PATH);
  return raportCumparare(r);
}

/* ── Mesajele catre cumparatori ───────────────────────────────────────────────
 *
 * ⚠ TREI ACTIUNI MOARTE, SCOASE (02.09.2026). `getOlxThreads` si `getOlxConversation` au fost
 * inlocuite de `getOlxThreadsPage` si `deschideOlxConversatia` din `olx-mesaje.actions.ts`, iar
 * `retryOlxProduct` era un invelis de un rand peste `publishOlxProduct`. Niciuna n-avea vreun
 * apelant in `src/components` sau `src/app`.
 *
 * ⚠ Si nu erau doar cod mort: intr-un modul `"use server"`, fiecare functie exportata e un CAPAT
 * public. Trei capete care chemau OLX cu jetonul comerciantului si pe care nu le mai citea nimeni
 * — deci nimeni n-ar fi observat daca s-ar fi purtat gresit.
 *
 * `replyOlxThread` ramane: Messenger-ul chiar o cheama.
 */

/**
 * Cate fisiere pleaca odata cu un mesaj.
 *
 * ⚠ CIFRA E A NOASTRA, NU A LOR. Documentatia OLX nu spune nicaieri o limita, iar noi n-avem cont
 * de probe pe care s-o masuram. Cinci e o margine aleasa de noi ca sa nu trimitem o cerere absurda;
 * daca ei refuza mai putine, mesajul lor iese in ecran si atunci se schimba aici numarul.
 *
 * Se scrie asta pe fata fiindca un comentariu care ar spune „OLX permite cinci" ar deveni fapt
 * pentru cine il citeste peste sase luni, si nimeni n-ar mai verifica.
 */
const MAX_ATASAMENTE = 5;

export async function replyOlxThread(
  businessId: string, threadId: number, text: string, atasamente?: string[],
): Promise<{ success: true } | { error: string }> {
  const clean = text.trim();
  if (!clean) return { error: "Mesajul este gol." };

  /*
   * ⚠ CE NU PLEACA SE SPUNE, NU SE ARUNCA IN TACERE (02.09.2026)
   *
   * `postThreadMessage` filtreaza si el adresele care nu sunt `https` — si bine face, ca ultima
   * pavaza. Dar acolo filtrarea e MUTA: omul ar fi atasat o poza, ar fi apasat „Trimite", ar fi
   * vazut „Mesaj trimis" si cumparatorul n-ar fi primit nimic. Aici, unde apasa un OM, refuzul
   * trebuie sa aiba cuvinte.
   *
   * ⚠ Si adresa trebuie sa fie PUBLICA: OLX nu primeste fisierul de la noi, ci vine si-l ia de la
   * adresa data. Una din biblioteca magazinului e publica; una de pe calculatorul lui, nu.
   */
  const fisiere: string[] = [];
  if (atasamente?.length) {
    if (atasamente.length > MAX_ATASAMENTE) {
      return { error: `Poți trimite cel mult ${MAX_ATASAMENTE} fișiere odată cu un mesaj.` };
    }
    for (const url of atasamente) {
      const u = url.trim();
      if (!u) continue;
      if (!/^https:\/\//i.test(u)) {
        return { error: "Fișierele se trimit ca adrese publice https. OLX vine să le ia, deci un fișier de pe calculatorul tău nu merge." };
      }
      fisiere.push(u);
    }
  }

  const res = await withToken(businessId, (token) =>
    postThreadMessage(token, threadId, clean, fisiere.length > 0 ? fisiere : undefined));
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
