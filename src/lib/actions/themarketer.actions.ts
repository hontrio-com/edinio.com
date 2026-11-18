"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { testeazaConexiunea } from "@/lib/themarketer/client";
import {
  amprentaCheii, cheieNoua, formaCheieValida, inregistreazaCheia, stingeCheileVechi,
} from "@/lib/themarketer/chei";
import {
  MODULE_IMPLICITE, cheieRestValida, cheieUrmarireValida, curataCheie, idClientValid, theMarketerGata,
  type TheMarketerConfig,
} from "@/lib/themarketer/config";
import { citesteConfig } from "@/lib/themarketer/server";

/*
  Actiunile paginii theMarketer.

  ⚠ "use server": FIECARE export de aici e o actiune care se poate chema din browser. Nimic altceva nu se
  exporta (vezi „use server expune fiecare export”). Fiecare incepe cu `requireOwned`.

  ⚠ CITIREA CU CHEIA DE SERVICIU, SCRIEREA CU CLIENTUL OMULUI. Citita cu clientul lui, configurarea vine
  cu secretele cifrate (`enc.v1.…`), iar scrisa inapoi asa ar fi fost cifrata a doua oara. Scrierea trece
  prin vederea `store_settings`, care cripteaza secretele si pe care RLS o margineste la magazinul lui.

  ⚠ O CITIRE CAZUTA NU SCRIE NIMIC: configurarea se scrie intreaga, deci o citire picata tratata ca
  „nimic salvat” ar fi sters cheile si modulele.
*/

type Supa = Awaited<ReturnType<typeof createClient>>;

async function requireOwned(businessId: string): Promise<{ supabase: Supa } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  if (!biz) return { error: "Magazin negăsit" };
  return { supabase };
}

async function citesteSigur(businessId: string): Promise<{ config: TheMarketerConfig | null } | { error: string }> {
  try {
    return { config: await citesteConfig(businessId) };
  } catch (e) {
    await logError({ action: "themarketer.citire", message: e instanceof Error ? e.message : "citire", businessId, severity: "error" });
    return { error: "Setările theMarketer nu s-au putut citi. Încearcă din nou." };
  }
}

async function scrie(supabase: Supa, businessId: string, next: TheMarketerConfig | null): Promise<boolean> {
  const { data } = await supabase.from("store_settings").select("business_id").eq("business_id", businessId).maybeSingle();
  const { error } = data?.business_id
    ? await supabase.from("store_settings").update({ themarketer_config: next as never }).eq("business_id", businessId)
    : await supabase.from("store_settings").insert({ business_id: businessId, themarketer_config: next as never });
  if (error) await logError({ action: "themarketer.scriere", message: error.message, businessId, severity: "error" });
  return !error;
}

function revalideaza() {
  revalidatePath("/dashboard/features/themarketer");
  revalidatePath("/dashboard/features");
}

type Chei = { tracking_key?: string; customer_id?: string; rest_key?: string };
type Raspuns = { ok: true } | { error: string; camp?: "tracking_key" | "customer_id" | "rest_key" | null };

/** Cheile din formular, cu cheia REST pastrata cand campul ei a ramas gol (e scrisa o singura data). */
function cheileCerute(chei: Chei, salvata: TheMarketerConfig | null): { tracking_key: string; customer_id: string; rest_key: string } | Raspuns {
  const tracking_key = curataCheie(chei.tracking_key);
  const customer_id = curataCheie(chei.customer_id);
  const rest_key = curataCheie(chei.rest_key) || curataCheie(salvata?.rest_key);
  if (!cheieUrmarireValida(tracking_key)) {
    return { error: "Tracking Key-ul lipsește sau are caractere nepermise (doar litere, cifre, - și _).", camp: "tracking_key" };
  }
  if (!idClientValid(customer_id)) return { error: "Completează Customer ID-ul, fără spații.", camp: "customer_id" };
  if (!cheieRestValida(rest_key)) return { error: "Completează REST API Key-ul, fără spații.", camp: "rest_key" };
  return { tracking_key, customer_id, rest_key };
}

