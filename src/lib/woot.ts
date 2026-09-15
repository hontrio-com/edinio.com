import { normalizePhone } from "@/lib/utils/phone";
import { CacheScurt } from "@/lib/utils/cache-scurt";
import { eroareCuStatus, eroareDeTermen, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";
import { cheieToken } from "@/lib/integrari/cheie-token";

const WOOT_BASE = "https://ws.woot.ro/latest";

/* ⚠ TERMEN PE CERERE. Fara el `fetch` asteapta la nesfarsit, iar cotatia din checkout
   cheama treisprezece curieri deodata (`Promise.all` in `shipping.actions.ts`): unul
   singur care nu raspunde tine cumparatorul pe ecranul de livrare pana renunta el.
   ⚠ Termenul depasit iese `necunoscut` din `verdictFurnizor`, fiindca eroarea nu trece
   prin niciun constructor din `eroare-furnizor.ts`. Adica exact ce trebuie: un AWB care
   POATE sa fi fost creat ramane blocat, nu se reincearca. */
const ASTEPTARE_MS = 20_000;

/**
 * Woot documents phone numbers in INTERNATIONAL format ("+40721234567") — the
 * opposite of the local 07-form the domestic couriers want. Normalize first
 * (strips spaces/dashes, folds 0040/+40 to 07), then re-prefix with +4.
 */
export function wootPhone(raw: string | null | undefined): string {
  const local = normalizePhone(raw);
  if (/^0\d{9}$/.test(local)) return `+4${local}`;
  return local; // already international (+49...) or empty
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type WootSender = {
  company: 0 | 1;
  company_name?: string;
  contact: string;
  phone: string;
  email: string;
  country_id: 189;
  county_id: number;
  city_id: number;
  address: string;
  zipcode?: string;
};

export type WootConfig = {
  enabled: boolean;
  public_key: string;
  secret_key: string;
  sender: WootSender;
  /** Opt-in: insure shipments for the order's product value (insurance param). */
  insurance_enabled?: boolean;
  /**
   * Cum se plateste expedierea la Woot. (15.09.2026)
   *
   * ═══ ⚠ DE CE EXISTA, SI DE CE „card" NU E PRINTRE VALORI ═══
   *
   * Pana azi nimeni nu trimitea `payment_method`, deci TOATE magazinele plecau pe `credit`, care e
   * si implicitul LOR. Masurat in productie pe 15.09.2026: toate cele SAPTE esecuri de AWB Woot din
   * viata platformei sunt „Nu aveti suficient credit pentru a finaliza comanda". Un magazin cu cont
   * pe termen ar fi esuat asa la nesfarsit, fara nicio cale sa aleaga altfel.
   *
   * ⚠ „card" LIPSESTE DINADINS, si asta nu e o precautie de-a noastra, e scris in documentatia lor
   * (`ws.woot.ro/latest`, POST /orders): `awb_number` e „for credit/term payments", iar `payment_id`
   * e „for card payments". Adica pe card NU intorc niciun AWB, ci un identificator de plata care
   * cere un drum de plata pe care platforma nu-l are. Oferit in panou, comerciantul ar fi ales o
   * valoare care produce o expediere fara eticheta si fara numar.
   *
   * Lipsa inseamna `credit`, ca sa nu se clinteasca nimic pentru magazinele care merg azi.
   */
  payment_method?: "credit" | "term";
};

export type WootParcel = {
  type: "envelope" | "package";
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  content: string;
};

export type WootPriceResult = {
  service_id: number;
  service_name: string;
  courier_id: number;
  courier_name: string;
  // "door" = home pickup; anything else (locker/point) = sender hands over at a
  // location, which requires sender.location_id at AWB creation.
  service_pickup?: string;
  service_delivery?: string;
  pickup_locations_count?: number | null;
  price: number;
  tax: number;
  total: number;
  final_price: number;
  final_tax: number;
  final_total: number;
  return_price: number | null;
  errors: string[];
};

// A Woot locker/point (from GET /general/locations). The `id` is what
// sender.location_id / receiver.location_id expect for locker/point services.
export type WootLocation = {
  id: number;
  name: string;
  type: string;
  courier_id: number;
  courier_name: string;
  county_id: number;
  county_name: string;
  city_id: number;
  city_name: string;
  address: string;
  zipcode: string;
  sender: number;   // 1 = supports pickup (sender drop-off)
  receiver: number; // 1 = supports delivery
};

export type WootCounty = {
  id: number;
  name: string;
  code: string;
  country_id: number;
};

export type WootCity = {
  id: number;
  name: string;
  county_id: number;
};

// ─── Token cache ──────────────────────────────────────────────────────────────

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Pentru probe: goleste tokenurile pastrate. */
export function uitaTokenurileWoot(): void {
  tokenCache.clear();
}

export async function getWootToken(public_key: string, secret_key: string): Promise<string> {
  /*
   * ⚠ SI SECRETUL, hasuit. Cheiata doar pe `public_key`, harta intorcea tokenul valid
   * si pentru un `secret_key` GRESIT. Concret: comerciantul isi roteste cheile la Woot,
   * `public_key` ramane acelasi, lipeste gresit noul secret si apasa „Testeaza
   * conexiunea"; intrarea pusa la conectarea de dinainte e inca vie (expirarea lor e de
   * o zi), deci ecranul scrie „conectat" si defectul iese abia a doua zi, la prima
   * emitere. Woot a fost sarit cand s-au reparat FAN, Colete, FedEx si Cargus.
   * Vezi `@/lib/integrari/cheie-token`.
   */
  const cacheKey = cheieToken([public_key], [secret_key]);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  /* ⚠ E POST, dar e CITIRE: autentificarea nu creeaza niciun colet. Vezi `eroareDeTermen`. */
  let res: Response;
  try {
    res = await fetch(`${WOOT_BASE}/account/authorize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_key, secret_key }),
      cache: "no-store",
      signal: AbortSignal.timeout(ASTEPTARE_MS),
    });
  } catch (e) {
    throw eroareDeTermen(e, false, "autentificarea", "Woot");
  }

  // `eroareRefuz`, nu `Error` simplu: autentificarea se face INAINTE de orice
  // POST /orders, deci un esec aici dovedeste ca la Woot NU s-a creat nimic si
  // reincercarea (dupa corectarea cheilor) trebuie sa ramana libera. Fara marcaj,
  // registrul ar fi presupus „poate s-a facut" si ar fi blocat comanda definitiv.
  if (!res.ok) throw eroareRefuz("Autentificare Woot esuata. Verifica cheile API.");
  const data = await res.json() as { success: boolean; token: string; expire: number };
  if (!data.success || !data.token) throw eroareRefuz("Autentificare Woot esuata.");

  tokenCache.set(cacheKey, { token: data.token, expiresAt: Date.now() + data.expire * 1000 });
  return data.token;
}

// ─── Generic request ─────────────────────────────────────────────────────────

/**
 * Motivul pe care il da Woot, din oricare din formele in care il da.
 *
 * ═══ ⚠ DE CE E O FUNCTIE, SI NU UN BLOC INAUNTRUL LUI `wootReq` (15.09.2026) ═══
 *
 * Extragerea asta exista de mult, dar traia INGROPATA in ramura de raspuns NEREUSIT a lui
 * `wootReq`, deci se folosea numai la 4xx si 5xx. Iar Woot raspunde HTTP 200 si pentru „am
 * creat", si pentru „n-am creat": adevarul sta in corp. Pe drumul acela, cele trei plicuri de
 * mai jos aruncau un mesaj scris de noi si ARUNCAU motivul lui.
 *
 * ⚠ Nu e o presupunere ca forma asta apare: masurat in productie pe 15.09.2026, TOATE cele sapte
 * esecuri de AWB Woot din viata platformei poarta chiar mesajul lor, „Nu aveti suficient credit
 * pentru a finaliza comanda". Pe ramura de 200 acelasi mesaj s-ar fi pierdut, iar comerciantul ar
 * fi citit „Woot a refuzat crearea expedierii" si n-ar fi avut ce sa faca mai departe.
 *
 * ⚠ Si e chiar lectia pe care fisierul asta a invatat-o o data: comentariul de mai jos spune
 * „exact asa s-a ascuns o zi cauza reala", despre forma `error` ca OBIECT. Lectia s-a aplicat
 * atunci doar ramurii de 4xx.
 *
 * Formele cunoscute, toate vazute de la ei: `{message}`, `{error}` ca sir, `{error}` ca obiect
 * camp catre motiv (`{"error":{"parcels.0.weight":"...must be >= 1"}}`), si `{errors}` in stil
 * Laravel, ca lista sau ca obiect camp catre lista.
 */
export function motivulWoot(corp: unknown): string {
  if (!corp || typeof corp !== "object") return "";
  const p = corp as { message?: unknown; error?: unknown; errors?: unknown };

  let detail = "";
  if (typeof p.message === "string") detail = p.message;
  else if (typeof p.error === "string") detail = p.error;
  else if (p.error && typeof p.error === "object") {
    detail = Object.entries(p.error as Record<string, unknown>)
      .map(([camp, motiv]) => `${camp}: ${Array.isArray(motiv) ? motiv.join(", ") : String(motiv)}`)
      .join("; ");
  }

  if (p.errors) {
    const msgs: string[] = [];
    if (Array.isArray(p.errors)) {
      for (const e of p.errors) msgs.push(typeof e === "string" ? e : JSON.stringify(e));
    } else if (typeof p.errors === "object") {
      for (const v of Object.values(p.errors as Record<string, unknown>)) {
        if (Array.isArray(v)) msgs.push(...v.map(String));
        else if (v != null) msgs.push(String(v));
      }
    }
    if (msgs.length) detail = detail ? `${detail}: ${msgs.join("; ")}` : msgs.join("; ");
  }

  return detail.trim();
}

/**
 * Mesajul catre comerciant: al LOR cand il dau, al nostru cand tac.
 *
 * ⚠ Motivul lor se pune la coada, nu inlocuieste propozitia noastra: „Woot a refuzat anularea"
 * spune ce s-a intamplat la noi, iar coada spune de ce, la ei. Inlocuita cu totul, un mesaj scurt
 * ca „Forbidden" ar fi lasat comerciantul fara context.
 */
function cuMotiv(propriu: string, corp: unknown): string {
  const motiv = motivulWoot(corp);
  return motiv ? `${propriu.replace(/\.$/, "")}: ${motiv}` : propriu;
}

async function wootReq<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  /* ⚠ Acelasi invelis duce si citirile, si emiterea, deci verdictul se alege pe METODA:
     un GET expirat n-a creat nimic (refuz dovedit), un POST expirat poate sa fi creat
     coletul inainte sa renuntam noi sa asteptam („nu stim"). */
  let res: Response;
  try {
    res = await fetch(`${WOOT_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(ASTEPTARE_MS),
    });
  } catch (e) {
    throw eroareDeTermen(e, method.toUpperCase() !== "GET", `cererea ${path}`, "Woot");
  }

  if (!res.ok) {
    // Surface Woot's actual reason (it returns various shapes: { message }, { error },
    // or Laravel-style { errors: { field: [..] } }) instead of a bare status code.
    const raw = await res.text().catch(() => "");
    let detail = "";
    try {
      detail = motivulWoot(JSON.parse(raw));
    } catch {
      // Non-JSON body (e.g. HTML error page) — keep a short snippet, skip markup.
      if (raw && !raw.trimStart().startsWith("<")) detail = raw.slice(0, 300);
    }
    if (!detail) {
      // Woot raspunde uneori 400 cu un corp din care nu iese niciun motiv, si
      // atunci comerciantul vedea doar „Woot API error 400" — nediagnosticabil.
      // Lasam in logurile serverului calea, statusul si inceputul corpului brut.
      // NU logam payloadul: contine numele, telefonul si adresa clientului.
      console.error("[woot] raspuns fara motiv", {
        path,
        status: res.status,
        corp: raw.slice(0, 500),
      });
    }
    // Mesajul ramane EXACT cel de dinainte; statusul calatoreste pe langa el, ca
    // registrul de operatii externe sa poata deosebi un refuz (400 pe diacritice,
    // cazul de mai sus) de o cadere in care AWB-ul poate sa fi fost totusi creat.
    // Vezi src/lib/operatii/eroare-furnizor.ts.
    throw eroareCuStatus(detail ? `Woot: ${detail}` : `Woot API error ${res.status}`, res.status);
  }

  return res.json() as Promise<T>;
}

// ─── Public endpoints (no auth) ───────────────────────────────────────────────

/*
 * ⚠ NOMENCLATORUL SE TINE IN MEMORIA INSTANTEI (13.09.2026).
 *
 * Cele doua liste stau in calea CUMPARATORULUI: cotarea Woot din checkout cere intai
 * judetele, apoi localitatile judetului, apoi tokenul, apoi tarifele, patru asteptari una
 * dupa alta. Necachate, fiecare vizitator care isi scrie orasul arde patru apeluri in loc
 * de doua, iar plafoanele magazinului (60/IP si 600/magazin la 10 minute,
 * `shipping.actions.ts:489-490`) se consuma de doua ori mai repede. Cand se epuizeaza,
 * TOTI curierii magazinului trec pe tarif fix, deci o lista necachata strica si cotatiile
 * celorlalti.
 *
 * ⚠ `no-store` RAMANE, si nu e in contradictie: comentariul de dinainte vorbea despre
 * `force-cache`, adica Vercel Data Cache, care dadea 500 constant la runtime pe 17.07.2026.
 * Aici se tine in memoria instantei, ca la SmartShip (`smartship/geo.ts:33-41`) si la
 * eColet, deci fara niciun drum prin cache-ul platformei.
 *
 * ⚠ Cheia NU cuprinde magazinul si nici vreo credentiala: judetele si localitatile
 * Romaniei sunt acelasi nomenclator public pentru orice cont. O cheie de cache care ar
 * purta o credentiala ar fi si o scapare, si o risipa.
 */
const TTL_NOMENCLATOR_MS = 6 * 60 * 60_000;
/** Un raspuns GOL se tine putin: poate fi o cadere de moment, nu adevarul. */
const TTL_GOL_MS = 60_000;
const CACHE_JUDETE = new CacheScurt<WootCounty[]>(TTL_NOMENCLATOR_MS, 4);
const CACHE_ORASE = new CacheScurt<WootCity[]>(TTL_NOMENCLATOR_MS, 120);

/** Pentru probe si pentru o improspatare ceruta de om. */
export function uitaNomenclatorulWoot(): void {
  CACHE_JUDETE.goleste();
  CACHE_ORASE.goleste();
}

export async function fetchCounties(): Promise<WootCounty[]> {
  return CACHE_JUDETE.iaSau(
    "ro",
    async () => {
      const res = await fetch(`${WOOT_BASE}/general/counties?country_id=189`, {
        cache: "no-store", signal: AbortSignal.timeout(ASTEPTARE_MS),
      });
      if (!res.ok) throw new Error("Nu s-au putut incarca judetele");
      return res.json() as Promise<WootCounty[]>;
    },
    (v) => v.length === 0,
    TTL_GOL_MS,
  );
}

export async function fetchCities(county_id: number): Promise<WootCity[]> {
  return CACHE_ORASE.iaSau(
    String(county_id),
    async () => {
      const res = await fetch(`${WOOT_BASE}/general/cities?county_id=${county_id}&country_id=189`, {
        cache: "no-store", signal: AbortSignal.timeout(ASTEPTARE_MS),
      });
      if (!res.ok) throw new Error("Nu s-au putut incarca orasele");
      return res.json() as Promise<WootCity[]>;
    },
    (v) => v.length === 0,
    TTL_GOL_MS,
  );
}

// ─── Authenticated endpoints ──────────────────────────────────────────────────

export async function getAccountInfo(token: string) {
  return wootReq<{
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  }>(token, "GET", "/account/info");
}

export async function getCredit(token: string) {
  return wootReq<{ gross: number; tax: number; total: number }>(token, "GET", "/account/credit");
}

// Lockers/points from GET /general/locations. For sender drop-off ("predare la
// locker"), filter to sender-capable locations of the chosen service's courier.
export async function getLocations(
  token: string,
  params: { sender?: boolean; receiver?: boolean; courier_id?: number; county_id?: number; city_id?: number }
): Promise<WootLocation[]> {
  const qs = new URLSearchParams({ country_id: "189" });
  if (params.sender) qs.set("sender", "true");
  if (params.receiver) qs.set("receiver", "true");
  if (params.courier_id) qs.set("courier_id", String(params.courier_id));
  if (params.county_id) qs.set("county_id", String(params.county_id));
  if (params.city_id) qs.set("city_id", String(params.city_id));
  const data = await wootReq<WootLocation[]>(token, "GET", `/general/locations?${qs.toString()}`);
  const list = Array.isArray(data) ? data : [];
  // Filter client-side too, so we only ever offer sender-capable locations
  // regardless of how the API treats the boolean query param.
  return params.sender ? list.filter((l) => Number(l.sender) === 1) : list;
}

export async function getPrices(
  token: string,
  params: {
    sender: object;
    receiver: object;
    parcels: WootParcel[];
    repayment?: number;
    insurance?: number;
  }
): Promise<WootPriceResult[]> {
  return wootReq<WootPriceResult[]>(token, "POST", "/orders/prices", params);
}

export async function createOrder(
  token: string,
  params: {
    service_id: number;
    sender: object;
    receiver: object;
    parcels: WootParcel[];
    repayment?: number;
    insurance?: number;
    payment_method?: "credit" | "card" | "term";
    options?: { opd?: boolean; sat?: boolean; rdc?: boolean; pxc?: boolean };
  }
): Promise<{ success: true; order_id: number; awb_number: string | null }> {
  const r = await wootReq<{ success?: unknown; order_id?: unknown; awb_number?: unknown }>(
    token, "POST", "/orders", { payment_method: "credit", ...params },
  );

  /*
   * ⚠ PLICUL DE SUCCES SE CITESTE, CA LA `getWootToken` (mai sus, randul 154).
   *
   * Woot raspunde HTTP 200 si pentru „am creat" si pentru „n-am creat": adevarul sta in
   * corp. Tipul de dinainte spunea `order_id: number` fara sa verifice NIMIC, deci era o
   * minciuna pe care `tsc` o credea: un corp `{success:true}` fara `order_id` ajungea
   * `String(undefined)`, adica sirul literal „undefined" scris in registru si in comanda,
   * si de acolo nu se mai putea anula nimic niciodata.
   *
   * ⚠ `eroareRefuz`, nu `eroareNesigura`: un raspuns complet, citit, care spune „nu" e un
   * refuz DOVEDIT, deci reincercarea dupa corectarea datelor ramane libera. Un corp fara
   * `order_id` e insa ALTCEVA, vezi mai jos.
   */
  if (r.success !== true) throw eroareRefuz(cuMotiv("Woot a refuzat crearea expedierii.", r));

  /*
   * ⚠ AICI VERDICTUL E „NU STIM", SI E TOT CE CONTEAZA.
   *
   * `success:true` fara `order_id` inseamna ca Woot spune ca A CREAT ceva, dar nu ne da
   * cheia. Coletul poate exista si poate fi facturat. Marcat refuz, registrul ar elibera
   * reincercarea si al doilea colet ar pleca REAL, platit din creditul contului. Deci
   * ramane blocat si iese la om, prin supapa de operatii atarnate.
   */
  const id = typeof r.order_id === "number" ? r.order_id : Number(r.order_id);
  if (!Number.isInteger(id) || id <= 0) {
    throw eroareNesigura(
      "Woot a raspuns ca expedierea s-a creat, dar fara identificator. "
      + "Verifica in contul Woot inainte de a incerca din nou: un al doilea AWB s-ar plati inca o data.",
    );
  }

  return {
    success: true,
    order_id: id,
    awb_number: typeof r.awb_number === "string" && r.awb_number.trim() ? r.awb_number.trim() : null,
  };
}

export async function getOrderAwb(
  token: string,
  wootOrderId: number,
  format: "A4" | "A6" = "A4"
): Promise<{ success: true; pdf: string }> {
  const r = await wootReq<{ success?: unknown; pdf?: unknown }>(
    token, "GET", `/orders/${wootOrderId}/awb?format=${format}`,
  );

  /*
   * ⚠ Si eticheta isi are plicul. Fara verificare, un corp `{success:false}` ajungea la
   * `Buffer.from(undefined, "base64")`, adica un PDF de zero octeti trimis catre browser cu
   * `Content-Type: application/pdf`, adica o fereastra goala, fara niciun mesaj.
   *
   * ⚠ E o CITIRE, deci refuzul e dovedit: nu s-a creat nimic, reincercarea e libera.
   */
  if (r.success !== true || typeof r.pdf !== "string" || !r.pdf) {
    throw eroareRefuz(cuMotiv("Woot nu a returnat eticheta pentru aceasta expediere.", r));
  }
  return { success: true, pdf: r.pdf };
}

/** Un eveniment din `GET /orders/{id}/history`. Toate campurile sunt facultative: raspunsul lor
 *  nu e validat de nimeni, iar lipsa unuia nu e o eroare, ci o stire mai saraca. */
export type WootEveniment = {
  id?: number;
  status_id?: number;
  comment?: string;
  added?: string;
};

/**
 * Istoricul de stari al unei expedieri.
 *
 * ⚠ SINGURA CALE PRIN CARE AFLAM CE S-A INTAMPLAT CU COLETUL. Woot duce 96% din expedierile
 * platformei si a fost pana azi singurul curier cu trafic adevarat pe care nu-l intreba nimeni
 * niciodata nimic dupa emitere.
 *
 * ⚠ SI AICI SE CITESTE PLICUL, ca la celelalte patru. Ei raspund 200 si cand nu dau ce am cerut,
 * iar un corp care nu e lista ar fi ajuns `[].length === 0`, adica „expedierea n-are nicio stare"
 * scris pe o cadere. Asta e chiar lectia lui `motivulWoot`, aplicata a cincea oara.
 *
 * ⚠ O lista GOALA e insa legitima: expedierea abia creata n-are inca niciun eveniment.
 */
export async function getOrderHistory(
  token: string,
  wootOrderId: number,
): Promise<WootEveniment[]> {
  const r = await wootReq<unknown>(token, "GET", `/orders/${wootOrderId}/history`);
  if (!Array.isArray(r)) {
    throw eroareRefuz(cuMotiv("Woot nu a returnat istoricul acestei expedieri.", r));
  }
  return r as WootEveniment[];
}

/**
 * Un ramburs, asa cum il tin ei: banii incasati de curier de la cumparator.
 *
 * ⚠ NU ARE `awb_number`. Identitatea expedierii aici e `order_id`, al LOR. Cine vrea numarul
 * tiparit pe colet il ia din comanda noastra, sau din `GET /orders/{id}`.
 */
export type WootRamburs = {
  id?: number;
  order_id?: number;
  /** ⚠ Documentat la ei: 0=Cancelled, 1=Unpicked, 2=Picked up, 3=Paid, 4=External. */
  status_id?: number;
  courier_name?: string;
  service_name?: string;
  value?: number;
  holder?: string;
  iban?: string;
  history?: { status_id?: number; added?: string }[];
  updated?: string;
  added?: string;
};

/**
 * Rambursurile contului, pagina cu pagina.
 *
 * ⚠ SPRE DEOSEBIRE DE STARILE COMENZII, AICI STARILE SUNT DOCUMENTATE, chiar in specificatia lor,
 * pe campul `status_id` al schemei `Repayment`. De aceea pe drumul asta se poate hotari (banii au
 * fost virati sau nu), iar pe celalalt nu. Vezi `@/lib/shipping/ramburs-woot`.
 *
 * ⚠ SI AICI SE CITESTE PLICUL: un corp fara `list` ar fi iesit lista goala, adica „magazinul n-are
 * niciun ramburs" scris pe o cadere, exact pe drumul unde asta inseamna bani nevazuti.
 */
export async function getRepayments(
  token: string,
  params: { page?: number; limit?: number; date_from?: string; date_to?: string; order_id?: number } = {},
): Promise<{ list: WootRamburs[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.date_from) qs.set("date_from", params.date_from);
  if (params.date_to) qs.set("date_to", params.date_to);
  if (params.order_id) qs.set("order_id", String(params.order_id));

  const cale = qs.toString() ? `/repayments?${qs.toString()}` : "/repayments";
  const r = await wootReq<{ list?: unknown; total?: unknown }>(token, "GET", cale);

  if (!r || typeof r !== "object" || !Array.isArray(r.list)) {
    throw eroareRefuz(cuMotiv("Woot nu a returnat lista de rambursuri.", r));
  }
  const total = Number(r.total);
  return {
    list: r.list as WootRamburs[],
    /* Fara `total` credibil, lista primita e tot ce stim: paginarea se opreste dupa ea. */
    total: Number.isFinite(total) && total >= 0 ? total : r.list.length,
  };
}

export async function cancelWootOrder(
  token: string,
  wootOrderId: number
): Promise<{ success: true }> {
  const r = await wootReq<{ success?: unknown }>(
    token, "DELETE", `/orders/${wootOrderId}`, { reason_id: 1, refund_method: "credit" },
  );

  /*
   * ═══ ⚠ CEL MAI SCUMP RAND DIN FISIER ═══
   *
   * Pana azi rezultatul asta se arunca: apelantul scria `await cancelWootOrder(...)` si
   * mergea mai departe. Woot raspunde insa HTTP 200 cu `{success:false}` cand NU poate
   * anula, tipic dupa ce coletul a fost deja preluat. Efectul era:
   *
   *   1. coloanele comenzii se goleau, inclusiv `woot_order_id`;
   *   2. slotul din registru se elibera;
   *   3. comerciantul citea „AWB anulat".
   *
   * Coletul ramanea viu la Woot, pleca la client si incasa rambursul, iar noi tocmai
   * stersesem singura cheie prin care mai putea fi anulat sau prin care i se mai putea
   * scoate eticheta. Pe un magazin cu 186 de comenzi cu ramburs, asta nu e o scapare de
   * formă.
   *
   * ⚠ Refuz DOVEDIT: raspunsul e complet si spune „nu". Ce face apelantul cu el e insa
   * opusul reincercarii libere de la emitere: vezi `cancelWootAwb`.
   */
  if (r.success !== true) {
    throw eroareRefuz(cuMotiv(
      "Woot a refuzat anularea. De regula inseamna ca expedierea a fost deja preluata, "
      + "deci coletul ramane viu la ei.",
      r,
    ));
  }
  return { success: true };
}

/**
 * Ce se goleste pe comanda dupa o anulare CONFIRMATA de Woot.
 *
 * ⚠ STA AICI, nu in `woot.actions.ts`, ca sa poata fi PROBATA: fisierul acela e
 * „use server", deci fiecare export al lui devine o actiune apelabila din browser, iar o
 * regula scoasa acolo doar ca s-o pot testa ar fi o usa noua. Aceeasi asezare ca la sora
 * ei, `campuriDezlegareFan`.
 *
 * ⚠ SE CHEAMA DOAR PE SUCCES. La un refuz dovedit NU se goleste nimic: spre deosebire de
 * FAN, unde raman tariful si sucursala ca urma pentru factura, la Woot `woot_order_id` e
 * singura cheie de anulare si de eticheta. Stearsa pe un colet inca viu, expedierea ar
 * ramane in aer, fara ca cineva sa o mai poata opri.
 */
export function campuriAnulareWoot(trackingEsteAlAcestuiAwb: boolean): Record<string, null> {
  return {
    woot_order_id: null,
    woot_awb_number: null,
    woot_service_name: null,
    /*
     * ⚠ SI URMAREA EXPEDIERII ANULATE, toata patru. Lasate pe loc, comanda ar fi aratat mai
     * departe ultima stare a coletului MORT („Ridicat de curier"), iar dupa o reemitere
     * `woot_status_checked_at` ar fi tinut expedierea NOUA la coada rotatiei, fiindca randul ar
     * fi parut proaspat intrebat. Ceasul se sterge odata cu expedierea pe care il masura.
     */
    woot_awb_at: null,
    woot_status_id: null,
    woot_status_label: null,
    woot_status_checked_at: null,
    /* `tracking_number` e comun tuturor curierilor: se goleste DOAR daca e chiar al
       acestui AWB, altfel anularea unei expedieri ar sterge urmarirea alteia. */
    ...(trackingEsteAlAcestuiAwb ? { tracking_number: null } : {}),
  };
}
