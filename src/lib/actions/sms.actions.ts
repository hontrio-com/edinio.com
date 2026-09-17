"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { checkCredit, sendSms, smsoOpresteTot } from "@/lib/smso";
import { trimiteSiLasaUrma, adresaWebhookSmso } from "@/lib/smso-urma";
import { dezabonatii, numarNormalizat } from "@/lib/sms-dezabonare";
import type { SmsoConfig } from "@/lib/smso";

export interface SmsFilters {
  date_from?: string;
  date_to?: string;
  counties?: string[];
  min_amount?: number;
  order_statuses?: string[];
}

type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";

async function getSmsoConfigForBiz(businessId: string): Promise<SmsoConfig | null | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  // Cheia se citeste cu SERVICE ROLE, dupa verificarea de proprietate de mai sus:
  // `privat.decripteaza_config` nu decripteaza pentru `authenticated`, deci pe
  // clientul utilizatorului `api_key` ar veni ca sirul `enc.v1.…` si SMSO ar
  // refuza fiecare mesaj din campanie. La fel in `/api/sms/credit` si `/api/sms/test`.
  const { data: settings } = await createAdminClient()
    .from("store_settings").select("smso_config").eq("business_id", businessId).single();
  return (settings?.smso_config as SmsoConfig | null) ?? null;
}

async function fetchOrderPhones(
  businessId: string,
  filters: SmsFilters
): Promise<string[]> {
  const supabase = await createClient();

  // Audienta campaniei trebuie sa acopere TOATE comenzile care trec de filtre
  // — un query simplu e taiat silentios la 1000 de randuri de PostgREST.
  const orders = await fetchAllRows("sms.fetchOrderPhones", (f, t) => {
    let query = supabase
      .from("orders")
      .select("customer_phone, shipping_address")
      .eq("business_id", businessId);

    if (filters.date_from) query = query.gte("created_at", filters.date_from);
    if (filters.date_to)   query = query.lte("created_at", filters.date_to + "T23:59:59Z");
    if (filters.min_amount && filters.min_amount > 0) query = query.gte("total", filters.min_amount);
    if (filters.order_statuses && filters.order_statuses.length > 0) {
      query = query.in("status", filters.order_statuses as OrderStatus[]);
    }
    return query.order("id").range(f, t);
  });
  if (orders.length === 0) return [];

  const filtered = orders.filter(o => {
    if (filters.counties && filters.counties.length > 0) {
      const addr = o.shipping_address as Record<string, string> | null;
      if (!addr?.county || !filters.counties!.includes(addr.county)) return false;
    }
    return !!o.customer_phone;
  });

  return filtered.map(o => o.customer_phone as string);
}

export async function getSmsoCredit(
  businessId: string
): Promise<{ credit: number } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  // Service role, dupa verificarea de proprietate de mai sus — vezi comentariul
  // din `getSmsoConfigForBiz`.
  const { data: settings } = await createAdminClient()
    .from("store_settings").select("smso_config").eq("business_id", businessId).single();
  const config = settings?.smso_config as SmsoConfig | null;
  if (!config?.api_key) return { error: "SMSO nu este configurat." };

  return checkCredit(config.api_key);
}

export async function previewSmsRecipients(
  businessId: string,
  filters: SmsFilters
): Promise<{ uniqueCount: number; totalCount: number; duplicatesRemoved: number } | { error: string }> {
  const cfgOrErr = await getSmsoConfigForBiz(businessId);
  if (cfgOrErr && "error" in cfgOrErr) return cfgOrErr;

  const phones = await fetchOrderPhones(businessId, filters);
  const totalCount = phones.length;
  const uniquePhones = [...new Set(phones)];

  return {
    uniqueCount: uniquePhones.length,
    totalCount,
    duplicatesRemoved: totalCount - uniquePhones.length,
  };
}

