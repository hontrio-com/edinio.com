// Thin authenticated REST wrapper over the OLX Partner API v2.
// Base: https://www.olx.ro/api/partner — every call needs `Version: 2.0` +
// `Authorization: Bearer`. Most responses are wrapped in `{ data: ... }`, some
// nomenclature endpoints return bare arrays — unwrap both.

import type {
  OlxAccountBalance, OlxAdvert, OlxAdvertStats, OlxAttributeDef, OlxBillingEntry,
  OlxBoughtPacket, OlxBusinessProfile, OlxCategory, OlxCategorySuggestion, OlxCity,
  OlxDistrict, OlxImagineCont, OlxLocationSuggestion, OlxMessage, OlxMessageFull,
  OlxModerationReason, OlxPacket,
  OlxPaidFeature, OlxPaymentMethod, OlxThread, OlxUser,
} from "./types";

const BASE = "https://www.olx.ro/api/partner";

export interface OlxValidationIssue { field?: string; title?: string; detail?: string }
export interface OlxEroare {
  error: string;
  status: number;
  validation?: OlxValidationIssue[];
  /** Cat ne-au cerut EI sa asteptam, in milisecunde. Vezi `asteptareaCeruta`. */
  retryAfterMs?: number;
}
export type OlxResult<T> = { data: T } | OlxEroare;

export function isOlxError<T>(r: OlxResult<T>): r is OlxEroare {
  return "error" in r;
}

/**
 * `Retry-After`, in milisecunde.
 *
 * ═══ ASTEPTAREA O CER EI, NU O INVENTAM NOI (31.08.2026) ═══
 *
 * Antetul vine in doua forme in RFC 9110: un numar de secunde, sau o data HTTP. Amandoua se
 * citesc; orice altceva se socoteste lipsa, si atunci ramane politica noastra.
 *
 * SE PUNE UN CAPAT SUS. Un antet gresit — sau ostil — ar putea spune „intoarce-te peste o
 * saptamana", iar noi am parca lucrarea pana atunci fara ca nimeni sa afle. Un sfert de ora e
 * peste orice fereastra de limitare reala a lor, si mult sub pragul la care omul se intreaba de
 * ce nu s-a dus pretul.
 */
export function asteptareaCeruta(h: Headers): number | undefined {
  const brut = h.get("retry-after");
  if (!brut) return undefined;
  const secunde = Number(brut.trim());
  const ms = Number.isFinite(secunde) ? secunde * 1000 : Date.parse(brut) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  return Math.min(ms, 15 * 60_000);
}

async function call<T>(
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<OlxResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2.0",
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // Nomenclatoare mici pe Vercel = no-store (Data Cache dadea 500 la runtime).
      cache: "no-store",
      /*
       * ═══ ⚠ O CERERE FARA CAPAT TINE INTREG CRONUL (30.08.2026, tarziu) ═══
       *
       * Cronul porneste din minut in minut si lucreaza cu randuri REVENDICATE, cu termen de cinci
       * minute. O cerere care atarna nu doar ca pierde elementul ei: tine lucratorul ocupat, iar
       * celelalte douazeci si noua de elemente revendicate cu el asteapta degeaba. Cand instanta e
       * taiata la durata maxima, ele raman marcate pana expira termenul.
       *
       * ⚠ Douazeci de secunde: destul pentru cea mai lenta cerere obisnuita a lor, si mult sub
       * fereastra cronului. O intrerupere se citeste ca eroare trecatoare, deci se reia.
       */
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 204) return { data: undefined as T };
    const text = await res.text();
    let json: unknown = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
    if (!res.ok) {
      const err = (json as { error?: { title?: string; detail?: string; validation?: OlxValidationIssue[] } })?.error;
      const validation = Array.isArray(err?.validation) ? err.validation : undefined;
      const detail = err?.detail ?? err?.title ?? `HTTP ${res.status}`;
      const msg = validation?.length
        ? `${detail}: ${validation.map((v) => v.detail ?? v.title ?? v.field).filter(Boolean).join("; ")}`
        : detail;
      return { error: msg, status: res.status, validation, retryAfterMs: asteptareaCeruta(res.headers) };
    }
    const unwrapped = (json !== null && typeof json === "object" && "data" in (json as Record<string, unknown>))
      ? (json as { data: T }).data
      : (json as T);
    return { data: unwrapped };
  } catch {
    return { error: "Eroare de retea catre OLX.", status: 0 };
  }
}

