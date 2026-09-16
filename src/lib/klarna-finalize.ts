import type { SupabaseClient } from "@supabase/supabase-js";
import { finalizeazaPlataComenzii } from "@/lib/orders/finalizare-plata";
import { logError } from "@/lib/error-logger";
import {
  placeOrder, captureOrder, getOmOrder, toMinor,
  type KlarnaConfig, type KlarnaOrderInput,
} from "@/lib/klarna";
import { proprietariiMagazinelor, semnaleazaExpedierea } from "@/lib/orders/semnalarea-ajunge-la-om";

export type KlarnaFinalizeResult =
  | { status: "paid" }
  | { status: "pending" }
  | { status: "failed"; error: string };

/**
 * Turn a Klarna authorization into a paid order: place the order, then (on
 * ACCEPTED) capture the full amount immediately and mark the Edinio order paid.
 * Shared by the browser return route and the HPP status_update callback, so it is
 * idempotent — every DB write guards with `.neq("payment_status", "paid")`, and a
 * second call re-using the same (single-use) authorization token fails harmlessly
 * at place_order.
 */
export async function finalizeKlarnaOrder(
  admin: SupabaseClient,
  cfg: KlarnaConfig,
  order: KlarnaOrderInput,
  authToken: string,
  confirmationUrl: string,
): Promise<KlarnaFinalizeResult> {
  // 1) Create the Klarna order-management order from the authorization.
  const placed = await placeOrder(cfg, authToken, order, confirmationUrl);
  if (!placed.ok || !placed.data?.order_id) {
    return { status: "failed", error: placed.error || "Nu am putut finaliza comanda la Klarna." };
  }
  const klarnaOrderId = placed.data.order_id;
  const fraud = placed.data.fraud_status;

  /*
   * ⚠ DE AICI INCOLO EXISTA O COMANDA REALA LA KLARNA.
   *
   * `placeOrder` a consumat autorizarea; `klarna_order_id` e SINGURA legatura
   * dintre ea si comanda noastra. Pe fiecare iesire de mai jos el trebuie sa ajunga
   * in baza — altfel avem o comanda Klarna orfana, eventual deja capturata, si
   * nimic local care s-o gaseasca. Klarna nu expune cautare dupa `merchant_reference`.
   *
   * ⚠ RANDUL DE MAI SUS SPUNEA SI „si nu exista cron de reconciliere Klarna". E FALS din ziua in
   * care s-a scris `api/cron/klarna-reconcile`, si a ramas asa. O afirmatie falsa despre ce plase
   * exista e cea mai scumpa specie de comentariu gresit: cine o citeste crede ca e singur si scrie
   * inca o plasa, sau, mai rau, se bizuie pe una care nu exista. Vezi memoria
   * `comentariul-fals-e-o-invitatie`.
   *
   * Erau CINCI iesiri si niciuna nu se uita la rezultatul scrierii. Doua nici macar
   * nu scriau: nepotrivirea de suma (mai jos) si calea fericita, unde id-ul
   * calatorea in acelasi UPDATE cu `payment_status`.
   */
  const leagaComanda = async (unde: string, campuri: Record<string, unknown> = {}) => {
    const { error, data } = await admin
      .from("orders")
      .update({ klarna_order_id: klarnaOrderId, ...campuri })
      .eq("id", order.id)
      .neq("payment_status", "paid")
      .select("id");
    /*
     * Zero randuri NU e o eroare aici: `neq("payment_status","paid")` inseamna ca
     * plata fusese deja marcata pe alta cale, iar aceea a scris si id-ul. Doar o
     * eroare propriu-zisa lasa comanda Klarna fara legatura.
     */
    if (error) {
      await logError({
        action: "klarna.legaturaPierduta",
        message: `Comanda Klarna ${klarnaOrderId} EXISTA (${unde}), dar id-ul nu s-a putut scrie pe comanda: ${error.message}`,
        details: { orderId: order.id, klarnaOrderId, unde, code: error.code },
        businessId: order.business_id,
        severity: "critical",
      });
    }
    return !error && !!data;
  };

  if (fraud === "REJECTED") {
    await leagaComanda("fraud REJECTED");
    return { status: "failed", error: "Plata a fost respinsa de Klarna." };
  }

  if (fraud === "PENDING") {
    // Klarna is reviewing the purchase — keep the order confirmed but not yet paid.
    await leagaComanda("fraud PENDING", { status: "confirmed", updated_at: new Date().toISOString() });
    return { status: "pending" };
  }

  // fraud === "ACCEPTED": verify the placed amount, then capture in full.
  const expected = toMinor(Number(order.total) || 0);
  const om = await getOmOrder(cfg, klarnaOrderId);
  if (om.ok && typeof om.data?.order_amount === "number" && om.data.order_amount !== expected) {
    console.error("[klarna] amount mismatch:", { orderId: order.id, expected, got: om.data.order_amount });
    /*
     * Ramura asta NU scria nimic — cea mai grava dintre cele cinci: comanda e deja
     * PLASATA la Klarna (autorizarea consumata), iar id-ul se pierdea complet.
     * Diferenta de suma ramane o decizie de produs, dar legatura se salveaza oricum.
     */
    await leagaComanda("nepotrivire de suma");
    await logError({
      action: "klarna.sumaNepotrivita",
      message: `Comanda Klarna ${klarnaOrderId} plasata pe ${om.data.order_amount} bani, dar comanda are ${expected}. NU s-a incasat.`,
      details: { orderId: order.id, klarnaOrderId, asteptat: expected, primit: om.data.order_amount },
      businessId: order.business_id,
      severity: "critical",
    });
    return { status: "failed", error: "Suma platii nu corespunde comenzii. Te rugam contacteaza magazinul." };
  }

  const cap = await captureOrder(cfg, klarnaOrderId, expected);
  if (!cap.ok) {
    // Authorized but not captured: store the id, log, and leave the order unpaid.
    await leagaComanda("capture esuat");
    console.error("[klarna] capture failed:", { orderId: order.id, error: cap.error });
    return { status: "failed", error: cap.error || "Plata a fost autorizata dar nu a putut fi incasata." };
  }

  // Vezi `finalizare-plata.ts`: aceleasi doua gauri ca la Revolut — `confirmed`
  // neconditionat si `paid` raportat chiar cand baza n-a scris.
  const r = await finalizeazaPlataComenzii(
    admin,
    { id: order.id, businessId: order.business_id },
    { klarna_order_id: klarnaOrderId },
  );
  if (r.fel === "esuat") {
    /*
     * A CINCEA iesire, si cea mai scumpa: `captureOrder` a REUSIT, deci banii sunt
     * incasati. `finalizeazaPlataComenzii` scrie id-ul in acelasi UPDATE cu
     * `payment_status`, deci daca acela pica se pierd amandoua — si comanda ramane
     * „neplatita" fara nicio urma care sa duca la incasarea de la Klarna.
     *
     * Marcarea platii ramane esuata (apelantul NU are voie sa-i spuna clientului
     * „platit"), dar legatura se salveaza separat: ea e tot ce trebuie ca un om sa
     * poata inchide cazul manual.
     */
    await leagaComanda("marcarea platii a esuat dupa capture");
    return { status: "failed", error: r.error };
  }
  return { status: "paid" };
}

