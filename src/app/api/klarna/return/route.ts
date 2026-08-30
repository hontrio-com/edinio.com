import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getHppSession, klarnaReady, toKlarnaOrderInput, type KlarnaConfig } from "@/lib/klarna";
import { finalizeKlarnaOrder } from "@/lib/klarna-finalize";
import { citireCazuta } from "@/lib/supabase/citire";
import { logError } from "@/lib/error-logger";

/**
 * Browser return target after the Klarna hosted page. Klarna appends the
 * authorization_token; here we place the order and capture it (server-side, with
 * the merchant's credentials). The /api/klarna/callback route is the safety net
 * for customers who never return.
 */
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const sp = request.nextUrl.searchParams;
  const orderId = sp.get("orderId");
  const businessId = sp.get("businessId");
  const authToken = sp.get("authorization_token");

  if (!orderId || !businessId) {
    return NextResponse.redirect(new URL("/", baseUrl));
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const [
    { data: order, error: eOrder },
    { data: settings, error: eSettings },
    { data: business, error: eBusiness },
  ] = await Promise.all([
    admin.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
    admin.from("store_settings").select("klarna_config, prices_include_vat").eq("business_id", businessId).single(),
    admin.from("businesses").select("slug").eq("id", businessId).single(),
  ]);

  /*
   * ⚠ „Comanda nu exista" si „n-am putut interoga baza" duceau amandoua la
   * acelasi redirect mut catre „/". In al doilea caz clientul are o autorizare
   * Klarna vie in mana, iar noi o aruncam fara sa lasam nicio urma — singurul
   * obiect din care un om ar fi putut inchide cazul manual.
   *
   * Aici nu se poate raspunde 503 (e un browser), deci castigul e logul, care
   * poarta si `authorization_token`-ul primit.
   */
  if (citireCazuta(eOrder, order) || citireCazuta(eSettings, settings) || citireCazuta(eBusiness, business)) {
    const e = [eOrder, eSettings, eBusiness].find((x) => x && x.code !== "PGRST116");
    await logError({
      action: "klarna/return",
      message: `citire picata inainte de finalizare: ${e?.message ?? "motiv necunoscut"}`,
      // `orderId` din query, nu `order.id`: pe calea asta `order` e chiar null.
      details: { orderId, authorization_token: authToken, sid: sp.get("sid") },
      businessId,
      severity: "critical",
    });
    /*
     * ⚠ Fara slug, `/${""}/confirm` devine `//confirm` — adresa PROTOCOL-RELATIVA,
     * adica host EXTERN (`https://confirm/`). Si tocmai citirea lui `businesses`
     * poate fi cea care a picat. Fara slug se merge acasa.
     */
    const slugSigur = business?.slug ?? "";
    if (!slugSigur) return NextResponse.redirect(new URL("/", baseUrl));
    return NextResponse.redirect(new URL(
      `/${slugSigur}/confirm?status=esuat&motiv=${encodeURIComponent("Nu am putut confirma plata. Te rugam contacteaza magazinul.")}&orderId=${encodeURIComponent(orderId)}`,
      baseUrl,
    ));
  }

  const slug = business?.slug ?? "";
  if (!order || !business) {
    return NextResponse.redirect(new URL("/", baseUrl));
  }

  const successUrl = new URL(`/${slug}/confirm?orderId=${order.id}&name=${encodeURIComponent(order.customer_name as string)}&total=${order.total}`, baseUrl);
  const fail = (motiv: string) =>
    NextResponse.redirect(new URL(`/${slug}/confirm?status=esuat&motiv=${encodeURIComponent(motiv)}&orderId=${order.id}`, baseUrl));

  // Already finalized (e.g. the callback got here first) — just show confirmation.
  // Ramane INAINTEA verificarii de sesiune: un client legitim intors dupa ce
  // callback-ul a finalizat deja trebuie sa vada confirmarea, nu un esec.
  if (order.payment_status === "paid") {
    return NextResponse.redirect(successUrl);
  }

  const cfg = settings?.klarna_config as KlarnaConfig | null;
  if (!klarnaReady(cfg)) {
    return fail("Nu am putut verifica plata. Te rugam contacteaza magazinul.");
  }

  /*
   * ═══ SESIUNEA TREBUIE SA FIE CHIAR A ACESTEI COMENZI ═══
   *
   * Regula era mai slaba aici decat in `/api/klarna/callback`, si tocmai pe calea
   * PRINCIPALA: `if (order.klarna_session_id && sidPrimit && ...)` se sarea cu
   * totul in DOUA cazuri — cand `sid` lipsea din URL, si cand comanda tinta nu
   * pornise niciodata o sesiune Klarna. Adica exact cand nu stiam a cui e plata,
   * nu mai intrebam.
   *
   * Dar stransul simplu al conditiei ar fi legat toate platile Klarna de
   * substitutia lui `{{session_id}}` in URL-ul de SUCCES (`start/route.ts:118`),
   * care e alt camp decat `status_update` si NU e dovedita pe trafic real —
   * integrarea are zero comenzi. Daca substitutia n-ar merge, FIECARE plata s-ar
   * termina cu „sesiune invalida", cu banii autorizati la Klarna.
   *
   * Asa ca legatura nu se mai ia din URL deloc cand URL-ul nu se potriveste:
   * tokenul din adresa se accepta NUMAI cu `sid` egal cu sesiunea stocata; altfel
   * se citeste de la Klarna, pe sesiunea STOCATA de noi — aceeasi cale ca in
   * callback. Strict si fara dependenta de substitutie.
   */
  const sidPrimit = sp.get("sid");
  const sesiuneStocata = order.klarna_session_id as string | null;
  if (!sesiuneStocata) {
    /*
     * Se logheaza DOAR cand cineva chiar incearca sa finalizeze (are token), si ca
     * `warning`, nu `critical`.
     *
     * Ruta e publica: orice comanda ramburs deschisa cu `?orderId=...` ar fi
     * produs altfel o alarma critica la fiecare acces, pentru o stare perfect
     * normala — comanda pur si simplu n-a pornit niciodata Klarna.
     */
    if (authToken) {
      await logError({
        action: "klarna/return",
        message: "s-a primit o autorizare Klarna pentru o comanda fara sesiune stocata; finalizarea a fost refuzata",
        details: { orderId, sid: sidPrimit },
        businessId,
        severity: "warning",
      });
    }
    return fail("Sesiune de plata invalida");
  }
  if (sidPrimit && sidPrimit !== sesiuneStocata) {
    console.error("[klarna/return] sid nu apartine comenzii", { orderId, sid: sidPrimit });
    return fail("Sesiune de plata invalida");
  }

  let token = sidPrimit === sesiuneStocata ? authToken : null;
  if (!token) {
    const hpp = await getHppSession(cfg!, sesiuneStocata);
    if (!hpp.ok) {
      return fail("Nu am putut verifica plata. Te rugam contacteaza magazinul.");
    }
    if (hpp.data?.status !== "COMPLETED" || !hpp.data?.authorization_token) {
      return fail("Autorizarea Klarna lipseste. Te rugam reincearca.");
    }
    token = hpp.data.authorization_token;
  }

  const input = toKlarnaOrderInput(order, settings?.prices_include_vat ?? true);
  const result = await finalizeKlarnaOrder(admin, cfg!, input, token, successUrl.toString());

  // "pending" = Klarna is reviewing the purchase; the order is placed. Both paid
  // and pending land on the confirmation page.
  if (result.status === "paid" || result.status === "pending") {
    return NextResponse.redirect(successUrl);
  }
  return fail(result.error);
}
