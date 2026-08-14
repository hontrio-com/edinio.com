import { eroareCuStatus, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";

/**
 * Clientul Poșta Română.
 *
 * ═══ CE E, SI DE CE NU E UN CURIER ═══
 *
 * E POSTA. Nu vine nimeni sa ridice: comerciantul DUCE coletele la oficiu. Se
 * vede si in API — nu exista nicio metoda de ridicare, spre deosebire de toti
 * ceilalti opt transportatori din platforma. De aici decurg trei lucruri:
 *
 *   - nu exista cotare de tarif (pretul vine din contract, deci din
 *     `shipping_zones` — vezi `FARA_API_DE_TARIF`);
 *   - `dataPrezentarePresetata` inseamna „ziua in care duc coletele la posta",
 *     nu „ziua in care vine curierul";
 *   - post-restant (livrarea la oficiu, de unde o ridica destinatarul) e o
 *     optiune de vanzare de sine statatoare, nu un caz marginal.
 *
 * ═══ ⚠ SURSA, SI CAT DE MULT NU SPUNE ═══
 *
 * Singura documentatie care exista: `Documentatie Awb API 30.10.2025` (10
 * pagini), confirmat de client 2026-08-14 ca nu mai vine nimic. Ea descrie corpul
 * CERERII camp cu camp si tace despre raspunsuri — cu o singura exceptie,
 * `GET /awb/{cod}/trace/last`.
 *
 * **Sase endpointuri din sapte n-au raspunsul documentat**, nu exista mediu de
 * test si nu exista un cont pe care sa probam. Deci nimic din fisierul asta n-a
 * fost vazut pe fir la data scrierii.
 *
 * Regula pe care e scris tot ce urmeaza: **unde documentatia tace, codul nu
 * ghiceste — spune ca nu stie.** Un raspuns pe care nu-l intelegem produce
 * verdictul `necunoscut`, care blocheaza in registru si scoate cazul la om. Un
 * verdict optimist ar debloca exact reincercarea care trimite al doilea colet.
 *
 * ═══ ⚠ TIPURILE JSON SE IAU DIN EXEMPLE, NU DIN PROZA ═══
 *
 * Cele doua se contrazic, si sistematic. Proza declara `greutateTrimitere
 * (decimal)`, `ramburs (decimal)`, `idOficiuPR (int)`; exemplele lor trimit
 * `"0.2"`, `"250"`, `"31793"` — SIRURI. Invers, `idBorderou` si `decValoareEur`
 * sunt NUMERE in exemple, iar bifele declarate `(smallint)` sunt `true`/`false`.
 *
 * Exemplele sunt singurele cereri despre care stim ca au functionat, deci ele
 * hotarasc. Vezi `expediere.ts`, unde fiecare camp e construit dupa exemplu.
 */

/** Adresa documentata. Se poate suprascrie din configurare, pentru un eventual mediu de test. */
const BAZA_IMPLICITA = "https://awb.posta-romana.ro/api";

/** Citirile: nomenclatoare si statusuri. `unitati-livrare` sta in calea cumparatorului. */
const ASTEPTARE_MS = 20_000;
/** Emiterea isi permite mai mult: e pornita de comerciant, nu de un cumparator. */
const ASTEPTARE_EMITERE_MS = 45_000;

/**
 * Statusul HTTP, pastrat PE eroare.
 *
 * Acelasi tipar ca la eColet si Pall-Ex, si din aceeasi lectie: cine trateaza
 * „nu exista acolo" (404) altfel decat un refuz oarecare are nevoie de numar, iar
 * statusul NU trebuie cautat in textul erorii. O potrivire pe cuvinte („not
 * found") ar depinde de limba raspunsului si, mai rau, ar putea sterge coloanele
 * unei expedieri VII cand un intermediar raspunde cu o pagina care contine acele
 * cuvinte.
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

// ─── Configurarea ─────────────────────────────────────────────────────────────

/** Cum se declara valoarea asigurata a trimiterii. */
export type ModValoare = "minim" | "comanda";

export type ExpeditorPosta = {
  nume?: string;
  judet?: string;
  localitate?: string;
  adresa?: string;
  codPostal?: string;
  telefon?: string;
  email?: string;
  persoanaDeContact?: string;
};

/**
 * ⚠ BIFELE SUNT DATE DE CONTRACT, NU DE NOI.
 *
 * Documentatia, cuvant cu cuvant: sunt „opțiuni valide doar dacă în contract vor
 * fi permise această indicații". Contractul difera de la un comerciant la altul,
 * deci fiecare bifa e o afirmatie despre contractul ALTCUIVA — si de aceea toate
 * pornesc STINSE, si nu se aprinde niciuna „ca sa fie".
 *
 * Cand furnizorul refuza o indicatie nepermisa, nu stim ce forma are refuzul (vezi
 * antetul). De aia mesajul catre comerciant trebuie sa numeasca bifele aprinse:
 * ele sunt prima cauza de cautat.
 */
export type ServiciiPosta = {
  /** Se intoarce la expeditor daca destinatarul nu o ridica. */
  retur?: boolean;
  confirmarePrimire?: boolean;
  confirmarePrimirePostRestant?: boolean;
  rambursPostRestant?: boolean;
  pcp?: boolean;
  ec?: boolean;
  fragil?: boolean;
  voluminos?: boolean;
  garantieLivrare?: boolean;
  desfacereColet?: boolean;
  avizareSms?: boolean;
  manaProprie?: boolean;
  factajLivrare?: boolean;
  factajPreluare?: boolean;
};

export type PostaConfig = {
  enabled: boolean;
  /** Contul din aplicatia Postei. NU e secret: trebuie sa se vada in formular. */
  username: string;
  /** Parola aceluiasi cont. Criptata in repaus, write-only in formular. */
  password: string;
  /**
   * ⚠ OBLIGATORIU si specific CONTRACTULUI.
   *
   * Documentatia: „reprezinta un identificator intern al poștei pentru
   * identificarea tipului trimiterii. Acesta va fi comunicat in functie de
   * contract." Exemplul lor e `"3,1,10"` — deci nu e un numar, e un sir cu
   * virgule, si nu se poate nici deduce nici ghici. Fara el nu pleaca niciun AWB.
   */
  cod_trimitere: string;
  /** Adresa de ridicare. Goala, Posta completeaza din datele contului. */
  expeditor?: ExpeditorPosta;
  servicii?: ServiciiPosta;
  /** Se ofera in checkout livrarea la oficiu (post-restant)? */
  post_restant?: boolean;
  /** „minim" trimite 20 de lei (pragul din documentatie), „comanda" trimite valoarea marfii. */
  valoare_declarata?: ModValoare;
  /** Peste cate zile lucratoare duce coletele la oficiu (`dataPrezentarePresetata`). */
  zile_pana_la_prezentare?: number;
  /** „POSTAL" in exemplul lor. Necompletat, campul nu se trimite deloc. */
  tip_mandat?: string;
  /** „LA_ADRESA" in exemplul lor. Necompletat, campul nu se trimite deloc. */
  tip_achitare_ramburs?: string;
  /** Grupeaza AWB-urile intr-un borderou. Vezi `borderouNou`. */
  foloseste_borderou?: boolean;
  /** Suprascrie adresa API (pentru un eventual mediu de test). */
  baza?: string;
};

/**
 * Aceeasi regula de „configurat" peste tot: panou, checkout, comanda, cron.
 *
 * ⚠ Include `cod_trimitere`, desi nu e credentiala: fara el fiecare emitere ar
 * cadea la Posta pentru un camp obligatoriu lipsa, iar comerciantul ar vedea in
 * checkout o optiune de livrare care nu poate produce niciun AWB.
 */
export function postaGata(c: PostaConfig | null | undefined): c is PostaConfig {
  return !!(c?.enabled && c.username && c.password && c.cod_trimitere);
}

function baza(config: Pick<PostaConfig, "baza">): string {
  const b = (config.baza ?? "").trim().replace(/\/+$/, "");
  return b || BAZA_IMPLICITA;
}

function antetAutorizare(config: Pick<PostaConfig, "username" | "password">): string {
  return `Basic ${Buffer.from(`${config.username}:${config.password}`, "utf8").toString("base64")}`;
}

// ─── Tipurile raspunsurilor ───────────────────────────────────────────────────

/**
 * O stare din trace. **Singura forma de raspuns pe care documentatia o da**
 * (sectiunea 2.5), copiata camp cu camp.
 */
export type StarePosta = {
  /** „26.02.2015 10:33" — formatul LOR, nu ISO. Vezi `dataPosta`. */
  data?: string | null;
  unitatePostala?: string | null;
  idStatus?: number | string | null;
  /** Denumirea interna („Distribuit"). */
  status?: string | null;
  /** Denumirea pentru public („Predat la destinatar"). */
  statusWeb?: string | null;
  statusFinal?: boolean | null;
  dataInregistrare?: string | null;
};

/** Un rand din `GET /api/statusuri-trace`. Forma PRESUPUSA, dupa Anexa 2. */
export type StatusNomenclator = {
  idStatus?: number | string | null;
  status?: string | null;
  statusWeb?: string | null;
  statusFinal?: boolean | null;
};

/**
 * O unitate din `GET /api/unitati-livrare`.
 *
 * ⚠ Din tot randul, documentatia numeste UN SINGUR camp: „din câmpul id, se va lua
 * informația necesară pentru completarea câmpului din AWB, idOficiuPR". Restul
 * numelor de mai jos sunt PRESUPUSE, si de aceea `unitati.ts` le cauta prin mai
 * multe variante in loc sa se bizuie pe una.
 */
export type UnitateLivrare = Record<string, unknown> & {
  id?: number | string | null;
};

// ─── Cererea ──────────────────────────────────────────────────────────────────

/**
 * Un apel catre Poșta Română.
 *
 * ═══ VERDICTELE ═══
 *
 *   4xx (fara 408)  refuz DOVEDIT — reincercarea dupa corectare e libera;
 *   5xx, timeout    NU STIM — registrul blocheaza si scoate cazul la om;
 *   2xx necitibil   NU STIM. Un corp pe care nu-l putem citi nu dovedeste nici
 *                   succesul, nici esecul.
 *
 * ⚠ Documentatia nu descrie NICIO forma de eroare: nici coduri, nici corp. Deci
 * `descrieEroarea` incearca mai multe forme obisnuite si, cand nu recunoaste
 * nimic, intoarce inceputul raspunsului brut. Mai bine un text urat pe care
 * comerciantul il poate trimite mai departe decat „a esuat" fara nimic.
 */
async function apel<T>(
  config: PostaConfig,
  metoda: "GET" | "POST",
  cale: string,
  corp?: unknown,
  asteptareMs = ASTEPTARE_MS,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baza(config)}${cale}`, {
      method: metoda,
      headers: {
        Authorization: antetAutorizare(config),
        Accept: "application/json",
        ...(corp !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: corp !== undefined ? JSON.stringify(corp) : undefined,
      signal: AbortSignal.timeout(asteptareMs),
      cache: "no-store",
      /*
       * ⚠ Un 3xx aici inseamna aproape sigur „nu esti autentificat" (aplicatia
       * trimite catre o pagina de login). Urmat, `fetch` ar intoarce 200 cu HTML,
       * iar noi am fi citit o pagina de login drept raspuns. Lectia e a eColet-ului,
       * unde exact asta s-a intamplat la descarcarea etichetei.
       */
      redirect: "manual",
    });
  } catch (e) {
    /* Retea cazuta sau timeout: nu stim daca cererea a ajuns. */
    throw eroareNesigura(`Posta ${metoda} ${cale}: ${(e as Error).message}`);
  }

  if (res.status >= 300 && res.status < 400) {
    throw cuStatus(
      eroareRefuz(
        "Posta Romana: cererea a fost redirectata, ceea ce inseamna de obicei ca "
        + "userul sau parola nu sunt bune. Verifica-le in configurare.",
      ),
      401,
    );
  }

  const text = await res.text();
  let date: unknown = null;
  if (text.trim()) {
    try { date = JSON.parse(text); } catch { date = null; }
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw cuStatus(
        eroareRefuz(
          `Posta Romana a respins contul (${res.status}). Verifica userul si parola din configurare.`,
        ),
        res.status,
      );
    }
    throw cuStatus(
      eroareCuStatus(`Posta ${metoda} ${cale}: ${res.status} — ${descrieEroarea(date, text)}`, res.status),
      res.status,
    );
  }

  /*
   * ⚠ Un 2xx cu corp necitibil NU e succes.
   *
   * Citit ca succes, am fi raportat o trimitere care poate nu exista; citit ca
   * refuz dovedit, am fi deblocat reincercarea, adica al doilea colet. Amandoua
   * gresite — verdictul cinstit e „nu stim".
   */
  if (text.trim() && date === null) {
    throw eroareNesigura(
      `Posta ${metoda} ${cale}: raspuns necitibil (${res.status}) — ${text.slice(0, 200)}`,
    );
  }

  return date as T;
}

/**
 * Mesajul de eroare, scos din corp.
 *
 * ⚠ Documentatia nu spune nimic despre forma erorilor, deci lista de mai jos e o
 * incercare, nu o specificatie. Ordinea merge de la cel mai informativ (motive pe
 * camp) la cel mai general.
 */
export function descrieEroarea(corp: unknown, brut: string): string {
  if (Array.isArray(corp)) {
    const texte = corp.filter((x): x is string => typeof x === "string" && x.trim() !== "");
    if (texte.length) return texte.join("; ").slice(0, 400);
  }

  if (corp && typeof corp === "object") {
    const o = corp as Record<string, unknown>;

    /* Motivele pe camp sunt cele care ii spun omului CE sa corecteze. */
    for (const cheie of ["errors", "erori", "validationErrors"]) {
      const v = o[cheie];
      if (v && typeof v === "object") {
        const motive: string[] = [];
        for (const [camp, lista] of Object.entries(v as Record<string, unknown>)) {
          const texte = Array.isArray(lista)
            ? lista.filter((m): m is string => typeof m === "string")
            : typeof lista === "string" ? [lista] : [];
          if (texte.length) motive.push(`${camp}: ${texte.join("; ")}`);
        }
        if (motive.length) return motive.join(" | ").slice(0, 400);
      }
    }

    /*
     * ⚠ `meta` e forma pe care o are Pall-Ex la un refuz de validare: o lista de
     * NUME DE CAMPURI, fara niciun text. Nu costa nimic sa o acoperim si aici, iar
     * daca Posta face la fel, comerciantul afla macar CARE camp e de vina.
     */
    if (Array.isArray(o.meta)) {
      const campuri = o.meta.filter((m): m is string => typeof m === "string");
      if (campuri.length) return `campuri respinse: ${campuri.join(", ")}`;
    }

    for (const cheie of ["message", "mesaj", "error", "eroare", "detail", "title", "descriere"]) {
      const v = o[cheie];
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, 400);
    }
  }

  if (typeof corp === "string" && corp.trim()) return corp.trim().slice(0, 400);

  return brut.trim().slice(0, 300) || "raspuns gol";
}

// ─── Proba de conexiune ───────────────────────────────────────────────────────

export type RezultatProba =
  /** Credentialele sunt DOVEDIT bune: fara ele acelasi apel a fost respins. */
  | { fel: "autentificat"; unitati: number }
  /**
   * Serverul a raspuns, dar acelasi apel merge SI FARA credentiale — deci
   * nomenclatorul e public si proba nu dovedeste nimic despre user si parola.
   */
  | { fel: "raspunde_dar_public"; unitati: number }
  | { fel: "respins"; mesaj: string }
  | { fel: "eroare"; mesaj: string };

/**
 * Proba de conexiune.
 *
 * ═══ ⚠ DE CE DOUA APELURI, SI NU UNUL ═══
 *
 * Capcana pe care am platit-o deja la eColet: `GET /me` raspundea 200 si fara
 * niciun token, deci o proba scrisa pe statusul HTTP iesea VERDE fara credentiale,
 * iar comerciantul afla ca nu e conectat abia la prima expediere.
 *
 * Aici nu putem sti daca nomenclatoarele sunt sau nu publice — nu avem cont pe
 * care sa probam. Dar putem AFLA, si inca fara sa cream nimic: se cere aceeasi
 * resursa de doua ori, o data cu antetul de autorizare si o data fara. Daca
 * varianta fara e respinsa iar cea cu trece, credentialele sunt dovedit bune.
 * Daca trec amandoua, spunem limpede ca proba nu dovedeste autentificarea, in loc
 * sa aratam o bifa verde mincinoasa.
 *
 * Amandoua sunt CITIRI PURE: nu creeaza nimic si se pot repeta oricat.
 */
export async function probaConexiune(config: PostaConfig): Promise<RezultatProba> {
  let unitati: UnitateLivrare[];
  try {
    unitati = await unitatiLivrare(config);
  } catch (e) {
    const status = statusEroare(e);
    if (status === 401 || status === 403) return { fel: "respins", mesaj: (e as Error).message };
    return { fel: "eroare", mesaj: (e as Error).message };
  }

  /*
   * A doua cerere, FARA autorizare. Orice esec aici e o veste buna (inseamna ca
   * resursa e aparata), deci nu se propaga: ne intereseaza doar daca trece.
   */
  let publicAccesibil = false;
  try {
    const res = await fetch(`${baza(config)}/unitati-livrare`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(ASTEPTARE_MS),
      cache: "no-store",
      redirect: "manual",
    });
    if (res.ok) {
      const text = await res.text();
      try { publicAccesibil = Array.isArray(JSON.parse(text)); } catch { publicAccesibil = false; }
    }
  } catch {
    publicAccesibil = false;
  }

  return publicAccesibil
    ? { fel: "raspunde_dar_public", unitati: unitati.length }
    : { fel: "autentificat", unitati: unitati.length };
}

// ─── Nomenclatoare ────────────────────────────────────────────────────────────

/**
 * Lista de valori dintr-un raspuns care poate fi lista, sau un obiect cu lista
 * inauntru.
 *
 * ⚠ Exista fiindca formatul NU e documentat pentru niciunul dintre nomenclatoare.
 * Impachetarea intr-un `{data: […]}` sau `{items: […]}` e destul de raspandita cat
 * sa nu merite un esec daca se dovedeste ca asa vine.
 */
export function listaDinRaspuns(r: unknown): unknown[] {
  if (Array.isArray(r)) return r;
  if (r && typeof r === "object") {
    for (const cheie of ["data", "items", "rezultat", "result", "list", "unitati", "statusuri"]) {
      const v = (r as Record<string, unknown>)[cheie];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

/** Nomenclatorul de statusuri (2.6). Citire pura. */
export async function nomenclatorStatusuri(config: PostaConfig): Promise<StatusNomenclator[]> {
  const r = await apel<unknown>(config, "GET", "/statusuri-trace");
  return listaDinRaspuns(r).filter((x): x is StatusNomenclator => !!x && typeof x === "object");
}

/**
 * Nomenclatorul de unitati de livrare (2.7). Citire pura.
 *
 * „Actualizat continuu", spune documentatia — deci nu se tine in cod, se cere.
 */
export async function unitatiLivrare(config: PostaConfig): Promise<UnitateLivrare[]> {
  const r = await apel<unknown>(config, "GET", "/unitati-livrare");
  return listaDinRaspuns(r).filter((x): x is UnitateLivrare => !!x && typeof x === "object");
}

// ─── Borderou ─────────────────────────────────────────────────────────────────

/**
 * Borderou gol (2.1), in care se pot adauga AWB-uri ulterior.
 *
 * ⚠ CREEAZA CEVA. E singurul apel in afara de emitere care nu e o citire.
 *
 * ⚠ Si e legat de UN SINGUR user: documentatia spune ca AWB-uri se pot adauga
 * „doar daca userul creator al borderoului este acelasi cu cel care creaza awb-uri
 * si acel borderou nu a fost prezentat". Cum NU exista niciun endpoint de
 * prezentare, noi nu putem sti cand s-a inchis — de aia borderoul e optional in
 * configurare si implicitul e sa nu-l folosim deloc (`"idBorderou": null` e chiar
 * in exemplul lor).
 *
 * ⚠ Raspunsul nu e documentat: „va returna un id de borderou". Se cauta printre
 * formele obisnuite, si daca nu se gaseste un numar, se arunca `necunoscut` —
 * borderoul poate sa fi fost creat, deci nu spunem ca a esuat.
 */
export async function borderouNou(config: PostaConfig): Promise<number> {
  const r = await apel<unknown>(config, "POST", "/borderou/new", undefined, ASTEPTARE_EMITERE_MS);
  const id = citesteIdBorderou(r);
  if (id === null) {
    throw eroareNesigura(
      "Posta a raspuns la crearea borderoului fara un id pe care sa-l recunoastem. "
      + "Verifica in aplicatia lor daca s-a creat un borderou nou.",
    );
  }
  return id;
}

/** Id-ul de borderou, cautat prin formele cu putinta. Exportat ca sa poata fi probat. */
export function citesteIdBorderou(r: unknown): number | null {
  const numar = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
    if (typeof v === "string" && /^\d+$/.test(v.trim())) {
      const n = Number(v.trim());
      return Number.isSafeInteger(n) && n > 0 ? n : null;
    }
    return null;
  };

  /* Raspunsul poate fi chiar numarul, sau sirul lui. */
  const direct = numar(r);
  if (direct !== null) return direct;

  if (r && typeof r === "object") {
    const o = r as Record<string, unknown>;
    for (const cheie of ["idBorderou", "id_borderou", "borderouId", "id", "borderou"]) {
      const v = numar(o[cheie]);
      if (v !== null) return v;
    }
    /* Impachetat: {data: {...}} sau {borderou: {...}}. Un singur nivel. */
    for (const cheie of ["data", "borderou", "rezultat", "result"]) {
      const v = o[cheie];
      if (v && typeof v === "object") {
        const inauntru = citesteIdBorderou(v);
        if (inauntru !== null) return inauntru;
      }
    }
  }
  return null;
}

// ─── Emiterea ─────────────────────────────────────────────────────────────────

export type RezultatSalvare = {
  /**
   * Codul AWB. `null` cand nu l-am putut citi din raspuns — caz in care apelantul
   * NU are voie sa raporteze succes.
   */
  cod: string | null;
  /** Raspunsul brut, pastrat in registru: la prima expediere reala, el e dovada. */
  brut: unknown;
};

/**
 * Salveaza AWB-ul (2.2).
 *
 * ⚠ CREEAZA O TRIMITERE REALA, FACTURATA. Nu se cheama de doua ori pentru aceeasi
 * comanda fara sa treaca prin registrul de operatii externe.
 *
 * ⚠ Raspunsul NU e documentat. Vezi `citesteCodAwb`.
 */
export async function salveazaAwb(
  config: PostaConfig,
  corp: Record<string, unknown>,
): Promise<RezultatSalvare> {
  const r = await apel<unknown>(config, "POST", "/awb", corp, ASTEPTARE_EMITERE_MS);
  /* Codul trimis de noi (modul plaja) bate orice: il stim sigur. */
  const alNostru = typeof corp.codAwb === "string" ? corp.codAwb.trim() : "";
  return { cod: alNostru || citesteCodAwb(r), brut: r };
}

/**
 * Forma unui cod AWB.
 *
 * ⚠ MASURATA din documentatie, nu inventata: `awbRetur` e declarat `(char 13)`,
 * si toate cele trei exemple au exact 13 caractere („LN09199999999",
 * „LN09199999949", „LN99999999989"). Litere si cifre, fara separatori.
 *
 * Se foloseste ca SITA, nu ca validare stricta a intrarii: cand cautam codul
 * intr-un raspuns nedocumentat, trebuie sa deosebim un AWB de un id intern.
 */
export const FORMA_COD_AWB = /^[A-Za-z0-9]{13}$/;

export function pareCodAwb(v: unknown): v is string {
  return typeof v === "string" && FORMA_COD_AWB.test(v.trim());
}

/**
 * Codul AWB, cautat intr-un raspuns al carui format nu e documentat.
 *
 * ═══ ⚠ DE CE E SCRIS ASA, SI DE CE INTOARCE `null` IN LOC SA GHICEASCA ═══
 *
 * Cand comerciantul NU are plaja de coduri, documentatia spune ca `codAwb` „se va
 * genera in mod automat" — deci singurul loc din care putem afla numarul e chiar
 * raspunsul emiterii. Iar formatul lui nu e scris nicaieri.
 *
 * Cautarea de mai jos incearca numele probabile si, in lipsa lor, orice sir care
 * ARATA a cod AWB (13 caractere alfanumerice). Doua reguli o tin cinstita:
 *
 *   1. **Se cere forma, nu doar prezenta.** Fara sita, primul sir din raspuns —
 *      un mesaj, o data, un nume de unitate — ar fi devenit „AWB" si ar fi ajuns
 *      pe comanda si in cozile de marketplace.
 *   2. **Daca nu gaseste nimic, intoarce `null`**, iar apelantul opreste totul cu
 *      verdictul „nu stim". Trimiterea poate sa existe la ei; un „a esuat" ar
 *      debloca reincercarea si ar produce al doilea colet.
 *
 * La prima expediere reala, `brut` ramane in registru: de acolo se afla forma
 * adevarata si lista de mai jos se scurteaza la un singur nume.
 */
export function citesteCodAwb(r: unknown): string | null {
  if (pareCodAwb(r)) return (r as string).trim();

  if (Array.isArray(r)) {
    for (const x of r) {
      const v = citesteCodAwb(x);
      if (v) return v;
    }
    return null;
  }

  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;

  /* Intai numele probabile, ca sa nu culegem un alt sir de 13 caractere. */
  for (const cheie of ["codAwb", "cod_awb", "codawb", "awb", "awbNumber", "nrAwb", "numarAwb"]) {
    const v = o[cheie];
    if (pareCodAwb(v)) return (v as string).trim();
  }

  /* Apoi un nivel de impachetare. */
  for (const cheie of ["data", "awb", "rezultat", "result", "trimitere"]) {
    const v = o[cheie];
    if (v && typeof v === "object") {
      const inauntru = citesteCodAwb(v);
      if (inauntru) return inauntru;
    }
  }

  /* In ultimul rand, orice valoare care are chiar forma unui cod AWB. */
  for (const v of Object.values(o)) {
    if (pareCodAwb(v)) return (v as string).trim();
  }

  return null;
}

// ─── Citirea unui AWB ─────────────────────────────────────────────────────────

/**
 * Detaliile unui AWB (2.3). Citire pura.
 *
 * ⚠ `null` la 404: e chiar raspunsul asteptat pentru un cod care nu exista, si pe
 * asta se sprijina confirmarea din modul plaja („am trimis codul, chiar s-a
 * creat?").
 */
export async function citesteAwb(config: PostaConfig, cod: string): Promise<unknown | null> {
  try {
    return await apel<unknown>(config, "GET", `/awb/${encodeURIComponent(cod)}`);
  } catch (e) {
    if (statusEroare(e) === 404) return null;
    throw e;
  }
}

/**
 * Exista AWB-ul la ei?
 *
 * ⚠ Intoarce `null` cand NU STIM (reteaua a cazut, ei au raspuns 500). Trei
 * valori, nu doua: apelantul trebuie sa poata deosebi „nu exista" de „n-am putut
 * afla", fiindca deciziile sunt opuse.
 */
export async function awbExista(config: PostaConfig, cod: string): Promise<boolean | null> {
  try {
    return (await citesteAwb(config, cod)) !== null;
  } catch {
    return null;
  }
}

/**
 * Istoricul de statusuri (2.4). Citire pura.
 *
 * ⚠ Forma raspunsului nu e documentata, dar deductia e sigura cat se poate: 2.5
 * („ultimul status") intoarce un obiect anume, iar 2.4 e „istoricul" aceluiasi
 * lucru — deci o lista din acele obiecte. `listaDinRaspuns` acopera si cazul in
 * care vine impachetat.
 *
 * ⚠ SE FOLOSESTE ISTORICUL, NU ULTIMA STARE, si nu din lacomie. Intre doua treceri
 * ale cronului pot intra mai multe evenimente, iar ultimul poate fi unul
 * administrativ („schimbare cod", „reambalat"). Cu doar el, livrarea petrecuta
 * intre timp n-ar mai fi vazuta niciodata — comanda ar ramane „expediata", iar la
 * plata la livrare asta inseamna bani neinregistrati. Aceeasi hotarare ca la GLS
 * (`statusFinalDinStari`).
 */
export async function istoricStatusuri(
  config: PostaConfig,
  cod: string,
  asteptareMs?: number,
): Promise<StarePosta[]> {
  const r = await apel<unknown>(
    config, "GET", `/awb/${encodeURIComponent(cod)}/trace`, undefined, asteptareMs,
  );
  return listaDinRaspuns(r).filter((x): x is StarePosta => !!x && typeof x === "object");
}

/**
 * Ultima stare (2.5) — singura forma de raspuns documentata.
 *
 * Se foloseste in panou, unde se arata omului „unde e coletul acum"; cronul merge
 * pe istoric, din motivul de mai sus.
 */
export async function ultimulStatus(
  config: PostaConfig,
  cod: string,
  asteptareMs?: number,
): Promise<StarePosta | null> {
  try {
    const r = await apel<unknown>(
      config, "GET", `/awb/${encodeURIComponent(cod)}/trace/last`, undefined, asteptareMs,
    );
    if (Array.isArray(r)) return (r[0] as StarePosta) ?? null;
    return r && typeof r === "object" ? (r as StarePosta) : null;
  } catch (e) {
    /* Un AWB proaspat, inca neinregistrat la ei, e cazul obisnuit — nu un defect. */
    if (statusEroare(e) === 404) return null;
    throw e;
  }
}
