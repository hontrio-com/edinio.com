// Descarcare aparata de SSRF. Numele se rezolva si adresele private sau
// rezervate se refuza (inclusiv 169.254.169.254, punctul de metadate al norului).
// Redirectarile se URMEAZA, dar cu mana: poarta de adresa se re-cheama pe fiecare
// salt si tot lantul ramane pe https, deci o gazda publica nu ne poate trimite
// spre o tinta interna. Vezi `cereUrmarindRedirectarile`.
// NUMAI PE SERVER (foloseste node:dns / node:net).

import dns from "node:dns/promises";
import http from "node:http";
import net from "node:net";

const MAX_BYTES = 12 * 1024 * 1024; // 12MB / image
const TIMEOUT_MS = 15000;
/** Cat asteptam rezolvarea unui nume. Se aplica pe FIECARE salt. */
const DNS_TIMEOUT_MS = 5000;
const USER_AGENT = "Mozilla/5.0 (compatible; EdinioImport/1.0; +https://edinio.com)";

export type FetchImageResult =
  | { buffer: Buffer; contentType: string }
  | { error: string };

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIpv4(ip);
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    if (low === "::1" || low === "::") return true;
    if (low.startsWith("fe80")) return true; // link-local
    if (low.startsWith("fc") || low.startsWith("fd")) return true; // unique local
    const mapped = low.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIpv4(mapped[1]);
    return false;
  }
  return true;
}

/**
 * Doar porturile web.
 *
 * Fara asta, o gazda PUBLICA ostila putea trimite platforma sa bata la 6379,
 * 11211 sau 5432 si sa deduca ce e deschis dupa felul in care esueaza cererea —
 * scanare de porturi din IP-ul platformei, cu reputatia ei.
 *
 * Sirul gol e OBLIGATORIU in lista: `new URL("https://x/").port` este "",
 * fiindca URL sterge portul implicit.
 */
const PORTURI_PERMISE = new Set(["", "80", "443", "8080", "8443"]);

/**
 * Poarta completa pentru o adresa: intai portul, apoi gazda.
 *
 * ATENTIE, verificat cu Node inainte de a modifica: NU curata parantezele din
 * `u.hostname` pentru literalele IPv6. Par o scapare (`net.isIP("[::1]")` da 0,
 * deci ramura respectiva pare moarta), dar tocmai ele trimit adresa pe drumul
 * prin `dns.lookup`, care o intoarce in forma canonica (`::1`) — singura pe care
 * `isPrivateIp` o recunoaste. Taiate, s-ar pierde normalizarea.
 *
 * Intoarce adresa verificata de care trebuie legata conexiunea, sau `null` cand
 * gazda era deja un IP scris in clar (acolo nu se rezolva nimic, deci nu are ce
 * sa se schimbe intre verificare si conectare).
 */
async function assertAdresaPermisa(u: URL): Promise<string | null> {
  if (!PORTURI_PERMISE.has(u.port)) throw new Error(`blocked:port:${u.port}`);
  return assertPublicHost(u.hostname);
}

async function assertPublicHost(hostname: string): Promise<string | null> {
  const host = hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("blocked:host");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("blocked:ip");
    return null;
  }
  /*
   * Rezolvarea are termen PROPRIU.
   *
   * `AbortController`-ul din apelant ajunge doar la `fetch`. `dns.lookup` nu se
   * uita la niciun semnal — verificat: chemata cu un semnal deja abandonat, se
   * intoarce normal. Iar pe calea cu redirectari se cheama o data pe SALT, deci
   * un DNS lenes putea tine invocarea pana o taia platforma, fara sa se ajunga
   * niciodata la mesajul de termen.
   *
   * `EAI_AGAIN` fiindca `mesajDeRetea` il traduce deja in „nu exista sau nu
   * raspunde", care e exact ce s-a intamplat.
   */
  const records = await Promise.race([
    dns.lookup(host, { all: true }),
    new Promise<never>((_, respinge) =>
      setTimeout(
        () => respinge(Object.assign(new Error("dns timeout"), { code: "EAI_AGAIN" })),
        DNS_TIMEOUT_MS,
      ).unref?.(),
    ),
  ]);
  if (!records.length) throw new Error("blocked:dns");
  for (const r of records) {
    if (isPrivateIp(r.address)) throw new Error("blocked:ip");
  }
  /* IPv4 cand exista: legand conexiunea de o singura adresa pierdem trecerea
     automata a lui Node pe cealalta familie, iar un AAAA pe care functia nu il
     poate rula ar rupe importuri care mergeau. */
  return (records.find((r) => r.family === 4) ?? records[0]).address;
}