/** „Testează conexiunea”: verifica toate cele trei chei la theMarketer, fara sa salveze nimic. */
export async function testeazaTheMarketer(businessId: string, chei: Chei): Promise<Raspuns> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  const citit = await citesteSigur(businessId);
  if ("error" in citit) return citit;
  const c = cheileCerute(chei, citit.config);
  if ("error" in c || "ok" in c) return c;
  const r = await testeazaConexiunea(c);
  return r.ok ? { ok: true } : { error: r.mesaj, camp: r.camp };
}

/**
 * Leaga contul: proba la theMarketer, apoi salvarea. Cheile pe care theMarketer le respinge nu se
 * salveaza. La prima legare se nasc cheia adreselor si modulele implicite.
 */
export async function conecteazaTheMarketer(businessId: string, chei: Chei): Promise<Raspuns> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  const citit = await citesteSigur(businessId);
  if ("error" in citit) return citit;
  const salvata = citit.config;
  const c = cheileCerute(chei, salvata);
  if ("error" in c || "ok" in c) return c;

  const proba = await testeazaConexiunea(c);
  if (!proba.ok) return { error: proba.mesaj, camp: proba.camp };

  const admin = createAdminClient();
  let cheieFeed = curataCheie(salvata?.cheie_feed);
  const noua = !formaCheieValida(cheieFeed);
  if (noua) {
    cheieFeed = cheieNoua();
    try {
      await inregistreazaCheia(admin, businessId, cheieFeed);
    } catch (e) {
      await logError({ action: "themarketer.cheie", message: e instanceof Error ? e.message : "cheie", businessId, severity: "error" });
      return { error: "Nu am putut pregăti adresele pentru theMarketer. Încearcă din nou." };
    }
  }

  const next: TheMarketerConfig = {
    /* Modulele alese deja raman; la prima legare, implicitele (cele cu date personale pornesc oprite). */
    ...MODULE_IMPLICITE,
    abonati: { ...MODULE_IMPLICITE.abonati },
    ...(salvata ?? {}),
    enabled: true,
    tracking_key: c.tracking_key,
    customer_id: c.customer_id,
    rest_key: c.rest_key,
    cheie_feed: cheieFeed,
    testat_la: new Date().toISOString(),
  };
  if (!(await scrie(owned.supabase, businessId, next))) return { error: "Eroare la salvare. Încearcă din nou." };

  /* ⚠ ULTIMA: cheile vechi se sting abia dupa ce cea noua e si in configurare. */
  if (noua) {
    try {
      await stingeCheileVechi(admin, businessId, amprentaCheii(cheieFeed));
    } catch {
      /* O cheie veche ramasa vie nu strica nimic acum; se stinge la urmatoarea rotire. */
    }
  }
  revalideaza();
  return { ok: true };
}

export type ModuleTheMarketer = Pick<TheMarketerConfig,
  "urmarire" | "captura_email" | "comenzi" | "coduri" | "export_comenzi" | "recenzii" | "fidelitate" | "push" | "dezabonari" | "anonimizare"
> & { abonati?: { checkout?: boolean; popup?: boolean; forms?: boolean } };

const MODULE = ["urmarire", "captura_email", "comenzi", "coduri", "export_comenzi", "recenzii", "fidelitate", "push", "dezabonari", "anonimizare"] as const;