// ── Users ───────────────────────────────────────────────────────────────────────
export function getMe(token: string) {
  return call<OlxUser>(token, "GET", "/users/me");
}

export function getUser(token: string, userId: number) {
  return call<OlxUser>(token, "GET", `/users/${userId}`);
}

export function getAccountBalance(token: string) {
  return call<OlxAccountBalance>(token, "GET", "/users/me/account-balance");
}

export function getPaymentMethods(token: string) {
  return call<OlxPaymentMethod[]>(token, "GET", "/users/me/payment-methods");
}

// ── Adverts ─────────────────────────────────────────────────────────────────────
export function listAdverts(token: string, params: { offset?: number; limit?: number; external_id?: string } = {}) {
  const q = new URLSearchParams();
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.external_id) q.set("external_id", params.external_id);
  const qs = q.toString();
  return call<OlxAdvert[]>(token, "GET", `/adverts${qs ? `?${qs}` : ""}`);
}

export function getAdvert(token: string, advertId: number) {
  return call<OlxAdvert>(token, "GET", `/adverts/${advertId}`);
}

export function createAdvert(token: string, body: Record<string, unknown>) {
  return call<OlxAdvert>(token, "POST", "/adverts", body);
}

export function updateAdvert(token: string, advertId: number, body: Record<string, unknown>) {
  return call<OlxAdvert>(token, "PUT", `/adverts/${advertId}`, body);
}

// Advert MUST NOT be `active` — deactivate first.
export function deleteAdvert(token: string, advertId: number) {
  return call<undefined>(token, "DELETE", `/adverts/${advertId}`);
}

// `is_success` is required by the API for the `deactivate` command.
/**
 * O comanda pe un anunt.
 *
 * ═══ ⚠ `is_success` SPUNEA CA S-A VANDUT, LA ORICE DEZACTIVARE (30.08.2026) ═══
 *
 * La OLX, `is_success` inseamna „tranzactia s-a incheiat cu bine" — adica produsul S-A VANDUT.
 * Noi il trimiteam `true` la FIECARE dezactivare, indiferent de motiv:
 *
 *     omul apasa „Dezactivează"      -> le spuneam ca s-a vandut
 *     produsul devine inactiv        -> le spuneam ca s-a vandut
 *     stocul ajunge la zero          -> le spuneam ca s-a vandut
 *     retragere inaintea unei stergeri -> le spuneam ca s-a vandut
 *
 * Niciunul nu e o vanzare. E o informatie FALSA data unui furnizor despre propriul lui produs, si
 * nu stim ce face el cu ea — statistici, clasare, poate reputatia contului.
 *
 * ⚠ IMPLICITUL E `false`, iar adevarul se cere pe nume. Cand vom sti chiar ca s-a vandut, se
 * trimite `true` de la locul care stie asta — nu se ghiceste aici.
 */
export function advertCommand(
  token: string,
  advertId: number,
  command: "activate" | "deactivate" | "finish" | "extend",
  optiuni?: { sAVandut?: boolean },
) {
  const body: Record<string, unknown> = { command };
  if (command === "deactivate") body.is_success = optiuni?.sAVandut === true;
  return call<undefined>(token, "POST", `/adverts/${advertId}/commands`, body);
}

