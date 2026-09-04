/**
 * Sursa unica de adevar pentru gazdele care apartin PLATFORMEI (nu unui magazin).
 *
 * Se foloseste in doua locuri cu scopuri opuse, si de aceea trebuie sa fie una
 * singura:
 *   - `src/proxy.ts` intreaba „e gazda platformei?" ca sa decida daca ruteaza
 *     catre panou sau catre un magazin pe domeniu propriu;
 *   - `/api/domains/connect` intreaba „e gazda platformei?" ca sa REFUZE
 *     revendicarea ei de catre un comerciant.
 *
 * Cand cele doua liste erau separate, a doua nici nu exista: un comerciant putea
 * scrie `edinio.com` la „conecteaza domeniu extern", iar la deconectare ruta
 * chema `removeDomainFromVercel("edinio.com")`, care stergea din proiectul Vercel
 * intai `www.edinio.com` si apoi apexul. Panoul, site-ul de prezentare si toate
 * magazinele pe edinio.com/<slug> ramaneau fara ruta si fara certificat.
 */

/** Gazde exacte care apartin platformei. */
export const PLATFORM_HOSTS = new Set([
  "localhost",
  "edinio.com",
  "www.edinio.com",
]);

/** Sufixe rezervate: orice subdomeniu al lor apartine platformei. */
const SUFIXE_REZERVATE = [".edinio.com", ".vercel.app"];

