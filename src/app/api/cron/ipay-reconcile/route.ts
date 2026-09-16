import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { finalizeazaPlataComenzii } from "@/lib/orders/finalizare-plata";
import { verificaCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { ipayGetOrderStatus, resolveIpayStatus, ipayReady, toBani, ipayMonedaInLitere, IPAY_CURRENCY, type IPayConfig } from "@/lib/ipay";
import { baniiSAuIntors, type ComandaAtinsa } from "@/lib/plati/banii-s-au-intors";
import { maybeMarkMailchimpOrderPaid } from "@/lib/mailchimp-sync";
import { maybeMarkBrevoOrderPaid } from "@/lib/brevo-sync";
import { factureazaDupaPlata } from "@/lib/invoice-on-payment";

// iPay has no webhook — this reconciles orders where the customer paid but never
// returned to the finish route (closed tab). It polls getOrderStatusExtended for
// recent pending iPay orders and marks the paid ones.
/**
 * Cat timp se mai intreaba despre o comanda PLATITA, ca sa se prinda o rambursare sau o contestatie.
 *
 * ⚠ 120 de zile, cifra fiind a retelelor de carduri: atat are cumparatorul ca sa deschida o
 * contestatie. O fereastra scurta ar fi ratat tocmai cazurile tarzii, cele mai scumpe.
 */
const ZILE_RAMBURSARE = 120;
/** ⚠ Plafon mic dinadins: paza rambursarilor n-are voie sa infometeze plasa despre bani neincasati. */
const MAX_PLATITE = 120;

function verifyCron(req: NextRequest): boolean {
  // Vezi src/lib/cron-auth.ts: varianta de dinainte trecea cand CRON_SECRET
  // lipsea din mediu (undefined === undefined).
  return verificaCron(req);
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Pages expire well within a few days; only reconcile recent pending iPay orders.
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data: orders, error: eOrders } = await admin
    .from("orders")
    .select("id, business_id, total, ipay_order_id, ipay_order_number")
    .eq("payment_status", "unpaid")
    .eq("status", "pending")
    /*
     * ⚠ FILTRUL ERA CHIAR PE LEGATURA CARE SE POATE PIERDE.
     *
     * `ipay_order_id` e UUID-ul BANCII, primit DUPA `register.do`. Daca scrierea
     * lui pica, plata exista si comanda iesea din raza cronului pentru totdeauna —
     * adica plasa de siguranta nu acoperea tocmai cazul pentru care exista.
     *
     * `ipay_order_number` e referinta NOASTRA, scrisa INAINTE de apel. Cu ea,
     * comanda ramane vizibila si se poate intreba `getOrderStatusExtended.do` dupa
     * `orderNumber` — ramura care exista de mult in `ipayGetOrderStatus` si pe care
     * nu o chema nimeni.
     */
    .or("ipay_order_id.not.is.null,ipay_order_number.not.is.null")
    .gte("created_at", since)
    .limit(500);

  /*
   * ═══ PLASA DE SIGURANTA NU ARE VOIE SA TACA ═══
   *
   * `const { data: orders } = ...` fara `error`: la o citire picata `orders` e
   * `null`, iar ramura de mai jos raspundea `{ ok: true, checked: 0 }` — o rulare
   * perfect sanatoasa la vedere, care n-a verificat nicio plata.
   *
   * Ironia e completa: cronul asta exista TOCMAI fiindca alte mecanisme pot rata
   * o plata. Daca rateaza el insusi, in tacere, nu mai apara pe nimeni.
   */
  if (eOrders) {
    await logError({ action: "ipay-reconcile", message: eOrders.message, severity: "critical" });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  /*
   * ⚠⚠ AICI A FOST UN `return` CARE AR FI FACUT PAZA RAMBURSARILOR COD MORT.
   *
   * Statea `if (!orders || orders.length === 0) return ...`, adica iesirea pe cazul NORMAL: un
   * magazin fara comenzi neplatite in ultimele trei zile. Trecerea de mai jos, care intreaba despre
   * comenzile PLATITE, n-ar fi rulat aproape niciodata.
   *
   * ⚠ Exact capcana in care am cazut cu o ora inainte la `stripe-reconcile`, unde fisierul avea deja
   * scris un avertisment despre ea. Un `return` timpuriu nu e o optimizare, e o poarta: cine adauga
   * ceva dupa el trebuie sa se intrebe intai daca poarta il lasa sa treaca.
   */
  const neplatite = orders ?? [];

  const bizIds = [...new Set(neplatite.map((o) => o.business_id))];
  const { data: settingsRows, error: eCfg } = bizIds.length > 0
    ? await admin.from("store_settings").select("business_id, ipay_config").in("business_id", bizIds)
    : { data: [] as { business_id: string; ipay_config: unknown }[], error: null };
  // Fara configuratii, TOATE comenzile ar fi sarite — adica exact zero munca,
  // raportata ca reusita. Aceeasi tacere ca la citirea comenzilor.
  if (eCfg) {
    await logError({ action: "ipay-reconcile", message: `configuratiile nu s-au putut citi: ${eCfg.message}`, severity: "critical" });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }
  const cfgMap = new Map((settingsRows ?? []).map((r) => [r.business_id, r.ipay_config as IPayConfig | null]));

  let checked = 0;
  let paid = 0;

  for (const o of neplatite) {
    const cfg = cfgMap.get(o.business_id);
    // Se intreaba dupa id-ul bancii cand il avem; altfel dupa referinta noastra.
    const dupa = o.ipay_order_id
      ? { orderId: o.ipay_order_id }
      : (o.ipay_order_number ? { orderNumber: o.ipay_order_number } : null);
    if (!ipayReady(cfg) || !dupa) continue;
    checked++;
    try {
      const status = await ipayGetOrderStatus(cfg!, dupa);
      const resolved = resolveIpayStatus(status.orderStatus);
      const amountOk = status.amount === toBani(Number(o.total));
      const currencyOk = !status.currency || status.currency === IPAY_CURRENCY.RON;
      if (resolved.paid && amountOk && currencyOk) {
        const r = await finalizeazaPlataComenzii(admin, { id: o.id, businessId: o.business_id });
        if (r.fel === "platita-acum") paid++;
      }
    } catch (e) {
      console.error("[ipay-reconcile] poll failed for order", o.id, e);
    }
  }

  /*
   * ═══ ⚠⚠ A DOUA TRECERE: BANII CARE S-AU INTORS (17.09.2026) ═══
   *
   * Trecerea de mai sus intreaba doar „au intrat banii?". Nimeni nu intreba vreodata „nu cumva au
   * IESIT la loc?", desi `resolveIpayStatus` CALCULA raspunsul: statusurile 4 si 7 inseamna rambursat.
   * Campul era intors si aruncat, fiindca ambii apelanti se uitau numai la `paid`.
   *
   * ⚠ SI AICI CRONUL E SINGURA CALE. iPay nu are webhook server-la-server (vezi antetul rutei de
   * intoarcere), iar dupa o rambursare cumparatorul nu se mai intoarce in magazin. Deci daca nu
   * intrebam noi, nu aflam NICIODATA.
   *
   * ⚠ Raspunsul lor aduce tot ce trebuie dintr-o singura citire: `paymentAmountInfo.refundedAmount`,
   * lista `refunds[]` si steagul `chargeback`. Mai mult decat da Stripe fara webhook.
   *
   * ⚠ Fereastra e de 120 de zile, ca la Stripe, si tot din motivul lor: retelele de carduri lasa
   * pana la 120 de zile pentru o contestatie, iar cazurile tarzii sunt cele scumpe.
   */
  let intrebate = 0;
  let intoarse = 0;
  const { data: platite, error: ePlatite } = await admin
    .from("orders")
    .select("id, business_id, order_number, status, payment_status, total, ipay_order_id, ipay_order_number")
    .eq("payment_method", "ipay")
    .eq("payment_status", "paid")
    .or("ipay_order_id.not.is.null,ipay_order_number.not.is.null")
    .gte("created_at", new Date(Date.now() - ZILE_RAMBURSARE * 86400000).toISOString())
    .order("created_at", { ascending: false })
    .limit(MAX_PLATITE);

  if (ePlatite) {
    /* ⚠ Nu se raspunde 503: trecerea de deasupra si-a facut treaba, si ea e cea urgenta. */
    await logError({
      action: "ipay-reconcile",
      message: `comenzile platite nu s-au putut citi pentru paza rambursarilor: ${ePlatite.message}`,
      severity: "warning",
    });
  }

  /* Configuratiile magazinelor care au DOAR comenzi platite nu sunt in `cfgMap`. */
  const bizPlatite = [...new Set((platite ?? []).map((o) => o.business_id))].filter((b) => !cfgMap.has(b));
  if (bizPlatite.length > 0) {
    const { data: inPlus } = await admin
      .from("store_settings").select("business_id, ipay_config").in("business_id", bizPlatite);
    for (const r of inPlus ?? []) cfgMap.set(r.business_id, r.ipay_config as IPayConfig | null);
  }

  for (const o of platite ?? []) {
    const cfg = cfgMap.get(o.business_id);
    const dupa = o.ipay_order_id
      ? { orderId: o.ipay_order_id }
      : (o.ipay_order_number ? { orderNumber: o.ipay_order_number } : null);
    if (!ipayReady(cfg) || !dupa) continue;
    try {
      const status = await ipayGetOrderStatus(cfg!, dupa);
      const resolved = resolveIpayStatus(status.orderStatus);
      intrebate++;

      /* Nici rambursare, nici contestatie: nimic de facut, si nimic de spus. */
      if (!resolved.rambursat && !status.contestat) continue;

      const incasat = Number(status.amount ?? toBani(Number(o.total)));
      const v = await baniiSAuIntors(
        admin as never,
        o as unknown as ComandaAtinsa,
        {
          /* La contestatie se ia suma intreaga: banii sunt retinuti cu totul. */
          intors: status.contestat ? incasat : Number(status.rambursat ?? 0),
          incasat,
          moneda: ipayMonedaInLitere(status.currency),
          contestatie: status.contestat === true,
          referinta: o.ipay_order_id ?? o.ipay_order_number ?? null,
        },
        { actiune: "ipay-reconcile", furnizor: "iPay" },
      );
      if (v.fel === "integral" || v.fel === "partial" || v.fel === "contestata") intoarse++;
    } catch (e) {
      /* O interogare picata NU inseamna „nu s-a rambursat". Se reia la rularea urmatoare. */
      console.error("[ipay-reconcile] paza rambursarii a esuat pentru comanda", o.id, e);
    }
  }

  console.log(`[ipay-reconcile] checked ${checked}, marked paid ${paid}, platite intrebate ${intrebate}, bani intorsi ${intoarse}`);
  return NextResponse.json({ ok: true, checked, paid, intrebate, intoarse });
}
