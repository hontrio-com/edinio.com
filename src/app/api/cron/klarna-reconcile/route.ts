import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { verificaCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { getHppSession, getOmOrder, klarnaReady, toKlarnaOrderInput, toMinor, KLARNA_CURRENCY, type KlarnaConfig } from "@/lib/klarna";
import { finalizeKlarnaOrder, reiaKlarnaInAsteptare } from "@/lib/klarna-finalize";
import { baniiSAuIntors, type ComandaAtinsa } from "@/lib/plati/banii-s-au-intors";

/**
 * Plasa de siguranta pentru platile Klarna.
 *
 * ═══ DE CE FILTRUL E PE `klarna_session_id`, NU PE `klarna_order_id` ═══
 *
 * `klarna_order_id` se scrie abia DUPA `placeOrder`, deci un cron filtrat pe el
 * ar rata exact comenzile pentru care exista: cele la care nici callback-ul, nici
 * intoarcerea in browser n-au apucat sa plaseze comanda. `klarna_session_id` se
 * scrie INAINTE de redirect, iar scrierea lui isi verifica deja eroarea
 * (`/api/klarna/start` raspunde 503 la esec) — deci e singura legatura pe care ne
 * putem baza. Aceeasi lectie ca la iPay, unde filtrul statea chiar pe legatura
 * care se putea pierde.
 *
 * ═══ CAT DE MULT POATE RECUPERA ═══
 *
 * O autorizare Klarna traieste ~60 de minute. Cronul ruleaza la 5 minute tocmai
 * ca sa fie un RECUPERATOR, nu doar un detector: dupa expirare tot ce mai poate
 * face e sa lase o urma in `/admin/logs`. Klarna nu expune cautare dupa
 * `merchant_reference`, deci nu exista alta cale.
 */
function verifyCron(req: NextRequest): boolean {
  return verificaCron(req);
}

// Autorizarea expira in ~60 de minute; peste o zi nu mai are ce recupera, dar
// pastram fereastra putin mai larga ca esecurile sa fie inca vizibile.
const ZILE = 2;
/**
 * Cat timp se mai reia o comanda ramasa in verificare antifrauda.
 *
 * ⚠ Mai lung decat fereastra sesiunilor (2 zile), fiindca o verificare antifrauda poate tine zile,
 * iar autorizarea Klarna traieste si mai mult. O fereastra scurta ar fi lasat tocmai comenzile
 * lente nerezolvate, adica exact cele pentru care s-a scris trecerea.
 */
const ZILE_ASTEPTARE = 30;
const MAX_RELUATE = 200;
/** Cat timp se pazeste o comanda platita pentru o rambursare facuta in portalul lor. */
const ZILE_RAMBURSARE = 120;
/** ⚠ Plafon mic dinadins: paza rambursarilor n-are voie sa infometeze celelalte doua treceri. */
const MAX_PLATITE = 120;

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const since = new Date(Date.now() - ZILE * 86400000).toISOString();
  const { data: orders, error: eOrders } = await admin
    .from("orders")
    .select("*")
    // Pe `payment_status`, nu pe `status`: vezi `revolut-reconcile`.
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
    .not("klarna_session_id", "is", null)
    /*
     * ⚠ Si comenzile pentru care `placeOrder` A RULAT DEJA se exclud.
     *
     * `klarna_order_id` se scrie la prima plasare, reusita sau nu (refuz
     * antifrauda, verificare in curs). Autorizarea e consumata atunci, dar sesiunea
     * HPP ramane `COMPLETED` pe vecie si continua sa intoarca un token — deci fara
     * randul asta cronul ar reincerca aceeasi plasare la fiecare 5 minute, doua
     * zile: pana la 576 de alarme critice si tot atatea apeluri catre API-ul de
     * productie Klarna, pentru un rezultat de business perfect normal.
     */
    .is("klarna_order_id", null)
    .gte("created_at", since)
    .limit(200);

  if (eOrders) {
    await logError({ action: "klarna-reconcile", message: eOrders.message, severity: "critical" });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }
  /*
   * ⚠⚠ AICI A FOST UN `return` CARE AR FI FACUT TRECERILE DE MAI JOS COD MORT.
   *
   * Statea `if (!orders || orders.length === 0) return ...`, adica iesirea pe cazul NORMAL: nicio
   * sesiune HPP nefinalizata in fereastra. Trecerile care reiau verificarile antifrauda si pazesc
   * rambursarile n-ar fi rulat aproape niciodata.
   *
   * ⚠ A TREIA OARA aceeasi capcana intr-o zi (`stripe-reconcile`, `ipay-reconcile`, aici). Un
   * `return` timpuriu nu e o optimizare, e o poarta: cine adauga ceva dupa el trebuie sa se intrebe
   * intai daca poarta il lasa sa treaca.
   */
  const sesiuni = orders ?? [];

  /*
   * ═══ ⚠⚠ COMENZILE RAMASE IN VERIFICARE ANTIFRAUDA ═══
   *
   * `fraud_status: PENDING` inseamna ca Klarna inca se hotaraste, iar comanda ramane NEPLATITA cu
   * `klarna_order_id` scris. Bucla de deasupra le exclude anume (si bine face: ar replasa), deci
   * pana azi nimeni nu se mai intorcea la ele. Daca Klarna accepta dupa aceea, nimeni nu captura,
   * iar comerciantul nu incasa NICIODATA.
   */
  const { data: inAsteptare, error: eAsteptare } = await admin
    .from("orders")
    .select("id, business_id, order_number, total, klarna_order_id")
    .eq("payment_method", "klarna")
    .eq("payment_status", "unpaid")
    .not("klarna_order_id", "is", null)
    .not("status", "in", "(cancelled,refunded)")
    .gte("created_at", new Date(Date.now() - ZILE_ASTEPTARE * 86400000).toISOString())
    .limit(MAX_RELUATE);
  if (eAsteptare) {
    await logError({ action: "klarna-reconcile", message: `comenzile in verificare nu s-au putut citi: ${eAsteptare.message}`, severity: "critical" });
  }

  /* ⚠ Si comenzile PLATITE, pentru rambursari facute in portalul lor. `refunded_amount` era
     DECLARAT in tipul nostru si necitit de nimeni. */
  const { data: platite, error: ePlatite } = await admin
    .from("orders")
    .select("id, business_id, order_number, status, payment_status, total, klarna_order_id")
    .eq("payment_method", "klarna")
    .eq("payment_status", "paid")
    .not("klarna_order_id", "is", null)
    .gte("created_at", new Date(Date.now() - ZILE_RAMBURSARE * 86400000).toISOString())
    .limit(MAX_PLATITE);
  if (ePlatite) {
    await logError({ action: "klarna-reconcile", message: `comenzile platite nu s-au putut citi: ${ePlatite.message}`, severity: "warning" });
  }

  /*
   * ⚠ Magazinele se string din TOATE cele trei liste, nu doar din prima: altfel tocmai magazinele
   * care au numai comenzi in verificare sau numai comenzi platite ar fi ramas fara configurare,
   * adica exact cele pentru care s-au scris trecerile noi.
   */
  const bizIds = [...new Set([
    ...sesiuni.map((o) => o.business_id as string),
    ...(inAsteptare ?? []).map((o) => o.business_id as string),
    ...(platite ?? []).map((o) => o.business_id as string),
  ])];
  if (bizIds.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, paid: 0, reluate: 0, intoarse: 0 });
  }
  const { data: settingsRows, error: eCfg } = await admin
    .from("store_settings")
    .select("business_id, klarna_config, prices_include_vat")
    .in("business_id", bizIds);
  if (eCfg) {
    await logError({ action: "klarna-reconcile", message: `configuratiile nu s-au putut citi: ${eCfg.message}`, severity: "critical" });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }
  const cfgMap = new Map(
    (settingsRows ?? []).map((r) => [
      r.business_id as string,
      { cfg: r.klarna_config as KlarnaConfig | null, vat: (r.prices_include_vat as boolean | null) ?? true },
    ]),
  );

  const { data: businesses, error: eBiz } = await admin
    .from("businesses").select("id, slug").in("id", bizIds);
  if (eBiz) {
    await logError({ action: "klarna-reconcile", message: `magazinele nu s-au putut citi: ${eBiz.message}`, severity: "critical" });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }
  const slugMap = new Map((businesses ?? []).map((b) => [b.id as string, (b.slug as string) ?? ""]));

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.edinio.com";
  let checked = 0;
  let paid = 0;

  for (const o of sesiuni) {
    const businessId = o.business_id as string;
    const intrare = cfgMap.get(businessId);
    const sid = o.klarna_session_id as string | null;
    if (!intrare || !klarnaReady(intrare.cfg) || !sid) continue;
    checked++;
    try {
      const hpp = await getHppSession(intrare.cfg!, sid);
      // Nu alarmam pe sesiuni neterminate: clientul poate sa nu fi platit deloc.
      if (!hpp.ok) continue;
      if (hpp.data?.status !== "COMPLETED" || !hpp.data?.authorization_token) continue;

      const slug = slugMap.get(businessId) ?? "";
      const confirmationUrl = `${baseUrl}/${slug}/confirm?orderId=${o.id}`;
      const input = toKlarnaOrderInput(o as Record<string, unknown>, intrare.vat);
      const r = await finalizeKlarnaOrder(admin, intrare.cfg!, input, hpp.data.authorization_token, confirmationUrl);
      if (r.status === "paid") paid++;
      if (r.status === "failed") {
        /*
         * Sesiunea era COMPLETED — clientul CHIAR a autorizat — si tot n-am reusit
         * sa incheiem. Merita semnalat, dar NU ca `critical`: cel mai frecvent
         * motiv e un rezultat normal de business (Klarna a refuzat clientul la
         * antifrauda). Alarmele critice sunt pentru ce trebuie sa trezeasca pe
         * cineva; ingropate sub refuzuri obisnuite, nu mai trezesc pe nimeni.
         * Nepotrivirea de suma si scrierea picata isi au deja propriile alarme
         * critice, inauntru.
         */
        await logError({
          action: "klarna-reconcile",
          message: `Sesiune Klarna COMPLETED, dar finalizarea a esuat: ${r.error}`,
          details: { orderId: o.id, sid },
          businessId,
          severity: "warning",
        });
      }
    } catch (e) {
      console.error("[klarna-reconcile] poll failed for order", o.id, e);
    }
  }

  /* ═══ A DOUA TRECERE: comenzile ramase in verificare antifrauda ═══ */
  let reluate = 0;
  for (const o of inAsteptare ?? []) {
    const intrare = cfgMap.get(o.business_id as string);
    if (!intrare || !klarnaReady(intrare.cfg)) continue;
    try {
      const r = await reiaKlarnaInAsteptare(
        admin, intrare.cfg!,
        { id: o.id as string, business_id: o.business_id as string, order_number: o.order_number as string | null, total: o.total as number },
        String(o.klarna_order_id),
      );
      if (r.status === "paid" || r.status === "failed") reluate++;
    } catch (e) {
      /* O interogare picata NU inseamna „refuzat". Se reia la rularea urmatoare. */
      console.error("[klarna-reconcile] reluarea verificarii a esuat pentru comanda", o.id, e);
    }
  }

  /* ═══ A TREIA TRECERE: banii care s-au intors ═══ */
  let intoarse = 0;
  for (const o of platite ?? []) {
    const intrare = cfgMap.get(o.business_id as string);
    if (!intrare || !klarnaReady(intrare.cfg)) continue;
    try {
      const om = await getOmOrder(intrare.cfg!, String(o.klarna_order_id));
      if (!om.ok || !om.data) continue;
      const intors = Number(om.data.refunded_amount ?? 0);
      if (!(intors > 0)) continue;
      const incasat = Number(om.data.captured_amount ?? om.data.order_amount ?? toMinor(Number(o.total) || 0));
      const v = await baniiSAuIntors(
        admin as never,
        o as unknown as ComandaAtinsa,
        { intors, incasat, moneda: KLARNA_CURRENCY, referinta: String(o.klarna_order_id) },
        { actiune: "klarna-reconcile", furnizor: "Klarna" },
      );
      if (v.fel === "integral" || v.fel === "partial") intoarse++;
    } catch (e) {
      console.error("[klarna-reconcile] paza rambursarii a esuat pentru comanda", o.id, e);
    }
  }

  console.log(`[klarna-reconcile] checked ${checked}, marked paid ${paid}, reluate ${reluate}, bani intorsi ${intoarse}`);
  return NextResponse.json({ ok: true, checked, paid, reluate, intoarse });
}
