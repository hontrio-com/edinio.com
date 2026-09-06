"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { buildAuthUrl, signState, googleMerchantConfigured, getAccessToken } from "@/lib/google-merchant/oauth";
import { listAccounts, registerGcp, listDataSources, createApiDataSource, createNotificationSubscription, deleteNotificationSubscription, listAccountIssues } from "@/lib/google-merchant/client";
import { PLATFORM_ORIGIN } from "@/lib/seo";
import {
  DEFAULT_FEED_LABEL, DEFAULT_CONTENT_LANGUAGE, DEFAULT_COUNTRY, type GoogleMerchantConfig,
} from "@/lib/google-merchant/types";
import { logError } from "@/lib/error-logger";

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
 * deci pe clientul utilizatorului vederea intoarce `refresh_token` ca sirul
 * `enc.v1.…`. Trimis asa la Google, produce `invalid_grant` si mesajul
 * „Sesiunea Google a expirat." la listarea conturilor, la selectia contului, la
 * problemele de cont si la deconectare (unde abonamentul de notificari ramanea
 * viu pe contul comerciantului). Callback-ul OAuth, webhook-ul si cronul
 * `gmc-sync` citesc deja cu service role.
 *
 * Service role ocoleste RLS, deci proprietatea magazinului TREBUIE dovedita
 * separat. Toti apelantii cheama `ownedBusiness()` inainte.
 *
 * Parametrul cu clientul utilizatorului a fost SCOS dinadins: lasat pe loc, ar
 * fi invitat pe urmatorul sa creada ca citirea se face cu el.
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
async function loadConfig(businessId: string): Promise<GoogleMerchantConfig> {
  const { data, error } = await createAdminClient()
    .from("store_settings").select("google_merchant_config").eq("business_id", businessId).maybeSingle();
  if (error) {
    throw new Error(`Configurarea nu s-a putut citi: ${error.message}`);
  }
  return ((data?.google_merchant_config as GoogleMerchantConfig) ?? {}) || {};
}

async function saveConfig(supabase: ServerClient, businessId: string, config: GoogleMerchantConfig): Promise<boolean> {
  const { data: existing } = await supabase
    .from("store_settings").select("id").eq("business_id", businessId).single();
  if (existing) {
    const { error } = await supabase.from("store_settings")
      .update({ google_merchant_config: config as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId);
    return !error;
  }
  const { error } = await supabase.from("store_settings")
    .insert({ business_id: businessId, google_merchant_config: config as never });
  return !error;
}

/**
 * ⚠ Statusul scris de NOI cand o oferta e retrasa fiindca `products.price` nu e suma platita
 * pe pagina. Nu vine de la Google, deci nu e nici „active", nici „pending", nici „disapproved".
 *
 * Sirul asta e scris in `src/app/api/cron/gmc-sync/route.ts` (`STARE_EXCLUS`) si citit in
 * `GoogleMerchantClient` (`StatusBadge`). Nu se importa dintr-un loc in altul fiindca ruta de
 * cron trage dupa ea `next/server` si tot cronul in pachetul actiunii; costul e ca sirul se
 * schimba in TREI locuri deodata sau in niciunul.
 */
const STARE_EXCLUS = "exclus";

// ── Status (for the dashboard) ──────────────────────────────────────────────────
export interface MerchantStatus {
  configured: boolean;
  hasDomain: boolean;
  connected: boolean;
  needsAccount: boolean;       // OAuth done but no account picked yet
  accountId?: string;
  accountName?: string;
  email?: string;
  feedLabel: string;
  contentLanguage: string;
  country: string;
  autoSync: boolean;
  brandDefault?: string;
  conditionDefault: string;
  lastSyncAt?: string;
  categoryMap: Record<string, string>;
  counts: { total: number; synced: number; active: number; pending: number; disapproved: number; queued: number };
}

export async function getMerchantStatus(businessId: string): Promise<MerchantStatus | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const biz = await ownedBusiness(supabase, businessId, user.id);
  if (!biz) return { error: "Magazin negasit" };

  const config = await loadConfig(businessId);

  // Numaratori exclusiv prin count/head (exacte la orice volum) — fetch-ul de
  // randuri pentru numarat se trunchia silentios la 1000 (cap PostgREST).
  /*
   * ⚠ „PRODUSE ACTIVE" NUMARA CE E CHIAR LA VANZARE, nu cate randuri sunt in tabel.
   *
   * Randul retras de noi (`exclus`) si randul ramas in eroare exista in `gmc_products`, dar
   * niciunul n-are oferta la Google. Numarate laolalta cu restul, casuta arata un numar mai
   * mare decat adevarul — si tocmai din casuta aia isi face comerciantul parerea daca
   * integrarea merge; un fototapet retras il facea sa creada ca inca se vinde.
   *
   * ⚠ Celelalte numaratori NU au patania asta, si s-au citit ca sa se stie, nu s-a presupus:
   * `active`/`pending`/`disapproved` filtreaza fiecare pe cate un status anume (deci `exclus`
   * si `error` cad singure), `queued` numara in alt tabel (coada), iar `total` numara produsele
   * active din catalog, care habar n-au de Google.
   */
  const [{ count: total }, { count: synced }, { count: activeCnt }, { count: pendingCnt }, { count: disapprovedCnt }, { count: queued }] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("is_active", true),
    supabase.from("gmc_products").select("id", { count: "exact", head: true }).eq("business_id", businessId)
      .not("status", "in", `(${STARE_EXCLUS},error)`),
    supabase.from("gmc_products").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "active"),
    supabase.from("gmc_products").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "pending"),
    supabase.from("gmc_products").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "disapproved"),
    supabase.from("gmc_sync_queue").select("id", { count: "exact", head: true }).eq("business_id", businessId),
  ]);
  const counts = {
    total: total ?? 0,
    synced: synced ?? 0,
    active: activeCnt ?? 0,
    pending: pendingCnt ?? 0,
    disapproved: disapprovedCnt ?? 0,
    queued: queued ?? 0,
  };

  return {
    configured: googleMerchantConfigured(),
    hasDomain: !!biz.custom_domain,
    connected: !!config.connected && !!config.account_id,
    needsAccount: !!config.refresh_token && !config.account_id,
    accountId: config.account_id,
    accountName: config.account_name,
    email: config.connected_email,
    feedLabel: config.feed_label || DEFAULT_FEED_LABEL,
    contentLanguage: config.content_language || DEFAULT_CONTENT_LANGUAGE,
    country: config.country || DEFAULT_COUNTRY,
    autoSync: config.auto_sync !== false,
    brandDefault: config.brand_default,
    conditionDefault: config.condition_default || "new",
    lastSyncAt: config.last_sync_at,
    categoryMap: config.category_map ?? {},
    counts,
  };
}

