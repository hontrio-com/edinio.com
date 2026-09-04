/**
 * Ce înseamnă o adresă scrisă de un redactor în panoul de blog.
 *
 * ═══ ⚠ DE CE EXISTĂ FIȘIERUL ĂSTA (04.09.2026) ═══
 *
 * Aceeași întrebare — „adresa asta e a noastră sau duce în altă parte?" — era
 * răspunsă în TREI locuri, fiecare cu propria copie a regulii, și toate trei
 * numărau barele de la începutul șirului:
 *
 *     if (s.startsWith("//")) return null;    // altă gazdă
 *     if (s.startsWith("/"))  return s;       // a noastră
 *
 * Regula aia numără bare, iar browserul nu numără bare: parserul WHATWG tratează
 * `\` EXACT ca pe `/` pentru schemele obișnuite. Măsurat:
 *
 *     new URL("/\\rau.example/x", …).hostname   ->  "rau.example"
 *     new URL("\\\\rau.example/x", …).hostname  ->  "rau.example"
 *
 * Deci `/\rau.example/x` începe cu `/` fără să fie `//`, și trecea drept cale
 * internă în toate trei. Ce ieșea din asta:
 *
 *   * `curata.ts` — un `<img>` cu acel `src` rămânea în articol: un pixel care
 *     raportează adresa IP și User-Agent-ul fiecărui cititor la o gazdă străină;
 *   * `imagini.ts` — aceeași adresă era primită pentru copertă, pentru imaginea
 *     de partajare și pentru avatarul autorului, iar Next o face `og:image`
 *     absolut către gazda străină;
 *   * `indemn.ts` — devenea `href`-ul butonului de îndemn din articol. Verificat
 *     în `node_modules/next`: `<Link>` nu atinge șirul, `is-local-url` îl
 *     socotește local (n-are schemă), iar la apăsare `app-router` construiește
 *     `new URL(href, location.href)`, vede altă origine și face `location.assign`
 *     — navigare dură pe gazda străină, și cu JavaScript, și fără.
 *
 * Pe 04.09.2026 a fost reparat DOAR `curata.ts`. Celelalte două au rămas
 * deschise încă o rundă, până când o revizie adversarială le-a numit. De aceea
 * regula stă acum într-un singur loc: o a patra ușă se deschide altfel.
 */

/**
 * Adresa de referință față de care se rezolvă orice cale.
 *
 * Fixă dinadins: o cale care începe cu `/` înseamnă același lucru oriunde ar fi
 * servit articolul, iar o bază care s-ar schimba după gazdă ar face ca aceeași
 * adresă să fie primită pe un domeniu și respinsă pe altul.
 */
export const BAZA_REZOLVARII = "https://www.edinio.com/";

/** Adresa scrisă, rezolvată exact ca de browser. `null` = nu e adresă deloc. */
export function adresaRezolvata(scrisa: string): URL | null {
  try {
    return new URL(scrisa, BAZA_REZOLVARII);
  } catch {
    return null;
  }
}

/**
 * Adresa scrisă, dacă își declară SINGURĂ schema (`https://…`, `mailto:…`).
 *
 * ⚠ NU rezolvă nimic. E deosebirea care contează față de `adresaRezolvata`:
 * `poza.png` nu e o adresă absolută, chiar dacă rezolvată ar cădea pe gazda
 * noastră.
 */
export function adresaAbsoluta(scrisa: string): URL | null {
  try {
    return new URL(scrisa);
  } catch {
    return null;
  }
}

/**
 * Gazda e a noastră? E chiar `edinio.com` sau un subdomeniu al lui.
 *
 * ⚠ `hostname.endsWith("edinio.com")` E GREȘIT, și a fost scris așa până pe
 * 30.08.2026: `notedinio.com` se termină cu „edinio.com". Un domeniu e al nostru
 * dacă E chiar el, sau dacă are PUNCT înaintea lui.
 */
export function esteEdinio(gazda: string): boolean {
  const g = gazda.toLowerCase();
  return g === "edinio.com" || g.endsWith(".edinio.com");
}

/**
 * E o cale a NOASTRĂ, scrisă fără ambiguitate?
 *
 * Două condiții, și amândouă sunt necesare:
 *
 * 1. **Începe cu `/`.** O cale fără bară la început (`poza.png`) e rezolvată de
 *    browser față de ADRESA PAGINII, nu față de rădăcină — deci într-un articol
 *    de la `/blog/{slug}` ar cere `/blog/poza.png`. Înțelesul ei depinde de unde
 *    e citită, deci nu poate fi primită.
 *
 *    ⚠ Asta a fost o regresie a mea, în ziua reparației: rezolvând totul față de
 *    o bază fixă, `poza.png` și chiar șirul GOL cădeau pe gazda noastră și
 *    treceau drept ale noastre. Un `<img src="">` rămânea în articol ca un cadru
 *    gol — chiar lucrul pe care curățătorul îl arunca dinadins.
 *
 * 2. **Rezolvată, cade pe gazda noastră.** Aici pică `//gazdă`, `/\gazdă` și
 *    orice altă scriere care ajunge în altă parte, fără să fie nevoie să le
 *    ghicim pe toate.
 */
export function eCaleInterna(scrisa: string): boolean {
  if (!scrisa.startsWith("/")) return false;
  const u = adresaRezolvata(scrisa);
  return !!u && u.protocol === "https:" && esteEdinio(u.hostname);
}
