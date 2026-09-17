import type { SupabaseClient } from "@supabase/supabase-js";
import { getNoticeInboundSms, normalizeNoticePhone, type NoticeMessage } from "@/lib/notice";
import { ceruOprirea, tineMinteDezabonarea } from "@/lib/sms-dezabonare";

/**
 * Ce ne-au raspuns cumparatorii, la notice.ro, si ce a iesit din apelurile de voce.
 *
 * ═══ ⚠⚠ DE CE SE TRAGE, CHIAR DACA POATE EXISTA SI UN WEBHOOK ═══
 *
 * Specificatia API a lor (colectia Postman, 29 de capete, citita cap la cap pe 17.09.2026) NU descrie
 * niciun webhook pentru SMS: nici raport de livrare, nici raspuns primit. Singurul `callback_url` din
 * tot API-ul e la `POST /audio`. Drumul documentat catre raspunsuri e unul singur: `GET /sms-in`.
 *
 * ⚠ DAR ASTA NU DOVEDESTE CA NU IMPING NIMIC. Pagina lor de prezentare promite „callback-uri HTTP”
 * pentru notificarile trimise si pentru raspunsuri, iar panoul nostru ii spune comerciantului sa lipeasca
 * adresa in „notice.ro → Integrare API → Webhook URL”. Pe 17.09 am scris aici, gresit, ca ei „nu
 * impinge nimic”, din zero livrari confirmate. Masurat apoi pe magazine: 399 din cele 405 SMS-uri sunt
 * ale unui magazin care n-a avut NICIODATA secret de webhook, deci n-a avut ce adresa sa lipeasca. Zero
 * rapoarte se explica pe deplin prin asta. Nedovedit in niciun sens.
 *
 * De aceea ambele drumuri scriu prin `asazaRaspunsurile`: webhook-ul, daca vine ceva, si cronul, care
 * vine sigur. Indexul unic pe (magazin, id-ul lor) le face sa nu se dubleze intre ele.
 *
 * ⚠ MASURAT INAINTE DE A SCRIE ASTA: `notice_inbox` cu ZERO randuri in trei luni, iar
 * `getNoticeInboundSms` era scrisa anume pentru `/sms-in` si **nu o chema nimeni**. Deci un „STOP”
 * trimis ca raspuns la notice.ro nu era auzit, la furnizorul care duce tot traficul real de SMS.
 */

type Admin = SupabaseClient;

/**
 * Ce a iesit dintr-un APEL de voce.
 *
 * ═══ ⚠⚠ DOCUMENTATIA ARE OPT VALORI, NU PATRU ═══
 *
 * Grupul AUDIO din colectia lor: `confirmed | cancelled | no_response | no_answer | failed | unknown |
 * queue_full | delivered`. Prima forma a regulii (tot din 17.09) le stia doar pe primele patru, luate
 * din descrierea campului `callback_url`, care se termina in „etc”.
 *
 * Intelesul, dupa ei:
 *   - `confirmed`   apelul a fost PRELUAT de om;
 *   - `cancelled`   omul a apasat tasta de anulare (ex. 9). ⚠ La un apel de CONFIRMARE a comenzii,
 *                   asta inseamna ca CLIENTUL A ANULAT COMANDA. Nu e un apel esuat: a mers perfect;
 *   - `no_response`, `no_answer`  nu a raspuns nimeni (doua nume pentru acelasi lucru);
 *   - `failed`      retea, SIM oprit; `queue_full` coada lor de apeluri era plina, deci apelul nu s-a facut;
 *   - `unknown`     nici ei nu stiu;
 *   - `delivered`   ⚠ NU e un rezultat al apelului: „callback-ul a ajuns la serverul vostru”. Tratat ca
 *                   rezultat, ar fi suprascris un `cancelled` cu „livrat” si comanda anulata de client
 *                   ar fi aratat confirmata.
 */
export type StareVoce = "confirmed" | "cancelled" | "no_response" | "failed" | "unknown";

