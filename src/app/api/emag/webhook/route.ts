import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { emagGloballyEnabled } from "@/lib/emag/auth";
import { ipuriPermise, CHEIE_IPURI } from "@/lib/emag/ipuri";
import { loadEmagContext } from "@/lib/emag/sync";
import { aduComenzile, ingereazaComanda } from "@/lib/emag/orders";
import { cuFir, firNou } from "@/lib/emag/jurnal";
import { citesteComenzi, isEmagError } from "@/lib/emag/client";
import type { EmagComanda, EmagConfig } from "@/lib/emag/types";

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
 * Lista albă a apelanților, din TREI surse.
 *
 * ═══ ⚠ NICIUNA NU O POATE GOLI PE CEALALTĂ ═══
 *
 *   cele din documentația lor v4.5.1     — scrise în `ipuri.ts`, nu se șterg niciodată
 *   cele aduse de la `/public-ips.json`  — împrospătate de cron, o dată pe oră
 *   `EMAG_WEBHOOK_IPS`                   — reparație fără o livrare de cod
 *
 * Ei spun că lista se schimbă și cer să fie urmărită. Dar o aducere căzută, sau un
 * fișier cu altă formă, NU are voie să lase integrarea fără nicio adresă permisă: asta
 * ar refuza toate notificările, adică ar face chiar răul de care ne apărăm. De aceea
 * cele trei se ADUNĂ, nu se înlocuiesc.
 */
async function ipuriDePermis(
  admin: ReturnType<typeof createClient<Database>>,
): Promise<string[]> {
  const { data } = await admin.from("platform_settings")
    .select("value").eq("key", CHEIE_IPURI).maybeSingle();
  const aduse = ((data?.value as { ipuri?: string[] } | null)?.ipuri) ?? null;
  return ipuriPermise(aduse, process.env.EMAG_WEBHOOK_IPS);
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

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const permise = await ipuriDePermis(admin);
  const ip = ipulApelantului(req);
  if (!ip || !permise.includes(ip)) {
    /*
     * ⚠ SE SCRIE, nu se trece cu vederea. Un refuz aici poate însemna două lucruri
     * foarte diferite: cineva bate la ușă degeaba, sau eMAG a schimbat lista și
     * notificările s-au oprit. Al doilea nu se vede altfel: totul continuă să
     * funcționeze, doar mai încet.
     */
    await logError({
      action: "emag/webhook",
      message: `notificare refuzată: IP necunoscut ${ip ?? "(lipsă)"}`,
      details: { businessId, permise },
      severity: "warning",
    });
    return NextResponse.json({ error: "Interzis" }, { status: 403 });
  }

  const ctx = await loadEmagContext(admin, businessId);
  if (!ctx) {
    /* Magazin deconectat sau configurare necitibilă. ⚠ Se răspunde 200: un 5xx i-ar
       face să reîncerce la nesfârșit o notificare pe care n-avem cum s-o procesăm. */
    return NextResponse.json({ ok: true, ignorat: "magazin neconectat" });
  }

  /*
   * ⚠ URMA SE LASĂ ÎNAINTE DE ORICE LUCRU, ȘI DINADINS.
   *
   * Panoul arată „ultimul semnal de la eMAG" ca să se poată răspunde la întrebarea
   * „notificările chiar funcționează?". Scrisă abia după procesare, o notificare care
   * cade la mijloc n-ar fi lăsat nicio urmă — iar comerciantul ar fi crezut că eMAG nu
   * sună deloc, când de fapt sună și noi ne împiedicăm.
   *
   * ⚠ Nu se folosește `patchConfig`: e o scriere de câmp, nu de cursor, iar aici nu
   * suntem în cron. Citire plus scriere, o dată pe notificare.
   */
  await noteazaSemnalul(admin, businessId);

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
  /*
   * ⚠ UN FIR PE NOTIFICARE (§66).
   *
   * O notificare poate declansa mai multe cereri catre ei. Cu firul, „ce s-a
   * intamplat cand ne-a sunat pentru comanda 12345" are un raspuns dintr-o singura
   * cautare — iar fara el, cererile notificarii ar fi fost amestecate cu cele ale
   * cronului, care ruleaza in acelasi minut si citeste aceleasi comenzi.
   */
  const fir = firNou("notificare");

  try {
    if (orderId != null) {
      const r = await cuFir(fir, () => citesteComenzi(ctx.auth, { id: orderId }));
      if (isEmagError(r)) {
        return NextResponse.json({ ok: true, amanat: r.error });
      }
      const comenzi = (Array.isArray(r.data) ? r.data : []) as EmagComanda[];
      for (const c of comenzi) await cuFir(fir, () => ingereazaComanda(admin, ctx, c));
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
    const rez = await cuFir(fir, () =>
      aduComenzile(admin, ctx, new Date(Date.now() - 15 * 60 * 1000)));
    return NextResponse.json({ ok: true, noi: rez.noi, actualizate: rez.actualizate });
  } catch (e) {
    await logError({
      action: "emag/webhook",
      message: e instanceof Error ? e.message : "notificarea nu a putut fi procesată",
      details: { businessId, orderId, fir },
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

/**
 * Scrie când a sunat ultima dată eMAG.
 *
 * ⚠ Nereușita nu oprește nimic: e o urmă pentru ecran, nu o parte din procesare. O
 * notificare pierdută fiindcă n-am putut scrie o dată ar fi fost un preț absurd.
 */
async function noteazaSemnalul(
  admin: ReturnType<typeof createClient<Database>>,
  businessId: string,
): Promise<void> {
  try {
    const { data } = await admin.from("store_settings")
      .select("emag_config").eq("business_id", businessId).maybeSingle();
    const config = ((data?.emag_config as EmagConfig) ?? {}) || {};
    await admin.from("store_settings")
      .update({ emag_config: { ...config, ultimul_webhook: new Date().toISOString() } as never })
      .eq("business_id", businessId);
  } catch {
    /* Urma nu merită să coste o notificare. */
  }
}
