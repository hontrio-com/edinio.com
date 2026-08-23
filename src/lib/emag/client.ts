/**
 * Clientul HTTP pentru eMAG Marketplace API v4.5.1.
 *
 * ⚠ SE FOLOSESTE `fetch` DIN PACHETUL `undici`, NU CEL GLOBAL. Motivul intreg e
 * scris in `auth.ts`, la `iesireEmag`: `fetch`-ul global al lui Node isi are
 * propria copie de undici, iar un `ProxyAgent` din pachetul nostru nu e recunoscut
 * de ea — cererea pica cu „fetch failed / UND_ERR_INVALID_ARG" si nu pleaca prin
 * proxy. Masurat, nu presupus. Fara proxy, eMAG refuza apelul (IP nealbit).
 */

import { fetch as fetchUndici } from "undici";
import { basicAuthHeader, emagUrl, iesireEmag } from "./auth";
import { clasificaRaspuns, mesajOmenesc, type VerdictEmag } from "./errors";
import type {
  EmagAdresa, EmagAwb, EmagCategorie, EmagComanda, EmagContCurier, EmagCotaTva,
  EmagFiltruComenzi, EmagFiltruOferte, EmagLocalitate, EmagMasuratoare, EmagOferta,
  EmagOfertaCitita, EmagProdusOferta, EmagPropunereCampanie, EmagRaspuns, EmagRetur,
  EmagTara, EmagValoareTimpPregatire,
} from "./types";

export interface EmagAuth {
  username: string;
  password: string;
  tara?: EmagTara;
  /**
   * Magazinul, numai pentru contorul de ritm. Limitele eMAG sunt pe CONT, deci
   * doua magazine diferite nu trebuie sa se incetineasca unul pe altul.
   */
  businessId?: string;
}

export type EmagResult<T> =
  | { data: T; verdict: VerdictEmag; mesaje: string[] }
  | { error: string; status: number; verdict: VerdictEmag; mesaje: string[]; details?: unknown };

export function isEmagError<T>(r: EmagResult<T>): r is {
  error: string; status: number; verdict: VerdictEmag; mesaje: string[]; details?: unknown;
} {
  return "error" in r;
}

const TIMEOUT_MS = 25_000;

/* ═══════════════════════════════════════════════════════════════════════════
   RITM
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ LIMITELE EMAG, SI DE CE SE RESPECTA AICI, NU IN CRON.
 *
 *   12 cereri/s (720/min) pentru COMENZI
 *    3 cereri/s (180/min) CUMULAT pentru absolut tot restul
 *
 * Trei pe secunda e foarte putin: o pagina de oferte are cel mult 100 de randuri,
 * deci un catalog de 5000 inseamna 50 de cereri, adica ~17 secunde numai citirea —
 * iar in acelasi buget intra si publicarile, si preturile, si nomenclatoarele.
 *
 * ⚠ CERERILE INVALIDE SE NUMARA SI ELE. Deci un 400 nu e „gratis": o bucla care
 * reincearca imediat o cerere gresita consuma bugetul magazinului fara sa avanseze.
 *
 * Ritmul sta in CLIENT, nu in cron, fiindca nu toate apelurile vin din cron:
 * butonul „Trimite pe eMAG", testul de conexiune si ecranele de nomenclatoare
 * pleaca din actiuni de server. Lasat in cron, ar fi fost respectat pe o cale si
 * calcat pe celelalte trei.
 */
const PE_SECUNDA_COMENZI = 12;
const PE_SECUNDA_RESTUL = 3;

/** Ultimele momente de plecare, pe galeata. Best-effort: o instanta, un contor. */
const galeti = new Map<string, number[]>();

function esteRutaDeComenzi(cale: string): boolean {
  return cale.startsWith("/order");
}

