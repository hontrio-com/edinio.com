/**
 * Netopia Payments v2 — REST/JSON API
 * https://netopia-payments.com/
 *
 * v2 uses API keys (no more XML/certificate encryption).
 * Auth: Authorization header with the API key.
 */
/*
 * ⚠ Verificat inainte de import ca nu naste ciclu: `eroare-furnizor` nu importa nimic din
 * platforma in afara de tipuri proprii. Un ciclu n-ar cadea la `tsc`, s-ar arata la rulare ca
 * `undefined`, adica exact acolo unde se hotaraste daca banii mai pot pleca o data.
 */
import { eroareRefuz, eroareNesigura, eroareCuStatus } from "@/lib/operatii/eroare-furnizor";

export type NetopiaConfig = {
  enabled: boolean;
  sandbox: boolean;
  pos_signature: string;
  title: string;
  api_key: string;
  /**
   * Netopia "Identitate Vizuala" badge — the iframe embed code the merchant
   * copies from admin.netopia-payments.com. Shown in the storefront footer
   * (mandatory branding) when Netopia is enabled. Sanitized at save time.
   */
  badge_html?: string;
};

export const NETOPIA_SANDBOX_URL = "https://secure.sandbox.netopia-payments.com";
// v2 live API is served under /pay on secure.mobilpay.ro — without it every
// request 404s. (secure.netopia-payments.com just redirects to the marketing site.)
export const NETOPIA_PRODUCTION_URL = "https://secure.mobilpay.ro/pay";

function getBaseUrl(sandbox: boolean) {
  return sandbox ? NETOPIA_SANDBOX_URL : NETOPIA_PRODUCTION_URL;
}

export interface NetopiaStartParams {
  orderId: string;
  posSignature: string;
  amount: number;
  currency: string;
  description: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  county: string;
  postalCode?: string;
  notifyUrl: string;
  redirectUrl: string;
}

export interface NetopiaStartResponse {
  error?: { code: string; message: string };
  // Gateway-level errors (e.g. 401 Unauthorized) come flat, not under `error`.
  code?: string;
  message?: string;
  payment?: {
    paymentURL?: string;
    ntpID?: string;
    status?: number;
    token?: string;
  };
}

/**
 * Start a card payment via Netopia v2.
 * POST /payment/card/start
 */
