import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { randuriCitite } from "@/lib/supabase/rand-citit";
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
  } else if (name && name.startsWith("order") && ctx) {
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
      if (numar) await ingestOrderByNumber(admin, ctx, numar);
    }
  }
}

const MAX_INCERCARI_INBOX = 10;

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
      const incercari = r.incercari + 1;
      await admin.from("aboutyou_webhook_inbox")
        .update({
          incercari,
          last_error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        } as never)
        .eq("id", r.id);

      /*
       * ⚠ RENUNTAREA SE SCRIE, si o singura data — la trecerea pragului, nu la fiecare incercare
       * de dupa. Un eveniment abandonat in tacere e chiar pierderea pe care inbox-ul o inlatura.
       */
      if (incercari >= MAX_INCERCARI_INBOX) {
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
    // O citire cazuta NU inseamna „nicio potrivire": inghitita, evenimentul se
    // pierde definitiv, fiindca ruta raspunde oricum 200 si About You nu reia.
    await logError({
      action: "aboutyou/webhook",
      message: `corelarea articolelor a eșuat: ${error.message}`,
      details: { businessId, ids: ids.slice(0, 10) }, businessId, severity: "critical",
    });
    return null;
  }
  const gasit = (data ?? [])[0] as { aboutyou_order_number?: string } | undefined;
  return gasit?.aboutyou_order_number ?? null;
}
