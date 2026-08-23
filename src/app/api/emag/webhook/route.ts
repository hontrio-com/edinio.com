import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { emagGloballyEnabled } from "@/lib/emag/auth";
import { loadEmagContext } from "@/lib/emag/sync";
import { aduComenzile, ingereazaComanda } from "@/lib/emag/orders";
import { citesteComenzi, isEmagError } from "@/lib/emag/client";
import type { EmagComanda } from "@/lib/emag/types";

/**
 * Notificările eMAG.
 *
 * ═══ ⚠ NU SE ÎNREGISTREAZĂ PRIN API. SE CERE DE LA EI ═══
 *
 * Căutat în tot OpenAPI-ul lor: nu există nicio rută care să primească un URL de
 * callback. Documentația spune doar că notificările EXISTĂ — „Receive notifications
 * via callback URLs (new orders, cancellations, new returns & status changes, AWB
 * status, approved documentation)" — dar adresa se pune din partea lor, la cerere.
 *
 * Deci ruta asta e gata și așteaptă. Cât timp nimeni n-o cheamă, comenzile intră
 * oricum prin cron, la un minut. Notificarea doar le grăbește.
 *
 * ⚠ E scris aici, nu într-un bilet: cine caută peste un an de ce nu vin notificări
 * trebuie să afle că nu e nimic de reparat în cod, ci de cerut de la eMAG.
 *
 * ═══ ⚠ CINE ARE VOIE SĂ SUNE ═══
 *
 * Documentația lor dă lista, și o numește autoritară: „Sellers integrating with the
 * eMAG & FD Marketplace API must allow the following source IPs on any callback /
 * webhook endpoint they expose."
 *
 * Fără verificarea asta, ruta ar fi fost o cale prin care oricine de pe internet
 * declanșează citiri către eMAG în numele unui magazin — adică un mod ieftin de a-i
 * arde cele 3 cereri pe secundă și de a-i opri sincronizarea, fără să fi intrat
 * nicăieri.
 *
 * ⚠ LISTA SE POATE SCHIMBA, și ei o spun: „please update your firewall rules whenever
 * this section changes". De aceea un refuz pe IP se SCRIE în jurnal, tare: ziua în
 * care adaugă un IP nou, notificările se opresc tăcut, iar singurul semn ar fi că
 * ordinele încep să vină „mai încet" — adică prin cron, ca înainte. Cu logul, se vede
 * în aceeași zi.
 */

/**
 * IP-urile de la care sună eMAG, după documentația lor v4.5.1.
 *
 * ⚠ Se poate lărgi din mediu cu `EMAG_WEBHOOK_IPS` (separate prin virgulă), ca lista
 * să se poată repara fără o livrare de cod — ei publică și un `/public-ips.json` pe
 * care îl pot schimba oricând.
 */
const IP_EMAG: readonly string[] = ["43.131.5.30", "91.206.37.14", "46.174.144.128"];

function ipuriPermise(): string[] {
  const dinMediu = (process.env.EMAG_WEBHOOK_IPS ?? "")
    .split(",").map((x) => x.trim()).filter(Boolean);
  return [...IP_EMAG, ...dinMediu];
}

/**
 * IP-ul care a sunat.
 *
 * ⚠ Se ia PRIMUL din `x-forwarded-for`, nu ultimul. Lanțul e „client, proxy1,
 * proxy2"; luat ultimul, oricine ar fi putut pune un IP eMAG în capul listei și ar fi
 * trecut. Pe Vercel antetul e pus de marginea lor și nu poate fi falsificat de client.
 */
