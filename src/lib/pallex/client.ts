import { eroareCuStatus, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";

/**
 * Clientul Pall-Ex ClientPlus.
 *
 * ═══ CE E PALL-EX, SI DE CE NU SEAMANA CU CEILALTI SASE ═══
 *
 * E o retea de distributie de marfa PALETIZATA (hub & spoke), nu un curier de
 * colete. Se vede in tot API-ul:
 *
 *   - unitatea nu e coletul, ci **partida** (`Consignment`), cu numar de paleti
 *     si greutate totala;
 *   - **nu exista ramburs.** Niciun camp, nici pe partida, nici pe palet;
 *   - **data si fereastra orara sunt obligatorii**, si la ridicare si la livrare;
 *   - partida nu pleaca singura: sistemul o aseaza intr-un **borderou**, pe care
 *     intai il valideaza clientul si apoi transportatorul.
 *
 * ═══ DOCUMENTATIA ═══
 *
 * `https://clientplus.pallex.ro/api/` (Swagger UI) serveste specificatia OpenAPI
 * 3.0.2 de la `https://clientplus.pallex.ro/api/v1.yaml`, versiunea 1.0.5 — care
 * e si versiunea implicita din registrul SwaggerHub al furnizorului. Titlul ei
 * spune „[DEPRECATED]" si trimite inapoi la aceeasi adresa: ce s-a inchis e copia
 * de pe SwaggerHub, nu API-ul. NU exista v2.
 *
 * ⚠ Contractele de mai jos sunt luate din specificatie, camp cu camp. Nu sunt
 * ghicite si nu vin dintr-un plugin — dar nici nu sunt probate pe fir: fiecare
 * endpoint cere autentificare, deci nimic nu se poate verifica fara datele de
 * acces ale comerciantului. De aceea tot ce se poate desparti de retea
 * (construirea partidei, citirea statusurilor, cheile de documente) sta in
 * module pure, cu probe.
 *
 * ═══ ⚠ FLUXUL E IN CINCI PASI, NU IN UNUL ═══
 *
 *   1. clientul creeaza una sau mai multe partide      (POST /consignments)
 *   2. sistemul le aseaza intr-un borderou             (automat, in raspuns)
 *   3. clientul valideaza borderoul                    (POST /bordereaux/{id}/validated)
 *   4. transportatorul valideaza borderoul             (la ei)
 *   5. clientul ia documentele de transport            (GET .../label, .../note)
 *
 * Pasul 3 e al nostru si NU e optional: fara el marfa nu pleaca. Si e ireversibil
 * — o partida dintr-un borderou validat nu se mai poate sterge (`DELETE
 * /consignments/{id}` e documentat „if not yet validated").
 */

/** Adresa API-ului. Un singur mediu: Pall-Ex nu publica niciun server de test. */
const BAZA = "https://clientplus.pallex.ro/api/v1";

/**
 * Tipul partidei (`type` in specificatie).
 *
 *   1 = Colectare            — Pall-Ex ridica de la noi si duce la depozitul lor
 *   2 = Livrare              — noi ducem marfa la ei, Pall-Ex o livreaza
 *   3 = Colectare & Livrare  — amandoua; asta e cazul obisnuit al unui magazin
 */
export const TIPURI_PARTIDA = [1, 2, 3] as const;
export type TipPartida = (typeof TIPURI_PARTIDA)[number];

export const NUME_TIP_PARTIDA: Record<TipPartida, string> = {
  1: "Colectare (Pall-Ex ridica de la magazin)",
  2: "Livrare (marfa ajunge singura la Pall-Ex)",
  3: "Colectare si livrare",
};

/** Serviciile optionale de pe partida, asa cum le poate cere comerciantul. */
export type ServiciiPallEx = {
  /** Masina cu lift la RIDICARE. E o insusire a depozitului, deci sta in configurare. */
  liftLaRidicare?: boolean;
  /** Acces restrictionat la RIDICARE. La fel: tine de locul de unde se ridica. */
  accesRestrictionatLaRidicare?: boolean;
  /** Masina cu lift la LIVRARE — clientul nu are rampa. */
  liftLaLivrare?: boolean;
  /** Acces restrictionat la LIVRARE (centru, strada ingusta, program). */
  accesRestrictionatLaLivrare?: boolean;
  /** Livrarea trebuie programata in prealabil cu destinatarul. */
  programareLivrare?: boolean;
  /** Depaletare la destinatie. */
  depaletare?: boolean;
  /** Livrare in sediu, nu la poarta. */
  livrareInSediu?: boolean;
  /** Asistare la receptie. */
  asistareReceptie?: boolean;
  /** Asigurare, cu valoarea marfii in lei. */
  asigurare?: boolean;
  /** Retur de documente semnate (avize, facturi). */
  returDocumente?: boolean;
  returDocumenteNumar?: number;
  returDocumenteDetalii?: string | null;
  /** Retur de instrumente de plata (bilete la ordin). */
  returInstrumente?: boolean;
  returInstrumenteNumar?: number;
  returInstrumenteDetalii?: string | null;
  /** Retur de paleti goi. */
  returPaleti?: boolean;
  returPaletiNumar?: number;
};

export type PallExConfig = {
  enabled: boolean;
  /** Utilizatorul ClientPlus. Autentificarea e HTTP Basic. */
  username: string;
  password: string;
  /**
   * ⚠ Codul postal si judetul adresei de RIDICARE.
   *
   * Stau aici, in configurare, si nu se iau din `businesses`, fiindca acolo nu
   * exista cod postal — tabelul are `store_address`, `store_city`,
   * `store_county` si niciun camp de cod postal, nici pentru magazin, nici pentru
   * firma. Aceeasi hotarare ca la GLS, si din acelasi motiv.
   *
   * Judetul e totusi si in `businesses`; se pastreaza si aici fiindca Pall-Ex il
   * vrea ca ISO auto („SB", „B"), iar magazinul si-l poate lasa necompletat.
   * Valoarea din configurare bate, cea din `businesses` e rezerva.
   */
  expeditor_cod_postal?: string;
  expeditor_judet?: string;
  /** Persoana pe care o cauta soferul la ridicare. */
  expeditor_contact?: string;
  tip_partida?: TipPartida;
  /** Fereastra orara a depozitului, „HH:MM". Se trimite la fiecare partida. */
  ora_deschidere?: string;
  ora_inchidere?: string;
  /** Fereastra orara implicita a destinatarului, cand comanda nu spune alta. */
  ora_deschidere_livrare?: string;
  ora_inchidere_livrare?: string;
  /** Peste cate zile LUCRATOARE se poate ridica marfa. Implicit 1 (maine). */
  zile_pana_la_ridicare?: number;
  /**
   * Peste cate zile LUCRATOARE de la ridicare ajunge marfa. Implicit 2.
   * Pall-Ex are Premium 24h si Economy 48h; `is_premium` e insa doar de CITIT in
   * API — il hotaraste ei din datele trimise, nu il cerem noi.
   */
  zile_pana_la_livrare?: number;
  /**
   * ⚠ Valideaza borderoul imediat dupa crearea partidei. IMPLICIT OPRIT.
   *
   * Un borderou strange partidele mai multor comenzi. Validat, pleaca TOT ce e in
   * el si nimic din el nu se mai poate sterge. Pornita, optiunea asta poate deci
   * expedia definitiv comenzi la care comerciantul inca lucra.
   *
   * Lasata oprita, marfa nu pleaca pana cand nu apasa el butonul — ceea ce e si
   * fluxul documentat de Pall-Ex („The Client validates the Bordereau").
   */
  valideaza_automat?: boolean;
  servicii?: ServiciiPallEx;
};

/**
 * „E configurat complet?"
 *
 * ⚠ Sta AICI, si nu langa actiuni, din doua motive care se sprijina unul pe
 * altul: intr-un fisier `"use server"` fiecare export trebuie sa fie o functie
 * `async` (un predicat sincron nici n-ar compila), si aceeasi regula trebuie
 * folosita de SASE locuri diferite — pagina de integrari, setarile de livrare,
 * checkout-ul, lista de comenzi, detaliul comenzii si cronul. Scrisa in fiecare
 * din ele, panoul ar ajunge sa ofere o metoda de livrare pe care comanda o
 * refuza.
 */
export function pallexGata(c: PallExConfig | null | undefined): c is PallExConfig {
  return !!(c?.enabled && c.username && c.password);
}

/** Un palet din partida. Dimensiunile sunt in centimetri, greutatea in kilograme. */
export type PaletPallEx = {
  weight: number;
  length: number;
  width: number;
  height: number;
  superposable?: boolean;
};

/**
 * Partida, in forma ceruta de ClientPlus.
 *
 * ⚠ Numele campurilor sunt ale LOR (`consignee_*`, `collection_open_time`), nu
 * ale noastre. Un camp scris altfel e ignorat tacut, iar partida pleaca fara
 * telefon, fara cod postal sau fara fereastra orara.
 */
export type PartidaPallEx = {
  type: TipPartida;

  consignor_name: string;
  consignor_county: string;
  consignor_locality: string;
  consignor_address: string;
  consignor_postcode: string;
  consignor_contact?: string;
  consignor_phone?: string;

  consignee_name: string;
  consignee_county: string;
  consignee_locality: string;
  consignee_address: string;
  consignee_postcode: string;
  consignee_contact?: string;
  consignee_phone?: string;

  collection_date: string;
  collection_open_time: string;
  collection_close_time: string;
  has_collection_tail_lift?: boolean;
  has_collection_restricted_access?: boolean;

  delivery_date: string;
  delivery_open_time: string;
  delivery_close_time: string;
  has_delivery_tail_lift?: boolean;
  has_delivery_restricted_access?: boolean;
  has_delivery_bookin_required?: boolean;

  pallet_count: number;
  /** ⚠ Intreg, in kilograme: specificatia o da `format: int32`. */
  pallet_weight: number;
  pallets?: PaletPallEx[];

  has_return_documents?: boolean;
  return_documents_count?: number;
  return_documents?: string;
  has_return_instruments?: boolean;
  return_instruments_count?: number;
  return_instruments?: string;
  has_return_pallets?: boolean;
  return_pallets_count?: number;

  has_insurance?: boolean;
  insurance?: number;

  has_depallet?: boolean;
  has_premises_delivery?: boolean;
  has_reception_assistance?: boolean;

  client_reference?: string;
  client_notes?: string;
};

/** Ce intoarce Pall-Ex la citirea unei partide. Campurile `readOnly` din specificatie. */
export type PartidaCitita = PartidaPallEx & {
  id?: number;
  pallex_id?: string;
  pallex_barcode?: string;
  bordereau_id?: number;
  estimate_id?: number;
  status_type_id?: number;
  is_premium?: boolean;
  carrier_notes?: string;
  source?: number;
  status_timestamp?: string;
  created_at?: string;
  updated_at?: string;
};

/** Rezultatul crearii: singurele doua campuri din raspunsul lui `POST /consignments`. */
export type PartidaCreata = { id: number; bordereau_id: number | null };

/** Starea borderoului (`validated` din specificatie). */
export const BORDEROU_NEVALIDAT = 0;
export const BORDEROU_VALIDAT_DE_CLIENT = 1;
export const BORDEROU_VALIDAT_DE_TRANSPORTATOR = 2;

export type Borderou = {
  id?: number;
  validated?: number;
  created_at?: string;
  updated_at?: string;
  consignments?: PartidaCitita[];
};

/** O pereche (id, nume) din `/consignment_status_types`. */
export type TipStatus = { id: number; name: string };

/**
 * ⚠ Timp maxim de asteptare.
 *
 * Pall-Ex nu publica niciun termen. 45 de secunde e sub cele 60 ale unei functii
 * Vercel si peste orice raspuns sanatos. Prea scurt ar fi mai rau decat prea
 * lung: un timeout NU opreste crearea partidei de partea lor, doar ne face sa
 * credem ca n-a mers — iar atunci o reincercare produce a doua expediere, reala
 * si facturata.
 */
const ASTEPTARE_MS = 45_000;

/** Datele de acces, in antetul `Authorization`. */
function antetBasic(config: Pick<PallExConfig, "username" | "password">): string {
  return `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
}

/**
 * Mesajul de eroare al Pall-Ex, scos din corpul raspunsului.
 *
 * ⚠ Sunt DOUA forme, si a doua e cea folositoare:
 *
 *   401  `{"status": 0, "error": "Not Authorized"}`
 *   422  `{"status": 422, "meta": ["collection_date", "delivery_date"]}`
 *
 * A doua nu are niciun text: spune doar CARE campuri au fost respinse. Citita
 * doar dupa `error`, un 422 ar iesi „eroare 422" sec, iar comerciantul n-ar afla
 * niciodata ca problema e data de ridicare. De aceea `meta` se traduce in numele
 * romanesti ale campurilor si intra in mesaj.
 */
const NUME_CAMP: Record<string, string> = {
  type: "tipul partidei",
  consignor_name: "numele expeditorului",
  consignor_county: "judetul expeditorului",
  consignor_locality: "localitatea expeditorului",
  consignor_address: "adresa expeditorului",
  consignor_postcode: "codul postal al expeditorului",
  consignee_name: "numele destinatarului",
  consignee_county: "judetul destinatarului",
  consignee_locality: "localitatea destinatarului",
  consignee_address: "adresa destinatarului",
  consignee_postcode: "codul postal al destinatarului",
  collection_date: "data de ridicare",
  collection_open_time: "ora de deschidere la ridicare",
  collection_close_time: "ora de inchidere la ridicare",
  delivery_date: "data de livrare",
  delivery_open_time: "ora de deschidere la livrare",
  delivery_close_time: "ora de inchidere la livrare",
  pallet_count: "numarul de paleti",
  pallet_weight: "greutatea totala",
  insurance: "valoarea asigurata",
};

export function descrieEroarea(corp: unknown, brut: string): string {
  if (corp && typeof corp === "object") {
    const o = corp as { error?: unknown; message?: unknown; meta?: unknown };

    const campuri = Array.isArray(o.meta)
      ? o.meta.filter((m): m is string => typeof m === "string")
      : [];
    if (campuri.length > 0) {
      const traduse = campuri.map((c) => NUME_CAMP[c] ?? c);
      return `Pall-Ex a respins datele: ${traduse.join(", ")}`;
    }

    if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
  }
  /*
   * Ultima rezerva: corpul brut, taiat. Un raspuns pe care nu-l intelegem e mai
   * folositor aratat decat inlocuit cu „eroare necunoscuta" — asa s-a aflat la
   * Woot ca API-ul spunea de la inceput ce nu-i place.
   */
  return brut.trim().slice(0, 300) || "raspuns gol";
}

type Metoda = "GET" | "POST" | "DELETE";

/**
 * Statusul HTTP, pastrat PE eroare.
 *
 * ⚠ Exista fiindca prima forma a lui `stergePartida` hotara „a disparut / n-a
 * disparut" cautand „404" in TEXTUL erorii. Textul insa nu contine niciodata
 * statusul (`eroareCuStatus` il foloseste doar ca sa aleaga verdictul, nu il
 * scrie in mesaj), iar specificatia declara 404 la `DELETE` FARA corp. Deci
 * ramura aia nu se atingea niciodata, si decizia atarna de cuvintele furnizorului
 * — „not found" in engleza mergea, „partida nu exista" in romana nu.
 *
 * Consecinta era exact opusul a ce promiteau comentariile: o comanda cu partida
 * deja stearsa la Pall-Ex ramanea blocata pentru totdeauna (nu se mai putea nici
 * anula, nici reemite). Si invers, o pagina de eroare a unui intermediar care
 * contine „Not Found" ar fi golit coloanele pe o partida VIE.
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

/**
 * Un apel catre ClientPlus.
 *
 * ═══ VERDICTELE, PE RAND ═══
 *
 * Registrul de operatii externe are nevoie de un singur raspuns: a REFUZAT
 * furnizorul, sau nu stim? Aici se hotaraste, fiindca doar aici se stie.
 *
 * ⚠ Pall-Ex raspunde cu coduri HTTP adevarate (spre deosebire de DPD si MyGLS,
 * care raspund 200 si refuza in corp): specificatia enumera 400, 401, 403, 404,
 * 422 si 500 pe fiecare metoda. Deci `eroareCuStatus` chiar poate hotari — 4xx e
 * refuz dovedit, 5xx si timeout raman nesigure.
 *
 * ⚠ Ce NU se face: nu se citeste corpul ca sa se rastoarne verdictul. Un corp
 * neinteligibil dupa un 500 nu devine „refuz" fiindca contine cuvantul „error".
 */
async function apel<T>(
  config: PallExConfig,
  metoda: Metoda,
  cale: string,
  corp?: unknown,
  asteptareMs = ASTEPTARE_MS,
): Promise<{ date: T | null; status: number }> {
  const url = `${BAZA}${cale}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: metoda,
      headers: {
        Authorization: antetBasic(config),
        Accept: "application/json",
        ...(corp !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: corp !== undefined ? JSON.stringify(corp) : undefined,
      signal: AbortSignal.timeout(asteptareMs),
    });
  } catch (e) {
    /* Retea cazuta sau timeout: nu stim daca cererea a ajuns. */
    throw eroareNesigura(`Pall-Ex ${metoda} ${cale}: ${(e as Error).message}`);
  }

  const text = await res.text();
  let date: T | null = null;
  if (text.trim()) {
    try {
      date = JSON.parse(text) as T;
    } catch {
      date = null;
    }
  }

  if (!res.ok) {
    const mesaj = descrieEroarea(date, text);
    if (res.status === 401) {
      throw cuStatus(eroareRefuz(
        "Pall-Ex: autentificare esuata — verifica utilizatorul si parola din ClientPlus",
      ), res.status);
    }
    if (res.status === 403) {
      throw cuStatus(eroareRefuz(
        "Pall-Ex: acces interzis — contul nu are drepturi pe aceasta operatiune sau pe aceasta partida",
      ), res.status);
    }
    /* Statusul intra SI in mesaj (ca la GLS si Sameday): fara el, un raspuns fara
       text lasa omul cu „raspuns gol" si nimic altceva de cautat. */
    throw cuStatus(eroareCuStatus(`Pall-Ex ${metoda} ${cale}: ${res.status} — ${mesaj}`, res.status), res.status);
  }

  /*
   * ⚠ Un 2xx cu corp necitibil NU e succes.
   *
   * `204 No Content` are corpul gol pe buna dreptate (stergerile), deci acolo
   * `date` ramane `null` si e in regula. Dar un 200 sau 201 cu text care nu e
   * JSON inseamna ca ceva s-a schimbat intre timp la ei — poate o pagina de
   * eroare a unui intermediar — si NU avem voie sa spunem ca a mers. Verdictul
   * ramane nesigur: partida chiar poate sa fi fost creata.
   */
  if (text.trim() && date === null) {
    throw eroareNesigura(
      `Pall-Ex ${metoda} ${cale}: raspuns necitibil (${res.status}) — ${text.slice(0, 200)}`,
    );
  }

  return { date, status: res.status };
}

