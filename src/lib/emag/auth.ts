/**
 * Acreditari, adrese si iesirea pe IP fix pentru eMAG Marketplace.
 *
 * Fiecare comerciant isi face in panoul lui eMAG un utilizator cu DREPT DE API si
 * il lipeste in Edinio. Autentificarea e HTTP Basic peste `base64(user:parola)`.
 */

import { ProxyAgent } from "undici";
import { EMAG_TARA_IMPLICITA, type EmagTara } from "./types";

/**
 * Gazda, pe tara.
 *
 * ⚠ NU se pune `/api-3` aici. Vezi `emagUrl` mai jos: patru rute din documentatia
 * lor isi poarta singure prefixul, iar lipit peste cel din gazda ar da
 * `/api-3/api-3/...` si un 404 fara nicio explicatie.
 */
const GAZDE: Record<EmagTara, string> = {
  ro: "https://marketplace-api.emag.ro",
  bg: "https://marketplace-api.emag.bg",
  hu: "https://marketplace-api.emag.hu",
};

export function emagGazda(tara?: EmagTara): string {
  const t = tara ?? EMAG_TARA_IMPLICITA;
  const din_env = process.env[`EMAG_BASE_URL_${t.toUpperCase()}`];
  return (din_env || GAZDE[t]).replace(/\/$/, "");
}

/**
 * Adresa intreaga a unei rute.
 *
 * ⚠ DOUA FELURI DE CAI, si e o scapare din OpenAPI-ul lor, nu o alegere a noastra.
 * Cele mai multe rute sunt scrise relativ la serverul `…/api-3` (`/order/read`),
 * dar patru dintre ele isi poarta prefixul in cale: `/api-3/invoice/read`,
 * `/api-3/invoice/categories`, `/api-3/customer-invoice/read`,
 * `/api-3/smart-deals-price-check`. Lipite peste server, ar iesi
 * `https://marketplace-api.emag.ro/api-3/api-3/invoice/read`.
 *
 * Verificat in fisierul lor: cele patru NU au `servers` propriu care sa explice
 * diferenta. Deci se rezolva aici, o data, si nimeni nu mai are de ghicit.
 */
export function emagUrl(tara: EmagTara | undefined, cale: string): string {
  const gazda = emagGazda(tara);
  return cale.startsWith("/api-3/") ? `${gazda}${cale}` : `${gazda}/api-3${cale}`;
}

/** Intrerupatorul general al integrarii. `EMAG_LIVE="false"` o ascunde peste tot. */
export function emagGloballyEnabled(): boolean {
  return process.env.EMAG_LIVE !== "false";
}

/** Antetul Basic: `base64(utilizator:parola)`. */
export function basicAuthHeader(username: string, password: string): string {
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
}

/* ═══════════════════════════════════════════════════════════════════════════
   IESIREA PE IP FIX
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ═══ ⚠ EMAG ACCEPTA APELURI DOAR DE LA IP-URI ALBITE ═══
 *
 * Documentatia lor: „the API has IP-level filtering — sellers must provide a list
 * of whitelisted IPs before testing". Edinio ruleaza pe Vercel, unde functiile NU
 * au IP de iesire fix. Deci fara un punct de iesire stabil, integrarea nu merge
 * pentru NICIUN comerciant, iar raspunsul primit nu spune de ce.
 *
 * Solutia e un proxy CONNECT propriu, cu IP fix, dat prin `EMAG_PROXY_URL`.
 *
 * ═══ DE CE CONNECT SI NU UN RELEU CARE REFACE CERERILE ═══
 *
 * La `CONNECT`, proxy-ul deschide doar un tunel: TLS-ul ramane CAP LA CAP intre
 * Edinio si eMAG, deci proxy-ul nu vede niciodata parola eMAG a comerciantului.
 * Un releu care termina TLS ar fi devenit al doilea loc din care se pot citi
 * credentialele TUTUROR comerciantilor. Aceeasi cantitate de infrastructura,
 * raza de explozie mult mai mare.
 *
 * ═══ ⚠ SE FOLOSESTE `fetch`-UL DIN `undici`, NU CEL GLOBAL ═══
 *
 * Si asta a fost gasit prin proba, nu prin citit. Node 24 are propria copie de
 * undici, incorporata (`node:internal/deps/undici`). `fetch`-ul global e al ei.
 * Un `ProxyAgent` construit din pachetul `undici` instalat de noi e un obiect din
 * ALTA copie, iar copia interna nu-l recunoaste:
 *
 *     fetch('https://example.com', { dispatcher: proxyExtern })
 *       -> TypeError: fetch failed, cause UND_ERR_INVALID_ARG
 *
 * Masurat: fara `dispatcher` iese 200; cu el, eroarea de mai sus. Adica cererea NU
 * pleaca prin proxy si NU ajunge nici la destinatie — pica, si mesajul „fetch
 * failed" nu spune nimic despre cauza.
 *
 * Cu `fetch`-ul EXPORTAT DE PACHET, amandoua sunt din aceeasi copie, iar un proxy
 * inchis da cinstit `ECONNREFUSED`. De aceea `client.ts` importa
 * `fetch as fetchUndici` din `undici` si nu foloseste niciodata globalul.
 */