const STARI_VOCE: Record<string, StareVoce> = {
  confirmed: "confirmed",
  cancelled: "cancelled",
  canceled: "cancelled",
  no_response: "no_response",
  noresponse: "no_response",
  no_answer: "no_response",
  failed: "failed",
  queue_full: "failed",
  unknown: "unknown",
};

/**
 * Rezultatul apelului, sau `null` cand valoarea NU e un rezultat: `delivered` (starea callback-ului,
 * nu a apelului) sau ceva ce nu stim. Un `null` nu scrie nimic.
 *
 * ⚠ STA AICI, NU IN RUTA, ca sa poata fi probata direct. Scrisa in ruta, singurul fel de a o proba
 * era sa cauti cuvinte in fisier, iar cuvintele apar si in adnotarea de tip, deci proba trecea verde
 * si cand regula disparea. S-a intamplat chiar asa, si mutantii au prins-o.
 */
export function stareaVocii(brut: string | null | undefined): StareVoce | null {
  return STARI_VOCE[String(brut ?? "").toLowerCase().trim()] ?? null;
}

/** Ce se spune comerciantului, langa apel. Tot aici, ca eticheta si regula sa nu se desparta. */
export const ETICHETA_VOCE: Record<StareVoce, string> = {
  confirmed: "preluat",
  cancelled: "clientul a anulat",
  no_response: "nu a raspuns",
  failed: "apel esuat",
  unknown: "rezultat necunoscut",
};

/**
 * Ce se scrie pe randul apelului.
 *
 * ⚠ `delivery_status` primeste REZULTATUL ca atare, nu „delivered/failed”. Prima forma scria `failed`
 * pentru `cancelled`, deci un client care anulase comanda la telefon aparea ca un apel care nu mersese,
 * adica exact informatia pentru care exista un apel de confirmare se pierdea.
 *
 * ⚠ `delivered_at` doar cand omul a PRELUAT apelul (`confirmed` sau `cancelled`): in ambele cazuri
 * mesajul a ajuns la el.
 */
export function randulApelului(stare: StareVoce, acum: string): {
  delivery_status: StareVoce; delivered_at: string | null; error: string | null;
} {
  const preluat = stare === "confirmed" || stare === "cancelled";
  return {
    delivery_status: stare,
    delivered_at: preluat ? acum : null,
    error: preluat ? null : `Apel de voce: ${ETICHETA_VOCE[stare]}`,
  };
}

/**
 * Callback-ul unui apel de voce, asezat pe randul lui din jurnal.
 *
 * `nu-e-apel` inseamna ca corpul nu poarta `audio_id`, deci ruta merge mai departe. Orice alt
 * raspuns inseamna ca ruta se OPRESTE: un corp cu `audio_id` nu are voie sa ajunga pe ramura de SMS.
 *
 * ⚠ Doua capcane, daca ar fi trecut mai jos:
 *   - `failed` trece si de cuvintele de livrare („fail”), deci s-ar fi scris „SMS nelivrat” pentru
 *     un APEL neraspuns;
 *   - `delivered` inseamna la ei „callback-ul a ajuns la voi”, nu „apelul a mers”. Pe ramura SMS ar fi
 *     suprascris un `cancelled` cu „livrat”, iar comanda anulata de client la telefon ar fi aratat
 *     preluata. Aici `stareaVocii` il intoarce `null`, deci nu scrie nimic.
 */
