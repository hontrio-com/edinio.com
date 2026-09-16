const SMSO_BASE = "https://app.smso.ro/api/v1";

export interface SmsoConfig {
  enabled: boolean;
  api_key: string;
  sender_id: string;
  // Auto-send a transactional SMS to the customer when the order status changes.
  notify_status_change?: boolean;
}

export interface SmsoSender {
  id: number;
  name: string;
}

export interface SmsoSendResult {
  success: boolean;
  /**
   * Cheia LOR pentru mesaj. Singurul mod de a intreba mai tarziu `/status` sau de a potrivi un
   * raport de livrare.
   *
   * ⚠ Era primit si aruncat in TOATE cele sase cai reale de trimitere; se folosea doar in ruta de
   * test, ca sa fie afisat pe ecranul de configurare. Deci raportam „trimis" fiindca API-ul
   * ACCEPTASE mesajul, niciodata fiindca AJUNSESE.
   */
  responseToken?: string;
  transaction_cost?: number;
  error?: string;
  /**
   * Codul lor, ca CIFRA, nu doar ca mesaj pentru om.
   *
   * ⚠ Fara el, apelantul nu putea deosebi lucruri care cer purtari complet diferite: `405` (numar
   * dezabonat) trebuie tinut minte pe veci, `402` (credit insuficient) trebuie sa OPREASCA toata
   * campania, iar o cadere de retea nu inseamna niciuna dintre ele. Pana azi toate trei se numarau
   * la fel, intr-un `failedCount`.
   */
  status?: number;
}

/** Numarul e dezabonat: ei ne-au spus-o, si nu se mai schimba. */
export const SMSO_DEZABONAT = 405;
/** Nu mai e credit. Orice mesaj urmator din aceeasi campanie va esua la fel. */
export const SMSO_FARA_CREDIT = 402;
/** Cheia API e gresita. La fel: nimic din ce urmeaza n-are cum sa mearga. */
export const SMSO_CHEIE_INVALIDA = 401;

/**
 * Codurile dupa care nu are rost sa mai incerci restul listei.
 *
 * ⚠ `409` (limita de trimitere) NU e aici dinadins: aceea trece de la sine, deci oprirea campaniei
 * ar fi prea aspra. Se numara ca esec obisnuit.
 */
export function smsoOpresteTot(status: number | undefined): boolean {
  return status === SMSO_FARA_CREDIT || status === SMSO_CHEIE_INVALIDA;
}

const ERROR_MAP: Record<number, string> = {
  400: "Cerere invalida.",
  401: "Cheie API invalida.",
  402: "Credit insuficient.",
  403: "Continut blocat de SMSO.",
  405: "Numar dezabonat.",
  409: "Limita de trimitere depasita. Incearca mai tarziu.",
  422: "SMS international restrictionat.",
};

async function smsoGet(apiKey: string, path: string) {
  return fetch(`${SMSO_BASE}${path}`, {
    headers: { "X-Authorization": apiKey },
    cache: "no-store",
  });
}

