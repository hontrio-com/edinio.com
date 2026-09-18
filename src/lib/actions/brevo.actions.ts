"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "node:crypto";
import {
  pingBrevo, getLists, ensureAttributes, importContacts, splitName, toPublicBrevoConfig,
  brevoWebhookUrl, registerWebhook, deleteWebhook, getTemplates, verificaSablonDoi, asiguraComertul,
  type BrevoConfig, type BrevoList, type BrevoContactInput, type BrevoPublicConfig, type BrevoTemplate,
} from "@/lib/brevo";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { clientDeMarketplace } from "@/lib/orders/client-de-marketplace";
import { logError } from "@/lib/error-logger";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import { sincronizeazaProduseleBrevo } from "@/lib/brevo-sync";

type Supa = Awaited<ReturnType<typeof createClient>>;

async function requireOwned(businessId: string): Promise<{ supabase: Supa } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };
  return { supabase };
}

/*
 * Citirea merge cu SERVICE ROLE, nu cu clientul utilizatorului.
 *
 * Vederea `store_settings` nu mai decripteaza pentru `authenticated`, iar din
 * config se folosesc doua secrete reale: `api_key`, care pleaca la fiecare apel
 * catre Brevo, si `webhook_secret`, care intra in URL-ul de webhook si prin care
 * ne recunoastem magazinul la dezabonari. Citite cifrat, primul ar da „cheie
 * invalida", al doilea ar inregistra un webhook mort. In plus, tot obiectul se
 * scrie inapoi prin `writeConfig`, deci un `enc.v1.…` intors aici ar fi criptat
 * a doua oara peste el insusi si nu s-ar mai putea desface.
 *
 * Service role ocoleste RLS: fiecare apelant trece INTAI prin `requireOwned`
 * (`businesses.id = businessId AND businesses.user_id = auth.uid()`).
 */
async function readConfig(businessId: string): Promise<BrevoConfig | null> {
  const { data } = await createAdminClient()
    .from("store_settings").select("brevo_config").eq("business_id", businessId).single();
  return (data?.brevo_config as BrevoConfig | null) ?? null;
}

// Read-modify-write the jsonb (create the row if the store has no settings yet).
async function writeConfig(supabase: Supa, businessId: string, next: BrevoConfig | null): Promise<boolean> {
  const { data } = await supabase
    .from("store_settings").select("business_id").eq("business_id", businessId).single();
  const exists = !!data?.business_id;
  const { error } = exists
    ? await supabase.from("store_settings").update({ brevo_config: next as never }).eq("business_id", businessId)
    : await supabase.from("store_settings").insert({ business_id: businessId, brevo_config: next as never });
  return !error;
}

function revalidate() {
  revalidatePath("/dashboard/features/brevo");
  revalidatePath("/dashboard/features");
}

/** Validate an API key, store it, and return the account + its lists. */
export async function connectBrevo(
  businessId: string,
  apiKey: string,
): Promise<{ config: BrevoPublicConfig; lists: BrevoList[] } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;

  const key = apiKey.trim();
  if (!key) return { error: "Introdu cheia API Brevo." };

  const ping = await pingBrevo(key);
  if ("error" in ping) return ping;

  const current = await readConfig(businessId);
  const next: BrevoConfig = {
    ...(current ?? { enabled: false, api_key: "" }),
    enabled: true,
    api_key: key,
    account_email: ping.account_email,
    account_name: ping.account_name,
  };
  if (!(await writeConfig(owned.supabase, businessId, next))) return { error: "Eroare la salvare." };

  // Ensure our custom segmentation attributes exist (best-effort) before any contact sync.
  await ensureAttributes(next);

  const lists = await getLists(next);
  revalidate();
  return { config: toPublicBrevoConfig(next), lists: "error" in lists ? [] : lists };
}

/** Re-fetch the account's lists (for the picker / refresh). */
export async function getBrevoLists(
  businessId: string,
): Promise<{ lists: BrevoList[] } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  const config = await readConfig(businessId);
  if (!config?.api_key) return { error: "Conecteaza-ti contul Brevo intai." };
  const res = await getLists(config);
  if ("error" in res) return res;
  return { lists: res };
}

/** Sabloanele active din contul Brevo, pentru alegerea sablonului de confirmare dubla. */
export async function getBrevoTemplates(
  businessId: string,
): Promise<{ templates: BrevoTemplate[] } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  const config = await readConfig(businessId);
  if (!config?.api_key) return { error: "Conecteaza-ti contul Brevo intai." };
  const res = await getTemplates(config);
  if ("error" in res) return { error: res.error };
  return { templates: res };
}