// ── Categories & attributes ─────────────────────────────────────────────────────
export function getCategories(token: string, parentId?: number) {
  return call<OlxCategory[]>(token, "GET", `/categories${parentId != null ? `?parent_id=${parentId}` : ""}`);
}

export function getCategory(token: string, categoryId: number) {
  return call<OlxCategory>(token, "GET", `/categories/${categoryId}`);
}

export function getCategoryAttributes(token: string, categoryId: number) {
  return call<OlxAttributeDef[]>(token, "GET", `/categories/${categoryId}/attributes`);
}

export function suggestCategories(token: string, q: string) {
  return call<OlxCategorySuggestion[]>(token, "GET", `/categories/suggestion?q=${encodeURIComponent(q)}`);
}

// ── Cities & districts ──────────────────────────────────────────────────────────
export function getCities(token: string, offset: number, limit: number) {
  return call<OlxCity[]>(token, "GET", `/cities?offset=${offset}&limit=${limit}`);
}

export function getCityDistricts(token: string, cityId: number) {
  return call<OlxDistrict[]>(token, "GET", `/cities/${cityId}/districts`);
}

// ── Packets & paid features (monetization) ──────────────────────────────────────
// GET /packets requires BOTH category_id and payment_method (packets are priced
// per category). `with_features=1` returns what each packet bundles.
export function getAvailablePackets(
  token: string,
  params: { category_id: number; payment_method: OlxPaymentMethod; type?: "base" | "mega" | "all"; with_features?: boolean },
) {
  const q = new URLSearchParams();
  q.set("category_id", String(params.category_id));
  q.set("payment_method", params.payment_method);
  if (params.type) q.set("type", params.type);
  if (params.with_features) q.set("with_features", "1");
  return call<OlxPacket[]>(token, "GET", `/packets?${q.toString()}`);
}

export function getBoughtPackets(
  token: string,
  params: { availability?: "active" | "inactive"; offset?: number; limit?: number } = {},
) {
  const q = new URLSearchParams();
  if (params.availability) q.set("availability", params.availability);
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return call<OlxBoughtPacket[]>(token, "GET", `/users/me/packets${qs ? `?${qs}` : ""}`);
}

// Packet for a whole category. `size` must match an available packet variant.
export function purchaseCategoryPacket(
  token: string,
  body: { category_id: number; size: number; payment_method: OlxPaymentMethod; type?: "base" | "mega" },
) {
  return call<undefined>(token, "POST", "/users/me/packets", body);
}

// Packet for a single advert (used to activate a `limited` advert).
export function purchaseAdvertPacket(
  token: string,
  advertId: number,
  body: { payment_method: OlxPaymentMethod; is_premium?: boolean },
) {
  return call<undefined>(token, "POST", `/adverts/${advertId}/packets`, body);
}

export function getPaidFeatures(token: string) {
  return call<OlxPaidFeature[]>(token, "GET", "/paid-features");
}

export function getAdvertPaidFeatures(token: string, advertId: number) {
  return call<OlxPaidFeature[]>(token, "GET", `/adverts/${advertId}/paid-features`);
}

export function purchasePaidFeature(
  token: string,
  advertId: number,
  body: { code: string; payment_method: OlxPaymentMethod },
) {
  return call<undefined>(token, "POST", `/adverts/${advertId}/paid-features`, body);
}

// ── Threads & messages (buyer leads) ────────────────────────────────────────────
export function getThreads(token: string, params: { offset?: number; limit?: number; advert_id?: number } = {}) {
  const q = new URLSearchParams();
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.advert_id != null) q.set("advert_id", String(params.advert_id));
  const qs = q.toString();
  return call<OlxThread[]>(token, "GET", `/threads${qs ? `?${qs}` : ""}`);
}

export function getThreadMessages(token: string, threadId: number) {
  return call<OlxMessage[]>(token, "GET", `/threads/${threadId}/messages`);
}