// ── Category mapping (Edinio category -> Google product category) ────────────────
export async function setCategoryMap(
  businessId: string, map: Record<string, string>,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownedBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  const config = await loadConfig(businessId);
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) if (k && v) clean[k] = v;
  const ok = await saveConfig(supabase, businessId, { ...config, category_map: clean });
  if (!ok) return { error: "Eroare la salvare." };
  revalidatePath("/dashboard/features/google-merchant");
  return { success: true };
}

// ── OAuth start ──────────────────────────────────────────────────────────────────
export async function startGoogleMerchantOAuth(businessId: string): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const biz = await ownedBusiness(supabase, businessId, user.id);
  if (!biz) return { error: "Magazin negasit" };
  if (!googleMerchantConfigured()) return { error: "Integrarea Google nu este configurata pe server." };
  return { url: buildAuthUrl(signState(businessId)) };
}

// ── Account discovery + selection ────────────────────────────────────────────────
export async function listMerchantAccounts(businessId: string): Promise<{ accounts: { id: string; name: string }[] } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownedBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  const config = await loadConfig(businessId);
  if (!config.refresh_token) return { error: "Conecteaza-te mai intai cu Google." };
  const token = await getAccessToken(config.refresh_token);
  if (!token) return { error: "Sesiunea Google a expirat. Reconecteaza-te." };

  const res = await listAccounts(token);
  if ("error" in res) {
    logError({ action: "gmc.listAccounts", message: res.error, details: { businessId }, userId: user.id });
    // Token lacks the Shopping (`content`) scope — the stored connection was
    // granted without it. Point to the reconnect button rather than the raw error.
    if (/insufficient.*scope|scope.*insufficient|insufficient_scope|ACCESS_TOKEN_SCOPE/i.test(res.error)) {
      return { error: "Conexiunea Google nu include permisiunea pentru Google Shopping. Apasa \"Reconecteaza contul Google\" mai jos si lasa BIFATA permisiunea de gestionare a produselor Shopping." };
    }
    // v1 requires developer registration even for listing; if it was removed
    // (e.g. app deleted from Merchant Center), the manual-ID path below the
    // list re-registers automatically via selectMerchantAccount -> registerGcp.
    if (/not registered/i.test(res.error)) {
      return { error: "Aplicatia Edinio nu mai este inregistrata pe contul tau Merchant Center. Introdu manual ID-ul contului (il gasesti in Merchant Center, coltul din dreapta-sus) si apasa Conecteaza - inregistrarea se reface automat." };
    }
    return { error: res.error };
  }
  const accounts = (res.data.accounts ?? []).map((a) => ({
    id: (a.accountId ?? a.name?.split("/").pop() ?? "").toString(),
    name: a.accountName ?? a.name ?? "",
  })).filter((a) => a.id);
  return { accounts };
}