/** Caracterele cu inteles in expresii regulate, scapate. */
function escapaPentruExpresie(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * ACELEASI gazde, scrise ca expresie regulata.
 *
 * ⚠ EXISTA FIINDCA `next.config.ts` NU POATE CHEMA O FUNCTIE. Redirectarile de
 * acolo se filtreaza cu `has: [{ type: "host", value }]`, iar Next construieste
 * din `value` un `new RegExp("^" + value + "$")` pe care il potriveste cu gazda
 * fara port, cu minuscule (`prepare-destination.js`, `matchHas`). Deci acolo se
 * cere un SIR, nu un predicat.
 *
 * Se compune din CHIAR constantele de mai sus, ca sa nu poata exista o a doua
 * listă care se desparte de prima — vezi nota lui `isPlatformHost`. Probele din
 * `redirectari-config.test.ts` confrunta expresia cu functia pe un tabel de gazde.
 *
 * ⚠ O DEOSEBIRE ASUMATA fata de `isPlatformHost`: acolo o gazda GOALA trece
 * drept a platformei; aici nu se poate potrivi nimic, fiindca `matchHas` nici
 * nu ajunge la expresie cand antetul `Host` lipseste. Diferenta cade in partea
 * sigura: o cerere fara gazda nu e redirectata, nu e redirectata gresit.
 */
export const RE_GAZDA_PLATFORMA = `(${[
  ...[...PLATFORM_HOSTS].map(escapaPentruExpresie),
  ...SUFIXE_REZERVATE.map((s) => `.+${escapaPentruExpresie(s)}`),
].join("|")})`;

/** Scoate portul si normalizeaza (`Edinio.COM:3000` → `edinio.com`). */
export function bareHost(hostname: string): string {
  return hostname.split(":")[0].trim().toLowerCase();
}

/**
 * True daca gazda e a platformei (panou/site de prezentare), nu a unui magazin.
 *
 * ⚠ SURSA UNICA. Pana pe 03.09.2026 mai exista o copie in `src/lib/seo.ts`, cu
 * propria lista de gazde, folosita de sitemap si de robots. Doua liste care
 * raspund la aceeasi intrebare se despart la prima gazda adaugata intr-una
 * singura — si atunci proxy-ul ar fi rutat o gazda ca platforma in timp ce
 * sitemapul ar fi servit-o ca magazin. `seo.ts` o re-exporta acum pe asta.
 *
 * O gazda GOALA (`null`, `undefined`, `""`) se considera a platformei. E
 * implicitul sigur mostenit de la copia din `seo.ts`: o cerere fara antet
 * `Host` nu poate fi a unui magazin, iar tratata ca platforma primeste
 * sitemapul si robots-ul platformei, nu un sitemap gol pentru „domeniul" `""`.
 */
export function isPlatformHost(hostname: string | null | undefined): boolean {
  const bare = bareHost(hostname ?? "");
  if (!bare) return true;
  if (PLATFORM_HOSTS.has(bare)) return true;
  return SUFIXE_REZERVATE.some((s) => bare.endsWith(s));
}

/**
 * Gazda de DESFASURARE: o copie a site-ului la `*.vercel.app` (previzualizari
 * de ramura, adresa de proiect). E gazda a platformei pentru rutare, dar nu e
 * o adresa pe care o vrem indexata — nici site-ul, nici vreo vitrina. Proxy-ul
 * pune `X-Robots-Tag: noindex` pe tot ce se serveste de aici.
 */
export function esteGazdaDeDesfasurare(hostname: string | null | undefined): boolean {
  return bareHost(hostname ?? "").endsWith(".vercel.app");
}

/**
 * Cererea e servita chiar pe domeniul PROPRIU al magazinului?
 *
 * Singurul loc unde se raspunde la intrebarea asta. O citesc layout-ul
 * magazinului (ca sa injecteze verificarea Search Console NUMAI acolo, si ca
 * sa puna `noindex` in HTML oriunde altundeva) si toate paginile vitrinei
 * pentru `basePath` — pana pe 04.09.2026 fiecare avea copia ei,
 * `host === business.custom_domain`, fara nicio normalizare.
 *
 * Domeniul e stocat in baza canonic, ca apex si cu minuscule; gazda vine din
 * antetul `Host`, deci se normalizeaza. Varianta `www.` nu ajunge aici: proxy-ul
 * o trimite cu 308 catre apex inainte de randare.
 */
export function esteDomeniulPropriu(hostname: string | null | undefined, customDomain: string | null | undefined): boolean {
  const domeniu = (customDomain ?? "").trim().toLowerCase();
  if (!domeniu) return false;
  return bareHost(hostname ?? "") === domeniu;
}

/**
 * Hostname valid: etichete alfanumerice separate prin punct, cratime doar in
 * interior, TLD de minim 2 litere, maxim 253 de caractere. Refuza schema, port,
 * cale, spatii, caractere Unicode (punycode-ul se scrie explicit `xn--`).
 */
const RE_FQDN = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*\.[a-z]{2,63}$/;

export type VerdictDomeniu = { ok: true; domeniu: string } | { ok: false; motiv: string };

/**
 * Valideaza un domeniu propus de un comerciant si il normalizeaza la apex.
 * Se apeleaza INAINTE de orice apel catre Vercel si inainte de orice scriere.
 */
export function valideazaDomeniuClient(brut: string): VerdictDomeniu {
  const intrare = (brut ?? "").trim().toLowerCase();

  // Refuzam EXPLICIT schema, portul, calea si spatiile interioare, in loc sa le
  // taiem tacit. `bareHost` taie portul pentru rutare (localhost:3000), dar aici
  // e intrare de la utilizator: daca a scris altceva decat un nume de gazda,
  // vrem sa afle, nu sa salvam in tacere altceva decat a cerut.
  if (/[:/\\?#@\s]/.test(intrare)) {
    return {
      ok: false,
      motiv: "Scrie doar numele domeniului, fara https://, fara port si fara cale (ex: magazinul-meu.ro).",
    };
  }

  const domeniu = intrare.replace(/^www\./, "").replace(/\.$/, "");

  if (!domeniu) return { ok: false, motiv: "Introdu un domeniu." };
  if (domeniu.length > 253) return { ok: false, motiv: "Domeniul este prea lung." };
  if (!RE_FQDN.test(domeniu)) {
    return {
      ok: false,
      motiv: "Domeniul nu este valid. Scrie doar numele, fara https:// si fara cale (ex: magazinul-meu.ro).",
    };
  }
  if (domeniu.split(".").length < 2) {
    return { ok: false, motiv: "Domeniul trebuie sa aiba o extensie (ex: .ro, .com)." };
  }
  // Refuzam si apexul, si orice subdomeniu al platformei, si `localhost`.
  if (isPlatformHost(domeniu) || isPlatformHost(`www.${domeniu}`)) {
    return { ok: false, motiv: "Acest domeniu apartine platformei si nu poate fi conectat." };
  }

  return { ok: true, domeniu };
}
