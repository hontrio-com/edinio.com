import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { EroareCitireBaza, randuriCitite } from "@/lib/supabase/rand-citit";
import { EroareTrecatoare } from "./erori";
import { extractOrderNumber, ingestOrderByNumber } from "./orders";
import { handleProductMasterStatus, handleStockUpdated } from "./webhooks";
import type { AboutYouConfig } from "./types";

/**
 * Evenimentele de webhook care n-au apucat sa fie prelucrate.
 *
 * ═══ ⚠ DE CE EXISTA UN INBOX (26.08.2026) ═══
 *
 * About You reincearca livrarea vreo doua zile daca nu primeste un raspuns bun. Ruta noastra
 * raspundea insa `200` pe toate caile, inclusiv cand ingestia pica. Pentru ei, evenimentul era
 * livrat: nu-l mai reincercau. Iar sondarea nu-l poate recupera, fiindca filtreaza dupa data
 * CREARII comenzii — deci o expediere sau o anulare pierduta era pierduta DEFINITIV.
 *
 * Acum ruta SCRIE evenimentul, apoi incearca sa-l prelucreze pe loc. Cand prelucrarea pica, randul
 * ramane neprelucrat, iar pasul asta il reia.
 *
 * ⚠ ARE UN PLAFON DE INCERCARI. Un eveniment care nu se poate prelucra niciodata — o comanda care
 * la ei nu mai exista, o sarcina utila pe care n-o intelegem — ar fi reluat la fiecare trecere,
 * pentru totdeauna, si ar tine locul celor care chiar se pot rezolva.
 */
/**
 * Prelucrarea propriu-zisa, chemata si din ruta (calea rapida), si din cron (reluarea).
 *
 * ⚠ ARUNCA la esec: apelantul hotaraste ce face. Ruta scrie eroarea pe randul de inbox si
 * raspunde oricum `200` — evenimentul e deja in siguranta. Cronul o reia.
 */
export async function prelucreazaEveniment(
  admin: SupabaseClient<Database>, businessId: string, cfg: AboutYouConfig, event: unknown,
): Promise<void> {
  const e = (event ?? {}) as { event?: string; type?: string };
  const name = e.event ?? e.type;
  const ctx = cfg.api_key
    ? { auth: { apiKey: cfg.api_key, environment: cfg.environment }, config: cfg, businessId }
    : null;

  if (name === "stock.updated") {
    await handleStockUpdated(admin, businessId, event as never);
  } else if (name === "product_master.status_updated") {
    // Singura cale prin care motivele de respingere ajung la noi fara sa mai
    // intrebam: `GET /products/` nu le contine deloc.
    await handleProductMasterStatus(admin, businessId, event as never);
  } else if (name && name.startsWith("order")) {
    /*
     * ⚠ FARA CHEIE, EVENIMENTUL NU SE PIERDE IN TACERE. Conditia era `&& ctx`: un magazin caruia
     * i s-a invalidat cheia trecea prin toate ramurile fara sa faca nimic, iar randul din inbox
     * primea `prelucrat_la`. Se arunca, deci evenimentul asteapta reconectarea.
     */
    if (!ctx) throw new Error("magazinul nu are cheie About You: evenimentul de comanda ramane neprelucrat");
    const orderNumber = extractOrderNumber(event as never);
    if (orderNumber) {
      await ingestOrderByNumber(admin, ctx, orderNumber);
    } else {
      /*
       * Evenimentele `order_items.*` NU poarta numarul comenzii: sarcina lor e un
       * `GetShipmentSchema` — `{items, carrier_key, tracking_key,
       * return_tracking_key}`. Codul cauta `order_number`, nu-l gasea si iesea
       * tacut, deci expedierile si retururile pe articole nu ajungeau niciodata.
       * Comanda o gasim dupa id-urile articolelor, pe care le avem deja salvate.
       */
      const numar = await orderNumberDinArticole(admin, businessId, event);
      /*
       * ⚠ NECORELAT NU INSEAMNA PRELUCRAT. Un `order_items.*` pentru o comanda pe care n-am
       * ingerat-o inca (evenimentele lor pot veni inaintea comenzii) iesea tacut si randul se
       * inchidea. Se arunca: sondarea aduce comanda intre timp, si reluarea o gaseste.
       */
      if (!numar) {
        throw new Error("evenimentul pe articole nu s-a putut lega de nicio comanda cunoscuta");
      }
      await ingestOrderByNumber(admin, ctx, numar);
    }
  }
}