function ipulApelantului(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip")?.trim() || null;
}

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!emagGloballyEnabled()) {
    return NextResponse.json({ ok: true, oprit: true });
  }

  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId lipsește" }, { status: 400 });
  }

  const ip = ipulApelantului(req);
  if (!ip || !ipuriPermise().includes(ip)) {
    /*
     * ⚠ SE SCRIE, nu se trece cu vederea. Un refuz aici poate însemna două lucruri
     * foarte diferite: cineva bate la ușă degeaba, sau eMAG a schimbat lista și
     * notificările s-au oprit. Al doilea nu se vede altfel: totul continuă să
     * funcționeze, doar mai încet.
     */
    await logError({
      action: "emag/webhook",
      message: `notificare refuzată: IP necunoscut ${ip ?? "(lipsă)"}`,
      details: { businessId, permise: ipuriPermise() },
      severity: "warning",
    });
    return NextResponse.json({ error: "Interzis" }, { status: 403 });
  }

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const ctx = await loadEmagContext(admin, businessId);
  if (!ctx) {
    /* Magazin deconectat sau configurare necitibilă. ⚠ Se răspunde 200: un 5xx i-ar
       face să reîncerce la nesfârșit o notificare pe care n-avem cum s-o procesăm. */
    return NextResponse.json({ ok: true, ignorat: "magazin neconectat" });
  }

  let corp: unknown = null;
  try { corp = await req.json(); } catch { corp = null; }

  const orderId = idComenzii(corp);

  /*
   * ═══ ⚠ CONȚINUTUL NOTIFICĂRII NU SE IA DE BUN ═══
   *
   * Notificarea spune CE s-a schimbat, nu CUM arată acum. Scrisă direct din ea, o
   * comandă ar fi intrat cu datele dintr-un mesaj a cărui formă nu e documentată
   * nicăieri în OpenAPI — și pe care nimeni n-o poate verifica.
   *
   * Deci notificarea e doar un semnal: „uită-te acum". Adevărul se citește tot de la
   * `order/read`, exact ca la cron.
   */
  try {
    if (orderId != null) {
      const r = await citesteComenzi(ctx.auth, { id: orderId });
      if (isEmagError(r)) {
        return NextResponse.json({ ok: true, amanat: r.error });
      }
      const comenzi = (Array.isArray(r.data) ? r.data : []) as EmagComanda[];
      for (const c of comenzi) await ingereazaComanda(admin, ctx, c);
      return NextResponse.json({ ok: true, citite: comenzi.length });
    }

    /*
     * Notificare fără id de comandă (retur, AWB, documentație aprobată). Se ia o
     * fereastră scurtă de comenzi, iar restul îl prinde cronul.
     *
     * ⚠ Marcajul NU se atinge de aici. Notificările vin oricând și în orice ordine;
     * mutat de ele, cursorul cronului ar fi sărit peste comenzi pe care nu le-a citit
     * nimeni. Aici se citește în plus, niciodată în locul lui.
     */
    const rez = await aduComenzile(admin, ctx, new Date(Date.now() - 15 * 60 * 1000));
    return NextResponse.json({ ok: true, noi: rez.noi, actualizate: rez.actualizate });
  } catch (e) {
    await logError({
      action: "emag/webhook",
      message: e instanceof Error ? e.message : "notificarea nu a putut fi procesată",
      details: { businessId, orderId },
      businessId,
      severity: "error",
    });
    /* ⚠ 200, nu 500. Cronul duce oricum treaba la capăt peste cel mult un minut, iar
       un 5xx i-ar pune pe ei să reîncerce în buclă pentru nimic. */
    return NextResponse.json({ ok: true, esuat: true });
  }
}

/**
 * Id-ul comenzii dintr-o notificare a cărei formă nu e documentată.
 *
 * ⚠ Se caută APARAT, printre denumirile plauzibile, și se întoarce `null` când nu se
 * recunoaște nimic. Un id ghicit greșit ar fi cerut de la eMAG comanda altcuiva —
 * sau, mai rău, ar fi trecut drept „nicio comandă" și ar fi ascuns notificarea.
 */
function idComenzii(corp: unknown): number | null {
  if (!corp || typeof corp !== "object") return null;
  const o = corp as Record<string, unknown>;
  for (const cheie of ["order_id", "orderId", "id", "emag_order_id"]) {
    const v = o[cheie];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  }
  /* Unele forme împachetează în `data`. */
  if (o.data && typeof o.data === "object") return idComenzii(o.data);
  return null;
}

/**
 * eMAG verifică uneori adresa cu un `GET` înainte de a trimite notificări.
 *
 * ⚠ Răspunde fără să facă nimic și fără să ceară IP-ul: e doar o dovadă că adresa
 * există. Pusă sub aceeași verificare ca `POST`, o probă făcută din browserul unui om
 * ar fi arătat „Interzis" și l-ar fi trimis să caute o problemă care nu există.
 */
export function GET() {
  return NextResponse.json({ ok: true, serviciu: "emag-webhook" });
}
