import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { stareaPlatiiNetopia, type NetopiaConfig } from "@/lib/netopia";
import { aplicaStatusulNetopia } from "@/lib/netopia-aplica-statusul";
import type { Database } from "@/types/database.types";

/**
 * ⚠⚠ PLATA DESPRE CARE NU NE-A SPUS NIMENI.
 *
 * ═══ CE REPARA ═══
 *
 * Pana pe 16.09, Netopia era singurul procesator FARA nicio plasa: daca notificarea lor nu ajungea
 * (retea, o desfasurare la mijloc, un 500 de-al nostru care nu se mai repeta), plata ramanea
 * neinregistrata pentru totdeauna si nimic n-o mai gasea. Masurat inainte: doua comenzi EXPEDIATE
 * si neplatite, cu id de tranzactie Netopia, la `suporti-numar`.
 *
 * Scrisesem chiar eu, in `docs/plati/NETOPIA.md`, ca nu se poate face nimic, fiindca in specificatia
 * lor `/operation/status` poarta descrierea „will be available at a future date". ⚠ E FALS: chemat,
 * raspunde. Vezi nota din `stareaPlatiiNetopia`.
 *
 * ═══ CUM ═══
 *
 * Se iau comenzile care au un `netopia_ntp_id` (deci plata CHIAR a fost pornita prin noi) si care nu
 * sunt platite, si se intreaba. Ce raspund ei trece prin EXACT aceeasi regula ca o notificare:
 * `aplicaStatusulNetopia`. Nicio a doua copie, nicio a doua purtare.
 *
 * ⚠ RASTIMPUL DE ASTEPTARE NU E O SUBTILITATE. Nu se intreaba despre o plata pornita acum cateva
 * minute: cumparatorul poate fi chiar atunci pe pagina bancii, iar `1` si `15` (starile lor de
 * asteptare) ar umple jurnalul. Se incepe de la o ora.
 *
 * ⚠ SI NU SE UITA LA NESFARSIT IN URMA. O plata veche de saptamani nu se mai lamureste singura, iar
 * comerciantul a fost deja anuntat de `plati-neconfirmate`. Fereastra tine loc de memorie, ca acolo.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cat de proaspata e prea proaspata: sub atat, cumparatorul poate fi inca la banca. */
const ORE_MINIME = 1;
/** Cat de departe in urma se uita. `?zile=` largeste pentru o trecere peste istoric. */
const ZILE_IMPLICIT = 14;
const MAX_COMENZI = 200;

