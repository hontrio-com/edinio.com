import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { logError } from "@/lib/error-logger";

export async function POST(request: NextRequest) {
  /*
   * Ruta e publica si nu cere sesiune, iar cele trei verificari de mai jos
   * (comanda exista / neplatita / neanulata) raman adevarate la infinit — deci o
   * bucla pe acelasi orderId nu se rupea niciodata singura, si fiecare cerere
   * deschidea o sesiune NOUA pe contul CONECTAT al comerciantului. La depasirea
   * cotei, Stripe intoarce 429 si pentru platile lui REALE.
   * Doua linii: asta taie rafala pe IP fara sa atinga baza; cea durabila de mai
   * jos (pe comanda) e singura care tine intre instantele serverless.
   */
  if (!rateLimit(`pay-start:${clientIp(request)}`, 10, 60_000)) {
    return NextResponse.json(
      { error: "Prea multe incercari de plata. Te rugam asteapta un minut si incearca din nou." },
      { status: 429 },
    );
  }

  const { orderId, businessId } = await request.json() as { orderId: string; businessId: string };

  if (!orderId || !businessId) {
    return NextResponse.json({ error: "Missing orderId or businessId" }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const [{ data: order }, { data: settings }, { data: business }] = await Promise.all([
    admin.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
    admin.from("store_settings").select("stripe_config").eq("business_id", businessId).single(),
    admin.from("businesses").select("slug, store_name, business_name").eq("id", businessId).single(),
  ]);

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // Prevent duplicate checkout for already-paid or cancelled orders
  if (order.payment_status === "paid") {
    return NextResponse.json({ error: "Comanda a fost deja platita" }, { status: 400 });
  }
  if (order.status === "cancelled") {
    return NextResponse.json({ error: "Comanda a fost anulata" }, { status: 400 });
  }

  const stripeConfig = settings?.stripe_config as { account_id?: string; enabled?: boolean } | null;
  if (!stripeConfig?.account_id || !stripeConfig.enabled) {
    return NextResponse.json({ error: "Stripe not connected for this business" }, { status: 400 });
  }

  const asteptat = Math.round(Number(order.total) * 100);

  /*
   * Reincercarea REFOLOSESTE sesiunea deschisa, nu mai creeaza una noua: asa,
   * clientul care da refresh sau se intoarce din checkout nu mai consuma din
   * cota contului conectat. Conditia pe suma nu e decorativa — comanda poate fi
   * editata dupa initierea platii, iar o sesiune veche ar incasa vechiul total.
   */
  const sesiuneVeche = order.stripe_session_id as string | null;
  if (sesiuneVeche) {
    let veche: Stripe.Checkout.Session | null = null;
    try {
      // Al doilea argument ramane gol: tipurile SDK-ului separa parametrii de
      // optiunile cererii, iar sesiunea traieste pe contul conectat.
      veche = await stripe.checkout.sessions.retrieve(sesiuneVeche, {}, { stripeAccount: stripeConfig.account_id });
    } catch (e) {
      /*
       * ⚠ O CITIRE PICATA NU INSEAMNA „SESIUNEA NU MAI EXISTA".
       *
       * Aici se cadea direct pe `sessions.create`, deci un timeout sau un 5xx de
       * la Stripe nastea o A DOUA sesiune deschisa, pe aceeasi suma, in timp ce
       * prima ramanea platibila 24 de ore. Daca clientul le plateste pe amandoua,
       * al doilea webhook cade pe `{ fel: "deja-platita" }` — iesire TACUTA, fara
       * log si fara marcaj — deci clientul e taxat de doua ori si nimic din
       * aplicatie nu stie. E o paguba a CLIENTULUI, si nu cere nicio editare de
       * comanda ca s-o produca.
       *
       * Numai un refuz DOVEDIT („nu exista", `resource_missing`) permite crearea
       * uneia noi. Orice altceva inseamna „nu stim", si atunci nu se creeaza
       * nimic: clientul reincearca peste cateva secunde, fara sesiuni orfane.
       */
      const err = e as { code?: string; statusCode?: number };
      const dovedit = err?.code === "resource_missing" || err?.statusCode === 404;
      if (!dovedit) {
        await logError({
          action: "stripe/order-checkout",
          message: `sesiunea veche nu a putut fi citita, iar refuzul NU e dovedit: ${e instanceof Error ? e.message : String(e)}`,
          details: { orderId, sesiuneVeche },
          severity: "critical",
        });
        return NextResponse.json(
          { error: "Nu am putut pregati plata. Reincearca peste cateva momente." },
          { status: 503 },
        );
      }
      console.warn("[stripe/order-checkout] sesiunea veche nu mai exista:", { orderId, code: err?.code });
    }

    if (veche) {
      if (veche.status === "open" && veche.url && veche.amount_total === asteptat) {
        return NextResponse.json({ url: veche.url });
      }
      /*
       * Sesiune inca DESCHISA, dar pe alta suma: comanda a fost editata intre timp.
       * Refolosirea o refuza deja (conditia de mai sus), dar pana acum sesiunea
       * veche ramanea platibila 24 de ore — deci clientul putea plati vechiul total
       * si comanda se marca platita pe suma noua. Se inchide la Stripe, nu doar la
       * noi. Esecul inchiderii nu opreste crearea celei noi: cel mai rau caz ramane
       * cel de azi, si e semnalat.
       */
      if (veche.status === "open") {
        try {
          await stripe.checkout.sessions.expire(sesiuneVeche, {}, { stripeAccount: stripeConfig.account_id });
        } catch (e) {
          await logError({
            action: "stripe/order-checkout",
            message: `sesiunea veche pe alta suma nu s-a putut expira: ${e instanceof Error ? e.message : String(e)}`,
            details: { orderId, sesiuneVeche, sumaVeche: veche.amount_total, sumaNoua: asteptat },
            severity: "critical",
          });
        }
      }
    }
  }

  const slug = business?.slug ?? "";
  // Always build redirect URLs from the fixed platform host (like Netopia/iPay),
  // never the request origin. If the customer is on a store's custom domain, the
  // origin would be that domain and the proxy would rewrite `/{slug}/confirm` a
  // second time into `/{slug}/{slug}/confirm` → 404. The proxy 307-redirects the
  // platform `/{slug}/...` path to the custom domain when one is configured.
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.edinio.com";

  /*
   * ⚠ LIMITA DURABILA SE CONSUMA ABIA AICI, NU LA INTRAREA IN RUTA.
   *
   * E un plafon pe COMANDA, nu pe magazin: o comanda reala are nevoie de cateva
   * reincercari de plata, nu de mii, iar o cheie pe `businessId` ar fi lasat un
   * atacator sa blocheze plata pentru toti ceilalti cumparatori ai magazinului.
   *
   * Ea exista ca sa opreasca deschiderea de sesiuni NOI pe contul conectat al
   * comerciantului, deci locul ei e chiar inaintea `sessions.create`. Consumata la
   * intrare, se cheltuia si pe caile care NU creeaza nimic: refolosirea unei
   * sesiuni deschise (perfect legitima, poate fi facuta de zeci de ori cu un
   * refresh) si — mai rau — noul 503 de cand citirea sesiunii vechi pica fara
   * dovada. Cinci hopuri de retea si clientul ramanea blocat o ORA pe o comanda
   * pe care voia s-o plateasca.
   *
   * Mutata aici, apara exact ce trebuie sa apere si nu mai pedepseste pe nimeni
   * pentru esecurile noastre. Se consuma dupa ce stim ca `orderId` chiar exista,
   * ca sa nu se umple tabela de limite cu chei inventate.
   */
  if (!(await consumaLimita(`pay-start:${orderId}`, 5, 3600)).permis) {
    return NextResponse.json(
      { error: "Ai incercat de prea multe ori sa platesti aceasta comanda. Incearca din nou peste o ora sau scrie magazinului." },
      { status: 429 },
    );
  }

  const session = await stripe.checkout.sessions.create(
    {
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "ron",
            product_data: { name: `Comanda ${order.order_number}` },
            unit_amount: asteptat,
          },
          quantity: 1,
        },
      ],
      customer_email: order.customer_email ?? undefined,
      // Intoarcerea trece prin `/api/stripe/return`, care verifica sesiunea si
      // marcheaza comanda platita inainte de a duce clientul la confirmare. Fara
      // ea, marcarea atarna doar de webhook-ul Connect — si cand acela nu ajunge,
      // comanda ramane „Neplatit" cu banii incasati.
      success_url: `${origin}/api/stripe/return?orderId=${orderId}&businessId=${businessId}`,
      cancel_url: `${origin}/${slug}`,
      metadata: { orderId, businessId },
      /*
       * `metadata` si pe PaymentIntent, nu doar pe sesiune.
       *
       * Sesiunile de checkout NU se pot cauta dupa metadata, dar PaymentIntent-urile
       * DA (`paymentIntents.search`). Fara asta, singura legatura ramane
       * `stripe_session_id` de pe comanda — adica exact ce se pierde in scenariul pe
       * care il inchidem, si atunci nimic nu mai poate gasi plata.
       */
      payment_intent_data: { metadata: { orderId, businessId } },
    },
    /*
     * ⚠ AICI **NU** SE PUNE `idempotencyKey`, SI E O DECIZIE, NU O SCAPARE.
     *
     * Pare cel mai ieftin castig cu putinta — Stripe e singurul furnizor cu
     * idempotenta nativa pe POST-uri. Am pus-o (`order:<id>:<suma>`) si am scos-o,
     * fiindca pe CALEA ASTA face rau, din trei motive independente:
     *
     *   1. Stripe memoreaza sub cheie si raspunsul de EROARE, si il rejoaca. O
     *      prima incercare picata (4xx de la contul conectat, card decline pe
     *      configurare) ar bloca plata comenzii pentru ~24 de ore: fiecare
     *      reincercare ar primi inapoi acelasi esec, fara sa mai ajunga la Stripe.
     *   2. Corpul cererii NU e determinist pentru un (orderId, suma) fix:
     *      `customer_email`, `success_url` si `slug` se pot schimba intre incercari
     *      (comanda editata, magazin redenumit). Stripe respinge o a doua cerere cu
     *      aceeasi cheie si alt corp — 400 `idempotency_error` — deci in loc sa
     *      refoloseasca, ar PICA.
     *   3. Cheia traieste mai mult decat sesiunea pe care o memoreaza. O sesiune
     *      Checkout expira la 24h fix; rezultatul cheii se curata „dupa cel putin
     *      24 de ore", asincron. In fereastra dintre ele, Stripe ar rejuca un URL de
     *      checkout MORT, iar clientul n-ar mai putea plati deloc.
     *
     * Duplicatul pe care ar fi trebuit sa-l inchida e deja inchis, si mai bine, de
     * refolosirea sesiunii de mai sus (liniile 80-93): ea verifica `status === "open"`
     * SI `amount_total === asteptat`, deci nu serveste nici sesiuni moarte, nici
     * totalul vechi al unei comenzi editate.
     */
    { stripeAccount: stripeConfig.account_id }
  );

  /*
   * ⚠ LEGATURA CU PLATA SE VERIFICA INAINTE SA TRIMITEM OMUL LA PLATA.
   *
   * Procesatorul a creat plata; daca scrierea de aici pica, clientul plateste si
   * noi ramanem fara id-ul dupa care legam plata de comanda. La Klarna e si mai
   * grav: verificarea din callback („sesiunea e chiar a acestei comenzi?") se
   * sprijina pe campul asta.
   */
  {
    const { error } = await admin
      .from("orders")
      .update({ stripe_session_id: session.id })
      .eq("id", orderId);
    if (error) {
      await logError({ action: "stripe/order-checkout", message: `sesiunea Stripe nu s-a putut salva: ${error.message}`, details: { orderId }, severity: "critical" });
      return NextResponse.json({ error: "Nu am putut pregati plata. Reincearca peste cateva momente." }, { status: 503 });
    }
  }

  return NextResponse.json({ url: session.url });
}
