import { isPlatformHost } from "@/lib/platform-hosts";

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;

// Suprascriere optionala. In mod normal ramane nesetata — echipa se afla din
// proiect, vezi resolveTeamId().
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;

const BASE = "https://api.vercel.com";

async function rawFetch(
  path: string,
  method: "GET" | "POST" | "DELETE",
  body?: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      "Content-Type": "application/json",
    },
  };

  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, options);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  return { ok: res.ok, status: res.status, data };
}

/*
 * Ce cont detine proiectul nostru.
 *
 * Rutele de PROIECT nu au nevoie: id-ul de proiect e unic global, deci Vercel
 * afla singur proprietarul. Rutele de CONT au: `POST /v5/domains` fara `teamId`
 * inregistreaza domeniul pe contul PERSONAL, nu pe echipa care detine
 * proiectul. Domeniul ar parea adaugat, zona s-ar crea unde nu se uita nimeni,
 * iar magazinul ar ramane mort — exact clasa de stare gresita si tacuta pentru
 * care exista tot modulul asta.
 *
 * Se deduce din proiect, nu dintr-o variabila de mediu, tocmai pentru ca o
 * variabila se poate uita — si uitarea ar esua in tacere. Se afla o data pe
 * instanta.
 */
let cachedTeamId: string | null | undefined;

async function resolveTeamId(): Promise<string | null> {
  if (VERCEL_TEAM_ID) return VERCEL_TEAM_ID;
  if (cachedTeamId !== undefined) return cachedTeamId;

  const { ok, data } = await rawFetch(`/v10/projects/${VERCEL_PROJECT_ID}`, "GET");
  const accountId = ok && typeof data.accountId === "string" ? data.accountId : null;
  // Conturile personale au aici un id de user, nu de echipa; doar „team_*" e
  // valoare valida pentru `teamId`.
  cachedTeamId = accountId?.startsWith("team_") ? accountId : null;
  return cachedTeamId;
}

async function vercelFetch(
  path: string,
  method: "GET" | "POST" | "DELETE" = "GET",
  body?: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
    return { ok: false, status: 0, data: { error: "VERCEL_TOKEN or VERCEL_PROJECT_ID not set" } };
  }

  const team = await resolveTeamId();
  const scoped = team
    ? `${path}${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(team)}`
    : path;

  return rawFetch(scoped, method, body);
}

/** Bare apex of a hostname (drops a leading "www."). */
function apexOf(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

/**
 * Whether we should also register the "www." twin for this domain. Only for
 * true apex domains (2 labels, e.g. "magazin.ro"); a subdomain like
 * "shop.magazin.ro" gets no "www." twin.
 */
function shouldPairWww(apex: string): boolean {
  return apex.split(".").length === 2;
}

/**
 * E gazda asta atasata PROIECTULUI nostru chiar acum?
 *
 * Serveste la transarea adaugarilor esuate prin observatie, nu prin citirea
 * mesajului de eroare: formularile Vercel cu „already" acopera si cazul benign
 * (e deja al nostru) si pe cel fatal (il tine altcineva).
 */
async function projectHasDomain(name: string): Promise<boolean> {
  const { ok } = await vercelFetch(`/v10/projects/${VERCEL_PROJECT_ID}/domains/${name}`);
  return ok;
}

async function addOne(name: string, body?: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  const { ok, data } = await vercelFetch(
    `/v10/projects/${VERCEL_PROJECT_ID}/domains`,
    "POST",
    { name, ...body },
  );
  if (ok) return { success: true };
  const err = (data.error as Record<string, unknown>)?.message ?? data.message ?? "Eroare Vercel API";
  const cod = String((data.error as Record<string, unknown>)?.code ?? data.code ?? "");

  /*
   * „Deja adaugat" sunt DOUA lucruri diferite, si mult timp amandoua treceau
   * drept succes: `domain_already_in_use` poate insemna „e al ALTUI cont" (nu
   * s-a adaugat nimic) sau „e deja pe proiectul NOSTRU" (totul e in regula).
   *
   * Decizia se ia INTREBAND, nu citind proza erorii. Vercel raspunde „already in
   * use by one of your projects" si cand proiectul ala e chiar AL NOSTRU (caz in
   * care totul e deja in regula), si cand e altul. Clasificarea pe sir citea
   * ambele ca esec si bloca „Repara" pe un domeniu care era deja atasat corect —
   * exact ce s-a intamplat pe atelierullarisei.ro pe 07.08.2026.
   */
  if (await projectHasDomain(name)) return { success: true };

  const dejaAlNostru = cod === "domain_already_exists" || /already (exists|added)/i.test(String(err));
  if (dejaAlNostru) return { success: true };
  if (cod.includes("domain_already") || /already in use/i.test(String(err))) {
    return {
      success: false,
      error: `Domeniul este deja folosit de alt proiect Vercel si nu poate fi conectat aici. Scoate-l din proiectul acela, apoi incearca din nou. (${err})`,
    };
  }
  return { success: false, error: String(err) };
}

/** Mesaj citibil din raspunsul de eroare al Vercel (are forme inconsecvente). */
function errMessage(data: Record<string, unknown>): string {
  const e = data.error;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const m = (e as Record<string, unknown>).message;
    if (typeof m === "string") return m;
  }
  if (typeof data.message === "string") return data.message;
  return "Eroare Vercel API";
}