async function asteaptaJeton(cheie: string, perSecunda: number): Promise<void> {
  const acum = Date.now();
  const recente = (galeti.get(cheie) ?? []).filter((t) => acum - t < 1000);

  if (recente.length >= perSecunda) {
    /* Cea mai veche cerere din fereastra iese peste atatea milisecunde. */
    const asteptare = 1000 - (acum - recente[0]) + 15;
    await new Promise((r) => setTimeout(r, Math.max(15, asteptare)));
    return asteaptaJeton(cheie, perSecunda);
  }

  recente.push(Date.now());
  galeti.set(cheie, recente);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CELE DOUA FELURI DE CERERE
   ═══════════════════════════════════════════════════════════════════════════ */

async function trimite<T>(
  auth: EmagAuth,
  metoda: "GET" | "POST" | "PATCH",
  cale: string,
  corp: unknown,
): Promise<EmagResult<T>> {
  if (!auth?.username || !auth?.password) {
    return { error: "Acreditările eMAG lipsesc.", status: 0, verdict: "chei", mesaje: [] };
  }

  /*
   * ⚠ Cheia criptata nu ajunge niciodata la eMAG. Daca o vedem aici, inseamna ca
   * cineva a citit configuratia cu clientul comerciantului in loc de service
   * role, iar eMAG ar raspunde 401 fara sa spuna de ce. Aceeasi plasa ca in
   * `src/lib/aboutyou/client.ts:46`.
   */
  if (auth.password.startsWith("enc.v1.")) {
    return {
      error: "Parola eMAG a fost citită criptat (eroare internă). Reconectează contul.",
      status: 0,
      verdict: "chei",
      mesaje: [],
    };
  }

  const iesire = iesireEmag();
  if (iesire.eroare || !iesire.dispatcher) {
    return { error: iesire.eroare ?? "Ieșirea către eMAG nu este configurată.", status: 0, verdict: "chei", mesaje: [] };
  }

  const galeata = `${auth.businessId ?? "global"}:${esteRutaDeComenzi(cale) ? "comenzi" : "restul"}`;
  await asteaptaJeton(galeata, esteRutaDeComenzi(cale) ? PE_SECUNDA_COMENZI : PE_SECUNDA_RESTUL);

  try {
    const raspuns = await fetchUndici(emagUrl(auth.tara, cale), {
      method: metoda,
      headers: {
        Authorization: basicAuthHeader(auth.username, auth.password),
        Accept: "application/json",
        ...(corp !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: corp !== undefined ? JSON.stringify(corp) : undefined,
      dispatcher: iesire.dispatcher,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const text = await raspuns.text();
    let json: unknown = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }

    const c = clasificaRaspuns(raspuns.status, json, cale);

    if (c.verdict === "reusit" || c.verdict === "reusit_cu_observatii") {
      const rezultate = (json as EmagRaspuns<T> | undefined)?.results;
      return { data: rezultate as T, verdict: c.verdict, mesaje: c.mesaje };
    }

    return {
      error: mesajOmenesc(c.mesaj) || c.mesaj,
      status: raspuns.status,
      verdict: c.verdict,
      mesaje: c.mesaje,
      details: json,
    };
  } catch (e) {
    const abandonat = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    const cauza = (e as { cause?: { code?: string } })?.cause?.code;
    /*
     * ⚠ `ECONNREFUSED` catre proxy inseamna ca releul cu IP fix e cazut, nu ca
     * eMAG e cazut. Deosebirea conteaza: una se repara la noi, cealalta se
     * asteapta. Fara ea, am fi cautat zile intregi in contul comerciantului.
     */
    const releuCazut = cauza === "ECONNREFUSED" || cauza === "ECONNRESET" || cauza === "ENOTFOUND";
    return {
      error: abandonat
        ? "eMAG nu a răspuns la timp. Se reia singur."
        : releuCazut
          ? "Ieșirea către eMAG nu răspunde. Integrarea se reia singură când revine."
          : "Nu am putut contacta eMAG. Se reia singur.",
      status: 0,
      verdict: "trecatoare",
      mesaje: [],
    };
  }
}

/**
 * SCRIERE. Incarcatura se impacheteaza in `{ data: … }`.
 *
 * ⚠ E o functie separata de `citeste` dinadins, si asta e chiar plasa de
 * siguranta a fisierului. Documentatia lor: „save/write actions wrap their
 * payload in a «data» key; read/count actions take filters as top-level keys —
 * filters wrapped in a «data» key are IGNORED". Ignorate, adica raspunsul vine
 * 200, cu TOATE ofertele, si nimic nu semnaleaza greseala. Cu o singura functie
 * si un steag, prima confuzie ar fi trecut neobservata pana la un import gresit.
 */
export async function scrie<T = unknown>(
  auth: EmagAuth,
  cale: string,
  date: unknown,
): Promise<EmagResult<T>> {
  return trimite<T>(auth, "POST", cale, { data: date });
}

/**
 * CITIRE. Filtrele pleaca drept chei de nivel intai.
 *
 * ⚠ `itemsPerPage` e plafonat la 100 aici, nu la apelant: peste, eMAG intoarce
 * tot 100 si nu spune nimic, iar cine cere 500 crede ca a citit tot.
 */
export async function citeste<T = unknown>(
  auth: EmagAuth,
  cale: string,
  /*
    `object`, nu `Record<string, unknown>`: filtrele au interfete proprii
    (`EmagFiltruOferte`, `EmagFiltruComenzi`), iar TypeScript nu le accepta ca
    `Record` fiindca n-au semnatura de index. A le adauga una ar fi insemnat sa
    pierdem exact verificarea pentru care exista — o cheie scrisa gresit ar fi
    trecut, iar eMAG ignora tacut filtrele pe care nu le cunoaste.
  */
  filtre: object = {},
): Promise<EmagResult<T>> {
  const f: Record<string, unknown> = { ...(filtre as Record<string, unknown>) };
  if (typeof f.itemsPerPage === "number") {
    f.itemsPerPage = Math.max(1, Math.min(100, Math.floor(f.itemsPerPage)));
  }
  return trimite<T>(auth, "POST", cale, f);
}

/* ═══════════════════════════════════════════════════════════════════════════
   NOMENCLATOARE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Testul de conexiune.
 *
 * ⚠ Se cheama `vat/read`, nu `product_offer/read`: e cea mai ieftina ruta care
 * dovedeste si acreditarile, si dreptul de API, si IP-ul albit, fara sa depinda
 * de existenta vreunui produs. La Trendyol, testul lovea o ruta limitata la o
 * cerere pe ora si al doilea clic pe „Conectează" primea 429.
 */
export async function testeazaConexiunea(
  auth: EmagAuth,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const r = await citeste<EmagCotaTva[]>(auth, "/vat/read", {});
  if (isEmagError(r)) return { ok: false, error: r.error, status: r.status };
  return { ok: true };
}

export function citesteTva(auth: EmagAuth) {
  return citeste<EmagCotaTva[]>(auth, "/vat/read", {});
}

export function citesteTimpiPregatire(auth: EmagAuth) {
  return citeste<EmagValoareTimpPregatire[]>(auth, "/handling_time/read", {});
}

/**
 * Categoriile.
 *
 * Fara `id`, intoarce primele 100. Cu `id`, intoarce numele categoriei SI lista
 * de caracteristici si `family_types` — adica exact ce trebuie ca sa se poata
 * publica in ea.
 */
export function citesteCategorii(
  auth: EmagAuth,
  filtre: { id?: number; currentPage?: number; itemsPerPage?: number; language?: string } = {},
) {
  return citeste<EmagCategorie[]>(auth, "/category/read", filtre);
}

export function numaraCategorii(auth: EmagAuth) {
  return citeste<{ count?: number }>(auth, "/category/count", {});
}

export function citesteConturiCurier(auth: EmagAuth) {
  return citeste<EmagContCurier[]>(auth, "/courier_accounts/read", {});
}

export function citesteAdrese(auth: EmagAuth) {
  return citeste<EmagAdresa[]>(auth, "/addresses/read", {});
}

export function citesteLocalitati(
  auth: EmagAuth,
  filtre: { currentPage?: number; itemsPerPage?: number; country_code?: string } = {},
) {
  return citeste<EmagLocalitate[]>(auth, "/locality/read", filtre);
}

/* ═══════════════════════════════════════════════════════════════════════════
   OFERTE
   ═══════════════════════════════════════════════════════════════════════════ */

export function citesteOferte(auth: EmagAuth, filtre: EmagFiltruOferte = {}) {
  return citeste<EmagOfertaCitita[]>(auth, "/product_offer/read", filtre);
}

/**
 * Cate oferte are vanzatorul.
 *
 * ═══ ⚠ FORMA RASPUNSULUI NU E DOCUMENTATA. SE CITESTE APARAT ═══
 *
 * Prima forma declara `{ results?: { noResults?: number } }` si era gresita de doua
 * ori. Intai, `trimite()` DESPACHETEAZA deja `results` — deci un al doilea `results`
 * inauntru n-ar fi existat niciodata. Apoi, `noResults` nu apare NICIUNDE in
 * OpenAPI-ul lor: era inventat, nu citit. Iar schema declara `ApiResponse.results`
 * ca TABLOU, ceea ce contrazice si mai tare un obiect cu un camp.
 *
 * Ce se stie sigur: ruta exista si intoarce `ApiResponse`. Atat.
 *
 * De aceea intoarce `number | null`, iar `null` inseamna „nu stiu". Cine il
 * foloseste NU are voie sa-l ia drept zero si NU are voie sa decida din el cand se
 * termina paginarea — terminarea se afla dintr-o pagina mai scurta decat
 * `itemsPerPage`, care e singurul semnal pe care ei il dau cu adevarat.
 */
export async function numaraOferte(
  auth: EmagAuth,
  filtre: EmagFiltruOferte = {},
): Promise<{ cate: number | null } | { error: string; status: number }> {
  const r = await citeste<unknown>(auth, "/product_offer/count", filtre);
  if (isEmagError(r)) return { error: r.error, status: r.status };
  return { cate: citesteNumarul(r.data) };
}

/**
 * Numarul dintr-un raspuns de forma necunoscuta.
 *
 * Pur, ca sa poata fi probat cu toate formele plauzibile fara sa fie nevoie de
 * eMAG pornit. Se incearca, in ordine: un numar simplu, un tablou (lungimea lui),
 * si cateva denumiri obisnuite de camp. Nimic nu se ghiceste mai departe.
 */
export function citesteNumarul(brut: unknown): number | null {
  if (typeof brut === "number" && Number.isFinite(brut)) return brut;
  if (Array.isArray(brut)) return brut.length;
  if (brut && typeof brut === "object") {
    const o = brut as Record<string, unknown>;
    for (const cheie of ["count", "noResults", "total", "results"]) {
      const v = o[cheie];
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
    }
  }
  return null;
}

/**
 * Produs + oferta. ⚠ SINGURA ruta care poate CREA.
 *
 * ⚠ Maximum 50 de elemente. Nu se plafoneaza aici: cine trimite mai mult are o
 * greseala de grupare, iar taierea tacuta ar ascunde-o. Vezi `grupeazaInLoturi`.
 */
export function salveazaProduseOferte(auth: EmagAuth, elemente: EmagProdusOferta[]) {
  return scrie(auth, "/product_offer/save", elemente);
}

/**
 * „Light API": actualizeaza NUMAI datele ofertei.
 *
 * ⚠ Asta e ruta pentru schimbarile de pret si de stare, nu `product_offer/save`.
 * La Trendyol, o schimbare de pret trimisa pe ruta de continut a raportat succes
 * pe 1051 de produse fara sa schimbe niciun pret.
 */
export function salveazaOferte(auth: EmagAuth, oferte: EmagOferta[]) {
  return scrie(auth, "/offer/save", oferte);
}

/**
 * Numai stocul. ⚠ `PATCH`, nu `POST`, iar id-ul e in CALE.
 *
 * Cea mai usoara dintre cele trei rute de scriere: o folosim pentru fiecare
 * miscare de stoc, ca sa nu atingem nimic altceva din oferta.
 */
export function actualizeazaStoc(auth: EmagAuth, emagId: number, stoc: { warehouse_id: number; value: number }[]) {
  return trimite(auth, "PATCH", `/offer_stock/${emagId}`, { data: { stock: stoc } });
}

export function salveazaMasuratori(auth: EmagAuth, masuratori: EmagMasuratoare[]) {
  return scrie(auth, "/measurements/save", masuratori);
}

/**
 * Cauta produse eMAG dupa EAN.
 *
 * ⚠ E `GET` cu parametri in adresa, singura ruta din tot API-ul care nu e POST.
 * Maximum 100 de coduri; peste, restul sunt ignorate cu un mesaj.
 * ⚠ Are limite PROPRII, mai stranse: 5/s, 200/min si 5000 PE ZI.
 */
export async function cautaDupaEan(auth: EmagAuth, eanuri: string[]): Promise<EmagResult<unknown[]>> {
  const primele = eanuri.slice(0, 100);
  if (primele.length === 0) return { data: [], verdict: "reusit", mesaje: [] };
  const q = primele.map((e) => `eans[]=${encodeURIComponent(e)}`).join("&");
  return trimite<unknown[]>(auth, "GET", `/documentation/find_by_eans?${q}`, undefined);
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMENZI
   ═══════════════════════════════════════════════════════════════════════════ */

export function citesteComenzi(auth: EmagAuth, filtre: EmagFiltruComenzi = {}) {
  return citeste<EmagComanda[]>(auth, "/order/read", filtre);
}

export function numaraComenzi(auth: EmagAuth, filtre: EmagFiltruComenzi = {}) {
  return citeste<Record<string, unknown>>(auth, "/order/count", filtre);
}

/**
 * Confirma primirea comenzii.
 *
 * ⚠ E SINGURA cale de a trece comanda in „in procesare" si singura care opreste
 * notificarile lor. Se cheama DUPA ce comanda a intrat cu bine la noi: data prea
 * devreme, o scriere locala picata inseamna o comanda pe care n-o mai anunta
 * nimeni. Numai pentru comenzile 3P.
 */
export function confirmaComanda(auth: EmagAuth, orderId: number) {
  return trimite(auth, "POST", `/order/acknowledge/${orderId}`, undefined);
}

/**
 * Salveaza o comanda.
 *
 * ⚠ Se trimit TOATE campurile citite initial, nu doar cele schimbate. Se poate
 * edita numai in starile 2 si 3, si niciodata la plata cu card online.
 */
export function salveazaComenzi(auth: EmagAuth, comenzi: EmagComanda[]) {
  return scrie(auth, "/order/save", comenzi);
}

export function citesteAtasamente(auth: EmagAuth, filtre: Record<string, unknown> = {}) {
  return citeste<unknown[]>(auth, "/order/attachments/read", filtre);
}

/** ⚠ Numai fisiere `.pdf`. Factura are `type: 1`. */
export function salveazaAtasamente(auth: EmagAuth, atasamente: unknown[]) {
  return scrie(auth, "/order/attachments/save", atasamente);
}

export function citesteVolumetrie(auth: EmagAuth, filtre: { order_id: number; type?: 2 | 3; product_id?: number }) {
  return citeste<unknown[]>(auth, "/order/volumetry/read", filtre);
}

export function deblocheazaCurier(auth: EmagAuth, orderId: number) {
  return trimite(auth, "POST", `/order/${orderId}/unlock-courier`, undefined);
}

/* ═══════════════════════════════════════════════════════════════════════════
   LIVRARE SI RETURURI
   ═══════════════════════════════════════════════════════════════════════════ */

export function salveazaAwb(auth: EmagAuth, awburi: EmagAwb[]) {
  return scrie(auth, "/awb/save", awburi);
}

export function citesteAwb(auth: EmagAuth, filtre: Record<string, unknown> = {}) {
  return citeste<unknown[]>(auth, "/awb/read", filtre);
}

export function citesteColete(auth: EmagAuth) {
  return citeste<unknown[]>(auth, "/awb/package/read", {});
}

export function salveazaColete(auth: EmagAuth, colete: unknown[]) {
  return scrie(auth, "/awb/package/save", colete);
}

export function citesteRetururi(auth: EmagAuth, filtre: Record<string, unknown> = {}) {
  return citeste<EmagRetur[]>(auth, "/rma/read", filtre);
}

export function numaraRetururi(auth: EmagAuth, filtre: Record<string, unknown> = {}) {
  return citeste<Record<string, unknown>>(auth, "/rma/count", filtre);
}

export function salveazaRetururi(auth: EmagAuth, retururi: EmagRetur[]) {
  return scrie(auth, "/rma/save", retururi);
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACTURI SI CAMPANII
   ═══════════════════════════════════════════════════════════════════════════ */

/** ⚠ Calea isi poarta singura prefixul `/api-3`. Vezi `emagUrl` din `auth.ts`. */
export function citesteFacturi(auth: EmagAuth, filtre: Record<string, unknown> = {}) {
  return citeste<Record<string, unknown>>(auth, "/api-3/invoice/read", filtre);
}

export function citesteCategoriiFacturi(auth: EmagAuth) {
  return citeste<unknown[]>(auth, "/api-3/invoice/categories", {});
}

export function citesteFacturiClienti(auth: EmagAuth, filtre: Record<string, unknown> = {}) {
  return citeste<Record<string, unknown>>(auth, "/api-3/customer-invoice/read", filtre);
}

export function propuneInCampanie(auth: EmagAuth, propuneri: EmagPropunereCampanie[]) {
  return scrie(auth, "/campaign_proposals/save", propuneri);
}

/** ⚠ `GET`, cu parametru in adresa. */
export function verificaPretSmartDeals(auth: EmagAuth, productId: number) {
  return trimite<Record<string, unknown>>(
    auth, "GET", `/api-3/smart-deals-price-check?productId=${encodeURIComponent(String(productId))}`, undefined,
  );
}
