"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCredit, smsoOpresteTot } from "@/lib/smso";
import { trimiteSiLasaUrma, adresaWebhookSmso } from "@/lib/smso-urma";
import { rateLimit } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import type { SmsoConfig } from "@/lib/smso";
import {
  curataFiltre, pretParteDinJurnal, stareaCampaniei, telefonMascat,
  type SmsFilters, type StareCampanie,
} from "@/lib/sms/campanie";
import { costEstimatEurocenti, estimeazaMesaj, MAX_PARTI, textDeTrimis } from "@/lib/sms/mesaj";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CAMPANIILE SMS, PE LOTURI                                        (27.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el dupa auditul sectiunii. Pana acum `sendSmsCampaign` trimitea TOT
  intr-o singura cerere, mesaj cu mesaj, sub plafonul de 300 s al functiei: o
  campanie de peste ~1000 de oameni se taia la mijloc, iar o a doua apasare o
  lua de la primul numar. Acum:

    1. `creeazaCampanie` verifica mesajul, creditul, dublurile (`cheie`), si
       FOTOGRAFIAZA publicul in baza (`sms_pregateste_campanie`).
    2. `trimiteLot` trimite cate un lot (~40 s), pana se termina publicul. Ecranul
       il cheama pe rand si arata progresul; o fila inchisa se reia din istoric.
    3. Doua file nu trimit acelasi numar de doua ori (`sms_ia_lot`, `skip locked`),
       iar un rand intrerupt la mijloc NU se retrimite (`necunoscut`).

  ⚠ Publicul (varianta de consimtamant aleasa de el, „b”): clientii directi ai
  magazinului, fara comenzile din marketplace, fara anulate/rambursate (daca nu
  le cere anume), fara dezabonati, numere romanesti valide, fiecare om o data.
  Fiecare mesaj pleaca cu legatura de dezabonare (`cuDezabonare`).

  ⚠ Fiecare export e un capat public ("use server"): fiecare verifica singur
  proprietarul, iar cheia SMSO nu pleaca niciodata spre browser.
*/

/** Cat lucreaza un lot inainte sa raspunda ecranului (sub plafonul functiei, cu marja). */
const BUGET_LOT_MS = 40_000;
const MARIME_LOT = 20;

type Admin = ReturnType<typeof createAdminClient>;

async function proprietar(businessId: string): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };
  return { userId: user.id };
}

async function getSmsoConfigForBiz(businessId: string): Promise<SmsoConfig | null | { error: string }> {
  const p = await proprietar(businessId);
  if ("error" in p) return p;
  // Cheia se citeste cu SERVICE ROLE, dupa verificarea de proprietate de mai sus:
  // `privat.decripteaza_config` nu decripteaza pentru `authenticated`, deci pe
  // clientul utilizatorului `api_key` ar veni ca sirul `enc.v1.…` si SMSO ar
  // refuza fiecare mesaj din campanie. La fel in `/api/sms/credit` si `/api/sms/test`.
  const { data: settings } = await createAdminClient()
    .from("store_settings").select("smso_config").eq("business_id", businessId).single();
  return (settings?.smso_config as SmsoConfig | null) ?? null;
}

async function configGata(businessId: string): Promise<SmsoConfig | { error: string }> {
  const c = await getSmsoConfigForBiz(businessId);
  if (c && "error" in c) return c;
  if (!c?.enabled || !c.api_key || !c.sender_id) return { error: "SMSO nu este activat sau configurat complet." };
  return c;
}

async function numeleMagazinului(admin: Admin, businessId: string): Promise<string> {
  const { data } = await admin.from("businesses").select("store_name, business_name").eq("id", businessId).single();
  return (data?.store_name ?? data?.business_name ?? "").trim();
}