const MAX_TEXT_BYTES = 8 * 1024 * 1024; // 8MB / feed, cat si incarcarea manuala

export type FetchFileResult = { buffer: Buffer } | { error: string };

/**
 * Citeste corpul raspunsului IN FLUX si rupe conexiunea in clipa in care se
 * depaseste plafonul.
 *
 * DE CE nu `res.arrayBuffer()`: acela aduce TOT corpul in memorie si abia apoi
 * se putea verifica dimensiunea. Un server ostil (feedul de stoc si importul de
 * produse descarca adrese date de comerciant) putea raspunde fara
 * `Content-Length`, cu `Transfer-Encoding: chunked`, si trimite octeti la
 * nesfarsit — pana cadea functia. Sau ii putea trimite foarte incet, tinand-o
 * ocupata pana la termenul platformei.
 *
 * Cronometrul de abandon NU se opreste aici: apelantul il stinge abia DUPA ce
 * corpul a fost citit, tocmai ca termenul sa acopere si descarcarea, nu doar
 * anteturile.
 */
async function citesteCuPlafon(res: Response, maxOcteti: number): Promise<Buffer | { error: string }> {
  const preaMare = () => ({
    error:
      `Fisierul depaseste ${Math.round(maxOcteti / 1024 / 1024)} MB. Cere-i furnizorului un feed doar cu ` +
      "coloanele necesare (identificator, stoc, pret).",
  });

  const declarat = res.headers.get("content-length");
  if (declarat && Number(declarat) > maxOcteti) {
    /* Scurtatura pe antet: se iese INAINTE de a citi corpul, deci conexiunea
       trebuie eliberata cu mana. Ramura din flux o facea deja. */
    await res.body?.cancel().catch(() => {});
    return preaMare();
  }

  if (!res.body) return { error: "Raspuns gol" };

  const reader = res.body.getReader();
  const bucati: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxOcteti) {
        await reader.cancel().catch(() => {});
        return preaMare();
      }
      bucati.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(bucati);
}

/**
 * Cate redirectari se urmeaza inainte sa spunem ca adresa se invarte in gol.
 *
 * Cinci acopera tot ce am vazut in practica: Google Sheets face un salt,
 * non-www -> www unul, iar un CDN pus peste ele inca unul.
 */
const MAX_REDIRECTARI = 5;

/**
 * Eroarea de retea, spusa pe intelesul comerciantului.
 *
 * `fetch` arunca intotdeauna acelasi `TypeError: fetch failed`, iar motivul
 * adevarat sta in `cause.code`. Fara traducerea asta, TOATE cazurile de mai jos
 * ajungeau la om ca „Descarcare esuata" — un mesaj din care nu se poate repara
 * nimic, fiindca nu spune daca de vina e domeniul gresit scris, certificatul
 * furnizorului sau reteaua.
 *
 * Se citesc AMANDOUA locurile, si nu din prisos: cand numele nu se rezolva,
 * eroarea vine de la `dns.lookup` din `assertPublicHost`, adica INAINTE de
 * `fetch`, si atunci codul sta direct pe eroare, nu intr-o cauza. Domeniul scris
 * gresit e cea mai frecventa greseala de aici, deci exact cazul care s-ar fi
 * pierdut.
 */