/** Randul din cont pentru un domeniu, sau null daca nu-l avem. */
async function accountDomain(apex: string): Promise<Record<string, unknown> | null> {
  const { ok, data } = await vercelFetch(`/v5/domains/${apex}`);
  if (!ok) return null;
  return ((data.domain ?? data) as Record<string, unknown>) ?? null;
}

/** `serviceType: "zeit.world"` = zona chiar e gazduita de Vercel. */
function hasZone(row: Record<string, unknown> | null): boolean {
  return Boolean(row) && row?.serviceType === "zeit.world";
}

/** Registrarul chiar deleaga domeniul catre Vercel? */
function delegatedToVercel(row: Record<string, unknown> | null): boolean {
  const ns = Array.isArray(row?.nameservers) ? (row.nameservers as string[]) : [];
  return ns.some((n) => n.toLowerCase().includes("vercel-dns.com"));
}

/*
 * Inregistreaza apexul in CONTUL Vercel si cere gazduirea zonei lui DNS.
 *
 * Pasul asta lipsea, si lipsa lui a tinut `atelierullarisei.ro` cazut complet
 * doua zile (07.08.2026), dupa ce facuse la fel cu `vetdepo.ro`.
 *
 * Adaugarea la PROIECT doar ruteaza traficul; NU creeaza zona DNS. Singurul
 * lucru care o creeaza e `zone: true` pe ruta de cont — din schema oficiala
 * pentru `POST /v5/domains`:
 *   "zone": "Whether to create a DNS zone on Vercel. Set `true` if using Vercel nameservers."
 * Fara ea, ns1/ns2.vercel-dns.com nu au ce servi si raspund REFUSED, ceea ce
 * omoara tot domeniul — si site, si email — in timp ce panoul afiseaza linistit
 * „Invalid Configuration", iar noi ii scriam clientului „Domeniu conectat".
 *
 * Idempotenta: un domeniu pe care il avem deja e succes, nu eroare. Se verifica
 * intreband, nu cautand cuvantul „already" intr-o propozitie care poate la fel
 * de bine sa insemne „e deja al altcuiva".
 *
 * `allowRecreate` deschide calea distructiva (scoate din cont + readauga cu
 * zona). Implicit INCHISA, si asta conteaza: zona Vercel e una din DOUA metode
 * valide de configurare, nu o cerinta.
 *
 * `caian-textile.ro` sta pe nameservere ROMARG cu un A catre IP-ul Vercel si
 * functioneaza perfect fara nicio zona la Vercel. Prima versiune a reparatiei
 * citea „fara zona" ca „stricat" si l-ar fi scos din cont la fiecare rulare a
 * cronului — pe un magazin viu. Zona se cere DOAR cand registrarul chiar
 * deleaga catre ns1/ns2.vercel-dns.com, fiindca doar atunci lipsa ei omoara
 * domeniul.
 */
