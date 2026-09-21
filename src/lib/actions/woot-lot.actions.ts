"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import { livrareaEDusaDeMarketplace } from "@/lib/orders/origin";
import { greutateaColetului, idurileDeCantarit } from "@/lib/shipping/awb-weight";
import type { ProdusCotat } from "@/lib/shipping/cart-weight";
import { fetchCities, fetchCounties, type WootParcel, type WootPriceResult } from "@/lib/woot";
import { getWootPrices, createWootAwb } from "@/lib/actions/woot.actions";
import { destinatarulComenzii, type DestinatarWoot } from "@/lib/woot/destinatar";
import {
  MESAJUL_SARIRII, cerePunctDePredare, etichetaServiciului, regasesteServiciul,
  serviciiPentruLot, type MotivSarire,
} from "@/lib/woot/lot";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AWB-URI WOOT PENTRU MAI MULTE COMENZI DEODATA                 (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ NU INTRA IN `bulkGenerateAwbs`, si nu din neglijenta. Acolo curierul isi deduce
 * serviciul din greutate si adresa, pe server; la Woot serviciul vine dintr-o cotatie
 * LIVE si nu se poate ghici. De-aia lotul Woot are doi pasi: se intreaba o data, se
 * emite pe toate. Vezi `@/lib/woot/lot.ts` pentru de ce nu merge nici dupa ce a ales
 * clientul, nici dupa numele serviciului de data trecuta.
 *
 * ⚠ SE REFOLOSESC `getWootPrices` SI `createWootAwb`, adica exact functiile pe care le
 * apasa fereastra. Nu se rescrie nimic din Woot aici. Ele poarta deja tot ce s-a
 * invatat: registrul de operatii care opreste al doilea AWB platit, poarta de AWB
 * propriu, asigurarea, expeditorul, creditul contului, si refuzul de a spune „a esuat"
 * cand nu s-a primit raspuns.
 *
 * ⚠ CLASIFICAREA SE FACE DIN NOU LA EMITERE, pe server, nu se ia lista de la fereastra.
 * Altfel o fila lasata deschisa peste noapte ar fi emis pe comenzi anulate intre timp,
 * sau pe unele care au primit AWB din alta parte.
 */

const MAX_LOT = 50;
/*
 * ⚠ Doua cereri pe comanda (cotatia, apoi emiterea), deci concurenta e mai mica decat
 * la celelalte loturi. `AWB_CONCURRENCY` de acolo e 3 pe o singura cerere; aici doi
 * lucratori inseamna tot patru cereri deodata catre Woot.
 */
const DEODATA = 2;
/*
 * ⚠ Aceeasi socoteala ca `BUGET_LOT_MS` din `bulk-orders.actions.ts`: bazinul nu
 * intrerupe o lucrare pornita, deci marja pana la `maxDuration` trebuie sa acopere cel
 * mai lung drum (cotatie + emitere) plus scrierile de la final.
 */
const BUGET_MS = 210_000;

export interface ComandaDinLot {
  id: string;
  order_number: string;
}

export interface SaritaDinLot {
  comanda: string;
  motiv: string;
}

export interface PregatireLot {
  /** Serviciile care pot fi alese, de pe ruta PRIMEI comenzi bune. */
  servicii: WootPriceResult[];
  /** Creditul contului, cand regimul e pe credit. Se arata, nu opreste nimic. */
  credit: number | null;
  eligibile: ComandaDinLot[];
  sarite: SaritaDinLot[];
  /** Numarul comenzii pe care s-a cerut cotatia, ca omul sa stie de unde vin preturile. */
  cotatPe: string | null;
}

export interface RezultatLot {
  total: number;
  done: number;
  skipped: number;
  failed: number;
  errors: SaritaDinLot[];
  oprit?: true;
}

/* ── Citirea si clasificarea ────────────────────────────────────────────── */

const COLOANE =
  "id, order_number, customer_name, customer_phone, customer_email, total, payment_method, "
  + "payment_status, order_source, shipping_address, items, woot_order_id";

type RandComanda = {
  id: string; order_number: string;
  customer_name: string | null; customer_phone: string | null; customer_email: string | null;
  total: number; payment_method: string | null; payment_status: string | null;
  order_source: unknown; shipping_address: unknown; items: unknown;
  woot_order_id: string | null;
};

async function guard(businessId: string): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };
  return { userId: user.id };
}

/**
 * Comenzile bune si cele sarite, IN ORDINEA SELECTIEI.
 *
 * ⚠ Nomenclatorul Woot se cere o singura data pentru tot lotul (`fetchCounties` are
 * cache de sase ore, la fel `fetchCities` pe judet). Cerut pe comanda, un lot de
 * cincizeci ar fi facut o suta de drumuri pentru o lista care nu se schimba.
 */