/** Salveaza comutatoarele modulelor. Nu atinge cheile. */
export async function salveazaModuleleTheMarketer(businessId: string, module: ModuleTheMarketer): Promise<Raspuns> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  const citit = await citesteSigur(businessId);
  if ("error" in citit) return citit;
  const salvata = citit.config;
  if (!theMarketerGata(salvata)) return { error: "Conectează întâi contul theMarketer." };

  /* Numai valori booleene, numai pe numele cunoscute: restul corpului venit din browser se ignora. */
  const curate: Partial<TheMarketerConfig> = {};
  for (const m of MODULE) {
    if (typeof module?.[m] === "boolean") curate[m] = module[m];
  }
  const abonati = { ...(salvata.abonati ?? {}) };
  for (const s of ["checkout", "popup", "forms"] as const) {
    if (typeof module?.abonati?.[s] === "boolean") abonati[s] = module.abonati[s];
  }
  const next: TheMarketerConfig = { ...salvata, ...curate, abonati };
  if (!(await scrie(owned.supabase, businessId, next))) return { error: "Eroare la salvare. Încearcă din nou." };
  revalideaza();
  return { ok: true };
}

/**
 * O cheie noua pentru adrese (feeduri, coduri, webhookuri). Cea veche moare pe loc: adresele trebuie
 * lipite din nou in theMarketer. Pentru o adresa scapata pe undeva (o captura de ecran, un email).
 */
export async function rotesteCheiaTheMarketer(businessId: string): Promise<Raspuns> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  const citit = await citesteSigur(businessId);
  if ("error" in citit) return citit;
  const salvata = citit.config;
  if (!theMarketerGata(salvata)) return { error: "Conectează întâi contul theMarketer." };

  const admin = createAdminClient();
  const cheie = cheieNoua();
  try {
    await inregistreazaCheia(admin, businessId, cheie);
  } catch (e) {
    await logError({ action: "themarketer.rotire", message: e instanceof Error ? e.message : "rotire", businessId, severity: "error" });
    return { error: "Nu am putut genera cheia nouă. Încearcă din nou." };
  }
  if (!(await scrie(owned.supabase, businessId, { ...salvata, cheie_feed: cheie }))) {
    return { error: "Eroare la salvare. Adresele vechi merg în continuare." };
  }
  try {
    await stingeCheileVechi(admin, businessId, amprentaCheii(cheie));
  } catch {
    return { error: "Cheia nouă e salvată, dar cea veche n-a putut fi oprită. Mai apasă o dată." };
  }
  revalideaza();
  return { ok: true };
}

/**
 * Deconectarea: sterge TOATA configurarea (cheile, modulele), opreste toate trimiterile si stinge adresele.
 *
 * ⚠ VEDEREA NU PAZESTE SECRETELE. Masurat in productie pe 18.11.2026: o scriere prin `store_settings` cu
 * `rest_key: ""` goleste cheia (declansatorul vederii doar cripteaza; `privat.pazeste_secretele` nu e
 * chemata de el, paza traieste numai in `jsonb_merge_config`). De aceea fiecare scriere de mai sus duce
 * configurarea citita DECRIPTAT, cu cheile ei, iar stergerea e `null`, nu o configurare pe jumatate goala.
 */
export async function deconecteazaTheMarketer(businessId: string): Promise<Raspuns> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  if (!(await scrie(owned.supabase, businessId, null))) return { error: "Eroare la deconectare. Încearcă din nou." };
  try {
    await stingeCheileVechi(createAdminClient(), businessId, null);
  } catch {
    /* Integrarea e oprita oricum: adresele raspund 404 fara configurare legata. */
  }
  revalideaza();
  return { ok: true };
}

/** Ascunde (sau arata din nou) o recenzie adusa din theMarketer. Ramane ascunsa si la sincronizarile urmatoare. */
export async function ascundeRecenziaTheMarketer(businessId: string, id: number, ascunsa: boolean): Promise<Raspuns> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  if (!Number.isSafeInteger(id) || typeof ascunsa !== "boolean") return { error: "Cerere nevalidă." };
  const { error } = await createAdminClient()
    .from("recenzii_produse")
    .update({ ascunsa } as never)
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) return { error: "Nu am putut salva. Încearcă din nou." };
  revalideaza();
  return { ok: true };
}
