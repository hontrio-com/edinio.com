import { eroareCuStatus, eroareDeTermen, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";

/**
 * Clientul Curiera.
 *
 * ═══ CE E ═══
 *
 * Curiera (Curiera Transport Solutions SRL) e un transportator romanesc care ruleaza pe
 * platforma CourierManager, sub marca lui. Documentatia e a platformei:
 * `https://app.curiera.ro/cscourier/Main?apiDocs=true` (citita pe 29.09.2026). Ea arata
 * gazda `app.couriermanager.eu`; cheia unui comerciant Curiera merge pe amandoua (masurat),
 * dar gazda CURIERA e cea care ii apartine, deci numai ea se foloseste.
 *
 * Punctele de ridicare sunt reteaua FAN (3.229 de lockere „FANbox", 938 pudo, 87 de oficii),
 * dar id-urile sunt ale LOR, nu ale FAN, si nu se amesteca cu punctele FAN Courier.
 *
 * ═══ ⚠ CE NU SPUNE DOCUMENTATIA, MASURAT PE CONTUL DE TEST (29.09.2026) ═══
 *
 * Fiecare rand de mai jos a costat o expediere de proba (toate anulate dupa aceea):
 *
 *   1. ⚠⚠ O EXPEDIERE GRESITA NU E REFUZATA. Cu serviciu inexistent sau fara telefon,
 *      `create_shipment` raspunde `status: "done"`, „AWB was created", cu un NUMAR, si pune
 *      expedierea in `initial` (ciorna) cu motivele in `data.errors`: „Serviciul este
 *      incorect", „Lipseste orasul expeditorului", „Telefonul destinatarului este
 *      obligatoriu". Citit dupa `status`, comerciantul ar primi un AWB care nu pleaca
 *      niciodata. Vezi `creeazaExpedierea`.
 *   2. ⚠⚠ DIACRITICELE SE STRICA pe eticheta: „ș"/„ț" (cu virgula) ajung „?", iar „â"/„î"
 *      ajung caracterul de inlocuire. Doar cele cu sedila si „ă" trec. Deci TOT textul pleaca
 *      in ASCII. Vezi `expediere.ts`.
 *   3. Plicul NU e uniform. `list_services`, `list_delivery_locations`, `list_statuses` si
 *      `get_shipments` intorc LISTE BRUTE; `cancel` raspunde „forbidden" ca TEXT; `print` raspunde „Not found:..." ca
 *      text, cu antet `application/json`; `get_statuses` (documentat) raspunde CORP GOL.
 *   4. O cheie gresita sau lipsa raspunde HTTP 200 cu `{status: "failed", error: "BAD_LOGIN"}`.
 *      O proba de conexiune pe statusul HTTP ar iesi verde fara nicio credentiala.
 *   5. Un AWB necunoscut la `get_status` raspunde `status: "done"` cu campurile GOALE. Tacerea
 *      nu e o stare.
 *   6. `get_price` intoarce 0 lei pe ORICE cerere pe contul de test (chiar goala). De aceea
 *      Curiera nu coteaza live in checkout: vezi `FARA_API_DE_TARIF` si `docs/curieri/CURIERA.md`.
 *
 * ═══ VERDICTELE (registrul de operatii externe) ═══
 *
 *   `status: "failed"`         refuz DOVEDIT: platforma a citit cererea si a respins-o;
 *   `data.errors` la emitere   refuz DOVEDIT, dupa ce ciorna s-a anulat (vezi mai jos);
 *   timeout pe o scriere       NU STIM (`necunoscut`), altfel reincercarea ar face al doilea colet;
 *   corp gol / necitibil       NU STIM pe scriere, refuz pe citire.
 */

/** Gazda Curiera. Fixa: cheia nu pleaca spre nicio alta gazda, din nicio configurare. */
export const BAZA_CURIERA = "https://app.curiera.ro/cscourier/API";

/**
 * Contul platformei pe care traiesc toti comerciantii Curiera (`appcont` din `me`). Intra in
 * adresa publica de urmarire, verificata pe 29.09.2026: GET-ul cu `awbno` arata istoricul.
 */
const APPCONT_CURIERA = "4416";

/** Citirile: nomenclatoare, stari, eticheta. */
export const ASTEPTARE_MS = 20_000;
/** Emiterea si anularea isi permit mai mult: sunt pornite de comerciant, nu de cumparator. */
export const ASTEPTARE_EMITERE_MS = 45_000;

// ─── Configurarea ─────────────────────────────────────────────────────────────

/**
 * Adresa de ridicare. Obligatorie: fara ea Curiera pune expedierea in ciorna cu „Lipseste
 * orasul expeditorului" / „Numarul de telefon al expeditorului este obligatoriu" (masurat).
 */
export type ExpeditorCuriera = {
  nume?: string;
  persoana_contact?: string;
  telefon?: string;
  email?: string;
  /** Strada, numarul si restul, intr-o singura linie (`from_address`). */
  adresa?: string;
  oras?: string;
  judet?: string;
  cod_postal?: string;
};

/** Ce accepta `print` la ei: `a4|a6`. ⚠ `a5` e ignorat TACUT si iese A6 (masurat 29.09.2026). */
export type FormatCuriera = "a4" | "a6";

/** Marimea aleasa in configurare. `a5` o face Edinio din eticheta A6 (`eticheta-a5.ts`). */
export type DimensiuneEticheta = FormatCuriera | "a5";

export type CurieraConfig = {
  enabled: boolean;
  /** Cheia API din contul Curiera. Criptata in repaus, write-only in formular. */
  api_key: string;
  expeditor?: ExpeditorCuriera;
  /**
   * Serviciul pentru livrarea la adresa, din `list_services?type=main` al contului.
   * Necompletat = „standard". ⚠ Un serviciu gresit NU e refuzat de ei: expedierea ramane
   * ciorna (vezi antetul). De aceea formularul il alege dintr-o lista citita de la ei.
   */
  serviciu_adresa?: string;
  /** Serviciul pentru livrarea la punct. Necompletat = „lockere". */
  serviciu_punct?: string;
  /** Se ofera in checkout livrarea la locker / punct de ridicare. */
  lockere?: boolean;
  /**
   * Serviciile extra puse implicit pe fiecare AWB (id-uri din `list_services?type=extra`,
   * de ex. „443" = deschidere colet la livrare). Se platesc per colet, deci pornesc stinse.
   */
  servicii_extra?: string[];
  /** Se declara valoarea comenzii ca asigurare (`insurance`). Stins, nu se trimite nimic. */
  asigurare?: boolean;
  /** Marimea etichetei PDF. Necompletat = A6, implicitul lor. A5 = A6 marita de noi. */
  dimensiune_eticheta?: DimensiuneEticheta;
  /** Continutul scris pe eticheta cand comanda nu da unul mai bun. */
  continut_implicit?: string;
};

export const SERVICIU_ADRESA_IMPLICIT = "standard";
export const SERVICIU_PUNCT_IMPLICIT = "lockere";

/**
 * Aceeasi regula de „configurat" peste tot: hub, Setari, pagina comenzii, checkout, lot, cron.
 *
 * ⚠ Cere si adresa de ridicare, desi nu e credentiala: fara ea FIECARE emitere ar iesi
 * ciorna refuzata, iar checkoutul ar vinde o livrare care nu poate produce niciun AWB.
 */
export function curieraGata(c: CurieraConfig | null | undefined): c is CurieraConfig {
  const e = c?.expeditor;
  return !!(
    c?.enabled
    && (c.api_key ?? "").trim()
    && (e?.nume ?? "").trim()
    && (e?.telefon ?? "").trim()
    && (e?.adresa ?? "").trim()
    && (e?.oras ?? "").trim()
    && (e?.judet ?? "").trim()
  );
}

export function serviciuAdresa(c: Pick<CurieraConfig, "serviciu_adresa">): string {
  return (c.serviciu_adresa ?? "").trim() || SERVICIU_ADRESA_IMPLICIT;
}

export function serviciuPunct(c: Pick<CurieraConfig, "serviciu_punct">): string {
  return (c.serviciu_punct ?? "").trim() || SERVICIU_PUNCT_IMPLICIT;
}

/** Pagina publica de urmarire a unui AWB (cea pe care o deschide si site-ul lor). */
export function adresaUrmarireCuriera(awb: string): string {
  return `https://app.curiera.ro/cscourier/Main?tracking=true&appcont=${APPCONT_CURIERA}`
    + `&awbno=${encodeURIComponent(awb.trim())}`;
}

// ─── Felul erorii (pentru galetile cronului si pentru mesaje) ─────────────────

/**
 * De ce a cazut un apel, pastrat PE eroare.
 *
 *   `autentificare`  BAD_LOGIN: cheia e gresita sau revocata. Singura cauza la care sfatul
 *                    corect e „verifica cheia".
 *   `indisponibil`   retea, timeout, 5xx, corp gol sau necitibil. Sfatul e „nu schimba cheia".
 *   `refuz`          au citit cererea si au spus nu, cu un motiv.
 */
export type FelEroareCuriera = "autentificare" | "indisponibil" | "refuz";

const CHEIE_FEL = "felCuriera" as const;

function cuFel(e: Error, fel: FelEroareCuriera): Error {
  (e as Error & { [CHEIE_FEL]?: FelEroareCuriera })[CHEIE_FEL] = fel;
  return e;
}

export function felulEroriiCuriera(e: unknown): FelEroareCuriera {
  const v = (e as { [CHEIE_FEL]?: unknown } | null)?.[CHEIE_FEL];
  return v === "autentificare" || v === "refuz" ? v : "indisponibil";
}

// ─── Cererea ──────────────────────────────────────────────────────────────────

type FelCerere = "citire" | "scriere";

type RaspunsBrut = { status: number; tip: string; octeti: Buffer; text: string };

/**
 * Un apel catre Curiera: POST form-urlencoded, cheia in ANTET.
 *
 * ⚠ Cheia NU pleaca in adresa, desi documentatia arata GET cu `?api_key=`: adresele ajung in
 * jurnale (ale noastre, ale Vercel, ale lor). In antet merge (masurat).
 *
 * ⚠ `redirect: "manual"`: un 3xx urmat ar retrimite corpul (si antetul) mai departe, iar
 * `fetch` ar intoarce pagina de la capat drept raspuns.
 */
async function cerere(
  config: Pick<CurieraConfig, "api_key">,
  operatie: string,
  parametri: Record<string, string>,
  fel: FelCerere,
  asteptareMs: number,
): Promise<RaspunsBrut> {
  const cheie = (config.api_key ?? "").trim();
  if (!cheie) {
    throw cuFel(eroareRefuz("Curiera: lipseste cheia API. Completeaz-o in configurare."), "autentificare");
  }

  let res: Response;
  try {
    res = await fetch(`${BAZA_CURIERA}/${operatie}`, {
      method: "POST",
      headers: {
        api_key: cheie,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json, application/pdf, */*",
      },
      body: new URLSearchParams(parametri).toString(),
      signal: AbortSignal.timeout(asteptareMs),
      cache: "no-store",
      redirect: "manual",
    });
  } catch (e) {
    const termen = eroareDeTermen(e, fel === "scriere", operatie, "Curiera");
    if (termen !== e) throw cuFel(termen, "indisponibil");
    const mesaj = `Curiera ${operatie}: ${(e as Error).message}`;
    /* Pe o citire nimic nu s-a creat; pe o scriere cererea poate sa fi ajuns. */
    throw cuFel(fel === "scriere" ? eroareNesigura(mesaj) : eroareRefuz(mesaj), "indisponibil");
  }

  if (res.status >= 300 && res.status < 400) {
    const mesaj = `Curiera ${operatie}: cererea a fost redirectata (${res.status}).`;
    throw cuFel(
      fel === "scriere"
        ? eroareNesigura(`${mesaj} Verifica in contul Curiera inainte de a reincerca.`)
        : eroareRefuz(mesaj),
      "indisponibil",
    );
  }

  const octeti = Buffer.from(await res.arrayBuffer());
  const text = octeti.toString("utf8");

  if (!res.ok) {
    throw cuFel(
      eroareCuStatus(`Curiera ${operatie}: ${res.status} ${text.trim().slice(0, 200)}`, res.status),
      res.status >= 500 || res.status === 408 ? "indisponibil" : "refuz",
    );
  }

  return { status: res.status, tip: res.headers.get("content-type") ?? "", octeti, text };
}

type Plic = { status?: unknown; data?: unknown; error?: unknown; message?: unknown };

function citesteJson(text: string): unknown {
  if (!text.trim()) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

function ePlic(v: unknown): v is Plic {
  return !!v && typeof v === "object" && !Array.isArray(v) && "status" in (v as object);
}

/**
 * Refuzul din plic, ca eroare cu verdictul potrivit.
 *
 * ⚠ BAD_LOGIN se marcheaza separat: e singurul refuz la care comerciantul trebuie sa umble la
 * cheie. O alarma care spune „verifica cheia" pe un timeout il trimite sa strice o cheie buna.
 */
function refuzDinPlic(operatie: string, p: Plic): Error {
  const cod = typeof p.error === "string" ? p.error : "";
  const mesaj = typeof p.message === "string" && p.message.trim() ? p.message.trim() : cod || "refuzat";
  if (cod === "BAD_LOGIN") {
    return cuFel(
      eroareRefuz("Curiera a respins cheia API. Verifica cheia din configurarea Curiera."),
      "autentificare",
    );
  }
  return cuFel(eroareRefuz(`Curiera ${operatie}: ${mesaj}${cod && cod !== mesaj ? ` (${cod})` : ""}`), "refuz");
}

/**
 * Apelul care trebuie sa intoarca plicul lor `{status, data, message}`.
 *
 * ⚠ Un corp gol sau necitibil NU e succes: pe scriere e `necunoscut` (coletul poate exista), pe
 * citire e refuz (nimic nu s-a creat). `get_statuses`, documentat, raspunde exact asa.
 */
async function apelPlic(
  config: Pick<CurieraConfig, "api_key">,
  operatie: string,
  parametri: Record<string, string>,
  fel: FelCerere,
  asteptareMs: number,
): Promise<unknown> {
  const r = await cerere(config, operatie, parametri, fel, asteptareMs);
  const json = citesteJson(r.text);
  if (!ePlic(json)) {
    const mesaj = `Curiera ${operatie}: raspuns necitibil (${r.text.trim().slice(0, 120) || "gol"}).`;
    throw cuFel(fel === "scriere" ? eroareNesigura(mesaj) : eroareRefuz(mesaj), "indisponibil");
  }
  if (json.status !== "done") throw refuzDinPlic(operatie, json);
  return json.data;
}

/**
 * Apelul care intoarce o LISTA BRUTA la reusita si plicul `failed` la refuz (masurat pe
 * `list_services`, `list_delivery_locations`, `list_statuses`).
 */
async function apelLista(
  config: Pick<CurieraConfig, "api_key">,
  operatie: string,
  parametri: Record<string, string>,
): Promise<unknown[]> {
  const r = await cerere(config, operatie, parametri, "citire", ASTEPTARE_MS);
  const json = citesteJson(r.text);
  if (Array.isArray(json)) return json;
  if (ePlic(json)) {
    if (json.status !== "done") throw refuzDinPlic(operatie, json);
    if (Array.isArray(json.data)) return json.data;
  }
  throw cuFel(
    eroareRefuz(`Curiera ${operatie}: raspuns necitibil (${r.text.trim().slice(0, 120) || "gol"}).`),
    "indisponibil",
  );
}

function sir(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

// ─── Proba de conexiune si nomenclatoarele ────────────────────────────────────

export type ServiciuCuriera = { id: string; nume: string };

/**
 * Cat poate anula cheia asta, din harta de drepturi a lui `me`.
 *
 * ⚠ Cheia de CLIENT primita la proba are doar `cancel_uncollected`: anuleaza numai pana la
 * ridicare. Dupa ridicare anularea e refuzata MEREU, si comerciantul trebuie sa stie asta
 * inainte, nu la primul colet pe care vrea sa-l opreasca.
 */
export type DreptAnulare = "oricand" | "pana_la_ridicare" | "niciodata" | "necunoscut";

export type RezultatProbaCuriera = {
  firma: string;
  cont: string;
  /** Firma-client careia ii apartine cheia (de pe factura lor). Gol daca `me` n-a raspuns. */
  client: string;
  /** `false` = cheie de angajat/curier, nu de client: `create_shipment` ar cere `client`. */
  cheieDeClient: boolean | null;
  anulare: DreptAnulare;
  servicii: ServiciuCuriera[];
  extra: ServiciuCuriera[];
  /**
   * S-au putut CITI listele? O lista picata nu e o lista goala: „contul nu are servicii extra"
   * spus despre o cerere expirata ar fi o afirmatie falsa despre contul omului.
   */
  serviciiCitite: boolean;
  extraCitite: boolean;
};

function dreptulDeAnulare(permisiuni: unknown): DreptAnulare {
  const awbs = (permisiuni as Record<string, unknown> | null)?.awbs as Record<string, unknown> | undefined;
  if (!awbs || typeof awbs !== "object") return "necunoscut";
  const are = (drept: string) => (awbs[drept] as { allowed?: unknown } | undefined)?.allowed === true;
  if (are("cancel")) return "oricand";
  if (are("cancel_uncollected")) return "pana_la_ridicare";
  return "niciodata";
}

/**
 * Proba de conexiune: `test_connection` (AUTENTIFICAT: fara cheie raspunde BAD_LOGIN, masurat),
 * apoi, ca informatie, `me` si cele doua liste de servicii. Toate sunt citiri pure.
 *
 * ⚠ Numai `test_connection` hotaraste. O cadere a lui `me` sau a listelor nu face proba rosie:
 * ele doar umplu formularul, iar un serviciu scris de mana ramane posibil.
 */
export async function probaConexiuneCuriera(config: Pick<CurieraConfig, "api_key">): Promise<RezultatProbaCuriera> {
  const date = await apelPlic(config, "test_connection", {}, "citire", ASTEPTARE_MS) as Record<string, unknown> | null;

  const [eu, servicii, extra] = await Promise.all([
    apelPlic(config, "me", {}, "citire", ASTEPTARE_MS).catch(() => null) as Promise<Record<string, unknown> | null>,
    serviciiCuriera(config, "main").catch(() => null),
    serviciiCuriera(config, "extra").catch(() => null),
  ]);

  return {
    firma: sir(date?.usercompany_name),
    cont: sir(date?.account_name),
    client: sir(eu?.client_name),
    cheieDeClient: eu ? !!sir(eu.client_id) : null,
    anulare: eu ? dreptulDeAnulare(eu.permissions) : "necunoscut",
    servicii: servicii ?? [],
    extra: extra ?? [],
    serviciiCitite: servicii !== null,
    extraCitite: extra !== null,
  };
}

/**
 * Serviciile contului. `main` intoarce `{name, value}` (valoarea merge in `service_type`),
 * `extra` intoarce `{name, id}` (id-ul merge in `service_<id>=true`). Masurat pe 29.09.2026.
 */
export async function serviciiCuriera(
  config: Pick<CurieraConfig, "api_key">,
  tip: "main" | "extra",
): Promise<ServiciuCuriera[]> {
  const lista = await apelLista(config, "list_services", { type: tip });
  const iesire: ServiciuCuriera[] = [];
  for (const brut of lista) {
    const r = brut as Record<string, unknown> | null;
    const id = sir(tip === "main" ? r?.value : r?.id);
    if (!id) continue;
    iesire.push({ id, nume: sir(r?.name) || id });
  }
  return iesire;
}

/** Punctele de ridicare, BRUTE (~2,2 MB). Se normalizeaza in `puncte.ts`, inainte de cache. */
export async function puncteCuriera(config: Pick<CurieraConfig, "api_key">): Promise<unknown[]> {
  return apelLista(config, "list_delivery_locations", { country: "RO" });
}

// ─── Emiterea ─────────────────────────────────────────────────────────────────

export type ExpediereCreata = {
  awb: string;
  /** Starea in care a intrat (`neridicat` de obicei; `initial` pe conturile setate asa). */
  stare: string;
  /** Pretul fara TVA si cu TVA, asa cum le intoarce `create_shipment`. */
  pret: number | null;
  pretCuTva: number | null;
  /** Numerele grupului, la mai multe colete (`XXX`, `XXX/2`, ...). */
  numere: string[];
};

/** Motivele din `data.errors`, cate unul pe rand (ei le despart cu `\n`). */
export function motiveleCiornei(erori: unknown): string[] {
  return sir(erori).split(/\r?\n/).map((m) => m.trim()).filter(Boolean);
}

function numar(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * `create_shipment`.
 *
 * ═══ ⚠⚠ „AWB WAS CREATED" NU INSEAMNA CA PLEACA ═══
 *
 * Masurat pe 29.09.2026: cu un serviciu inexistent si fara adresa de ridicare, raspunsul a fost
 * `status: "done"`, numar de AWB, stare `initial` si, in `data.errors`, sapte motive. O astfel de
 * expediere nu e gata de ridicare si nu va fi ridicata niciodata.
 *
 * Deci `data.errors` nevid = REFUZ. Iar ciorna se ANULEAZA pe loc (`change_status` cu `anulat`,
 * singura cale: `cancel` raspunde „forbidden" pe o ciorna, masurat), ca sa nu ramana in contul
 * comerciantului un numar pe care nimeni nu-l poarta. Anularea ciornei e cu buna-credinta: daca
 * pica, refuzul ramane refuz (ciorna nu se ridica), doar ca mesajul o spune.
 *
 * ⚠ Starea `initial` SINGURA nu e refuz: contul se poate seta sa porneasca expedierile API in
 * ciorna (`Initial_api_status`, documentat). Hotaraste numai lista de motive.
 */
export async function creeazaExpediereaCuriera(
  config: Pick<CurieraConfig, "api_key">,
  parametri: Record<string, string>,
): Promise<ExpediereCreata> {
  const date = await apelPlic(config, "create_shipment", parametri, "scriere", ASTEPTARE_EMITERE_MS) as Record<string, unknown> | null;

  const awb = sir(date?.no);
  if (!awb) {
    /* „done" fara numar: nu stim ce s-a creat. */
    throw cuFel(
      eroareNesigura("Curiera a raspuns fara numar de AWB. Verifica in contul Curiera inainte de a reincerca."),
      "indisponibil",
    );
  }

  const motive = motiveleCiornei(date?.errors);
  if (motive.length > 0) {
    /*
     * ⚠ Refuz DOVEDIT numai cand expedierea chiar e ciorna. Motivele au venit mereu cu `initial`
     * (masurat), dar nimic nu exclude motive langa o expediere `neridicat`, gata de ridicare:
     * luata drept refuz, slotul s-ar elibera, omul ar reemite si ar pleca doua colete, cu
     * rambursul cerut de doua ori. Acolo verdictul cinstit e „nu stim".
     */
    const stare = sir(date?.status).toLowerCase();
    if (!CIORNA.has(stare)) {
      throw cuFel(
        eroareNesigura(
          `Curiera a creat AWB-ul ${awb} (stare „${stare || "necunoscuta"}”), dar a trimis si motive de refuz: `
          + `${motive.join("; ")}. Verifica expedierea in contul Curiera inainte de a reincerca.`,
        ),
        "indisponibil",
      );
    }
    let anulata = false;
    try {
      await apelPlic(config, "change_status", { awbno: awb, status: "anulat" }, "scriere", ASTEPTARE_MS);
      anulata = true;
    } catch {
      anulata = false;
    }
    throw cuFel(
      eroareRefuz(
        `Curiera a respins expedierea: ${motive.join("; ")}.`
        + (anulata ? "" : ` Ciorna ${awb} a ramas in contul Curiera, nu va fi ridicata; o poti sterge de acolo.`),
      ),
      "refuz",
    );
  }

  const numere = Array.isArray(date?.all_numbers)
    ? (date.all_numbers as unknown[]).map(sir).filter(Boolean)
    : [awb];

  return {
    awb,
    stare: sir(date?.status),
    pret: numar(date?.price),
    pretCuTva: numar(date?.price_with_vat),
    numere,
  };
}

/** Data in forma LOR pentru `get_shipments` (`dd-MM-yyyy`), pe ceasul Romaniei. */
export function dataCuriera(d: Date): string {
  const parti = new Intl.DateTimeFormat("ro-RO", {
    timeZone: "Europe/Bucharest", day: "2-digit", month: "2-digit", year: "numeric",
  }).formatToParts(d);
  const v = (t: string) => parti.find((p) => p.type === t)?.value ?? "";
  return `${v("day")}-${v("month")}-${v("year")}`;
}

/** Un AWB gasit dupa referinta, cu starea lui (ca avertismentul de ciorna sa nu se piarda). */
export type AwbGasit = { awb: string; stare: string };

/**
 * AWB-urile VII create cu referinta noastra de la o data incoace (`get_shipments`).
 *
 * Singura cale prin care un raspuns pierdut la emitere se poate lamuri cu o citire: randurile
 * poarta `customer_reference` (masurat). Anulatele nu conteaza: nu poarta niciun colet.
 *
 * ⚠⚠ Nici CIORNELE REFUZATE nu conteaza: raman in lista cu starea `initial` si cu motivele in
 * `errors` (masurat pe 29.09.2026, randul EDN-TEST-ERR1). O astfel de ciorna nu va fi ridicata
 * niciodata; luata drept „expedierea care s-a creat", ar fi legat de comanda un AWB mort, raportat
 * ca reusita. Ciornele FARA motive raman: sunt ale conturilor care pornesc expedierile in ciorna.
 */
export async function cautaDupaReferintaCuriera(
  config: Pick<CurieraConfig, "api_key">,
  referinta: string,
  deLa: Date,
): Promise<AwbGasit[]> {
  /* ⚠ LISTA BRUTA, fara plic, ca list_* (masurat pe 29.09.2026). */
  const date = await apelLista(config, "get_shipments", { from_date: dataCuriera(deLa) });
  const gasite = new Map<string, AwbGasit>();
  for (const brut of date) {
    const r = brut as Record<string, unknown> | null;
    if (sir(r?.customer_reference) !== referinta) continue;
    const no = sir(r?.no);
    /* Membrii unui grup („XXX/2") nu sunt AWB-ul comenzii; il poarta liderul. */
    if (!no || no.includes("/")) continue;
    const stare = sir(r?.status);
    if (ANULAT.has(stare.toLowerCase())) continue;
    if (motiveleCiornei(r?.errors).length > 0) continue;
    gasite.set(no, { awb: no, stare });
  }
  return [...gasite.values()];
}

// ─── Starea ───────────────────────────────────────────────────────────────────

export type StareCuriera = {
  /** Numarul CERUT (`request_no`); dupa el se potriveste raspunsul. */
  cerut: string;
  /** Numarul gasit. GOL = AWB necunoscut la ei (masurat: nu vine eroare, vin campuri goale). */
  no: string;
  status: string;
  cod: string;
  numeCod: string;
  /** Unixtime in SECUNDE; `null` daca e 0 sau lipseste. */
  data: number | null;
  locatie: string;
};

function stareDinRand(brut: unknown): StareCuriera {
  const r = brut as Record<string, unknown> | null;
  const data = numar(r?.date);
  return {
    cerut: sir(r?.request_no) || sir(r?.no),
    no: sir(r?.no),
    status: sir(r?.status),
    cod: sir(r?.code),
    numeCod: sir(r?.code_name),
    data: data && data > 0 ? data : null,
    locatie: sir(r?.location),
  };
}

/**
 * Starile mai multor AWB-uri intr-un apel: `get_status` cu `awbnos=a,b,c`.
 *
 * ⚠ NU `get_statuses`, desi e documentat anume pentru asta: raspunde HTTP 200 cu corp GOL, si pe
 * AWB-uri reale (masurat). Iar `get_status` cu `awbnos` intoarce o intrare per numar cerut, cu
 * `request_no`; 500 de numere au raspuns in jumatate de secunda.
 *
 * ⚠ Numerele pleaca in CORPUL cererii, nu in adresa (lectia adreselor lungi de la FAN).
 */
export async function stariCuriera(
  config: Pick<CurieraConfig, "api_key">,
  awburi: string[],
  asteptareMs: number = ASTEPTARE_MS,
): Promise<StareCuriera[]> {
  const curate = awburi.map((a) => a.trim()).filter(Boolean);
  if (curate.length === 0) return [];
  const date = await apelPlic(config, "get_status", { awbnos: curate.join(",") }, "citire", asteptareMs);
  /* Cu un singur numar, `data` vine OBIECT, nu lista (masurat). */
  const randuri = Array.isArray(date) ? date : date && typeof date === "object" ? [date] : null;
  if (!randuri) throw cuFel(eroareRefuz("Curiera get_status: raspuns necitibil."), "indisponibil");
  return randuri.map(stareDinRand);
}

export type EvenimentCuriera = {
  /** `ShipmentCreated`, `StatusChanged:<stare>`, `CodeChanged:<cod>`, ... */
  tip: string;
  status: string;
  cod: string;
  descriere: string;
  locatie: string;
  /** Unixtime in SECUNDE. */
  data: number | null;
};

/**
 * Istoricul unui AWB (`get_history`, forma v1). Se cere NUMAI pentru coletele a caror stare s-a
 * schimbat: lotul da doar starea curenta, iar un „avizat" urmat de „in_curs" intre doua treceri
 * s-ar pierde (lectia Postei). Forma v2, in lot, a raspuns NOT_FOUND pe AWB-uri reale.
 */
export async function istoricCuriera(
  config: Pick<CurieraConfig, "api_key">,
  awb: string,
): Promise<EvenimentCuriera[]> {
  const date = await apelPlic(config, "get_history", { awbno: awb.trim() }, "citire", ASTEPTARE_MS) as Record<string, unknown> | null;
  const istoric = Array.isArray(date?.history) ? date.history as unknown[] : null;
  if (!istoric) throw cuFel(eroareRefuz("Curiera get_history: raspuns necitibil."), "indisponibil");
  return istoric.map((brut) => {
    const r = brut as Record<string, unknown> | null;
    const data = numar(r?.event_date) ?? numar(r?.date);
    return {
      tip: sir(r?.eventType),
      status: sir(r?.status),
      cod: sir(r?.code),
      descriere: sir(r?.description),
      locatie: sir(r?.location) || sir(r?.hub_location),
      data: data && data > 0 ? data : null,
    };
  });
}

// ─── Anularea ─────────────────────────────────────────────────────────────────

export type RezultatAnulare =
  /** Anulat acum. */
  | { fel: "anulat" }
  /** Era deja anulat (din contul lor, sau o apasare anterioara al carei raspuns s-a pierdut). */
  | { fel: "deja_anulat" }
  /** Numarul nu exista in contul cheii. Nimic de oprit la ei. */
  | { fel: "negasit" }
  /** Refuz DOVEDIT: coletul e deja in drum (sau cheia n-are dreptul). `stare` e a lor. */
  | { fel: "refuzat"; stare: string };

const ANULAT = new Set(["anulat", "canceled", "cancelled"]);
const CIORNA = new Set(["initial", "draft"]);

/**
 * Anularea unui AWB.
 *
 * ⚠ `cancel` raspunde la reusita cu plicul `done`, dar la ORICE refuz cu textul „forbidden":
 * si pe un AWB deja anulat, si pe unul inexistent, si pe unul ridicat, si pe o ciorna (masurat).
 * Cuvantul nu spune CARE. Deci dupa „forbidden" se CITESTE starea, si abia ea hotaraste:
 *
 *   anulat           -> `deja_anulat` (reapasarea dupa un raspuns pierdut e reusita, nu eroare);
 *   initial (ciorna) -> `change_status anulat`, singura cale care merge pe ciorna;
 *   numar gol        -> `negasit`;
 *   orice altceva    -> `refuzat`, cu starea lor (de obicei ridicat: cheia de client anuleaza
 *                       doar pana la ridicare).
 */
export async function anuleazaExpediereaCuriera(
  config: Pick<CurieraConfig, "api_key">,
  awb: string,
): Promise<RezultatAnulare> {
  const numarAwb = awb.trim();
  const r = await cerere(config, "cancel", { awbno: numarAwb }, "scriere", ASTEPTARE_EMITERE_MS);
  const text = r.text.trim();
  const json = citesteJson(text);

  if (ePlic(json)) {
    if (json.status === "done") return { fel: "anulat" };
    if (json.error === "BAD_LOGIN") throw refuzDinPlic("cancel", json);
  } else if (text.toLowerCase() === "ok") {
    return { fel: "anulat" };
  } else if (text.toLowerCase() !== "forbidden") {
    throw cuFel(
      eroareNesigura(`Curiera cancel: raspuns necitibil (${text.slice(0, 120) || "gol"}). Verifica in contul Curiera.`),
      "indisponibil",
    );
  }

  /*
   * „forbidden" sau un plic `failed` care nu e de autentificare: se afla din stare.
   *
   * ⚠ O citire PICATA aici e „nu stim", nu refuz: altfel dezlegarea ar scoate de pe comanda un
   * AWB despre care nu stim nimic (poate viu, poate ciorna) si ar elibera slotul. Pe `necunoscut`
   * dezlegarea se opreste si numarul ramane, cum promite si ghidul.
   */
  let stari: StareCuriera[];
  try {
    stari = await stariCuriera(config, [numarAwb]);
  } catch (e) {
    throw cuFel(
      eroareNesigura(
        `Curiera a refuzat anularea AWB-ului ${numarAwb}, iar starea lui nu s-a putut citi (${(e as Error).message}). `
        + "Verifica-l in contul Curiera.",
      ),
      "indisponibil",
    );
  }
  const [stare] = stari;
  if (!stare || !stare.no) return { fel: "negasit" };
  const s = stare.status.toLowerCase();
  if (ANULAT.has(s)) return { fel: "deja_anulat" };
  if (CIORNA.has(s)) {
    await apelPlic(config, "change_status", { awbno: numarAwb, status: "anulat" }, "scriere", ASTEPTARE_EMITERE_MS);
    return { fel: "anulat" };
  }
  return { fel: "refuzat", stare: stare.status };
}

// ─── Eticheta ─────────────────────────────────────────────────────────────────

/**
 * Eticheta PDF (`print`). Se cere de fiecare data: e o citire pura, deci nu se pastreaza nicaieri
 * (nici in R2, nici in baza) un document cu datele cumparatorului.
 *
 * ⚠ Se judeca dupa OCTETI (`%PDF-`), nu dupa antet: pe un AWB anulat sau necunoscut raspunsul e
 * TEXTUL „Shipment is canceled:..." / „Not found:...", cu antetul `application/json` (masurat).
 * La mai multe colete PDF-ul cuprinde tot grupul (o pagina pe colet).
 */
export async function etichetaCuriera(
  config: Pick<CurieraConfig, "api_key">,
  awb: string,
  dimensiune: FormatCuriera = "a6",
): Promise<Buffer> {
  const r = await cerere(config, "print", { awbno: awb.trim(), type: "pdf", format: dimensiune }, "citire", ASTEPTARE_MS);
  if (r.octeti.subarray(0, 5).toString("latin1") === "%PDF-") return r.octeti;

  const json = citesteJson(r.text);
  if (ePlic(json) && json.status !== "done") throw refuzDinPlic("print", json);
  const text = r.text.trim();
  if (/^shipment is canceled/i.test(text)) {
    throw cuFel(eroareRefuz(`AWB-ul ${awb} e anulat la Curiera, deci nu mai are eticheta.`), "refuz");
  }
  if (/^not found/i.test(text)) {
    throw cuFel(eroareRefuz(`AWB-ul ${awb} nu exista in contul Curiera al acestei chei.`), "refuz");
  }
  throw cuFel(eroareRefuz(`Curiera nu a trimis o eticheta PDF (${text.slice(0, 120) || "raspuns gol"}).`), "indisponibil");
}