/**
 * O cauza care nu spune nimic despre eveniment: o pana la ei, o limita de rata, baza cazuta.
 *
 * ═══ ⚠ ZECE INCERCARI ARUNCAU SI CE N-AVEA NICIO VINA (27.08.2026, seara) ═══
 *
 * Amanarea crescatoare a facut cele zece incercari sa insemne sase ore in loc de zece minute —
 * mai bine, dar tot o taietura in timp. O pana mai lunga de-atat, sau o cheie invalidata pana
 * luni dimineata, trimitea in scrisori moarte fiecare eveniment din inbox. Iar About You
 * reincearca livrarea vreo doua zile: noi renuntam inaintea lor.
 *
 * ⚠ SE DEOSEBESTE PE TIP, NU PE TEXTUL EROARII. Regula casei e ca refuzul se clasifica pe cod,
 * niciodata pe mesaj — vezi `eRefuzLimpede`. Deci cauzele trecatoare ARUNCA un tip anume, iar
 * cine il prinde stie ce e fara sa ghiceasca.
 *
 * ⚠ CE RAMANE MARGINIT: ce e chiar stricat. Un eveniment pe care nu-l putem lega de nicio
 * comanda, sau o sarcina utila pe care n-o intelegem, se opreste dupa zece incercari si se
 * striga — acolo reincercarea chiar n-are ce sa aduca.
 */

/** O cauza trecatoare nu pune nimic in contul evenimentului. */
function eTrecatoare(e: unknown): boolean {
  return e instanceof EroareTrecatoare || e instanceof EroareCitireBaza;
}

const MAX_INCERCARI_INBOX = 10;

/**
 * Cat se asteapta pana la incercarea urmatoare.
 *
 * ⚠ Plafonul de un ceas nu e din gust: peste el, un eveniment de expediere ramas in urma ar
 * intarzia un colet cu mai mult decat merita orice pana. Zece incercari asa inseamna aproape sase
 * ore, in loc de zece minute.
 */
export function amanareInbox(incercari: number): number {
  const UN_MINUT = 60_000;
  return Math.min(60 * UN_MINUT, UN_MINUT * 2 ** Math.max(0, incercari - 1));
}

/** Cate evenimente se reiau intr-o trecere, pe magazin. */
const PE_TRECERE = 20;

type Db = SupabaseClient<Database>;

interface RandInbox {
  id: string;
  event_id: string;
  event_name: string | null;
  payload: unknown;
  incercari: number;
}

export async function reiaEvenimenteleNeprelucrate(
  admin: Db, businessId: string, cfg: AboutYouConfig,
): Promise<number> {
  const randuri = randuriCitite<RandInbox>("aboutyou.inboxNeprelucrat", await admin
    .from("aboutyou_webhook_inbox")
    .select("id, event_id, event_name, payload, incercari")
    .eq("business_id", businessId)
    .is("prelucrat_la", null)
    .lt("incercari", MAX_INCERCARI_INBOX)
    /*
     * ═══ ⚠ ZECE INCERCARI LA UN MINUT INSEAMNAU ZECE MINUTE (27.08.2026) ═══
     *
     * Cronul trece din minut in minut, deci pragul de zece incercari era zece MINUTE. O pana de
     * un sfert de ora ardea toate incercarile FIECARUI eveniment din inbox si le trimitea pe
     * toate in scrisori moarte — chiar cazul pentru care inbox-ul fusese facut. Iar cauza e
     * comuna: cand ceva pica, pica toate deodata, in aceeasi rulare.
     *
     * Cu amanarea crescatoare, zece incercari inseamna aproape sase ore de rabdare.
     */
    .or(`urmatoarea_incercare.is.null,urmatoarea_incercare.lte.${new Date().toISOString()}`)
    /* ⚠ Cele mai vechi intai: un eveniment de expediere care asteapta e un colet care nu pleaca. */
    .order("primit_la", { ascending: true })
    .limit(PE_TRECERE) as never);

  let reusite = 0;
  for (const r of randuri) {
    try {
      await prelucreazaEveniment(admin, businessId, cfg, r.payload);
      await admin.from("aboutyou_webhook_inbox")
        .update({ prelucrat_la: new Date().toISOString(), last_error: null } as never)
        .eq("id", r.id);
      reusite++;
    } catch (e) {
      /*
       * ⚠ CAUZELE TRECATOARE NU ARD O INCERCARE. Vezi `EroareTrecatoare`: o pana la ei sau la baza
       * nu spune nimic despre eveniment, iar numarata, ar trimite in scrisori moarte tocmai
       * evenimentele care n-au nicio vina. Se amana, dar contorul sta pe loc.
       */
      const trecator = eTrecatoare(e);
      const incercari = trecator ? r.incercari : r.incercari + 1;
      await admin.from("aboutyou_webhook_inbox")
        .update({
          incercari,
          last_error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
          /* 1, 2, 4, 8… minute, cu plafon un ceas. Vezi nota de la selectie. */
          urmatoarea_incercare: new Date(Date.now() + amanareInbox(incercari + 1)).toISOString(),
        } as never)
        .eq("id", r.id);

      /*
       * ⚠ RENUNTAREA SE SCRIE, si o singura data — la trecerea pragului, nu la fiecare incercare
       * de dupa. Un eveniment abandonat in tacere e chiar pierderea pe care inbox-ul o inlatura.
       */
      if (!trecator && incercari >= MAX_INCERCARI_INBOX) {
        await logError({
          action: "aboutyou/inbox", severity: "critical",
          message: `eveniment de webhook abandonat dupa ${MAX_INCERCARI_INBOX} incercari: ${r.event_name ?? "necunoscut"}`,
          details: { eventId: r.event_id, eroare: e instanceof Error ? e.message : String(e) },
          businessId,
        });
      }
    }
  }
  return reusite;
}

