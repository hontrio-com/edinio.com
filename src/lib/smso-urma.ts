import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSms, SMSO_DEZABONAT, type SmsoSendResult } from "@/lib/smso";
import { semnaturaCheii } from "@/lib/utils/cheie-neghicibila";

/**
 * Trimite un SMS prin SMSO si LASA URMA. Un singur loc, pentru toate cele sase cai.
 *
 * ═══ ⚠⚠ CE LIPSEA (17.09.2026) ═══
 *
 * Platforma are DOI furnizori de SMS. notice.ro scria fiecare incercare in `notice_sms_log`, cu
 * `provider_id`, si avea webhook de raport de livrare care completa `delivery_status`. **SMSO nu
 * scria nimic, nicaieri**, iar `responseToken` (echivalentul lui `provider_id`, si singura cheie cu
 * care se poate interoga `/status`) era aruncat in toate cele sase cai reale de trimitere.
 *
 * Adica raportam „trimis" fiindca API-ul ACCEPTASE mesajul, niciodata fiindca AJUNSESE. Iar
 * infrastructura era deja construita, la zece fisiere distanta, pentru celalalt furnizor.
 *
 * ⚠ SI CODUL `405` SE TINE MINTE. El inseamna „numarul e dezabonat", iar pana azi se numara ca un
 * esec oarecare si se uita, deci aceeasi persoana primea si campania urmatoare. Nu e o chestiune de
 * eleganta, e una de conformitate.
 */

type Admin = SupabaseClient;

export interface SmsDeTrimis {
  businessId: string;
  /** Numarul, asa cum il avem. Se normalizeaza aici, o singura data. */
  phone: string;
  sender: string;
  body: string;
  /**
   * ⚠ `transactional` NU se opreste de lista de dezabonati: starea unei comenzi pe care omul a
   * platit-o nu e marketing, iar el are dreptul s-o afle. Doar `marketing` se opreste.
   */
  type: "transactional" | "marketing" | "otp";
  /** De ce a plecat: `campanie`, `cos_abandonat`, `stare_comanda`, `test`. Intra in jurnal. */
  motiv: string;
  orderId?: string | null;
}

/**
 * Numarul, adus la o forma unica.
 *
 * ⚠ Acelasi tratament ca la notice.ro (`normalizeNoticePhone`), fiindca lista de dezabonati se
 * cauta dupa el: scris o data cu `+40` si o data cu `07`, acelasi om ar fi doua randuri diferite si
 * ar primi mesajul oricum.
 */
export function numarNormalizat(phone: string): string {
  let c = String(phone ?? "").replace(/\D/g, "");
  /*
   * ⚠ IN ORDINEA ASTA, si prima forma a functiei o gresea: taia un singur zero, deci
   * `0040722334455` ajungea `040722334455` in loc de `722334455`. Acelasi om ar fi fost doua randuri
   * in lista de dezabonati si ar fi primit mesajul oricum. Prins de proba, nu de citit codul.
   *
   * ⚠ Un numar romanesc normalizat are 9 cifre si incepe cu 7, deci nu se poate confunda niciodata
   * cu prefixul de tara taiat mai sus.
   */
  if (c.startsWith("00")) c = c.slice(2);
  if (c.startsWith("40")) c = c.slice(2);
  if (c.startsWith("0")) c = c.slice(1);
  return c;
}

/**
 * Adresa la care SMSO ne raporteaza, pentru magazinul asta.
 *
 * ═══ ⚠⚠ UN SINGUR LOC, SI E FOLOSIT DE DOUA ORI ═══
 *
 * O data la fiecare trimitere (ca parametru `webhook_status` / `webhook_responses`), si o data in
 * panou, ca omul s-o poata lipi si in contul lui SMSO daca vrea. Doua compuneri separate ar fi
 * insemnat ca intr-o zi una se schimba si cealalta nu, iar rapoartele ar ajunge la o adresa care nu
 * mai trece de garda.
 *
 * ⚠ INTOARCE `null` CAND SECRETUL LIPSESTE, nu arunca. La trimitere, lipsa raportarii nu e un motiv
 * sa nu plece SMS-ul: mesajul catre cumparator conteaza mai mult decat statistica noastra.
 */
export function adresaWebhookSmso(businessId: string): string | null {
  try {
    const semnatura = semnaturaCheii(`smso-webhook:${businessId}`);
    const baza = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.edinio.com";
    return `${baza}/api/smso/webhook?b=${businessId}&s=${semnatura}`;
  } catch {
    return null;
  }
}

/**
 * Starile lor, aduse la cele trei care ne spun ceva.
 *
 * ═══ ⚠ O SINGURA REGULA, DOI APELANTI ═══
 *
 * Webhook-ul lor si cronul de reconciliere primesc ACELEASI sase stari, pe doua drumuri diferite.
 * Scrisa de doua ori, regula ar fi ajuns intr-o zi sa spuna doua lucruri: un mesaj `expired` ar fi
 * fost esec pe un drum si necunoscut pe celalalt, iar cifrele n-ar mai fi insemnat nimic. Acelasi
 * tipar ca la `netopia-aplica-statusul`.
 *
 * ⚠ `dispatched` si `sent` NU sunt livrare. Inseamna „a plecat catre retea", adica exact ce stiam
 * deja cand am scris randul. Intoarse ca `delivered`, ar fi transformat statistica de livrari intr-o
 * statistica de trimiteri, care e chiar minciuna pe care trecerea asta o repara.
 */
export function stareaLivrarii(status: string | null): "delivered" | "failed" | "sent" | null {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "delivered") return "delivered";
  if (s === "undelivered" || s === "expired" || s === "error") return "failed";
  if (s === "sent" || s === "dispatched") return "sent";
  return null;
}

