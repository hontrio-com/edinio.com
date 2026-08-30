import { NextRequest, NextResponse } from "next/server";
import { verificaCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { logError } from "@/lib/error-logger";
import { alegeDeVerificat, type UtilizatorDeReconciliat } from "@/lib/subscriptions/reconciliere";

/**
 * Plasa de siguranta pentru sincronizarea abonamentelor Stripe -> Edinio.
 *
 * `customer.subscription.deleted` pune perioada de gratie la anulare, DAR daca
 * evenimentul nu ajunge (endpoint neabonat, livrare esuata, abonament fara
 * `user_id` in metadata), un cont anulat ramane marcat „activ" si pastreaza
 * accesul degeaba. Cronul asta prinde driftul: un user cu plan PLATIT si FARA
 * niciun abonament Stripe viu primeste aceeasi gratie de 15 zile ca in webhook.
 *
 * ═══ E CRONUL CU CEA MAI MARE CONSECINTA DIN TOT SISTEMUL ═══
 *
 * `suspended_until` inchide si panoul, si COSUL, si CHECKOUT-ul magazinului. O
 * suspendare gresita nu incurca un ecran — opreste vanzarile unui comerciant care
 * plateste. De asta fiecare ramura de mai jos e scrisa sa greseasca INSPRE „nu
 * suspenda": orice necunoscut (citire picata, Stripe care nu raspunde, lista
 * incompleta) inseamna „sarim, incercam la ora urmatoare".
 */

/**
 * Statusurile care inseamna „abonamentul e viu".
 *
 * `past_due` e viu DELIBERAT: neplata se trateaza separat, prin
 * `payment_failed_at` (dunning), iar userii aflati acolo nici nu ajung in
 * interogarea de mai jos. Fara asta, o factura intarziata ar inchide magazinul
 * inainte ca dunning-ul sa apuce sa-si faca treaba.
 *
 * `incomplete` NU e in lista, si e in regula: planul platit se scrie doar pe
 * `checkout.session.completed` si `invoice.payment_succeeded`, deci un abonament
 * a carui prima plata n-a trecut n-a apucat sa dea niciun plan platit.
 */
const STATUSURI_VII = ["active", "trialing", "past_due"] as const;
const GRACE_DAYS = 15;

/**
 * Cate cautari Stripe merg deodata.
 *
 * Masurat la 18.08: 12 useri pe rulare, deci paralelismul nu schimba nimic azi.
 * Exista ca sa nu devina o problema tacut: la o mie de useri, secvential ar
 * insemna minute intregi intr-o functie cu limita de timp, si cronul ar fi taiat
 * la mijloc — adica jumatate din conturi nereconciliate, fara ca nimeni sa afle.
 * Sase deodata sta mult sub plafonul Stripe (100 cereri/s).
 */
const DEODATA = 6;

/**
 * Peste atatia useri, modelul „intreaba Stripe pentru fiecare" nu mai e potrivit
 * si trebuie trecut pe cursor (verifica cei mai vechi N pe rulare) sau pe reluarea
 * evenimentelor Stripe.
 *
 * E un fir de alarma, nu o limita: cronul isi face treaba mai departe. Nu
 * construiesc cursorul acum — la 12 useri ar fi masinarie pentru o problema care
 * nu exista, si tocmai in calea care suspenda conturi. Dar nici nu vreau sa aflam
 * ca era nevoie de el dintr-un cron taiat la mijloc.
 */
const PRAG_REPROIECTARE = 2000;

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const stripe = getStripe();

  let users: UtilizatorDeReconciliat[];
  let bizRows: { user_id: string; suspended_until: string | null }[];

  try {
    /*
     * `fetchAllRowsStrict`, nu o citire simpla.
     *
     * Interogarea n-avea `.range()`, iar PostgREST taie SILENTIOS la 1000. Peste o
     * mie de useri platitori, restul nu erau reconciliati niciodata — si nimic
     * n-ar fi spus-o. Strict, fiindca o lista partiala nu se poate deosebi de una
     * completa, iar aici diferenta inseamna conturi anulate care isi pastreaza
     * accesul la nesfarsit.
     */
    users = await fetchAllRowsStrict<UtilizatorDeReconciliat>("reconcile.users", (from, to) =>
      admin
        .from("users_profile")
        .select("id, plan, stripe_customer_id")
        .in("plan", ["basic", "premium", "ultra"])
        .not("stripe_customer_id", "is", null)
        .is("payment_failed_at", null)
        .order("id")
        .range(from, to));

    /*
     * Magazinele lor, in transe de id-uri.
     *
     * Si aici era acelasi plafon, de doua ori: `.in()` cu o mie de id-uri intoarce
     * tot cel mult o mie de RANDURI, iar un user cu doua magazine il consuma mai
     * repede. O lista trunchiata aici ar fi facut ca useri sa para „fara magazin"
     * si sa fie sariti — greseala INSPRE bine, dar tot pe date false.
     */
    bizRows = [];
    const TRANSA = 300;
    for (let i = 0; i < users.length; i += TRANSA) {
      const ids = users.slice(i, i + TRANSA).map((u) => u.id);
      const bucata = await fetchAllRowsStrict<{ user_id: string; suspended_until: string | null }>(
        "reconcile.businesses", (from, to) =>
          admin
            .from("businesses")
            .select("user_id, suspended_until")
            .in("user_id", ids)
            .order("id")
            .range(from, to));
      bizRows.push(...bucata);
    }
  } catch (e) {
    // Nu stim pe cine sa verificam, deci nu suspendam pe nimeni. Se reia la ora
    // urmatoare; ce trebuie sa NU se intample e o rulare pe date pe jumatate.
    await logError({
      action: "reconcile-subscriptions",
      message: e instanceof Error ? e.message : "citirea utilizatorilor a esuat",
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  // Regula sta in `lib/subscriptions/reconciliere.ts`, cu teste: aici, sub o ruta
  // care cere `CRON_SECRET` si chei Stripe, n-ar putea fi verificata deloc.
  const deVerificat = alegeDeVerificat(users, bizRows);

  if (deVerificat.length > PRAG_REPROIECTARE) {
    await logError({
      action: "reconcile-subscriptions",
      message: `${deVerificat.length} utilizatori de verificat pe rulare — modelul „o cautare Stripe de fiecare" trebuie trecut pe cursor sau pe reluarea evenimentelor.`,
      details: { prag: PRAG_REPROIECTARE },
      severity: "warning",
    });
  }

  /**
   * Are userul un abonament VIU?
   *
   * `null` = n-am putut afla. NU e acelasi lucru cu „nu are", si de asta e un tip
   * separat: apelantul trebuie sa fie silit sa aleaga, nu sa citeasca `false`.
   *
   * ⚠ Se intreaba PE STATUS, nu `status: "all"` cu `limit: 20`.
   *
   * Forma veche cerea ultimele 20 de abonamente ale clientului, de orice fel, si
   * cauta unul viu intre ele. Stripe le da pe cele mai NOI intai, iar abonamentele
   * anulate raman in lista pe vecie: un client care s-a reabonat de cateva ori
   * putea avea 20 de anulari mai noi decat abonamentul lui viu, iar cel viu nu mai
   * incapea in fereastra. Rezultatul ar fi fost „n-are abonament" — adica magazin
   * inchis unui om care plateste.
   *
   * Asa, fiecare cerere intreaba exact un status si se opreste la primul gasit:
   * pentru un cont sanatos e o singura cerere (mai putin decat inainte), iar
   * pentru unul care chiar n-are nimic sunt trei mici. Si e EXACT, indiferent cate
   * abonamente vechi are clientul.
   */
  // Motivul primei picari se pastreaza: fara el, jurnalul ar spune „n-am aflat
  // pentru nimeni" si n-ar spune DE CE — cheie expirata, retea, plafon de cereri.
  let primaEroare: string | null = null;

  async function areAbonamentViu(customerId: string): Promise<boolean | null> {
    try {
      for (const status of STATUSURI_VII) {
        const r = await stripe.subscriptions.list({ customer: customerId, status, limit: 1 });
        if (r.data.length > 0) return true;
      }
      return false;
    } catch (e) {
      if (!primaEroare) primaEroare = e instanceof Error ? e.message : "cerere Stripe esuata";
      return null;
    }
  }

  let verificati = 0;
  let suspendati = 0;
  let nestiute = 0;

  for (let i = 0; i < deVerificat.length; i += DEODATA) {
    const grup = deVerificat.slice(i, i + DEODATA);
    await Promise.all(grup.map(async (u) => {
      verificati++;
      const viu = await areAbonamentViu(u.stripe_customer_id as string);

      // Necunoscut inseamna „nu stim", si nu se suspenda pe „nu stim".
      if (viu === null) { nestiute++; return; }
      if (viu) return;

      const graceUntil = new Date();
      graceUntil.setDate(graceUntil.getDate() + GRACE_DAYS);
      const { error } = await admin
        .from("businesses")
        .update({ suspended_until: graceUntil.toISOString() })
        .eq("user_id", u.id)
        .is("suspended_until", null); // idempotent: doar cele fara gratie deja
      if (error) {
        await logError({
          action: "reconcile-subscriptions", message: error.message,
          details: { userId: u.id }, userId: u.id, severity: "critical",
        });
        return;
      }
      suspendati++;
      await logError({
        action: "reconcile-subscriptions",
        message: `Fara abonament Stripe viu, desi planul e ${u.plan}: gratie de ${GRACE_DAYS} zile.`,
        details: { userId: u.id, plan: u.plan },
        userId: u.id,
        severity: "warning",
      });
    }));
  }

  /*
   * Daca Stripe n-a raspuns pentru NIMENI, nu e ghinion — e o defectiune, si fara
   * randul asta cronul ar raporta linistit `ok: true, suspendati: 0` la fiecare
   * ora, la nesfarsit. Exact tiparul „200, dar nu s-a intamplat nimic".
   */
  if (nestiute > 0 && nestiute === verificati) {
    await logError({
      action: "reconcile-subscriptions",
      message: `Stripe n-a raspuns pentru niciunul dintre cei ${verificati} utilizatori — reconcilierea nu s-a facut deloc.`,
      details: { motiv: primaEroare },
      severity: "critical",
    });
  }

  return NextResponse.json({ ok: true, verificati, suspendati, nestiute });
}
