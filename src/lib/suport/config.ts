/**
 * Chatul de suport al unui magazin (`store_settings.suport_config`): Tidio, tawk.to, Intercom, Zendesk.
 *
 * ═══ CE E PUBLIC SI CE E SECRET ═══
 *
 * Fiecare furnizor da un identificator de widget, PUBLIC prin definitie: sta in pagina fiecarui vizitator
 * (cheia publica Tidio, Property ID si Widget ID la tawk.to, Workspace ID la Intercom, cheia widgetului la
 * Zendesk). Stau in `conturi`, cate o felie pe furnizor, ca omul sa poata schimba furnizorul si sa se
 * intoarca fara sa le caute din nou.
 *
 * Secretele sunt cele cu care se SEMNEAZA identitatea clientului cu cont, pe server:
 *   - `tawkto_cheie_api`: cheia „JavaScript API” a proprietatii (HMAC-SHA256);
 *   - `intercom_secret`: „Messenger API secret” (JWT HS256);
 *   - `zendesk_secret`: secretul cheii de semnare din „End user authentication” (JWT HS256). Perechea lui,
 *     `conturi.zendesk.kid`, NU e secreta: pleaca in antetul fiecarui JWT.
 * Tidio nu are semnatura.
 *
 * ⚠ Secretele stau la PRIMUL NIVEL al obiectului, nu in `conturi`: criptarea din baza lucreaza pe campuri
 * de la primul nivel (`privat.campuri_secrete`). Numele sunt IDENTICE aici, in `CAMPURI_SECRETE`
 * (`src/lib/integrari/secrete.ts`) si in migratia `2027-02-10-suport-clienti.sql`; `suport-legat.test.ts`
 * le compara.
 *
 * ═══ UN SINGUR FURNIZOR PORNIT ═══
 *
 * `furnizor` spune care dintre cele patru e ales, iar `activ` daca butonul e in magazin. Doua chaturi in
 * aceeasi pagina isi calca butoanele si ferestrele, deci nu exista stare cu doua pornite.
 *
 * ⚠ Fara `server-only`: il citesc si paginile din panou, si layoutul vitrinei, si probele.
 */

export const FURNIZORI_SUPORT = ["tidio", "tawkto", "intercom", "zendesk"] as const;
export type FurnizorSuport = (typeof FURNIZORI_SUPORT)[number];

export const REGIUNI_INTERCOM = ["us", "eu", "au"] as const;
export type RegiuneIntercom = (typeof REGIUNI_INTERCOM)[number];

export type ConturiSuport = {
  tidio?: { cheie?: string };
  tawkto?: { proprietate?: string; widget?: string };
  intercom?: { app?: string; regiune?: RegiuneIntercom };
  zendesk?: { cheie?: string; kid?: string };
};

export type AspectSuport = {
  /** Butonul magazinului (al nostru, stie de barele de jos) sau cel al furnizorului. */
  buton: "magazin" | "furnizor";
  pozitie: "dreapta" | "stanga";
  /** `apasare`: nimic de la furnizor pana la clic. `automat`: dupa acord, in timpul liber al browserului. */
  incarcare: "apasare" | "automat";
  pe_telefon: boolean;
  /** Butonul apare si pe pagina de comanda. */
  la_comanda: boolean;
  /** Textul de langa buton, pe calculator. Gol = doar butonul. */
  text: string;
};

export type DateSuport = {
  /** Numele si emailul clientului cu cont pleaca la furnizor. PORNESTE OPRIT: sunt date personale. */
  identitate: boolean;
  /** Produsul privit si valoarea cosului. Fara date personale. */
  pagina: boolean;
  /** Numarul si valoarea comenzii abia plasate. */
  comanda: boolean;
};