/**
 * Trimite un mesaj intr-o conversatie, cu sau fara atasamente.
 *
 * ⚠ ATASAMENTELE SE TRIMIT CA ADRESE, nu ca fisiere: OLX vine sa ia imaginea de la noi. Deci
 * trebuie sa fie publice — cele din biblioteca de media a magazinului sunt.
 *
 * ⚠ Cheia lipseste cu totul cand n-avem ce trimite. Un `attachments: []` inseamna „am declarat o
 * lista, si e goala" — alt lucru decat „n-am declarat nimic", si nu stim ce fac ei cu deosebirea.
 */
export function postThreadMessage(
  token: string, threadId: number, text: string, atasamente?: string[],
) {
  const urls = (atasamente ?? []).filter((u) => /^https:\/\//i.test(u));
  return call<undefined>(token, "POST", `/threads/${threadId}/messages`, {
    text,
    ...(urls.length > 0 ? { attachments: urls.map((url) => ({ url })) } : {}),
  });
}

export function markThreadRead(token: string, threadId: number) {
  return call<undefined>(token, "POST", `/threads/${threadId}/commands`, { command: "mark-as-read" });
}

// ── Statistici ──────────────────────────────────────────────────────────────────
/**
 * Ce a facut lumea cu anuntul: vizualizari, afisari de telefon, urmaritori.
 *
 * ⚠ E o citire per ANUNT, deci la scara se plateste. Cronul o face pentru un numar marginit de
 * anunturi pe trecere, si numai pentru cele active — un anunt stins n-are ce statistici sa adune.
 */
export function getAdvertStatistics(token: string, advertId: number) {
  return call<OlxAdvertStats>(token, "GET", `/adverts/${advertId}/statistics`);
}

// ── De ce a fost respins ────────────────────────────────────────────────────────
/**
 * Motivul moderarii, cerut de la ei.
 *
 * ⚠ Se cere NUMAI cand starea spune ca a fost respins. Pe un anunt sanatos ruta raspunde `404` sau
 * gol, iar o cerere in plus pentru fiecare anunt la fiecare sondare ar dubla traficul degeaba.
 */
export function getModerationReason(token: string, advertId: number) {
  return call<OlxModerationReason>(token, "GET", `/adverts/${advertId}/moderation-reason`);
}

// ── Profilul de firma ───────────────────────────────────────────────────────────
export function getBusinessProfile(token: string) {
  return call<OlxBusinessProfile>(token, "GET", "/users-business/me");
}

export function updateBusinessProfile(token: string, body: Partial<OlxBusinessProfile>) {
  return call<OlxBusinessProfile>(token, "PUT", "/users-business/me", body);
}

// ── Facturare ───────────────────────────────────────────────────────────────────
/**
 * Istoricul de facturare.
 *
 * ⚠ `page`, NU `offset`, si ea INCEPE DE LA UNU. Prima varianta trimitea `offset=0&limit=30` —
 * parametri pe care ei nu-i cunosc aici, deci ii ignora si intorc ce vor. Nu da eroare: da alt
 * raspuns decat cel cerut, ceea ce e mai greu de vazut.
 */
export function getBilling(token: string, params: { page?: number; limit?: number } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(Math.max(1, params.page ?? 1)));
  if (params.limit != null) q.set("limit", String(params.limit));
  return call<OlxBillingEntry[]>(token, "GET", `/users/me/billing?${q.toString()}`);
}

// ── Messenger, restul ───────────────────────────────────────────────────────────
/** Conversatiile, cu paginare — ecranul avea pana azi doar primele cincizeci. */
/**
 * Conversatiile, cu paginare si filtre.
 *
 * ⚠ `advert_id` si `interlocutor_id` sunt filtre ALE LOR, deci ingusteaza inainte de a trimite
 * randurile. Cautarea din ecran lucreaza pe ce e deja incarcat — utila, dar alta treaba: una taie
 * dintr-o pagina, cealalta cere alta multime.
 */
