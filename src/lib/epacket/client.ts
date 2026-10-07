import { eroareDeTermen, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";

/**
 * Clientul e-packet.
 *
 * ═══ CE E ═══
 *
 * e-packet (E-PACKET ON-LINE S.R.L.) e un BROKER: un singur cont si un singur credit, cu sase
 * transportatori dedesubt: DPD (`DPD`), Sameday (`SDY`), Cargus (`CGS`), FAN Courier (`FCR`),
 * Dragon Star (`DSC`) si TCE (`TCE`). Documentatia: `https://app.e-packet.ro/docs/api` si
 * specificatia OpenAPI 3.1 de langa ea, citite integral pe 07.10.2026. Copia din depozit:
 * `docs/curieri/EPACKET-openapi.json` (sha256 `7f1c3cc0...92db`). Tot ce s-a MASURAT pe fir, cu
 * cheia de test, sta in `docs/curieri/EPACKET.md`.
 *
 * ⚠ AWB-ul intors e chiar numarul CURIERULUI DE DEDESUBT (DPD `81382475619`, Sameday
 * `1ONBLN1456985`), deci urmarirea publica merge la pagina lui.
 *
 * ═══ ⚠ CE NU ARE API-UL, si conteaza pentru fiecare hotarare de mai jos ═══
 *
 *   1. NU ARE ANULARE („Anularea unui AWB nu este disponibila prin API: contactati-ne").
 *   2. NU ARE IDEMPOTENTA si NICIO CAUTARE: „Fiecare cerere POST /awb creeaza si taxeaza un AWB
 *      nou, chiar daca trimiteti aceeasi referinta". Nu exista lista de AWB-uri, deci un raspuns
 *      pierdut la emitere NU se poate lamuri cu o citire. Ramane `necunoscut`, iar registrul
 *      blocheaza reincercarea (o a doua apasare = al doilea colet TAXAT, care nu se mai anuleaza).
 *   3. Tarifele cheii de TEST nu dovedesc nimic: Sameday a cotat 3.307 lei un colet de 2 kg.
 *
 * ═══ VERDICTELE (registrul de operatii externe) ═══
 *
 * Erorile au o forma UNICA, documentata si masurata: `{error: {code, message, field?}}`.
 * Hotaraste `code`, nu doar statusul HTTP:
 *
 *   401 invalid_api_key, 403 key_inactive/account_inactive   refuz, felul `autentificare`;
 *   402 insufficient_credit                                  refuz („nimic nu este creat");
 *   404, 405, 422 (orice cod)                                refuz, inainte de curier;
 *   429 rate_limited                                         refuz („nimic nu este creat sau taxat");
 *   502 courier_refused                                      refuz: curierul a spus NU;
 *   ⚠ 502 courier_unavailable, 500, alt 5xx, timeout         pe SCRIERE: NU STIM. Curierul poate
 *                                                            sa fi creat expedierea dupa ce
 *                                                            e-packet a renuntat sa astepte.
 */

/** Gazda lor (o functie Supabase, scrisa asa in specificatie). Fixa: cheia nu pleaca altundeva. */
export const BAZA_EPACKET = "https://zbdnzolswscjoxhpsbtt.supabase.co/functions/v1/api/v1";

/** Citirile: localitati, puncte, stare, eticheta. Masurat: sub 2,5 s. */
export const ASTEPTARE_MS = 20_000;
/**
 * Cotarea a durat 1,6-3,5 s pe fir (intreaba toti curierii), iar emiterea vorbeste cu curierul
 * si comanda si ridicarea. Pornite de comerciant, nu de cumparator, deci isi permit mai mult.
 */
export const ASTEPTARE_EMITERE_MS = 45_000;

// ─── Curierii de dedesubt ──────────────────────────────────────────────────────

export const CURIERI_EPACKET = ["DPD", "SDY", "CGS", "FCR", "DSC", "TCE"] as const;
export type CurierEpacket = (typeof CURIERI_EPACKET)[number];

/** Cei care au puncte (`GET /lockers`): „Dragon Star si TCE nu au lockere". */
export const CURIERI_CU_PUNCTE = ["DPD", "SDY", "FCR", "CGS"] as const;
export type CurierCuPuncte = (typeof CURIERI_CU_PUNCTE)[number];

/** Singurii cu mediu de test: orice alt curier cu o cheie `epk_test_` da 422 `sandbox_not_supported`. */
export const CURIERI_DE_TEST: readonly CurierEpacket[] = ["DPD", "SDY"];

export const NUME_CURIER_EPACKET: Record<CurierEpacket, string> = {
  DPD: "DPD", SDY: "Sameday", CGS: "Cargus", FCR: "FAN Courier", DSC: "Dragon Star", TCE: "TCE",
};

export function eCurierEpacket(v: unknown): v is CurierEpacket {
  return typeof v === "string" && (CURIERI_EPACKET as readonly string[]).includes(v);
}

export function areCurierulPuncte(v: unknown): v is CurierCuPuncte {
  return typeof v === "string" && (CURIERI_CU_PUNCTE as readonly string[]).includes(v);
}

/** O cheie de test (`epk_test_…`): AWB-urile ei NU pleaca la nimeni si nu se taxeaza. */
export function eCheieDeTest(cheie: string | null | undefined): boolean {
  return (cheie ?? "").trim().startsWith("epk_test_");
}

// ─── Configurarea ─────────────────────────────────────────────────────────────

/**
 * Adresa de ridicare, in forma LOR: campuri separate, nu o linie.
 *
 * ⚠ Strada, numarul si codul postal sunt OBLIGATORII (422 masurat pe fiecare), iar prenumele si
 * numele au fiecare 3-25 caractere, cu cel putin o litera. `localitate_id` vine din nomenclatorul
 * lor (`GET /localities`), ales in formular, NU scris de mana.
 */
export type ExpeditorEpacket = {
  prenume?: string;
  nume?: string;
  /** Daca exista, partea e o firma (scris de ei); pe eticheta DPD apare firma in locul numelui. */
  firma?: string;
  telefon?: string;
  email?: string;
  localitate_id?: number | null;
  /** Doar pentru afisare, ca omul sa vada ce a ales (`display_name` al lor). */
  localitate_nume?: string;
  cod_postal?: string;
  strada?: string;
  numar?: string;
  bloc?: string;
  scara?: string;
  etaj?: string;
  apartament?: string;
};

/**
 * Contul in care se incaseaza rambursul. „Toate cele patru campuri sunt obligatorii impreuna",
 * iar titularul se scrie FARA diacritice (422 masurat pe „Ștefan"). Fara el nu pleaca niciun
 * AWB cu ramburs.
 */
export type RambursEpacket = {
  titular?: string;
  iban?: string;
  banca?: string;
};

export type DimensiuniEpacket = { lungime: number; latime: number; inaltime: number };

export type EpacketConfig = {
  enabled: boolean;
  /** `epk_live_…` sau `epk_test_…`. Criptata in repaus, write-only in formular. */
  api_key: string;
  expeditor?: ExpeditorEpacket;
  ramburs?: RambursEpacket;
  /** Curierul implicit pentru livrarea la adresa. Necompletat = DPD. */
  curier_adresa?: CurierEpacket;
  /** Se ofera in checkout livrarea la locker / punct. */
  lockere?: boolean;
  /** Reteaua de puncte oferita in checkout. Necompletat = Sameday (cea mai mare: 7.365). */
  curier_puncte?: CurierCuPuncte;
  /**
   * Dimensiunile unui colet, cand comanda nu le are. ⚠ La colet sunt OBLIGATORII (422 masurat:
   * „Dimensiunile sunt obligatorii, intre 1 si 300 cm"), iar produsele noastre rar le au.
   */
  dimensiuni_implicite?: DimensiuniEpacket;
  /** Se declara valoarea comenzii (`insurance`). Stins, nu se trimite nimic. */
  asigurare?: boolean;
  /** Deschiderea coletului la livrare. ⚠ La DPD numai cu ramburs; nu la locker si nu la plic. */
  deschidere_colet?: boolean;
  /** Marimea etichetei. Necompletat = A6; la FAN iese oricum A4 (scris de ei). */
  dimensiune_eticheta?: "A4" | "A6";
  /** Continutul de pe eticheta (max. 50) cand comanda nu da unul mai bun. */
  continut_implicit?: string;
};

export const CURIER_ADRESA_IMPLICIT: CurierEpacket = "DPD";
export const CURIER_PUNCTE_IMPLICIT: CurierCuPuncte = "SDY";
export const DIMENSIUNI_IMPLICITE: DimensiuniEpacket = { lungime: 30, latime: 20, inaltime: 10 };

export function curierAdresa(c: Pick<EpacketConfig, "curier_adresa"> | null | undefined): CurierEpacket {
  return eCurierEpacket(c?.curier_adresa) ? c!.curier_adresa! : CURIER_ADRESA_IMPLICIT;
}

export function curierPuncte(c: Pick<EpacketConfig, "curier_puncte"> | null | undefined): CurierCuPuncte {
  return areCurierulPuncte(c?.curier_puncte) ? c!.curier_puncte! : CURIER_PUNCTE_IMPLICIT;
}

/** Numele si prenumele, dupa regula LOR: 3-25 caractere, cel putin o litera. */
export function numeBun(v: string | null | undefined): boolean {
  const s = (v ?? "").trim();
  return s.length >= 3 && s.length <= 25 && /\p{L}/u.test(s);
}

/**
 * Aceeasi regula de „configurat" peste tot: hub, Setari, pagina comenzii, checkout, lot, cron.
 *
 * ⚠ Cere si adresa de ridicare intreaga, desi nu e credentiala: fara ea FIECARE emitere ar fi
 * refuzata cu 422, iar checkoutul ar vinde o livrare care nu poate produce niciun AWB.
 */
export function epacketGata(c: EpacketConfig | null | undefined): c is EpacketConfig {
  const e = c?.expeditor;
  return !!(
    c?.enabled
    && (c.api_key ?? "").trim()
    && numeBun(e?.prenume)
    && numeBun(e?.nume)
    && (e?.telefon ?? "").trim()
    && (e?.email ?? "").trim()
    && Number.isInteger(e?.localitate_id) && (e?.localitate_id ?? 0) > 0
    && /^\d{6}$/.test((e?.cod_postal ?? "").trim())
    && (e?.strada ?? "").trim()
    && (e?.numar ?? "").trim()
  );
}

// ─── Felul erorii (pentru galetile cronului si pentru mesaje) ─────────────────

/**
 * De ce a cazut un apel, pastrat PE eroare.
 *
 *   `autentificare`  cheie lipsa, gresita, dezactivata, sau cont inactiv. Singura cauza la care
 *                    sfatul corect e „verifica cheia".
 *   `credit`         sub 20 lei (doar cheile live). Sfatul e „alimenteaza creditul".
 *   `indisponibil`   retea, timeout, 5xx, 429, corp necitibil. Sfatul e „nu schimba cheia".
 *   `refuz`          au citit cererea si au spus nu, cu un motiv.
 */
export type FelEroareEpacket = "autentificare" | "credit" | "indisponibil" | "refuz";

const CHEIE_FEL = "felEpacket" as const;
const CHEIE_CAMP = "campEpacket" as const;
const CHEIE_COD = "codEpacket" as const;

function cuFel(e: Error, fel: FelEroareEpacket, camp?: string, cod?: string): Error {
  const x = e as Error & { [CHEIE_FEL]?: FelEroareEpacket; [CHEIE_CAMP]?: string; [CHEIE_COD]?: string };
  x[CHEIE_FEL] = fel;
  if (camp) x[CHEIE_CAMP] = camp;
  if (cod) x[CHEIE_COD] = cod;
  return e;
}

export function felulEroriiEpacket(e: unknown): FelEroareEpacket {
  const v = (e as { [CHEIE_FEL]?: unknown } | null)?.[CHEIE_FEL];
  return v === "autentificare" || v === "credit" || v === "refuz" ? v : "indisponibil";
}

/** Campul vizat de un 422 (`recipient.postcode`), daca l-au spus. */
export function campulEroriiEpacket(e: unknown): string | null {
  const v = (e as { [CHEIE_CAMP]?: unknown } | null)?.[CHEIE_CAMP];
  return typeof v === "string" && v ? v : null;
}

/** Codul lor stabil (`invalid_field`, `courier_refused`...), daca a venit. */
export function codulEroriiEpacket(e: unknown): string | null {
  const v = (e as { [CHEIE_COD]?: unknown } | null)?.[CHEIE_COD];
  return typeof v === "string" && v ? v : null;
}

// ─── Cererea ──────────────────────────────────────────────────────────────────

type FelCerere = "citire" | "scriere";

type RaspunsBrut = { status: number; tip: string; antete: Headers; octeti: Buffer; text: string };

function citesteJson(text: string): unknown {
  if (!text.trim()) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

function sir(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function numar(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Sfatul de la DPD pentru refuzul fara motiv (`courier_refused` are un mesaj GENERIC). Masurat pe
 * 07.10.2026: DPD refuza un cod postal care nu e al localitatii, iar Sameday accepta chiar
 * `000000`. Deci la refuzul curierului, codul postal e primul lucru de privit.
 */
const SFAT_REFUZ_CURIER =
  " Cel mai des e codul postal: DPD refuza un cod care nu e al localitatii destinatarului.";

/**
 * Eroarea din plicul lor, cu verdictul potrivit felului cererii. Exportata pentru probe.
 *
 * ⚠ Pe o SCRIERE, numai refuzurile spuse anume sunt dovedite (`esuat`). Orice alt raspuns de
 * eroare dupa ce cererea a plecat poate ascunde un AWB creat la curier.
 */
export function eroareDinRaspuns(status: number, corp: unknown, fel: FelCerere, operatie: string): Error {
  const err = (corp as { error?: { code?: unknown; message?: unknown; field?: unknown } } | null)?.error;
  const cod = sir(err?.code);
  const camp = sir(err?.field);
  const mesajLor = sir(err?.message);
  const text = mesajLor || (cod ? cod : `HTTP ${status}`);

  if (status === 401 || cod === "invalid_api_key" || cod === "key_inactive" || cod === "account_inactive") {
    const motiv = cod === "key_inactive"
      ? "Cheia API a fost dezactivata la e-packet."
      : cod === "account_inactive"
        ? "Contul e-packet nu este activ."
        : "e-packet a respins cheia API.";
    return cuFel(eroareRefuz(`${motiv} Verifica cheia din configurarea e-packet.`), "autentificare", camp, cod);
  }
  if (status === 402 || cod === "insufficient_credit") {
    return cuFel(
      eroareRefuz(`Credit e-packet insuficient: ${text} Alimenteaza creditul din aplicatia e-packet si incearca din nou.`),
      "credit", camp, cod,
    );
  }
  if (status === 429 || cod === "rate_limited") {
    /* „Peste limita primiti 429; nimic nu este creat sau taxat" (documentat). */
    return cuFel(eroareRefuz(`e-packet: prea multe cereri intr-un minut (${text}). Incearca din nou peste un minut.`), "indisponibil", camp, cod);
  }
  if (cod === "courier_refused") {
    return cuFel(eroareRefuz(`Curierul a refuzat expedierea (e-packet: ${text}).${SFAT_REFUZ_CURIER}`), "refuz", camp, cod);
  }
  if (status >= 400 && status < 500 && status !== 408) {
    return cuFel(eroareRefuz(`e-packet ${operatie}: ${text}${camp ? ` (${camp})` : ""}`), "refuz", camp, cod);
  }
  /* 5xx, 408, `courier_unavailable`, `internal_error`. */
  const mesaj = `e-packet ${operatie}: ${text}`;
  return cuFel(
    fel === "scriere"
      ? eroareNesigura(`${mesaj}. AWB-ul poate sa fi fost creat la curier: verifica in aplicatia e-packet inainte de a reincerca.`)
      : eroareRefuz(mesaj),
    "indisponibil", camp, cod,
  );
}

/**
 * Un apel catre e-packet. Cheia pleaca in antet (`Authorization: Bearer`), niciodata in adresa.
 *
 * ⚠ `redirect: "manual"`: un 3xx urmat ar retrimite corpul (si cheia) mai departe, iar `fetch`
 * ar intoarce pagina de la capat drept raspuns.
 */
async function cerere(
  config: Pick<EpacketConfig, "api_key">,
  metoda: "GET" | "POST",
  cale: string,
  corp: unknown,
  fel: FelCerere,
  asteptareMs: number,
  operatie: string,
): Promise<RaspunsBrut> {
  const cheie = (config.api_key ?? "").trim();
  if (!cheie) {
    throw cuFel(eroareRefuz("e-packet: lipseste cheia API. Completeaz-o in configurare."), "autentificare");
  }

  let res: Response;
  try {
    res = await fetch(`${BAZA_EPACKET}${cale}`, {
      method: metoda,
      headers: {
        Authorization: `Bearer ${cheie}`,
        Accept: "application/json, application/pdf",
        ...(corp !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(corp !== undefined ? { body: JSON.stringify(corp) } : {}),
      signal: AbortSignal.timeout(asteptareMs),
      cache: "no-store",
      redirect: "manual",
    });
  } catch (e) {
    const termen = eroareDeTermen(e, fel === "scriere", operatie, "e-packet");
    if (termen !== e) throw cuFel(termen, "indisponibil");
    const mesaj = `e-packet ${operatie}: ${(e as Error).message}`;
    /* Pe o citire nimic nu s-a creat; pe o scriere cererea poate sa fi ajuns. */
    throw cuFel(
      fel === "scriere"
        ? eroareNesigura(`${mesaj}. Verifica in aplicatia e-packet inainte de a reincerca.`)
        : eroareRefuz(mesaj),
      "indisponibil",
    );
  }

  if (res.status >= 300 && res.status < 400) {
    const mesaj = `e-packet ${operatie}: cererea a fost redirectata (${res.status}).`;
    throw cuFel(
      fel === "scriere"
        ? eroareNesigura(`${mesaj} Verifica in aplicatia e-packet inainte de a reincerca.`)
        : eroareRefuz(mesaj),
      "indisponibil",
    );
  }

  const octeti = Buffer.from(await res.arrayBuffer());
  const text = octeti.toString("utf8");
  if (!res.ok) throw eroareDinRaspuns(res.status, citesteJson(text), fel, operatie);
  return { status: res.status, tip: res.headers.get("content-type") ?? "", antete: res.headers, octeti, text };
}

/** Raspunsul JSON al unei reusite. Un corp necitibil NU e succes (pe scriere: nu stim). */
async function apelJson(
  config: Pick<EpacketConfig, "api_key">,
  metoda: "GET" | "POST",
  cale: string,
  corp: unknown,
  fel: FelCerere,
  asteptareMs: number,
  operatie: string,
): Promise<Record<string, unknown>> {
  const r = await cerere(config, metoda, cale, corp, fel, asteptareMs, operatie);
  const json = citesteJson(r.text);
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    const mesaj = `e-packet ${operatie}: raspuns necitibil (${r.text.trim().slice(0, 120) || "gol"}).`;
    throw cuFel(
      fel === "scriere"
        ? eroareNesigura(`${mesaj} Verifica in aplicatia e-packet inainte de a reincerca.`)
        : eroareRefuz(mesaj),
      "indisponibil",
    );
  }
  return json as Record<string, unknown>;
}

// ─── Localitatile ─────────────────────────────────────────────────────────────

/**
 * O localitate din nomenclatorul lor. Masurat pe 07.10.2026: 14.179, in 42 de judete, numele
 * FARA diacritice si scrise cand cu majuscule („CLUJ NAPOCA"), cand nu („Campia turzii"). Satele
 * poarta comuna in paranteza („Victoria (Hlipiceni)"). ⚠ Bucurestiul NU exista ca localitate:
 * sunt sase, „Sectorul 1 (Bucuresti)" ... „Sectorul 6 (Bucuresti)", id 14515-14520.
 */
export type LocalitateEpacket = { id: number; nume: string; afisare: string; judet: string };

function localitateDinRand(brut: unknown): LocalitateEpacket | null {
  const r = brut as Record<string, unknown> | null;
  const id = numar(r?.id);
  if (id === null || !Number.isInteger(id) || id <= 0) return null;
  const nume = sir(r?.name);
  return { id, nume, afisare: sir(r?.display_name) || nume, judet: sir(r?.county).toUpperCase() };
}

/**
 * `GET /localities`. ⚠ Cautarea prinde SUBSIRURI si in numele judetului: „cluj" in CJ intoarce si
 * „Agarbiciu (Cluj)". Potrivirea exacta se face la noi (`localitati.ts`), pe raspuns.
 * Un judet necunoscut da 422; cautarea sub 2 litere, la fel.
 */
export async function cautaLocalitatiEpacket(
  config: Pick<EpacketConfig, "api_key">,
  filtru: { cauta?: string; judet?: string; pagina?: number },
  asteptareMs: number = ASTEPTARE_MS,
): Promise<{ localitati: LocalitateEpacket[]; maiSunt: boolean }> {
  const p = new URLSearchParams();
  if ((filtru.cauta ?? "").trim()) p.set("search", filtru.cauta!.trim());
  if ((filtru.judet ?? "").trim()) p.set("county", filtru.judet!.trim().toUpperCase());
  if (filtru.pagina && filtru.pagina > 1) p.set("page", String(filtru.pagina));
  const date = await apelJson(config, "GET", `/localities${p.size ? `?${p}` : ""}`, undefined, "citire", asteptareMs, "localities");
  if (!Array.isArray(date.data)) throw cuFel(eroareRefuz("e-packet localities: raspuns fara lista."), "indisponibil");
  return {
    localitati: (date.data as unknown[]).map(localitateDinRand).filter((l): l is LocalitateEpacket => !!l),
    maiSunt: date.has_more === true,
  };
}

// ─── Punctele ─────────────────────────────────────────────────────────────────

/**
 * Un punct. Masurat pe 07.10.2026, toate cele patru retele: fiecare punct are localitate, cod
 * postal si coordonate. Id-ul e TEXT si poate avea litere (FANbox `F1000142`).
 *
 *   Sameday  7.365, toate `locker`;     DPD  2.524 (1.785 `office`, 739 `locker`);
 *   FAN      4.132 (3.242 `locker`, 890 `paypoint`);   Cargus  2.107 (1.939 `office`, 168 `locker`).
 */
export type PunctEpacket = {
  id: string;
  nume: string;
  tip: "locker" | "office" | "paypoint" | string;
  adresa: string;
  codPostal: string | null;
  localitateId: number | null;
  lat: number | null;
  lng: number | null;
};

function punctDinRand(brut: unknown): PunctEpacket | null {
  const r = brut as Record<string, unknown> | null;
  const id = sir(r?.id);
  if (!id) return null;
  const loc = numar(r?.locality_id);
  return {
    id,
    nume: sir(r?.name),
    tip: sir(r?.type),
    adresa: sir(r?.address),
    codPostal: sir(r?.postcode) || null,
    localitateId: loc !== null && Number.isInteger(loc) ? loc : null,
    lat: numar(r?.latitude),
    lng: numar(r?.longitude),
  };
}

/** Cate pagini se cer pentru o singura localitate. Cea mai mare (Sectorul 6, Sameday) are sub una. */
const PAGINI_PUNCTE_MAX = 3;

/**
 * Punctele unui curier intr-o localitate (`GET /lockers`). Toate paginile, pana la plafon.
 * ⚠ `DSC` si `TCE` dau 422 („nu are lockere"), deci nu se cer deloc.
 */
export async function puncteEpacket(
  config: Pick<EpacketConfig, "api_key">,
  curier: CurierCuPuncte,
  localitateId: number,
  asteptareMs: number = ASTEPTARE_MS,
): Promise<PunctEpacket[]> {
  const iesire: PunctEpacket[] = [];
  for (let pagina = 1; pagina <= PAGINI_PUNCTE_MAX; pagina++) {
    const p = new URLSearchParams({ courier: curier, locality_id: String(localitateId) });
    if (pagina > 1) p.set("page", String(pagina));
    const date = await apelJson(config, "GET", `/lockers?${p}`, undefined, "citire", asteptareMs, "lockers");
    if (!Array.isArray(date.data)) throw cuFel(eroareRefuz("e-packet lockers: raspuns fara lista."), "indisponibil");
    for (const r of date.data as unknown[]) {
      const punct = punctDinRand(r);
      if (punct) iesire.push(punct);
    }
    if (date.has_more !== true) break;
  }
  return iesire;
}

// ─── Proba de conexiune ───────────────────────────────────────────────────────

export type RezultatProbaEpacket = {
  /** `epk_test_…`: AWB-urile nu pleaca la curier, doar DPD si Sameday. */
  test: boolean;
};

/**
 * Proba de conexiune: o cautare de localitate, AUTENTIFICATA (fara cheie sau cu una gresita
 * raspunde 401 `invalid_api_key`, masurat). Citire pura: nu creeaza si nu taxeaza nimic.
 */
export async function probaConexiuneEpacket(config: Pick<EpacketConfig, "api_key">): Promise<RezultatProbaEpacket> {
  const r = await cautaLocalitatiEpacket(config, { cauta: "Cluj", judet: "CJ" });
  /* ⚠ O lista goala la „Cluj" in CJ nu e o conexiune buna: e un raspuns care nu e al lor. */
  if (r.localitati.length === 0) {
    throw cuFel(eroareRefuz("e-packet a raspuns, dar fara nicio localitate. Incearca din nou."), "indisponibil");
  }
  return { test: eCheieDeTest(config.api_key) };
}

// ─── Tarifele ─────────────────────────────────────────────────────────────────

export type TipLivrareEpacket = "D2D" | "D2L" | "L2D" | "L2L";

/** O oferta: pretul FINAL, cu TVA, adica cat se ia din credit. E o ESTIMARE (scris de ei). */
export type OfertaEpacket = {
  curier: CurierEpacket;
  tip: TipLivrareEpacket;
  disponibil: boolean;
  pret: number | null;
  motiv: string;
};

export type CerereTarif = {
  sender_locality_id: number;
  recipient_locality_id: number;
  package_type: "parcel" | "envelope";
  parcels: { weight: number; length?: number; width?: number; height?: number }[];
  delivery_type?: TipLivrareEpacket | "ALL";
  cash_on_delivery?: number;
  insurance?: number;
  open_package?: boolean;
  saturday_delivery?: boolean;
};

/**
 * `POST /quotes`. ⚠ Doua lucruri masurate care NU se vad din documentatie:
 *   - cotarea spune „disponibil" si unde emiterea refuza: DPD cu `open_package` fara ramburs a
 *     cotat 47,44 lei, iar AWB-ul identic a primit 422. Deci oferta nu e o garantie de emitere;
 *   - cheia de test coteaza absurd la Sameday (3.307 lei pe 2 kg).
 */
export async function tarifeEpacket(
  config: Pick<EpacketConfig, "api_key">,
  corp: CerereTarif,
  asteptareMs: number = ASTEPTARE_EMITERE_MS,
): Promise<OfertaEpacket[]> {
  const date = await apelJson(config, "POST", "/quotes", corp, "citire", asteptareMs, "quotes");
  if (!Array.isArray(date.quotes)) throw cuFel(eroareRefuz("e-packet quotes: raspuns fara oferte."), "indisponibil");
  const iesire: OfertaEpacket[] = [];
  for (const brut of date.quotes as unknown[]) {
    const r = brut as Record<string, unknown> | null;
    const curier = sir(r?.courier);
    const tip = sir(r?.delivery_type) as TipLivrareEpacket;
    if (!eCurierEpacket(curier) || !["D2D", "D2L", "L2D", "L2L"].includes(tip)) continue;
    const pret = numar(r?.price);
    /* ⚠ Moneda: doar RON e documentata. Alta moneda nu se aduna la lei, deci oferta nu e folosibila. */
    const leu = !r?.currency || sir(r?.currency) === "RON";
    const disponibil = r?.available === true && pret !== null && pret > 0 && leu;
    iesire.push({
      curier, tip, disponibil,
      pret: disponibil ? Math.round(pret! * 100) / 100 : null,
      motiv: disponibil ? "" : sir(r?.reason) || (leu ? "Fara tarif" : `Tarif in ${sir(r?.currency)}`),
    });
  }
  return iesire;
}

// ─── Emiterea ─────────────────────────────────────────────────────────────────

export type RidicareEpacket = {
  ceruta: boolean;
  id: string | null;
  de: string | null;
  pana: string | null;
  motiv: string;
};

export type AwbEpacket = {
  awb: string;
  curier: CurierEpacket | null;
  tip: string;
  /** Lei, cu TVA, luat din credit. `null` cu o cheie de test („nu se ia nimic"). */
  pret: number | null;
  creditRamas: number | null;
  /** Doar DPD, FAN si Dragon Star cu expeditor la adresa; altfel `null` (masurat la Sameday). */
  ridicare: RidicareEpacket | null;
};

/**
 * `POST /awb`: creeaza AWB-ul si il TAXEAZA. Nu se poate anula prin API si nu are idempotenta.
 *
 * ⚠ Un 201 fara numar e „nu stim": ceva s-a creat sau nu, dar nu avem cum sa-l legam de comanda.
 */
export async function creeazaAwbEpacket(
  config: Pick<EpacketConfig, "api_key">,
  corp: Record<string, unknown>,
): Promise<AwbEpacket> {
  const date = await apelJson(config, "POST", "/awb", corp, "scriere", ASTEPTARE_EMITERE_MS, "awb");
  const awb = sir(date.awb_number);
  if (!awb) {
    throw cuFel(
      eroareNesigura("e-packet a raspuns fara numar de AWB. Verifica in aplicatia e-packet inainte de a reincerca."),
      "indisponibil",
    );
  }
  const r = date.pickup as Record<string, unknown> | null | undefined;
  const curier = sir(date.courier);
  return {
    awb,
    curier: eCurierEpacket(curier) ? curier : null,
    tip: sir(date.delivery_type),
    pret: numar(date.price),
    creditRamas: numar(date.credit_left),
    ridicare: r && typeof r === "object"
      ? { ceruta: r.requested === true, id: sir(r.id) || null, de: sir(r.from) || null, pana: sir(r.to) || null, motiv: sir(r.reason) }
      : null,
  };
}

// ─── Starea ───────────────────────────────────────────────────────────────────

export type StareEpacket = {
  awb: string;
  curier: string;
  /** Codul lor (`in_tranzit`, `livrat`...); vezi `statusuri.ts`. */
  status: string;
  eticheta: string;
  final: boolean;
  /** Clipa starii la curier (ISO), sau `null`. */
  la: string | null;
  /** Cand a intrebat e-packet curierul (ei nu reintreaba mai des de 30 de minute). */
  verificatLa: string | null;
};

/**
 * `GET /status`, un AWB pe cerere (nu exista lot). ⚠ Un AWB necunoscut da 404 `not_found`: un
 * refuz, nu o stare. Iar o cheie de test nu vede AWB-urile live, si invers (scris de ei).
 */
export async function stareEpacket(
  config: Pick<EpacketConfig, "api_key">,
  awb: string,
  asteptareMs: number = ASTEPTARE_MS,
): Promise<StareEpacket> {
  const p = new URLSearchParams({ awb: awb.trim() });
  const date = await apelJson(config, "GET", `/status?${p}`, undefined, "citire", asteptareMs, "status");
  const status = sir(date.status);
  if (!status) throw cuFel(eroareRefuz("e-packet status: raspuns fara stare."), "indisponibil");
  return {
    awb: sir(date.awb) || awb.trim(),
    curier: sir(date.courier),
    status,
    eticheta: sir(date.label),
    final: date.is_final === true,
    la: sir(date.status_at) || null,
    verificatLa: sir(date.checked_at) || null,
  };
}

/** `not_found`: AWB-ul nu e in contul cheii (alt cont, sau o cheie de test fata de una live). */
export function eAwbNegasit(e: unknown): boolean {
  return codulEroriiEpacket(e) === "not_found";
}

// ─── Eticheta ─────────────────────────────────────────────────────────────────

/**
 * Eticheta PDF (`GET /label`). Se cere de fiecare data: citire pura, deci nu se pastreaza
 * nicaieri un document cu datele cumparatorului.
 *
 * ⚠ Se judeca dupa OCTETI (`%PDF-`), nu dupa antet. Formatul primit vine in `X-Label-Size`
 * (`A4`, `A6` sau `courier_default`): la FAN iese A4 oricum, la Dragon Star si TCE eticheta
 * curierului. Masurat: fara `size` iese A4.
 */
export async function etichetaEpacket(
  config: Pick<EpacketConfig, "api_key">,
  awb: string,
  marime: "A4" | "A6" = "A6",
): Promise<{ pdf: Buffer; marime: string }> {
  const p = new URLSearchParams({ awb: awb.trim(), size: marime });
  const r = await cerere(config, "GET", `/label?${p}`, undefined, "citire", ASTEPTARE_MS, "label");
  if (r.octeti.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw cuFel(eroareRefuz(`e-packet nu a trimis o eticheta PDF (${r.text.trim().slice(0, 120) || "raspuns gol"}).`), "indisponibil");
  }
  return { pdf: r.octeti, marime: r.antete.get("x-label-size") ?? marime };
}
