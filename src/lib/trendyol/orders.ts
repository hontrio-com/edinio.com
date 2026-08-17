// Trendyol order ingestion. Trendyol collects payment and delegates fulfillment to
// the seller via its contracted cargo: orders flow back as shipment packages via
// the order webhook (primary) and a polling safety net. Each ingested package
// becomes a normal Edinio order (order_source.marketplace="trendyol", payment
// already "paid") plus a trendyol_orders side row holding the Trendyol-specific
// per-line lineIds, statuses and cargo tracking needed to fulfil in Faza 4.
//
// Idempotent on shipmentPackageId. It does NOT go through the storefront checkout,
// so it never triggers Edinio payment capture or auto-invoicing. Money fields are
// plain decimals (Trendyol, unlike About You, does not use minor units).

import type { SupabaseClient } from "@supabase/supabase-js";
import { logError } from "@/lib/error-logger";
import type { Database } from "@/types/database.types";
import type { TrendyolSyncContext } from "./sync";
import { getOrders, isTrendyolError } from "./client";
import { edinioStatusForTrendyol } from "./webhooks";
import type { TrendyolShipmentPackage } from "./types";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
// Regula marcajului e comuna cu About You, deci sta in `lib/marketplace`.
export { marcajUrmator } from "@/lib/marketplace/marcaj";

type Db = SupabaseClient<Database>;

function num(v: unknown): number { return typeof v === "number" && Number.isFinite(v) ? v : 0; }
function round2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100; }

function toSideLines(pkg: TrendyolShipmentPackage) {
  return (Array.isArray(pkg.lines) ? pkg.lines : []).map((l) => ({
    lineId: l.lineId,
    barcode: l.barcode ?? null,
    quantity: l.quantity,
    status: l.orderLineItemStatusName ?? null,
  }));
}

/**
 * Clientul si adresa, aduse la forma pe care o citeste restul aplicatiei.
 *
 * ⚠ Adresa se NORMALIZEAZA, nu se copiaza.
 *
 * Trendyol trimite `address1`, `district`, `postalCode`, `countryCode`; Edinio
 * citeste peste tot `address`, `county`, `postal_code`, `country`. Scris ca
 * atare, obiectul trecea de tipuri si de baza de date, dar comanda aparea cu
 * adresa GOALA in panou, pe factura si pe AWB — adica exact acolo unde e
 * nevoie de ea. Campurile brute raman langa cele normalizate: nu strica nimic
 * si pastreaza ce n-am tradus (`neighborhood`, `id`).
 */
