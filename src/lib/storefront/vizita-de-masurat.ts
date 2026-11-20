import { isNonProductionHost } from "@/lib/storefront/host";

/**
 * Cine intra in statisticile de vizite ale comerciantului („Surse de trafic").
 *
 * ═══ DE CE O REGULA SCRISA O SINGURA DATA ═══
 *
 * Sunt DOUA locuri care insereaza in `site_analytics`: pagina principala
 * (`[slug]/page.tsx`) si pagina de catalog (`pagina-magazin.tsx`). Fiecare isi scria
 * singur conditia, deci o excludere noua pusa doar intr-unul ar fi lasat jumatate din
 * vizitele false pe loc, fara ca vreo cifra sa arate care jumatate.
 */

/**
 * User-agentul cu care santinela (`api/cron/santinela`) cere paginile magazinelor.
 *
 * Santinela il TRIMITE, iar `seMasoaraVizita` il RECUNOASTE, prin aceeasi constanta:
 * schimbat intr-o parte, nu se poate desparti de cealalta.
 */
export const UA_SANTINELA = "edinio-santinela";

/** Antetul cu care Next trimite o actiune de server (`ACTION_HEADER` din `next/dist/client/components/app-router-headers`). */
export const ANTET_ACTIUNE = "next-action";

/**
 * Cererea asta e o actiune de server? Pagina randata in ea e REFACUTA dupa actiune (aceeasi cerere POST), nu deschisa de
 * cineva. Se citeste in randare, din antetele deja luate, niciodata in callbackul lui `after` (vezi
 * `dupa-raspuns-fara-cerere.test.ts`).
 */
export function eCerereDeActiune(anteturi: { get(nume: string): string | null }): boolean {
  return !!anteturi.get(ANTET_ACTIUNE);
}

/**
 * Vizita asta se scrie in statisticile comerciantului?
 *
 *   - proprietarul NU: isi vede propriul magazin, nu e un client;
 *   - gazdele care nu sunt de productie NU (preview, localhost): scriu in baza de
 *     PRODUCTIE, deci fiecare vizita de test ar aparea la comerciant (vezi `host.ts`);
 *   - santinela NU;
 *   - pagina refacuta de o actiune de server NU (`dinActiune`).
 *
 * ═══ ⚠ VEDERILE FANTOMA DE LA PLASAREA COMENZII (20.11.2026) ═══
 *
 * Dupa o actiune de server, Next reface pagina de pe care a plecat, in ACEEASI cerere. Pagina refacuta isi programa din
 * nou evenimentul din `after`, deci fiecare comanda plasata din formularul rapid de pe pagina de produs mai scria una
 * sau doua vederi de produs in aceeasi secunda cu comanda (vazut in productie pe 20.11.2026, la 5 comenzi din 5), iar o
 * comanda din fereastra cosului mai scria o vizita. Palnia numara sesiuni, deci treptele nu se schimbau, dar afisarile
 * si vederile brute cresteau cu fiecare comanda. `dinActiune` e OBLIGATORIU: un loc nou care scrie la randare trebuie
 * sa raspunda la intrebare, nu s-o uite.
 *
 * ═══ ⚠ SANTINELA SCRIA VIZITE FALSE (masurat pe 10.09.2026) ═══
 *
 * Cronul cere paginile fara cookie si pe domeniul propriu, deci trecea de primele doua
 * excluderi. Pe trei zile, in minutele rularilor (la doua ore, din regiunea Stockholm):
 * 252 de vizite „Direct", desktop, din Suedia, la eSAFE, 36 la atelierul-larisei si 36
 * la nordic-outlet-bucovina; in fereastra martor de dupa, zero. Proba descrierilor mai
 * cere patru pagini pe rulare de la un magazin ales dupa marime, adica ~48 de vizite pe
 * zi in plus la un comerciant pe care santinela nu-l atingea. Iar „Surse de trafic" e
 * exact sectiunea dupa care se taie bugete de reclama.
 *
 * ⚠ Egalitate EXACTA, nu „contine": un user-agent care doar pomeneste santinela e al
 * altcuiva, si vizita lui e reala.
 *
 * Randurile deja scrise NU se sterg de aici: e o scriere in baza, o decide proprietarul.
 */
export function seMasoaraVizita(a: {
  esteProprietar: boolean;
  host: string;
  userAgent: string | null | undefined;
  /** Randarea vine dintr-o actiune de server (`eCerereDeActiune`)? Fals pentru o cerere obisnuita si pentru o ruta API. */
  dinActiune: boolean;
}): boolean {
  if (a.dinActiune) return false;
  if (a.esteProprietar) return false;
  if (isNonProductionHost(a.host)) return false;
  if (esteRobot(a.userAgent)) return false;
  return (a.userAgent ?? "").trim() !== UA_SANTINELA;
}

/**
 * Semnele dupa care un user-agent e al unui program, nu al unui om.
 *
 * ⚠ `(?<!cu)bot`, nu `bot`: CUBOT e o marca de telefoane („CUBOT_X30”), iar oamenii cu ele ar fi
 * disparut din statistici. Si NU „facebook” sau „instagram” intregi: browserele din aplicatiile
 * lor (`FBAN/FBIOS`, `Instagram 352...`) sunt oameni; robotii lor se recunosc dupa nume
 * (`facebookexternalhit`, `meta-externalagent`). La fel TikTok: `BytedanceWebview` e om, `Bytespider` nu.
 */
const SEMNE_DE_ROBOT = new RegExp([
  "(?<!cu)bot", "crawl", "spider", "slurp", "fetcher", "scrap", "archiver",
  "mediapartners", "googleother", "inspectiontool", "read-aloud",
  "facebookexternalhit", "facebookcatalog", "meta-external", "whatsapp", "embedly", "link preview", "skypeuripreview",
  "headless", "lighthouse", "pagespeed", "gtmetrix", "ptst", "pingdom", "uptime", "statuscake", "site24x7",
  "synthetics", "prerender", "phantomjs", "puppeteer", "playwright", "selenium", "vercel",
  "curl/", "wget", "python", "go-http-client", "okhttp", "java/", "apache-httpclient", "axios", "node-fetch",
  "undici", "libwww", "httpx", "aiohttp", "postman", "insomnia",
].join("|"), "i");

/**
 * E un program, nu un om?
 *
 * ═══ ⚠ JUMATATE DIN VEDERILE DE PRODUS ERAU ROBOTI (masurat pe 28.10.2026) ═══
 *
 * Pe ultimele 24 de ore, din 11.750 de vederi de produs, 5.602 veneau de la 64 de „vizitatori”
 * cu peste 30 de produse vazute fiecare; unul singur, 902. Google si celelalte crawlere citesc
 * magazinul pagina cu pagina, iar regula de mai sus nu le oprea: Statistici le numara drept
 * oameni, si tot ele ar fi umplut contorul de vizitatori de pe pagina de produs.
 *
 * ⚠ Fara user-agent e tot program: niciun browser nu pleaca fara el.
 *
 * ⚠ Ce scapa (un robot care se da drept browser) ramane numarat. Asta nu se poate deosebi dupa
 * antet, si nu se ghiceste dupa purtare: un om care se uita la 40 de produse e un client bun.
 */
export function esteRobot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  if (!ua) return true;
  return SEMNE_DE_ROBOT.test(ua);
}