export type SuportConfig = {
  activ: boolean;
  furnizor: FurnizorSuport | null;
  conturi: ConturiSuport;
  aspect: AspectSuport;
  date: DateSuport;
  /** SECRET. Cheia „JavaScript API” a proprietatii tawk.to. */
  tawkto_cheie_api?: string;
  /** SECRET. „Messenger API secret” de la Intercom. */
  intercom_secret?: string;
  /** SECRET. Secretul cheii de semnare Zendesk (End user authentication). */
  zendesk_secret?: string;
  /** Cand a trecut ultima verificare a cheii publice, pe furnizor. O scrie serverul. */
  verificat_la?: Partial<Record<FurnizorSuport, string>>;
};

/** Campurile secrete. ⚠ Aceeasi lista ca in `CAMPURI_SECRETE.suport_config` si in migratie. */
export const SECRETE_SUPORT = ["tawkto_cheie_api", "intercom_secret", "zendesk_secret"] as const;
export type SecretSuport = (typeof SECRETE_SUPORT)[number];

/** Secretul cu care se semneaza identitatea la fiecare furnizor. Tidio nu are. */
export const SECRETUL_FURNIZORULUI: Record<FurnizorSuport, SecretSuport | null> = {
  tidio: null,
  tawkto: "tawkto_cheie_api",
  intercom: "intercom_secret",
  zendesk: "zendesk_secret",
};

export const ASPECT_IMPLICIT: AspectSuport = {
  buton: "magazin",
  pozitie: "dreapta",
  incarcare: "apasare",
  pe_telefon: true,
  la_comanda: true,
  text: "",
};

export const DATE_IMPLICITE: DateSuport = { identitate: false, pagina: true, comanda: true };

export const SUPORT_GOL: SuportConfig = {
  activ: false,
  furnizor: null,
  conturi: {},
  aspect: ASPECT_IMPLICIT,
  date: DATE_IMPLICITE,
};

/** Lungimea textului de langa buton: cat incape pe un rand langa un cerc de 56 px. */
export const LUNGIME_TEXT_BUTON = 32;

/* ═══ Forma identificatorilor ═══
 *
 * Ajung in adrese de script si in obiecte scrise in pagina, deci se primesc doar caractere care nu pot
 * schimba adresa si nu pot iesi dintr-un atribut. Forma exacta o judeca furnizorul (verificarea din
 * panou); aici se judeca doar ca valoarea e SIGURA de pus in pagina.
 */

/** Cheia publica Tidio: litere si cifre (la ei, 32 de caractere). */
export function cheieTidioValida(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9]{16,64}$/.test(v);
}

/** Property ID tawk.to: 24 de cifre hexa. */
export function proprietateTawkValida(v: unknown): v is string {
  return typeof v === "string" && /^[a-f0-9]{24}$/.test(v);
}

/** Widget ID tawk.to: `default` sau un sir scurt de litere si cifre. */
export function widgetTawkValid(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9]{1,32}$/.test(v);
}

/** Workspace ID (App ID) Intercom: litere mici si cifre. */
export function appIntercomValid(v: unknown): v is string {
  return typeof v === "string" && /^[a-z0-9]{4,16}$/.test(v);
}

export function regiuneIntercomValida(v: unknown): v is RegiuneIntercom {
  return typeof v === "string" && (REGIUNI_INTERCOM as readonly string[]).includes(v);
}

/** Cheia widgetului Zendesk: un UUID. */
export function cheieZendeskValida(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
}

/** Id-ul cheii de semnare Zendesk (`app_…`): pleaca in antetul JWT-ului, deci fara spatii si ghilimele. */
export function kidZendeskValid(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{4,80}$/.test(v);
}

/** Un secret: fara spatii, de o lungime rezonabila. Restul il judeca furnizorul, la prima semnatura. */
export function secretValid(v: unknown): v is string {
  return typeof v === "string" && /^\S{8,512}$/.test(v);
}