async function clasifica(
  businessId: string, ids: string[],
): Promise<{ eligibile: { rand: RandComanda; destinatar: DestinatarWoot }[]; sarite: SaritaDinLot[]; produse: ProdusCotat[] } | { error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orders").select(COLOANE).eq("business_id", businessId).in("id", ids);
  if (error) return { error: `Nu am putut citi comenzile: ${error.message}` };

  const dupaId = new Map((data ?? []).map((r) => [String((r as unknown as RandComanda).id), r as unknown as RandComanda]));
  const randuri = ids.map((id) => dupaId.get(id)).filter((r): r is RandComanda => !!r);

  /* Greutatile intregii selectii, intr-o singura interogare. */
  const idProduse = [...new Set(randuri.flatMap((r) => idurileDeCantarit(r.items)))];
  let produse: ProdusCotat[] = [];
  if (idProduse.length > 0) {
    const { data: p, error: eP } = await admin
      .from("products").select("id, weight_grams").eq("business_id", businessId).in("id", idProduse);
    /* Cade interogarea, cad toate coletele pe un kilogram. Se spune, nu se tace. */
    if (eP) console.error("[woot-lot] cautarea greutatilor a esuat:", eP.message);
    produse = (p ?? []) as ProdusCotat[];
  }

  const judete = await fetchCounties();
  const oraseleJudetului = (id: number) => fetchCities(id);

  const eligibile: { rand: RandComanda; destinatar: DestinatarWoot }[] = [];
  const sarite: SaritaDinLot[] = [];
  const sare = (r: RandComanda, m: MotivSarire) =>
    sarite.push({ comanda: r.order_number, motiv: MESAJUL_SARIRII[m] });

  for (const r of randuri) {
    if (r.woot_order_id) { sare(r, "are-deja"); continue; }
    /*
     * ⚠ COLETUL DUS DE MARKETPLACE NU PRIMESTE AWB PROPRIU. La Pepita Delivery
     * transportul e in fluxul lor, cu eticheta lor: un AWB emis aici ar fi al doilea
     * colet pe acelasi pachet, si al doilea transport platit.
     */
    if (livrareaEDusaDeMarketplace(r.order_source)) { sare(r, "dusa-de-marketplace"); continue; }

    const destinatar = await destinatarulComenzii(r, judete, oraseleJudetului);
    if (!destinatar) { sare(r, "fara-adresa"); continue; }

    eligibile.push({ rand: r, destinatar });
  }

  return { eligibile, sarite, produse };
}

/** Coletul propus pentru o comanda, exact ca implicitele ferestrei. */
function coletul(r: RandComanda, produse: ProdusCotat[]): WootParcel[] {
  const items = Array.isArray(r.items) ? (r.items as { name?: string }[]) : [];
  const content = (items.map((i) => i?.name).filter(Boolean).join(", ").slice(0, 100)) || r.order_number;
  const g = greutateaColetului(r.items, produse);
  /* Aceleasi dimensiuni ca implicitele din fereastra: 30 x 20 x 10. */
  return [{ type: "package", content, length: 30, width: 20, height: 10, weight: g.kg }];
}

/* ── Pasul 1: ce se poate, si ce servicii sunt ──────────────────────────── */

export async function pregatesteLotWoot(
  businessId: string, orderIds: string[],
): Promise<PregatireLot | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  const ids = [...new Set((orderIds ?? []).filter(Boolean))];
  if (ids.length === 0) return { error: "Nicio comandă selectată." };
  if (ids.length > MAX_LOT) {
    return { error: `Un lot poate avea cel mult ${MAX_LOT} de comenzi, iar aici sunt ${ids.length}.` };
  }

  const c = await clasifica(businessId, ids);
  if ("error" in c) return c;

  const raspuns: PregatireLot = {
    servicii: [], credit: null,
    eligibile: c.eligibile.map(({ rand }) => ({ id: rand.id, order_number: rand.order_number })),
    sarite: c.sarite,
    cotatPe: null,
  };
  if (c.eligibile.length === 0) return raspuns;

  /*
   * ⚠ Cotatia se cere pe PRIMA comanda buna, si se spune pe care. Preturile de pe alta
   * ruta ar fi altele; omul trebuie sa stie ca cifra din fereastra e un reper, nu suma
   * exacta a fiecarui colet din lot.
   */
  const { rand, destinatar } = c.eligibile[0];
  const ramburs = rambursDeIncasat(rand);
  const preturi = await getWootPrices(
    businessId, destinatar, coletul(rand, c.produse),
    ramburs > 0 ? ramburs : undefined, rand.id,
  );
  if (!preturi.success) return { error: preturi.error ?? "Woot nu a răspuns la calculul prețurilor." };

  raspuns.cotatPe = rand.order_number;
  raspuns.credit = preturi.credit ?? null;
  /* Cele cu livrare la punct nu se ofera deloc: vezi `livreazaLaPunct`. */
  raspuns.servicii = serviciiPentruLot(preturi.prices ?? [])
    .sort((a, b) => a.final_total - b.final_total);
  return raspuns;
}

/* ── Pasul 2: emiterea ──────────────────────────────────────────────────── */