async function orderNumberDinArticole(
  admin: Db, businessId: string, event: unknown,
): Promise<string | null> {
  const e = (event ?? {}) as Record<string, unknown>;
  const msg = (e.message ?? e.data) as Record<string, unknown> | undefined;
  const items = Array.isArray(msg?.items) ? (msg.items as unknown[]) : [];
  const ids = items
    .map((it) => (typeof it === "number" ? it : (it as { id?: number })?.id))
    .filter((x): x is number => typeof x === "number");
  if (ids.length === 0) return null;

  /*
   * Corelarea se cere BAZEI, nu se caută in memorie.
   *
   * Se citeau ultimele 200 de comenzi si se scana lista lor de articole. Peste 200
   * de comenzi About You, anularile si returnarile pe ARTICOL nu mai gaseau comanda
   * si se pierdeau definitiv — iar 200 se atinge intr-o luna buna.
   *
   * ⚠ CONTAINMENT-UL SE SCRIE CA SIR, nu ca obiect.
   *
   * `contains(col, valoare)` din postgrest-js are trei ramuri: sirul pleaca
   * verbatim, ARRAY-ul devine `cs.{${value.join(",")}}`. Un array de obiecte
   * ajunge deci `cs.{[object Object]}` — 400 la fiecare apel, adica exact zero
   * corelari, mai rau decat cele 200 de comenzi de dinainte. Am probat calea
   * corecta pe API-ul real: `items=cs.[{"order_item_id":123}]` raspunde 200.
   * Index: `idx_aboutyou_orders_items_gin`.
   *
   * O singura interogare pentru toate articolele: `[{"order_item_id":N}]` nu
   * contine virgula, deci separatorul lui `or` rămâne neambiguu.
   */
  const conditii = ids.slice(0, 100)
    .map((id) => `items.cs.${JSON.stringify([{ order_item_id: id }])}`).join(",");
  const { data, error } = await admin
    .from("aboutyou_orders").select("aboutyou_order_number")
    .eq("business_id", businessId)
    .or(conditii)
    .limit(1);
  if (error) {
    /*
     * ⚠ O CITIRE CAZUTA NU INSEAMNA „NICIO POTRIVIRE".
     *
     * Se scria in jurnal si se intorcea `null`, iar cine chema citea `null` drept „n-am ce
     * prelucra" si mergea mai departe — deci randul din inbox primea `prelucrat_la`. Un articol
     * anulat sau expediat, pierdut pentru totdeauna dintr-o clipa proasta a bazei.
     *
     * Se ARUNCA. Randul ramane neprelucrat si cronul il reia.
     */
    await logError({
      action: "aboutyou/webhook",
      message: `corelarea articolelor a eșuat: ${error.message}`,
      details: { businessId, ids: ids.slice(0, 10) }, businessId, severity: "critical",
    });
    throw new Error(`corelarea articolelor a esuat: ${error.message}`);
  }
  const gasit = (data ?? [])[0] as { aboutyou_order_number?: string } | undefined;
  return gasit?.aboutyou_order_number ?? null;
}
