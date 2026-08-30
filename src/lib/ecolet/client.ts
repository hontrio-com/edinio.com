import { eroareCuStatus, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";

/**
 * Clientul eColet.
 *
 * ═══ CE E ECOLET ═══
 *
 * O platforma-BROKER: un singur cont, mai multi curieri (DPD, Sameday, FAN,
 * Cargus…). Ca Woot si ca Colete Online, si spre deosebire de GLS sau Pall-Ex.
 * Deci cumparatorul alege in checkout o oferta anume, iar alegerea lui trebuie
 * sa ajunga pana la emiterea AWB-ului.
 *
 * Documentatia: `https://panel.ecolet.ro/api/documentation`, care serveste
 * specificatia OpenAPI 3.0.0 de la `https://panel.ecolet.ro/docs/api-docs.json`
 * (versiunea 1.0.3). Contractele de mai jos sunt luate de acolo, camp cu camp.
 *
 * ═══ ⚠ TREI LUCRURI AFLATE PE FIR, PE CARE SPECIFICATIA NU LE SPUNE ═══
 *
 * 1. **`Accept: application/json` e OBLIGATORIU pe fiecare cerere.** Fara el,
 *    aplicatia lor (Laravel) face REDIRECT 302 catre pagina de login in loc sa
 *    raspunda 401. Adica un token expirat n-ar aparea ca problema de
 *    autentificare, ci ca o pagina HTML care crapa la `JSON.parse` — si mesajul
 *    catre comerciant ar fi despre altceva decat cauza reala.
 *
 *      GET /services fara antet  -> 302, text/html
 *      GET /services cu antet    -> 401, {"message":"Unauthenticated."}
 *
 * 2. **`GET /me` NU raspunde niciodata 401.** Cu token gresit sau fara token, tot
 *    `200` cu `{"unauthenticated": true}` in corp. Un test de conexiune scris pe
 *    statusul HTTP ar iesi VERDE fara nicio credentiala, iar comerciantul ar afla
 *    ca nu e conectat abia la prima expediere. De aceea proba de conexiune merge
 *    pe `/services` — care raspunde 401 cinstit — si de aceea `esteAutentificat`
 *    de mai jos citeste corpul, nu statusul.
 *
 * 3. **Emiterea e ASINCRONA.** `POST /add-parcel/send-order` intoarce doar
 *    `{order_to_send_id}`. AWB-ul apare abia dupa ce `GET /order-to-send/{id}`
 *    trece pe `ordered`. Vezi `finalizeazaEmiterea` si migratia din 31.08.
 */

const BAZA = "https://panel.ecolet.ro/api/v1";

/**
 * Statusul HTTP, pastrat PE eroare.
 *
 * ⚠ Acelasi tipar ca la Pall-Ex, si din aceeasi lectie platita: `anuleaza`
 * trebuie sa deosebeasca „nu exista acolo" (404) de orice alt refuz, iar statusul
 * NU ajunge in textul erorii — `eroareCuStatus` il foloseste doar ca sa aleaga
 * verdictul. O potrivire pe cuvinte („not found") ar depinde de limba raspunsului
 * si, mai rau, ar sterge coloanele pe o expediere VIE cand un intermediar
 * raspunde cu o pagina care contine acele cuvinte.
 */
const CHEIE_STATUS = "statusHttp" as const;

export function statusEroare(e: unknown): number | null {
  const v = (e as { [CHEIE_STATUS]?: unknown } | null)?.[CHEIE_STATUS];
  return typeof v === "number" ? v : null;
}

function cuStatus(e: Error, status: number): Error {
  (e as Error & { [CHEIE_STATUS]?: number })[CHEIE_STATUS] = status;
  return e;
}

/** Cat asteptam. Cotarea sta in calea cumparatorului, deci nu are voie sa atarne. */
const ASTEPTARE_MS = 25_000;
/** Emiterea si finalizarea isi permit mai mult: sunt pornite de comerciant. */
const ASTEPTARE_EMITERE_MS = 45_000;

export type ExpeditorEcolet = {
  name: string;
  county: string;
  locality: string;
  /** ⚠ Id-ul din nomenclatorul LOR, nu numele. Vezi `localitati.ts`. */
  locality_id: number;
  postal_code: string;
  street_name: string;
  street_number: string;
  contact_person: string;
  email: string;
  phone: string;
};

export type EcoletConfig = {
  enabled: boolean;
  /** Tokenul din panel.ecolet.ro. Singura credentiala: nu exista user si parola. */
  api_token: string;
  /** Adresa de ridicare, completata in panoul de configurare. */
  expeditor?: Partial<ExpeditorEcolet>;
  /**
   * Slug-urile pe care comerciantul le lasa sa apara in checkout. Gol = toate
   * cele pe care le da contul. Serveste la a nu-i arata cumparatorului zece
   * oferte cand comerciantul vrea doua.
   */
  servicii_permise?: string[];
  /** Bifele de servicii aditionale, aplicate la fiecare expediere. */
  deschidere_la_livrare?: boolean;
  livrare_sambata?: boolean;
  sms_notificare?: boolean;
};

/** Un serviciu din catalogul contului (`GET /services`). */
export type ServiciuEcolet = {
  id: number;
  slug: string;
  name: string;
  full_name: string;
  status: boolean;
  courier: { id: number; slug: string; name: string; status: boolean };
  conditions?: {
    has_cod?: boolean;
    has_open_package?: boolean;
    has_rod?: boolean;
    has_rop?: boolean;
    has_saturday_delivery?: boolean;
    has_sms_notify?: boolean;
    has_swap?: boolean;
    has_multipacks?: boolean;
  };
};

/** Adresa, in forma ceruta de eColet. Numele campurilor sunt ale LOR. */
export type AdresaEcolet = {
  name: string;
  country: string;
  county: string;
  locality_id: number;
  locality: string;
  postal_code: string;
  street_name: string;
  street_number: string;
  block?: string;
  entrance?: string;
  floor?: string;
  flat?: string;
  contact_person: string;
  email: string;
  phone: string;
};

export type CorpExpediere = {
  sender: AdresaEcolet;
  receiver: AdresaEcolet;
  parcel: {
    type: "package" | "envelope" | "pallet";
    weight: number;
    dimensions: { length: number; width: number; height: number };
    shape: "standard" | "nonstandard";
    declared_value?: number;
    amount: number;
    content: string;
    observations?: string;
  };
  additional_services: {
    cod: { status: boolean; amount?: number };
    open_package: { status: boolean };
    saturday_delivery: { status: boolean };
    sms_notify: { status: boolean };
  };
  courier: {
    /** Slug-ul serviciului. Gol la cotare: atunci eColet le raspunde pe TOATE. */
    service?: string;
    pickup: { type: "courier" | "self"; date?: string; time?: string };
  };
};

/** Raspunsul cotarii. ⚠ Toate campurile sunt obiecte INDEXATE PE SLUG. */
export type RaspunsCotare = {
  form?: {
    statuses?: Record<string, boolean>;
    additional_services?: Record<string, Record<string, boolean>>;
    prices_net?: Record<string, string>;
    prices_gross?: Record<string, string>;
    billing_weight?: number;
    is_standard?: Record<string, boolean>;
    vat?: number;
    info?: string[];
    /** ⚠ Erori pe comanda, indexate pe CAMP, nu pe slug. Blocheaza expedierea. */
    errors?: Record<string, string[]>;
  };
};

export type Expediere = {
  id: number;
  awb?: string | null;
  status?: string | null;
  price?: number | null;
  service?: { slug?: string; full_name?: string; courier_slug?: string; courier_name?: string };
  statuses?: { name?: string; real_name?: string; created_at?: string }[];
  cod?: number | null;
  waybill_extension?: string | null;
};

export type StareTrimitere = {
  id: number;
  status: "new" | "ordered" | "error" | string;
  error?: string | null;
  order_id?: number | null;
};

/** O comanda din lotul de statusuri (`POST /order/get-statuses-for-many-orders`). */
export type StatusInLot = {
  id: number;
  awb: string;
  courier?: string;
  status: string;
  statuses?: { name?: string; real_name?: string; created_at?: string }[];
};

// ─── Cererea ──────────────────────────────────────────────────────────────────

/**
 * Un apel catre eColet.
 *
 * ═══ VERDICTELE ═══
 *
 * Registrul de operatii externe are nevoie de un singur raspuns: a REFUZAT
 * furnizorul, sau nu stim?
 *
 * ⚠ Cu `Accept: application/json` pus mai jos, eColet chiar raspunde cu coduri
 * adevarate (401, 422, 500), deci `eroareCuStatus` poate hotari. FARA antetul
 * acela, tot ce e neautentificat vine ca 302 cu HTML — si atunci `eroareCuStatus`
 * ar fi spus „3xx, deci nu stim", blocand comenzi pentru un token expirat.
 *
 * ⚠ 422 e forma lor de refuz de validare: `{message, errors:{camp:[motive]}}`,
 * plus varianta `{general_error: "..."}`. Amandoua sunt refuzuri DOVEDITE — nu
 * s-a creat nimic — deci reincercarea dupa corectare ramane libera.
 */
async function apel<T>(
  config: Pick<EcoletConfig, "api_token">,
  metoda: "GET" | "POST" | "DELETE",
  cale: string,
  corp?: unknown,
  asteptareMs = ASTEPTARE_MS,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BAZA}${cale}`, {
      method: metoda,
      headers: {
        Authorization: `Bearer ${config.api_token}`,
        /* ⚠ Vezi nota 1 din antetul fisierului. Fara el, 401 devine 302 HTML. */
        Accept: "application/json",
        ...(corp !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: corp !== undefined ? JSON.stringify(corp) : undefined,
      signal: AbortSignal.timeout(asteptareMs),
      cache: "no-store",
    });
  } catch (e) {
    /* Retea cazuta sau timeout: nu stim daca cererea a ajuns. */
    throw eroareNesigura(`eColet ${metoda} ${cale}: ${(e as Error).message}`);
  }

  const text = await res.text();
  let date: unknown = null;
  if (text.trim()) {
    try { date = JSON.parse(text); } catch { date = null; }
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw cuStatus(eroareRefuz(
        "eColet: token respins. Genereaza altul in panel.ecolet.ro si pune-l in configurare.",
      ), res.status);
    }
    throw cuStatus(
      eroareCuStatus(`eColet ${metoda} ${cale}: ${res.status} — ${descrieEroarea(date, text)}`, res.status),
      res.status,
    );
  }

  /*
   * ⚠ Un 2xx cu corp necitibil NU e succes.
   *
   * E chiar cazul redirectului catre login, daca antetul `Accept` se pierde
   * vreodata: HTML servit cu 200. Citit ca succes, am fi raportat o expediere
   * inexistenta; citit ca refuz dovedit, am fi deblocat reincercarea. Amandoua
   * gresite — verdictul e „nu stim".
   */
  if (text.trim() && date === null) {
    throw eroareNesigura(
      `eColet ${metoda} ${cale}: raspuns necitibil (${res.status}) — ${text.slice(0, 200)}`,
    );
  }

  return date as T;
}

/**
 * Mesajul de eroare, scos din corp.
 *
 * eColet are TREI forme, si a doua e cea folositoare:
 *   `{"message": "The given data was invalid.", "errors": {"camp": ["motiv"]}}`
 *   `{"general_error": "Service unavailable."}`
 *   `{"message": "Unauthenticated."}`
 */
export function descrieEroarea(corp: unknown, brut: string): string {
  if (corp && typeof corp === "object") {
    const o = corp as { message?: unknown; general_error?: unknown; errors?: unknown };

    /* Motivele pe camp sunt cele care ii spun omului CE sa corecteze. */
    if (o.errors && typeof o.errors === "object") {
      const motive: string[] = [];
      for (const [camp, lista] of Object.entries(o.errors as Record<string, unknown>)) {
        const texte = Array.isArray(lista) ? lista.filter((m): m is string => typeof m === "string") : [];
        if (texte.length) motive.push(`${camp}: ${texte.join("; ")}`);
      }
      if (motive.length) return motive.join(" | ").slice(0, 400);
    }

    if (typeof o.general_error === "string" && o.general_error.trim()) return o.general_error.trim();
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
  }
  return brut.trim().slice(0, 300) || "raspuns gol";
}

// ─── Autentificare ────────────────────────────────────────────────────────────

/** Aceeasi regula de „configurat" peste tot: panou, checkout, comanda, cron. */
export function ecoletGata(c: EcoletConfig | null | undefined): c is EcoletConfig {
  return !!(c?.enabled && c.api_token);
}

/**
 * Catalogul de servicii al contului.
 *
 * ⚠ E si proba de conexiune, dinadins: raspunde 401 cinstit la token gresit (spre
 * deosebire de `/me`), si aduce exact lista de care are nevoie configurarea. O
 * citire pura — nu creeaza nimic, deci butonul se poate apasa de zece ori.
 */
export async function catalogServicii(config: EcoletConfig): Promise<ServiciuEcolet[]> {
  const r = await apel<{ services?: unknown }>(config, "GET", "/services");
  const lista = Array.isArray(r?.services) ? r.services : [];
  return lista
    .map((s) => s as ServiciuEcolet)
    .filter((s) => s && typeof s.slug === "string" && s.slug.length > 0);
}

export async function probaConexiune(
  config: EcoletConfig,
): Promise<{ ok: true; servicii: ServiciuEcolet[] } | { ok: false; eroare: string }> {
  try {
    return { ok: true, servicii: await catalogServicii(config) };
  } catch (e) {
    return { ok: false, eroare: (e as Error).message };
  }
}

// ─── Cotare ───────────────────────────────────────────────────────────────────

/**
 * Valideaza expedierea si intoarce preturile, pe toate serviciile deodata.
 *
 * ⚠ Citire pura: `reload-form` NU creeaza nimic, oricat de des ar fi chemat. De
 * aia se poate folosi si in checkout, pentru fiecare cumparator.
 */
export async function coteaza(config: EcoletConfig, corp: CorpExpediere): Promise<RaspunsCotare> {
  return apel<RaspunsCotare>(config, "POST", "/add-parcel/reload-form", corp);
}

// ─── Emitere ──────────────────────────────────────────────────────────────────

/**
 * Trimite expedierea.
 *
 * ⚠ CREEAZA UN TRANSPORT REAL, facturat. Nu se cheama de doua ori pentru aceeasi
 * comanda fara sa treaca prin registrul de operatii externe.
 *
 * ⚠ Si NU intoarce AWB-ul: doar `order_to_send_id`. Restul se afla din
 * `stareaTrimiterii`, mai tarziu — uneori peste minute.
 */
export async function trimite(config: EcoletConfig, corp: CorpExpediere): Promise<number> {
  const r = await apel<{ order_to_send_id?: unknown }>(
    config, "POST", "/add-parcel/send-order", corp, ASTEPTARE_EMITERE_MS,
  );
  const id = Number(r?.order_to_send_id);
  if (!Number.isInteger(id) || id <= 0) {
    /*
     * Cel mai prost caz: expedierea probabil exista, dar n-avem cu ce sa o mai
     * urmarim. Verdictul ramane NESIGUR, ca registrul sa blocheze si sa scoata
     * cazul la om — un „esuat" ar debloca reincercarea, adica a doua expediere.
     */
    throw eroareNesigura("eColet a raspuns fara `order_to_send_id` — verifica in panel daca s-a creat expedierea");
  }
  return id;
}

/**
 * Unde a ajuns o expediere trimisa.
 *
 * ⚠ Citire pura. `status` e `new` cat timp eColet inca lucreaza, `ordered` cand
 * exista comanda (si `order_id`), `error` cand curierul a refuzat (si `error`
 * spune de ce).
 */
export async function stareaTrimiterii(
  config: EcoletConfig,
  id: number,
  /* Cronul lucreaza sub un buget si nu-si permite implicitul de 45 de secunde. */
  asteptareMs = ASTEPTARE_EMITERE_MS,
): Promise<StareTrimitere | null> {
  const r = await apel<{ order_to_send?: unknown }>(
    config, "GET", `/order-to-send/${id}`, undefined, asteptareMs,
  );
  const o = r?.order_to_send as StareTrimitere | undefined;
  if (!o || typeof o.status !== "string") return null;
  return {
    id: Number(o.id) || id,
    status: o.status,
    error: typeof o.error === "string" ? o.error : null,
    order_id: Number.isInteger(Number(o.order_id)) && Number(o.order_id) > 0 ? Number(o.order_id) : null,
  };
}

/** Expedierea, dupa ce a devenit comanda la ei. Citire pura. */
export async function citesteExpedierea(
  config: EcoletConfig,
  orderId: number,
  asteptareMs?: number,
): Promise<Expediere | null> {
  const r = await apel<{ data?: unknown }>(config, "GET", `/order/${orderId}`, undefined, asteptareMs);
  const o = r?.data as Expediere | undefined;
  return o && Number.isInteger(Number(o.id)) ? o : null;
}

/**
 * Anuleaza expedierea.
 *
 * `sters` in loc de exceptie la 404, din acelasi motiv ca la Pall-Ex: o anulare
 * intrata in timeout DUPA ce eColet apucase sa stearga lasa comanda cu un AWB pe
 * care nimeni nu-l mai poate scoate — nici anulat (nu mai exista), nici reemis
 * (registrul il tine ocupat). Hotararea se ia pe STATUSUL HTTP, nu pe text.
 */
export async function anuleaza(
  config: EcoletConfig,
  orderId: number,
): Promise<{ sters: true } | { sters: false; motiv: string }> {
  try {
    await apel<unknown>(config, "DELETE", `/order/${orderId}`, undefined, ASTEPTARE_EMITERE_MS);
    return { sters: true };
  } catch (e) {
    if (statusEroare(e) === 404) return { sters: true };
    return { sters: false, motiv: (e as Error).message };
  }
}

/**
 * Statusurile mai multor expedieri, dintr-un singur apel.
 *
 * ⚠ ASTA face urmarirea eColet altfel decat a tuturor celorlalti curieri: GLS si
 * Pall-Ex cer cate un apel pe colet, aici incap zeci intr-unul. De aceea cronul
 * poate lucra pe sute de comenzi intr-o rulare, nu pe 120.
 *
 * ⚠ Raspunsul poate sa NU contina toate AWB-urile cerute (unul pe care eColet
 * nu-l cunoaste lipseste pur si simplu). Apelantul TREBUIE sa marcheze ca
 * verificate toate cele CERUTE, nu doar cele intoarse — altfel cele necunoscute
 * raman cu marcaj gol si blocheaza pentru totdeauna capul cozii.
 */
export async function statusuriInLot(
  config: EcoletConfig,
  awbs: string[],
  asteptareMs?: number,
): Promise<StatusInLot[]> {
  const curate = [...new Set(awbs.map((a) => (a ?? "").trim()).filter(Boolean))];
  if (curate.length === 0) return [];

  const r = await apel<{ data?: unknown }>(
    config, "POST", "/order/get-statuses-for-many-orders", { awbs: curate }, asteptareMs,
  );
  const lista = Array.isArray(r?.data) ? r.data : [];
  return lista
    .map((x) => x as StatusInLot)
    .filter((x) => x && typeof x.awb === "string" && x.awb.length > 0);
}

/**
 * ⚠ Cate AWB-uri intr-o cerere.
 *
 * Specificatia nu publica nicio limita, deci numarul e ales de noi, prudent: un
 * corp de o suta de AWB-uri e mic, iar daca eColet respinge vreodata loturile
 * mari, esecul se vede pe o singura felie, nu pe toata rularea.
 */
export const MAX_AWB_PE_CERERE = 50;

// ─── Documente ────────────────────────────────────────────────────────────────

/**
 * Eticheta (AWB-ul tiparibil).
 *
 * ⚠ Citire pura: se poate cere de cate ori e nevoie, spre deosebire de GLS unde
 * a doua chemare a metodei de emitere ar fi creat un al doilea colet.
 *
 * ⚠ Poate veni si ZPL, nu doar PDF (`waybill_extension` din `GET /order/{id}`).
 * De aia se intoarce si tipul de continut: cine o serveste mai departe trebuie
 * sa-l puna corect, altfel browserul incearca sa deschida ZPL ca PDF si arata o
 * pagina goala.
 */
export async function eticheta(
  config: EcoletConfig,
  orderId: number,
): Promise<{ octeti: Buffer; tip: string } | null> {
  let res: Response;
  try {
    res = await fetch(`${BAZA}/order/${orderId}/download-waybill`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.api_token}`,
        /*
         * ⚠ JSON PRIMUL, desi ce vrem e un fisier.
         *
         * Laravel se uita la PRIMUL tip acceptat ca sa hotarasca daca raspunde
         * JSON sau face redirect catre login. Cu `application/pdf` pe primul loc,
         * un token expirat NU da 401: da 302 catre pagina de login, iar `fetch` o
         * urmeaza si intoarce 200 cu HTML. Verificarile de mai jos treceau toate
         * — nu e 404, e `ok`, are octeti — deci pagina de login se salva in CDN
         * sub cheia etichetei si ramanea acolo PENTRU TOTDEAUNA, fiindca ruta
         * citeste intai din CDN si nimic n-o sterge.
         *
         * Ruta de descarcare intoarce fisierul oricum, indiferent de ordinea de
         * aici; ce se schimba e doar ce primim cand NU suntem autentificati.
         */
        Accept: "application/json, application/pdf",
      },
      /* ⚠ Si nu urmam redirectul: un 3xx aici inseamna „nu esti autentificat". */
      redirect: "manual",
      signal: AbortSignal.timeout(ASTEPTARE_EMITERE_MS),
      cache: "no-store",
    });
  } catch (e) {
    throw eroareNesigura(`eColet eticheta: ${(e as Error).message}`);
  }

  if (res.status === 404) return null;
  if (res.status >= 300 && res.status < 400) {
    throw cuStatus(eroareRefuz("eColet: token respins la descarcarea etichetei."), 401);
  }
  if (!res.ok) {
    const text = await res.text();
    let corp: unknown = null;
    try { corp = JSON.parse(text); } catch { corp = null; }
    throw cuStatus(
      eroareCuStatus(`eColet eticheta: ${res.status} — ${descrieEroarea(corp, text)}`, res.status),
      res.status,
    );
  }

  const tip = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();

  /*
   * ⚠ O pagina HTML sau un JSON NU sunt o eticheta.
   *
   * Acelasi rationament ca la „un 2xx cu corp necitibil nu e succes": mai bine
   * spunem ca nu stim decat sa salvam in CDN, permanent, un fisier care se
   * deschide gol.
   */
  if (tip.startsWith("text/html") || tip.startsWith("application/json")) {
    throw eroareNesigura(`eColet eticheta: raspuns care nu e document (${tip || "fara tip"})`);
  }

  const octeti = Buffer.from(await res.arrayBuffer());
  /* Un 200 gol nu e o eticheta. */
  if (octeti.length === 0) return null;

  return { octeti, tip: tip || "application/pdf" };
}