export async function GET(req: NextRequest) {
  /*
   * ⚠ `verificaCron` intoarce `boolean`, nu un raspuns. Scris `const refuz = verificaCron(req);
   * if (refuz) return refuz;`, cronul ar rula DOAR pentru cine NU e autorizat. Vezi
   * `poarta-cronului-e-in-sensul-bun.test.ts`.
   */
  if (!verificaCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const zile = Math.min(Math.max(Number(req.nextUrl.searchParams.get("zile")) || ZILE_IMPLICIT, 1), 365);
  const pana = new Date(Date.now() - ORE_MINIME * 3600_000).toISOString();
  const de = new Date(Date.now() - zile * 24 * 3600_000).toISOString();

  const { data: comenzi, error: eComenzi } = await admin
    .from("orders")
    .select("id, business_id, status, payment_status, total, order_number, netopia_ntp_id")
    .eq("payment_method", "netopia")
    .not("netopia_ntp_id", "is", null)
    /* ⚠ Nu se re-intreaba despre o plata incheiata: nici platita, nici rambursata. */
    .not("payment_status", "in", "(paid,refunded)")
    .gte("created_at", de)
    .lte("created_at", pana)
    .order("created_at", { ascending: true })
    .limit(MAX_COMENZI);

  if (eComenzi) {
    await logError({
      action: "netopia/reconciliere", message: eComenzi.message,
      details: { code: eComenzi.code }, severity: "critical",
    });
    return NextResponse.json({ error: "Nu s-au putut citi comenzile" }, { status: 500 });
  }

  const randuri = comenzi ?? [];
  if (randuri.length === 0) {
    return NextResponse.json({ ok: true, verificate: 0, lamurite: 0 });
  }

  /*
   * Configurarile se citesc O SINGURA DATA pe magazin, nu o data pe comanda.
   *
   * ⚠ CU ROL DE SERVICIU, SI ABIA ASA SUNT CITIBILE. Din 05.08.2026, vederea `store_settings` nu
   * mai decripteaza pentru `anon`/`authenticated`: pe clientul unui utilizator, `api_key` ar veni
   * chiar ca `enc.v1.…` si ar pleca asa la Netopia, cu „credentiale invalide" ca raspuns si nimic
   * in mesaj despre cauza. Un cron n-are oricum niciun utilizator.
   */
  const magazine = [...new Set(randuri.map((c) => c.business_id))];
  const { data: setari } = await admin
    .from("store_settings").select("business_id, netopia_config").in("business_id", magazine);

  const config = new Map<string, { apiKey: string; pos: string; sandbox: boolean }>();
  for (const s of setari ?? []) {
    const cfg = s.netopia_config as NetopiaConfig | null;
    if (!cfg?.enabled || !cfg.api_key || !cfg.pos_signature) continue;
    config.set(s.business_id, {
      apiKey: cfg.api_key,
      pos: cfg.pos_signature,
      sandbox: cfg.sandbox === true,
    });
  }

  let lamurite = 0;
  let nelamurite = 0;
  const socoteala: Record<string, number> = {};

  for (const c of randuri) {
    const cfg = config.get(c.business_id);
    /* Magazinul a scos Netopia dupa ce plata fusese pornita. Nu e o defectiune: nu avem pe ce
       intreba, si nici n-ar fi cinstit sa folosim credentiale sterse. */
    if (!cfg) continue;

    let spuse: Awaited<ReturnType<typeof stareaPlatiiNetopia>>;
    try {
      spuse = await stareaPlatiiNetopia(
        { ntpID: String(c.netopia_ntp_id), posSignature: cfg.pos, orderId: c.id },
        cfg.apiKey,
        cfg.sandbox,
      );
    } catch (err) {
      /*
       * ⚠ O INTEROGARE PICATA NU E O VESTE DESPRE PLATA. Se trece mai departe si se reia la
       * urmatoarea rulare. Nu se scrie alarma pentru fiecare: un capat cazut ar fi umplut jurnalul
       * comerciantului cu sute de randuri despre aceeasi pana.
       */
      nelamurite++;
      console.error("[netopia/reconciliere] interogare picata:", {
        orderId: c.id, err: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (spuse.status === null) { nelamurite++; continue; }

    const verdict = await aplicaStatusulNetopia(
      admin,
      c,
      {
        status: spuse.status,
        ntpID: String(c.netopia_ntp_id),
        incasat: spuse.incasat ?? Number(c.total),
        codLor: spuse.codLor,
        mesajLor: spuse.mesajLor,
      },
      "reconciliere",
    );

    socoteala[verdict.fel] = (socoteala[verdict.fel] ?? 0) + 1;
    if (verdict.fel === "esec") { nelamurite++; continue; }
    if (verdict.fel !== "platita" && verdict.fel !== "rambursata") continue;

    lamurite++;
    /*
     * ⚠⚠ O PLATA GASITA ASA E O VESTE, NU O RUTINA. Inseamna ca notificarea LOR nu a ajuns, iar
     * comerciantul a avut o comanda aratand „neplatita" cu banii deja incasati. Se scrie, ca sa se
     * poata masura cat de des se intampla.
     */
    await logError({
      action: "netopia/reconciliere",
      message:
        `Comanda ${c.order_number ?? c.id} era neplatita la noi, dar Netopia o are ca ${verdict.fel} `
        + `(status ${spuse.status}). Am lamurit-o intrebandu-i: notificarea lor nu ajunsese.`,
      details: { orderId: c.id, ntpID: c.netopia_ntp_id, status: spuse.status, codLor: spuse.codLor },
      businessId: c.business_id,
      severity: "warning",
    });
  }

  return NextResponse.json({
    ok: true,
    verificate: randuri.length,
    lamurite,
    nelamurite,
    socoteala,
  });
}
