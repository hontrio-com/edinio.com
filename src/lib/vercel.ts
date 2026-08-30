import { isPlatformHost } from "@/lib/platform-hosts";
import { logError } from "@/lib/error-logger";

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;

// Suprascriere optionala. In mod normal ramane nesetata — echipa se afla din
// proiect, vezi resolveTeamId().
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;

const BASE = "https://api.vercel.com";
const TIMEOUT_MS = 10_000;

type Metoda = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * `null` inseamna „nu stiu", NU „e rau".
 *
 * Distinctia asta e tot ce sta intre un 429 trecator si o reparatie declansata
 * pe un magazin sanatos. Nicio decizie de scriere nu se ia pe `null`.
 */
export type Verdict = true | false | null;

/**
 * Cele DOUA cai valide prin care un domeniu ajunge sa serveasca magazinul.
 * Vercel le documenteaza pe amandoua; noi le sustinem pe amandoua.
 *
 * - `nameservere`: clientul deleaga domeniul catre ns1/ns2.vercel-dns.com.
 *   CERE ca zona DNS sa existe la Vercel, altfel nameserverele raspund REFUSED
 *   si domeniul moare complet — si site, si email. Zona porneste GOALA, deci
 *   clientul isi pierde MX-urile daca nu le readauga.
 * - `inregistrari`: clientul lasa DNS-ul unde e si pune un A pe apex plus un
 *   CNAME pe www. NU cere zona la Vercel. Emailul lui ramane neatins.
 */
export type MetodaConectare = "nameservere" | "inregistrari";

type Raspuns = { ok: boolean; status: number; data: Record<string, unknown> };

async function rawFetch(path: string, method: Metoda, body?: Record<string, unknown>): Promise<Raspuns> {
  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      "Content-Type": "application/json",
    },
    // Fara asta, o cerere care atarna tine ocupata toata functia serverless, iar
    // `Promise.all`-ul din getDomainStatus asteapta dupa cea mai lenta din cinci.
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };

  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(`${BASE}${path}`, options);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    // `fetch` arunca la retea cazuta, DNS picat sau timeout. Inainte, doar
    // `res.json()` era prins, deci o eroare de retea arunca din toata citirea si
    // ruta raspundea 500 fara nimic util.
    return { ok: false, status: 0, data: { error: e instanceof Error ? e.message : "eroare de retea" } };
  }
}

/*
 * Ce cont detine proiectul nostru.
 *
 * Rutele de PROIECT nu au nevoie: id-ul de proiect e unic global. Rutele de CONT
 * au: adaugarea unui domeniu fara `teamId` il inregistreaza pe contul PERSONAL,
 * nu pe echipa care detine proiectul. Domeniul ar parea adaugat, zona s-ar crea
 * unde nu se uita nimeni, iar magazinul ar ramane mort.
 *
 * TREI stari, nu doua. Versiunea de dinainte codifica si „e cont personal" si
 * „n-am putut afla" prin acelasi `null`, iar `vercelFetch` trimitea atunci
 * cererea NESCOPATA — adica exact catastrofa de mai sus, produsa de un 429
 * trecator. Acum „necunoscut" ABANDONEAZA apelurile de cont.
 */
type Echipa = { fel: "team"; id: string } | { fel: "personal" } | { fel: "necunoscut" };

let cachedTeam: Echipa | undefined;
/*
 * Se memoreaza si cererea IN ZBOR, nu doar rezultatul.
 *
 * `getDomainStatus` porneste cinci apeluri deodata prin `allSettled`, iar cronul
 * ruleaza patru domenii in paralel: fara asta, prima citire a unei instante
 * declanseaza pana la 20 de cereri simultane catre `/v10/projects/{id}` pentru
 * acelasi raspuns. Pe un 429 se inmulteau si erorile `critical` in `/admin/logs`
 * — adica exact plafonul pe care il adanceau.
 */
let teamInZbor: Promise<Echipa> | undefined;

async function resolveTeam(): Promise<Echipa> {
  if (VERCEL_TEAM_ID) return { fel: "team", id: VERCEL_TEAM_ID };
  if (cachedTeam !== undefined) return cachedTeam;
  if (teamInZbor) return teamInZbor;

  teamInZbor = (async (): Promise<Echipa> => {
    const { ok, status, data } = await rawFetch(`/v10/projects/${VERCEL_PROJECT_ID}`, "GET");
    if (!ok) {
      // Trecator: reincercam data viitoare, nu memoram.
      await logError({
        action: "vercel.echipa",
        message: `Nu am putut afla echipa proiectului (HTTP ${status}). Apelurile de cont sunt abandonate.`,
        severity: "critical",
      });
      return { fel: "necunoscut" };
    }

    const accountId = typeof data.accountId === "string" ? data.accountId : null;
    // Conturile personale au aici un id de user, nu de echipa.
    cachedTeam = accountId?.startsWith("team_") ? { fel: "team", id: accountId } : { fel: "personal" };
    return cachedTeam;
  })();

  try {
    return await teamInZbor;
  } finally {
    // Doar esecul se reincearca; pe succes raspunde `cachedTeam` de acum inainte.
    teamInZbor = undefined;
  }
}