/** Valorile scrise de om se curata o singura data: spatiile de la copiere nu fac parte din cheie. */
export function curata(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Identificatorii publici ai furnizorului, gata de pus in pagina, sau `null` daca lipsesc ori nu au forma. */
export type ContPublic =
  | { furnizor: "tidio"; cheie: string }
  | { furnizor: "tawkto"; proprietate: string; widget: string }
  | { furnizor: "intercom"; app: string; regiune: RegiuneIntercom }
  | { furnizor: "zendesk"; cheie: string };

export function contPublic(furnizor: unknown, conturi: unknown): ContPublic | null {
  const c = (conturi && typeof conturi === "object" ? conturi : {}) as ConturiSuport;
  if (furnizor === "tidio") {
    const cheie = curata(c.tidio?.cheie);
    return cheieTidioValida(cheie) ? { furnizor, cheie } : null;
  }
  if (furnizor === "tawkto") {
    const proprietate = curata(c.tawkto?.proprietate);
    const widget = curata(c.tawkto?.widget);
    return proprietateTawkValida(proprietate) && widgetTawkValid(widget) ? { furnizor, proprietate, widget } : null;
  }
  if (furnizor === "intercom") {
    const app = curata(c.intercom?.app);
    const regiune = regiuneIntercomValida(c.intercom?.regiune) ? c.intercom.regiune : "us";
    return appIntercomValid(app) ? { furnizor, app, regiune } : null;
  }
  if (furnizor === "zendesk") {
    const cheie = curata(c.zendesk?.cheie).toLowerCase();
    return cheieZendeskValida(cheie) ? { furnizor, cheie } : null;
  }
  return null;
}

export function esteFurnizor(v: unknown): v is FurnizorSuport {
  return typeof v === "string" && (FURNIZORI_SUPORT as readonly string[]).includes(v);
}

function bool(v: unknown, implicit: boolean): boolean {
  return typeof v === "boolean" ? v : implicit;
}

/** Aspectul, curatat: orice valoare necunoscuta cade pe implicit. Textul e taiat si fara rand nou. */
export function aspectDin(brut: unknown): AspectSuport {
  const a = (brut && typeof brut === "object" ? brut : {}) as Partial<Record<keyof AspectSuport, unknown>>;
  const text = typeof a.text === "string" ? a.text.replace(/\s+/g, " ").trim().slice(0, LUNGIME_TEXT_BUTON) : "";
  const buton = a.buton === "furnizor" ? "furnizor" : "magazin";
  return {
    buton,
    pozitie: a.pozitie === "stanga" ? "stanga" : "dreapta",
    /* ⚠ Butonul furnizorului exista numai dupa ce scriptul lui s-a incarcat: cu „la apasare” n-ar avea
       nimeni pe ce apasa. Deci alegerea lui inseamna incarcare automata, orice ar spune campul. */
    incarcare: buton === "furnizor" || a.incarcare === "automat" ? "automat" : "apasare",
    pe_telefon: bool(a.pe_telefon, ASPECT_IMPLICIT.pe_telefon),
    la_comanda: bool(a.la_comanda, ASPECT_IMPLICIT.la_comanda),
    text,
  };
}

export function dateDin(brut: unknown): DateSuport {
  const d = (brut && typeof brut === "object" ? brut : {}) as Partial<Record<keyof DateSuport, unknown>>;
  return {
    identitate: bool(d.identitate, DATE_IMPLICITE.identitate),
    pagina: bool(d.pagina, DATE_IMPLICITE.pagina),
    comanda: bool(d.comanda, DATE_IMPLICITE.comanda),
  };
}

/**
 * Configurarea citita din baza, adusa la forma ei: campurile lipsa iau implicitul, valorile necunoscute se
 * arunca. Secretele trec neatinse (pot fi in clar, cifrate `enc.v1.…` sau goale, dupa cine a citit).
 */
export function citesteSuport(brut: unknown): SuportConfig {
  if (!brut || typeof brut !== "object") return { ...SUPORT_GOL, conturi: {} };
  const b = brut as Record<string, unknown>;
  const conturiBrute = (b.conturi && typeof b.conturi === "object" ? b.conturi : {}) as ConturiSuport;
  const conturi: ConturiSuport = {};
  if (conturiBrute.tidio && typeof conturiBrute.tidio === "object") conturi.tidio = { cheie: curata(conturiBrute.tidio.cheie) };
  if (conturiBrute.tawkto && typeof conturiBrute.tawkto === "object") {
    conturi.tawkto = { proprietate: curata(conturiBrute.tawkto.proprietate), widget: curata(conturiBrute.tawkto.widget) };
  }
  if (conturiBrute.intercom && typeof conturiBrute.intercom === "object") {
    conturi.intercom = {
      app: curata(conturiBrute.intercom.app),
      regiune: regiuneIntercomValida(conturiBrute.intercom.regiune) ? conturiBrute.intercom.regiune : "us",
    };
  }
  if (conturiBrute.zendesk && typeof conturiBrute.zendesk === "object") {
    conturi.zendesk = { cheie: curata(conturiBrute.zendesk.cheie).toLowerCase(), kid: curata(conturiBrute.zendesk.kid) };
  }

  const verificat: Partial<Record<FurnizorSuport, string>> = {};
  if (b.verificat_la && typeof b.verificat_la === "object") {
    for (const f of FURNIZORI_SUPORT) {
      const v = (b.verificat_la as Record<string, unknown>)[f];
      if (typeof v === "string" && v) verificat[f] = v;
    }
  }

  const iesire: SuportConfig = {
    activ: b.activ === true,
    furnizor: esteFurnizor(b.furnizor) ? b.furnizor : null,
    conturi,
    aspect: aspectDin(b.aspect),
    date: dateDin(b.date),
    verificat_la: verificat,
  };
  for (const s of SECRETE_SUPORT) {
    const v = b[s];
    if (typeof v === "string" && v) iesire[s] = v;
  }
  return iesire;
}

/**
 * Chatul e in magazin: pornit, cu un furnizor ales si cu identificatorii lui in forma buna. O SINGURA
 * regula, folosita de cardul din Integrari, de pagina furnizorului si de vitrina.
 */
export function suportGata(c: unknown): boolean {
  if (!c || typeof c !== "object") return false;
  const s = c as Partial<SuportConfig>;
  return s.activ === true && contPublic(s.furnizor, s.conturi) !== null;
}

/** Furnizorul pornit, sau `null`. Pentru cardurile din Integrari („Activ” pe unul singur). */
export function furnizorPornit(c: unknown): FurnizorSuport | null {
  if (!suportGata(c)) return null;
  return (c as SuportConfig).furnizor;
}

/* ═══ Ce stie vitrina ═══ */

/** Campurile aduse in antetul magazinului, prin cale JSON (`sp_*` in `incarcaAntetMagazin`). */
export type SetariSuportBrute = {
  sp_activ?: unknown;
  sp_furnizor?: unknown;
  sp_conturi?: unknown;
  sp_aspect?: unknown;
  sp_date?: unknown;
};

/** Ce primeste butonul din vitrina: NUMAI identificatorii publici ai furnizorului pornit si setarile. */
export type VitrinaSuport = {
  cont: ContPublic;
  aspect: AspectSuport;
  date: DateSuport;
};

/**
 * Starea chatului pentru vitrina, sau `null` cand butonul nu are ce cauta in pagina. Pura.
 *
 * ⚠ Identificatorii celorlalti trei furnizori NU trec mai departe, desi sunt si ei publici: pagina primeste
 * doar ce foloseste. Secretele nici nu ajung aici: citirea de antet cere doar caile JSON de mai sus.
 */
export function vitrinaSuport(s: SetariSuportBrute | null | undefined): VitrinaSuport | null {
  if (!s || s.sp_activ !== true) return null;
  const cont = contPublic(s.sp_furnizor, s.sp_conturi);
  if (!cont) return null;
  return { cont, aspect: aspectDin(s.sp_aspect), date: dateDin(s.sp_date) };
}