// ─── Partide ──────────────────────────────────────────────────────────────────

/**
 * Prima intrare dintr-un raspuns care poate fi si tablou, si obiect.
 *
 * ⚠ ClientPlus intoarce TABLOURI acolo unde te-ai astepta la un singur obiect:
 * `GET /consignments/{id}` e declarat `type: array` in specificatie, si exemplul
 * lui `POST /consignments` e tot un tablou, cu o singura intrare. Tratat ca
 * obiect, `raspuns.id` ar fi `undefined` la fiecare apel — fara nicio eroare, si
 * cu partida deja creata la ei.
 */
function primul<T>(date: unknown): T | null {
  if (Array.isArray(date)) return (date[0] as T) ?? null;
  if (date && typeof date === "object") return date as T;
  return null;
}

/**
 * Creeaza o partida.
 *
 * ⚠ Metoda asta produce un transport real, facturat. Nu se cheama de doua ori
 * pentru aceeasi comanda fara sa treaca prin registrul de operatii externe.
 *
 * ⚠ `bordereau_id` poate lipsi din raspuns, iar asta NU e un motiv sa consideram
 * crearea esuata: partida exista, doar ca nu stim in ce borderou a intrat. Se
 * afla mai tarziu, dintr-o citire. De aceea campul e `number | null`, nu
 * obligatoriu — o verificare stricta aici ar fi aruncat pe o partida vie, iar
 * apelantul ar fi reincercat si ar fi facut a doua.
 */
