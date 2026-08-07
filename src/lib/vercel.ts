import { isPlatformHost } from "@/lib/platform-hosts";

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;

// Suprascriere optionala. In mod normal ramane nesetata — echipa se afla din
// proiect, vezi resolveTeamId().
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;

const BASE = "https://api.vercel.com";

type Metoda = "GET" | "POST" | "PATCH" | "DELETE";

async function rawFetch(
  path: string,
  method: Metoda,
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
 * afla singur proprietarul. Rutele de CONT au: adaugarea unui domeniu fara
 * `teamId` il inregistreaza pe contul PERSONAL, nu pe echipa care detine
 * proiectul. Domeniul ar parea adaugat, zona s-ar crea unde nu se uita nimeni,
 * iar magazinul ar ramane mort.
 *
 * Se deduce din proiect, nu dintr-o variabila de mediu, tocmai pentru ca o
 * variabila se poate uita — si uitarea ar esua in tacere.
 *
 * Se memoreaza DOAR rezultatele reusite. Daca prima cerere dintr-o instanta
 * cade pe un 429 sau 5xx, a memora `null` ar scoate `teamId` de pe toate
 * apelurile de cont urmatoare, pentru toata viata instantei — adica exact
 * catastrofa descrisa mai sus, cauzata de o eroare trecatoare.
 */
let cachedTeamId: string | null | undefined;

async function resolveTeamId(): Promise<string | null> {
  if (VERCEL_TEAM_ID) return VERCEL_TEAM_ID;
  if (cachedTeamId !== undefined) return cachedTeamId;

  const { ok, data } = await rawFetch(`/v10/projects/${VERCEL_PROJECT_ID}`, "GET");
  if (!ok) return null; // trecator: reincercam data viitoare, nu memoram

  const accountId = typeof data.accountId === "string" ? data.accountId : null;
  // Conturile personale au aici un id de user, nu de echipa; doar „team_*" e
  // valoare valida pentru `teamId`.
  cachedTeamId = accountId?.startsWith("team_") ? accountId : null;
  return cachedTeamId;
}

async function vercelFetch(
  path: string,
  method: Metoda = "GET",
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

// ─── Sonde: ce e adevarat, intrebat de la Vercel ──────────────────────────────

/**
 * `null` inseamna „nu stiu", NU „e rau".
 *
 * Distinctia asta e tot ce sta intre un 429 trecator si o reparatie declansata
 * pe un magazin sanatos. Nicio decizie de scriere nu se ia pe `null`.
 */
type Verdict = true | false | null;

/** Randul din contul Vercel pentru un domeniu, cu statusul citirii. */
async function accountDomain(
  apex: string
): Promise<{ row: Record<string, unknown> | null; status: number; ok: boolean }> {
  const { ok, status, data } = await vercelFetch(`/v5/domains/${apex}`);
  if (!ok) return { row: null, status, ok };
  const row = ((data.domain ?? data) as Record<string, unknown>) ?? null;
  return { row, status, ok };
}

/*
 * EXISTA cu adevarat zona DNS pentru domeniu?
 *
 * Asta e sonda care lipsea, si lipsa ei a costat o zi intreaga pe
 * `atelierullarisei.ro`. Codul citea `serviceType === "zeit.world"` de pe
 * `GET /v5/domains/{apex}` si trata rezultatul ca dovada ca zona exista.
 * Nu poate fi: specificatia OpenAPI defineste `serviceType` drept „tipul de
 * serviciu care se ocupa de domeniu" (`external` | `zeit.world` | `na`) —
 * o clasificare, nu o stare de aprovizionare — iar raspunsul acelui endpoint
 * NU are deloc un camp `zone`. Existenta zonei e structural necitibila de
 * acolo, deci orice logica construita pe el era garantat sa minta.
 *
 * `GET /v5/domains/{apex}/records` e singura ruta care raspunde DESPRE ZONA:
 * ori exista si o poate lista, ori nu si da 404.
 */
async function zonaChiarExista(apex: string): Promise<Verdict> {
  const { ok, status, data } = await vercelFetch(`/v5/domains/${apex}/records`);
  if (ok) {
    // Ruta e legata de zona: daca raspunde, obiectul-zona exista. Chiar si o
    // lista goala inseamna „zona e acolo, doar n-are inregistrari proprii".
    void data;
    return true;
  }
  if (status === 404) return false;
  return null; // 401/403/429/5xx/retea — nu tragem nicio concluzie
}

/** Registrarul chiar deleaga domeniul catre nameserverele Vercel? */
function delegatedToVercel(row: Record<string, unknown> | null): boolean {
  const ns = Array.isArray(row?.nameservers) ? (row.nameservers as string[]) : [];
  return ns.some((n) => n.toLowerCase().includes("vercel-dns.com"));
}

/** `recommendedIPv4` / `recommendedCNAME` vin ca liste de {rank, value} sau de siruri. */
function recomandari(valoare: unknown): string[] {
  if (!Array.isArray(valoare)) return [];
  const iesire: string[] = [];
  for (const item of valoare) {
    if (typeof item === "string") iesire.push(item);
    else if (item && typeof item === "object") {
      const v = (item as Record<string, unknown>).value;
      if (typeof v === "string") iesire.push(v);
      else if (Array.isArray(v)) for (const x of v) if (typeof x === "string") iesire.push(x);
    }
  }
  return iesire;
}

// ─── Scrieri ──────────────────────────────────────────────────────────────────

/*
 * Cere Vercel sa gazduiasca zona DNS a domeniului.
 *
 * Doua rute, in ordine, si NICIUNA distructiva:
 *   1. `POST /v7/domains` cu `{ zone: true }` — cand domeniul nu e inca in cont.
 *      `zone` e documentat exact ca „Whether to create a DNS zone on Vercel.
 *      Set `true` if using Vercel nameservers."
 *   2. `PATCH /v3/domains/{apex}` cu `{ op: "update", zone: true }` — cand e deja
 *      in cont (pasul 1 da conflict). E echivalentul API al butonului „Enable
 *      Vercel DNS" din panou, documentat ca „Specifies whether this is a DNS
 *      zone that intends to use Vercel's nameservers."
 *
 * Versiunea anterioara facea `DELETE /v6/domains/{apex}` + re-adaugare, fiindca
 * nu stiam de PATCH. Stergerea din cont scoate automat si aliasurile, si zona —
 * adica MX-urile si TXT-urile clientului. Ireversibil, unde documentatia ofera
 * idempotent. Calea aia e eliminata complet.
 *
 * Si, esential: nu raporteaza succes fara sa RE-INTREBE. Codul de dinainte
 * intorcea `{ success: true }` pe baza aceleiasi presupuneri gresite care il
 * adusese acolo, deci butonul „Repara" zicea „gata" fara sa fi facut nimic.
 */
async function declaraZonaLaVercel(apex: string): Promise<{ success: boolean; error?: string }> {
  const adaugat = await vercelFetch("/v7/domains", "POST", {
    name: apex,
    method: "add",
    zone: true,
  });

  if (!adaugat.ok) {
    const patch = await vercelFetch(`/v3/domains/${apex}`, "PATCH", {
      op: "update",
      zone: true,
    });

    if (!patch.ok) {
      // Daca domeniul nu e deloc al nostru, eroarea relevanta e cea de la adaugare.
      const { row, ok } = await accountDomain(apex);
      if (ok && !row) return { success: false, error: errMessage(adaugat.data) };
      return {
        success: false,
        error: `Nu am putut activa DNS-ul Vercel pentru ${apex}: ${errMessage(patch.data)}`,
      };
    }
  }

  const zona = await zonaChiarExista(apex);
  if (zona === false) {
    return {
      success: false,
      error:
        `Vercel a acceptat cererea, dar zona DNS pentru ${apex} tot nu exista. ` +
        `Activeaza „Enable Vercel DNS" din panoul Vercel (Domains > ${apex} > ` +
        `Advanced Settings); daca nici asa nu apare, e o problema de partea Vercel.`,
    };
  }

  // `true` sau `null` — nu blocam pe o citire care n-a raspuns. Apelantul
  // re-verifica oricum starea la final.
  return { success: true };
}

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
  const err = errMessage(data);
  const cod = String((data.error as Record<string, unknown>)?.code ?? data.code ?? "");

  /*
   * „Deja adaugat" sunt DOUA lucruri diferite: `domain_already_in_use` poate
   * insemna „e al ALTUI cont" (nu s-a adaugat nimic) sau „e deja pe proiectul
   * NOSTRU" (totul e in regula). Decizia se ia INTREBAND — si intrebarea de mai
   * jos e verdictul FINAL. Nu exista apel dupa ea care sa accepte succesul pe
   * baza textului erorii: daca sonda a raspuns „nu e pe proiectul nostru",
   * atunci nu e, oricum ar fi formulat mesajul.
   */
  if (await projectHasDomain(name)) return { success: true };

  if (cod.includes("domain_already") || /already (in use|exists|added)/i.test(err)) {
    return {
      success: false,
      error: `Domeniul este deja folosit de alt proiect Vercel si nu poate fi conectat aici. Scoate-l din proiectul acela, apoi incearca din nou. (${err})`,
    };
  }
  return { success: false, error: err };
}

/**
 * Conecteaza un domeniu custom la magazin.
 *
 * Trei obiecte distincte trebuie sa existe, si documentatia Vercel le trateaza
 * ca atare:
 *   1. domeniul in CONT, cu zona DNS  -> nameserverele Vercel chiar raspund
 *   2. domeniul pe PROIECT            -> traficul e rutat, se emite certificat
 *   3. geamanul „www." pe proiect, ca 308 catre apex
 *
 * Pasul 1 se sare pentru subdomenii (shop.magazin.ro): alea raman pe DNS-ul
 * clientului printr-un CNAME.
 */
export async function addDomainToVercel(
  domain: string
): Promise<{ success: boolean; error?: string; warning?: string }> {
  const apex = apexOf(domain);
  const isApex = shouldPairWww(apex);

  if (isApex) {
    const zona = await declaraZonaLaVercel(apex);
    if (!zona.success) return { success: false, error: zona.error };
  }

  const primary = await addOne(apex);
  if (!primary.success) return primary;

  // Geamanul www nu blocheaza un apex functional, dar esecul lui se raporteaza:
  // un www stricat inseamna eroare de certificat pentru cine il tasteaza.
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
 * Scoate un domeniu custom din PROIECTUL Vercel (apex + geamanul www).
 *
 * Deliberat NU elibereaza domeniul din cont si NU sterge zona: un magazin care
 * reconecteaza acelasi domeniu nu-si pierde inregistrarile DNS (MX-urile lui,
 * printre altele) si nu ramane mort intre timp.
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

  if (!ok) return { success: false, error: errMessage(data) };

  return { success: true };
}

// ─── Citirea starii ───────────────────────────────────────────────────────────

export type DomainStatus = {
  /** Zona DNS exista cu adevarat la Vercel (intrebat pe /records, nu dedus). */
  zone: boolean;
  /** Nu am putut afla daca exista zona — nu inseamna ca lipseste. */
  zoneUnknown: boolean;
  /** Apexul e atasat proiectului nostru. */
  inProject: boolean;
  /** Vercel considera proprietatea dovedita. */
  verified: boolean;
  /** „Invalid Configuration" al Vercel: DNS-ul nu ajunge la noi pe nicio cale. */
  misconfigured: boolean;
  /** Geamanul „www." e si el atasat. */
  wwwInProject: boolean;
  /** Ce ar trebui sa aiba registrarul, direct de la Vercel. */
  intendedNameservers: string[];
  /** Ce are registrarul de fapt, asa cum vede Vercel. */
  currentNameservers: string[];
  /** Registrarul deleaga catre ns1/ns2.vercel-dns.com. */
  delegated: boolean;
  /** IP-urile de A recomandate de Vercel PENTRU ACEST proiect. */
  recommendedIPv4: string[];
  /** Tinta de CNAME recomandata de Vercel PENTRU ACEST proiect. */
  recommendedCNAME: string[];
  /**
   * Starea fatala: zona lipseste DOVEDIT si domeniul nu ajunge la noi altfel.
   * Atunci nameserverele raspund REFUSED si domeniul e mort complet — si site,
   * si email.
   */
  zoneMissing: boolean;
  /** Domeniul chiar serveste magazinul acum. */
  healthy: boolean;
  error?: string;
};

/*
 * Starea reala a unui domeniu, ceruta de la Vercel in loc sa fie dedusa din
 * baza noastra. Nimic din produs nu facea asta: `businesses.custom_domain`
 * nenul era tratat drept dovada ca domeniul merge — de aceea un magazin a putut
 * sta doua zile mort afisand „Domeniu conectat".
 *
 * Regula peste tot aici: o citire care NU a raspuns nu produce niciodata un
 * verdict negativ. `zoneUnknown` si `error` exista tocmai ca sa deosebeasca
 * „am aflat ca e rau" de „n-am putut afla".
 */
export async function getDomainStatus(domain: string): Promise<DomainStatus> {
  const apex = apexOf(domain);
  const isApex = shouldPairWww(apex);

  const gol: DomainStatus = {
    zone: false,
    zoneUnknown: true,
    inProject: false,
    verified: false,
    misconfigured: true,
    wwwInProject: false,
    intendedNameservers: [],
    currentNameservers: [],
    delegated: false,
    recommendedIPv4: [],
    recommendedCNAME: [],
    zoneMissing: false,
    healthy: false,
  };

  const [cont, zonaVerdict, proiect, config, geaman] = await Promise.all([
    isApex ? accountDomain(apex) : Promise.resolve(null),
    isApex ? zonaChiarExista(apex) : Promise.resolve<Verdict>(true),
    vercelFetch(`/v10/projects/${VERCEL_PROJECT_ID}/domains/${apex}`),
    // Ruta e la nivel de DOMENIU, nu sub proiect — cea de sub proiect nu exista.
    // `strict=true`: altfel raspunsul imprumuta nameserverele zonei parinte si
    // ascunde faptul ca domeniul insusi n-are nimic.
    vercelFetch(`/v6/domains/${apex}/config?projectIdOrName=${VERCEL_PROJECT_ID}&strict=true`),
    isApex
      ? vercelFetch(`/v10/projects/${VERCEL_PROJECT_ID}/domains/www.${apex}`)
      : Promise.resolve(null),
  ]);

  // status 0 = nu avem deloc credentiale Vercel; nu e „domeniu stricat".
  if (proiect.status === 0) {
    return { ...gol, error: errMessage(proiect.data) };
  }

  const rand = cont?.row ?? null;
  // O citire de cont care a esuat altfel decat cu 404 nu spune nimic despre domeniu.
  const contNecitit = Boolean(cont && !cont.ok && cont.status !== 404);

  const zone = zonaVerdict === true;
  const zoneUnknown = zonaVerdict === null;

  const intendedNameservers = Array.isArray(rand?.intendedNameservers)
    ? (rand.intendedNameservers as string[])
    : [];
  const currentNameservers = Array.isArray(rand?.nameservers)
    ? (rand.nameservers as string[])
    : [];

  const inProject = proiect.ok;
  const verified = proiect.ok && proiect.data.verified === true;
  const misconfigured = config.ok ? config.data.misconfigured === true : true;
  const configNecitit = !config.ok;
  const wwwInProject = isApex ? Boolean(geaman?.ok) : true;
  const delegated = delegatedToVercel(rand);

  const recommendedIPv4 = config.ok ? recomandari(config.data.recommendedIPv4) : [];
  const recommendedCNAME = config.ok ? recomandari(config.data.recommendedCNAME) : [];

  /*
   * Zona lipseste doar cand am DOVEDIT ca lipseste (`zonaVerdict === false`) SI
   * domeniul chiar nu ajunge la noi. Un `null` — adica o citire care n-a
   * raspuns — nu declanseaza nimic, niciodata: altfel un 429 trecator ar porni
   * o reparatie pe un magazin sanatos.
   */
  const zoneMissing =
    isApex && zonaVerdict === false && !configNecitit && (delegated || misconfigured);

  const error = contNecitit
    ? `Nu am putut citi domeniul din contul Vercel (HTTP ${cont?.status}).`
    : configNecitit && proiect.ok
      ? "Nu am putut citi configuratia DNS de la Vercel."
      : undefined;

  return {
    zone,
    zoneUnknown,
    inProject,
    verified,
    misconfigured,
    wwwInProject,
    intendedNameservers,
    currentNameservers,
    delegated,
    recommendedIPv4,
    recommendedCNAME,
    zoneMissing,
    healthy: inProject && verified && !misconfigured,
    error,
  };
}

/**
 * Readuce domeniul in starea in care ar fi trebuit sa fie.
 *
 * Toti pasii sunt idempotenti si niciunul nu e distructiv, deci se poate chema
 * si pe un domeniu sanatos. Spre deosebire de versiunea anterioara, RE-CITESTE
 * la final si refuza sa raporteze succes daca problema pentru care a fost
 * chemata e tot acolo.
 */
export async function repairDomainOnVercel(
  domain: string
): Promise<{ success: boolean; error?: string; warning?: string }> {
  const apex = apexOf(domain);
  const inainte = await getDomainStatus(apex);

  const adaugat = await addDomainToVercel(domain);
  if (!adaugat.success) return adaugat;

  const dupa = await getDomainStatus(apex);

  if (inainte.zoneMissing && dupa.zoneMissing) {
    return {
      success: false,
      error:
        `Zona DNS pentru ${apex} tot lipseste dupa reparare. Activeaza ` +
        `„Enable Vercel DNS" din panoul Vercel (Domains > ${apex} > Advanced ` +
        `Settings). Daca nici asa nu apare, e o problema de partea Vercel — pana ` +
        `atunci, muta domeniul pe inregistrari A/CNAME ca sa iasa din offline.`,
    };
  }

  if (inainte.inProject === false && dupa.inProject === false) {
    return { success: false, error: `${apex} tot nu e atasat proiectului dupa reparare.` };
  }

  return adaugat;
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