export async function getSmsoCredit(
  businessId: string
): Promise<{ credit: number } | { error: string }> {
  const p = await proprietar(businessId);
  if ("error" in p) return p;
  // Service role, dupa verificarea de proprietate de mai sus: vezi comentariul
  // din `getSmsoConfigForBiz`.
  const { data: settings } = await createAdminClient()
    .from("store_settings").select("smso_config").eq("business_id", businessId).single();
  const config = settings?.smso_config as SmsoConfig | null;
  if (!config?.api_key) return { error: "SMSO nu este configurat." };
  return checkCredit(config.api_key);
}

export interface RezumatPublic {
  primesc: number;
  dezabonati: number;
  invalide: number;
  exemple: { prenume: string | null; telefon: string; comenzi: number }[];
}

/** Cine primeste, cine iese si de ce, cu cinci exemple. Aceeasi regula ca la creare. */
export async function previewSmsRecipients(
  businessId: string,
  filtre: SmsFilters,
): Promise<RezumatPublic | { error: string }> {
  const c = await configGata(businessId);
  if ("error" in c) return c;
  const { data, error } = await createAdminClient()
    .rpc("sms_audienta_rezumat" as never, { p_business: businessId, p_filtre: curataFiltre(filtre) } as never);
  if (error || !data) return { error: "Nu am putut calcula destinatarii. Încearcă din nou." };
  const r = data as { primesc: number; dezabonati: number; invalide: number; exemple: { prenume: string | null; telefon: string; comenzi: number }[] };
  return {
    primesc: Number(r.primesc ?? 0),
    dezabonati: Number(r.dezabonati ?? 0),
    invalide: Number(r.invalide ?? 0),
    exemple: (r.exemple ?? []).map((e) => ({ prenume: e.prenume, telefon: telefonMascat(e.telefon), comenzi: Number(e.comenzi ?? 0) })),
  };
}

export type RezultatCreare =
  | { campaignId: string; destinatari: number; reluata?: true }
  | { error: string; cod?: "credit"; creditEur?: number; costEstimatEur?: number };

/**
 * Creeaza campania si fotografiaza publicul. NU trimite nimic: trimiterea e
 * `trimiteLot`, chemat de ecran pe rand.
 */