export async function creeazaPartida(
  config: PallExConfig,
  partida: PartidaPallEx,
): Promise<PartidaCreata> {
  const { date } = await apel<unknown>(config, "POST", "/consignments", partida);
  const creata = primul<{ id?: unknown; bordereau_id?: unknown }>(date);

  const id = Number(creata?.id);
  if (!Number.isInteger(id) || id <= 0) {
    /*
     * Un 201 fara ID e cel mai prost caz cu putinta: partida probabil exista, dar
     * n-avem cu ce sa o mai atingem — nici sa o stergem, nici sa o urmarim.
     * Verdictul trebuie sa ramana NESIGUR, ca registrul sa blocheze si sa scoata
     * cazul la om, in loc sa lase o reincercare libera care ar face a doua.
     */
    throw eroareNesigura("Pall-Ex a raspuns fara ID de partida — verifica in ClientPlus daca s-a creat");
  }

  const borderou = Number(creata?.bordereau_id);
  return { id, bordereau_id: Number.isInteger(borderou) && borderou > 0 ? borderou : null };
}

/**
 * Citeste o partida.
 *
 * ⚠ Citire pura: nu creeaza si nu schimba nimic, deci se poate reincerca fara
 * grija si NU trece prin registrul de operatii externe.
 */
export async function citestePartida(
  config: PallExConfig,
  id: number,
  asteptareMs?: number,
): Promise<PartidaCitita | null> {
  const { date } = await apel<unknown>(config, "GET", `/consignments/${id}`, undefined, asteptareMs);
  return primul<PartidaCitita>(date);
}