export async function sendSmsCampaign(
  businessId: string,
  message: string,
  filters: SmsFilters
): Promise<{ sent: number; failed: number; campaignId: string; sariti: number } | { error: string }> {
  const cfgOrErr = await getSmsoConfigForBiz(businessId);
  if (cfgOrErr && "error" in cfgOrErr) return cfgOrErr;
  const config = cfgOrErr as SmsoConfig | null;
  if (!config?.enabled || !config.api_key || !config.sender_id) {
    return { error: "SMSO nu este activat sau configurat complet." };
  }

  const phones = await fetchOrderPhones(businessId, filters);
  const toate = [...new Set(phones)];
  if (toate.length === 0) return { error: "Nu exista destinatari pentru filtrele selectate." };

  const admin = createAdminClient();

  /*
   * ═══ ⚠⚠ CINE A CERUT SA NU MAI FIE SUNAT, NU E SUNAT ═══
   *
   * SMSO intoarce `405` cand numarul e dezabonat. Pana azi codul acela se numara ca un esec oarecare
   * si se uita, deci aceeasi persoana primea si campania urmatoare. Acum se tine minte, si lista se
   * citeste INAINTE de a cheltui vreun credit.
   *
   * ⚠ O citire picata OPRESTE campania (`dezabonatii` arunca), si e dinadins: cu lista goala am fi
   * sunat exact oamenii care au cerut sa nu mai fie sunati. Mai bine nicio campanie decat aia.
   */
  let opriti: Set<string>;
  try {
    opriti = await dezabonatii(admin, businessId);
  } catch {
    return { error: "Nu am putut citi lista de dezabonati, deci nu am trimis nimic. Incearca din nou." };
  }
  const uniquePhones = toate.filter((p) => !opriti.has(numarNormalizat(p)));
  const sariti = toate.length - uniquePhones.length;
  if (uniquePhones.length === 0) {
    return { error: `Toti cei ${toate.length} destinatari s-au dezabonat de la mesajele tale.` };
  }

  /*
   * ═══ ⚠ CREDITUL SE INTREABA INAINTE, NU SE AFLA MESAJ CU MESAJ ═══
   *
   * `checkCredit` exista de mult si nu se chema niciodata aici. Fara el, o campanie pornita cu credit
   * insuficient afla asta la primul mesaj si continua sa incerce inca o suta, esuand la fiecare:
   * o suta de apeluri degeaba catre ei, si un raport care spune „100 esuate" fara sa spuna DE CE.
   *
   * ⚠ Nu se opreste pe o citire picata a creditului: aia nu dovedeste ca nu sunt bani, iar o
   * campanie blocata de o pana de retea ar fi mai rau decat una care afla pe parcurs.
   */
  const credit = await checkCredit(config.api_key);
  if ("credit" in credit && credit.credit <= 0) {
    return { error: "Nu mai ai credit SMSO. Incarca contul si incearca din nou; nu am trimis niciun mesaj." };
  }

  /*
   * ⚠⚠ RANDUL CAMPANIEI SE SCRIE INAINTE DE BUCLA, NU DUPA.
   *
   * Mesajele pleaca PE RAND, unul cate unul. Pana acum randul se scria abia dupa ce bucla se
   * termina, deci intre primul si ultimul SMS nu exista nicio scriere in baza. La o oprire
   * brutala (termen depasit, redesfasurare, instanta taiata), o parte din mesaje plecasera
   * deja catre oameni reali si consumasera credit adevarat, iar la noi nu ramanea NICIO urma
   * ca ar fi existat campania. A doua apasare relua de la primul numar.
   *
   * ⚠ SI DACA RANDUL NU SE POATE SCRIE, NU SE TRIMITE NIMIC. E o schimbare de comportament,
   * dinadins: mai bine nicio campanie decat una pe care n-o putem urmari. Pana acum insertul
   * era dupa bucla si `error` nici nu se citea, deci banii se cheltuiau oricum.
   */
  const supabase = await createClient();
  const { data: campanie, error: eroareInregistrare } = await supabase
    .from("sms_campaigns")
    .insert({
      business_id: businessId,
      message,
      recipient_count: uniquePhones.length,
      sent_count: 0,
      failed_count: 0,
      status: "in_curs",
      filters: filters as never,
    })
    .select("id")
    .single();

  if (eroareInregistrare || !campanie) {
    return { error: "Nu am putut inregistra campania, deci nu am trimis niciun mesaj. Incearca din nou." };
  }

  let sentCount = 0;
  let failedCount = 0;

  let oprita: string | null = null;

  for (const phone of uniquePhones) {
    const result = await trimiteSiLasaUrma(admin, config.api_key, {
      businessId,
      phone,
      sender: config.sender_id,
      body: message,
      type: "marketing",
      motiv: "campanie",
    });
    if (result.success) sentCount++;
    else failedCount++;

    /*
     * ⚠⚠ UNELE ESECURI INSEAMNA „OPRESTE-TE", NU „MERGI MAI DEPARTE".
     *
     * Fara randul asta, o campanie fara credit (`402`) sau cu cheia gresita (`401`) ardea toata
     * lista esuand mesaj cu mesaj: sute de apeluri catre ei pentru un rezultat cunoscut de la primul.
     *
     * ⚠ `409` (limita de trimitere) NU opreste: aceea trece de la sine. Vezi `smsoOpresteTot`.
     */
    if (smsoOpresteTot(result.status)) {
      oprita = result.error ?? "Trimiterea a fost oprita de SMSO.";
      break;
    }
  }

  const status = oprita ? "oprita" : failedCount === 0 ? "sent" : sentCount === 0 ? "failed" : "partial";

  /*
   * ⚠ Daca ACTUALIZAREA pica, randul ramane `in_curs` cu numarul adevarat de destinatari.
   * Nu e o paguba: aia e chiar urma, si spune mai mult decat spunea tacerea de pana acum.
   * Eroarea se citeste ca sa poata fi vazuta in loguri, nu ca sa opreasca ceva: mesajele au
   * plecat deja, si nu se poate lua nimic inapoi.
   */
  const { error: eroareIncheiere } = await supabase
    .from("sms_campaigns")
    .update({ sent_count: sentCount, failed_count: failedCount, status })
    .eq("id", campanie.id);
  if (eroareIncheiere) {
    console.error("[sendSmsCampaign] campania a ramas in_curs", { campaignId: campanie.id });
  }

  if (oprita) {
    return {
      error: `${oprita} Campania s-a oprit dupa ${sentCount} mesaje trimise`
        + `${sariti > 0 ? `, ${sariti} destinatari fiind deja dezabonati` : ""}.`,
    };
  }
  return { sent: sentCount, failed: failedCount, campaignId: campanie.id, sariti };
}

