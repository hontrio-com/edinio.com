import { esteDomeniulPropriu } from "@/lib/platform-hosts";

/**
 * POARTA DE ORIGINE A ZONEI DE CONT.
 *
 * ⚠⚠ DE CE EXISTA, SI DE CE NU SE CHEAMA „ARE DOMENIU PROPRIU”
 *
 * Pe `www.edinio.com` toate vitrinele fara domeniu propriu impart O SINGURA
 * ORIGINE. Masurat pe 23.09.2026: 57 din cele 70 de magazine publicate sunt
 * acolo. Iar pe fiecare pagina de vitrina, `src/app/(public)/[slug]/layout.tsx`
 * incarca pixelii ALESI DE COMERCIANT (Facebook, TikTok, Google Tag), si cand
 * bannerul de cookie-uri e stins din panou ii incarca neconditionat. Un
 * container Google Tag Manager e executie de JavaScript arbitrar, aleasa de
 * chirias.
 *
 * Deci un script de pe pagina magazinului A poate face, pur si simplu:
 *
 *     fetch('/magazin-B/cont/comenzi', { credentials: 'same-origin' })
 *
 * si sa CITEASCA raspunsul. `httpOnly` nu apara nimic: scriptul nu citeste
 * cookie-ul, il trimite browserul. `sameSite` nu se aplica, e same-site. CORS nu
 * se aplica, e same-origin. Nici scoaterea pixelilor de pe paginile de cont nu
 * ajuta (atacul vine de pe ALTA pagina), nici cererea de navigare de document
 * (`window.open` catre aceeasi origine da acces la DOM), nici un jeton tinut in
 * `localStorage` (aceeasi origine, acelasi `localStorage`).
 *
 * Pe o origine comuna cu JavaScript ales de chiriasi NU EXISTA izolare. Singurul
 * raspuns e separarea originilor.
 *
 * ⚠ NUMELE E ALES ANUME. Regula NU e „magazinul are domeniu propriu”, ci
 * „cererea a venit pe o origine care e numai a acestui magazin”. Cand va aparea
 * `<slug>.edinio.com` (valul 3, vezi docs/redesign/CONTURI-CLIENTI.md capitolul
 * 14), se adauga o a doua ramura CHIAR AICI si nimic din zona de cont nu se
 * rescrie. Un nume ca `areDomeniuPropriu` ar fi ascuns exact locul acela.
 *
 * ⚠ SI SE ASEAZA SINGURA, fara niciun rand nou in `src/proxy.ts`:
 *   - magazinele cu domeniu sanatos primesc oricum 307 de pe originea platformei
 *     catre domeniul lor, deci `www.edinio.com/<slug>/cont` ajunge la
 *     `magazin.ro/cont` inainte sa ruleze ceva;
 *   - daca un domeniu e masurat CAZUT, proxy-ul serveste inapoi pe originea
 *     comuna, iar verificarea de mai jos inchide contul in aceeasi clipa.
 *     Cade INCHIS, singura.
 */
export function originaEsteNumaiAMagazinului(
  host: string | null | undefined,
  business: { custom_domain: string | null },
): boolean {
  return esteDomeniulPropriu(host, business.custom_domain);
  // Valul 3 adauga aici: || esteSubdomeniulMagazinului(host, business.slug)
}

/**
 * Comutatorul din Setari (H2), citit dintr-un `store_settings.cont_client_config`.
 *
 * ⚠ Stins implicit, si „stins” inseamna 404 pe rute, nu doar un link ascuns.
 * ⚠ Nu se bizuie pe forma valorii: orice altceva decat `true` inseamna stins.
 */
export function conturilePornite(config: unknown): boolean {
  if (!config || typeof config !== "object") return false;
  return (config as { enabled?: unknown }).enabled === true;
}

/**
 * Poate magazinul asta sa APRINDA conturile?
 *
 * Se foloseste in Setari, ca sa se arate comutatorul stins si neapasabil, cu
 * motivul scris langa el, in loc sa fie aprins degeaba.
 */
export function poateAprindeConturi(business: {
  custom_domain: string | null;
  custom_domain_healthy: boolean | null;
}): { poate: boolean; motiv?: string } {
  if (!business.custom_domain) {
    return {
      poate: false,
      motiv: "Conturile de client cer un domeniu propriu. Conecteaza-l din Setari, Domenii, si comutatorul se deschide.",
    };
  }
  if (business.custom_domain_healthy === false) {
    return {
      poate: false,
      motiv: "Domeniul magazinului nu raspunde, iar pana se repara vitrina e servita pe adresa Edinio, unde conturile nu se pot deschide.",
    };
  }
  return { poate: true };
}