export async function selectMerchantAccount(
  businessId: string, accountId: string, accountName?: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownedBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  const config = await loadConfig(businessId);
  if (!config.refresh_token) return { error: "Conecteaza-te mai intai cu Google." };
  const token = await getAccessToken(config.refresh_token);
  if (!token) return { error: "Sesiunea Google a expirat. Reconecteaza-te." };

  const feedLabel = config.feed_label || DEFAULT_FEED_LABEL;
  const lang = config.content_language || DEFAULT_CONTENT_LANGUAGE;

  // v1 prerequisite: register our GCP project against this account before any
  // write op. Re-registering an already-registered project returns an
  // ALREADY_EXISTS-style error we treat as success; any other failure is real
  // (e.g. the user is not an admin of the Merchant account) and must stop here.
  const reg = await registerGcp(token, accountId, config.connected_email);
  if ("error" in reg && reg.status !== 409 && !/already/i.test(reg.error)) {
    logError({ action: "gmc.registerGcp", message: reg.error, details: { businessId, accountId }, userId: user.id });
    // "Insufficient authentication scopes" is NOT an admin/T&C problem — the Google
    // connection simply lacks the Shopping (`content`) permission. Guide the real fix.
    if (/insufficient.*scope|scope.*insufficient|insufficient_scope|ACCESS_TOKEN_SCOPE/i.test(reg.error)) {
      return { error: "Conexiunea Google nu include permisiunea pentru Google Shopping. Deconecteaza-te si reconecteaza-te, iar pe ecranul Google lasa BIFATA permisiunea de gestionare a produselor pentru Google Shopping (nu o debifa)." };
    }
    if (/unverified homepage/i.test(reg.error)) {
      return { error: "Contul Merchant nu are homepage-ul verificat (cerinta Google pentru integrare). In Merchant Center: Setari -> Informatii despre afacere -> Site web -> verifica si revendica site-ul, apoi reincearca aici." };
    }
    return { error: `Google a refuzat inregistrarea aplicatiei pe contul Merchant: ${reg.error}. Verifica ca esti administrator al contului Merchant Center si ca ai acceptat Termenii si conditiile in Merchant Center.` };
  }

  // Ensure an API data source exists (reuse one named "Edinio" if present).
  let dataSourceName = config.data_source_name;
  const list = await listDataSources(token, accountId);
  if (!("error" in list)) {
    const existing = (list.data.dataSources ?? []).find((d) => (d.displayName ?? "").startsWith("Edinio"));
    if (existing) dataSourceName = existing.name;
  }
  if (!dataSourceName) {
    const created = await createApiDataSource(token, accountId, "Edinio", feedLabel, lang);
    if ("error" in created) {
      logError({ action: "gmc.createDataSource", message: created.error, details: { businessId, accountId }, userId: user.id });
      // Fresh GCP registrations take ~5 minutes to propagate on Google's side.
      if (/not registered/i.test(created.error)) {
        return { error: "Google tocmai a inregistrat aplicatia Edinio pe contul tau Merchant. Propagarea dureaza cateva minute - reincearca in ~5 minute (alege din nou contul)." };
      }
      // Registration exists but the account lacks an active API developer user.
      if (/API_DEVELOPER/i.test(created.error)) {
        return { error: "Contul Merchant are nevoie de un utilizator activ cu rolul \"API developer\". In Merchant Center: Setari -> Persoane si acces -> deschide utilizatorul tau -> bifeaza rolul \"API developer\" -> salveaza (daca utilizatorul e in asteptare, accepta mai intai invitatia de pe email). Apoi reincearca aici." };
      }
      if (/unverified homepage/i.test(created.error)) {
        return { error: "Contul Merchant nu are homepage-ul verificat. In Merchant Center: Setari -> Informatii despre afacere -> Site web -> verifica si revendica site-ul, apoi reincearca aici." };
      }
      return { error: `Nu am putut crea sursa de date Google: ${created.error}` };
    }
    dataSourceName = created.data.name;
  }

  // Subscribe to product-status-change push notifications (real-time statuses).
  let subscriptionName = config.notification_subscription_name;
  if (!subscriptionName) {
    const webhookSecret = process.env.GMC_WEBHOOK_SECRET;
    const callbackUri = `${PLATFORM_ORIGIN}/api/google-merchant/webhook${webhookSecret ? `?token=${encodeURIComponent(webhookSecret)}` : ""}`;
    const sub = await createNotificationSubscription(token, accountId, callbackUri);
    if (!("error" in sub)) subscriptionName = sub.data.name;
  }

  const ok = await saveConfig(supabase, businessId, {
    ...config,
    connected: true,
    account_id: accountId,
    account_name: accountName ?? config.account_name,
    data_source_name: dataSourceName,
    notification_subscription_name: subscriptionName,
    feed_label: feedLabel,
    content_language: lang,
    country: config.country || DEFAULT_COUNTRY,
    auto_sync: config.auto_sync !== false,
  });
  if (!ok) return { error: "Eroare la salvare." };
  revalidatePath("/dashboard/features/google-merchant");
  return { success: true };
}