export async function emiteLotWoot(
  businessId: string,
  orderIds: string[],
  serviceId: number,
  senderLocationId?: number,
): Promise<RezultatLot | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  const ids = [...new Set((orderIds ?? []).filter(Boolean))];
  if (ids.length === 0) return { error: "Nicio comandă selectată." };
  if (ids.length > MAX_LOT) {
    return { error: `Un lot poate avea cel mult ${MAX_LOT} de comenzi, iar aici sunt ${ids.length}.` };
  }
  if (!Number.isInteger(serviceId) || serviceId <= 0) return { error: "Serviciu neales." };

  /* ⚠ Din nou, pe server: vezi nota din capul fisierului. */
  const c = await clasifica(businessId, ids);
  if ("error" in c) return c;

  const rezultat: RezultatLot = {
    total: ids.length,
    done: 0,
    skipped: c.sarite.length,
    failed: 0,
    errors: [...c.sarite],
  };

  const termen = Date.now() + BUGET_MS;
  let cursor = 0;
  let atinse = 0;

  const lucratori = Array.from({ length: Math.min(DEODATA, c.eligibile.length) }, async () => {
    while (cursor < c.eligibile.length) {
      /* ⚠ Nu se intrerupe o emitere pornita: un AWB pe drum trebuie dus pana la capat,
         altfel am avea un colet emis pe care nu l-am scris nicaieri. */
      if (Date.now() >= termen) return;
      const { rand, destinatar } = c.eligibile[cursor++];
      atinse++;

      const ramburs = rambursDeIncasat(rand);
      const colet = coletul(rand, c.produse);

      /* ── Cotatia comenzii ei, nu a primei ── */
      let preturi: Awaited<ReturnType<typeof getWootPrices>>;
      try {
        preturi = await getWootPrices(businessId, destinatar, colet, ramburs > 0 ? ramburs : undefined, rand.id);
      } catch (e) {
        /* ⚠ O CITIRE: nimic nu s-a schimbat la Woot, deci refuzul e dovedit. */
        rezultat.failed++;
        rezultat.errors.push({ comanda: rand.order_number, motiv: `Woot nu a răspuns la prețuri: ${(e as Error).message}` });
        continue;
      }
      if (!preturi.success) {
        rezultat.failed++;
        rezultat.errors.push({ comanda: rand.order_number, motiv: preturi.error ?? "Woot nu a întors prețuri." });
        continue;
      }

      const ales = regasesteServiciul(preturi.prices ?? [], serviceId);
      if (!ales) {
        rezultat.skipped++;
        rezultat.errors.push({ comanda: rand.order_number, motiv: MESAJUL_SARIRII["serviciu-indisponibil"] });
        continue;
      }

      /*
       * ⚠ Punctul de predare se trimite DOAR daca serviciul chiar il cere, pe ruta asta.
       * Trimis unde nu trebuie, ar fi schimbat felul expedierii; lipsa unde trebuie, Woot
       * refuza. Se judeca din raspunsul LOR, nu din ce s-a ales in fereastra.
       */
      const cerePunct = cerePunctDePredare(ales);
      if (cerePunct && !senderLocationId) {
        rezultat.skipped++;
        rezultat.errors.push({
          comanda: rand.order_number,
          motiv: "Serviciul cere un punct de predare, iar lotul n-a primit niciunul. Emite comanda individual.",
        });
        continue;
      }

      /* ── Emiterea ── */
      try {
        const r = await createWootAwb(
          businessId, rand.id, ales.service_id, etichetaServiciului(ales),
          destinatar, colet, ramburs > 0 ? ramburs : undefined, {},
          cerePunct ? senderLocationId : undefined,
          undefined,
        );
        if (r.success) rezultat.done++;
        else {
          rezultat.failed++;
          rezultat.errors.push({ comanda: rand.order_number, motiv: r.error ?? "Emiterea a eșuat." });
        }
      } catch (e) {
        /*
         * ⚠ EMITEREA SCHIMBA LA WOOT, deci NU se spune „a esuat": AWB-ul poate sa fi
         * plecat, iar o reluare ar face al doilea, taxabil. Registrul de operatii din
         * `createWootAwb` chiar il opreste, dar mesajul trebuie sa spuna adevarul.
         */
        rezultat.failed++;
        rezultat.errors.push({
          comanda: rand.order_number,
          motiv: "Woot nu a răspuns. Verifică în contul Woot dacă AWB-ul a plecat, înainte să reiei: "
            + (e as Error).message,
        });
      }
    }
  });
  await Promise.all(lucratori);

  if (atinse < c.eligibile.length) rezultat.oprit = true;

  logError({
    action: "emiteLotWoot",
    message: `service=${serviceId} done=${rezultat.done} skipped=${rezultat.skipped} failed=${rezultat.failed}`,
    details: { businessId },
    businessId, userId: g.userId, severity: "info",
  });
  revalidatePath("/dashboard/orders");
  return rezultat;
}
