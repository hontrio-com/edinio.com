import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { Database } from "@/types/database.types";
import { getStripe } from "@/lib/stripe";
import { proprietariiMagazinelor, semnaleazaExpedierea } from "@/lib/orders/semnalarea-ajunge-la-om";
import { logError } from "@/lib/error-logger";

type Admin = SupabaseClient<Database>;

/**
 * „Banii s-au intors la cumparator." Un singur loc, pentru toate drumurile.
 *
 * ═══ ⚠⚠ CE LIPSEA CU TOTUL (16.09.2026) ═══
 *
 * Masurat: in TOT codul se tratau sase feluri de evenimente Stripe, si niciunul nu era despre bani
 * intorsi. Nici `charge.refunded`, nici `charge.dispute.created`. Iar cronul de reconciliere se uita
 * exclusiv la comenzile `unpaid`, deci nici el n-avea cum sa afle.
 *
 * Adica: comerciantul ramburseaza un cumparator din panoul Stripe (locul unde e cel mai la indemana
 * s-o faca, si unde a facut-o dintotdeauna), sau cumparatorul castiga o contestatie, si comanda
 * ramane **`paid` la noi pentru totdeauna**. Banii dusi, marfa dusa, iar platforma arata o vanzare
 * incheiata cu bine.
 *
 * ⚠ E aceeasi gaura pe care Netopia o avea in aceeasi zi, dar aici muscatura e mai probabila:
 * panoul Stripe face rambursarea cu doua clicuri.
 *
 * ═══ ⚠⚠ RAMBURSAREA PARTIALA NU SE POATE SCRIE, SI NU SE MINTE ═══
 *
 * `orders_payment_status_check` ingaduie exact trei valori: `unpaid`, `paid`, `refunded`. Nu exista
 * `partially_refunded` (desi `marfa-a-plecat-fara-bani.ts` il numara intr-un set, unde e valoare
 * MOARTA: baza nu-l poate tine).
 *
 * Deci la o rambursare partiala NU se scrie `refunded`: ar spune ca s-au intors toti banii, ceea ce
 * e fals, si ar scoate comanda din semnalul de marfa plecata fara bani. Se lasa `paid` (adevarat:
 * o parte din bani CHIAR au ramas) si se strica tacerea: comerciantul primeste o notificare cu suma
 * exacta. O necunoscuta spusa e mai buna decat o cifra gresita scrisa in baza.
 *
 * ═══ ⚠ O CONTESTATIE NU E O RAMBURSARE ═══
 *
 * La `charge.dispute.created` banii sunt RETINUTI de banca, dar litigiul se poate castiga. Deci
 * comanda NU se misca deloc, si se striga tare: pentru comerciant asta e marfa plecata plus bani
 * blocati plus un termen de raspuns la care, daca nu se prezinta, pierde din oficiu.
 */

export type IntoarcereaBanilor = {
  /** Cat s-a intors, in subunitati (bani). */
  intors: number;
  /** Cat se incasase, in subunitati. */
  incasat: number;
  /** Moneda incasarii, asa cum o spune Stripe. */
  moneda: string;
  /** Contestatie (chargeback), nu rambursare hotarata de comerciant. */
  contestatie?: boolean;
  /** Ce anume ne-a spus-o, pentru jurnal. */
  referinta?: string | null;
};

export type VerdictIntoarcere =
  | { fel: "integral" }
  | { fel: "partial" }
  | { fel: "contestata" }
  /** Nu s-a intors nimic, sau comanda stia deja. Nimic de facut, si nimic de spus. */
  | { fel: "nimic" }
  | { fel: "esec"; mesaj: string };

export interface ComandaAtinsa {
  id: string;
  business_id: string;
  order_number: string | null;
  status: string | null;
  payment_status: string | null;
  total: number | string | null;
}

const lei = (bani: number, moneda: string) =>
  `${(bani / 100).toFixed(2)} ${String(moneda || "ron").toUpperCase()}`;