export async function disconnectMerchant(businessId: string): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownedBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  const config = await loadConfig(businessId);
  if (config.refresh_token && config.notification_subscription_name) {
    const token = await getAccessToken(config.refresh_token);
    if (token) await deleteNotificationSubscription(token, config.notification_subscription_name);
  }
  await saveConfig(supabase, businessId, {});
  const admin = createAdminClient();
  await admin.from("gmc_products").delete().eq("business_id", businessId);
  await admin.from("gmc_sync_queue").delete().eq("business_id", businessId);
  revalidatePath("/dashboard/features/google-merchant");
  return { success: true };
}

export async function setMerchantSettings(
  businessId: string,
  settings: { feed_label?: string; content_language?: string; country?: string; brand_default?: string; condition_default?: "new" | "refurbished" | "used"; auto_sync?: boolean },
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownedBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  const config = await loadConfig(businessId);
  const ok = await saveConfig(supabase, businessId, {
    ...config,
    feed_label: settings.feed_label?.trim() || config.feed_label || DEFAULT_FEED_LABEL,
    content_language: settings.content_language?.trim() || config.content_language || DEFAULT_CONTENT_LANGUAGE,
    country: settings.country?.trim() || config.country || DEFAULT_COUNTRY,
    brand_default: settings.brand_default?.trim() || undefined,
    condition_default: settings.condition_default || config.condition_default || "new",
    auto_sync: settings.auto_sync ?? config.auto_sync ?? true,
  });
  if (!ok) return { error: "Eroare la salvare." };
  revalidatePath("/dashboard/features/google-merchant");
  return { success: true };
}

// ── Bulk sync (enqueue all active products) ──────────────────────────────────────
export async function queueSyncAll(businessId: string): Promise<{ queued: number } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  if (!(await ownedBusiness(supabase, businessId, user.id))) return { error: "Magazin negasit" };

  const config = await loadConfig(businessId);
  if (!config.connected || !config.account_id) return { error: "Conecteaza mai intai Google Merchant." };

  // Windowed: catalogul intreg intra in coada, nu doar primele 1000 de produse.
  const products = await fetchAllRowsStrict("gmc.queueSyncAll.products", (from, to) =>
    supabase.from("products").select("id").eq("business_id", businessId).eq("is_active", true).order("id").range(from, to)
  );
  const rows = products.map((p) => ({ business_id: businessId, product_id: p.id, offer_id: p.id, op: "upsert" }));
  if (rows.length === 0) return { queued: 0 };

  const admin = createAdminClient();
  for (let i = 0; i < rows.length; i += 1000) {
    await admin.from("gmc_sync_queue").upsert(rows.slice(i, i + 1000) as never, { onConflict: "business_id,offer_id,op" });
  }
  revalidatePath("/dashboard/features/google-merchant");
  return { queued: rows.length };
}

// ── Product status list (for the table) ──────────────────────────────────────────
export interface MerchantProductRow {
  product_id: string;
  name: string;
  offer_id: string;
  status: string;
  issues: { code?: string; severity?: string; description?: string; detail?: string; documentationUri?: string; resolution?: string; attribute?: string }[];
  last_synced_at: string | null;
  error: string | null;
}

/** Cate randuri intra intr-o felie a tabelului „Produse in Google". Sunt DOUA felii, vezi jos. */
const LIMITA_LISTA = 200;

/** Aceleasi coloane in amandoua feliile: randurile lor ajung intr-o singura lista. */
const COLOANE_LISTA = "product_id, offer_id, status, issues, last_synced_at, error, products(name)";

