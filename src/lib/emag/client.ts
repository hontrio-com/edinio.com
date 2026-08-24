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
import { basicAuthHeader, emagGazda, emagUrl, iesireEmag } from "./auth";
import { scrieInJurnal } from "./jurnal-scriere";
import type { FelCerere } from "./jurnal";
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

/**
 * Pana cand sa NU mai plece nimic pe galeata asta, fiindca EI au spus s-o lasam mai moale.
 *
 * ═══ ⚠ GALEATA NOASTRA E O SOCOTEALA; ANTETUL LOR E ADEVARUL ═══
 *
 * Galeata numara ce am trimis DIN INSTANTA ASTA. Dar aceeasi cheie de magazin poate fi
 * folosita din mai multe locuri deodata: cronul pe o instanta, importul pe alta, iar un
 * buton apasat de om pe a treia. Fiecare crede ca are 3 cereri pe secunda intregi, si
 * impreuna trec de ele.
 *
 * ⚠ Iar documentatia lor spune ca si cererile INVALIDE se numara — deci depasirea nu se
 * plateste doar cu un 429, ci cu bugetul prin care trebuie sa plece mișcarile de stoc.
 *
 * `X-RateLimit-Remaining-3second` nu se citea NICAIERI: `headers.get` aparea o singura
 * data in tot dosarul `emag/`, si aceea pe `content-type`. Deci singura sursa care stie
 * cu adevarat cat mai avem era aruncata la fiecare raspuns.
 *
 * Acum, cand ne spun ca s-a terminat, se pune o pauza pe galeata — si aceea e vazuta de
 * toate cererile din instanta, nu doar de cea care a primit antetul.
 */
const pauzePeGaleata = new Map<string, number>();

/**
 * Citeste ce ne-au spus despre limita si franeaza daca e cazul.
 *
 * ⚠ Se citesc mai multe forme de antet, ANUME. Raspunsul lor nu e in schema lor — chiar
 * lectia zilei — iar numele exact al antetului nu e scris nicaieri in OpenAPI. Se ia ce
 * se gaseste; ce nu se gaseste nu strica nimic.
 */
function franeazaDupaAntete(
  cheie: string,
  /* ⚠ Numai ce se foloseste, nu tipul `Headers` intreg: `undici` are propriul `Headers`,
     iar cele doua nu sunt compatibile la iteratori. Ceruta asa, functia primeste si
     antetele lui `fetch`, si pe ale lui `undici`, fara conversii. */
  antete: { get(nume: string): string | null },
  status: number,
): void {
  const numar = (nume: string): number | null => {
    const v = antete.get(nume);
    if (v == null) return null;
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  };

  /* ⚠ 429 se trateaza INTAI si fara conditii: e singurul raspuns care spune sigur ca am
     trecut de limita, indiferent ce scrie in celelalte anteturi. */
  if (status === 429) {
    const retry = numar("retry-after");
    const pana = Date.now() + (retry != null && retry > 0 ? Math.min(retry, 60) * 1000 : 1000);
    pauzePeGaleata.set(cheie, Math.max(pauzePeGaleata.get(cheie) ?? 0, pana));
    return;
  }

  const ramase = numar("x-ratelimit-remaining-3second") ?? numar("x-ratelimit-remaining");
  /* ⚠ Zero inseamna „nu mai ai", nu „nu stiu": `?? null` de mai sus pastreaza deosebirea. */
  if (ramase != null && ramase <= 0) {
    pauzePeGaleata.set(cheie, Math.max(pauzePeGaleata.get(cheie) ?? 0, Date.now() + 1000));
  }
}

function esteRutaDeComenzi(cale: string): boolean {
  return cale.startsWith("/order");
}