export async function creeazaCampanie(
  businessId: string,
  input: { mesaj: string; filtre: SmsFilters; cheie: string; acceptaCostul?: boolean },
): Promise<RezultatCreare> {
  const config = await configGata(businessId);
  if ("error" in config) return config;

  const mesaj = typeof input?.mesaj === "string" ? input.mesaj.trim() : "";
  if (!mesaj) return { error: "Mesajul nu poate fi gol." };
  if (mesaj.length > 1000) return { error: "Mesajul e prea lung (cel mult 1000 de caractere)." };
  const cheie = typeof input?.cheie === "string" ? input.cheie.slice(0, 80) : "";
  if (!/^[\w-]{8,80}$/.test(cheie)) return { error: "Cerere invalidă. Reîncarcă pagina." };
  const filtre = curataFiltre(input?.filtre);

  const admin = createAdminClient();

  /* ⚠ DUBLU-CLIC / REINCERCARE: aceeasi cheie intoarce campania deja creata, nu una noua. */
  const { data: existenta } = await admin
    .from("sms_campaigns").select("id, recipient_count").eq("business_id", businessId).eq("cheie", cheie).maybeSingle();
  if (existenta) return { campaignId: existenta.id as string, destinatari: Number(existenta.recipient_count ?? 0), reluata: true };

  /* ⚠ O singura campanie in curs pe magazin: doua pornite deodata (doua file) ar fi platit dublu. */
  const { data: inCurs } = await admin
    .from("sms_campaigns").select("id").eq("business_id", businessId).eq("status", "in_curs")
    .not("cheie", "is", null).limit(1);
  if (inCurs && inCurs.length) {
    return { error: "Ai deja o campanie în curs. Continu-o sau oprește-o din istoric înainte să pornești alta." };
  }

  const magazin = await numeleMagazinului(admin, businessId);
  const est = estimeazaMesaj(mesaj, magazin);
  if (est.parti > MAX_PARTI) return { error: `Mesajul ar avea ${est.parti} SMS-uri pe destinatar. Scurtează-l (cel mult ${MAX_PARTI}).` };

  const { data: rez } = await admin.rpc("sms_audienta_rezumat" as never, { p_business: businessId, p_filtre: filtre } as never);
  const primesc = Number((rez as { primesc?: number } | null)?.primesc ?? 0);
  if (primesc === 0) return { error: "Niciun client nu se potrivește filtrelor alese." };

  /*
   * ═══ ⚠ CREDITUL SE INTREABA INAINTE, NU SE AFLA MESAJ CU MESAJ ═══
   *
   * Si se compara cu COSTUL campaniei (destinatari x parti x pretul unei parti), nu doar cu zero.
   * ⚠ O citire picata a creditului nu opreste: nu dovedeste ca nu sunt bani. Iar estimarea poate fi
   * mai mare decat pretul real al pachetului lui, deci omul poate trimite totusi, cu buna stiinta.
   */
  const credit = await checkCredit(config.api_key);
  if ("credit" in credit && credit.credit <= 0) {
    return { error: "Nu mai ai credit SMSO. Încarcă contul și încearcă din nou; nu am trimis niciun mesaj." };
  }
  const pret = await pretParteDinJurnal(admin, businessId);
  const costEstimat = costEstimatEurocenti(primesc, est.parti, pret);
  if ("credit" in credit && credit.credit * 100 < costEstimat && !input.acceptaCostul) {
    return {
      error: "Creditul SMSO pare să nu ajungă pentru toată campania.",
      cod: "credit", creditEur: credit.credit, costEstimatEur: Math.round(costEstimat) / 100,
    };
  }

  const { data: campanie, error: eroareInregistrare } = await admin
    .from("sms_campaigns")
    .insert({
      business_id: businessId, message: mesaj, recipient_count: 0, sent_count: 0, failed_count: 0,
      status: "in_curs", filters: filtre as never, cheie, segmente: est.parti, cost_estimat_eurocenti: costEstimat,
    } as never)
    .select("id")
    .single();
  if (eroareInregistrare || !campanie) {
    /* Cheia unica: o a doua cerere cu aceeasi cheie a castigat cursa. */
    const { data: castigatoare } = await admin
      .from("sms_campaigns").select("id, recipient_count").eq("business_id", businessId).eq("cheie", cheie).maybeSingle();
    if (castigatoare) return { campaignId: castigatoare.id as string, destinatari: Number(castigatoare.recipient_count ?? 0), reluata: true };
    return { error: "Nu am putut înregistra campania, deci nu am trimis niciun mesaj. Încearcă din nou." };
  }
  const campaignId = (campanie as { id: string }).id;

  const { data: n, error: eroarePublic } = await admin.rpc("sms_pregateste_campanie" as never, { p_campaign: campaignId } as never);
  const destinatari = Number(n ?? 0);
  if (eroarePublic || destinatari === 0) {
    await admin.from("sms_campaigns").update({
      status: "failed", motiv_oprire: "Niciun destinatar.", finalizata_la: new Date().toISOString(),
    } as never).eq("id", campaignId);
    return { error: "Niciun client nu se potrivește filtrelor alese." };
  }
  return { campaignId, destinatari };
}

export interface ProgresCampanie {
  status: "in_curs" | "sent" | "partial" | "failed" | "oprita";
  total: number;
  stare: StareCampanie;
  motiv: string | null;
}