/** Numerele care nu mai primesc MARKETING de la magazinul asta. */
export async function dezabonatii(admin: Admin, businessId: string): Promise<Set<string>> {
  const { data, error } = await admin
    .from("sms_optout").select("phone").eq("business_id", businessId);
  /*
   * ⚠ O CITIRE PICATA NU DESCHIDE LISTA. Intoarsa goala, campania ar suna exact oamenii care au
   * cerut sa nu mai fie sunati. Se arunca, iar apelantul opreste trimiterea.
   */
  if (error) throw new Error(`lista de dezabonati nu s-a putut citi: ${error.message}`);
  return new Set((data ?? []).map((r) => numarNormalizat(String((r as { phone: string }).phone))));
}

/** Il trecem pe lista. Idempotent: a doua oara nu strica nimic. */
export async function tineMinteDezabonarea(
  admin: Admin, businessId: string, phone: string, sursa: string,
): Promise<void> {
  const { error } = await admin
    .from("sms_optout")
    .upsert({ business_id: businessId, phone: numarNormalizat(phone), sursa } as never,
            { onConflict: "business_id,phone", ignoreDuplicates: true });
  if (error) console.error("[smso] dezabonarea nu s-a putut scrie:", { businessId, error: error.message });
}

export async function trimiteSiLasaUrma(
  admin: Admin,
  apiKey: string,
  m: SmsDeTrimis,
): Promise<SmsoSendResult> {
  /*
   * ═══ ⚠⚠ GARDA DE DEZABONARE STA AICI, UNDE NU POATE FI UITATA ═══
   *
   * Campania isi filtreaza lista in bloc, cu o singura interogare, fiindca acolo conteaza viteza.
   * Dar marketingul mai pleaca si pe alte drumuri (recuperarea cosurilor abandonate, din cron SI din
   * panou), iar acelea n-aveau nicio filtrare.
   *
   * O regula despre cine NU are voie sa fie sunat nu poate sta doar la un apelant din trei: trebuie
   * sa fie langa trimitere, altfel al patrulea drum apare fara ea. Filtrul din campanie ramane, ca
   * optimizare; asta e plasa.
   *
   * ⚠ SI SE APLICA DOAR MARKETINGULUI. Starea unei comenzi pe care omul a platit-o nu e marketing,
   * iar el are dreptul s-o afle chiar daca nu mai vrea reclame.
   */
  if (m.type === "marketing") {
    const normalizat = numarNormalizat(m.phone);
    const { data, error } = await admin
      .from("sms_optout").select("id")
      .eq("business_id", m.businessId).eq("phone", normalizat).limit(1);
    /*
     * ⚠ O citire picata OPRESTE trimiterea, nu o lasa sa treaca. Citita pe dos, garda ar suna exact
     * oamenii care au cerut sa nu mai fie sunati, si tocmai cand baza are o problema.
     */
    if (error) {
      return { success: false, error: "Nu am putut verifica lista de dezabonati, deci nu am trimis." };
    }
    if (data && data.length > 0) {
      return { success: false, error: "Numarul s-a dezabonat de la mesajele de marketing." };
    }
  }

  /*
   * ⚠⚠ ADRESA DE RAPORTARE PLEACA CU MESAJUL, si asta e ce face ca rapoartele de livrare sa
   * functioneze fara ca vreun comerciant sa configureze ceva la SMSO. Vezi `adresaWebhookSmso`.
   *
   * ⚠ `generate_unsubscribe_link` doar la marketing, si doar ca sa DESCHIDA posibilitatea: SMSO
   * inlocuieste eticheta `[unsubscribe]` daca o gaseste in text, altfel nu face nimic. Nu adauga
   * nimic la mesajele care n-o cer, deci nu lungeste si nu scumpeste nimic pe nedrept.
   */
  const raportare = adresaWebhookSmso(m.businessId);
  const result = await sendSms(apiKey, {
    to: m.phone, sender: m.sender, body: m.body, type: m.type, remove_special_chars: true,
    webhook_status: raportare ?? undefined,
    webhook_responses: raportare ?? undefined,
    generate_unsubscribe_link: true,
  });

  /*
   * ⚠ URMA SE SCRIE ORICUM, si la reusita si la esec. Un esec fara urma e exact tacerea care a facut
   * ca nimeni sa nu stie niciodata daca SMS-urile ajung.
   *
   * ⚠ `provider: "smso"`: fara el, randurile celor doi furnizori ar fi de nedeosebit, iar cele DOUA
   * webhook-uri de livrare se potrivesc amandoua dupa `provider_id`.
   *
   * ⚠ `delivery_status: "sent"` la reusita inseamna „acceptat de ei", NU „livrat". Livrarea o scrie
   * webhook-ul lor, si abia atunci devine `delivered`.
   */
  const { error } = await admin.from("notice_sms_log").insert({
    business_id: m.businessId,
    order_id: m.orderId ?? null,
    trigger_key: m.motiv,
    channel: "sms",
    provider: "smso",
    phone: numarNormalizat(m.phone),
    message: m.body,
    success: result.success,
    provider_id: result.responseToken ?? null,
    delivery_status: result.success ? "sent" : "failed",
    error: result.success ? null : (result.error ?? "Eroare necunoscuta"),
  } as never);
  if (error) console.error("[smso] urma nu s-a putut scrie:", { businessId: m.businessId, error: error.message });

  /* ⚠ Ei ne-au spus ca omul s-a dezabonat. Se tine minte, altfel il sunam iar la campania urmatoare. */
  if (result.status === SMSO_DEZABONAT) {
    await tineMinteDezabonarea(admin, m.businessId, m.phone, "smso_405");
  }

  return result;
}