function codDeEroare(e: unknown): string {
  const direct = (e as { code?: unknown })?.code;
  if (typeof direct === "string" && direct) return direct;

  const cauza = (e as { cause?: unknown })?.cause;
  if (typeof cauza === "object" && cauza !== null && "code" in cauza) {
    return String((cauza as { code?: unknown }).code ?? "");
  }
  return "";
}

function mesajDeRetea(e: unknown): string {
  const cod = codDeEroare(e);

  switch (cod) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "Domeniul din adresa nu exista sau nu raspunde. Verifica adresa.";
    case "ECONNREFUSED":
      return "Serverul furnizorului a refuzat conexiunea.";
    case "ECONNRESET":
    case "EPIPE":
      return "Serverul furnizorului a inchis conexiunea inainte de a trimite fisierul.";
    case "ETIMEDOUT":
    case "UND_ERR_CONNECT_TIMEOUT":
    case "UND_ERR_HEADERS_TIMEOUT":
    case "UND_ERR_BODY_TIMEOUT":
      return "Serverul furnizorului nu a raspuns la timp.";
    case "CERT_HAS_EXPIRED":
      return "Certificatul de securitate al serverului a expirat. Furnizorul trebuie sa il reinnoiasca.";
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
      return "Certificatul de securitate al serverului nu poate fi verificat.";
    case "ERR_TLS_CERT_ALTNAME_INVALID":
      return "Certificatul de securitate al serverului e emis pentru alt domeniu.";
    case "EPROTO":
    case "ERR_SSL_WRONG_VERSION_NUMBER":
      return "Serverul nu raspunde in https pe aceasta adresa.";
    default:
      /* Codul necunoscut se duce mai departe, altfel al doilea caz de felul
         acesta ne gaseste tot fara nimic in mana. */
      return cod ? `Descarcare esuata (${cod})` : "Descarcare esuata";
  }
}

/**
 * Prima aparitie a unei pagini web acolo unde trebuia sa fie un fisier cu date.
 *
 * Se citesc OCTETII, nu `content-type`: un CSV servit gresit ca `text/html`
 * exista si trebuie sa mearga mai departe, pe cand o pagina de eroare sau de
 * autentificare incepe intotdeauna cu marcajul de mai jos. Fara garda asta un
 * link stricat de Dropbox trecea drept feed bun — masurat: 95 KB, 221 de
 * „randuri" si o singura coloana numita `<!DOCTYPE html>`, pe care omul era pus
 * sa o aleaga drept identificator de produs.
 */
export function pareOPaginaWeb(buffer: Buffer): boolean {
  const brut = buffer.subarray(0, 512).toString("latin1").trimStart();
  const inceput = brut.toLowerCase();

  /*
   * Nu doar `<!doctype html`. Masurat pe corpuri de eroare adevarate, treceau
   * drept feed bun: pagina care incepe cu un comentariu (`<!-- (c) Furnizor -->`),
   * stubul de redirectare care incepe direct cu `<meta http-equiv="refresh">`, si
   * paginile care incep cu `<head` sau `<body`.
   *
   * Un CSV nu incepe cu `<` decat daca prima lui coloana se numeste asa, ceea ce
   * n-am vazut niciodata; un XLSX nu ajunge aici deloc, e recunoscut ca ZIP mai
   * devreme.
   */
  const inceputuriDeMarcaj = ["<!doctype", "<html", "<head", "<body", "<meta", "<!--", "<?xml"];
  if (inceputuriDeMarcaj.some((m) => inceput.startsWith(m))) return true;

  /* JSON: un API care raspunde cu o eroare in loc de fisier. */
  return brut.startsWith("{") || brut.startsWith("[");
}

/**
 * Unde ducem cererea dupa un `Location`, sau de ce ne oprim.
 *
 * Stata separat ca sa poata fi verificata fara retea: partea din bucla care
 * chiar poate fi gresita e regula, nu apelul HTTP. Poarta de adresa
 * (`assertAdresaPermisa`) ramane in bucla si se cheama pe FIECARE salt.
 */