/** Persist list choice + sync options (never touches the stored API key). */
export async function saveBrevoSettings(
  businessId: string,
  settings: {
    list_id?: number;
    list_name?: string;
    sources?: { checkout?: boolean; popup?: boolean; forms?: boolean };
    ecommerce_sync?: boolean;
    double_optin?: boolean;
    doi_template_id?: number | null;
  },
): Promise<{ config: BrevoPublicConfig; aviz?: string } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;

  const current = await readConfig(businessId);
  if (!current?.api_key) return { error: "Conecteaza-ti contul Brevo intai." };

  /*
   * ⚠ CONFIRMAREA DUBLA SE PORNESTE NUMAI CU UN SABLON DOI ADEVARAT, verificat chiar in Brevo.
   * Cu un sablon obisnuit, clientul ar fi primit un email fara linkul de confirmare, deci n-ar
   * mai fi intrat nimeni in lista, si nimic nu s-ar fi vazut.
   */
  let doi: Pick<BrevoConfig, "double_optin" | "doi_template_id" | "doi_template_name"> = {
    double_optin: current.double_optin,
    doi_template_id: current.doi_template_id,
    doi_template_name: current.doi_template_name,
  };
  if (settings.double_optin !== undefined || settings.doi_template_id !== undefined) {
    const vrea = settings.double_optin ?? !!current.double_optin;
    const sablon = settings.doi_template_id !== undefined ? settings.doi_template_id : current.doi_template_id;
    if (vrea) {
      if (!sablon || !Number.isInteger(sablon) || sablon <= 0) {
        return { error: "Alege sablonul de confirmare dubla. Il faci in Brevo, din „Double opt-in confirmation”." };
      }
      const v = await verificaSablonDoi(current, sablon);
      if ("error" in v) return { error: v.error };
      doi = { double_optin: true, doi_template_id: sablon, doi_template_name: v.name };
    } else {
      doi = { ...doi, double_optin: false };
    }
  }

  // Make sure our segmentation attributes exist (retry point if connect could not create them).
  await ensureAttributes(current);

  const next: BrevoConfig = {
    ...current,
    list_id: settings.list_id ?? current.list_id,
    list_name: settings.list_name ?? current.list_name,
    sources: { ...current.sources, ...settings.sources },
    ecommerce_sync: settings.ecommerce_sync ?? current.ecommerce_sync,
    ...doi,
    // Ensure a webhook secret exists so we can receive unsubscribe events.
    webhook_secret: current.webhook_secret || randomUUID(),
  };

  // Register the account-level unsubscribe webhook (best-effort) once a list is chosen.
  if (next.list_id) {
    const hookUrl = brevoWebhookUrl(next.webhook_secret);
    if (hookUrl) {
      const hook = await registerWebhook(next, hookUrl);
      if (!("error" in hook) && hook.id) next.webhook_id = hook.id;
      /* Fara webhook, dezabonarile din Brevo nu mai ajung la noi: se scrie, nu se inghite. */
      if ("error" in hook) {
        await logError({ action: "brevo.webhook.register", message: hook.error, businessId, severity: "warning" });
      }
    }
  }

  if (!(await writeConfig(owned.supabase, businessId, next))) return { error: "Eroare la salvare." };

  /*
   * ⚠⚠ LA PORNIREA SINCRONIZARII E-COMMERCE: activarea aplicatiei eCommerce in contul lor si moneda
   * de afisare (fara ele nimic din comert nu merge, sau venitul apare in alta moneda), apoi tot
   * catalogul. Activarea dureaza cateva minute, deci catalogul poate fi respins pana atunci: se spune
   * comerciantului, iar comenzile le reia coada singura.
   */
  let aviz: string | undefined;
  if (next.ecommerce_sync) {
    const com = await asiguraComertul(next);
    if ("error" in com) {
      await logError({ action: "brevo.ecommerce.activare", message: com.error, businessId, severity: "warning" });
      aviz = `Nu am putut activa comertul in Brevo: ${com.error}`;
    } else if (com.moneda === "in-activare") {
      aviz = "Brevo activeaza comertul in contul tau (dureaza cateva minute). Apoi apasa „Sincronizeaza catalogul”.";
    }
    if (!current.ecommerce_sync && com && !("error" in com) && com.moneda !== "in-activare") {
      dupaRaspuns(async () => {
        const r = await sincronizeazaProduseleBrevo(businessId);
        if ("error" in r) await logError({ action: "brevo.catalog.initial", message: r.error, businessId, severity: "warning" });
      }, "brevo.catalog.initial", businessId);
    }
  }

  revalidate();
  return { config: toPublicBrevoConfig(next), ...(aviz ? { aviz } : {}) };
}

