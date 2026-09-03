"use server";

import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/error-logger";
import { rateLimit } from "@/lib/utils/rate-limit";
import { verdictulPlatii, type PlataVerificata } from "@/lib/edinio-marketing/verdict-plata";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  O PLATA SE CREDE DE LA STRIPE, NU DE LA ADRESA DIN BARA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CE ERA INAINTE. Pagina de plan socotea plata reusita din doua lucruri pe care
  le stapaneste chiar omul din fata ecranului:

      searchParams.get("success") === "1"
      sessionStorage.getItem("onboarding_pending_plan")

  Cine pornea o plata si o abandona avea deja amandoua. Intrand apoi pe
  `/onboarding/plan?success=1`, browserul trimitea un `purchase` — catre GA4,
  Google Ads, Meta si TikTok — pentru bani care nu s-au incasat niciodata. Nu era
  nevoie de rea-vointa: o intoarcere cu butonul „inapoi" dupa o plata picata sau o
  adresa ramasa in istoric ajung in acelasi loc.

  ⚠ CE NU ERA IN PERICOL, si merita spus limpede: DREPTUL la plan. `createBusiness`
  nu accepta planul de la client — planul platit se aseaza din webhook-ul Stripe,
  iar pana atunci omul primeste trialul. Deci nu se putea fura un abonament. Ce se
  strica era masuratoarea: Google Ads invata sa liciteze pe conversii care nu erau
  bani.

  ⚠ SI SUMA. Browserul o lua din tabelul lui de preturi (`PLAN_PRICES`), adica o
  presupunere. Webhook-ul o ia din `amount_total`, adica din ce s-a incasat chiar —
  si comentariul lui spune apasat ca asa trebuie. Cele doua cai raportau acelasi
  abonament cu doua sume ori de cate ori pretul din Stripe se departa de constanta
  din cod: o reducere, un pret schimbat in Stripe si uitat aici, orice.

  ⚠ CE SE PIERDE, si de ce e schimbul bun. Daca Stripe nu raspunde, nu mai trimitem
  `purchase` din browser deloc. Conversia catre Meta si TikTok pleaca oricum, de pe
  server, din webhook. Se pierde doar perechea de browser pentru GA4 si Google Ads,
  si numai cat tine pana raspunde Stripe. O conversie lipsa se vede si se poate
  recupera; una falsa intra in invatarea licitatiei si nu mai iese.
*/


/**
 * Confirma la Stripe ca sesiunea asta e o plata adevarata, a omului asta.
 *
 * ⚠ SE CHEAMA DE PE SERVER, cu cheia noastra. Browserul nu poate minti aici: tot
 * ce trimite el e un id de sesiune, iar restul se citeste de la Stripe.
 */
export async function verificaPlataOnboarding(idSesiune: string): Promise<PlataVerificata> {
  const sid = (idSesiune ?? "").trim();
  if (!sid || !sid.startsWith("cs_")) return { ok: false, motiv: "fara-sesiune" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, motiv: "neautentificat" };

  /*
    ⚠ UN PLAFON MODEST, PE OM. Fiecare chemare inseamna o cerere catre Stripe si un
    rand in jurnal. Id-urile de sesiune au entropie mare, deci nimeni nu le ghiceste
    — dar un om autentificat poate cere de o mie de ori, iar noi platim de o mie de
    ori. Treizeci pe ora acopera cu mult reluarile noastre (trei pe plata) si orice
    om care se razgandeste; pentru un robot e deja o margine.
  */
  if (!rateLimit(`plata:${user.id}`, 30, 3_600_000)) return { ok: false, motiv: "indisponibil" };

  let sesiune;
  try {
    sesiune = await getStripe().checkout.sessions.retrieve(sid);
  } catch (e) {
    /*
      ⚠ „Nu stiu" NU e „n-a platit". Un id inventat da tot pe aici, dar si o pana
      de retea. Amandoua duc la „nu trimite `purchase`", ceea ce e purtarea sigura
      — dar in jurnal se scriu deosebit, ca sa nu para o pana ceea ce e o incercare.
    */
    const mesaj = e instanceof Error ? e.message : "eroare necunoscuta";
    const eIdNecunoscut = /No such checkout\.session|resource_missing/i.test(mesaj);
    await logError({
      action: eIdNecunoscut ? "plata.sesiuneInexistenta" : "plata.stripeIndisponibil",
      message: mesaj,
      userId: user.id,
      severity: eIdNecunoscut ? "warning" : "error",
    });
    return { ok: false, motiv: eIdNecunoscut ? "fara-sesiune" : "indisponibil" };
  }

  return verdictulPlatii(sesiune, user.id);
}