async function ensureDomainOnAccount(
  apex: string,
  { allowRecreate = false }: { allowRecreate?: boolean } = {},
): Promise<{ success: boolean; error?: string }> {
  const { ok, data } = await vercelFetch("/v5/domains", "POST", {
    name: apex,
    method: "add",
    zone: true,
  });
  if (ok) return { success: true };

  const existing = await accountDomain(apex);

  // Nu e al nostru deloc: eroarea e reala (alt cont il detine).
  if (!existing) return { success: false, error: errMessage(data) };

  // E al nostru SI are zona: exact ce voiam, doar ca era deja facut.
  if (hasZone(existing)) return { success: true };

  // E al nostru, fara zona, si nu avem voie sa demolam: mergem mai departe.
  // Domeniul poate sta foarte bine pe DNS extern — nu stricam ce merge.
  if (!allowRecreate) return { success: true };

  /*
   * Starea capcana, si cea in care a fost prins `atelierullarisei.ro` pe
   * 07.08.2026 chiar dupa prima reparatie: domeniul E in cont, dar cu DNS extern
   * si FARA zona. A ajuns acolo cand a fost atasat la proiect. Vercel refuza
   * atunci re-adaugarea („already in use by one of your projects"), deci
   * `zone: true` nu are cum sa se mai aplice — si domeniul ramane mort la
   * nesfarsit, oricat ai apasa „Repara".
   *
   * Singura cale de iesire prin API e sa-l scoatem din cont si sa-l punem la loc
   * CU zona. E o operatie distructiva, deci se face doar aici, unde tocmai am
   * dovedit ca zona lipseste — adica pe un domeniu care oricum nu functioneaza,
   * unde nu exista nimic de pierdut.
   */
  if (existing.boughtAt) {
    // Domeniu inregistrat PRIN Vercel: stergerea din cont ar insemna pierderea
    // inregistrarii, nu doar a zonei. Nu-l atingem.
    return {
      success: false,
      error:
        `${apex} e inregistrat prin Vercel dar nu are zona DNS. Activeaza ` +
        `nameserverele Vercel pentru el din panou; nu-l pot repara automat fara ` +
        `sa risc inregistrarea domeniului.`,
    };
  }

  const removed = await vercelFetch(`/v6/domains/${apex}`, "DELETE");
  if (!removed.ok) {
    return {
      success: false,
      error:
        `${apex} e in contul Vercel fara zona DNS si nu a putut fi scos ca sa fie ` +
        `readaugat corect: ${errMessage(removed.data)}`,
    };
  }

  const again = await vercelFetch("/v5/domains", "POST", {
    name: apex,
    method: "add",
    zone: true,
  });
  if (again.ok) return { success: true };

  return {
    success: false,
    error:
      `${apex} a fost scos din cont, dar readaugarea cu zona DNS a esuat: ` +
      `${errMessage(again.data)}`,
  };
}

/**
 * Add a custom domain to the Vercel project. Vercel provisions SSL once DNS is
 * configured.
 *
 * Trei lucruri trebuie sa fie adevarate ca domeniul sa functioneze, si acum se
 * fac toate trei, nu doar cel din mijloc:
 *   1. apexul e in CONT, cu zona DNS   -> nameserverele Vercel chiar raspund
 *   2. apexul e pe PROIECT             -> traficul e rutat
 *   3. geamanul „www." e pe proiect ca 308 catre apex -> certificat valid pe www
 *
 * Pasul 1 se sare pentru subdomenii (shop.magazin.ro): alea raman pe DNS-ul
 * clientului printr-un CNAME, deci nu exista zona Vercel de creat.
 */
export async function addDomainToVercel(
  domain: string
): Promise<{ success: boolean; error?: string; warning?: string }> {
  const apex = apexOf(domain);
  const isApex = shouldPairWww(apex);

  if (isApex) {
    const zone = await ensureDomainOnAccount(apex);
    if (!zone.success) {
      return {
        success: false,
        error:
          `Domeniul nu a putut fi inregistrat in contul Vercel (fara asta ` +
          `nameserverele Vercel nu raspund deloc pentru el): ${zone.error}`,
      };
    }
  }

  const primary = await addOne(apex);
  if (!primary.success) return primary;

  // Geamanul www nu are voie sa blocheze un apex functional — dar esecul lui se
  // raporteaza acum, in loc sa fie aruncat la gunoi: un www stricat inseamna
  // eroare de certificat pentru fiecare vizitator care il tasteaza.
  let warning: string | undefined;
  if (isApex) {
    const twin = await addOne(`www.${apex}`, { redirect: apex, redirectStatusCode: 308 });
    if (!twin.success) {
      warning = `Domeniul principal e conectat, dar www.${apex} nu a putut fi adaugat: ${twin.error}`;
    }
  }

  return { success: true, warning };
}

/**
 * Remove a custom domain from the Vercel project (apex + its www twin).
 */
