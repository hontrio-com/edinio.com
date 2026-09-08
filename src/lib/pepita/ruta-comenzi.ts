import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { rateLimit } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { formaCheieValida, magazinulCheii } from "./chei";
import { citesteComanda } from "./comanda-forma";
import { citesteConfig } from "./config";
import { ingereaza } from "./ingest";

/**
 * Adresa pe care Pepita IMPINGE comenzile.
 *
 * ═══ ⚠ RASPUNSUL ARE FORMA LOR, NU A NOASTRA ═══
 *
 * Documentatia lor cere, textual:
 *
 *     { "isError": false, "responseCode": 200, "messages": [] }
 *     { "isError": true,  "responseCode": 500, "message": "..." }
 *
 * Exemplele din PDF sunt scrise gresit (ghilimele lipsa, virgule in plus), deci nu
 * se pot copia. Se trimit amandoua cheile, `messages` si `message`, fiindca ei
 * folosesc una la reusita si alta la esec, iar noi nu stim care e citita.
 *
 * ⚠ IN MESAJ NU INTRA NIMIC DIN INTERIOR. Nici erori de la Postgres, nici nume de
 * tabele, nici identificatori, nici bucati din sarcina utila. Detaliul intreg merge
 * in jurnal.
 */

interface RaspunsPepita {
  isError: boolean;
  responseCode: number;
  messages: string[];
  message?: string;
}

