import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { rateLimit } from "@/lib/utils/rate-limit";
import { hontrioConfigurat } from "./config";
import { conexiuneaJetonului, marcheazaFolosirea } from "./conexiuni";
import { formaJetonuluiValida } from "./jetoane";

/**
 * Trunchiul comun al rutelor de citire `/api/hontrio/v1/*`: raspunsurile, jetonul, parametrii.
 *
 * ⚠ TOATE RASPUNSURILE PLEACA PRIN `raspuns`, ca sa poarte aceleasi antete. Datele unui magazin
 * (catalog, comenzi) nu au ce cauta in niciun cache intermediar, si nici in indexuri.
 */

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Mesajul unei erori, si cand nu e `Error`.
 *
 * ⚠ Erorile supabase-js (`PostgrestError`) sunt obiecte simple, nu `Error`: cu
 * `e instanceof Error ? e.message : String(e)` in jurnal ar fi ajuns „[object Object]".
 */
export function mesajul(e: unknown): string {
  if (e instanceof Error) return e.message;
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === "string" ? m : String(e);
}

export function raspuns(corp: unknown, status = 200, antete: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corp), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-robots-tag": "noindex, nofollow",
      ...antete,
    },
  });
}

/** Eroarea rutelor de citire: un cod stabil pentru masina si o fraza pentru om. */
export function eroare(status: number, cod: string, mesaj: string, antete: Record<string, string> = {}): Response {
  return raspuns({ eroare: cod, mesaj }, status, antete);
}

/** RFC 6750 (3): fara jeton sau cu jeton bun dar necunoscut, raspunsul spune schema asteptata. */
function neautorizat(): Response {
  return eroare(401, "jeton_invalid", "Jetonul lipsește, a fost revocat sau nu este valid.", {
    "www-authenticate": 'Bearer realm="edinio", error="invalid_token"',
  });
}

export function jetonulDinCerere(req: Request): string | null {
  const antet = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)\s*$/i.exec(antet);
  return m ? m[1] : null;
}

export interface CerereAutentificata {
  admin: Admin;
  businessId: string;
  conexiuneId: string;
}

/**
 * Jetonul cererii, verificat, sau raspunsul de refuz.
 *
 * Ordinea e dinadins asa, de la ieftin la scump: legatura pornita, forma jetonului, plafonul,
 * abia apoi baza. Un sir care nici macar nu arata ca un jeton nu ajunge sa porneasca o interogare.
 */
export async function autentifica(req: Request, ruta: string): Promise<CerereAutentificata | Response> {
  if (!hontrioConfigurat()) {
    return eroare(503, "indisponibil", "Legătura cu Hontrio este oprită momentan.", { "retry-after": "300" });
  }
  const jeton = jetonulDinCerere(req);
  if (!jeton || !formaJetonuluiValida(jeton)) return neautorizat();

  /*
   * ⚠ PLAFONUL E LARG DINADINS: o sincronizare completa citeste zeci de pagini la rand, iar un plafon
   * strans ar taia tocmai prima sincronizare, cea care aduce tot catalogul. E per instanta (vezi
   * `rateLimit`), deci o plasa impotriva unei bucle scapate, nu o cota.
   */
  if (!rateLimit(`hontrio:api:${jeton.slice(0, 16)}`, 300, 60_000)) {
    return eroare(429, "prea_multe_cereri", "Prea multe cereri. Reîncearcă peste un minut.", { "retry-after": "60" });
  }

  const admin = createAdminClient();
  let conexiune: Awaited<ReturnType<typeof conexiuneaJetonului>>;
  try {
    conexiune = await conexiuneaJetonului(admin, jeton);
  } catch (e) {
    /* ⚠ O citire cazuta NU e un jeton gresit: 503 ii spune lui Hontrio „mai incearca", 401 „reconecteaza". */
    await logError({
      action: `hontrio/${ruta}`,
      message: `nu s-a putut verifica jetonul: ${mesajul(e)}`,
      severity: "error",
    });
    return eroare(503, "indisponibil", "Nu am putut verifica jetonul. Reîncearcă.", { "retry-after": "30" });
  }
  if (!conexiune) return neautorizat();

  await marcheazaFolosirea(admin, conexiune);
  return { admin, businessId: conexiune.businessId, conexiuneId: conexiune.id };
}

/* ═══════════════════════════════════════════════════════════════════════════
   PARAMETRII DE PAGINARE
   ═══════════════════════════════════════════════════════════════════════════ */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Paginare {
  /** Ultimul `id` din pagina de dinainte. Paginarea merge pe `id`, crescator. */
  dupa: string | null;
  /** Numai randurile schimbate de atunci incoace (`updated_at >= ...`). */
  actualizateDupa: string | null;
  limita: number;
}

/**
 * Parametrii unei liste, sau un mesaj de eroare pentru Hontrio.
 *
 * ═══ ⚠ DE CE `dupa` E UN ID, SI NU O DATA ═══
 *
 * Hontrio cere „tot ce s-a schimbat de la X" si citeste paginile in ordinea `id`-ului. Un rand
 * schimbat CHIAR IN TIMPUL citirii poate cadea in urma cursorului si sa lipseasca din trecerea asta,
 * dar `updated_at`-ul lui e atunci mai nou decat inceputul ei, deci il aduce sigur trecerea
 * urmatoare (Hontrio porneste fiecare trecere de la inceputul celei dinainte, cu cateva minute de
 * suprapunere). Un cursor pe data ar fi cerut o pereche (data, id) scrisa in filtrele PostgREST, cu
 * toate capcanele de codare ale unei date cu fus orar.
 */
export function citestePaginarea(
  p: URLSearchParams, limite: { implicit: number; maxim: number },
): Paginare | { eroare: string } {
  const dupa = p.get("dupa");
  if (dupa !== null && !UUID.test(dupa)) return { eroare: "`dupa` trebuie să fie id-ul ultimului rând primit." };

  const actualizateDupa = p.get("actualizate_dupa");
  let actualizate: string | null = null;
  if (actualizateDupa !== null) {
    const t = Date.parse(actualizateDupa);
    if (!Number.isFinite(t)) return { eroare: "`actualizate_dupa` trebuie să fie o dată ISO 8601." };
    actualizate = new Date(t).toISOString();
  }

  const limitaBruta = p.get("limita");
  let limita = limite.implicit;
  if (limitaBruta !== null) {
    const n = Number(limitaBruta);
    if (!Number.isInteger(n) || n < 1 || n > limite.maxim) {
      return { eroare: `\`limita\` trebuie să fie un număr întreg între 1 și ${limite.maxim}.` };
    }
    limita = n;
  }
  return { dupa: dupa ? dupa.toLowerCase() : null, actualizateDupa: actualizate, limita };
}

/** Raspunsul unei rute care a cazut la mijloc: urma in jurnal, 503 pentru Hontrio. */
export async function picat(ruta: string, businessId: string, e: unknown): Promise<Response> {
  await logError({
    action: `hontrio/${ruta}`,
    message: mesajul(e),
    businessId,
    severity: "error",
  });
  return eroare(503, "indisponibil", "Datele nu au putut fi citite. Reîncearcă.", { "retry-after": "30" });
}