export async function removeDomainFromVercel(
  domain: string
): Promise<{ success: boolean; error?: string }> {
  const apex = apexOf(domain);

  // PAZA FINALA, indiferent de cine cheama functia: nu stergem niciodata din
  // proiectul Vercel o gazda a platformei. Fara ea, orice cale care ajunge aici
  // cu `edinio.com` (un rand stricat in baza, un viitor apelant, o revendicare
  // strecurata inainte de validare) scotea panoul si toate magazinele de pe
  // edinio.com/<slug> din rutare, impreuna cu certificatul.
  if (isPlatformHost(apex)) {
    console.error("[vercel] BLOCAT: incercare de stergere a unei gazde de platforma", { apex });
    return { success: false, error: "Domeniul apartine platformei si nu poate fi sters." };
  }

  if (shouldPairWww(apex)) {
    // Best-effort — ignore if the twin was never added.
    await vercelFetch(`/v10/projects/${VERCEL_PROJECT_ID}/domains/www.${apex}`, "DELETE");
  }

  const { ok, data } = await vercelFetch(
    `/v10/projects/${VERCEL_PROJECT_ID}/domains/${apex}`,
    "DELETE"
  );

  if (!ok) {
    const err = (data.error as Record<string, unknown>)?.message ?? data.message ?? "Eroare Vercel API";
    return { success: false, error: String(err) };
  }

  return { success: true };
}

export type DomainStatus = {
  /** Apexul e in contul Vercel SI Vercel ii gazduieste zona DNS. */
  zone: boolean;
  /** Apexul e atasat proiectului nostru. */
  inProject: boolean;
  /** Vercel considera proprietatea dovedita. */
  verified: boolean;
  /** „Invalid Configuration" al Vercel: DNS-ul nu arata (inca) incoace. */
  misconfigured: boolean;
  /** Geamanul „www." e si el atasat. */
  wwwInProject: boolean;
  /** Ce ar trebui sa aiba registrarul, direct de la Vercel. */
  intendedNameservers: string[];
  /** Ce are registrarul de fapt, asa cum vede Vercel. */
  currentNameservers: string[];
  /** Registrarul deleaga catre ns1/ns2.vercel-dns.com. */
  delegated: boolean;
  /**
   * Starea fatala: delegat catre Vercel, dar fara zona. Atunci nameserverele
   * raspund REFUSED si domeniul e mort complet, si site si email. Distinct de
   * „fara zona" simplu, care pe DNS extern e perfect normal.
   */
  zoneMissing: boolean;
  /** Adevarat doar cand totul e la locul lui si domeniul chiar serveste magazinul. */
  healthy: boolean;
  error?: string;
};

/*
 * Starea reala a unui domeniu, ceruta de la Vercel in loc sa fie dedusa din
 * baza noastra. Nimic din produs nu facea asta: `businesses.custom_domain`
 * nenul era tratat drept dovada ca domeniul merge — de aceea un magazin a putut
 * sta doua zile mort afisand „Domeniu conectat".
 */