export function getThreadsPaged(
  token: string,
  params: { offset?: number; limit?: number; advert_id?: number; interlocutor_id?: number } = {},
) {
  const q = new URLSearchParams();
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.advert_id != null) q.set("advert_id", String(params.advert_id));
  if (params.interlocutor_id != null) q.set("interlocutor_id", String(params.interlocutor_id));
  const qs = q.toString();
  return call<OlxThread[]>(token, "GET", `/threads${qs ? `?${qs}` : ""}`);
}

export function getThread(token: string, threadId: number) {
  return call<OlxThread>(token, "GET", `/threads/${threadId}`);
}

/** Un mesaj anume, cu atasamentele lui. */
export function getMessage(token: string, threadId: number, messageId: number) {
  return call<OlxMessageFull>(token, "GET", `/threads/${threadId}/messages/${messageId}`);
}

/**
 * Marcheaza o conversatie ca favorita.
 *
 * ⚠ COMANDA E IN CORP, NU IN ADRESA. Prima varianta cerea
 * `POST /threads/{id}/commands/set-favourite` — o ruta care nu exista, deci butonul raspundea `404`
 * si nu facea nimic. La fel ca la anunturi, ruta e `/commands` iar comanda merge in corp.
 */
export function setThreadFavourite(token: string, threadId: number, favourite: boolean) {
  return call<undefined>(token, "POST", `/threads/${threadId}/commands`, {
    command: "set-favourite",
    is_favourite: favourite,
  });
}

// ── Localitate dupa coordonate ──────────────────────────────────────────────────
/**
 * Ce oras/cartier are OLX la coordonatele date.
 *
 * ⚠ Se foloseste ca SUGESTIE, niciodata ca hotarare: adresa magazinului poate fi un depozit, iar
 * anuntul poate trebui pus in alt loc. Omul confirma.
 */
export function suggestLocationByCoords(token: string, lat: number, lon: number) {
  return call<OlxLocationSuggestion[]>(token, "GET", `/locations?latitude=${lat}&longitude=${lon}`);
}

// ── Logo si banner, la nivel de cont ────────────────────────────────────────────
/*
 * ⚠ SE POT SCHIMBA PRIN API (01.09.2026). Ecranul spunea comerciantului ca „logo-ul si bannerul se
 * schimba din contul tau de pe olx.ro" — o afirmatie despre API-ul LOR, scrisa de noi, si falsa.
 * Rutele exista de mult.
 */
export function getBusinessLogos(token: string) {
  return call<OlxImagineCont[]>(token, "GET", "/users-business/me/logos");
}

export function addBusinessLogo(token: string, url: string) {
  return call<OlxImagineCont>(token, "POST", "/users-business/me/logos", { url });
}

export function deleteBusinessLogo(token: string, logoId: number) {
  return call<undefined>(token, "DELETE", `/users-business/me/logos/${logoId}`);
}

export function getBusinessBanners(token: string) {
  return call<OlxImagineCont[]>(token, "GET", "/users-business/me/banners");
}

export function addBusinessBanner(token: string, url: string) {
  return call<OlxImagineCont>(token, "POST", "/users-business/me/banners", { url });
}

export function deleteBusinessBanner(token: string, bannerId: number) {
  return call<undefined>(token, "DELETE", `/users-business/me/banners/${bannerId}`);
}

// ── Logo pe un anunt anume ──────────────────────────────────────────────────────
export function getAdvertLogos(token: string, advertId: number) {
  return call<OlxImagineCont[]>(token, "GET", `/adverts/${advertId}/logos`);
}

export function addAdvertLogo(token: string, advertId: number, url: string) {
  return call<OlxImagineCont>(token, "POST", `/adverts/${advertId}/logos`, { url });
}

export function deleteAdvertLogo(token: string, advertId: number, logoId: number) {
  return call<undefined>(token, "DELETE", `/adverts/${advertId}/logos/${logoId}`);
}