let dispatcherMemorat: ProxyAgent | null = null;
let urlMemorat: string | null = null;

export interface IesireEmag {
  dispatcher: ProxyAgent | null;
  /** Ce nu e in regula, daca e ceva. `null` cand se poate porni. */
  eroare: string | null;
}

export function iesireEmag(): IesireEmag {
  const url = (process.env.EMAG_PROXY_URL || "").trim();

  if (!url) {
    /*
     * ⚠ Se OPRESTE, nu se incearca direct. O cerere plecata de la un IP nealbit
     * primeste de la eMAG un raspuns care nu pomeneste nimic despre IP-uri, iar
     * comerciantul si noi am cauta in acreditari o zi intreaga. Mai bine un
     * mesaj limpede, de la noi, inainte de prima cerere.
     */
    return {
      dispatcher: null,
      eroare:
        "Ieșirea către eMAG nu este configurată (EMAG_PROXY_URL). " +
        "eMAG acceptă apeluri doar de la adrese IP declarate în prealabil.",
    };
  }

  if (url !== urlMemorat) {
    dispatcherMemorat = new ProxyAgent(url);
    urlMemorat = url;
  }

  return { dispatcher: dispatcherMemorat, eroare: null };
}

/**
 * IP-ul pe care comerciantul trebuie sa-l albeasca in contul lui eMAG.
 *
 * Se arata in pagina de conectare, ca prerechizit. E scris separat de
 * `EMAG_PROXY_URL` dinadins: adresa proxy-ului contine acreditari si n-are ce
 * cauta pe un ecran, iar IP-ul public poate sa difere de gazda din adresa.
 */
export function emagIpDeAlbit(): string | null {
  return (process.env.EMAG_PROXY_IP || "").trim() || null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MONEDA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Moneda platformei.
 *
 * ⚠ BULGARIA TRECE DE LA BGN LA EUR PE 1 IANUARIE 2026. E scrisa ca functie de
 * DATA, nu ca o constanta, tocmai fiindca o constanta ar fi ramas corecta pana
 * intr-o noapte si apoi ar fi mintit fara sa dea nicio eroare — preturile s-ar fi
 * trimis in moneda gresita.
 */
export function monedaEmag(tara: EmagTara, acum: Date = new Date()): "RON" | "EUR" | "HUF" | "BGN" {
  if (tara === "ro") return "RON";
  if (tara === "hu") return "HUF";
  return acum >= new Date("2026-01-01T00:00:00Z") ? "EUR" : "BGN";
}

/** Ascunde o acreditare pentru afisare. Nu se trimite niciodata valoarea intreaga. */
export function maskSecret(secret: string): string {
  const k = (secret || "").trim();
  if (k.length <= 8) return "••••";
  return `${k.slice(0, 3)}••••${k.slice(-2)}`;
}

/**
 * Adresa la care eMAG trimite notificarile.
 *
 * Calea nu poarta numele furnizorului, ca la Trendyol: unele marketplace-uri
 * refuza la inregistrare adresele care contin numele lor.
 */
export function emagWebhookUrl(businessId: string): string {
  const baza = (process.env.EMAG_WEBHOOK_BASE || "https://www.edinio.com").replace(/\/$/, "");
  return `${baza}/api/emag/webhook?businessId=${encodeURIComponent(businessId)}`;
}