export function urmatorulSalt(
  location: string,
  curent: URL,
  saltCurent: number,
): { url: URL } | { error: string } {
  if (saltCurent >= MAX_REDIRECTARI) {
    return { error: `Adresa redirecteaza de prea multe ori (peste ${MAX_REDIRECTARI}).` };
  }

  let urmatoare: URL;
  try {
    /* `Location` are voie sa fie relativ; se rezolva fata de saltul curent. */
    urmatoare = new URL(location, curent);
  } catch {
    return { error: "Adresa redirecteaza catre o adresa nevalida." };
  }

  /*
   * https pe TOT lantul, nu doar la primul pas.
   *
   * Pe http nu exista nimic care sa lege conexiunea de numele verificat, deci
   * rebinding-ul DNS s-ar redeschide exact pe saltul lasat necontrolat — adica
   * fix gaura pe care o inchide regula „doar https" de la intrare.
   */
  if (urmatoare.protocol !== "https:") {
    return { error: "Adresa redirecteaza catre o adresa care nu e https." };
  }

  /* Acreditarile puse intr-un `Location` se scot: `fetch` refuza sa construiasca
     o cerere dintr-o adresa care le contine, si ar cadea tocmai la mijlocul
     lantului, cu mesajul sec de dinainte. Ce trebuie trimis se trimite ca antet,
     din `cereUrmarindRedirectarile`. */
  urmatoare.username = "";
  urmatoare.password = "";
  return { url: urmatoare };
}

/**
 * Cere adresa, urmarind redirectarile CU MANA.
 *
 * DE CE nu `redirect: "follow"`: `fetch` ar rezolva singur saltul urmator, deci
 * gazda de la capat n-ar mai trece prin `assertAdresaPermisa` — o gazda publica
 * ar putea trimite platforma, printr-un `Location`, direct pe o tinta interna.
 * Asta apara `redirect: "error"`, si de aceea a fost pus acolo.
 *
 * DE CE nu se poate ramane la `redirect: "error"`: refuza si redirectarile
 * cinstite, care sunt REGULA, nu exceptia. Masurat pe cod real:
 * `https://google.com/` (301 non-www -> www) si Google Sheets publicat ca CSV
 * (307 catre `googleusercontent.com`) cadeau amandoua cu „Descarcare esuata".
 * Un comerciant care lipeste linkul unei foi de calcul — calea cea mai la indemana
 * pentru un feed de stoc — nu putea trece de primul ecran.
 *
 * Fiecare salt se verifica din nou, cap-coada, si tot lantul ramane pe https:
 * fara TLS nu exista nimic care sa lege conexiunea de numele verificat, deci
 * rebinding-ul DNS s-ar redeschide exact pe saltul necontrolat.
 */
const ACCEPT_TABELAR =
  "text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/plain, */*";