export async function asazaApelul(
  admin: Admin,
  businessId: string,
  corp: Record<string, unknown>,
): Promise<"nu-e-apel" | "ignorat" | "scris" | "eroare"> {
  if (corp.audio_id === undefined) return "nu-e-apel";

  const brut = corp.audio_id;
  const audioId = typeof brut === "string" ? brut.trim() : typeof brut === "number" ? String(brut) : "";
  const status = typeof corp.status === "string" ? corp.status : "";
  const stare = stareaVocii(status);
  if (!audioId || !stare) return "ignorat";

  const { error } = await admin
    .from("notice_sms_log")
    .update(randulApelului(stare, new Date().toISOString()) as never)
    .eq("business_id", businessId)
    /* ⚠ Jurnalul e impartit cu SMSO; iar un apel nu are voie sa calce randul unui SMS. */
    .eq("provider", "notice")
    .eq("channel", "voice")
    .eq("provider_id", audioId);
  if (error) {
    console.error("[notice/webhook] rezultatul apelului nu s-a putut scrie:", error.message);
    return "eroare";
  }
  return "scris";
}

export interface BilantRaspunsuri {
  /** Cate mesaje a intors furnizorul. */
  citite: number;
  /** Cate randuri au INTRAT in `notice_inbox` (o recitire nu le mai numara). */
  scrise: number;
  opriri: number;
  /** Mesaje cu numar dar fara id, lasate afara la TRAGERE (s-ar fi dublat la fiecare ora). */
  faraId: number;
  /** ⚠ Mesaje in care nu s-a gasit niciun numar. Daca sunt TOATE, forma raspunsului nu e cea stiuta. */
  faraNumar: number;
  /** De la numere carora magazinul nu le-a trimis niciodata nimic prin notice.ro. */
  straini: number;
  /** Numele campurilor din primul mesaj primit, ca o forma necunoscuta sa poata fi descrisa. */
  chei: string[];
}

export interface OptiuniRaspunsuri {
  /** `tragere` = cronul, care reciteste lista; `webhook` = un singur mesaj, impins o data. */
  sursa?: "tragere" | "webhook";
  canal?: "sms" | "whatsapp";
  /**
   * Corpul primit, pastrat ca atare in `raw`. ⚠ Forma lor nu e documentata nicaieri, deci primul
   * mesaj adevarat e singura dovada despre ce trimit; fara el, un camp gresit nu se poate diagnostica.
   */
  brut?: unknown;
}

/**
 * Aseaza o lista de raspunsuri in baza. Folosita si de cron, si de webhook, ca regula sa fie una.
 *
 * Arunca doar cand nu poate afla carora le-am scris; atunci nu scrie nimic, iar urmatoarea trecere
 * reia totul fara dubluri.
 */