/** Rute de PROIECT: id-ul de proiect e unic global, `teamId` e optional. */
async function proiectFetch(path: string, method: Metoda = "GET", body?: Record<string, unknown>): Promise<Raspuns> {
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
    return { ok: false, status: 0, data: { error: "VERCEL_TOKEN sau VERCEL_PROJECT_ID nesetate" } };
  }
  const echipa = await resolveTeam();
  const scoped = echipa.fel === "team" ? adaugaParam(path, "teamId", echipa.id) : path;
  return rawFetch(scoped, method, body);
}

/**
 * Rute de CONT. Pe echipa necunoscuta NU trimite nimic: o scriere nescopata ar
 * ateriza in contul personal, invizibila din panoul echipei.
 */
async function contFetch(path: string, method: Metoda = "GET", body?: Record<string, unknown>): Promise<Raspuns> {
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
    return { ok: false, status: 0, data: { error: "VERCEL_TOKEN sau VERCEL_PROJECT_ID nesetate" } };
  }
  const echipa = await resolveTeam();
  if (echipa.fel === "necunoscut") {
    return { ok: false, status: 0, data: { error: "Nu stim ce cont Vercel detine proiectul; nu atingem contul." } };
  }
  const scoped = echipa.fel === "team" ? adaugaParam(path, "teamId", echipa.id) : path;
  return rawFetch(scoped, method, body);
}

function adaugaParam(path: string, cheie: string, valoare: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${cheie}=${encodeURIComponent(valoare)}`;
}

/** Segment de cale, codat. Un nume de domeniu nu se interpoleaza brut intr-un URL. */
function seg(s: string): string {
  return encodeURIComponent(s);
}

/** Apexul gol al unei gazde (taie un „www." din fata). */
function apexOf(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

/*
 * Sufixe publice compuse. `firma.com.ro` si `magazin.co.uk` sunt apexuri reale,
 * dar au TREI etichete: numaratoarea simpla le trata drept subdomenii, deci nu
 * primeau nici zona, nici geamanul www, iar `getDomainStatus` fabrica
 * `zone:true` si `wwwInProject:true` pentru doua lucruri niciodata verificate.
 * `edinio.com.ro` e listat ca domeniu valid chiar in platform-hosts.test.ts.
 */
const SUFIXE_COMPUSE = new Set([
  "com.ro", "org.ro", "tm.ro", "nt.ro", "nom.ro", "info.ro", "rec.ro", "store.ro", "firm.ro", "arts.ro",
  "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "sch.uk", "ac.uk", "gov.uk",
  "com.au", "net.au", "org.au", "com.br", "com.tr", "co.jp", "co.nz", "co.za", "com.mx",
  "com.ar", "co.il", "com.sg", "com.hk", "com.cn", "com.pl", "com.ua", "com.es", "com.pt",
]);

/**
 * E un apex adevarat (deci merita zona proprie si geaman „www.")?
 * `magazin.ro` si `firma.com.ro` da; `shop.magazin.ro` nu.
 */
export function esteApex(host: string): boolean {
  const p = apexOf(host).split(".");
  if (p.length === 2) return true;
  if (p.length === 3 && SUFIXE_COMPUSE.has(p.slice(1).join("."))) return true;
  return false;
}

/** Mesaj citibil din raspunsul Vercel, cu codul HTTP atasat. */
function errMessage(status: number, data: Record<string, unknown>): string {
  const e = data.error;
  let text: string | null = null;
  if (typeof e === "string") text = e;
  else if (e && typeof e === "object") {
    const m = (e as Record<string, unknown>).message;
    if (typeof m === "string") text = m;
  }
  if (!text && typeof data.message === "string") text = data.message;
  // Codul HTTP e ce deosebeste „token fara drepturi pe echipa" (403) de
  // „domeniul e al altcuiva" (409) de „prea multe cereri" (429). Fara el,
  // toate trei arata identic pentru comerciant si pentru admin.
  return status > 0 ? `HTTP ${status}: ${text ?? "eroare Vercel"}` : (text ?? "eroare Vercel");
}

function codEroare(data: Record<string, unknown>): string {
  return String((data.error as Record<string, unknown>)?.code ?? data.code ?? "");
}

// ─── Adevarul de teren: DNS-ul public ─────────────────────────────────────────

/*
 * De ce intrebam DNS-ul si nu doar API-ul Vercel.
 *
 * API-ul a raspuns „e bine" pe un domeniu complet mort de DOUA ori, cu doua
 * sonde diferite:
 *   1. `serviceType === "zeit.world"` (reparat 07.08.2026) — e o clasificare,
 *      nu o stare de aprovizionare.
 *   2. `GET /v5/domains/{apex}/records` -> 200 (gasit 10.08.2026 pe esafe.ro) —
 *      raspunde cu inregistrarile CAA de sistem chiar si cand Vercel DNS e
 *      DEZACTIVAT. Dovada e in panou: aceleasi trei CAA, cu aceeasi vechime,
 *      erau acolo si inainte, si dupa apasarea lui „Enable Vercel DNS".
 *
 * Un nameserver autoritativ raspunde REFUSED exact cand nu are zona. Asta nu se
 * poate falsifica dintr-un camp de API. Intrebam doi rezolveri independenti si
 * cerem consens, ca sa nu atarne un verdict de disponibilitatea unuia singur.
 */

const REZOLVERI = [
  (n: string, t: string) => `https://dns.google/resolve?name=${seg(n)}&type=${t}&cd=1`,
  (n: string, t: string) => `https://cloudflare-dns.com/dns-query?name=${seg(n)}&type=${t}&cd=1`,
];