async function incheie(admin: Admin, campaignId: string, total: number): Promise<ProgresCampanie> {
  await admin.rpc("sms_campanie_inchide_intrerupte" as never, { p_campaign: campaignId } as never);
  const stare = await stareaCampaniei(admin, campaignId);
  const { data: c } = await admin.from("sms_campaigns").select("status, motiv_oprire").eq("id", campaignId).single();
  let status = ((c as { status?: string } | null)?.status ?? "in_curs") as ProgresCampanie["status"];
  const actualizare: Record<string, unknown> = {
    sent_count: stare.trimis, failed_count: stare.esuat + stare.necunoscut, actualizata_la: new Date().toISOString(),
  };
  if (status === "in_curs" && stare.de_trimis === 0 && stare.in_lucru === 0) {
    status = stare.esuat + stare.necunoscut === 0 ? "sent" : stare.trimis === 0 ? "failed" : "partial";
    actualizare.status = status;
    actualizare.finalizata_la = new Date().toISOString();
  }
  await admin.from("sms_campaigns").update(actualizare as never).eq("id", campaignId);
  return { status, total, stare, motiv: (c as { motiv_oprire?: string | null } | null)?.motiv_oprire ?? null };
}

/**
 * Trimite un lot din campanie (cat incape in ~40 s) si spune cat a mai ramas.
 * Ecranul il cheama pana cand `status` nu mai e `in_curs`.
 */
export async function trimiteLot(businessId: string, campaignId: string): Promise<ProgresCampanie | { error: string }> {
  const config = await configGata(businessId);
  if ("error" in config) return config;
  const admin = createAdminClient();

  const { data: c } = await admin
    .from("sms_campaigns").select("id, business_id, message, status, recipient_count, cheie")
    .eq("id", campaignId).eq("business_id", businessId).maybeSingle();
  if (!c) return { error: "Campania nu există." };
  const campanie = c as { id: string; message: string; status: string; recipient_count: number; cheie: string | null };
  /* ⚠ Campaniile de dinainte de 27.09.2026 n-au publicul fotografiat: `incheie` le-ar fi scris 0 peste cifrele lor. */
  if (!campanie.cheie) return { error: "Campania e dinaintea trimiterii pe loturi și nu mai poate fi continuată." };
  if (campanie.status !== "in_curs") return incheie(admin, campaignId, campanie.recipient_count);

  const magazin = await numeleMagazinului(admin, businessId);
  const start = Date.now();

  lot: while (Date.now() - start < BUGET_LOT_MS) {
    const { data: randuri, error } = await admin.rpc("sms_ia_lot" as never, { p_campaign: campaignId, p_n: MARIME_LOT } as never);
    if (error) return { error: "Nu am putut continua campania. Încearcă din nou." };
    const lista = (randuri ?? []) as { id: number; telefon: string; prenume: string | null }[];
    if (!lista.length) break;

    for (let i = 0; i < lista.length; i++) {
      const r = lista[i];
      const result = await trimiteSiLasaUrma(admin, config.api_key, {
        businessId,
        phone: `0${r.telefon}`,
        sender: config.sender_id,
        body: textDeTrimis(campanie.message, { prenume: r.prenume, magazin }),
        type: "marketing",
        motiv: "campanie",
        campaignId,
      });

      /*
       * ⚠⚠ UNELE ESECURI INSEAMNA „OPRESTE-TE", NU „MERGI MAI DEPARTE".
       *
       * Fara credit (`402`) sau cu cheia gresita (`401`), tot restul listei ar esua la fel. Campania
       * se OPRESTE, iar randurile netrimise se intorc in coada: dupa ce incarca creditul, omul o
       * reia de unde a ramas. ⚠ `409` (limita de trimitere) NU opreste: trece de la sine.
       */
      if (smsoOpresteTot(result.status) || result.nesigur) {
        const inapoi = lista.slice(i).map((x) => x.id);
        await admin.from("sms_campaign_destinatari").update({ stare: "de_trimis", luat_la: null } as never).in("id", inapoi);
        if (smsoOpresteTot(result.status)) {
          await admin.from("sms_campaigns").update({
            status: "oprita", motiv_oprire: result.error ?? "Trimiterea a fost oprită de SMSO.", actualizata_la: new Date().toISOString(),
          } as never).eq("id", campaignId);
        }
        break lot;
      }

      await admin.from("sms_campaign_destinatari").update({
        stare: result.success ? "trimis" : result.dezabonat ? "sarit" : "esuat",
        trimis_la: result.success ? new Date().toISOString() : null,
        eroare: result.success ? null : (result.error ?? "Eroare necunoscută").slice(0, 300),
      } as never).eq("id", r.id);
    }
  }

  return incheie(admin, campaignId, campanie.recipient_count);
}