export async function getSmsCampaigns(businessId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("sms_campaigns")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}

export async function getSmsTemplates(businessId: string): Promise<{ id: string; name: string; message: string; created_at: string }[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("sms_templates")
    .select("id, name, message, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  return (data ?? []) as { id: string; name: string; message: string; created_at: string }[];
}

export async function saveSmsTemplate(
  businessId: string,
  name: string,
  message: string
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  const { data, error } = await supabase
    .from("sms_templates")
    .insert({ business_id: businessId, name: name.trim(), message: message.trim() })
    .select("id")
    .single();

  if (error) return { error: "Eroare la salvarea sablonului." };
  return { id: data.id as string };
}

export async function deleteSmsTemplate(
  businessId: string,
  templateId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  await supabase
    .from("sms_templates")
    .delete()
    .eq("id", templateId)
    .eq("business_id", businessId);

  return { success: true };
}

/**
 * Adresa pe care comerciantul o pune in contul lui SMSO, la „Webhooks".
 *
 * ⚠ SMSO nu semneaza nimic („No authentifications is required" scrie in documentatia lor), deci
 * adresa E singura paza. Se deriva din secretul serverului, ca la etichetele de curier: stabila
 * intre apeluri, dar nereconstruibila din id-ul magazinului.
 *
 * ⚠ Se intoarce doar proprietarului magazinului: e o CAPABILITATE, cine o are o poate folosi.
 */
export async function getSmsoWebhookUrl(
  businessId: string,
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  /* ⚠ ACELASI loc de compunere ca la trimitere. Vezi `adresaWebhookSmso`. */
  const url = adresaWebhookSmso(businessId);
  if (!url) return { error: "Adresa nu se poate compune: lipseste secretul de semnare de pe server." };
  return { url };
}

/**
 * Cine s-a dezabonat de la mesajele de marketing ale magazinului.
 *
 * ⚠ Exista ca sa se poata VEDEA. O lista de oameni pe care nu-i mai suni, ascunsa, e o lista in care
 * nimeni nu are incredere: comerciantul ar crede ca mesajele lui nu pleaca fara sa stie de ce.
 */
export async function getSmsDezabonati(
  businessId: string,
): Promise<{ phone: string; sursa: string; creat_la: string }[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return [];

  const { data } = await supabase
    .from("sms_optout").select("phone, sursa, creat_la")
    .eq("business_id", businessId).order("creat_la", { ascending: false }).limit(200);
  return (data ?? []) as { phone: string; sursa: string; creat_la: string }[];
}