function raspunde(status: number, r: RaspunsPepita): Response {
  return new Response(JSON.stringify(r), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function esec(status: number, mesaj: string): Response {
  return raspunde(status, { isError: true, responseCode: status, messages: [mesaj], message: mesaj });
}

/**
 * Cat de mare poate fi corpul unei comenzi.
 *
 * ═══ ⚠ RIDICAT DE LA 512 KB PE 08.09.2026, SI DE CE ANUME LA ATAT ═══
 *
 * Documentatia lor are `package_label`: eticheta de colet, PDF in Base64, CHIAR IN CORPUL
 * comenzii. Base64 umfla cu 4/3, deci cu vechiul plafon orice eticheta peste ~380 KB facea
 * comanda sa cada cu 413 — si nu doar eticheta, TOATA comanda, inainte ca ceva sa fie salvat.
 * Iar „Resend order" e un buton apasat de om, nu o reincercare automata: comanda ramanea pierduta.
 *
 * ⚠ 2 MB, nu „cat sa incapa orice". O eticheta A6 face zeci de kiloocteti; plafonul PROPRIU al
 * etichetei e un megaoctet decodat (`MAX_ETICHETA_OCTETI`), adica ~1,34 MB codat, plus restul
 * comenzii. Doua megaocteti lasa loc si raman departe de cei 4,5 MB la care taie Vercel — acolo
 * cererea moare INAINTE de codul nostru, deci n-am mai avea nici macar un rand in jurnal.
 *
 * ⚠ SI NU E O RIDICARE GRATUITA: plafonul asta apara memoria functiei, iar limitatorul durabil
 * lasa 600 de comenzi pe minut pe magazin. Verificarea pe `content-length` de mai jos taie
 * INAINTE de `req.text()`, tocmai ca un corp urias sa nu fie nici macar citit.
 */
export const MAX_OCTETI = 2 * 1024 * 1024;

/**
 * Corpul primit depaseste plafonul?
 *
 * ⚠ SE MASOARA IN OCTETI, NU IN CARACTERE, si de asta atarna chiar numele constantei.
 * `text.length` numara caractere, iar in UTF-8 un caracter maghiar sau romanesc are doi
 * octeti, iar un emoji patru: un corp de 512.000 de caractere ar fi trecut de plafonul „de
 * 512 KB" cu peste un megaoctet, si ar fi tinut memoria functiei pana la capat.
 *
 * ⚠ E SCOASA AFARA ca sa poata fi probata: verificarea din ruta sta dupa cautarea cheii in
 * baza, deci nu se poate ajunge la ea intr-o proba fara baza.
 */
export function corpPreaMare(text: string): boolean {
  return Buffer.byteLength(text, "utf8") > MAX_OCTETI;
}

export async function primesteComanda(req: Request, cheieBruta: string | null): Promise<Response> {
  /*
   * ⚠ CHEIA SE IA SI DIN CALE, SI DIN INTEROGARE.
   *
   * Noi ii dam adresa cu cheia in CALE: sirurile de interogare ajung in jurnale de
   * server si in unelte de urmarire mai usor decat caile. Dar exemplul din
   * documentatia lor arata `?apikey=...`, deci e cu putinta sa ne ceara forma aceea.
   * Se accepta amandoua; ce nu se face e sa alegem una si sa speram.
   */
  const url = new URL(req.url);
  const cheie = (cheieBruta ?? url.searchParams.get("apikey") ?? url.searchParams.get("api_key") ?? "").trim();
  if (!cheie) return esec(401, "Cheie lipsă.");
  /*
   * ⚠ FORMA SE VERIFICA INAINTE DE ORICE CLIENT DE BAZA. Adresa e publica prin definitie, deci
   * un sir care nici macar nu arata a cheie n-are de ce sa deschida o conexiune.
   *
   * ⚠ Si acelasi raspuns ca la o cheie gresita: din afara, „nu arata a cheie" si „nu e cheia
   * ta" nu trebuie sa se poata deosebi, altfel adresa devine un instrument de ghicit.
   */
  if (!formaCheieValida(cheie)) return esec(401, "Cheie invalidă.");

  /*
   * ⚠ PLAFONUL ARE DOUA TREPTE, si a doua chiar tine.
   *
   * Cea din memorie e per instanta serverless, deci se inmulteste cu numarul de
   * instante calde si se pierde la fiecare desfasurare. Cea din Postgres e globala.
   *
   * ⚠ SI E LARG DINADINS: Pepita poate trimite o rafala de comenzi (o campanie, o
   * dimineata de Black Friday), iar un plafon strans ar fi refuzat exact comenzile
   * pentru care exista integrarea. 300 pe minut inseamna cinci comenzi pe secunda,
   * sustinut; sub asta nu se poate ajunge din vanzari cinstite.
   */
  if (!rateLimit(`pepita:ord:${cheie.slice(0, 24)}`, 300, 60_000)) {
    return esec(429, "Prea multe cereri.");
  }

  const admin = createAdminClient();

  let magazin: Awaited<ReturnType<typeof magazinulCheii>>;
  try {
    magazin = await magazinulCheii(admin, "comenzi", cheie);
  } catch (e) {
    await logError({
      action: "pepita/comenzi",
      message: `nu s-a putut verifica cheia: ${e instanceof Error ? e.message : String(e)}`,
      severity: "critical",
    });
    /* ⚠ 503, ca ei sa reincerce. Un 401 le-ar spune „cheia e gresita” pentru o pana de baza. */
    return esec(503, "Serviciu temporar indisponibil.");
  }
  if (!magazin) return esec(401, "Cheie invalidă.");

  const businessId = magazin.businessId;
  const durabil = await consumaLimita(`pepita:comenzi:${businessId}`, 600, 60, 0);
  if (!durabil.permis) return esec(429, "Prea multe cereri.");

  /*
   * ⚠ MARIMEA SE VERIFICA INAINTE DE CITIRE. `req.text()` pe un corp uriaș ar fi
   * tinut memoria functiei pana la capat. Vercel taie oricum la 4,5 MB, dar o
   * comanda cinstita nu trece de cateva zeci de kiloocteti.
   */
  const lungime = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(lungime) && lungime > MAX_OCTETI) {
    return esec(413, "Conținut prea mare.");
  }

  let brut: unknown;
  try {
    const corp = await req.text();
    if (corpPreaMare(corp)) return esec(413, "Conținut prea mare.");
    if (!corp.trim()) return esec(400, "Corp gol.");
    brut = JSON.parse(corp);
  } catch {
    /* ⚠ Fara sa se spuna CE nu s-a putut citi: mesajul pleaca in afara. */
    return esec(400, "JSON invalid.");
  }

  const verdict = citesteComanda(brut);
  if (!verdict.ok) {
    /*
     * ⚠ SE SCRIE IN JURNAL, cu id-ul lor cand il avem. O comanda respinsa care nu
     * lasa nicio urma e o comanda pierduta despre care nimeni nu poate raspunde.
     */
    await logError({
      action: "pepita/comenzi",
      message: `sarcina utila respinsa: ${verdict.cod}`,
      details: { externalId: verdict.externalId, motiv: verdict.mesaj },
      businessId, severity: "warning",
    });
    return esec(400, verdict.mesaj);
  }

  const { data: setari, error: eSetari } = await admin
    /*
     * ⚠ `currency` E CERUT ANUME. Fara el, moneda magazinului ar veni `undefined`, comparatia
     * din ingest ar tacea exact pe comenzile pentru care exista, si o comanda in alta moneda ar
     * trece drept „importata". Tiparul „ce nu se cere vine undefined" a mai trecut de patru ori.
     */
    .from("store_settings").select("pepita_config, currency").eq("business_id", businessId).maybeSingle();
  /*
   * ⚠ O CITIRE CAZUTA NU E „integrare oprita". Fara randul asta, o pana de doua secunde a
   * bazei ar fi trimis comerciantului mesajul „ai oprit-o tu din panou", iar el l-ar fi
   * crezut si ar fi cautat un comutator care e pornit. 503 spune adevarul, si ei reincearca.
   */
  if (eSetari) {
    await logError({
      action: "pepita/comenzi",
      message: `configurarea nu s-a putut citi: ${eSetari.message}`,
      businessId, severity: "critical",
    });
    return esec(503, "Serviciu temporar indisponibil.");
  }
  const config = citesteConfig((setari as { pepita_config?: unknown } | null)?.pepita_config);

  /*
   * ⚠ INTEGRAREA OPRITA NU INSEAMNA COMANDA ARUNCATA.
   *
   * Comerciantul poate opri integrarea dintr-un clic, iar Pepita poate avea in
   * acelasi minut o comanda platita de un client real. Aruncata, marfa ramane
   * necomandata si banii incasati. Se raspunde 503, adica „mai incearca”: ei
   * reincearca, iar comerciantul are timp sa afle. Ce NU se face e sa se ingereze
   * tacut intr-o integrare pe care omul a inchis-o.
   *
   * ⚠ CHEIA REVOCATA e altceva: acolo raspunsul e 401 mai sus, si e definitiv.
   */
  if (!config.activ) {
    await logError({
      action: "pepita/comenzi",
      message: "comanda a sosit pe o integrare oprita din panou",
      details: { externalId: verdict.comanda.externalId }, businessId, severity: "warning",
    });
    return esec(503, "Integrarea este oprită în magazin.");
  }

  try {
    const monedaMagazin = String((setari as { currency?: string } | null)?.currency ?? "RON").toUpperCase();
    const r = await ingereaza(admin, { businessId, monedaMagazin }, verdict.comanda);

    if (r.stare === "esec") {
      /* ⚠ 503, nu 200: comanda NU s-a scris, iar „Resend order” e singura ei sansa. */
      return esec(503, "Comanda nu a putut fi salvată. Trimiteți din nou.");
    }

    /*
     * ⚠ COMANDA E SCRISA, DAR STOCUL N-A SCAZUT: tot ESEC.
     *
     * Cele doua greseli posibile nu costa la fel. Raspuns „a mers", ei n-au niciun motiv sa
     * retrimita, iar stocul nostru ramane umflat: celelalte cinci canale continua sa vanda
     * marfa care nu mai e. Raspuns „n-a mers", o retrimitere intra pe ramura de duplicat, care
     * duce consumul la capat fara sa creeze nimic a doua oara.
     *
     * ⚠ SI NU NE BIZUIM PE RETRIMITEREA LOR: „Resend order" e un buton apasat de om in panoul
     * lor, nu o reincercare automata. De aceea repararea are si un drum propriu, cronul
     * `pepita-stoc`. Raspunsul de aici e prima sansa, cronul e cea care nu depinde de nimeni.
     */
    if (r.stare === "stoc-nefacut") {
      return esec(503, "Comanda a fost salvată, dar procesarea nu s-a încheiat. Trimiteți din nou.");
    }

    /*
     * ⚠ „carantina” RASPUNDE CU BINE, si e o hotarare, nu o scapare.
     *
     * Comanda E salvata si comerciantul o vede; ce lipseste e legatura unei linii cu
     * un produs din catalog. O retrimitere n-are cum sa repare asta, deci un
     * `isError: true` ar fi produs reincercari fara capat sau, mai rau, i-ar fi facut
     * pe ei sa creada ca n-avem comanda si sa o anuleze.
     *
     * Ce lipseste se SPUNE in `messages`, se scrie in nota interna a comenzii si se
     * ridica in panoul integrarii. Adica nimeni nu afla mai tarziu din vanzari.
     */
    return raspunde(200, { isError: false, responseCode: 200, messages: r.mesaje });
  } catch (e) {
    await logError({
      action: "pepita/comenzi",
      message: `ingestul a cazut: ${e instanceof Error ? e.message : String(e)}`,
      details: { externalId: verdict.comanda.externalId }, businessId, severity: "critical",
    });
    return esec(503, "Serviciu temporar indisponibil.");
  }
}

/**
 * Ce se raspunde la metodele nepotrivite.
 *
 * ⚠ NU O PAGINA DE AUTENTIFICARE si nu un redirect. Adresa e citita de o masina, si
 * un 302 catre `/login` ar fi aratat, in jurnalul lor, ca o integrare care merge.
 */
export function metodaGresita(): Response {
  return raspunde(405, {
    isError: true, responseCode: 405,
    messages: ["Se acceptă doar POST."], message: "Se acceptă doar POST.",
  });
}