export async function getDomainStatus(domain: string): Promise<DomainStatus> {
  const apex = apexOf(domain);
  const isApex = shouldPairWww(apex);

  const empty: DomainStatus = {
    zone: false,
    inProject: false,
    verified: false,
    misconfigured: true,
    wwwInProject: false,
    intendedNameservers: [],
    currentNameservers: [],
    delegated: false,
    zoneMissing: false,
    healthy: false,
  };

  const [account, project, config, twin] = await Promise.all([
    isApex ? vercelFetch(`/v5/domains/${apex}`) : Promise.resolve(null),
    vercelFetch(`/v10/projects/${VERCEL_PROJECT_ID}/domains/${apex}`),
    // Ruta CORECTA pentru „e configurat si putem emite certificat": e la nivel de
    // domeniu, nu sub proiect. Cea de sub proiect nu exista, raspundea eroare, iar
    // eroarea o citeam drept `misconfigured: true` — deci TOATE domeniile ieseau
    // nesanatoase (`healthy: 0` in cronul de la 17:23, inclusiv magazine care merg).
    vercelFetch(`/v6/domains/${apex}/config?projectIdOrName=${VERCEL_PROJECT_ID}`),
    isApex
      ? vercelFetch(`/v10/projects/${VERCEL_PROJECT_ID}/domains/www.${apex}`)
      : Promise.resolve(null),
  ]);

  // status 0 = nu avem deloc credentiale Vercel; nu e „domeniu stricat".
  if (project.status === 0) {
    return { ...empty, error: errMessage(project.data) };
  }

  const accountRow = (account?.ok ? account.data.domain ?? account.data : null) as
    | Record<string, unknown>
    | null;

  // `serviceType: "zeit.world"` e semnul Vercel pentru „zona e gazduita la noi".
  // Pentru un subdomeniu nu exista rand in cont si nici zona de asteptat.
  const zone = !isApex
    ? true
    : hasZone(accountRow);

  const intendedNameservers = Array.isArray(accountRow?.intendedNameservers)
    ? (accountRow.intendedNameservers as string[])
    : [];
  const currentNameservers = Array.isArray(accountRow?.nameservers)
    ? (accountRow.nameservers as string[])
    : [];

  const inProject = project.ok;
  const verified = project.ok && project.data.verified === true;
  const misconfigured = config.ok ? config.data.misconfigured === true : true;
  const wwwInProject = isApex ? Boolean(twin?.ok) : true;
  const delegated = delegatedToVercel(accountRow);

  /*
   * Zona lipseste CU ADEVARAT cand domeniul nu o are si nici nu functioneaza
   * altfel. Doua semne, oricare ajunge:
   *   - `delegated`: registrarul arata deja catre ns1/ns2.vercel-dns.com
   *   - `misconfigured`: Vercel spune ca domeniul nu ajunge la noi pe nicio cale
   *
   * Nu doar `delegated`, pentru ca lista de nameservere pe care o raporteaza
   * Vercel vine din propria lui interogare DNS — iar cand zona lipseste, chiar
   * nameserverele alea raspund REFUSED, deci lista poate veni goala. Exact
   * cazul pe care il reparam ar fi sarit.
   *
   * `misconfigured === false` ramane paza pentru magazinele vii: un domeniu pe
   * DNS extern care functioneaza nu e niciodata atins.
   */
  const zoneMissing = isApex && !zone && (delegated || misconfigured);

  /*
   * Sanatatea NU cere zona. Un domeniu poate ajunge la Vercel pe doua cai la fel
   * de valide: nameservere delegate (atunci zona e obligatorie) sau A/CNAME de
   * la registrarul clientului (atunci zona nici nu are rost). `misconfigured`
   * vine de la Vercel si acopera ambele — e singurul verdict care conteaza.
   */
  return {
    zone,
    inProject,
    verified,
    misconfigured,
    wwwInProject,
    intendedNameservers,
    currentNameservers,
    delegated,
    zoneMissing,
    healthy: inProject && verified && !misconfigured,
  };
}

/**
 * Readuce domeniul in starea in care ar fi trebuit sa fie. Se poate chema si pe
 * un domeniu sanatos (fiecare pas e idempotent) — de aceea merge folosita si de
 * butonul „Repara" din magazin, si de cronul orar de reconciliere.
 */
export async function repairDomainOnVercel(
  domain: string
): Promise<{ success: boolean; error?: string; warning?: string }> {
  const apex = apexOf(domain);

  /*
   * Calea distructiva (scoate din cont + readauga cu zona) se deschide DOAR
   * pentru starea care chiar o cere, si verdictul il da `getDomainStatus` —
   * acelasi pe care il vede si clientul in panou, si cronul. Un singur loc
   * decide ce inseamna „lipseste zona", ca sa nu se desincronizeze.
   *
   * Un domeniu pe DNS extern care functioneaza (`misconfigured === false`) nu e
   * niciodata atins, oricat de „incomplet" ar parea ca n-are zona.
   */
  const status = await getDomainStatus(apex);
  if (status.zoneMissing) {
    const recreat = await ensureDomainOnAccount(apex, { allowRecreate: true });
    if (!recreat.success) return recreat;
  }

  return addDomainToVercel(domain);
}

/**
 * @deprecated Foloseste {@link getDomainStatus} — raporteaza si zona DNS, a
 * carei lipsa e invizibila aici. Pastrata pentru ca „e pe proiect?" ramane o
 * intrebare valida in sine.
 */
export async function getDomainFromVercel(
  domain: string
): Promise<{ exists: boolean; verified: boolean; error?: string }> {
  const { ok, data } = await vercelFetch(
    `/v10/projects/${VERCEL_PROJECT_ID}/domains/${domain}`
  );

  if (!ok) return { exists: false, verified: false };

  return {
    exists: true,
    verified: data.verified === true,
  };
}