async function cereUrmarindRedirectarile(
  start: URL,
  semnal: AbortSignal,
  accept: string = ACCEPT_TABELAR,
): Promise<{ res: Response; cuAcreditari: boolean } | { error: string }> {
  /*
   * Acreditarile se MUTA din adresa in antet, inainte de orice cerere.
   *
   * `fetch` refuza din constructie o adresa care le contine — arunca
   * `TypeError: Request cannot be constructed from a URL that includes
   * credentials`, o eroare fara `code` si fara `cause`, deci mesajul iesea exact
   * „Descarcare esuata", in 1 milisecunda, fara sa se fi facut vreo cerere.
   * Masurat pe aceeasi gazda si aceeasi cale: fara acreditari, 5488 de octeti;
   * cu ele, eroarea seaca.
   *
   * Conteaza fiindca forma `https://user:parola@gazda/stoc.csv` e felul obisnuit
   * in care un distribuitor da un feed privat, iar in browser adresa merge — deci
   * comerciantul nu are de unde banui ca tocmai partea cu parola e problema.
   */
  /* `decodeURIComponent` ARUNCA pe un `%` care nu e o secventa valida — iar un
     `%` intr-o parola e cat se poate de obisnuit. Aruncat de aici, iesea tot
     „Descarcare esuata", fara sa se fi facut vreo cerere. */
  const descifra = (v: string) => {
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };

  const acreditari = start.username || start.password
    ? "Basic " +
      Buffer.from(`${descifra(start.username)}:${descifra(start.password)}`).toString("base64")
    : null;

  let u = new URL(start.href);
  u.username = "";
  u.password = "";
  /* Originea de la care s-au primit acreditarile. La un salt care schimba
     originea, antetul se lasa in urma: altfel parola furnizorului ar pleca la
     gazda catre care tocmai am fost redirectati. */
  const origineAcreditari = u.origin;

  for (let salt = 0; salt <= MAX_REDIRECTARI; salt++) {
    await assertAdresaPermisa(u);

    const res = await fetch(u, {
      redirect: "manual",
      signal: semnal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: accept,
        ...(acreditari && u.origin === origineAcreditari ? { Authorization: acreditari } : {}),
      },
      cache: "no-store",
    });

    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    /* „Cu acreditari" inseamna trimise la ACEST raspuns, nu doar prezente in
       adresa: dupa un salt catre alta origine, antetul e lasat in urma, si un
       401 de acolo NU inseamna „parola respinsa". */
    if (!location) return { res, cuAcreditari: acreditari !== null && u.origin === origineAcreditari };

    /* Corpul redirectarii nu ne trebuie, dar conexiunea ramane prinsa pana e
       golita. Se arunca pe loc, nu la bunavointa colectorului. */
    await res.body?.cancel().catch(() => {});

    const pas = urmatorulSalt(location, u, salt);
    if ("error" in pas) return pas;
    u = pas.url;
  }

  /* Nu se ajunge aici: bucla iese pe una din ramurile de mai sus. */
  return { error: `Adresa redirecteaza de prea multe ori (peste ${MAX_REDIRECTARI}).` };
}

/**
 * Descarca un fisier tabelar (CSV sau XLSX) ca octeti bruti.
 *
 * Intoarce octeti, nu text, si asta e esential: un XLSX e o arhiva ZIP, iar citit
 * ca text UTF-8 se strica ireversibil. Cine primeste octetii decide apoi ce e,
 * din semnatura fisierului, nu din extensie.
 */
