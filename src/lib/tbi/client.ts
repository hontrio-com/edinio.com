import { randomBytes } from "node:crypto";
import { ProxyAgent, fetch as fetchUndici } from "undici";
import { adreseleTbi, type TbiConfig } from "./config";
import { cripteazaPentruTbi, type CheieCitita } from "./cripto";
import type { CerereTbi } from "./cerere";

/**
 * Cele doua apeluri catre tbi: trimiterea cererii („Finalize") si anularea ei („CanceledByCustomer").
 * Numai pe server. Credentialele pleaca DOAR criptate, in `order_data` / `orderData`.
 *
 * ═══ FORMA CERERILOR, DIN EXEMPLELE LOR ═══
 *
 * Finalize: `multipart/form-data` cu doua campuri, `order_data` (criptat) si `providerCode` (in clar,
 * acelasi cu `store_id`). Asa trimit si exemplul lor PHP (un tablou dat lui `CURLOPT_POSTFIELDS`) si
 * modulul lor de WooCommerce (care pune anume antetul `multipart/form-data`). Corpul se scrie aici, de
 * mana: cu un `FormData` global dat `fetch`-ului din `undici` (cel cu releu), cele doua copii de
 * undici nu s-ar recunoaste (vezi `lib/emag/auth.ts`), iar campurile sunt oricum doua siruri ASCII.
 *
 * Raspunsul bun e o REDIRECTARE: `301` cu antetul `Location`, adresa paginii lor de cerere, catre
 * care se trimite clientul. De aceea `redirect: "manual"`: urmata automat, redirectarea ar aduce
 * pagina lor in loc de adresa ei. (Masurat: si `fetch`-ul global, si cel din `undici` dau, cu
 * `manual`, raspunsul 3xx cu `Location` citibil.)
 *
 * CanceledByCustomer: `application/x-www-form-urlencoded`, cu `orderData` (criptat) si `encryptCode`
 * (codul magazinului). ⚠ Documentatia isi contrazice numele: exemplul scrie `orderData`/`encryptCode`,
 * randurile de sub el spun `order_data`/`providerCode`. Exemplul e scris de doua ori la fel (in PDF si
 * in „8. Cancel by customer.docx"), randurile de explicatie o data; se trimite forma exemplului.
 * Raspunsul: `{ "isSuccess": true, "error": null }`.
 *
 * ═══ RELEUL CU IP FIX (`TBI_PROXY_URL`) ═══
 *
 * Masurat 15.11.2026: productia tbi raspunde public; serverul lor de TEST nu raspunde deloc din afara
 * (conexiunea expira), deci primeste numai adrese aprobate de ei. Vercel n-are IP de iesire fix. Daca
 * tbi cere o adresa fixa (pentru test sau, mai tarziu, si pentru productie), apelurile pot trece prin
 * acelasi releu CONNECT ca eMAG (`scripts/emag-proxy/`), cu gazdele tbi adaugate in lista lui, iar
 * variabila se pune in Vercel. Nepusa, se iese direct: asa merge productia azi.
 */

const TIMP_MAXIM_MS = 25_000;

type Iesire = { dispatcher: ProxyAgent | null; eroare: string | null };
let releuMemorat: ProxyAgent | null = null;
let adresaReleuMemorata: string | null = null;

function iesireTbi(): Iesire {
  const url = (process.env.TBI_PROXY_URL || "").trim();
  if (!url) return { dispatcher: null, eroare: null };
  if (url !== adresaReleuMemorata) {
    try {
      releuMemorat = new ProxyAgent(url);
      adresaReleuMemorata = url;
    } catch {
      releuMemorat = null;
      adresaReleuMemorata = null;
      return { dispatcher: null, eroare: "Adresa releului catre tbi (TBI_PROXY_URL) nu este valida." };
    }
  }
  return { dispatcher: releuMemorat, eroare: null };
}

type Raspuns = { status: number; location: string | null; corp: string };

