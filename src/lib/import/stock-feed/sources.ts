import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { MAX_FAILURES } from "./types";
import type { StockFeedMapping, StockFeedOptions } from "./types";
import type { StockTotals } from "./committer";

/**
 * Sursele de feed citite automat de la o adresa.
 *
 * Tabelul e creat de `migrations/2026-07-31-stock-feed-sources.sql`, aplicata pe
 * 31 iulie, iar `database.types.ts` a fost regenerat dupa, deci clientul tipizat
 * cunoaste tabelul. Formele de mai jos ramane scrise de mana pentru `mapping` si
 * `options`, care in baza sunt `jsonb`: tipurile generate le dau ca `Json`, iar
 * aici ne trebuie forma lor adevarata.
 */

export const TABLE = "stock_feed_sources";

export type FeedFrequency = "hourly" | "daily";

export interface StockFeedSource {
  id: string;
  business_id: string;
  user_id: string;
  name: string;
  url: string;
  mapping: StockFeedMapping;
  options: StockFeedOptions;
  enabled: boolean;
  frequency: FeedFrequency;
  /** Ora in UTC la care ruleaza sursa zilnica. */
  run_hour: number;
  last_run_at: string | null;
  /**
   * ⚠ DOAR „ok" sau „error". Baza are
   * `CHECK (last_status = ANY (ARRAY['ok','error']))` — verificat in productie,
   * nu presupus. Orice a treia valoare face `patchSource` sa cada, iar
   * `patchSource` nu arunca: marcarea rularii ar fi esuat TACUT, la fiecare
   * rulare, pe toate sursele.
   *
   * „Rularea n-a apucat sa se termine" NU are nevoie de o valoare noua: se
   * citeste din `last_totals.pending > 0`, care spune exact cate randuri au mai
   * ramas. Vezi `UltimaRulare` din ecran.
   */
  last_status: "ok" | "error" | null;
  last_error: string | null;
  last_totals: StockTotals | null;
  last_import_id: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

/* Definita in `types.ts`, ca sa o poata folosi si ecranul. Se re-exporta de
   aici pentru apelantii care o luau dintotdeauna din acest fisier. */
export { MAX_FAILURES } from "./types";

type AnyClient = SupabaseClient<Database>;

/** Tabelul, dintr-un singur loc. */
function table(client: AnyClient) {
  return client.from(TABLE);
}

/*
 * Conversia la granita, si de ce e nevoie de ea.
 *
 * `mapping`, `options` si `last_totals` sunt `jsonb` in baza, iar tipurile
 * generate le dau ca `Json`, adica "orice". Formele adevarate le stim doar noi,
 * din cod. Deci la citire spunem ce e, iar la scriere trecem prin `never`, exact
 * tiparul folosit deja pentru `jsonb` in restul importului.
 *
 * Nu e o gaura de siguranta: valorile scrise vin din tipuri stricte, iar la
 * citire orice forma neasteptata ar fi tot un `jsonb` valid, care oricum trebuie
 * tratat defensiv de apelant.
 */
function asSource(row: unknown): StockFeedSource {
  return row as StockFeedSource;
}

export async function listSources(
  client: AnyClient,
  businessId: string,
): Promise<StockFeedSource[]> {
  const { data, error } = await table(client)
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  /* Aruncam, nu inghitim. Cat timp migratia nu e aplicata, tabelul nu exista, iar
     o lista goala ar arata exact ca "n-ai nicio sursa inca" si ar trimite pe
     nimeni nicaieri. */
  if (error) throw new Error(error.message);

  return (data ?? []).map(asSource);
}

export async function getSource(
  client: AnyClient,
  id: string,
): Promise<StockFeedSource | null> {
  const { data } = await table(client).select("*").eq("id", id).maybeSingle();
  return data ? asSource(data) : null;
}

export async function insertSource(
  client: AnyClient,
  row: Pick<StockFeedSource, "business_id" | "user_id" | "name" | "url" | "mapping" | "options" | "frequency" | "run_hour">,
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await table(client).insert(row as never).select("id").single();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

export async function patchSource(
  client: AnyClient,
  id: string,
  patch: Partial<Omit<StockFeedSource, "id" | "business_id" | "user_id" | "created_at" | "updated_at">>,
): Promise<{ error?: string }> {
  const { error } = await table(client).update(patch as never).eq("id", id);
  return error ? { error: error.message } : {};
}

export async function removeSource(client: AnyClient, id: string): Promise<{ error?: string }> {
  const { error } = await table(client).delete().eq("id", id);
  return error ? { error: error.message } : {};
}

/**
 * Marcheaza rezultatul unei rulari.
 *
 * O sursa care eșueaza de prea multe ori la rand se stinge singura. O adresa
 * moarta nu trebuie cerută in fiecare zi la nesfarsit, iar comerciantul vede in
 * ecran de ce s-a oprit.
 */
export async function markRun(
  client: AnyClient,
  source: StockFeedSource,
  result:
    | { ok: true; importId: string; totals: StockTotals }
    | { ok: false; error: string },
): Promise<void> {
  if (result.ok) {
    await patchSource(client, source.id, {
      last_run_at: new Date().toISOString(),
      last_status: "ok",
      last_error: null,
      last_totals: result.totals,
      last_import_id: result.importId,
      consecutive_failures: 0,
    });
    return;
  }

  const failures = source.consecutive_failures + 1;
  const seStinge = failures >= MAX_FAILURES;

  await patchSource(client, source.id, {
    last_run_at: new Date().toISOString(),
    last_status: "error",
    last_error: result.error,
    /*
     * Cifrele rularii ANTERIOARE se sterg: cardul le afisa neconditionat langa
     * verdict, deci se vedea „Ultima rulare a esuat" si, pe acelasi rand,
     * „1.204 actualizate" — cifre care nu mai descriau nimic.
     *
     * `last_import_id` NU se sterge, desi la prima vedere ar parea la fel de
     * invechit: e singurul maner prin care `runSource` gaseste jobul anterior
     * ramas neterminat, ca sa-l anuleze inainte de a porni unul nou. Sters,
     * planurile vechi ar fi reinviat exact cum se intampla inainte. Ecranul nu
     * arata linkul „Raport" cand ultima rulare a esuat.
     */
    last_totals: null,
    consecutive_failures: failures,
    ...(seStinge ? { enabled: false } : {}),
  });

  /*
   * Fiecare esec lasa urma, nu doar al cincilea.
   *
   * Pana acum nu se scria NIMIC nicaieri: nici in `error_logs`, nici in
   * `notifications`. Sursa se stingea singura dupa cinci rulari, iar singurul
   * semn era o eticheta „oprita" intr-o fila la care comerciantul intra o data
   * pe luna. Intre timp stocurile lui ramaneau vechi.
   */
  logError({
    action: seStinge ? "stockFeed.dezactivataAutomat" : "stockFeed.rulareEsuata",
    message: seStinge
      ? `Feedul „${source.name}" a fost oprit dupa ${failures} rulari esuate. Ultimul motiv: ${result.error}`
      : result.error,
    businessId: source.business_id,
    userId: source.user_id,
    severity: seStinge ? "critical" : "warning",
    details: { sourceId: source.id, url: source.url, failures },
  });

  if (seStinge) {
    /*
     * Si o instiintare in clopotel, ca sa nu depinda de intrarea in fila.
     *
     * ⚠ `notifications` are DOAR `user_id`, `title`, `message`, `type`, `is_read`
     * si `created_at` — verificat in baza, nu presupus. Nu are `business_id` si
     * nu are `link`; scrise, insertul ar fi cazut cu 400, iar `as never` ar fi
     * ascuns greseala si de tsc.
     */
    const { error: eroareNotificare } = await client.from("notifications").insert({
      user_id: source.user_id,
      type: "stock_feed_disabled",
      title: "Un feed de stoc a fost oprit",
      message: `„${source.name}" a esuat de ${failures} ori la rand si a fost oprit. Ultimul motiv: ${result.error}`,
    } as never);

    if (eroareNotificare) {
      logError({
        action: "stockFeed.notificareEsuata",
        message: eroareNotificare.message,
        businessId: source.business_id,
        details: { sourceId: source.id },
      });
    }
  }
}

/**
 * Marcheaza PESIMIST inceputul unei rulari.
 *
 * De ce inainte, si nu doar la final: un fisier care umple memoria omoara
 * PROCESUL, deci nu se prinde in niciun `try/catch` si `markRun` nu se mai
 * executa niciodata. `last_run_at` ramanea vechi, iar `dueSources` ordoneaza
 * crescator dupa el — sursa care ucide invocarea revenea PRIMA la fiecare ora,
 * inaintea celorlalti comercianti din aceeasi tura, iar `consecutive_failures`
 * nu crestea, deci nici dezactivarea automata nu se declansa vreodata. Scris
 * inainte, randul spune deja "a rulat la T si a esuat"; o rulare care chiar se
 * incheie il suprascrie cu adevarul.
 *
 * Dezactivarea automata NU se aplica aici, dinadins: ar stinge o sursa care apoi
 * reuseste in aceeasi rulare, iar ramura de reusita din `markRun` nu reaprinde
 * nimic. Pragul se verifica la INTRAREA urmatoare in `runSource`.
 */
export async function markRunStart(client: AnyClient, source: StockFeedSource): Promise<void> {
  await patchSource(client, source.id, {
    last_run_at: new Date().toISOString(),
    last_status: "error",
    last_error: "Rularea nu s-a incheiat. Se reincearca la tura urmatoare.",
    /*
     * Cifrele vechi se sterg si AICI, nu doar in ramura de esec din `markRun`.
     *
     * Tocmai cazul pentru care exista functia — procesul ucis, deci `markRun` nu
     * mai ruleaza niciodata — lasa sursa cu `last_status: "error"` si cu
     * `last_totals` de la rularea reusita dinainte: „Ultima rulare a esuat"
     * langa „1.204 actualizate".
     *
     * `last_import_id` ramane, din acelasi motiv ca in `markRun`.
     */
    last_totals: null,
    consecutive_failures: source.consecutive_failures + 1,
  });
}

/**
 * Sursele care au ce rula acum.
 *
 * Filtrarea se face in cod, nu in SQL, pentru ca regula depinde de ora curenta
 * si de frecventa; scrisa in SQL ar fi fost o conditie greu de citit si de
 * verificat. Sursele active sunt putine, deci nu conteaza.
 */
export function isDue(source: StockFeedSource, now: Date): boolean {
  if (!source.enabled) return false;
  if (!source.last_run_at) return true;

  const last = new Date(source.last_run_at).getTime();
  const elapsedMs = now.getTime() - last;

  if (source.frequency === "hourly") {
    /* 55 de minute, nu 60: cronul nu bate exact la secunda, iar la 60 fix o
       rulare ar fi sarita in fiecare ora in care cronul intarzie putin. */
    return elapsedMs >= 55 * 60 * 1000;
  }

  /*
   * Zilnic: dupa ora stabilita, si doar daca n-a mai rulat in ultimele 23 de ore.
   *
   * Conditia era `now.getUTCHours() !== source.run_hour -> false`, adica o
   * SINGURA fereastra de o ora pe zi, fara nicio recuperare. Orice motiv pentru
   * care tura de la ora aceea nu ajungea la sursa — cron intarziat de Vercel
   * peste granita orei, o livrare in curs, bugetul turei epuizat, mai mult de
   * cinci surse scadente deodata — insemna o zi intreaga sarita, fara nicio urma
   * nicaieri.
   *
   * Acum ora ei e un „nu mai devreme de", nu un „exact atunci": daca a trecut
   * ora si au trecut 23 de ore de la ultima rulare, sursa e scadenta.
   */
  /*
   * Peste 25 de ore inseamna ca deja a sarit o zi: se recupereaza la ORICE ora.
   *
   * Fara randul asta, o sursa cu `run_hour` tarziu ramanea cu o fereastra
   * ingusta — la 23 avea o singura ora pe zi in care putea fi prinsa — deci o
   * tura ratata insemna inca o zi de stocuri vechi.
   */
  if (elapsedMs >= 25 * 60 * 60 * 1000) return true;

  /*
   * O data pe ZI CALENDARISTICA, nu la fiecare 23 de ore.
   *
   * Pragul de timp singur lasa sursa sa se plimbe: masurat pe cod real, una cu
   * `run_hour = 0` rula la 23:00, apoi la 22:00, apoi la 21:00 — cate o ora mai
   * devreme in fiecare zi, fiindca `getUTCHours() < 0` nu e adevarat niciodata,
   * deci ora ceruta nu o mai tinea in loc. In cateva zile ajungea sa citeasca
   * feedul in mijlocul zilei de lucru a furnizorului.
   *
   * Ziua se compara in UTC, la fel ca `run_hour`.
   */
  const aceeasiZi = new Date(last).toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  if (aceeasiZi) return false;

  if (now.getUTCHours() < source.run_hour) return false;

  /*
   * Prag doar impotriva dublarii, NU de 23 de ore.
   *
   * Cu ancorarea pe zi de mai sus, pragul mare devenea o a doua franghie care
   * trage in partea cealalta: o sursa care ieri a rulat tarziu (recuperare la
   * 11:30) nu mai era scadenta azi la ora ei (4:00), fiindca trecusera doar 17
   * ore — deci recuperarea de ieri ii fura rularea de azi. Proba din
   * `sources-programare.test.ts` a prins exact asta.
   *
   * Douasprezece ore lasa ziua urmatoare sa vina la rand si tot opresc cazul de
   * colt in care o rulare tarzie de seara ar fi urmata imediat de una dupa
   * miezul noptii.
   */
  return elapsedMs >= 12 * 60 * 60 * 1000;
}

export async function dueSources(
  client: AnyClient,
  now: Date,
  limit: number,
): Promise<StockFeedSource[]> {
  const { data, error } = await table(client)
    .select("*")
    .eq("enabled", true)
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(200);

  /*
   * Eroarea se ARUNCA, la fel ca in `listSources` si pentru acelasi motiv: o
   * lista goala arata exact ca „nicio sursa scadenta". Inainte, `error` nici nu
   * era citit, deci o baza care refuza interogarea oprea TOATE feedurile
   * platformei, iar cronul raspundea `{ ok: true, started: 0 }` — la nesfarsit,
   * fara ca nimic sa arate a problema.
   */
  if (error) throw new Error(`Nu am putut citi sursele scadente: ${error.message}`);

  return (data ?? []).map(asSource).filter((s) => isDue(s, now)).slice(0, limit);
}