export async function startNetopiaPayment(
  params: NetopiaStartParams,
  apiKey: string,
  sandbox: boolean
): Promise<{ redirectUrl?: string; ntpID?: string; error?: string }> {
  const baseUrl = getBaseUrl(sandbox);

  const body = {
    config: {
      emailTemplate: "",
      notifyUrl: params.notifyUrl,
      redirectUrl: params.redirectUrl,
      language: "ro",
    },
    payment: {
      options: {
        installments: 0,
        bonus: 0,
      },
      instrument: {
        type: "card",
      },
      data: {},
    },
    order: {
      ntpID: "",
      posSignature: params.posSignature,
      dateTime: new Date().toISOString(),
      description: params.description,
      orderID: params.orderId,
      amount: params.amount,
      currency: params.currency,
      billing: {
        email: params.email,
        phone: params.phone,
        firstName: params.firstName,
        lastName: params.lastName,
        city: params.city,
        country: 642, // Romania ISO 3166-1 numeric
        countryName: "Romania",
        state: params.county,
        postalCode: params.postalCode || "000000",
        details: params.address,
      },
      shipping: {
        email: params.email,
        phone: params.phone,
        firstName: params.firstName,
        lastName: params.lastName,
        city: params.city,
        country: 642,
        countryName: "Romania",
        state: params.county,
        postalCode: params.postalCode || "000000",
        details: params.address,
      },
      products: [
        {
          name: params.description,
          code: params.orderId,
          category: "order",
          price: params.amount,
          vat: 0,
        },
      ],
      installments: {
        selected: 0,
        available: [0],
      },
      data: {},
    },
  };

  try {
    const res = await fetch(`${baseUrl}/payment/card/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey.trim(),
      },
      body: JSON.stringify(body),
    });

    // Read as text first: on a wrong endpoint, invalid API key or upstream error
    // Netopia can return a non-JSON page, and res.json() would throw and hide the
    // real status/body. Parse manually and always log enough to debug.
    const rawBody = await res.text();
    let data: NetopiaStartResponse;
    try {
      data = JSON.parse(rawBody) as NetopiaStartResponse;
    } catch {
      console.error(
        `[netopia] non-JSON response (HTTP ${res.status}) from ${baseUrl}/payment/card/start:`,
        rawBody.slice(0, 800)
      );
      return {
        error: `Netopia a raspuns neasteptat (HTTP ${res.status}). Verifica API Key-ul si modul (Sandbox/Live).`,
      };
    }

    if (!res.ok) {
      console.error(`[netopia] HTTP ${res.status}:`, JSON.stringify(data).slice(0, 800));
    }

    // In Netopia v2 `error.code` is a STATUS, not necessarily a failure:
    //   "00"  = completed
    //   "101" = redirect the customer to the hosted payment page (normal path
    //           for a fresh card payment — 3DS / card entry)
    // The real signal is paymentURL: if Netopia hands us a URL, send the customer
    // there regardless of the (non-fatal) status code. Only a missing URL is an error.
    if (data.payment?.paymentURL) {
      return { redirectUrl: data.payment.paymentURL, ntpID: data.payment.ntpID };
    }

    if (res.status === 401) {
      return { error: "Netopia a refuzat autentificarea: API Key invalid sau nepotrivit cu modul selectat (Sandbox/Live)." };
    }

    const errCode = data.error?.code ?? data.code;
    const errMessage = data.error?.message ?? data.message;
    if (errCode && errCode !== "00") {
      console.error(`[netopia] error code ${errCode}: ${errMessage ?? ""}`);
      return { error: errMessage || `Netopia error: ${errCode}` };
    }

    console.error("[netopia] no paymentURL in response:", JSON.stringify(data).slice(0, 800));
    return { error: "Nu s-a primit URL-ul de plata de la Netopia." };
  } catch (err) {
    console.error("[netopia] startPayment failed:", err);
    return { error: "Eroare la comunicarea cu Netopia." };
  }
}

/**
 * Netopia v2 IPN notification payload.
 */
export interface NetopiaIpnPayload {
  payment?: {
    ntpID?: string;
    status?: number;
    token?: string;
    amount?: number;
    currency?: string;
    data?: Record<string, unknown>;
    /*
     * ⚠ `code` si `message` sunt in schema lor `PaymentNotify` si lipseau de aici, deci motivul
     * REAL al unui refuz nu se putea citi. Masurat pe sandbox: la un CVV gresit vine
     * `code: "21", message: "Invalid CVV"`, la un numar inexistent `"17" / "Invalid card number"`.
     * Fara ele, un status necunoscut ar fi ajuns in jurnal ca o cifra goala.
     */
    code?: string;
    message?: string;
    error?: { code: string; message: string };
  };
  order?: {
    orderID?: string;
    ntpID?: string;
    posSignature?: string;
    amount?: number;
  };
}

/**
 * Statusurile de plata Netopia v2, din specificatia lor OFICIALA.
 *
 * ═══ ⚠⚠ 12 NU INSEAMNA „ANULAT" (16.09.2026) ═══
 *
 * Aici scria `12 = cancelled`, iar codul anula comanda. Afirmatia venea din migrarea v1 to v2 si
 * NU e sustinuta de nimic din v2. Specificatia lor OpenAPI 3.0
 * (`https://secure.sandbox.netopia-payments.com/spec`, citita pe 16.09.2026) o spune de DOUA ori,
 * in doua scheme diferite:
 *
 *   * `NotifyRequest.payment.status` si `PaymentNotify.status`: „12 = **invalid account**";
 *   * `Payment.status` (raspunsul de pornire): „12 - **rejected**".
 *
 * Adica plata a fost REFUZATA: card gresit, cont invalid, fonduri insuficiente. Nu e o hotarare a
 * cumparatorului, e un refuz al bancii.
 *
 * ⚠⚠ SI CE COSTA ANULAREA: `/api/netopia/start` refuza sa porneasca o plata pe o comanda cu
 * `status === "cancelled"`. Deci un card refuzat OMORA comanda: cumparatorul nu mai poate reincerca
 * niciodata, iar stocul si cuponul se elibereaza. O vanzare pierduta tacut, dintr-o cifra.
 *
 * ⚠ Purtarea corecta e deja SCRISA in platforma, pentru exact aceeasi situatie. Cronul
 * `discount-release`, despre plata online neterminata: „Ce NU face: nu anuleaza si nu atinge in
 * niciun fel comanda. Comanda neplatita ramane a comerciantului, cu totul." Cine abandoneaza pe
 * pagina bancii ramane cu comanda in asteptare; cine are cardul refuzat trebuie tratat la fel.
 *
 * Deci 12 nu misca nimic. Se intoarce `refuzat`, ca ruta sa lase o urma pentru comerciant.
 *
 * ═══ ⚠⚠ 15 NU E RAMBURSARE. RAMBURSAREA E 8 (16.09.2026, dupa fluxul cap-coada) ═══
 *
 * Aici scria ca „15 (rambursare) nu apare in specificatia v2, e cunostinta mostenita din v1", si
 * ca maparea ei e „in directia sigura". AMANDOUA erau gresite, si le-am scris chiar eu, in
 * dimineata aceleiasi zile.
 *
 * ⚠ APARE in v2, si scrie altceva. Schema `Payment` din specificatia lor (liniile 1724 si 2391 ale
 * `https://secure.sandbox.netopia-payments.com/spec`) da lista intreaga:
 *
 *     3 - paid | 5 - confirmed | 12 - rejected | 15 - **3-D Secure authentication required**
 *
 * Citisem doar schema `PaymentNotify`, care enumera trei coduri, si am tras concluzia ca al
 * patrulea nu exista nicaieri. Exista, in schema de alaturi.
 *
 * ⚠ SI NU E IN DIRECTIA SIGURA. `refunded` face parte din `BANII_S_AU_INTORS`
 * (`src/lib/orders/marfa-a-plecat-fara-bani.ts`), deci o comanda marcata gresit „rambursata" e
 * SCOASA din semnalul de marfa plecata fara bani. Adica maparea nu doar eticheta gresit: amutea
 * chiar plasa intinsa in aceeasi zi pentru cazul in care banii nu intra.
 *
 * ⚠ CE E DE FAPT RAMBURSAREA: **8**, masurat. `POST /operation/credit` pe sandbox-ul magazinului
 * `itp-blk`, cu `ntpID` 3022507 (o plata de 1 leu dusa pana la capat prin pagina lor), a raspuns
 * `status: 8`, `code: "00"`, `message: "[TEST P] Approved"`, iar IPN-ul sosit la
 * `/api/netopia/notify` la 19:31:57 purta tot `status: 8`.
 *
 * Codul 8 l-a prins colectorul de statusuri nerecunoscute scris tot azi, la mai putin de o ora
 * dupa ce a fost pus. Exact pentru asta a fost pus.
 *
 * ⚠ CATE IPN-URI TRIMIT: UNUL SINGUR, la deznodamant. Masurat pe plata cu 3-D Secure (cardul
 * `9900009184214768` din chiar exemplele lor): pornirea a raspuns `status 1` cu pagina de plata,
 * pagina de autentificare a fost trecuta, si abia atunci a venit un IPN, cu `status 3`. La etapa
 * „3-D Secure cerut" nu vine NICIO notificare. Deci 15 si 1 nu ajung in IPN pe drumul obisnuit,
 * dar daca ajung vreodata, nu misca nimic si se scriu in jurnal.
 *
 * ⚠ Orice alt cod NU misca nimic, si asta ramane: tacerea pe necunoscut e purtarea corecta cand
 * de partea cealalta sunt bani.
 *
 * ═══ ✅ DOVEDIT PE SANDBOX-UL LOR, 16.09.2026 ═══
 *
 * Nu mai e o citire de specificatie. Cu cardurile de test din chiar specificatia lor, pe contul de
 * sandbox al magazinului `itp-blk`, `POST /payment/card/start` a raspuns:
 *
 *   | card               | status | mesajul lor            |
 *   |--------------------|--------|------------------------|
 *   | valid, fara 3-D-S  |   3    | `00 Approved`          |
 *   | CVV gresit         | **12** | `21 Invalid CVV`       |
 *   | numar inexistent   | **12** | `17 Invalid card number` |
 *   | card expirat       |   1    | `19 Expired card`      |
 *
 * ⚠⚠ Deci 12 e REFUZ DE CARD, confirmat de doua ori, si nu e un cod rar: e chiar ce produce un
 * CVV tastat gresit, cea mai obisnuita greseala a unui cumparator. Pana la reparatia de azi, cine
 * gresea codul de pe card ramanea cu comanda ANULATA si nu o mai putea plati niciodata.
 *
 * ⚠ SI S-A VAZUT UN COD NOU: `1`, la cardul expirat. Nu se mapeaza, si nu din lene: nu stim daca
 * `1` inseamna intotdeauna un refuz sau e o stare intermediara (raspunsul purta si o pagina de
 * plata, deci cumparatorul poate relua acolo). Tacerea pe necunoscut ramane, iar ruta scrie de
 * acum codurile nerecunoscute in jurnal, ca harta sa creasca din TRAFIC, nu din presupuneri
 * (acelasi drum ca la Woot si Cargus).
 */
export function resolveNetopiaStatus(status: number): {
  orderStatus?: string;
  paymentStatus?: string;
  /** Plata a fost refuzata de ei. Comanda NU se misca; se scrie doar o urma pentru comerciant. */
  refuzat?: true;
  /**
   * Stare INTERMEDIARA pe care o cunoastem: plata nu s-a incheiat nici bine, nici rau. Comanda NU
   * se misca, la fel ca la un cod necunoscut, dar ruta o spune pe nume in loc sa scrie
   * „NERECUNOSCUT" despre ceva ce stim. Un jurnal care minte se repara gresit mai tarziu.
   */
  intermediar?: true;
} {
  switch (status) {
    case 3: // paid
    case 5: // confirmed
      return { orderStatus: "confirmed", paymentStatus: "paid" };
    case 8: // credit: rambursare incuviintata. Masurat pe `/operation/credit`, vezi antetul.
      return { paymentStatus: "refunded" };
    case 12: // invalid account / rejected: plata REFUZATA, nu anulata
      return { refuzat: true };
    case 1: // plata pornita, se asteapta cumparatorul (raspunsul purta si pagina de plata)
    case 15: // 3-D Secure authentication required
      return { intermediar: true };
    default:
      return {};
  }
}

/**
 * ═══ RAMBURSAREA, `POST /operation/credit` (16.09.2026) ═══
 *
 * ⚠ SPECIFICATIA LOR SPUNE CA NU E GATA. La toate capetele `OperationService` (`capture`, `void`,
 * `credit`, `status`, `expire`, `fail`) scrie `will be available at a future date`. E fals, si
 * s-a masurat: pe sandbox-ul magazinului `itp-blk`, cu `ntpID` 3022507 (o plata de 1 leu dusa
 * pana la capat prin pagina lor gazduita), `POST /operation/credit` a raspuns HTTP 200 cu
 * `payment.status: 8`, `error.code: "00"`, `error.message: "[TEST P] Approved"`, iar la
 * `/api/netopia/notify` a sosit un IPN cu chiar `status: 8`. Banii s-au intors.
 *
 * A doua oara in aceeasi zi cand proza lor spune altceva decat capetele lor. Prima a fost campul
 * `amount`, descris in unitati minore si folosit in unitati majore.
 *
 * ⚠ SUMA E IN UNITATI MAJORE, ca peste tot la ei: 1 inseamna un leu. Dovedit de aceeasi proba,
 * unde cererea a plecat cu `amount: 1` pe o plata de 1,00 lei si a fost incuviintata.
 *
 * ⚠ ARUNCA, nu intoarce `{error}`, si asta e dinadins: apelantul o ruleaza sub `cuRegistru`, iar
 * acolo deosebirea dintre un REFUZ dovedit si un NECUNOSCUT hotaraste daca a doua apasare mai are
 * voie sa trimita bani. Un refuz al lor elibereaza reincercarea; o cadere de retea o BLOCHEAZA,
 * fiindca rambursarea poate sa fi plecat.
 */
export async function rambourseazaNetopia(
  params: { ntpID: string; amount: number },
  apiKey: string,
  sandbox: boolean,
): Promise<{ ntpID: string; status: number | null; mesaj: string | null }> {
  const url = `${getBaseUrl(sandbox)}/operation/credit`;

  let res: Response;
  let brut: string;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: apiKey.trim() },
      body: JSON.stringify({ ntpID: params.ntpID, amount: params.amount }),
    });
    brut = await res.text();
  } catch (err) {
    /* Reteaua a cazut. NU stim daca cererea a ajuns la ei, deci nu se deblocheaza nimic. */
    throw eroareNesigura(
      `Nu s-a putut ajunge la Netopia pentru rambursare: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let date: NetopiaStartResponse;
  try {
    date = JSON.parse(brut) as NetopiaStartResponse;
  } catch {
    /*
     * Un corp neinteligibil nu dovedeste un refuz. Poate fi o pagina de intretinere pusa DUPA ce
     * rambursarea a fost inregistrata, deci se trateaza ca necunoscut.
     */
    throw eroareCuStatus(
      `Netopia a raspuns neasteptat la rambursare (HTTP ${res.status}): ${brut.slice(0, 200)}`,
      res.status,
    );
  }

  const cod = date.error?.code ?? date.code ?? null;
  const mesaj = date.error?.message ?? date.message ?? null;

  if (res.status === 401 || res.status === 403) {
    /* Autentificarea lor a picat: dovedit ca nu s-a intamplat nimic acolo. */
    throw eroareRefuz("Netopia a refuzat autentificarea la rambursare: API Key invalid sau nepotrivit cu modul (Sandbox/Live).");
  }
  if (!res.ok) {
    throw eroareCuStatus(mesaj ?? `Netopia a refuzat rambursarea (HTTP ${res.status}).`, res.status);
  }
  /*
   * ⚠ `"00"` e singurul cod de incuviintare, si se cere EXPLICIT. Un cod lipsa nu se citeste ca
   * succes: la o operatie care mata bani, tacerea nu inseamna „s-a facut".
   */
  if (cod !== "00") {
    throw eroareRefuz(mesaj ? `Netopia a refuzat rambursarea: ${mesaj} (cod ${cod ?? "lipsa"})` : `Netopia a refuzat rambursarea (cod ${cod ?? "lipsa"}).`);
  }

  return {
    ntpID: date.payment?.ntpID ?? params.ntpID,
    status: typeof date.payment?.status === "number" ? date.payment.status : null,
    mesaj,
  };
}

/**
 * ═══ INTREBAM NOI, CAND EI NU NE-AU SPUS: `POST /operation/status` (16.09.2026) ═══
 *
 * ⚠⚠ ASTA INCHIDE SINGURA GAURA PE CARE O SCRISESEM CA FIIND A LOR. In `docs/plati/NETOPIA.md`
 * statea, la „ce ramane deschis": „Netopia nu are plasa, si ei o spun. `/operation/status` exista in
 * specificatie cu descrierea «will be available at a future date». Deci nu se poate interoga starea
 * unei plati: daca IPN-ul nu ajunge, plata se pierde tacut si nimic n-o mai gaseste."
 *
 * ⚠ E FALS, si s-a aflat chemandu-l. Pe sandbox-ul magazinului `itp-blk`, pentru `ntpID` 3022507,
 * a raspuns HTTP 200 cu `payment.status: 5`, `error.code: "00"`, `error.message: "Approved"`, si cu
 * intreaga configurare a platii, inclusiv `notifyUrl`-ul nostru semnat.
 *
 * A doua oara in aceeasi zi cand proza lor spune altceva decat capetele lor. Concluzia, scrisa ca sa
 * nu se piarda: la Netopia, o propozitie din specificatie NU e o masuratoare.
 *
 * ⚠ ARUNCA, la fel ca rambursarea, si din acelasi motiv: cronul care o cheama trebuie sa deosebeasca
 * „ei zic ca nu stiu de tranzactia asta" de „n-am putut ajunge la ei".
 */
export async function stareaPlatiiNetopia(
  params: { ntpID: string; posSignature: string; orderId?: string },
  apiKey: string,
  sandbox: boolean,
): Promise<{ status: number | null; codLor: string | null; mesajLor: string | null; incasat: number | null }> {
  const url = `${getBaseUrl(sandbox)}/operation/status`;

  let res: Response;
  let brut: string;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: apiKey.trim() },
      body: JSON.stringify({ posID: params.posSignature, ntpID: params.ntpID, orderID: params.orderId ?? "" }),
    });
    brut = await res.text();
  } catch (err) {
    throw eroareNesigura(
      `Nu s-a putut ajunge la Netopia pentru starea platii: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let date: NetopiaStartResponse & { payment?: { amount?: number } };
  try {
    date = JSON.parse(brut) as NetopiaStartResponse;
  } catch {
    throw eroareCuStatus(`Netopia a raspuns neasteptat la interogarea starii (HTTP ${res.status}).`, res.status);
  }

  if (res.status === 401 || res.status === 403) {
    throw eroareRefuz("Netopia a refuzat autentificarea la interogarea starii: API Key invalid sau nepotrivit cu modul (Sandbox/Live).");
  }
  if (!res.ok) {
    throw eroareCuStatus(
      date.error?.message ?? `Netopia a refuzat interogarea starii (HTTP ${res.status}).`,
      res.status,
    );
  }

  /*
   * ⚠ AICI NU SE CERE `code === "00"`, SI E PE DOS FATA DE RAMBURSARE, DINADINS.
   *
   * La rambursare, `"00"` inseamna „am facut ce ai cerut", deci lipsa lui inseamna ca banii n-au
   * plecat. Aici cererea e o INTREBARE: raspunsul util e `payment.status`, iar codul descrie starea
   * tranzactiei, nu izbanda intrebarii. Cerut si aici, o plata refuzata (cod 21, CVV gresit) ar fi
   * fost citita ca o eroare de comunicare si reconcilierea n-ar fi aflat niciodata de ea.
   */
  const s = date.payment?.status;
  return {
    status: typeof s === "number" ? s : null,
    codLor: date.error?.code ?? date.code ?? null,
    mesajLor: date.error?.message ?? date.message ?? null,
    incasat: typeof date.payment?.amount === "number" ? date.payment.amount : null,
  };
}