/**
 * Sterge o partida — adica ANULEAZA transportul.
 *
 * ⚠ Merge DOAR cat timp borderoul nu e validat („Delete an consignment if not
 * yet validated"). Dupa validare, Pall-Ex raspunde cu eroare, iar asta e purtarea
 * corecta: marfa chiar pleaca, si AWB-ul nu are voie sa dispara de pe comanda.
 *
 * `sters` spune ce s-a intamplat, in loc sa arunce la 404:
 *   true   204, partida nu mai exista la ei;
 *   true   404, partida NU EXISTA — pentru noi acelasi lucru. Cazul din care s-a
 *          nascut ramura: `DELETE` intra in timeout dupa ce Pall-Ex apucase sa
 *          stearga; verdictul e „nu stim", deci comerciantul incearca din nou si
 *          a doua oara primeste 404. Tratat ca esec, comanda ar fi ramas cu o
 *          partida pe care nimeni n-o mai putea scoate: nici anulata (nu mai
 *          exista), nici reemisa (registrul o tinea ocupata).
 *
 * ⚠ Hotararea se ia pe STATUSUL HTTP, nu pe textul raspunsului.
 *
 * Prima forma cauta „404" si „not found" IN MESAJ. Nu mergea in niciun sens:
 * statusul nu ajungea in mesaj, iar specificatia declara 404 la `DELETE` fara
 * corp — deci raspunsul documentat nu se potrivea cu niciunul dintre cele doua
 * tipare, si comanda ramanea blocata definitiv, exact invers decat promitea
 * comentariul de mai sus. Iar in cealalta directie, o pagina de eroare a unui
 * intermediar care contine cuvintele „Not Found" ar fi golit coloanele pe o
 * partida VIE, care chiar pleaca spre client.
 */