export async function baniiSAuIntors(
  admin: Admin,
  order: ComandaAtinsa,
  ce: IntoarcereaBanilor,
  /** De unde am aflat. Intra in jurnal, ca sa se poata deosebi vestea de la ei de cea cautata de noi. */
  sursa: "webhook" | "reconciliere",
): Promise<VerdictIntoarcere> {
  const actiune = sursa === "webhook" ? "stripe/connect/webhook" : "stripe/reconciliere";

  if (!(ce.intors > 0)) return { fel: "nimic" };

  /*
   * ⚠ GARDA DE REPETARE, si e singura pe care ne putem bizui pe drumul cronului: acolo nu exista
   * niciun id de eveniment de deduplicat, iar comanda se reciteste la fiecare rulare. Daca e deja
   * scrisa `refunded`, nu se mai scrie si nu se mai striga.
   */
  const dejaIntoarsa = (order.payment_status ?? "").trim() === "refunded";

  const proprietari = await proprietariiMagazinelor(admin, [order.business_id]);
  const userId = proprietari.get(order.business_id) ?? null;
  const numar = order.order_number ?? order.id;

  /*
   * ⚠⚠ CONTESTATIA NU MISCA NIMIC. Se poate castiga, iar o comanda trecuta pe „rambursata" si apoi
   * castigata ar trebui data inapoi de mana. Aici informatia valoreaza mai mult decat scrierea.
   */
  if (ce.contestatie) {
    await semnaleazaExpedierea(admin, {
      userId,
      businessId: order.business_id,
      orderId: order.id,
      orderNumber: numar,
      tip: "plata",
      titlu: "Contestatie la plata cu cardul",
      mesaj:
        `Cumparatorul a contestat plata de ${lei(ce.intors, ce.moneda)} pentru comanda ${numar}. `
        + "Banii sunt retinuti de banca pana se lamureste. Raspunde in contul tau Stripe, la termenul "
        + "cerut acolo: fara raspuns, contestatia se pierde din oficiu. Comanda nu a fost modificata.",
      actiune,
      detalii: { referinta: ce.referinta ?? null, intors: ce.intors, incasat: ce.incasat, moneda: ce.moneda },
    });
    return { fel: "contestata" };
  }

  /* Partial: nu se poate scrie in baza, deci se spune. Vezi antetul. */
  if (ce.intors < ce.incasat) {
    if (dejaIntoarsa) return { fel: "nimic" };
    await semnaleazaExpedierea(admin, {
      userId,
      businessId: order.business_id,
      orderId: order.id,
      orderNumber: numar,
      tip: "plata",
      titlu: "Rambursare partiala la comanda " + numar,
      mesaj:
        `S-au intors ${lei(ce.intors, ce.moneda)} din ${lei(ce.incasat, ce.moneda)} pentru comanda ${numar}. `
        + "Comanda ramane marcata platita, fiindca o parte din bani au ramas incasati, iar platforma nu "
        + "are o stare de «rambursat partial». Daca ai rambursat tot, verifica in Stripe.",
      actiune,
      detalii: { referinta: ce.referinta ?? null, intors: ce.intors, incasat: ce.incasat, moneda: ce.moneda },
    });
    return { fel: "partial" };
  }

  if (dejaIntoarsa) return { fel: "nimic" };

  /*
   * ⚠ INTEGRAL: se scrie prin `aplica_tranzitia_comenzii`, ca la panou si ca la Netopia. Un `update`
   * direct ar fi lasat cuponul si stocul neatinse, deci „rambursat" ar fi insemnat doua lucruri
   * diferite dupa cum a fost aflat. Un cuvant, un inteles.
   *
   * ⚠ Statusul comenzii NU se schimba: o rambursare nu inseamna neaparat ca marfa s-a intors.
   */
  const { data: t, error: eT } = await admin.rpc("aplica_tranzitia_comenzii", {
    p_order_id: order.id,
    p_status: (order.status ?? "pending") as string,
    p_payment_status: "refunded",
    p_business_id: order.business_id,
  });
  const rez = t as { gasit?: boolean } | null;
  if (eT || rez?.gasit !== true) {
    await logError({
      action: actiune,
      message: `Stripe a rambursat ${lei(ce.intors, ce.moneda)} pentru comanda ${numar}, dar comanda NU s-a putut marca rambursata: ${eT?.message ?? "tranzitia n-a raspuns valid"}`,
      details: { orderId: order.id, referinta: ce.referinta ?? null },
      businessId: order.business_id,
      severity: "critical",
    });
    return { fel: "esec", mesaj: eT?.message ?? "tranzitia comenzii n-a raspuns valid" };
  }

  await semnaleazaExpedierea(admin, {
    userId,
    businessId: order.business_id,
    orderId: order.id,
    orderNumber: numar,
    tip: "plata",
    titlu: "Comanda " + numar + " a fost rambursata",
    mesaj:
      `S-au intors ${lei(ce.intors, ce.moneda)} catre cumparator pentru comanda ${numar}. `
      + "Am marcat-o rambursata. Daca ai emis factura, storneaz-o.",
    actiune,
    detalii: { referinta: ce.referinta ?? null, intors: ce.intors, incasat: ce.incasat, moneda: ce.moneda },
  });
  return { fel: "integral" };
}

/**
 * De la o plata a lor, la o comanda de-a noastra.
 *
 * ⚠ DOUA DRUMURI, SI AL DOILEA NU E DE PRISOS. `order-checkout` pune `{orderId, businessId}` pe
 * PaymentIntent dinadins (sesiunile de checkout NU se pot cauta dupa metadata). Dar comenzile create
 * INAINTE de acea adaugare n-au metadata, iar ele sunt tocmai cele vechi, adica exact cele pentru
 * care o rambursare tarzie e mai probabila. Pentru ele se cauta sesiunea dupa PaymentIntent si se
 * potriveste `stripe_session_id`, coloana pe care o avem de la inceput.
 */
export async function comandaPlatiiStripe(
  admin: Admin,
  paymentIntentId: string,
  accountId: string,
): Promise<ComandaAtinsa | null> {
  const CAMPURI = "id, business_id, order_number, status, payment_status, total";
  const stripe = getStripe();

  let pi: Stripe.PaymentIntent | null = null;
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId, {}, { stripeAccount: accountId });
  } catch (e) {
    console.error("[stripe] PaymentIntent necitibil:", { paymentIntentId, e });
  }

  const orderId = pi?.metadata?.orderId;
  const businessId = pi?.metadata?.businessId;
  if (orderId && businessId) {
    const { data } = await admin
      .from("orders").select(CAMPURI).eq("id", orderId).eq("business_id", businessId).maybeSingle();
    if (data) return data as unknown as ComandaAtinsa;
  }

  try {
    const sesiuni = await stripe.checkout.sessions.list(
      { payment_intent: paymentIntentId, limit: 3 },
      { stripeAccount: accountId },
    );
    for (const s of sesiuni.data) {
      const { data } = await admin
        .from("orders").select(CAMPURI).eq("stripe_session_id", s.id).maybeSingle();
      if (data) return data as unknown as ComandaAtinsa;
    }
  } catch (e) {
    console.error("[stripe] sesiunile PaymentIntent-ului nu s-au putut citi:", { paymentIntentId, e });
  }

  return null;
}