async function posteaza(url: string, corp: string, tip: string): Promise<Raspuns> {
  const iesire = iesireTbi();
  if (iesire.eroare) throw new Error(iesire.eroare);
  const init = {
    method: "POST",
    headers: { "Content-Type": tip, Accept: "application/json, text/html;q=0.9, */*;q=0.8" },
    body: corp,
    redirect: "manual" as const,
    signal: AbortSignal.timeout(TIMP_MAXIM_MS),
  };
  const r = iesire.dispatcher
    ? await fetchUndici(url, { ...init, dispatcher: iesire.dispatcher })
    : await fetch(url, init);
  let text = "";
  try {
    text = await r.text();
  } catch {
    text = "";
  }
  return { status: r.status, location: r.headers.get("location"), corp: text };
}

/** Un fragment citibil din raspuns, pentru jurnal: fara HTML, scurt. Nu contine credentiale. */
function fragment(corp: string): string {
  return corp.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}

function corpMultipart(campuri: Record<string, string>): { corp: string; tip: string } {
  const granita = `----edinio${randomBytes(12).toString("hex")}`;
  let corp = "";
  for (const [nume, valoare] of Object.entries(campuri)) {
    corp += `--${granita}\r\nContent-Disposition: form-data; name="${nume}"\r\n\r\n${valoare}\r\n`;
  }
  corp += `--${granita}--\r\n`;
  return { corp, tip: `multipart/form-data; boundary=${granita}` };
}

export type RezultatTrimitere =
  /** tbi a primit cererea si a intors adresa paginii de cerere. */
  | { fel: "redirect"; adresa: string; status: number }
  /** tbi a REFUZAT, dovedit (4xx). Nu s-a creat nimic; reincercarea e sigura dupa o corectura. */
  | { fel: "refuz"; mesaj: string; status: number; detaliu: string }
  /** Nu stim: retea, timp depasit, 5xx, raspuns fara adresa. Cererea poate exista la ei. */
  | { fel: "necunoscut"; mesaj: string; status: number; detaliu: string };

/**
 * Trimite cererea. Cheia publica e deja citita si verificata de apelant (`citesteCheiaPublicaTbi`),
 * ca o cheie stricata sa fie o eroare a configurarii, nu a apelului.
 */
export async function trimiteCererea(
  cfg: Pick<TbiConfig, "sandbox" | "store_id">,
  cheiePublica: CheieCitita,
  cerere: CerereTbi,
): Promise<RezultatTrimitere> {
  const url = adreseleTbi(cfg.sandbox).finalizare;
  const { corp, tip } = corpMultipart({
    order_data: cripteazaPentruTbi(JSON.stringify(cerere), cheiePublica),
    providerCode: cfg.store_id,
  });

  let r: Raspuns;
  try {
    r = await posteaza(url, corp, tip);
  } catch (e) {
    const timp = (e as { name?: string }).name === "TimeoutError";
    return {
      fel: "necunoscut",
      status: 0,
      mesaj: timp
        ? "tbi bank nu a răspuns la timp."
        : cfg.sandbox
          ? "Serverul de test tbi bank nu răspunde: primește doar adrese IP aprobate de echipa tbi."
          : "Nu am putut ajunge la tbi bank.",
      detaliu: (e as Error).message?.slice(0, 300) ?? "",
    };
  }

  if (r.status >= 300 && r.status < 400 && r.location) {
    try {
      const adresa = new URL(r.location.trim(), url);
      if (adresa.protocol === "https:") return { fel: "redirect", adresa: adresa.toString(), status: r.status };
    } catch { /* adresa stricata: cade pe „necunoscut" mai jos */ }
    return { fel: "necunoscut", status: r.status, mesaj: "tbi bank a întors o adresă de redirecționare nesigură.", detaliu: r.location.slice(0, 300) };
  }

  /* Rezerva, ieftina: unele instalari intorc adresa in corp, nu in antet. Numai o adresa https
     goala, nimic altceva in raspuns. */
  const corpCurat = r.corp.trim().replace(/^"|"$/g, "");
  if (r.status >= 200 && r.status < 300 && /^https:\/\/\S+$/i.test(corpCurat)) {
    return { fel: "redirect", adresa: new URL(corpCurat).toString(), status: r.status };
  }

  if (r.status === 401 || r.status === 403) {
    return {
      fel: "refuz", status: r.status, detaliu: fragment(r.corp),
      mesaj: "tbi bank a respins autentificarea: verifică codul magazinului, utilizatorul, parola și cheia publică tbi.",
    };
  }
  if (r.status >= 400 && r.status < 500) {
    return { fel: "refuz", status: r.status, detaliu: fragment(r.corp), mesaj: `tbi bank a refuzat cererea (HTTP ${r.status}).` };
  }
  return {
    fel: "necunoscut", status: r.status, detaliu: fragment(r.corp),
    mesaj: r.status >= 500 ? `tbi bank are o problemă temporară (HTTP ${r.status}).` : "tbi bank nu a întors adresa paginii de cerere.",
  };
}