/**
 * ═══ ⚠⚠ COMANDA RAMASA IN VERIFICARE ANTIFRAUDA (17.09.2026) ═══
 *
 * `fraud_status: PENDING` inseamna ca Klarna inca se hotaraste. Purtarea de mai sus e corecta:
 * comanda ramane neplatita si nu se captureaza nimic. **Dar nimeni nu se mai intorcea la ea.**
 *
 * Lantul, verificat cap la cap:
 *   1. `placeOrder` intoarce PENDING, se scrie `klarna_order_id`, comanda ramane `unpaid`;
 *   2. cronul EXCLUDE anume comenzile cu `klarna_order_id` (si bine face: altfel ar replasa);
 *   3. `merchant_urls` inregistra DOAR `confirmation`, deci Klarna n-avea unde sa ne anunte;
 *   4. `getOmOrder` nu se mai chema din nicio parte.
 *
 * **Rezultatul:** daca Klarna accepta dupa aceea, nimeni nu captureaza. Comerciantul nu incaseaza
 * NICIODATA, comanda arata „confirmata", si nimic nu semnaleaza.
 *
 * ⚠ E pe dos fata de gaurile de la Netopia, Stripe si iPay: acolo banii erau luati si noi nu stiam.
 * Aici banii NU SE IAU DELOC, iar marfa a plecat.
 *
 * ⚠ SE INTREABA, nu se asteapta. Specificatia lor de Order Management (citita 17.09.2026) arata ca
 * `GET /ordermanagement/v1/orders/{id}` intoarce chiar `fraud_status` si `expires_at`. Deci nu avem
 * nevoie de niciun callback ca sa aflam.
 */