export async function getMerchantProducts(businessId: string): Promise<MerchantProductRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  if (!(await ownedBusiness(supabase, businessId, user.id))) return [];

  /*
   * ═══ ⚠ RANDUL CARE ARE CEVA DE SPUS NU ARE VOIE SA CADA SUB TAIETURA ═══
   *
   * Felia obisnuita e sortata dupa `last_status_at` si taiata la 200. Randul retras de noi are
   * `last_status_at` GOL dinadins — asa prima verificare de status vine imediat ce comerciantul
   * repara pretul, nu peste pana la o jumatate de ora — deci sortarea il aseaza ultimul. Pe un
   * magazin cu peste 200 de randuri care au deja o data, motivul retragerii nu se vedea
   * NICIODATA: produsul disparea de la vanzare fara o vorba, adica exact tacerea pe care randul
   * acela a fost scris ca s-o rupa. Aceeasi soarta o aveau randurile `error` mai vechi.
   *
   * ⚠ SE REPARA LA CITIRE, nu punand o data pe randul retras. O data pusa acolo l-ar face sa
   * arate proaspat, dar ar amana cu pana la 30 de minute prima verificare de status de dupa
   * reparatia pretului — adica am fi platit vizibilitatea cu intarziere la revenire.
   *
   * ⚠ CE COSTA: o a doua interogare la fiecare deschidere a panoului, si o lista care poate
   * ajunge la 400 de randuri in loc de 200. Sortarea feliei obisnuite ramane neatinsa; randurile
   * cu motiv trec doar inaintea ei, fiindca ele sunt cele la care comerciantul are de facut ceva.
   */
  const [cuMotiv, recente] = await Promise.all([
    supabase
      .from("gmc_products")
      .select(COLOANE_LISTA)
      .eq("business_id", businessId)
      .or(`status.eq.${STARE_EXCLUS},status.eq.error,error.not.is.null`)
      .order("updated_at", { ascending: false })
      .limit(LIMITA_LISTA),
    supabase
      .from("gmc_products")
      .select(COLOANE_LISTA)
      .eq("business_id", businessId)
      .order("last_status_at", { ascending: false, nullsFirst: false })
      .limit(LIMITA_LISTA),
  ]);
  /*
   * ⚠ O cadere a feliei cu motive nu are voie sa treaca drept „n-are nimic de spus": panoul ar
   * arata linistit exact acolo unde omul vine sa afle de ce nu mai vinde. Lista obisnuita se
   * arata mai departe (mai bine ceva decat un ecran gol), dar caderea se scrie in jurnal.
   */
  if (cuMotiv.error) {
    logError({
      action: "gmc.getMerchantProducts", message: `felia cu motive nu s-a putut citi: ${cuMotiv.error.message}`,
      details: { businessId }, userId: user.id,
    });
  }

  /* Acelasi rand poate fi in amandoua feliile: cheia lui e `offer_id`, nu produsul (variantele
     au cate un rand fiecare, pe acelasi `product_id`). */
  const vazute = new Set<string>();
  const data = [...(cuMotiv.data ?? []), ...(recente.data ?? [])].filter((r) => {
    if (vazute.has(r.offer_id)) return false;
    vazute.add(r.offer_id);
    return true;
  });

  return data.map((r) => {
    const prod = r.products as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(prod) ? prod[0]?.name : prod?.name;
    return {
      product_id: r.product_id,
      name: name ?? "Produs",
      offer_id: r.offer_id,
      status: r.status,
      issues: Array.isArray(r.issues) ? (r.issues as MerchantProductRow["issues"]) : [],
      last_synced_at: r.last_synced_at,
      error: r.error,
    };
  });
}

// ── Account-level issues (surfaces WHY products may be disapproved: shipping/tax
// not set up in Merchant Center, policy problems, etc. — not visible per-product). ─
export interface MerchantAccountIssueRow { title: string; severity: string; detail?: string; documentationUri?: string; }

export async function getMerchantAccountIssues(businessId: string): Promise<MerchantAccountIssueRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  if (!(await ownedBusiness(supabase, businessId, user.id))) return [];

  const config = await loadConfig(businessId);
  if (!config.connected || !config.account_id || !config.refresh_token) return [];
  const token = await getAccessToken(config.refresh_token);
  if (!token) return [];

  const res = await listAccountIssues(token, config.account_id);
  if ("error" in res) return [];
  return (res.data.accountIssues ?? [])
    .map((i) => ({ title: i.title ?? "Problemă cont", severity: (i.severity ?? "").toUpperCase(), detail: i.detail, documentationUri: i.documentationUri }))
    .filter((i) => i.severity === "CRITICAL" || i.severity === "ERROR");
}