export type RezultatAnulare =
  | { fel: "anulata" }
  | { fel: "refuz"; mesaj: string; status: number }
  | { fel: "necunoscut"; mesaj: string; status: number };

/**
 * Anuleaza o cerere care nu e inca aprobata. Documentatia: „This method can be used before
 * Approval". Dupa aprobare, anularea se face numai prin tbi.
 */
export async function anuleazaCererea(
  cfg: Pick<TbiConfig, "sandbox" | "store_id" | "username" | "password">,
  cheiePublica: CheieCitita,
  idCerere: string,
): Promise<RezultatAnulare> {
  const url = adreseleTbi(cfg.sandbox).anulare;
  const continut = JSON.stringify({ orderId: idCerere, statusId: "1", username: cfg.username, password: cfg.password });
  const corp = new URLSearchParams({
    orderData: cripteazaPentruTbi(continut, cheiePublica),
    encryptCode: cfg.store_id,
  }).toString();

  let r: Raspuns;
  try {
    r = await posteaza(url, corp, "application/x-www-form-urlencoded");
  } catch (e) {
    const timp = (e as { name?: string }).name === "TimeoutError";
    return { fel: "necunoscut", status: 0, mesaj: timp ? "tbi bank nu a răspuns la timp." : "Nu am putut ajunge la tbi bank." };
  }

  type RaspunsAnulare = { isSuccess?: unknown; error?: unknown };
  let json: RaspunsAnulare | null = null;
  try {
    const brut: unknown = JSON.parse(r.corp);
    json = brut && typeof brut === "object" ? (brut as RaspunsAnulare) : null;
  } catch {
    json = null;
  }
  if (r.status >= 200 && r.status < 300 && json?.isSuccess === true) return { fel: "anulata" };
  const eroareLor = typeof json?.error === "string" && json.error.trim()
    ? json.error.trim().slice(0, 200)
    : json?.error && typeof json.error === "object"
      ? JSON.stringify(json.error).slice(0, 200)
      : "";
  if (r.status >= 200 && r.status < 300 && json?.isSuccess === false) {
    return { fel: "refuz", status: r.status, mesaj: eroareLor ? `tbi bank a refuzat anularea: ${eroareLor}` : "tbi bank a refuzat anularea." };
  }
  if (r.status === 401 || r.status === 403) {
    return { fel: "refuz", status: r.status, mesaj: "tbi bank a respins autentificarea la anulare." };
  }
  if (r.status >= 400 && r.status < 500) {
    return { fel: "refuz", status: r.status, mesaj: eroareLor ? `tbi bank a refuzat anularea: ${eroareLor}` : `tbi bank a refuzat anularea (HTTP ${r.status}).` };
  }
  return { fel: "necunoscut", status: r.status, mesaj: `tbi bank nu a confirmat anularea (HTTP ${r.status}).` };
}