async function smsoPost(apiKey: string, path: string, params: Record<string, string>) {
  return fetch(`${SMSO_BASE}${path}`, {
    method: "POST",
    headers: {
      "X-Authorization": apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
    cache: "no-store",
  });
}

/**
 * Ce s-a intamplat cu un mesaj, intrebat dupa `responseToken`.
 *
 * ═══ ⚠⚠ AL PATRULEA CAPAT AL LOR, SI SINGURUL PE CARE NU-L FOLOSEAM DELOC ═══
 *
 * Nu-l foloseam fiindca n-aveam cu ce: `responseToken` se arunca la fiecare trimitere, deci nu
 * exista nicio cheie cu care sa intrebi. De cand urma se scrie, exista.
 *
 * ⚠ NU CERE CHEIE API. Documentatia lor: „No authentifications is required for checking the status".
 * De aceea cronul de reconciliere poate intreba pentru ORICE magazin, fara sa decripteze nicio
 * credentiala — si, la fel de important, de aceea `responseToken` nu trebuie sa ajunga niciodata in
 * browser: cine il are, afla numarul de telefon al cumparatorului din raspuns.
 *
 * ⚠ UN SINGUR MESAJ PE CERERE. Nu exista forma in lot, deci apelantul isi pune singur plafonul.
 */
export async function stareaSmsului(
  responseToken: string,
): Promise<{ status: string; delivered_at?: string | null } | { error: string }> {
  try {
    const res = await fetch(`${SMSO_BASE}/status?responseToken=${encodeURIComponent(responseToken)}`,
      { cache: "no-store" });
    const data = await res.json() as {
      status: number;
      data?: { status?: string; delivered_at?: string | null };
      message?: string;
    };
    if (!res.ok || data.status !== 200 || !data.data?.status) {
      return { error: ERROR_MAP[data.status] ?? data.message ?? "Starea mesajului nu s-a putut afla." };
    }
    return { status: data.data.status, delivered_at: data.data.delivered_at ?? null };
  } catch {
    return { error: "Eroare de retea." };
  }
}

export async function getSenders(apiKey: string): Promise<SmsoSender[] | { error: string }> {
  try {
    const res = await smsoGet(apiKey, "/senders");
    const data = await res.json() as { status: number; data?: SmsoSender[]; message?: string };
    if (!res.ok || data.status !== 200) {
      return { error: ERROR_MAP[data.status] ?? data.message ?? "Eroare la obtinerea senderelor." };
    }
    return data.data ?? [];
  } catch {
    return { error: "Eroare de retea." };
  }
}

export async function checkCredit(apiKey: string): Promise<{ credit: number } | { error: string }> {
  try {
    const res = await smsoGet(apiKey, "/credit-check");
    const data = await res.json() as { status: number; credit_value?: number; message?: string };
    if (!res.ok || data.status !== 200) {
      return { error: ERROR_MAP[data.status] ?? data.message ?? "Eroare la verificarea creditului." };
    }
    return { credit: data.credit_value ?? 0 };
  } catch {
    return { error: "Eroare de retea." };
  }
}

/**
 * Cine trimite, ca sa se vada in contul lor.
 *
 * ⚠ `source_app` e un camp documentat de ei si nu-l foloseam. Nu schimba nimic pentru cumparator,
 * dar in tabloul comerciantului mesajele apar de acum ca venind de la platforma, nu de la un API
 * anonim.
 */
const SOURCE_APP = "Edinio/1.0";

export async function sendSms(
  apiKey: string,
  params: {
    to: string;
    sender: string;
    body: string;
    type?: "transactional" | "marketing" | "otp";
    remove_special_chars?: boolean;
    /**
     * ═══ ⚠⚠ ADRESELE DE RAPORTARE, TRIMISE CU FIECARE MESAJ ═══
     *
     * Documentatia lor o spune limpede: „webhooks can be set up either in your team's account or per
     * message sent". A doua forma e cea care ne trebuie, si e mult mai buna decat prima:
     *
     * ⚠ FIECARE MAGAZIN ARE ADRESA LUI, cu secretul lui in ea. Daca ar fi setate in contul SMSO,
     * comerciantul ar trebui sa intre la ei si sa lipeasca o adresa, iar cine n-o face n-ar avea
     * niciodata rapoarte de livrare. Trimise pe mesaj, merg de la primul SMS, fara ca el sa stie ca
     * exista.
     */
    webhook_status?: string;
    webhook_responses?: string;
    /**
     * Cere-le sa inlocuiasca eticheta `[unsubscribe]` din text cu o adresa scurta de dezabonare.
     *
     * ⚠ Se trimite doar la `marketing`, fiindca doar acolo o iau in seama. Daca eticheta nu e in
     * text, nu se intampla nimic: deci e o capabilitate deschisa comerciantului, nu o schimbare
     * impusa mesajelor lui.
     */
    generate_unsubscribe_link?: boolean;
  }
): Promise<SmsoSendResult> {
  try {
    const tip = params.type ?? "marketing";
    const campuri: Record<string, string> = {
      to: params.to,
      sender: params.sender,
      body: params.body,
      type: tip,
      source_app: SOURCE_APP,
      remove_special_chars: params.remove_special_chars !== false ? "1" : "0",
    };
    if (params.webhook_status) campuri.webhook_status = params.webhook_status;
    if (params.webhook_responses) campuri.webhook_responses = params.webhook_responses;
    if (tip === "marketing" && params.generate_unsubscribe_link) campuri.generate_unsubscribe_link = "1";

    const res = await smsoPost(apiKey, "/send", campuri);
    const data = await res.json() as { status: number; responseToken?: string; transaction_cost?: number; message?: string };
    if (res.ok && data.status === 200) {
      return {
        success: true,
        responseToken: data.responseToken,
        transaction_cost: data.transaction_cost,
        status: 200,
      };
    }
    return {
      success: false,
      status: typeof data.status === "number" ? data.status : res.status,
      error: ERROR_MAP[data.status] ?? data.message ?? "Eroare necunoscuta.",
    };
  } catch {
    /* ⚠ FARA `status`: o cadere de retea nu e un verdict al lor. Nu dezaboneaza pe nimeni si nu
       opreste campania, fiindca nu stim ce s-a intamplat de partea cealalta. */
    return { success: false, error: "Eroare de retea." };
  }
}