export async function stergePartida(
  config: PallExConfig,
  id: number,
): Promise<{ sters: true } | { sters: false; motiv: string }> {
  try {
    await apel<unknown>(config, "DELETE", `/consignments/${id}`);
    return { sters: true };
  } catch (e) {
    if (statusEroare(e) === 404) return { sters: true };
    return { sters: false, motiv: (e as Error).message };
  }
}

// ─── Documente ────────────────────────────────────────────────────────────────

export type FelDocument = "label" | "note";

/**
 * PDF-ul unui document de transport: eticheta (`label`) sau avizul (`note`).
 *
 * ⚠ Sunt CITIRI. Nu creeaza nimic si se pot cere de cate ori e nevoie — spre
 * deosebire de GLS, unde eticheta venea odata cu crearea coletului si a doua
 * chemare a metodei de emitere ar fi facut un al doilea colet real. Aici nu
 * exista niciun asemenea pericol: `GET` nu are cu ce sa descrie o partida noua.
 *
 * ⚠ Documentele apar de obicei abia DUPA validarea borderoului (pasul 5 din
 * fluxul documentat). Un 404 inainte de asta nu e un defect, si de aceea functia
 * intoarce `null` in loc sa arunce: apelantul are un mesaj mai bun de dat.
 */
export async function documentPartidei(
  config: PallExConfig,
  id: number,
  fel: FelDocument,
): Promise<Buffer | null> {
  const url = `${BAZA}/consignments/${id}/${fel}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: antetBasic(config), Accept: "application/pdf" },
      signal: AbortSignal.timeout(ASTEPTARE_MS),
    });
  } catch (e) {
    throw eroareNesigura(`Pall-Ex document ${fel}: ${(e as Error).message}`);
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw cuStatus(
      eroareCuStatus(`Pall-Ex document ${fel}: ${res.status} — ${descrieEroarea(null, text)}`, res.status),
      res.status,
    );
  }

  const octeti = Buffer.from(await res.arrayBuffer());

  /*
   * ⚠ Un raspuns 200 gol nu e un PDF.
   *
   * Intors ca atare, s-ar fi salvat in CDN un fisier de zero octeti — iar de
   * atunci incolo descarcarea ar fi servit instantaneu nimic, fara sa mai
   * intrebe vreodata Pall-Ex. Un fisier gol care se serveste repede e mai rau
   * decat lipsa lui.
   */
  return octeti.length > 0 ? octeti : null;
}

// ─── Borderouri ───────────────────────────────────────────────────────────────

/**
 * Citeste un borderou, cu partidele lui.
 *
 * Citire pura. Serveste la doua lucruri: sa se vada daca a fost deja validat, si
 * CATE partide mai sunt in el — cifra pe care comerciantul trebuie s-o stie
 * inainte de a apasa „valideaza", fiindca validarea le porneste pe toate.
 */
export async function citesteBorderou(
  config: PallExConfig,
  id: number,
): Promise<Borderou | null> {
  const { date } = await apel<unknown>(config, "GET", `/bordereaux/${id}`);
  return primul<Borderou>(date);
}

/**
 * Valideaza borderoul: de aici incolo marfa pleaca.
 *
 * ⚠ IREVERSIBIL, SI NU DOAR PENTRU O COMANDA.
 *
 * Un borderou strange partidele mai multor comenzi create in aceeasi perioada.
 * Validarea le porneste pe TOATE si le scoate din anulare — `DELETE
 * /consignments/{id}` merge doar „if not yet validated". Deci butonul care
 * cheama functia asta trebuie sa spuna cate partide sunt in borderou, nu sa lase
 * comerciantul sa creada ca valideaza doar comanda deschisa.
 */
export async function valideazaBorderou(config: PallExConfig, id: number): Promise<void> {
  await apel<unknown>(config, "POST", `/bordereaux/${id}/validated`);
}

// ─── Statusuri ────────────────────────────────────────────────────────────────

/**
 * Lista perechilor (id, nume) de status.
 *
 * ⚠ NU exista o lista documentata de statusuri. Specificatia da endpointul si
 * doua exemple („In hub", id 12; `status_type_id` 9 pe partida) si atat. De aceea
 * intelesul se ia din NUME, prin `src/lib/pallex/statusuri.ts`, si nu din numar —
 * numerele pot fi altele la alta instalare, iar o traducere gresita mut comenzi
 * tacut.
 */
export async function tipuriDeStatus(
  config: PallExConfig,
  asteptareMs?: number,
): Promise<TipStatus[]> {
  const { date } = await apel<unknown>(
    config, "GET", "/consignment_status_types", undefined, asteptareMs,
  );
  /*
   * ⚠ Un raspuns care NU e tablou nu se confunda cu o lista goala.
   *
   * Cronul de urmarire deosebeste „magazinul chiar n-are statusuri" de „nu am
   * putut afla" — pe al doilea nu misca nicio comanda. Intorcand `[]` pentru un
   * corp de alta forma, i-am fi spus prima varianta cand era a doua, iar el ar fi
   * inaintat memoria peste evenimente pe care nu le-a inteles niciodata.
   */
  if (!Array.isArray(date)) {
    throw eroareNesigura("Pall-Ex: lista de statusuri a venit intr-o forma neasteptata");
  }
  return date
    .map((t) => {
      const o = t as { id?: unknown; name?: unknown };
      const id = Number(o?.id);
      return Number.isInteger(id) && typeof o?.name === "string"
        ? { id, name: o.name }
        : null;
    })
    .filter((t): t is TipStatus => t !== null);
}

/**
 * Proba de conexiune pentru panoul de configurare.
 *
 * ⚠ Foloseste o CITIRE, nu o creare, si e chiar cea mai ieftina dintre ele.
 * `/consignment_status_types` nu cere niciun ID si nu depinde de datele
 * magazinului: raspunde 200 cu lista daca datele de acces sunt bune si 401 daca
 * nu. Un „testeaza conexiunea" care ar crea o partida ar produce un transport
 * real la fiecare apasare — iar butonul se apasa de zece ori pana iese
 * configurarea.
 *
 * (Documentatia sugereaza si calea „creeaza o partida marcata TEST si sterge-o
 * imediat". NU o folosim aici: intre creare si stergere e o fereastra in care
 * borderoul se poate valida, si atunci partida de proba nu se mai poate sterge.)
 */
export async function probaConexiune(
  config: PallExConfig,
): Promise<{ ok: true; statusuri: number } | { ok: false; eroare: string }> {
  try {
    const tipuri = await tipuriDeStatus(config);
    return { ok: true, statusuri: tipuri.length };
  } catch (e) {
    return { ok: false, eroare: (e as Error).message };
  }
}
