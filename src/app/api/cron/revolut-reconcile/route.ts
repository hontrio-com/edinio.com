import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { verificaCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { revolutReady, type RevolutConfig } from "@/lib/revolut";
import { finalizeRevolutOrder } from "@/lib/revolut-finalize";

/**
 * Plasa de siguranta pentru platile Revolut.
 *
 * ═══ DE CE EXISTA ═══
 *
 * Revolut are doua cai catre „platit": intoarcerea clientului in browser si
 * webhookul semnat `ORDER_COMPLETED`. Amandoua pot rata — clientul inchide tabul,
 * webhookul cade peste un incident de baza. Fereastra lui de reincercare e de
 * ~30 de minute in total (3 livrari), deci un incident mai lung de atat pierdea
 * plata DEFINITIV: banii incasati la Revolut, comanda „Neplatit" la noi, si
 * nimeni care sa se mai intoarca dupa ea. Stripe si iPay aveau de mult cate un
 * cron; Revolut, nu.
 *
 * ═══ CE NU FACE ═══
 *
 * NU reimplementeaza marcarea platii. Cheama `finalizeRevolutOrder`, care e deja
 * idempotent, verifica starea la Revolut SI suma incasata. O reconciliere care ar
 * marca `paid` direct din lista de comenzi ar sari peste verificarea de suma —
 * exact bresa inchisa la Netopia.
 */
function verifyCron(req: NextRequest): boolean {
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

  // `?zile=` pentru recuperare manuala dupa un incident mai lung; implicit 7,
  // ca la Stripe.
  const zileCerute = Number(req.nextUrl.searchParams.get("zile"));
  const zile = Number.isFinite(zileCerute) && zileCerute > 0 && zileCerute <= 90 ? zileCerute : 7;
  const since = new Date(Date.now() - zile * 86400000).toISOString();

  const { data: orders, error: eOrders } = await admin
    .from("orders")
    /*
     * Filtrul e pe `payment_status`, NU pe `status`.
     *
     * `finalizeazaPlataComenzii` avanseaza statusul din `WHERE`, deci o comanda
     * platita si trecuta intre timp pe `confirmed` de comerciant, dar ramasa
     * `unpaid`, ar fi fost sarita de un filtru pe status — adica tocmai comanda
     * care are nevoie de reconciliere.
     */
    .select("id, business_id, total, revolut_order_id")
    .eq("payment_status", "unpaid")
    /*
     * ⚠ COMENZILE ANULATE SE EXCLUD. Fara randul asta, cronul INCASEAZA bani pe
     * o comanda pe care comerciantul a anulat-o.
     *
     * `payment_status` nu poate deveni niciodata „anulat": constrangerea admite
     * doar unpaid/paid/refunded, iar `aplica_tranzitia_comenzii` pastreaza plata
     * neatinsa. Deci o comanda anulata cat era neplatita ramane PERMANENT `unpaid`
     * si s-ar potrivi la infinit cu filtrul de mai sus — la fiecare rulare, pana
     * iese din fereastra. Cu stocul deja eliberat altcuiva si cu facturarea
     * automata pornita de marcarea platii.
     *
     * `stripe-reconcile` avea de mult garda asta; cronurile noi au copiat filtrul
     * pe `payment_status` si au uitat-o. A filtra pe `payment_status` NU inlocuieste
     * excluderea starilor terminale.
     */
    .not("status", "in", "(cancelled,refunded)")
    .not("revolut_order_id", "is", null)
    .gte("created_at", since)
    .limit(500);

  /*
   * O plasa de siguranta care tace e mai rea decat una care lipseste: pare ca a
   * verificat. Vezi `ipay-reconcile` si cronul de domenii, unde `const { data }`
   * fara `error` raporta „checked: 0" pe o citire picata.
   */
  if (eOrders) {
    await logError({ action: "revolut-reconcile", message: eOrders.message, severity: "critical" });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, paid: 0 });
  }

  const bizIds = [...new Set(orders.map((o) => o.business_id))];
  const { data: settingsRows, error: eCfg } = await admin
    .from("store_settings")
    .select("business_id, revolut_config")
    .in("business_id", bizIds);
  // Fara configuratii toate comenzile ar fi sarite — zero munca raportata ca reusita.
  if (eCfg) {
    await logError({ action: "revolut-reconcile", message: `configuratiile nu s-au putut citi: ${eCfg.message}`, severity: "critical" });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }
  const cfgMap = new Map((settingsRows ?? []).map((r) => [r.business_id, r.revolut_config as RevolutConfig | null]));

  let checked = 0;
  let paid = 0;

  for (const o of orders) {
    const cfg = cfgMap.get(o.business_id);
    const revolutOrderId = o.revolut_order_id as string | null;
    if (!revolutReady(cfg) || !revolutOrderId) continue;
    checked++;
    try {
      const r = await finalizeRevolutOrder(
        admin,
        cfg!,
        { id: o.id, businessId: o.business_id, total: Number(o.total) || 0 },
        revolutOrderId,
      );
      if (r.status === "paid") paid++;
      /*
       * `pending` NU e esec: plata inca se deconteaza. Logat critical, fiecare
       * rulare la 15 minute ar umple jurnalul cu alarme pentru comenzi sanatoase.
       * `failed` de aici inseamna de cele mai multe ori „clientul n-a platit",
       * ceea ce e starea normala a unei comenzi `unpaid` — deci nici el nu se
       * alarmeaza. Ce trebuia semnalat (nepotrivire de suma, scriere picata) e
       * deja semnalat inauntru.
       */
    } catch (e) {
      console.error("[revolut-reconcile] poll failed for order", o.id, e);
    }
  }

  console.log(`[revolut-reconcile] checked ${checked}, marked paid ${paid}`);
  return NextResponse.json({ ok: true, checked, paid });
}