export async function safeFetchFile(rawUrl: string): Promise<FetchFileResult> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { error: "Adresa nu e o adresa web valida." };
  }

  /*
   * DOAR https, pe calea feed-urilor de stoc.
   *
   * Inchide rebinding-ul DNS (TOCTOU): verificam IP-ul, apoi `fetch` rezolva
   * numele A DOUA OARA, iar intre cele doua un DNS ostil poate raspunde alt IP.
   * Cu TLS, certificatul e validat pe NUME, deci o adresa interna la care ne-ar
   * redirecta rebinding-ul nu poate prezenta un certificat valid pentru gazda
   * ceruta — conexiunea cade inainte sa trimitem sau sa primim ceva.
   *
   * Se aplica aici, nu si la `safeFetchImage`: imaginile de produs vin de la
   * furnizori care inca servesc http, iar refuzul lor ar rupe importuri reale.
   */
  if (u.protocol !== "https:") return { error: "Adresa trebuie sa fie https" };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const cerut = await cereUrmarindRedirectarile(u, controller.signal);
      if ("error" in cerut) return cerut;
      const res = cerut.res;

      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        /* 401/403 sunt cazul cel mai des intalnit si cel mai usor de reparat de
           om, deci nu se lasa la un numar sec. Sfatul difera insa dupa cum a dat
           sau nu un utilizator si o parola: „fa-l public" e un raspuns gresit
           pentru cine tocmai a trimis acreditari si a fost refuzat. */
        if (res.status === 401 || res.status === 403) {
          return {
            error: cerut.cuAcreditari
              ? `Serverul a respins utilizatorul si parola din adresa (HTTP ${res.status}).`
              : `Serverul a refuzat accesul (HTTP ${res.status}). Fie fisierul nu e public, fie serverul furnizorului blocheaza descarcarile automate — cere-i sa permita accesul pentru Edinio (User-Agent: EdinioImport).`,
          };
        }
        if (res.status === 404) return { error: "Adresa nu duce la niciun fisier (HTTP 404)." };
        return { error: `HTTP ${res.status}` };
      }

      const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (contentType.startsWith("image/") || contentType.startsWith("video/")) {
        await res.body?.cancel().catch(() => {});
        return { error: "Adresa nu returneaza un fisier tabelar" };
      }

      const citit = await citesteCuPlafon(res, MAX_TEXT_BYTES);
      if ("error" in citit) return citit;
      if (citit.byteLength === 0) return { error: "Fisier gol" };
      if (pareOPaginaWeb(citit)) {
        return {
          error:
            "Adresa a intors o pagina web, nu un fisier cu date. Foloseste linkul DIRECT catre fisier (CSV sau Excel), nu linkul paginii de descarcare.",
        };
      }

      return { buffer: citit };
    } finally {
      // Abia AICI, ca termenul sa acopere si descarcarea corpului, nu doar
      // anteturile. Inainte se oprea imediat dupa `fetch`, deci un server care
      // trimitea octeti la nesfarsit nu mai era intrerupt de nimic.
      clearTimeout(timer);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("blocked:port")) {
      const port = e.message.split(":")[2] || "";
      return {
        error: `Adresa foloseste portul ${port}, care nu e acceptat. Sunt acceptate 443, 80, 8080 si 8443 — cere-i furnizorului o adresa pe unul dintre ele.`,
      };
    }
    if (e instanceof Error && e.message.startsWith("blocked:")) return { error: "Adresa interzisa" };
    if (e instanceof Error && e.name === "AbortError") {
      return { error: "Serverul furnizorului nu a raspuns in 15 secunde." };
    }
    return { error: mesajDeRetea(e) };
  }
}

/**
 * Cerere `http:` legata de adresa DEJA verificata.
 *
 * DE CE nu `fetch`: `assertAdresaPermisa` rezolva numele o data, iar `fetch` il
 * rezolva A DOUA OARA cand deschide conexiunea. Un DNS ostil cu TTL 0 poate da
 * intre cele doua o adresa interna (rebinding). Pe `https:` nu conteaza,
 * certificatul se valideaza pe NUME si conexiunea cade singura; pe `http:` nu
 * exista nimic care sa lege conexiunea de numele verificat.
 *
 * Solutia e `lookup` fixat: `node:http` intreaba o singura data si primeste exact
 * adresa verificata, iar antetul `Host` ramane cel cerut, deci gazdele virtuale
 * merg mai departe. Cu `fetch` nu se poate: undici sterge un `Host` pus de noi
 * (verificat cu Node), deci varianta "adresa cu IP in loc de gazda" nu tine.
 *
 * Se leaga de O SINGURA adresa verificata (vezi alegerea din `assertPublicHost`):
 * daca gazda are mai multe, nu le mai incercam pe rand — o pierdere mica fata de
 * a trimite cererea unde nu trebuie.
 */