/** Opreste campania. Ce n-a plecat ramane in coada si se poate relua. */
export async function opresteCampania(businessId: string, campaignId: string): Promise<{ success: true } | { error: string }> {
  const p = await proprietar(businessId);
  if ("error" in p) return p;
  const { error } = await createAdminClient().from("sms_campaigns")
    .update({ status: "oprita", motiv_oprire: "Oprită de tine.", actualizata_la: new Date().toISOString() } as never)
    .eq("id", campaignId).eq("business_id", businessId).eq("status", "in_curs");
  if (error) return { error: "Nu am putut opri campania." };
  return { success: true };
}

/** Reia o campanie oprita (dupa ce ai incarcat creditul, de exemplu). */
export async function reiaCampania(businessId: string, campaignId: string): Promise<{ success: true } | { error: string }> {
  const p = await proprietar(businessId);
  if ("error" in p) return p;
  const admin = createAdminClient();
  const { data: alta } = await admin.from("sms_campaigns").select("id")
    .eq("business_id", businessId).eq("status", "in_curs").neq("id", campaignId).not("cheie", "is", null).limit(1);
  if (alta && alta.length) return { error: "Ai deja o campanie în curs. Termin-o sau oprește-o întâi." };
  const { data, error } = await admin.from("sms_campaigns")
    .update({ status: "in_curs", motiv_oprire: null, actualizata_la: new Date().toISOString() } as never)
    .eq("id", campaignId).eq("business_id", businessId).eq("status", "oprita").select("id");
  if (error || !data?.length) return { error: "Campania nu poate fi reluată." };
  return { success: true };
}

export interface DetaliiCampanie {
  stare: StareCampanie;
  esecuri: { telefon: string; eroare: string | null }[];
}

export async function detaliiCampanie(businessId: string, campaignId: string): Promise<DetaliiCampanie | { error: string }> {
  const p = await proprietar(businessId);
  if ("error" in p) return p;
  const admin = createAdminClient();
  const { data: c } = await admin.from("sms_campaigns").select("id").eq("id", campaignId).eq("business_id", businessId).maybeSingle();
  if (!c) return { error: "Campania nu există." };
  const [stare, { data: esec }] = await Promise.all([
    stareaCampaniei(admin, campaignId),
    admin.from("sms_campaign_destinatari").select("telefon, eroare")
      .eq("campaign_id", campaignId).in("stare", ["esuat", "necunoscut"]).order("id").limit(20),
  ]);
  return {
    stare,
    esecuri: ((esec ?? []) as { telefon: string; eroare: string | null }[]).map((e) => ({ telefon: telefonMascat(e.telefon), eroare: e.eroare })),
  };
}

/**
 * „Trimite-mi un test”: mesajul compus, EXACT cum pleaca (variabile, dezabonare),
 * la un numar al comerciantului. E un SMS real, platit: limite pe om.
 */