async function asteaptaJeton(cheie: string, perSecunda: number): Promise<void> {
  /* ⚠ Intai ce au spus EI, apoi socoteala noastra. Vezi `franeazaDupaAntete`. */
  const pana = pauzePeGaleata.get(cheie) ?? 0;
  if (pana > Date.now()) {
    await new Promise((r) => setTimeout(r, Math.min(pana - Date.now(), 60_000)));
    pauzePeGaleata.delete(cheie);
  }

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
  /*
   * ═══ ⚠ FELUL SE SPUNE, NU SE GHICESTE DIN METODA ═══
   *
   * La eMAG TOATE rutele sunt POST — si citirile, si scrierile. `citeste()` face POST
   * cu filtrele la nivelul intai; `scrie()` face POST cu incarcatura in `data`.
   *
   * Prima forma a jurnalului (§65) hotara dupa metoda: „scrierile mereu, citirile doar
   * cand cad". Cu totul POST, asta insemna FIECARE citire reusita — masurat in
   * productie la prima conectare: 7 din 8 randuri erau citiri. Cronul bate la minut,
   * deci ~70.000 de randuri pe zi din care niciunul nu spune nimic. Adica exact ce
   * scrie in comentariul de acolo ca se evita.
   *
   * Acum o spune apelantul. Nu se poate strica atunci cand ei adauga rute noi, si nici
   * cand o ruta de citire capata alta metoda.
   */
  fel: FelCerere,
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

  /*
   * ⚠ Cronometrul porneste DUPA asteptarea jetonului, nu inainte.
   *
   * Pornit inainte, „durata" ar fi cuprins si timpul in care noi ne-am tinut singuri
   * pe loc ca sa nu depasim cele 3 cereri pe secunda. Si atunci un magazin sanatos,
   * dar incarcat, ar fi aratat in jurnal cereri de cate cinci secunde — iar cine
   * cauta o incetineala la eMAG ar fi gasit-o unde nu e.
   */
  const pornitLa = Date.now();

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

    /* ⚠ Ce ne-au spus despre limita se citeste INAINTE de orice altceva: si un raspuns
       care se dovedeste refuz poarta antetul, iar aceea e chiar informatia de pastrat. */
    franeazaDupaAntete(galeata, raspuns.headers, raspuns.status);

    const c = clasificaRaspuns(raspuns.status, json, cale);

    await scrieInJurnal({
      auth, metoda, cale, corp, fel,
      status: raspuns.status,
      verdict: c.verdict,
      durataMs: Date.now() - pornitLa,
      mesaje: c.mesaje,
      eroare: c.verdict === "reusit" ? null : (c.mesaj || null),
    });

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

    /*
     * ⚠ SE SCRIE SI CAND N-AM AJUNS LA EI, si asta e chiar randul cel mai pretios din
     * tot jurnalul. O cadere de releu nu lasa niciun alt semn: cererea se reia
     * singura, elementul ramane in coada, si nimic nu spune ca IESIREA e cazuta, nu
     * eMAG. `status: 0` inseamna „n-am ajuns", nu „au raspuns cu zero".
     */
    await scrieInJurnal({
      auth, metoda, cale, corp, fel,
      status: 0,
      verdict: "trecatoare",
      durataMs: Date.now() - pornitLa,
      mesaje: [],
      eroare: abandonat
        ? "timp expirat"
        : releuCazut
          ? `iesirea nu raspunde (${cauza ?? "necunoscut"})`
          : (e instanceof Error ? e.message : "cerere cazuta"),
    });

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
  return trimite<T>(auth, "POST", cale, { data: date }, "scriere");
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
  return trimite<T>(auth, "POST", cale, f, "citire");
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
  return trimite(auth, "PATCH", `/offer_stock/${emagId}`, { data: { stock: stoc } }, "scriere");
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
  return trimite<unknown[]>(auth, "GET", `/documentation/find_by_eans?${q}`, undefined, "citire");
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
  return trimite(auth, "POST", `/order/acknowledge/${orderId}`, undefined, "scriere");
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
  return trimite(auth, "POST", `/order/${orderId}/unlock-courier`, undefined, "scriere");
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
    auth, "GET", `/api-3/smart-deals-price-check?productId=${encodeURIComponent(String(productId))}`,
    undefined, "citire",
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ETICHETA AWB: RASPUNS BINAR, NU JSON
   ═══════════════════════════════════════════════════════════════════════════ */

/** Formatele de hartie pe care le da eMAG. */
export type FormatAwb = "A4" | "A5" | "A6" | "ZPL";

/**
 * Eticheta AWB, ca octeti.
 *
 * ═══ ⚠ DE CE NU TRECE PRIN `trimite` ═══
 *
 * `trimite` citeste raspunsul cu `.text()` si il da lui `JSON.parse`. Un PDF trecut
 * prin el ar fi iesit ca obiect gol, iar clasificarea ar fi spus „reusit" cu date
 * nule: comerciantul ar fi apasat „Descarca eticheta" si ar fi primit un fisier de
 * zero octeti, fara nicio eroare nicaieri.
 *
 * Deci raspunsul se ia ca `arrayBuffer`, iar erorile — care VIN ca JSON — se citesc
 * separat, dupa antetul `content-type`.
 *
 * ⚠ TRECE PRIN ACELASI RELEU SI ACELASI RITM. Filtrarea pe IP a eMAG-ului se aplica
 * si aici; plecata direct de pe Vercel, descarcarea ar fi primit un refuz care nu
 * pomeneste nimic despre IP-uri. Iar ritmul de 3 cereri pe secunda e cumulat pe tot
 * ce nu e comanda — o descarcare care il ocoleste face urmatoarea cerere sa ia 429.
 *
 * ⚠ MERGE DOAR PENTRU AWB-URILE EMISE PRIN API. Documentatia lor, cuvant cu cuvant:
 * „Only AWBs issued via API can be read — only for them you receive the «emag_id»
 * key, which is mandatory." Inca un motiv pentru care `emag_id` se scrie in aceeasi
 * clipa in care il primim: fara el nu exista nici citire, nici eticheta.
 */
export async function descarcaEtichetaAwb(
  auth: EmagAuth,
  emagId: number,
  format: FormatAwb = "A4",
): Promise<{ octeti: ArrayBuffer; tip: string } | { error: string; status: number }> {
  if (!auth?.username || !auth?.password) {
    return { error: "Acreditările eMAG lipsesc.", status: 0 };
  }
  if (auth.password.startsWith("enc.v1.")) {
    return { error: "Parola eMAG a fost citită criptat (eroare internă). Reconectează contul.", status: 0 };
  }
  if (!Number.isFinite(emagId) || emagId <= 0) {
    return { error: "AWB-ul nu are id eMAG, deci eticheta nu se poate descărca.", status: 0 };
  }

  const iesire = iesireEmag();
  if (iesire.eroare || !iesire.dispatcher) {
    return { error: iesire.eroare ?? "Ieșirea către eMAG nu este configurată.", status: 0 };
  }

  const cale = `/awb/read_pdf?emag_id=${encodeURIComponent(String(emagId))}&awb_format=${encodeURIComponent(format)}`;
  await asteaptaJeton(`${auth.businessId ?? "global"}:restul`, PE_SECUNDA_RESTUL);

  try {
    const raspuns = await fetchUndici(emagUrl(auth.tara, cale), {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(auth.username, auth.password),
        /* ⚠ Se cere si JSON: erorile lor vin tot ca JSON, nu ca PDF. */
        Accept: "application/pdf, application/json",
      },
      dispatcher: iesire.dispatcher,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const tip = (raspuns.headers.get("content-type") ?? "").toLowerCase();

    /*
     * ⚠ Un raspuns JSON aici inseamna EROARE, oricat de 200 ar fi codul. eMAG
     * intoarce `{isError: true, messages: […]}` cu status 200 la aproape orice
     * refuz — iar salvat ca „eticheta", fisierul ar fi fost un JSON cu extensia
     * `.pdf`, pe care comerciantul l-ar fi dus la curier.
     */
    if (tip.includes("json")) {
      const text = await raspuns.text();
      let json: unknown = {};
      try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
      franeazaDupaAntete(`${auth.businessId ?? "global"}:restul`, raspuns.headers, raspuns.status);
      const c = clasificaRaspuns(raspuns.status, json, cale);
      return { error: mesajOmenesc(c.mesaj) || c.mesaj || "eMAG nu a dat eticheta.", status: raspuns.status };
    }

    if (!raspuns.ok) {
      return { error: `eMAG a refuzat eticheta (${raspuns.status}).`, status: raspuns.status };
    }

    const octeti = await raspuns.arrayBuffer();
    /* ⚠ Un fisier gol nu e o reusita. Salvat, ar fi ajuns la imprimanta ca o pagina
       alba, iar coletul ar fi plecat fara eticheta. */
    if (octeti.byteLength === 0) {
      return { error: "eMAG a răspuns cu o etichetă goală. Încearcă din nou.", status: raspuns.status };
    }

    return { octeti, tip: tip || "application/pdf" };
  } catch (e) {
    const abandonat = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      error: abandonat ? "eMAG nu a răspuns la timp." : "Nu am putut contacta eMAG.",
      status: 0,
    };
  }
}

/**
 * Eticheta in ZPL, pentru imprimantele de etichete.
 *
 * ═══ ⚠ E ALTA RUTA DECAT `read_pdf`, SI ALT FEL DE RASPUNS ═══
 *
 * `read_pdf` accepta si `awb_format=ZPL`, si de aceea am scris intai ca ruta asta „e
 * acoperita". Nu e: documentatia lor spune despre `/awb/read_zpl` altceva — „Returns
 * base64 encoded content". Adica JSON cu text codificat, nu octeti binari.
 *
 * Trecuta prin `descarcaEtichetaAwb`, care se uita la `content-type` si trateaza JSON
 * drept EROARE, ar fi iesit un refuz pentru un raspuns perfect valid.
 *
 * Conteaza pentru depozitele cu imprimante Zebra: acolo eticheta se trimite ca ZPL,
 * nu se tipareste un PDF. Fara ea, un depozit care scoate cateva sute de colete pe zi
 * ar fi fost silit sa tipareasca A6-uri pe hartie.
 */
export function citesteEtichetaZpl(auth: EmagAuth, emagId: number) {
  return trimite<unknown>(
    auth, "GET", `/awb/read_zpl?emag_id=${encodeURIComponent(String(emagId))}`, undefined, "citire",
  );
}

/** Numarul localitatilor, pentru paginare. */
export function numaraLocalitati(auth: EmagAuth, filtre: Record<string, unknown> = {}) {
  return citeste<unknown>(auth, "/locality/count", filtre);
}

/**
 * Lista de IP-uri de la care suna eMAG, adusa de la ei.
 *
 * ═══ ⚠ SINGURA CERERE DIN TOT CLIENTUL FARA ACREDITARI SI FARA MAGAZIN ═══
 *
 * `/public-ips.json` e un fisier public: nu cere autentificare, nu tine de niciun
 * comerciant, si nu intra in ritmul de 3 cereri pe secunda al niciunuia. Documentatia
 * o numeste chiar asa — „poll this endpoint to automate firewall updates".
 *
 * ⚠ Trece TOTUSI prin releul cu IP fix. Nu fiindca ar cere-o ei, ci fiindca e singura
 * cale de iesire pe care o are integrarea: o cerere care ocoleste releul ar merge in
 * dezvoltare si ar cadea in productie, unde Vercel n-are alt drum configurat catre ei.
 *
 * ⚠ Nu se cheama `citeste()`: aceea e POST cu filtre si ar primi un 405. Nici
 * `emagUrl()`: fisierul sta la radacina gazdei, nu sub `/api-3`.
 */
export async function aduIpurileEmag(
  tara?: Parameters<typeof emagGazda>[0],
): Promise<{ ipuri: unknown } | { error: string }> {
  const iesire = iesireEmag();
  if (iesire.eroare || !iesire.dispatcher) {
    return { error: iesire.eroare ?? "Ieșirea către eMAG nu este configurată." };
  }

  try {
    const raspuns = await fetchUndici(`${emagGazda(tara)}/public-ips.json`, {
      method: "GET",
      headers: { Accept: "application/json" },
      dispatcher: iesire.dispatcher,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!raspuns.ok) return { error: `eMAG a răspuns cu ${raspuns.status} la lista de IP-uri.` };

    const text = await raspuns.text();
    try {
      return { ipuri: text ? JSON.parse(text) : null };
    } catch {
      /* ⚠ Un raspuns necitibil NU e o lista goala. Intors ca atare, ar fi golit lista
         alba si ar fi refuzat toate notificarile. */
      return { error: "Lista de IP-uri de la eMAG nu s-a putut citi." };
    }
  } catch {
    return { error: "Nu am putut aduce lista de IP-uri de la eMAG." };
  }
}