function cereHttpLegatDeIp(u: URL, ip: string, semnal: AbortSignal): Promise<FetchImageResult> {
  const familie = net.isIPv6(ip) ? 6 : 4;

  return new Promise((resolve) => {
    let raspuns = false;
    const gata = (r: FetchImageResult) => {
      if (raspuns) return;
      raspuns = true;
      resolve(r);
    };

    const cerere = http.request(
      {
        hostname: u.hostname.replace(/^\[|\]$/g, ""),
        port: u.port || 80,
        path: `${u.pathname}${u.search}`,
        method: "GET",
        signal: semnal,
        setHost: false,
        headers: { Host: u.host, "User-Agent": USER_AGENT, Accept: "image/*" },
        /* Node cere forma de tablou cand intreaba cu `all`. */
        lookup: (_gazda, optiuni, cheama) =>
          optiuni && optiuni.all
            ? cheama(null, [{ address: ip, family: familie }])
            : cheama(null, ip, familie),
      },
      (mesaj) => {
        const stare = mesaj.statusCode ?? 0;
        /* Redirectarile nu se urmeaza: o gazda publica ne-ar putea trimite cu ele
           spre o tinta interna. `node:http` oricum nu le urmeaza singur. */
        if (stare !== 200) {
          mesaj.resume();
          gata({ error: `HTTP ${stare}` });
          return;
        }

        const contentType = (mesaj.headers["content-type"] ?? "")
          .split(";")[0]
          .trim()
          .toLowerCase();
        if (!contentType.startsWith("image/")) {
          mesaj.destroy();
          gata({ error: "Continut non-imagine" });
          return;
        }

        const bucati: Buffer[] = [];
        let total = 0;
        mesaj.on("data", (bucata: Buffer) => {
          total += bucata.byteLength;
          if (total > MAX_BYTES) {
            mesaj.destroy();
            gata({ error: "Imagine prea mare" });
            return;
          }
          bucati.push(bucata);
        });
        mesaj.on("end", () => {
          if (total === 0) gata({ error: "Imagine goala" });
          else gata({ buffer: Buffer.concat(bucati), contentType });
        });
        mesaj.on("error", () => gata({ error: "Descarcare esuata" }));
      },
    );

    cerere.on("error", (e: Error) =>
      gata({ error: e.name === "AbortError" ? "Timeout" : "Descarcare esuata" }),
    );
    cerere.end();
  });
}

/** Download a remote image with SSRF protection, size/time/content-type limits. */
export async function safeFetchImage(rawUrl: string): Promise<FetchImageResult> {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return { error: "Protocol invalid" };
    const ipVerificat = await assertAdresaPermisa(u);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      /* Fara TLS, conexiunea trebuie legata de adresa verificata; vezi de ce, la
         `cereHttpLegatDeIp`. Gazdele scrise ca IP nu au ce rezolva a doua oara. */
      if (u.protocol === "http:" && ipVerificat) {
        return await cereHttpLegatDeIp(u, ipVerificat, controller.signal);
      }

      /*
       * Redirectarile se urmeaza si aici, pe aceeasi cale ca la feeduri: cu
       * poarta de adresa re-chemata pe FIECARE salt si cu https pe tot lantul.
       *
       * Ramasese pe `redirect: "error"` dupa ce feedurile au trecut la urmarire
       * manuala, iar imaginile de produs stau aproape numai pe CDN-uri care
       * redirecteaza. Rezultatul: rehostarea le rata tacut, si tot cu „Descarcare
       * esuata".
       *
       * Calea `http:` de mai sus ramane fara urmarire, dinadins: acolo conexiunea
       * e legata de un IP verificat, iar un salt ar rupe tocmai legatura aceea.
       */
      const cerut = await cereUrmarindRedirectarile(u, controller.signal, "image/*");
      if ("error" in cerut) return cerut;
      res = cerut.res;

      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        return { error: `HTTP ${res.status}` };
      }

      const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!contentType.startsWith("image/")) return { error: "Continut non-imagine" };

      const citit = await citesteCuPlafon(res, MAX_BYTES);
      if ("error" in citit) return { error: "Imagine prea mare" };
      if (citit.byteLength === 0) return { error: "Imagine goala" };

      return { buffer: citit, contentType };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("blocked:port")) {
      const port = e.message.split(":")[2] || "";
      return {
        error: `Adresa foloseste portul ${port}, care nu e acceptat. Sunt acceptate 443, 80, 8080 si 8443 — cere-i furnizorului o adresa pe unul dintre ele.`,
      };
    }
    if (e instanceof Error && e.message.startsWith("blocked:")) return { error: "Adresa interzisa" };
    if (e instanceof Error && e.name === "AbortError") return { error: "Timeout" };
    return { error: mesajDeRetea(e) };
  }
}
