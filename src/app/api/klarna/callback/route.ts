import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getHppSession, klarnaReady, toKlarnaOrderInput, type KlarnaConfig } from "@/lib/klarna";
import { finalizeKlarnaOrder } from "@/lib/klarna-finalize";
import { citireCazuta } from "@/lib/supabase/citire";
import { logError } from "@/lib/error-logger";

/**
 * Klarna HPP `status_update` callback (server-to-server). Fires when the hosted
 * session changes status, covering customers who complete the payment but never
 * return to the success URL (closed tab). We read the HPP session for the
 * authoritative status + authorization token and finalize idempotently.
 *
 * ⚠ Raspunde 200 pe „nu ne priveste", dar 503 pe „n-am putut afla". Un 2xx dat
 * pe un incident de baza sau pe un 5xx de la Klarna e o pierdere DEFINITIVA:
 * evenimentul nu se mai repeta. Ruta e publica si nesemnata, deci poarta de 5xx
 * trebuie sa se inchida numai pe esec real de infrastructura, nu pe date lipsa.
 */
async function handle(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const orderId = sp.get("orderId");
  const businessId = sp.get("businessId");
  const sid = sp.get("sid");
  const ok = () => NextResponse.json({ received: true });

  if (!orderId || !businessId || !sid) return ok();

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const reia = async (ce: string, mesaj: string) => {
    await logError({
      action: "klarna/callback",
      message: `${ce}: ${mesaj}`,
      details: { orderId, sid },
      businessId,
      severity: "critical",
    });
    return NextResponse.json({ received: false, error: "citire esuata" }, { status: 503 });
  };

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
   * Poarta sta AICI, inainte de verificarea de autorizare de mai jos: un `order`
   * null venit dintr-o citire picata ar trece prin ramura gresita si ar iesi 200.
   *
   * `business` intra in aceeasi poarta desi pare inofensiv — din el se face
   * `confirmationUrl`, iar un slug gol inseamna URL malformat trimis la Klarna
   * DUPA ce banii s-au miscat.
   */
  if (citireCazuta(eOrder, order) || citireCazuta(eSettings, settings) || citireCazuta(eBusiness, business)) {
    const e = [eOrder, eSettings, eBusiness].find((x) => x && x.code !== "PGRST116");
    return await reia("citire picata inainte de finalizare", e?.message ?? "motiv necunoscut");
  }

  // Nothing to do: unknown order, already paid, or Klarna not configured.
  if (!order || order.payment_status === "paid") return ok();

  /*
   * ⚠ REGULA E INVERSATA: LIPSA sesiunii stocate OPRESTE finalizarea.
   *
   * Era `if (order.klarna_session_id && ...)` — adica verificarea se facea DOAR
   * daca exista o sesiune stocata. Iar `/api/klarna/start` scria `klarna_session_id`
   * fara sa verifice rezultatul: la o scriere picata campul ramanea NULL, si atunci
   * verificarea se SAREA cu totul. Adica exact cazul in care nu stim a cui e
   * sesiunea era cazul in care nu mai intrebam.
   *
   * Acum: fara sesiune stocata nu se finalizeaza nimic. Comanda ramane neplatita
   * si se rezolva prin retur sau de mana — nepotrivirea unei plati e mai ieftina
   * decat confirmarea uneia straine.
   */
  if (!order.klarna_session_id || order.klarna_session_id !== sid) {
    console.error("[klarna/callback] sesiune lipsa sau straina comenzii", { orderId, sid, stocat: order.klarna_session_id });
    return ok();
  }
  const cfg = settings?.klarna_config as KlarnaConfig | null;
  if (!klarnaReady(cfg)) return ok();

  const hpp = await getHppSession(cfg!, sid);
  /*
   * ⚠ „Klarna n-a raspuns" NU e „sesiunea nu e completa".
   *
   * Cele doua stateau in aceeasi conditie, deci un 5xx sau un timeout de la
   * Klarna — furnizorul, nu noi — iesea 200 si evenimentul nu mai venea
   * niciodata. E un caz mult mai probabil decat o cadere de baza, si singurul
   * din care nu ne mai putem intoarce.
   */
  if (!hpp.ok) {
    /*
     * Numai o cadere REALA cere reincercarea: 5xx sau retea (`status: 0`). Un 4xx
     * e un raspuns — sesiune inexistenta, cheie gresita — si reincercarea lui ar
     * insemna acelasi 4xx la nesfarsit.
     */
    if (hpp.status === 0 || hpp.status >= 500) {
      return await reia("sesiunea HPP nu s-a putut citi de la Klarna", hpp.error || "motiv necunoscut");
    }
    await logError({
      action: "klarna/callback",
      message: `Klarna a refuzat citirea sesiunii HPP (${hpp.status}): ${hpp.error ?? "motiv necunoscut"}`,
      details: { orderId, sid },
      businessId,
      severity: "warning",
    });
    return ok();
  }
  if (hpp.data?.status !== "COMPLETED" || !hpp.data?.authorization_token) return ok();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const slug = business?.slug ?? "";
  const confirmationUrl = `${baseUrl}/${slug}/confirm?orderId=${order.id}`;
  const input = toKlarnaOrderInput(order, settings?.prices_include_vat ?? true);

  // Ca la Revolut: un esec de baza NU se confirma cu 200, ca sa poata fi reincercat.
  const r = await finalizeKlarnaOrder(admin, cfg!, input, hpp.data.authorization_token, confirmationUrl);
  if (r.status === "failed") {
    return NextResponse.json({ received: false, error: r.error ?? "eroare interna" }, { status: 503 });
  }
  return ok();
}

export async function GET(request: NextRequest) { return handle(request); }
export async function POST(request: NextRequest) { return handle(request); }