type RaspunsDoh = {
  Status?: number;
  Answer?: { name: string; type: number; data: string }[];
  Authority?: { name: string; type: number; data: string }[];
  Comment?: string;
};

async function doh(index: number, nume: string, tip: string): Promise<RaspunsDoh | null> {
  try {
    const res = await fetch(REZOLVERI[index](nume, tip), {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as RaspunsDoh;
  } catch {
    return null;
  }
}

/** Un singur vot despre „nameserverele acestui domeniu chiar servesc zona?". */
function votZona(d: RaspunsDoh | null): Verdict {
  if (!d) return null;

  const areSOA = (l?: { type: number }[]) => Array.isArray(l) && l.some((a) => a.type === 6);
  if (d.Status === 0 && (areSOA(d.Answer) || areSOA(d.Authority))) return true;

  // Semnatura exacta a zonei inexistente: serverul autoritativ refuza intrebarea.
  const text = `${d.Comment ?? ""} ${JSON.stringify(d)}`.toUpperCase();
  if (text.includes("REFUSED") || text.includes("LAME DELEGATION")) return false;

  if (d.Status === 3) return false; // NXDOMAIN: domeniul nu exista in zona parinte
  return null;
}

/**
 * Raspund nameserverele domeniului, cu adevarat, acum?
 *
 * `false` inseamna ca domeniul e MORT pentru toata lumea — si site, si email.
 * Motivul nu conteaza aici; conteaza ca se vede.
 */
async function zonaRaspunde(apex: string): Promise<Verdict> {
  const voturi = await Promise.all([doh(0, apex, "SOA"), doh(1, apex, "SOA")]).then((r) => r.map(votZona));
  const da = voturi.filter((v) => v === true).length;
  const nu = voturi.filter((v) => v === false).length;

  /*
   * Cele doua verdicte NU costa la fel, deci nu se dau la fel de usor.
   *
   * `true` e inofensiv: cel mult nu reparam ceva. Un singur rezolver care vede
   * zona e destul.
   *
   * `false` deschide calea DISTRUCTIVA din `creeazaZona` (detaseaza domeniul de
   * proiect ca sa poata cere zona) si stinge redirectul din proxy. Cu regula
   * veche „nu > 0 && da === 0", un singur rezolver indisponibil (429 -> `null`)
   * plus unul care raspunde REFUSED erau de ajuns ca sa detasam un domeniu VIU.
   * Asa ca negativul cere consensul AMANDURORA: doi martori independenti care
   * spun acelasi lucru.
   */
  if (da > 0 && nu === 0) return true;
  if (nu >= 2 && da === 0) return false;
  return null; // dezacord, un singur martor, sau niciunul
}

/** Nameserverele pe care le vede lumea pentru domeniu (lista goala = n-am aflat). */
async function nameservereReale(apex: string): Promise<string[]> {
  for (let i = 0; i < REZOLVERI.length; i++) {
    const d = await doh(i, apex, "NS");
    const raspuns = [...(d?.Answer ?? []), ...(d?.Authority ?? [])]
      .filter((a) => a.type === 2)
      .map((a) => a.data.replace(/\.$/, "").toLowerCase());
    if (raspuns.length) return [...new Set(raspuns)];
  }
  return [];
}

function arataCatreVercel(ns: string[]): boolean {
  return ns.some((n) => n.toLowerCase().includes("vercel-dns.com"));
}

// ─── Sonde catre API-ul Vercel ────────────────────────────────────────────────

/** Randul din contul Vercel pentru un domeniu. */
async function contDomeniu(apex: string): Promise<{ row: Record<string, unknown> | null; inCont: Verdict; status: number }> {
  const { ok, status, data } = await contFetch(`/v5/domains/${seg(apex)}`);
  if (ok) return { row: ((data.domain ?? data) as Record<string, unknown>) ?? null, inCont: true, status };
  if (status === 404) return { row: null, inCont: false, status };
  return { row: null, inCont: null, status };
}

/*
 * Are Vercel obiectul-zona pentru domeniu?
 *
 * ATENTIE: un `true` de aici NU dovedeste ca nameserverele servesc zona. Exact
 * asta a fost defectul lui esafe.ro: ruta raspunde 200 cu CAA-urile de sistem
 * si pentru un domeniu la care Vercel DNS e dezactivat. Verdictul asta se
 * foloseste doar impreuna cu `zonaRaspunde()`, niciodata singur.
 */
async function zonaLaVercel(apex: string): Promise<Verdict> {
  const { ok, status, data } = await contFetch(`/v5/domains/${seg(apex)}/records`);
  if (ok) {
    // `oneOf`-ul documentat are un sir simplu ca prima varianta; un 200 care nu
    // e obiectul de inregistrari nu spune nimic despre zona.
    if (typeof data !== "object" || data === null) return null;
    return true;
  }
  if (status === 404 || status === 410) return false;
  if (status === 401 || status === 403) {
    void logError({
      action: "vercel.zona",
      message: `Token fara drepturi la citirea zonei ${apex} (HTTP ${status}). E o problema de configurare a platformei, nu a domeniului.`,
      severity: "critical",
    });
  }
  return null;
}

/** Domeniul e atasat proiectului nostru? */
async function peProiect(name: string): Promise<Verdict> {
  const { ok, status } = await proiectFetch(`/v9/projects/${VERCEL_PROJECT_ID}/domains/${seg(name)}`);
  if (ok) return true;
  if (status === 404) return false;
  return null; // 429/5xx/retea: „nu stiu", nu „nu e"
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

type Rezultat = { success: boolean; error?: string; warning?: string };

/*
 * Cere Vercel sa gazduiasca zona DNS a domeniului. Doar pentru metoda
 * „nameservere”; pentru A/CNAME zona nu are ce cauta.
 *
 * Din specificatia OpenAPI, `zone` apare in exact DOUA corpuri de cerere, si
 * formularea difera deliberat:
 *   POST /v7/domains   „Whether to CREATE a DNS zone on Vercel."       (imperativ)
 *   PATCH /v3/domains  „Specifies whether this IS a DNS zone that       (declarativ)
 *                       INTENDS TO USE Vercel's nameservers."
 * Deci ruta creatoare e POST; PATCH e cel mult un steag de intentie. Comentariul
 * de dinainte il prezenta drept „echivalentul API al butonului Enable Vercel
 * DNS" — sintagma nu apare nicaieri in specificatie.
 *
 * Si problema de fond, masurata pe esafe.ro: cat timp domeniul e ATASAT LA
 * PROIECT, POST cade cu conflict si zona nu se mai poate crea pe nicio ruta. De
 * aceea exista pasul de detasare de mai jos — e exact secventa care a reparat
 * esafe.ro manual (DELETE apoi POST), facuta programatic.
 */
async function creeazaZona(apex: string, poateDetasa: boolean): Promise<Rezultat> {
  const adaugat = await contFetch("/v7/domains", "POST", { name: apex, method: "add", zone: true });

  if (adaugat.ok) return await confirmaZona(apex, "POST /v7/domains");

  const cod = codEroare(adaugat.data);
  const conflict = adaugat.status === 409 || /already|in use|exists/i.test(errMessage(0, adaugat.data)) || cod.includes("domain_already");

  // Ramificare pe cod. Inainte, 409, 403, 402 si 429 duceau IDENTIC la acelasi
  // PATCH care nu avea cum sa ajute, si produceau acelasi mesaj generic.
  if (adaugat.status === 401 || adaugat.status === 403) {
    await logError({
      action: "vercel.zona",
      message: `Token fara drepturi la crearea zonei ${apex}: ${errMessage(adaugat.status, adaugat.data)}`,
      severity: "critical",
    });
    return { success: false, error: "Platforma nu are drepturi pe contul Vercel. Contacteaza administratorul." };
  }
  if (adaugat.status === 402) {
    await logError({ action: "vercel.zona", message: `Plata refuzata la crearea zonei ${apex}`, severity: "critical" });
    return { success: false, error: "Contul Vercel al platformei are o problema de plata. Contacteaza administratorul." };
  }
  if (adaugat.status === 429 || adaugat.status === 0) {
    return { success: false, error: `Vercel nu a raspuns acum (${errMessage(adaugat.status, adaugat.data)}). Incearca din nou in cateva minute.` };
  }
  if (!conflict) {
    await logError({
      action: "vercel.zona",
      message: `Crearea zonei ${apex} a esuat: ${errMessage(adaugat.status, adaugat.data)}`,
      details: { apex, status: adaugat.status, corp: adaugat.data },
      severity: "critical",
    });
    return { success: false, error: errMessage(adaugat.status, adaugat.data) };
  }

  // Domeniul e deja in cont. Steagul de intentie, apoi verificam.
  const patch = await contFetch(`/v3/domains/${seg(apex)}`, "PATCH", { op: "update", zone: true });
  if (patch.ok && (patch.data as { zone?: unknown }).zone === false) {
    // Dovada explicita de esec. Nu facem poarta pe `zone === true`: campul e
    // optional, iar un 200 gol e legitim.
    await logError({
      action: "vercel.zona",
      message: `PATCH pe ${apex} a raspuns 200 dar cu zone:false`,
      details: { apex, corp: patch.data },
      severity: "critical",
    });
  }

  const dupaPatch = await confirmaZona(apex, "PATCH /v3/domains");
  if (dupaPatch.success) return dupaPatch;

  /*
   * A TREIA STARE: in cont, fara zona, si atasat la proiect — deci POST-ul de
   * mai sus nu va reusi NICIODATA. Singura iesire e sa eliberam domeniul de
   * proiect, sa cerem zona, si sa-l punem la loc.
   *
   * Se face DOAR pe un domeniu dovedit mort (nameserverele nu raspund): atunci
   * detasarea nu poate strica nimic, fiindca nu mai e nimic de stricat. Pe un
   * domeniu viu nu se atinge niciodata.
   */
  if (!poateDetasa) return dupaPatch;

  const viu = await zonaRaspunde(apex);
  if (viu !== false) return dupaPatch; // nu e dovedit mort: nu umblam la el

  await logError({
    action: "vercel.zona",
    message: `${apex} e in a treia stare (in cont, fara zona, atasat la proiect). Detasez temporar ca sa pot crea zona.`,
    severity: "warning",
  });

  const eraWww = esteApex(apex) ? await peProiect(`www.${apex}`) : false;
  await proiectFetch(`/v9/projects/${VERCEL_PROJECT_ID}/domains/${seg(`www.${apex}`)}`, "DELETE");
  await proiectFetch(`/v9/projects/${VERCEL_PROJECT_ID}/domains/${seg(apex)}`, "DELETE");

  const dinNou = await contFetch("/v7/domains", "POST", { name: apex, method: "add", zone: true });
  const verdict = await confirmaZona(apex, "detasare + POST /v7/domains");

  // Punem la loc INDIFERENT daca zona s-a creat: altfel am lasa domeniul si fara
  // zona, si nelegat de proiect, adica mai rau decat l-am gasit.
  await ataseazaLaProiect(apex);
  if (eraWww !== false && esteApex(apex)) {
    await ataseazaLaProiect(`www.${apex}`, { redirect: apex, redirectStatusCode: 308 });
  }

  if (!verdict.success && !dinNou.ok) {
    return {
      success: false,
      error:
        `Nu am putut crea zona DNS pentru ${apex}: ${errMessage(dinNou.status, dinNou.data)}. ` +
        `Alege conectarea prin inregistrari A/CNAME, care nu are nevoie de zona la noi.`,
    };
  }
  return verdict;
}

/** Zona chiar exista acum? Nu raportam succes fara sa RE-INTREBAM. */
async function confirmaZona(apex: string, pas: string): Promise<Rezultat> {
  const laVercel = await zonaLaVercel(apex);
  if (laVercel === false) {
    return {
      success: false,
      error:
        `Vercel a acceptat cererea, dar zona DNS pentru ${apex} tot nu exista (dupa ${pas}). ` +
        `Alege conectarea prin inregistrari A/CNAME, sau activeaza „Enable Vercel DNS" din panoul Vercel.`,
    };
  }
  if (laVercel === null) {
    // „N-am putut afla" nu e succes. Versiunea de dinainte intorcea aici
    // `{success:true}` cu justificarea ca „apelantul re-verifica oricum" — dar
    // apelantul folosea exact aceeasi sonda oarba, deci era circular.
    return { success: false, error: `Nu am putut confirma ca zona DNS pentru ${apex} a fost creata. Incearca din nou in cateva minute.` };
  }
  return { success: true };
}

async function ataseazaLaProiect(name: string, body?: Record<string, unknown>): Promise<Rezultat> {
  const { ok, status, data } = await proiectFetch(
    `/v10/projects/${VERCEL_PROJECT_ID}/domains`,
    "POST",
    { name, ...body },
  );
  if (ok) return { success: true };

  /*
   * „Deja adaugat" sunt DOUA lucruri diferite: poate insemna „e al ALTUI cont"
   * sau „e deja pe proiectul NOSTRU". Decizia se ia INTREBAND, si intrebarea e
   * verdictul final — cu o exceptie: daca sonda insasi n-a raspuns (`null`), nu
   * declaram nici succes, nici „e al altcuiva".
   */
  const peAlNostru = await peProiect(name);
  if (peAlNostru === true) return { success: true };
  if (peAlNostru === null) {
    return { success: false, error: `Nu am putut verifica daca ${name} e legat de magazin (${errMessage(status, data)}).` };
  }

  const err = errMessage(status, data);
  const cod = codEroare(data);
  if (cod.includes("domain_already") || /already (in use|exists|added)/i.test(err)) {
    return {
      success: false,
      error: `Domeniul ${name} este deja folosit de alt proiect Vercel si nu poate fi conectat aici. Scoate-l din proiectul acela, apoi incearca din nou. (${err})`,
    };
  }
  await logError({
    action: "vercel.proiect",
    message: `Atasarea lui ${name} la proiect a esuat: ${err}`,
    details: { name, status, corp: data },
    severity: "critical",
  });
  return { success: false, error: err };
}

/**
 * Conecteaza un domeniu custom la magazin.
 *
 * Pasii sunt INDEPENDENTI. Inainte, un esec la zona oprea totul inainte de
 * atasarea la proiect — deci un domeniu ajuns in a treia stare nu mai putea fi
 * conectat niciodata, nici din buton, nici din cron, desi atasarea singura ar fi
 * mers si ar fi facut domeniul functional pe calea A/CNAME.
 *
 * @param metoda `inregistrari` (implicit) nu atinge deloc zona: clientul isi
 *   pastreaza DNS-ul, deci si emailul. `nameservere` cere zona la Vercel, si
 *   fara ea delegarea ar omori domeniul complet.
 */
export async function addDomainToVercel(
  domain: string,
  optiuni: { metoda?: MetodaConectare; poateDetasa?: boolean } = {},
): Promise<Rezultat> {
  const apex = apexOf(domain);
  const isApex = esteApex(apex);
  const metoda = optiuni.metoda ?? "inregistrari";

  let zonaErr: string | undefined;
  if (isApex && metoda === "nameservere") {
    const zona = await creeazaZona(apex, optiuni.poateDetasa ?? true);
    if (!zona.success) zonaErr = zona.error;
  }

  const primary = await ataseazaLaProiect(apex);
  if (!primary.success) {
    // Atasarea e singurul pas fara de care nimic nu functioneaza.
    return { success: false, error: primary.error ?? zonaErr };
  }

  const avertismente: string[] = [];
  if (isApex) {
    const twin = await ataseazaLaProiect(`www.${apex}`, { redirect: apex, redirectStatusCode: 308 });
    if (!twin.success) avertismente.push(`www.${apex} nu a putut fi adaugat: ${twin.error}`);
  }

  /*
   * Zona lipsa e EROARE doar cand clientul si-a mutat deja nameserverele la noi
   * (atunci domeniul chiar e mort). Altfel e avertisment: pe calea A/CNAME
   * domeniul functioneaza perfect fara zona la Vercel.
   */
  if (zonaErr) {
    const ns = await nameservereReale(apex);
    if (arataCatreVercel(ns)) return { success: false, error: zonaErr };
    avertismente.push(zonaErr);
  }

  return { success: true, warning: avertismente.length ? avertismente.join(" ") : undefined };
}

/**
 * Scoate un domeniu custom din PROIECTUL Vercel (apex + geamanul www).
 *
 * Deliberat NU elibereaza domeniul din cont si NU sterge zona: un magazin care
 * reconecteaza acelasi domeniu nu-si pierde inregistrarile DNS (MX-urile lui,
 * printre altele) si nu ramane mort intre timp.
 */
export async function removeDomainFromVercel(domain: string): Promise<Rezultat> {
  const apex = apexOf(domain);

  // PAZA FINALA, indiferent de cine cheama functia: nu stergem niciodata din
  // proiectul Vercel o gazda a platformei.
  if (isPlatformHost(apex)) {
    await logError({
      action: "vercel.proiect",
      message: `BLOCAT: incercare de stergere a gazdei de platforma ${apex}`,
      severity: "critical",
    });
    return { success: false, error: "Domeniul apartine platformei si nu poate fi sters." };
  }

  if (esteApex(apex)) {
    await proiectFetch(`/v9/projects/${VERCEL_PROJECT_ID}/domains/${seg(`www.${apex}`)}`, "DELETE");
  }

  const { ok, status, data } = await proiectFetch(`/v9/projects/${VERCEL_PROJECT_ID}/domains/${seg(apex)}`, "DELETE");
  if (!ok && status !== 404) return { success: false, error: errMessage(status, data) };
  return { success: true };
}

// ─── Citirea starii ───────────────────────────────────────────────────────────

export type DomainStatus = {
  /** Domeniul e in contul Vercel al platformei. */
  inAccount: Verdict;
  /** Vercel are obiectul-zona. ATENTIE: nu dovedeste ca nameserverele o servesc. */
  zone: Verdict;
  /** Apexul e atasat proiectului nostru. */
  inProject: Verdict;
  /** Geamanul „www." e si el atasat. */
  wwwInProject: Verdict;
  /** Vercel considera proprietatea dovedita. */
  verified: boolean;
  /** „Invalid Configuration" al Vercel: DNS-ul nu ajunge la noi pe nicio cale. */
  misconfigured: boolean;
  /** Cum ajunge traficul la noi, dupa Vercel: A | CNAME | http | dns-01 | null. */
  configuredBy: string | null;
  /** Ce ar trebui sa aiba registrarul, direct de la Vercel. */
  intendedNameservers: string[];
  /** Ce nameservere vede LUMEA pentru domeniu, acum. */
  currentNameservers: string[];
  /** Nameserverele arata catre Vercel. */
  delegated: boolean;
  /** IP-urile de A recomandate de Vercel PENTRU ACEST proiect. */
  recommendedIPv4: string[];
  /** Tinta de CNAME recomandata de Vercel PENTRU ACEST proiect. */
  recommendedCNAME: string[];
  /** Ce metoda foloseste clientul DE FAPT, citita din DNS-ul real. */
  metoda: MetodaConectare | null;
  /**
   * ADEVARUL DE TEREN: nameserverele domeniului raspund? `false` = domeniul e
   * mort pentru toata lumea, si site si email, indiferent ce zice API-ul.
   */
  dnsRaspunde: Verdict;
  /** Domeniul e delegat catre noi DAR nu raspunde: e al nostru de reparat. */
  zoneMissing: boolean;
  /** Domeniul chiar serveste magazinul acum. */
  healthy: boolean;
  /** Ceva nu s-a putut citi. Nu inseamna ca domeniul e stricat. */
  error?: string;
};

/*
 * Starea reala a unui domeniu: intrebam si Vercel, si DNS-ul public, si le
 * punem fata in fata. Nimic din produs nu facea asta — `custom_domain` nenul
 * era tratat drept dovada ca domeniul merge, de aceea un magazin a putut sta
 * doua zile mort afisand „Domeniu conectat".
 *
 * Regula peste tot aici: o citire care NU a raspuns nu produce niciodata un
 * verdict negativ.
 */
export async function getDomainStatus(domain: string): Promise<DomainStatus> {
  const apex = apexOf(domain);
  const isApex = esteApex(apex);

  const gol: DomainStatus = {
    inAccount: null, zone: null, inProject: null, wwwInProject: null,
    verified: false, misconfigured: true, configuredBy: null,
    intendedNameservers: [], currentNameservers: [], delegated: false,
    recommendedIPv4: [], recommendedCNAME: [], metoda: null,
    dnsRaspunde: null, zoneMissing: false, healthy: false,
  };

  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
    return { ...gol, error: "VERCEL_TOKEN sau VERCEL_PROJECT_ID nesetate" };
  }

  // `allSettled`, nu `all`: o singura respingere nu mai arunca toata citirea.
  const [contR, zonaR, proiectR, configR, geamanR, nsR, dnsR] = await Promise.allSettled([
    isApex ? contDomeniu(apex) : Promise.resolve(null),
    isApex ? zonaLaVercel(apex) : Promise.resolve<Verdict>(null),
    peProiect(apex),
    // Ruta e la nivel de DOMENIU, nu sub proiect. `strict=true`: altfel raspunsul
    // imprumuta nameserverele zonei parinte si ascunde ca domeniul n-are nimic.
    proiectFetch(`/v6/domains/${seg(apex)}/config?projectIdOrName=${VERCEL_PROJECT_ID}&strict=true`),
    isApex ? peProiect(`www.${apex}`) : Promise.resolve<Verdict>(null),
    nameservereReale(apex),
    zonaRaspunde(apex),
  ]);

  const val = <T,>(r: PromiseSettledResult<T>, implicit: T): T => (r.status === "fulfilled" ? r.value : implicit);

  const cont = val(contR, null);
  const configRez = val(configR, { ok: false, status: 0, data: {} as Record<string, unknown> });

  const rand = cont?.row ?? null;
  const inAccount = cont?.inCont ?? null;
  const zone = val(zonaR, null);
  const inProject = val(proiectR, null);
  // `null`, nu `true`: pentru un subdomeniu nu exista geaman www, deci nu avem ce
  // confirma. `true` fabricat facea diagnosticul sa afirme „x si www.x sunt
  // configurate corect" despre o gazda care nu fusese nici ceruta, nici atasata.
  const wwwInProject = isApex ? val(geamanR, null) : null;
  const currentNameservers = val(nsR, []);
  const dnsRaspunde = val(dnsR, null);

  const intendedNameservers = Array.isArray(rand?.intendedNameservers) ? (rand.intendedNameservers as string[]) : [];

  /*
   * Nameserverele se afla din DOUA surse, si a doua nu e un lux.
   *
   * Cand zona e moarta, interogarea NS catre nameserverele domeniului primeste
   * tot REFUSED, deci `nameservereReale` intoarce lista GOALA — exact pe cazul
   * pentru care avem nevoie de raspuns. Fara sursa a doua, `delegated` iesea
   * `false` tocmai pe esafe.ro, iar `zoneMissing` nu se putea aprinde NICIODATA
   * in scenariul pentru care a fost scris.
   *
   * `rand.nameservers` de pe `GET /v5/domains/{apex}` e ce vede Vercel la
   * REGISTRAR (in zona parinte), deci raspunde si cand zona copil e muta.
   */
  const nsDinCont = Array.isArray(rand?.nameservers) ? (rand.nameservers as string[]) : [];
  const nsVazute = currentNameservers.length > 0 ? currentNameservers : nsDinCont;
  const delegated = arataCatreVercel(currentNameservers) || arataCatreVercel(nsDinCont);

  const configOk = configRez.ok;
  const misconfigured = configOk ? configRez.data.misconfigured === true : true;
  const configuredBy = configOk && typeof configRez.data.configuredBy === "string" ? (configRez.data.configuredBy as string) : null;
  const recommendedIPv4 = configOk ? recomandari(configRez.data.recommendedIPv4) : [];
  const recommendedCNAME = configOk ? recomandari(configRez.data.recommendedCNAME) : [];

  // Metoda se CITESTE din realitate, nu se stocheaza: o coloana se poate
  // desincroniza de la ce a facut clientul efectiv la registrar.
  const metoda: MetodaConectare | null = nsVazute.length === 0 ? null : delegated ? "nameservere" : "inregistrari";

  /*
   * Cazul fatal, si singurul pe care il tratam ca defect AL NOSTRU: clientul si-a
   * mutat nameserverele la Vercel, dar nimeni nu raspunde pentru domeniu. Asta e
   * exact starea esafe.ro. Se cere DOVADA (`false`, nu `null`).
   *
   * `delegated` e OBLIGATORIU, nu optional. Varianta `(delegated || zone === false)`
   * prindea si un domeniu pe A/CNAME al carui registrar a expirat: nu e delegat
   * catre noi, deci nu avem ce zona sa-i cream, dar toti consumatorii tiparesc
   * text care afirma delegarea si trimit clientul sa apese „Repara" degeaba.
   */
  const zoneMissing = dnsRaspunde === false && delegated;

  const necitit: string[] = [];
  if (inAccount === null && isApex) necitit.push("randul din contul Vercel");
  if (inProject === null) necitit.push("atasarea la proiect");
  if (!configOk) necitit.push("configuratia DNS");
  if (dnsRaspunde === null) necitit.push("raspunsul nameserverelor");

  return {
    inAccount, zone, inProject, wwwInProject,
    verified: inProject === true && configOk && !misconfigured,
    misconfigured, configuredBy,
    intendedNameservers, currentNameservers: nsVazute, delegated,
    recommendedIPv4, recommendedCNAME, metoda, dnsRaspunde, zoneMissing,
    // Sanatatea cere DOVEZI pozitive peste tot: un „nu stiu" nu mai trece drept
    // sanatos, si zona nu mai e ignorata complet ca inainte.
    healthy: inProject === true && dnsRaspunde === true && configOk && !misconfigured && !zoneMissing,
    error: necitit.length ? `Nu am putut citi: ${necitit.join(", ")}.` : undefined,
  };
}

/**
 * Verdictul scris in `businesses.custom_domain_healthy`, si singurul loc unde se
 * decide. Doar DOVEZI: `null` inseamna „nu stiu inca", si pe el proxy-ul
 * redirectioneaza mai departe.
 *
 * DE CE E AICI, si nu la fiecare apelant: prima versiune avea doi scriitori
 * (cronul si ruta de status), scrisi separat, si amandoi puneau `false` DOAR pe
 * `dnsRaspunde === false`. Dar aia raspunde la „raspunde CINEVA autoritativ
 * pentru domeniu", nu la „domeniul asta serveste magazinul". `okai.ro` are zona
 * la ird.ro si `alexshop.ro` la cyberfolks — deci amandoua ies `dnsRaspunde:
 * true` si primeau `null`, adica redirect permis mai departe. Poarta din proxy
 * fusese construita citand exact aceste doua domenii si nu se inchidea pentru
 * niciunul.
 */
export function sanatateDomeniu(s: DomainStatus): boolean | null {
  if (s.healthy) return true;

  // Nameservere dovedit mute: domeniul e mort pentru toata lumea.
  if (s.dnsRaspunde === false) return false;

  /*
   * Citire COMPLETA de la Vercel (fara `error`, deci configuratia chiar s-a
   * citit) care spune ca traficul nu ajunge la noi pe NICIO cale. E o dovada
   * negativa la fel de tare ca nameserverele mute.
   *
   * `configuredBy === null` scuteste domeniile care ajung la noi printr-un proxy
   * extern (Cloudflare cu norul portocaliu), unde Vercel raporteaza
   * `misconfigured: true` desi site-ul merge perfect. Fara conditia asta le-am
   * declara cazute si le-am taia redirectul.
   */
  if (!s.error && s.misconfigured && s.configuredBy === null) return false;

  return null;
}

/**
 * Readuce domeniul in starea in care ar fi trebuit sa fie.
 *
 * RE-CITESTE la final si refuza sa raporteze succes daca problema pentru care a
 * fost chemata e tot acolo. Judeca pe citirea de DUPA: conjunctul cu starea de
 * dinainte nu apara de nimic si putea inghiti dovada finala.
 */
export async function repairDomainOnVercel(domain: string): Promise<Rezultat> {
  const apex = apexOf(domain);
  const inainte = await getDomainStatus(apex);

  // Metoda o alege realitatea: daca clientul si-a mutat deja nameserverele la
  // noi, avem NEVOIE de zona; daca e pe DNS extern, zona n-are ce cauta si a
  // cere-o ar fi doar un mod de a esua degeaba.
  const metoda: MetodaConectare = inainte.delegated ? "nameservere" : "inregistrari";

  const adaugat = await addDomainToVercel(domain, { metoda, poateDetasa: true });
  const dupa = await getDomainStatus(apex);

  if (dupa.zoneMissing) {
    return {
      success: false,
      error:
        `Zona DNS pentru ${apex} tot lipseste dupa reparare, iar nameserverele arata catre noi, ` +
        `deci domeniul e cazut complet. Muta-l pe inregistrari A/CNAME din pagina de domenii ` +
        `(nu are nevoie de zona la noi si iti pastreaza emailul), sau scrie-ne.`,
    };
  }
  if (dupa.inProject === false) {
    return { success: false, error: adaugat.error ?? `${apex} tot nu e atasat magazinului dupa reparare.` };
  }
  if (!adaugat.success) return adaugat;

  return { success: true, warning: adaugat.warning };
}
