import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { verificaCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { finalizeStripeOrder, stripeAccountId } from "@/lib/stripe-finalize";
import { getStripe } from "@/lib/stripe";
import { baniiSAuIntors, type ComandaAtinsa } from "@/lib/stripe-banii-s-au-intors";
import type Stripe from "stripe";

/**
 * Plasa de siguranta pentru platile cu cardul prin Stripe: prinde comenzile in
 * care clientul a platit dar marcarea nu s-a facut — webhook Connect nelivrat
 * (endpoint neconfigurat pe conturi conectate, semnatura gresita, incident de
 * retea) sau client care a inchis pagina inainte sa se intoarca in magazin.
 *
 * Pana la incidentul din 29.07 (comanda incasata la Stripe, afisata „Neplatit"
 * in magazin) Stripe era singura metoda de plata fara nicio verificare in afara
 * webhook-ului. Ruleaza la 15 minute, ca `ipay-reconcile`.
 */
function verifyCron(req: NextRequest): boolean {
  // Vezi src/lib/cron-auth.ts: varianta de dinainte trecea cand CRON_SECRET
  // lipsea din mediu (undefined === undefined).
  return verificaCron(req);
}

/** Fereastra implicita de reconciliere, in zile. */
const ZILE_IMPLICIT = 7;
/** Cat timp se mai intreaba despre o comanda PLATITA, doar ca sa se prinda o rambursare pierduta. */
const ZILE_RAMBURSARE = 30;
/** ⚠ Plafon mic dinadins: paza rambursarilor n-are voie sa infometeze plasa despre bani neincasati. */
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

  // `?zile=` largeste fereastra pentru recuperari manuale dupa un incident;
  // rularea programata foloseste implicitul.
  const zile = Math.min(Math.max(Number(req.nextUrl.searchParams.get("zile")) || ZILE_IMPLICIT, 1), 365);
  const since = new Date(Date.now() - zile * 86400000).toISOString();

  const { data: orders, error: eOrders } = await admin
    .from("orders")
    .select("id, business_id, total, status, stripe_session_id")
    .eq("payment_status", "unpaid")
    .not("stripe_session_id", "is", null)
    // Comenzile anulate sau returnate nu se mai reactiveaza automat: daca acolo
    // chiar au intrat bani, e un caz de rambursare, decis de comerciant.
    .not("status", "in", "(cancelled,refunded)")
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
    await logError({ action: "stripe-reconcile", message: eOrders.message, severity: "critical" });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  /*
   * ⚠ AICI ERA UN `return` CARE FACEA A DOUA TRECERE COD MORT.
   *
   * Cand prima interogare (comenzi CU `stripe_session_id`) nu gasea nimic — cazul
   * normal — functia iesea, iar recuperarea comenzilor ORFANE de mai jos nu rula
   * niciodata. Adica exact partea scrisa pentru cazul rar nu se executa tocmai in
   * situatia obisnuita.
   */
  const { data: orfane, error: eOrfane } = await admin
    .from("orders")
    .select("id, business_id, total, status")
    .eq("payment_status", "unpaid")
    .eq("payment_method", "stripe")
    .is("stripe_session_id", null)
    .not("status", "in", "(cancelled,refunded)")
    .gte("created_at", since)
    .limit(200);

  if (eOrfane) {
    await logError({ action: "stripe-reconcile", message: `comenzile orfane nu s-au putut citi: ${eOrfane.message}`, severity: "critical" });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  const listaOrdine = orders ?? [];
  const listaOrfane = orfane ?? [];

  /*
   * ⚠⚠ AICI A FOST, A DOUA OARA, UN `return` CARE FACEA CODUL DE DUPA MORT.
   *
   * Statea scris `if (listaOrdine.length === 0 && listaOrfane.length === 0) return ...`, adica
   * exact defectul pe care il descrie comentariul de mai sus, doar mutat mai jos. Cand nu exista
   * nicio comanda neplatita (CAZUL NORMAL) functia iesea, si a treia trecere (paza
   * rambursarilor) nu s-ar fi executat niciodata.
   *
   * ⚠ L-am pus chiar eu, adaugand trecerea noua la SFARSITUL fisierului, cu avertismentul scris
   * cu zece randuri mai sus. Un `return` timpuriu nu e o optimizare, e o poarta: cine adauga ceva
   * dupa el trebuie sa se intrebe intai daca poarta il lasa sa treaca.
   *
   * Acum nu se mai iese devreme: fiecare trecere isi verifica singura daca are de lucru.
   */
  const bizIds = [...new Set([...listaOrdine, ...listaOrfane].map((o) => o.business_id))];
  const cfgMap = new Map<string, string | null>();
  if (bizIds.length > 0) {
    const { data: settingsRows, error: eCfg } = await admin
      .from("store_settings")
      .select("business_id, stripe_config")
      .in("business_id", bizIds);
    // Fara configuratii, TOATE comenzile ar fi sarite — adica exact zero munca,
    // raportata ca reusita. Aceeasi tacere ca la citirea comenzilor.
    if (eCfg) {
      await logError({ action: "stripe-reconcile", message: `configuratiile nu s-au putut citi: ${eCfg.message}`, severity: "critical" });
      return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
    }
    for (const r of settingsRows ?? []) cfgMap.set(r.business_id, stripeAccountId(r.stripe_config));
  }

  let checked = 0;
  let paid = 0;

  for (const o of listaOrdine) {
    const accountId = cfgMap.get(o.business_id);
    if (!accountId || !o.stripe_session_id) continue;
    checked++;
    try {
      const result = await finalizeStripeOrder(
        admin,
        accountId,
        { id: o.id, businessId: o.business_id, total: Number(o.total) || 0, status: o.status as string | null },
        o.stripe_session_id,
      );
      if (result.status === "paid") {
        paid++;
        console.log("[stripe-reconcile] comanda marcata platita:", o.id);
      }
    } catch (e) {
      console.error("[stripe-reconcile] verificare esuata pentru comanda", o.id, e);
    }
  }

  /*
   * ═══ A DOUA TRECERE: COMENZILE CARE SI-AU PIERDUT LEGATURA ═══
   *
   * Interogarea de mai sus filtreaza pe `stripe_session_id` NENUL — adica exact
   * legatura care se poate pierde. Daca scrierea de la `/api/stripe/order-checkout`
   * pica dupa ce Stripe a creat sesiunea, comanda iese din raza cronului PENTRU
   * TOTDEAUNA, si tocmai el era plasa de siguranta.
   *
   * De cand sesiunile trimit `payment_intent_data.metadata = { orderId, businessId }`,
   * plata se poate gasi si fara sesiune: se cauta PaymentIntent-urile REUSITE ale
   * contului conectat, dupa metadata. Nu merge pentru platile de dinaintea acelei
   * schimbari — acolo metadata era doar pe sesiune, iar sesiunile nu se pot cauta.
   *
   * Se cauta DOAR pentru magazinele care chiar au comenzi orfane, deci in mod
   * normal nu pleaca niciun apel in plus la Stripe.
   */
  let recuperate = 0;
  if (listaOrfane.length > 0) {
    const dupaMagazin = new Map<string, typeof listaOrfane>();
    for (const o of listaOrfane) {
      const lista = dupaMagazin.get(o.business_id) ?? [];
      lista.push(o);
      dupaMagazin.set(o.business_id, lista);
    }

    for (const [businessId, lista] of dupaMagazin) {
      const accountId = cfgMap.get(businessId);
      if (!accountId) continue;
      const dupaId = new Map(lista.map((o) => [o.id, o]));
      try {
        const gasite = await getStripe().paymentIntents.search(
          { query: `status:'succeeded' AND metadata['businessId']:'${businessId}'`, limit: 100 },
          { stripeAccount: accountId },
        );
        for (const pi of gasite.data) {
          const orderId = pi.metadata?.orderId;
          const o = orderId ? dupaId.get(orderId) : undefined;
          if (!o) continue;

          // Sesiunea se regaseste din PaymentIntent, ca marcarea platii sa treaca
          // prin ACEEASI cale ca toate celelalte (`finalizeStripeOrder`), nu printr-o
          // a doua implementare care s-ar putea departa de ea.
          const sesiuni = await getStripe().checkout.sessions.list(
            { payment_intent: pi.id, limit: 1 },
            { stripeAccount: accountId },
          );
          const sessionId = sesiuni.data[0]?.id;
          if (!sessionId) continue;

          // Legatura pierduta se scrie la loc INAINTE de marcare: chiar daca pasul
          // urmator pica, urmatoarea rulare o prinde pe calea obisnuita.
          const { error: eLegatura } = await admin
            .from("orders").update({ stripe_session_id: sessionId }).eq("id", o.id);
          if (eLegatura) {
            await logError({
              action: "stripe-reconcile",
              message: `Plata gasita pentru comanda ${o.id} (${pi.id}), dar legatura NU s-a putut scrie: ${eLegatura.message}`,
              details: { orderId: o.id, paymentIntent: pi.id, sessionId },
              businessId,
              severity: "critical",
            });
            continue;
          }

          const result = await finalizeStripeOrder(
            admin, accountId,
            { id: o.id, businessId, total: Number(o.total) || 0, status: o.status as string | null },
            sessionId,
          );
          if (result.status === "paid") {
            recuperate++;
            await logError({
              action: "stripe-reconcile",
              message: `Comanda ${o.id} avea plata incasata la Stripe dar isi pierduse legatura. Recuperata dupa metadata.`,
              details: { orderId: o.id, paymentIntent: pi.id, sessionId },
              businessId,
              severity: "warning",
            });
          }
        }
      } catch (e) {
        console.error("[stripe-reconcile] cautarea dupa metadata a esuat pentru magazinul", businessId, e);
      }
    }
  }

  /*
   * ═══ ⚠⚠ A TREIA TRECERE: BANII CARE S-AU INTORS (16.09.2026) ═══
   *
   * Cele doua treceri de mai sus se uita EXCLUSIV la comenzi `unpaid`: ele intreaba „au intrat
   * banii?". Nimeni nu intreba vreodata „nu cumva au IESIT la loc?".
   *
   * Comerciantul ramburseaza din panoul Stripe, unde e cel mai la indemana. Daca evenimentul
   * `charge.refunded` nu e bifat pe capatul Connect (si pana azi n-avea de ce sa fie, fiindca nu-l
   * trata nimeni), comanda ramane `paid` la noi pentru totdeauna: banii dusi, marfa dusa, iar
   * platforma arata o vanzare incheiata cu bine.
   *
   * ⚠ Trecerea asta INTREABA, deci merge si daca in panoul lor nu e bifat nimic.
   *
   * ⚠ FEREASTRA E MAI SCURTA SI PLAFONUL MAI MIC decat la trecerile despre bani neincasati, si nu
   * din zgarcenie: acolo se pierd vanzari, aici se corecteaza o eticheta. Intrebarea asta n-are voie
   * sa infometeze plasa principala.
   *
   * ⚠ O comanda deja `refunded` nu se reintreaba: `baniiSAuIntors` o lasa in pace, dar filtrul de
   * mai jos scuteste si apelul catre ei.
   */
  let intoarse = 0;
  const { data: platite, error: ePlatite } = await admin
    .from("orders")
    .select("id, business_id, order_number, status, payment_status, total, stripe_session_id")
    .eq("payment_method", "stripe")
    .eq("payment_status", "paid")
    .not("stripe_session_id", "is", null)
    .gte("created_at", new Date(Date.now() - ZILE_RAMBURSARE * 86400000).toISOString())
    .order("created_at", { ascending: false })
    .limit(MAX_PLATITE);

  if (ePlatite) {
    /* ⚠ Nu se raspunde 503: trecerile de mai sus si-au facut treaba, si ele sunt cele urgente. */
    await logError({
      action: "stripe-reconcile",
      message: `comenzile platite nu s-au putut citi pentru paza rambursarilor: ${ePlatite.message}`,
      severity: "warning",
    });
  }

  /*
   * ⚠ Configuratiile se aduc DIN NOU pentru magazinele de aici: `cfgMap` s-a compus din magazinele
   * cu comenzi NEPLATITE, iar un magazin poate sa n-aiba niciuna si totusi sa aiba o rambursare. Fara
   * randul asta, tocmai magazinele fara probleme de incasare ar fi ramas nepazite.
   */
  const bizPlatite = [...new Set((platite ?? []).map((o) => o.business_id))].filter((b) => !cfgMap.has(b));
  if (bizPlatite.length > 0) {
    const { data: inPlus } = await admin
      .from("store_settings").select("business_id, stripe_config").in("business_id", bizPlatite);
    for (const r of inPlus ?? []) cfgMap.set(r.business_id, stripeAccountId(r.stripe_config));
  }

  for (const o of platite ?? []) {
    const accountId = cfgMap.get(o.business_id);
    if (!accountId || !o.stripe_session_id) continue;
    try {
      /*
       * O singura cerere: sesiunea, cu plata si incasarea ei desfasurate. Fara `expand` ar fi fost
       * trei dus-intorsuri pentru fiecare comanda.
       */
      const s = await getStripe().checkout.sessions.retrieve(
        o.stripe_session_id,
        { expand: ["payment_intent.latest_charge"] },
        { stripeAccount: accountId },
      );
      const pi = s.payment_intent as Stripe.PaymentIntent | null;
      const charge = (pi?.latest_charge ?? null) as Stripe.Charge | null;
      if (!charge) continue;

      const v = await baniiSAuIntors(admin, o as unknown as ComandaAtinsa, {
        intors: charge.amount_refunded ?? 0,
        incasat: charge.amount ?? 0,
        moneda: charge.currency ?? "ron",
        referinta: charge.id,
      }, "reconciliere");
      if (v.fel === "integral" || v.fel === "partial") intoarse++;
    } catch (e) {
      /* O interogare picata NU inseamna „nu s-a rambursat". Se reia la rularea urmatoare. */
      console.error("[stripe-reconcile] paza rambursarii a esuat pentru comanda", o.id, e);
    }
  }

  console.log(`[stripe-reconcile] checked ${checked}, marked paid ${paid}, recuperate ${recuperate}, bani intorsi ${intoarse}`);
  return NextResponse.json({ ok: true, checked, paid, recuperate, intoarse });
}