function parseCustomer(pkg: TrendyolShipmentPackage): { name: string; phone: string; email: string | null; address: Record<string, unknown> } {
  const a = (pkg.shipmentAddress ?? {}) as Record<string, unknown>;
  const str = (o: Record<string, unknown>, k: string) => {
    const v = o[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const name = [pkg.customerFirstName, pkg.customerLastName].filter(Boolean).join(" ")
    || str(a, "fullName") || [str(a, "firstName"), str(a, "lastName")].filter(Boolean).join(" ") || "Client Trendyol";
  const phone = str(a, "phone") || "";
  const email = pkg.customerEmail || null;

  /*
   * Strada: `address1` (+`address2`), nu `fullAddress`.
   *
   * `fullAddress` e o concatenare facuta de ei, cu orasul lipit la coada si spatii
   * multiple in mijloc: „str. Panselutelor, nr24      Dumbravita". Pusa pe AWB,
   * curierul primeste orasul de doua ori.
   */
  const strada = [str(a, "address1"), str(a, "address2")].filter(Boolean).join(", ")
    || str(a, "fullAddress")
    || "";
  const address: Record<string, unknown> = {
    ...a,
    address: strada,
    city: str(a, "city") ?? "",
    /*
     * Judetul e in `countyName`, verificat pe comenzi reale: „Timis",
     * „Constanța", „București".
     *
     * NU in `district`, care doar repeta orasul („Dumbravita" / „Dumbravita"),
     * si nici in `stateName`, care vine gol. Ghicit gresit, comenzile ar fi
     * plecat la curier cu judetul „Dumbravita" — o localitate care exista, deci
     * nici macar n-ar fi picat vizibil la validare.
     */
    county: str(a, "countyName") ?? str(a, "stateName") ?? "",
    postal_code: str(a, "postalCode") ?? "",
    country: str(a, "countryCode") ?? "",
  };
  return { name, phone, email, address };
}

/**
 * Consuma stocul comenzii, o singura data, si spune daca a reusit.
 *
 * Chemat de AMANDOUA ramurile — si la comanda noua, si la una care exista deja.
 * A doua chemare e tocmai reparatia: `consuma_stoc_comanda_marketplace` e
 * idempotenta prin marcajul `stoc_marketplace_la`, deci daca prima incercare a
 * picat, sincronizarea urmatoare o duce la capat; daca a reusit, a doua nu face
 * nimic (`deja: true`).
 *
 * Se cheama SI cu liste goale (pachet deja anulat, sau fara produse mapate):
 * atunci marcheaza „n-a consumat nimic" si nu se mai reincearca la infinit.
 */
async function consumaStoculComenzii(
  admin: Db, ctx: TrendyolSyncContext, orderId: string,
  qtyByProduct: Map<string, number>,
  qtyByVariant: Map<string, { product_id: string; variant_title: string; quantity: number }>,
): Promise<"ok" | "failed"> {
  const produse = [...qtyByProduct.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
  const variante = [...qtyByVariant.values()];
  const { data: rez, error } = await admin.rpc("consuma_stoc_comanda_marketplace", {
    p_order_id: orderId, p_business_id: ctx.businessId,
    p_produse: produse, p_variante: variante,
  });
  const r = rez as { gasit?: boolean; deja?: boolean; lipsa?: unknown[] } | null;
  if (error || r?.gasit !== true) {
    await logError({
      action: "trendyol/orders", message: error?.message ?? "consumul de stoc n-a raspuns valid",
      details: { orderId, raspuns: r }, businessId: ctx.businessId, severity: "critical",
    });
    return "failed";
  }
  if (!r.deja && Array.isArray(r.lipsa) && r.lipsa.length > 0) {
    await logError({
      action: "trendyol/orders",
      message: "Comanda de marketplace a cerut mai mult stoc decat exista; s-a scazut cat s-a putut.",
      details: { orderId, lipsa: r.lipsa }, businessId: ctx.businessId, severity: "warning",
    });
  }
  return "ok";
}

export async function ingestPackage(admin: Db, ctx: TrendyolSyncContext, pkg: TrendyolShipmentPackage): Promise<"created" | "updated" | "skipped" | "failed"> {
  const packageId = pkg.shipmentPackageId != null ? String(pkg.shipmentPackageId) : undefined;
  if (!packageId) return "skipped";
  const now = new Date().toISOString();
  const sideLines = toSideLines(pkg);
  const edinioStatus = edinioStatusForTrendyol(pkg.status ?? pkg.shipmentPackageStatus);
  const tracking = pkg.cargoTrackingNumber != null ? String(pkg.cargoTrackingNumber) : null;

  // Resolve product ids from barcode (variant -> product) for names + stock.
  const lines = Array.isArray(pkg.lines) ? pkg.lines : [];
  const barcodes = [...new Set(lines.map((l) => l.barcode).filter(Boolean) as string[])];
  const info = new Map<string, { productId: string | null; variantTitle: string | null }>();
  if (barcodes.length > 0) {
    const { data: vs, error: eVar } = await admin
      .from("trendyol_variants").select("barcode, product_id, variant_title").eq("business_id", ctx.businessId).in("barcode", barcodes);
    /*
     * „Nu exista mapare" si „n-am putut CITI maparea" sunt doua lucruri diferite.
     *
     * Fara verificare, o citire picata dadea o harta goala -> `product_id` null ->
     * comanda intra, stocul nu se scade, iar randul lateral scris facea ca
     * sincronizarea urmatoare sa nu mai incerce. Un incident de doua secunde
     * devenea permanent. Se iese INAINTE sa se scrie ceva.
     */
    if (eVar) {
      await logError({
        action: "trendyol/orders", message: `maparea codurilor de bare nu s-a putut citi: ${eVar.message}`,
        details: { packageId }, businessId: ctx.businessId, severity: "critical",
      });
      /*
       * „failed", NU „skipped".
       *
       * `pollPackages` nu socotea `skipped` drept esec, deci marcajul de timp
       * avansa peste o comanda pe care n-am reusit s-o citim — si dupa ce iesea
       * din fereastra, se pierdea definitiv. Comentariul spunea corect ca „nu
       * exista mapare" si „n-am putut citi maparea" sunt lucruri diferite;
       * fluxul de control nu-l respecta.
       */
      return "failed";
    }
    for (const v of vs ?? []) {
      info.set(v.barcode, { productId: v.product_id, variantTitle: v.variant_title ?? null });
    }
  }

  /*
   * ⚠ UN PACHET DEJA ANULAT NU CONSUMA STOC.
   *
   * Daca Edinio vede pentru prima data un pachet care e deja `Cancelled`,
   * `Returned` sau `Unsupplied`, comanda se NASTE anulata — deci nu va exista
   * nicio tranzitie `activ -> anulat` care sa elibereze mai tarziu. Consumat la
   * nastere, stocul ramanea scazut pe vecie.
   *
   * About You facea deja asta, filtrand liniile anulate. Trendyol nu.
   */
  const terminal = edinioStatus === "cancelled" || edinioStatus === "refunded";
  const qtyByProduct = new Map<string, number>();
  // Si pe COMBINATIE, nu doar pe produs: vezi migratia `2026-08-19-stoc-marketplace`.
  const qtyByVariant = new Map<string, { product_id: string; variant_title: string; quantity: number }>();
  const edinioItems = lines.map((l) => {
    const pid = l.barcode ? info.get(l.barcode)?.productId ?? null : null;
    const qty = num(l.quantity) || 1;
    if (pid && !terminal) qtyByProduct.set(pid, (qtyByProduct.get(pid) ?? 0) + qty);
    const vt = l.barcode ? info.get(l.barcode)?.variantTitle ?? null : null;
    if (pid && vt && !terminal) {
      const k = `${pid}::${vt}`;
      const e = qtyByVariant.get(k);
      if (e) e.quantity += qty;
      else qtyByVariant.set(k, { product_id: pid, variant_title: vt, quantity: qty });
    }
    const price = num(l.lineUnitPrice) || num(l.price);
    return { product_id: pid, name: l.productName ?? `Barcode ${l.barcode}`, barcode: l.barcode ?? null, price, quantity: qty };
  });

  const { data: existing } = await admin
    .from("trendyol_orders").select("id, order_id, last_modified_date")
    .eq("business_id", ctx.businessId).eq("shipment_package_id", packageId).maybeSingle();
  const modificatLa = Number.isFinite(Number(pkg.lastModifiedDate)) ? Number(pkg.lastModifiedDate) : null;
  if (existing) {
    const ex = existing as { id: string; order_id: string | null; last_modified_date: number | null };
    /*
     * ⚠ UN EVENIMENT VECHI NU RESCRIE UNUL NOU.
     *
     * Doua surse scriu aici — cronul si webhook-ul — si nimic nu garanta
     * ordinea intre ele. O pagina de cron pornita inainte de webhook putea
     * ajunge dupa el si sa readuca pachetul pe „Picking" peste „Delivered": nu
     * doar un status gresit in panou, ci si o trecere prin
     * `tranzitieComandaMarketplace` care REZERVA din nou stocul unei comenzi
     * deja expediate.
     *
     * `lastModifiedDate` e ceasul lor, singurul comun celor doua cai. Egal
     * inseamna „acelasi eveniment", deci tot se sare: reluarea nu aduce nimic.
     *
     * Garda opreste STATUSUL si tranzitia, nu si consumul de stoc de mai jos:
     * acela e idempotent si e tocmai reparatia unui consum picat anterior. O
     * iesire devreme ar inchide o gaura deschizand alta, exact ca in cazul
     * documentat mai jos.
     */
    const evenimentVechi = modificatLa != null && ex.last_modified_date != null
      && modificatLa <= ex.last_modified_date;
    if (!evenimentVechi) {
      /*
       * ⚠ `last_modified_date` NU SE SCRIE AICI.
       *
       * Marcajul de ordine nu are voie sa avanseze inaintea pasului pe care il
       * protejeaza. Scris odata cu statusul, o tranzitie care pica imediat dupa
       * (lock timeout, indisponibilitate) lasa marcajul deja avansat — iar
       * reluarea urmatoare vede „eveniment vechi" si sare peste tranzitie
       * pentru totdeauna. Adica exact defectul reparat mai jos, reintrodus pe
       * alt drum: comanda ramane pe statusul vechi cu stocul REZERVAT, iar
       * comerciantul expediaza o comanda pe care Trendyol a anulat-o.
       *
       * Se scrie la final, dupa ce tranzitia a raspuns.
       */
      await admin.from("trendyol_orders")
        .update({
          status: pkg.status ?? "Created", lines: sideLines as never, cargo_tracking_number: tracking,
          last_synced_at: now, updated_at: now,
        } as never)
        .eq("id", ex.id);
    }
    /*
     * Ciclul de viata trece prin ACELASI motor ca panoul si loturile.
     *
     * Aici se scria direct in `orders`, deci o anulare venita de la Trendyol punea
     * statusul pe `cancelled` si LASA STOCUL CONSUMAT — tocmai pe sursa de comenzi
     * pe care n-o controlam si care anuleaza cel mai des.
     */
    /*
     * ⚠ REZULTATUL TRANZITIEI SE CITESTE.
     *
     * Era aruncat, si tocmai pe ramura pe care ajunge o ANULARE venita de la
     * Trendyol (comanda exista deja de la ingestul initial). Cand tranzitia pica,
     * `aplica_tranzitia_comenzii` nu scrie nimic: statusul ramane vechi si stocul
     * ramane REZERVAT. Ingestul iesea totusi „updated", `ok` ramanea `true`, iar
     * marcajul de timp sarea peste comanda — cu doar cinci minute de suprapunere,
     * pierderea era definitiva de la rularea urmatoare.
     *
     * Rezultat: comerciantul pregateste si expediaza o comanda pe care Trendyol
     * a anulat-o, iar marfa ramane blocata in `stoc_rezervat` — produsul pare
     * epuizat pe toate celelalte canale.
     */
    let reiaTranzitia = false;
    if (ex.order_id && !evenimentVechi) {
      const t = await tranzitieComandaMarketplace(admin, {
        orderId: ex.order_id, businessId: ctx.businessId,
        status: edinioStatus, sursa: "trendyol",
        campuriSuplimentare: { tracking_number: tracking },
      });
      // `definitiv` NU blocheaza: un singur pachet otravit ar ingheta fereastra
      // magazinului pentru totdeauna. Vezi `RezultatTranzitie`.
      if (t === "reincearca") reiaTranzitia = true;
    }
    /*
     * ⚠ RANDUL LATERAL EXISTA NU INSEAMNA CA INGESTUL S-A TERMINAT.
     *
     * Aici se intorcea „updated" imediat, deci nu se mai ajungea NICIODATA la
     * consumul de stoc. Iar consumul e tocmai partea care poate pica singura: un
     * timeout de doua secunde lasa `stoc_marketplace_la` NULL, si sincronizarea
     * urmatoare intra pe ramura asta si se intoarce. Functia din baza era
     * reparabila; apelantul sarea peste reparatie.
     *
     * Starea „ingest complet" nu e „exista rand lateral", ci
     * „exista comanda SI `stoc_marketplace_la` nu e NULL".
     */
    if (ex.order_id) {
      const r = await consumaStoculComenzii(admin, ctx, ex.order_id, qtyByProduct, qtyByVariant);
      if (r === "failed") return "failed";
    }
    /*
     * Marcajul de ordine se aseaza ABIA ACUM, cand toti pasii au trecut.
     *
     * Daca tranzitia cere reluare, marcajul ramane cel vechi: trecerea urmatoare
     * reintra pe aceeasi ramura si duce treaba la capat, in loc s-o considere
     * un eveniment deja procesat.
     */
    if (!evenimentVechi && !reiaTranzitia && modificatLa != null) {
      await admin.from("trendyol_orders")
        .update({ last_modified_date: modificatLa } as never)
        .eq("id", ex.id);
    }
    /*
     * Iesirea pe esecul tranzitiei sta AICI, nu imediat dupa ea: un `return` mai
     * sus ar sari peste consumul de stoc, care e tocmai reparatia unui consum
     * picat anterior. S-ar inchide o gaura deschizand alta — o comanda cu
     * `stoc_marketplace_la` NULL n-ar mai fi dusa la capat niciodata.
     */
    return reiaTranzitia ? "failed" : "updated";
  }

  const total = num(pkg.packageTotalPrice) || num(pkg.totalPrice) || edinioItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const vatAmount = round2(lines.reduce((s, l) => {
    const lineTotal = num(l.lineUnitPrice) * num(l.quantity);
    const vr = num(l.vatRate);
    return s + (vr > 0 ? lineTotal - lineTotal / (1 + vr / 100) : 0);
  }, 0));
  const subtotal = round2(total - vatAmount);
  const cust = parseCustomer(pkg);

  const { data: created, error } = await admin.from("orders").insert({
    business_id: ctx.businessId,
    order_number: `TY-${packageId}`,
    customer_name: cust.name,
    customer_phone: cust.phone,
    customer_email: cust.email,
    shipping_address: { ...cust.address, source: "trendyol" } as never,
    items: edinioItems as never,
    /*
     * `stoc_rezervat` NU se scrie aici.
     *
     * Il scrie `consuma_stoc_comanda_marketplace`, in aceeasi instructiune cu
     * consumul, si cu ce s-a luat CU ADEVARAT. Scris aici cu ce s-a CERUT, o
     * picare a consumului ar lasa o comanda din care nu s-a scazut nimic dar care
     * pretinde ca a consumat — iar anularea ar ADAUGA stoc care n-a existat.
     */
    subtotal,
    total: round2(total),
    vat_amount: vatAmount,
    payment_method: "trendyol",
    payment_status: "paid",
    status: edinioStatus,
    tracking_number: tracking,
    order_source: { marketplace: "trendyol", order_number: pkg.orderNumber, shipment_package_id: packageId } as never,
  } as never).select("id").single();

  // Recover from a prior/partial ingest: order_number is unique per business.
  let orderId: string;
  let isNew = true;
  if (error || !created) {
    const { data: found, error: eCautare } = await admin.from("orders").select("id")
      .eq("business_id", ctx.businessId).eq("order_number", `TY-${packageId}`).maybeSingle();
    if (!found) {
      /*
       * ⚠ AICI SE INTORCEA „skipped", SI ERA ACEEASI GRESEALA REPARATA CU 120 DE
       * LINII MAI SUS PENTRU MAPAREA CODURILOR DE BARE.
       *
       * `pollPackages` socoteste esec DOAR pe „failed"; „skipped" trece drept
       * sincronizare curata, deci marcajul de timp avanseaza si pachetul se pierde
       * DEFINITIV — fara niciun log, fiindca `error`-ul insertului era aruncat.
       *
       * Dar nici „failed" necazut nu merge oriunde: o problema PERMANENTA de date
       * (o constrangere incalcata de ce ne trimite Trendyol) ar ingheta fereastra
       * intregului magazin la nesfarsit. Deci se separa, ca peste tot in proiect,
       * refuzul DOVEDIT de „nu stim": codurile de mai jos inseamna „randul asta nu
       * va intra niciodata asa", si atunci se strica un singur pachet, zgomotos,
       * in loc sa se opreasca tot.
       */
      const cod = error?.code ?? eCautare?.code;
      const dateNepotrivite = cod === "23502" || cod === "23514" || cod === "22001" || cod === "22P02";
      await logError({
        action: "trendyol/orders",
        message: `comanda nu s-a putut salva si nici regasi: ${error?.message ?? eCautare?.message ?? "motiv necunoscut"}`,
        details: { packageId, code: cod, permanent: dateNepotrivite },
        businessId: ctx.businessId,
        severity: "critical",
      });
      return dateNepotrivite ? "skipped" : "failed";
    }
    orderId = (found as { id: string }).id;
    isNew = false;
  } else {
    orderId = (created as { id: string }).id;
  }

  await admin.from("trendyol_orders").upsert({
    business_id: ctx.businessId,
    order_id: orderId,
    shipment_package_id: packageId,
    order_number: pkg.orderNumber ?? null,
    status: pkg.status ?? "Created",
    currency: pkg.currencyCode ?? null,
    cargo_tracking_number: tracking,
    lines: sideLines as never,
    // Ceasul lui Trendyol, ca trecerea urmatoare sa stie ce e mai nou si ce nu.
    last_modified_date: modificatLa,
    last_synced_at: now,
  } as never, { onConflict: "business_id,shipment_package_id" });

  // Aceeasi cale ca pe ramura „exista deja": un singur loc care consuma si
  // raporteaza. Un esec aici NU se raporteaza ca reusita — vezi `pollPackages`.
  if ((await consumaStoculComenzii(admin, ctx, orderId, qtyByProduct, qtyByVariant)) === "failed") {
    return "failed";
  }

  return isNew ? "created" : "updated";
}

// Fetch a single order by its Trendyol order number and ingest its packages.
export async function ingestByOrderNumber(admin: Db, ctx: TrendyolSyncContext, orderNumber: string): Promise<void> {
  const res = await getOrders(ctx.auth, { orderNumber, size: 50 });
  if (isTrendyolError(res)) return;
  for (const pkg of res.data?.content ?? []) await ingestPackage(admin, ctx, pkg);
}

/**
 * Fereastra de interogare a comenzilor, taiata la ce accepta Trendyol.
 *
 * Serviciul refuza un interval mai mare de DOUA SAPTAMANI. Un magazin care sta
 * o luna fara sincronizare ar fi cerut o fereastra mai lunga si ar fi primit
 * eroare la fiecare rulare de cron — adica exact magazinul care avea nevoie de
 * recuperare nu si-ar mai fi luat niciodata comenzile. Cerem ultimele doua
 * saptamani si lasam pasul urmator sa continue.
 */
const DOUA_SAPTAMANI = 14 * 24 * 60 * 60 * 1000;

export function fereastraComenzi(sinceMs: number | undefined, acum = Date.now()): { startDate: number; endDate: number } {
  const minim = acum - DOUA_SAPTAMANI;
  // O marja de un minut: ceasurile noastre si ale lor nu bat perfect.
  const start = sinceMs != null && sinceMs > minim ? sinceMs : minim + 60_000;
  return { startDate: Math.min(start, acum), endDate: acum };
}

// Poll recent shipment packages for one business (cron safety net). `sinceMs` is a
// unix-millisecond timestamp (Trendyol uses GMT+3 epoch millis).
/** Sursa paginilor, injectabila ca sa se poata proba bucla fara reteaua Trendyol. */
export type AducePagina = (p: { startDate: number; endDate: number; page: number }) =>
  Promise<{ content: TrendyolShipmentPackage[]; totalPages?: number } | { eroare: true }>;

export async function pollPackages(
  admin: Db, ctx: TrendyolSyncContext, sinceMs?: number,
  deps?: {
    aduPagina?: AducePagina;
    ingereaza?: (pkg: TrendyolShipmentPackage) => Promise<"created" | "updated" | "skipped" | "failed">;
  },
): Promise<{ ingested: number; ok: boolean; cursorMs?: number }> {
  let ingested = 0;
  let ok = true;
  /*
   * ═══ CURSORUL: ULTIMA COMANDA CHIAR DUSA LA CAPAT ═══
   *
   * `cursorMs` creste cat timp pachetele reusesc, SI SE OPRESTE la primul care
   * pica. Apelantul poate astfel muta marcajul pana exact acolo: ce s-a citit nu
   * se reciteste, iar ce n-a mers ramane in fereastra urmatoare. Fara el, singurele
   * doua purtari posibile erau „sar peste tot ce n-am citit" (pierdere definitiva)
   * si „nu misc nimic" (blocaj permanent, fiindca fereastra ramane aceeasi).
   */
  let cursorMs: number | undefined;
  let cursorInghetat = false;
  const { startDate, endDate } = fereastraComenzi(sinceMs);
  /*
   * ⚠ `ok` INSEAMNA „AM CITIT TOT SI TOTUL A INTRAT", nu „n-a explodat nimic".
   *
   * Apelantul sare marcajul la „acum" numai daca `ok`. Pe `!ok` foloseste
   * `cursorMs`, adica muta marcajul exact pana la ultima comanda dusa la capat.
   * Deci cele doua cazuri in care NU am citit tot — plafonul de pagini si un
   * pachet care pica la ingest — nu mai inseamna nici pierdere, nici blocaj:
   * inseamna „reiau de aici".
   *
   * Plafonul nu se ridica la un numar mai mare: asta doar muta pragul si
   * inmulteste cererile catre un API cu limita de 50 la 10 secunde.
   */
  const MAX_PAGINI = 5;
  let maiSuntPagini = false;
  for (let page = 0; page < MAX_PAGINI; page++) {
    /*
     * ⚠ „ASC", NU „DESC", SI DE ASTA ATARNA TOT CURSORUL.
     *
     * Cu DESC citim cele mai NOI comenzi, iar la trunchiere raman necitite cele
     * mai vechi — adica tocmai cele de langa marginea de JOS a ferestrei, care e
     * chiar marcajul. Un cursor mutat „la cea mai veche citita" ar face fereastra
     * urmatoare `[cea mai veche citita, acum]`: exact aceleasi 500 de comenzi noi,
     * la infinit, iar restanta nu s-ar atinge niciodata. Reteta „muta marcajul la
     * cea mai veche comanda citita" e corecta doar cu ASC, unde ce s-a citit e
     * chiar prefixul cel mai vechi si marcajul are voie sa treaca peste el.
     */
    const pagina = deps?.aduPagina
      ? await deps.aduPagina({ startDate, endDate, page })
      : await (async () => {
        const res = await getOrders(ctx.auth, { startDate, endDate, page, size: 100, orderByField: "PackageLastModifiedDate", orderByDirection: "ASC" });
        if (isTrendyolError(res)) return { eroare: true as const };
        return { content: res.data?.content ?? [], totalPages: res.data?.totalPages };
      })();
    if ("eroare" in pagina) { ok = false; break; }
    const content = pagina.content;
    if (content.length === 0) break;
    for (const pkg of content) {
      const r = deps?.ingereaza ? await deps.ingereaza(pkg) : await ingestPackage(admin, ctx, pkg);
      if (r === "created") ingested++;
      // Un pachet nereusit opreste avansarea marcajului pentru TOATA fereastra:
      // altfel el singur s-ar pierde, iar restul ar parea in regula.
      if (r === "failed") ok = false;
      /*
       * Cursorul se opreste la primul pachet REINCERCABIL si nu mai porneste:
       * altfel ar sari peste el exact ca marcajul de dinainte — regresia reparata
       * deja o data pentru maparea codurilor de bare.
       *
       * ⚠ DOAR pe „failed", NU si pe „skipped". „skipped" inseamna un pachet care
       * nu va intra NICIODATA asa cum e (date respinse de o constrangere, pachet
       * fara id). Inghetat si pe el, cursorul ar ramane in urma acelui pachet la
       * fiecare rulare — si cum trunchierea stinge acum `ok`, fereastra s-ar opri
       * definitiv exact acolo. Un pachet otravit are voie sa strice un pachet, nu
       * sincronizarea magazinului.
       */
      if (r === "failed") cursorInghetat = true;
      if (!cursorInghetat) {
        const t = Number(pkg.lastModifiedDate);
        if (Number.isFinite(t) && t > 0) cursorMs = cursorMs == null ? t : Math.max(cursorMs, t);
      }
    }
    const totalPages = Number(pagina.totalPages ?? 1);
    if (page + 1 >= totalPages) break;
    if (page + 1 >= MAX_PAGINI) maiSuntPagini = totalPages > MAX_PAGINI;
  }

  /*
   * ⚠ TRUNCHIEREA TREBUIE SA STINGA `ok`. ALTFEL CURSORUL E COD MORT.
   *
   * Prima forma a acestei reparatii lasa `ok = true` la trunchiere (ca inainte) si
   * doar loga. Dar apelantul citeste `cursorMs` NUMAI pe ramura `else` a lui
   * `if (r.ok)` — deci cursorul nu se folosea niciodata exact in cazul pentru care
   * a fost scris, iar marcajul sarea tot la „acum". Cu sortarea intoarsa pe ASC,
   * asta ar fi mutat pierderea de pe comenzile VECHI pe cele NOI: mai rau decat
   * inainte.
   *
   * Acum `ok = false` NU mai inseamna blocaj, fiindca exista cursor: apelantul
   * muta marcajul pana la ultima comanda dusa la capat si continua de acolo.
   * Blocajul permanent de care se temea comentariul de mai jos aparea doar cat
   * timp singura alegere era „acum" sau „nimic".
   */
  if (maiSuntPagini) ok = false;
  /*
   * ⚠ CURSORUL TREBUIE SA CREASCA. Daca nu, e blocaj, nu progres.
   *
   * Cazul: toate pachetele citite au aceeasi milisecunda de modificare, deci
   * `cursorMs` iese egal cu marginea de jos a ferestrei si urmatoarea rulare cere
   * exact aceleasi randuri. Absurd de improbabil la 100 pe pagina, dar daca s-ar
   * intampla ar fi tacut — asa ca se refuza cursorul si se striga.
   */
  if (cursorMs != null && sinceMs != null && cursorMs <= sinceMs) {
    await logError({
      action: "trendyol/orders",
      message: "Cursorul de sincronizare nu a avansat peste marcajul curent; fereastra ramane pe loc.",
      details: { cursorMs, sinceMs }, businessId: ctx.businessId, severity: "critical",
    });
    cursorMs = undefined;
  }

  if (maiSuntPagini) {
    /*
     * ⚠ DE CE `ok = false` E ACUM CORECT, DESI INAINTE ERA O CAPCANA.
     *
     * Prima incercare, demult, punea `ok = false` si ATAT. Suna corect — „nu avansa
     * peste ce n-ai citit" — dar producea BLOCAJ PERMANENT: fereastra ramanea
     * aceeasi, deci la minutul urmator se citeau exact aceleasi cinci pagini, se
     * gasea iar surplus, si se bloca iar. Sincronizarea s-ar fi oprit cu totul.
     *
     * Nici plafonul mai mare nu repara nimic — doar muta pragul, si inmulteste
     * cererile catre un API cu limita de 50 la 10 secunde.
     *
     * Diferenta de acum e CURSORUL: `ok = false` nu mai inseamna „nu misca nimic",
     * ci „nu sari la acum — muta marcajul exact pana unde am ajuns". Cu ASC,
     * paginile citite sunt chiar cele mai vechi, deci marcajul poate trece peste
     * ele fara sa sara nimic, si fereastra urmatoare continua de acolo. Progresul e
     * garantat: un magazin cu restanta o recupereaza in transe de cate 500 pe minut.
     *
     * Cazul in care NU se poate construi cursorul (lipseste `lastModifiedDate`)
     * ramane singurul care blocheaza — si atunci trebuie sa strige, fiindca acolo
     * chiar nu exista drum bun.
     */
    await logError({
      action: "trendyol/orders",
      message: cursorMs != null
        ? `Fereastra de sincronizare are peste ${MAX_PAGINI} pagini (${MAX_PAGINI * 100} comenzi): restul se preia la rularile urmatoare, de la cursor.`
        : `Fereastra de sincronizare are peste ${MAX_PAGINI} pagini (${MAX_PAGINI * 100} comenzi) SI nu s-a putut construi un cursor (lipseste lastModifiedDate): fereastra ramane pe loc si sincronizarea se OPRESTE pana se rezolva.`,
      details: { cursorMs }, businessId: ctx.businessId, severity: "critical",
    });
  }
  return { ingested, ok, cursorMs };
}

// Best-effort extraction of packages from a webhook payload (same shape as the
// shipment-packages response: { content: [...] }, or a single package object).
export function extractPackages(payload: unknown): TrendyolShipmentPackage[] {
  const p = (payload ?? {}) as { content?: unknown; shipmentPackageId?: unknown };
  if (Array.isArray(p.content)) return p.content as TrendyolShipmentPackage[];
  if (p.shipmentPackageId != null) return [payload as TrendyolShipmentPackage];
  return [];
}