/** Tot catalogul, acum (butonul „Sincronizeaza catalogul” din panou). */
export async function syncBrevoCatalog(
  businessId: string,
): Promise<{ active: number; inactive: number } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  const config = await readConfig(businessId);
  if (!config?.api_key) return { error: "Conecteaza-ti contul Brevo intai." };
  try {
    const com = await asiguraComertul(config);
    if ("error" in com) return { error: `Nu am putut activa comertul in Brevo: ${com.error}` };
    if (com.moneda === "in-activare") {
      return { error: "Brevo inca activeaza comertul in contul tau (dureaza cateva minute). Incearca din nou putin mai tarziu." };
    }
    const r = await sincronizeazaProduseleBrevo(businessId);
    if ("error" in r) return { error: r.status === 403 ? "Brevo inca activeaza comertul in contul tau. Incearca din nou peste cateva minute." : r.error };
    return { active: r.active, inactive: r.inactive };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sincronizarea catalogului a esuat." };
  }
}

/** Clear the connection entirely (removes the webhook best-effort). */
export async function disconnectBrevo(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  const current = await readConfig(businessId);
  if (current?.api_key && current.webhook_id) await deleteWebhook(current, current.webhook_id);
  if (!(await writeConfig(owned.supabase, businessId, null))) return { error: "Eroare la salvare." };
  revalidate();
  return { success: true };
}

/**
 * One-off bulk sync of existing customers (from orders) into the list, via the async
 * import endpoint. Deduped by lowercased email, newest name/phone wins, tagged with the
 * SOURCE "Clienti". The merchant confirms in the UI that they have consent to email them.
 */
export async function syncExistingCustomers(
  businessId: string,
): Promise<{ started: true; total: number } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;

  const config = await readConfig(businessId);
  if (!config?.enabled || !config.api_key || !config.list_id) {
    return { error: "Conecteaza contul si alege o lista intai." };
  }
  /*
   * ⚠ Importul (`/contacts/import`) pune contactele DIRECT in lista: Brevo n-are confirmare
   * dubla pe import. Cu ea pornita, butonul ar fi ocolit tocmai regula pe care comerciantul a
   * ales-o, pentru tot istoricul de clienti deodata.
   */
  if (config.double_optin && config.doi_template_id) {
    return { error: "Ai pornita confirmarea dubla, iar importul ar pune clientii direct in lista, fara confirmare. Opreste-o pentru import doar daca ai deja acordul lor." };
  }

  // fetchAllRows: sync-ul trebuie sa acopere TOATE comenzile, nu doar primele
  // 1000 (cap-ul silentios PostgREST) — altfel clientii vechi lipsesc din lista.
  const [orders, sup] = await Promise.all([
    fetchAllRowsStrict("brevo.syncExistingCustomers.orders", (from, to) =>
      owned.supabase
        .from("orders")
        .select("customer_email, customer_name, customer_phone, created_at, order_source")
        .eq("business_id", businessId)
        .not("customer_email", "is", null)
        /*
         * ⚠ CUMPARATORUL UNUI MARKETPLACE NU E CLIENTUL COMERCIANTULUI.
         *
         * Butonul „Sincronizeaza clientii existenti" ia TOT istoricul de comenzi al
         * magazinului. Fara randul de mai jos, o singura apasare ducea in lista de marketing
         * fiecare cumparator Pepita, eMAG, Trendyol si About You, cu tot cu emailul lui, care
         * la marketplace e adesea un ALIAS al platformei. Vezi `clientDeMarketplace`.
         *
         * Filtrul e in SQL ca sa nu-i aduca deloc, si e acelasi predicat cu care lista de
         * comenzi din panou desparte „Magazin" de marketplace-uri. „Fara marker" prinde si
         * comenzile vechi, care n-au deloc `order_source`.
         */
        .is("order_source->>marketplace", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to)
    ),
    fetchAllRowsStrict("brevo.syncExistingCustomers.suppressions", (from, to) =>
      owned.supabase.from("brevo_suppressions").select("email").eq("business_id", businessId).order("id").range(from, to)
    ),
  ]);
  const suppressed = new Set(sup.map((s) => s.email.toLowerCase()));

  const seen = new Set<string>();
  const contacts: BrevoContactInput[] = [];
  for (const o of orders) {
    /*
     * ⚠ A DOUA trecere peste acelasi adevar, si nu e de prisos: pazeste ziua in care cineva
     * schimba interogarea de mai sus si scoate filtrul fara sa se uite incoace.
     */
    if (clientDeMarketplace(o.order_source)) continue;
    const email = (o.customer_email ?? "").trim().toLowerCase();
    if (!email || seen.has(email) || suppressed.has(email)) continue;
    seen.add(email);
    const { fname, lname } = splitName(o.customer_name);
    contacts.push({ email, fname, lname, phone: o.customer_phone ?? undefined, source: "Clienti" });
  }
  if (contacts.length === 0) return { started: true, total: 0 };

  const res = await importContacts(config, contacts);
  if ("error" in res) return res;

  await writeConfig(owned.supabase, businessId, { ...config, last_sync_at: new Date().toISOString() });
  revalidate();
  return { started: true, total: contacts.length };
}
