import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { verificaCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { revolutReady, getOrder, toMinor, REVOLUT_CURRENCY, type RevolutConfig } from "@/lib/revolut";
import { finalizeRevolutOrder } from "@/lib/revolut-finalize";
import { baniiSAuIntors, type ComandaAtinsa } from "@/lib/plati/banii-s-au-intors";

/** Cat timp se pazeste o comanda platita pentru o rambursare facuta in portalul lor. */
const ZILE_RAMBURSARE = 120;
/** ⚠ Plafon mic dinadins: paza rambursarilor n-are voie sa infometeze plasa despre bani neincasati. */
const MAX_PLATITE = 120;

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

  /*
   * ⚠⚠ AICI A FOST UN `return` CARE AR FI FACUT PAZA RAMBURSARILOR COD MORT.
   *
   * A PATRA OARA aceeasi capcana intr-o zi (`stripe-reconcile`, `ipay-reconcile`, `klarna-reconcile`,
   * aici). Iesirea era pe cazul NORMAL: nicio comanda neplatita in fereastra. Un `return` timpuriu
   * nu e o optimizare, e o poarta: cine adauga ceva dupa el trebuie sa se intrebe intai daca poarta
   * il lasa sa treaca.
   */
  const neplatite = orders ?? [];

  /*
   * ═══ ⚠⚠ BANII CARE S-AU INTORS (17.09.2026) ═══
   *
   * Bucla de mai jos intreaba doar „au intrat banii?". Nimeni nu intreba „nu cumva au IESIT la loc?".
   *
   * ⚠ SI LA REVOLUT NU EXISTA ALTA CALE. Documentatia lor Merchant API (citita 17.09.2026) are DOAR
   * TREI evenimente de webhook: `ORDER_AUTHORISED`, `ORDER_CANCELLED`, `ORDER_COMPLETED`. Niciunul
   * despre rambursari. Deci o rambursare NU poate fi impinsa catre noi niciodata; singurul mod de a
   * afla e sa citim `refunded_amount` de pe comanda lor.
   */
  const { data: platite, error: ePlatite } = await admin
    .from("orders")
    .select("id, business_id, order_number, status, payment_status, total, revolut_order_id")
    .eq("payment_method", "revolut")
    .eq("payment_status", "paid")
    .not("revolut_order_id", "is", null)
    .gte("created_at", new Date(Date.now() - ZILE_RAMBURSARE * 86400000).toISOString())
    .limit(MAX_PLATITE);
  if (ePlatite) {
    await logError({ action: "revolut-reconcile", message: `comenzile platite nu s-au putut citi: ${ePlatite.message}`, severity: "warning" });
  }

  const bizIds = [...new Set([...neplatite, ...(platite ?? [])].map((o) => o.business_id))];
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

  for (const o of neplatite) {
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

  /* ═══ A DOUA TRECERE: banii care s-au intors ═══ */
  let intoarse = 0;
  for (const o of platite ?? []) {
    const cfg = cfgMap.get(o.business_id);
    const revolutOrderId = o.revolut_order_id as string | null;
    if (!revolutReady(cfg) || !revolutOrderId) continue;
    try {
      const rev = await getOrder(cfg!, revolutOrderId);
      if (!rev.ok || !rev.data) continue;
      const intors = Number(rev.data.refunded_amount ?? 0);
      if (!(intors > 0)) continue;
      const incasat = Number(rev.data.amount ?? toMinor(Number(o.total) || 0));
      const v = await baniiSAuIntors(
        admin as never,
        o as unknown as ComandaAtinsa,
        { intors, incasat, moneda: rev.data.currency || REVOLUT_CURRENCY, referinta: revolutOrderId },
        { actiune: "revolut-reconcile", furnizor: "Revolut" },
      );
      if (v.fel === "integral" || v.fel === "partial") intoarse++;
    } catch (e) {
      /* O interogare picata NU inseamna „nu s-a rambursat". Se reia la rularea urmatoare. */
      console.error("[revolut-reconcile] paza rambursarii a esuat pentru comanda", o.id, e);
    }
  }

  console.log(`[revolut-reconcile] checked ${checked}, marked paid ${paid}, bani intorsi ${intoarse}`);
  return NextResponse.json({ ok: true, checked, paid, intoarse });
}