export async function reiaKlarnaInAsteptare(
  admin: SupabaseClient,
  cfg: KlarnaConfig,
  order: { id: string; business_id: string; order_number?: string | null; total: number | string | null },
  klarnaOrderId: string,
): Promise<KlarnaFinalizeResult | { status: "inca-in-verificare" }> {
  const om = await getOmOrder(cfg, klarnaOrderId);
  /* ⚠ O interogare picata NU inseamna „refuzat". Se reia la rularea urmatoare. */
  if (!om.ok || !om.data) return { status: "inca-in-verificare" };

  const fraud = om.data.fraud_status;
  const numar = order.order_number ?? order.id;
  const spune = async (titlu: string, mesaj: string) => {
    const proprietari = await proprietariiMagazinelor(admin as never, [order.business_id]);
    await semnaleazaExpedierea(admin as never, {
      userId: proprietari.get(order.business_id) ?? null,
      businessId: order.business_id,
      orderId: order.id,
      orderNumber: numar,
      tip: "plata",
      titlu,
      mesaj,
      actiune: "klarna-reconcile",
      detalii: { klarnaOrderId, fraud_status: fraud ?? null, expires_at: om.data?.expires_at ?? null },
    });
  };

  if (fraud === "REJECTED") {
    /*
     * ⚠ COMANDA NU SE ANULEAZA, si e aceeasi hotarare ca la cardul refuzat de la Netopia: refuzul e
     * al lui Klarna, nu al cumparatorului, iar comerciantul poate vrea sa-i ceara alta plata.
     * Se spune insa raspicat, fiindca marfa poate fi deja pregatita.
     */
    await spune(
      `Klarna a refuzat plata pentru comanda ${numar}`,
      `Verificarea antifrauda s-a incheiat cu REFUZ pentru comanda ${numar}. Banii NU vor intra. `
      + "Comanda a ramas neplatita si nu a fost anulata: daca vrei s-o onorezi, cere clientului alta "
      + "metoda de plata.",
    );
    return { status: "failed", error: "Klarna a refuzat plata dupa verificarea antifrauda." };
  }

  if (fraud !== "ACCEPTED") {
    /*
     * ⚠ INCA PENDING. Se striga DOAR cand autorizarea e aproape de expirare: dupa `expires_at` banii
     * nu mai pot fi capturati deloc, si atunci comerciantul trebuie sa stie ca are de ales intre a
     * prelungi autorizarea si a nu livra. Pana atunci, o alarma la fiecare cinci minute ar fi zgomot.
     */
    const expira = om.data.expires_at ? Date.parse(om.data.expires_at) : NaN;
    if (Number.isFinite(expira) && expira - Date.now() < 48 * 3600_000) {
      await spune(
        `Klarna inca verifica plata comenzii ${numar}, iar autorizarea expira`,
        `Comanda ${numar} e de ${Number(order.total ?? 0)} lei si sta in verificare antifrauda la `
        + `Klarna. Autorizarea expira la ${String(om.data.expires_at).slice(0, 16)}: dupa acel moment `
        + "banii NU mai pot fi incasati. Daca marfa nu a plecat inca, asteapta; daca a plecat, "
        + "contacteaza Klarna pentru prelungirea autorizarii.",
      );
    }
    return { status: "inca-in-verificare" };
  }

  /* ACCEPTED: se captureaza acum, pe aceeasi cale ca plata obisnuita. */
  const expected = toMinor(Number(order.total) || 0);
  if (typeof om.data.order_amount === "number" && om.data.order_amount !== expected) {
    await logError({
      action: "klarna-reconcile",
      message: `Comanda Klarna ${klarnaOrderId} a trecut de antifrauda, dar e plasata pe ${om.data.order_amount} bani, iar comanda are ${expected}. NU s-a incasat.`,
      details: { orderId: order.id, klarnaOrderId, asteptat: expected, primit: om.data.order_amount },
      businessId: order.business_id,
      severity: "critical",
    });
    return { status: "failed", error: "Suma nu corespunde comenzii." };
  }

  /* ⚠ Daca a fost deja capturata (o rulare de dinainte care a picat DUPA capture), nu se recaptureaza. */
  const dejaCapturat = Number(om.data.captured_amount ?? 0) >= expected && expected > 0;
  if (!dejaCapturat) {
    const cap = await captureOrder(cfg, klarnaOrderId, expected);
    if (!cap.ok) {
      await logError({
        action: "klarna-reconcile",
        message: `Klarna a acceptat comanda ${klarnaOrderId} dupa verificare, dar incasarea a esuat: ${cap.error ?? "motiv necunoscut"}`,
        details: { orderId: order.id, klarnaOrderId },
        businessId: order.business_id,
        severity: "critical",
      });
      return { status: "failed", error: cap.error || "Incasarea a esuat." };
    }
  }

  const r = await finalizeazaPlataComenzii(admin, { id: order.id, businessId: order.business_id });
  if (r.fel === "esuat") return { status: "failed", error: r.error };

  await spune(
    `Klarna a acceptat plata comenzii ${numar}`,
    `Verificarea antifrauda s-a incheiat cu ACCEPT pentru comanda ${numar}, iar banii au fost `
    + "incasati acum. Comanda e marcata platita.",
  );
  return { status: "paid" };
}
