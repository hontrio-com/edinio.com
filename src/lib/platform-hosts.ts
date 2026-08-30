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

/** Scoate portul si normalizeaza (`Edinio.COM:3000` → `edinio.com`). */
export function bareHost(hostname: string): string {
  return hostname.split(":")[0].trim().toLowerCase();
}

/** True daca gazda e a platformei (panou/site de prezentare), nu a unui magazin. */
export function isPlatformHost(hostname: string): boolean {
  const bare = bareHost(hostname);
  if (PLATFORM_HOSTS.has(bare)) return true;
  return SUFIXE_REZERVATE.some((s) => bare.endsWith(s));
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