export async function trimiteTestCampanie(
  businessId: string, mesaj: string, telefon: string,
): Promise<{ success: true } | { error: string }> {
  const config = await configGata(businessId);
  if ("error" in config) return config;
  const p = await proprietar(businessId);
  if ("error" in p) return p;
  if (!rateLimit(`sms-test-campanie:${p.userId}`, 3, 60_000)) return { error: "Prea multe teste deodată. Așteaptă un minut." };
  if (!(await consumaLimita(`sms-test-campanie:${p.userId}`, 10, 3600)).permis) {
    return { error: "Ai trimis multe teste în ultima oră. Încearcă mai târziu." };
  }
  const t = typeof mesaj === "string" ? mesaj.trim() : "";
  if (!t || t.length > 1000) return { error: "Scrie întâi mesajul." };
  const tel = String(telefon ?? "").replace(/\D/g, "").replace(/^(0040|40|0)/, "");
  if (!/^7\d{8}$/.test(tel)) return { error: "Numărul de telefon nu pare un mobil din România." };

  const admin = createAdminClient();
  const magazin = await numeleMagazinului(admin, businessId);
  const r = await trimiteSiLasaUrma(admin, config.api_key, {
    businessId, phone: `0${tel}`, sender: config.sender_id,
    body: textDeTrimis(t, { prenume: "Ana", magazin }), type: "marketing", motiv: "test",
  });
  if (!r.success) return { error: r.error ?? "Testul nu a putut fi trimis." };
  return { success: true };
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
    .order("created_at", { ascending: false })
    .limit(100);

  return (data ?? []) as { id: string; name: string; message: string; created_at: string }[];
}

/** Sabloane: nume 1-60, mesaj 1-1000, cel mult 50 pe magazin (27.09.2026). */
export async function saveSmsTemplate(
  businessId: string,
  name: string,
  message: string
): Promise<{ id: string } | { error: string }> {
  const p = await proprietar(businessId);
  if ("error" in p) return p;
  const nume = typeof name === "string" ? name.trim() : "";
  const text = typeof message === "string" ? message.trim() : "";
  if (!nume || nume.length > 60) return { error: "Numele șablonului trebuie să aibă între 1 și 60 de caractere." };
  if (!text || text.length > 1000) return { error: "Mesajul șablonului trebuie să aibă între 1 și 1000 de caractere." };

  const supabase = await createClient();
  const { count } = await supabase.from("sms_templates").select("id", { count: "exact", head: true }).eq("business_id", businessId);
  if ((count ?? 0) >= 50) return { error: "Poți avea cel mult 50 de șabloane. Șterge unul pe care nu-l mai folosești." };

  const { data, error } = await supabase
    .from("sms_templates")
    .insert({ business_id: businessId, name: nume, message: text })
    .select("id")
    .single();

  if (error) return { error: "Eroare la salvarea șablonului." };
  return { id: data.id as string };
}

export async function deleteSmsTemplate(
  businessId: string,
  templateId: string
): Promise<{ success: true } | { error: string }> {
  const p = await proprietar(businessId);
  if ("error" in p) return p;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sms_templates")
    .delete()
    .eq("id", templateId)
    .eq("business_id", businessId)
    .select("id");
  /* ⚠ Pana acum raspundea „sters” si cand stergerea nu se facuse. */
  if (error || !data?.length) return { error: "Șablonul nu a putut fi șters." };
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
  const p = await proprietar(businessId);
  if ("error" in p) return p;
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
 *
 * ⚠⚠ SE INTOARCE SI CATI SUNT, NU DOAR RANDURILE (23.09.2026): randurile raman doua sute (cele mai
 * noi sunt cele care se cauta); numarul e cel adevarat, si panoul spune ca arata numai o parte.
 */
export async function getSmsDezabonati(
  businessId: string,
): Promise<{ randuri: { phone: string; sursa: string; creat_la: string }[]; cateSunt: number }> {
  const gol = { randuri: [], cateSunt: 0 };
  const p = await proprietar(businessId);
  if ("error" in p) return gol;
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("sms_optout").select("phone, sursa, creat_la", { count: "exact" })
    .eq("business_id", businessId).order("creat_la", { ascending: false }).limit(200);
  const randuri = (data ?? []) as { phone: string; sursa: string; creat_la: string }[];
  /* Fara numaratoare ramane cat s-a adus: e tot ce se stie atunci, si nu se
     inventeaza un numar mai mare decat randurile pe care le putem arata. */
  return { randuri, cateSunt: count ?? randuri.length };
}