export async function asazaRaspunsurile(
  admin: Admin,
  businessId: string,
  mesaje: NoticeMessage[],
  opt: OptiuniRaspunsuri = {},
): Promise<BilantRaspunsuri> {
  const sursa = opt.sursa ?? "tragere";
  const bilant: BilantRaspunsuri = {
    citite: mesaje.length, scrise: 0, opriri: 0, faraId: 0, faraNumar: 0, straini: 0, chei: mesaje[0]?.chei ?? [],
  };

  const cuNumar: { m: NoticeMessage; forma: string }[] = [];
  for (const m of mesaje) {
    const brut = String(m.number ?? "").trim();
    if (!brut) { bilant.faraNumar++; continue; }
    /* Forma din `notice_sms_log`: toate cele 405 randuri notice.ro sunt `07XXXXXXXX` (masurat). */
    cuNumar.push({ m, forma: normalizeNoticePhone(brut) ?? brut });
  }
  if (cuNumar.length === 0) return bilant;

  /*
   * ═══ ⚠⚠ DOAR DE LA NUMERE CARORA LE-AM SCRIS ═══
   *
   * Ce intoarce `/sms-in` nu e documentat: nu stim daca lista contine doar raspunsuri la mesajele
   * noastre sau tot ce a primit contul. Un numar caruia magazinul nu i-a scris niciodata prin notice.ro
   * nu raspunde la nimic de-al nostru, deci nu intra nici in inbox, nici in lista de dezabonati. Aceeasi
   * regula ca la webhook-ul SMSO, unde tine si loc de garda: adresa webhook-ului nu e semnata, deci
   * cine ar afla-o n-ar putea insira numere straine ca sa le blocheze.
   *
   * ⚠ O citire picata ARUNCA, nu trece mai departe cu lista goala: goala, fiecare raspuns ar fi parut
   * strain si s-ar fi aruncat, inclusiv un „STOP”.
   */
  const forme = [...new Set(cuNumar.map((x) => x.forma))];
  const { data: cunoscute, error: eroareCitire } = await admin
    .from("notice_sms_log")
    .select("phone")
    .eq("business_id", businessId)
    .eq("provider", "notice")
    .in("phone", forme);
  if (eroareCitire) throw new Error(`numerele cunoscute nu s-au putut citi: ${eroareCitire.message}`);
  const scrisLor = new Set((cunoscute ?? []).map((r) => String((r as { phone: string }).phone)));

  for (const { m, forma } of cuNumar) {
    if (!scrisLor.has(forma)) { bilant.straini++; continue; }

    /*
     * ═══ ⚠⚠ OPRIREA SE JUDECA INTAI, SI SE JUDECA CHIAR DACA MESAJUL N-ARE ID ═══
     *
     * Scrierea in `sms_optout` e cheiata pe (magazin, numar), deci o repetare nu strica nimic. Un
     * „” pierdut fiindca furnizorul a uitat sa puna un id ar fi, in schimb, o reclama trimisa
     * cuiva care a cerut sa nu mai primeasca. Dintre cele doua greseli, doar una se poate repara.
     *
     * ⚠ `tineMinteDezabonarea` aduce numarul la forma COMUNA (`7XXXXXXXX`), cea pe care o cauta si
     * SMSO. Scris in forma notice, acelasi om ar fi fost doua randuri.
     */
    if (ceruOprirea(m.message)) {
      await tineMinteDezabonarea(admin, businessId, forma, "raspuns_stop_notice");
      bilant.opriri++;
    }

    const idLor = m.id ? String(m.id) : null;
    /*
     * ⚠ La TRAGERE, un rand fara id nu intra: cronul reciteste lista din ora in ora si l-ar fi scris de
     * fiecare data. La WEBHOOK intra, fiindca un mesaj impins vine o singura data, iar altfel
     * comerciantul nu l-ar vedea deloc.
     */
    if (!idLor && sursa === "tragere") { bilant.faraId++; continue; }

    const rand = {
      business_id: businessId,
      channel: opt.canal ?? "sms",
      /* Forma de AFISARE, ca la randurile vechi; garda de mai sus foloseste forma comuna. */
      from_number: forma,
      body: m.message ?? "",
      provider_id: idLor,
      received_at: m.created_at || new Date().toISOString(),
      ...(opt.brut !== undefined ? { raw: opt.brut } : {}),
    };

    /*
     * ⚠ `ignoreDuplicates` face recitirea inofensiva, iar `.select` intoarce DOAR randurile care au
     * intrat. Prima forma numara fiecare incercare ca „scrisa”, deci bilantul cronului ar fi aratat
     * aceleasi raspunsuri „scrise” din ora in ora.
     */
    const { data, error } = idLor
      ? await admin.from("notice_inbox")
          .upsert(rand as never, { onConflict: "business_id,provider_id", ignoreDuplicates: true })
          .select("id")
      : await admin.from("notice_inbox").insert(rand as never).select("id");

    if (error) {
      console.error("[notice/raspunsuri] randul nu s-a putut scrie:", { businessId, error: error.message });
      continue;
    }
    bilant.scrise += data?.length ?? 0;
  }

  return bilant;
}

/** Cere lista de la ei si o aseaza. */
export async function citesteRaspunsurile(
  admin: Admin,
  businessId: string,
  token: string,
): Promise<BilantRaspunsuri | { error: string }> {
  const lista = await getNoticeInboundSms(token);
  if ("error" in lista) return { error: lista.error };
  try {
    return await asazaRaspunsurile(admin, businessId, lista, { sursa: "tragere" });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
