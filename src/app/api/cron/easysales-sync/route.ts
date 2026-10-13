import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { alegeInRotatie, magazineConectate } from "@/lib/marketplace/rotatie";
import { scrieDacaNeschimbat, stergeDacaNeschimbat } from "@/lib/marketplace/coada-cas";
import { ZILE_PASTRARE } from "@/lib/easysales/constante";
import { incarcaContextul } from "@/lib/easysales/context";
import { COADA, asteptareaDupaPauze, prelucreazaElementul, type ElementCoada } from "@/lib/easysales/coada";
import { prelucreazaInboxul } from "@/lib/easysales/inbox";
import { bandaDeLista, plasaPeComanda } from "@/lib/easysales/oglinda";
import { verificareZilnica } from "@/lib/easysales/sanatate";
import type { EasySalesConfig } from "@/lib/easysales/tipuri";

/**
 * Cronul easySales, la minut (planul, §7.5).
 *
 *   1. coada (`easysales_sync_queue`), revendicata cu `revendica_din_coada` si scrisa cu CAS;
 *   2. inboxul webhook-urilor ramas neprelucrat dupa `after`;
 *   3. pe magazin, prin rotatie: plasa legaturilor (10 min), banda de comenzi (5 min), plasa pe
 *      comanda (o ora), sanatatea (o zi);
 *   4. curatenia jurnalului si a inboxului (30 de zile), o data pe ora.
 *
 * ⚠ BUGETUL DE TIMP SE VERIFICA INAINTE DE FIECARE PAS, nu dupa: pasii taiati sunt mereu ultimii,
 * iar cronul porneste din nou peste un minut (lectia OLX, 02.09.2026).
 */
export const maxDuration = 60;

const LOT_COADA = 30;
const BUGET_COADA_MS = 30_000;
const BUGET_TOTAL_MS = 52_000;
const MAGAZINE_PE_TURA = 5;

const LA_10_MIN = 10 * 60_000;
const LA_5_MIN = 5 * 60_000;
const LA_ORA = 60 * 60_000;
const LA_ZI = 24 * 60 * 60_000;

function aTrecut(iso: string | null | undefined, ms: number): boolean {
  const t = iso ? Date.parse(iso) : NaN;
  return !Number.isFinite(t) || Date.now() - t >= ms;
}

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  /* ⚠ Fara oprire pe `EASYSALES_LIVE`: comutatorul stinge conectarile noi, nu magazinele conectate
     (comenzile lor sunt deja stampilate; vezi `constante.ts`). */

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const inceput = Date.now();
  const ramasa = (buget: number) => Date.now() - inceput < buget;
  const rezultat = { coada: { gata: 0, amanate: 0, abandonate: 0 }, inbox: 0, magazine: 0, erori: [] as string[] };

  /* ── 1. coada ── */
  const { data: revendicate, error: eCoada } = await admin.rpc("revendica_din_coada", { p_coada: COADA, p_limita: LOT_COADA });
  if (eCoada) {
    await logError({ action: "easysales-sync", severity: "critical", message: `coada nu s-a putut revendica: ${eCoada.message}` });
    rezultat.erori.push("coada");
  } else {
    const pe = new Map<string, ElementCoada[]>();
    for (const el of (revendicate ?? []) as unknown as ElementCoada[]) {
      if (!pe.has(el.business_id)) pe.set(el.business_id, []);
      pe.get(el.business_id)!.push(el);
    }
    for (const [businessId, elemente] of pe) {
      const c = await incarcaContextul(admin, businessId, "cron");
      if (c.fel !== "gata") {
        for (const el of elemente) {
          /* Deconectat: lucrarile n-au unde pleca (comenzile netrimise au trecut la Edinio la deconectare).
             O citire picata NU e o deconectare: se amana. */
          if (c.fel === "deconectat") await stergeDacaNeschimbat(admin, COADA, el);
          else await scrieDacaNeschimbat(admin, COADA, el, { pauze: el.pauze + 1, ultima_eroare: c.mesaj.slice(0, 500), next_retry_at: new Date(Date.now() + asteptareaDupaPauze(el.pauze)).toISOString() });
        }
        continue;
      }
      for (const el of elemente) {
        if (!ramasa(BUGET_COADA_MS)) {
          /* Neatins: inchirierea expira singura, iar elementul se ia la trecerea urmatoare. */
          break;
        }
        const s = await prelucreazaElementul(admin, c.ctx, el);
        if (s === "gata") rezultat.coada.gata++;
        else if (s === "amanat") rezultat.coada.amanate++;
        else rezultat.coada.abandonate++;
      }
    }
  }

  /* ── 2. inboxul ── */
  if (ramasa(BUGET_TOTAL_MS)) {
    try { rezultat.inbox = await prelucreazaInboxul(admin, { limita: 50 }); }
    catch (e) { rezultat.erori.push("inbox"); await logError({ action: "easysales-sync", severity: "warning", message: `inboxul: ${(e as Error).message}` }); }
  }

  /* ── 3. pe magazin, prin rotatie ── */
  const { ids, error: eMagazine } = await magazineConectate(admin, "easysales_config");
  if (eMagazine) rezultat.erori.push("magazine");
  for (const businessId of alegeInRotatie(ids, MAGAZINE_PE_TURA)) {
    if (!ramasa(BUGET_TOTAL_MS)) break;
    const c = await incarcaContextul(admin, businessId, "cron");
    if (c.fel !== "gata") continue;
    const ctx = c.ctx;
    const cfg = ctx.cfg;
    const marcaje: Partial<EasySalesConfig> = {};
    rezultat.magazine++;
    try {
      if (aTrecut(cfg.plasa_legaturi_la, LA_10_MIN)) {
        const { error } = await admin.rpc("easysales_plasa_legaturilor", { p_business: businessId, p_limita: 50 });
        if (!error) marcaje.plasa_legaturi_la = new Date().toISOString();
      }
      const poateCitiLaEi = !cfg.pauza && !cfg.needs_reconnect;
      if (poateCitiLaEi && ramasa(BUGET_TOTAL_MS) && aTrecut(cfg.banda_la, LA_5_MIN)) {
        await bandaDeLista(admin, ctx, { runStartMs: Date.now(), maxPagini: 3, bugetMs: 12_000 });
        marcaje.banda_la = new Date().toISOString();
      }
      if (ramasa(BUGET_TOTAL_MS) && aTrecut(cfg.plasa_comenzi_la, LA_ORA)) {
        await plasaPeComanda(admin, businessId);
        marcaje.plasa_comenzi_la = new Date().toISOString();
      }
      if (poateCitiLaEi && ramasa(BUGET_TOTAL_MS) && aTrecut(cfg.sanatate_la, LA_ZI)) {
        const { data: biz } = await admin.from("businesses").select("cui").eq("id", businessId).maybeSingle();
        await verificareZilnica(admin, ctx, (biz as { cui?: string | null } | null)?.cui ?? null);
      }
    } catch (e) {
      rezultat.erori.push(`magazin:${businessId}`);
      await logError({ action: "easysales-sync", severity: "warning", businessId, message: `trecerea pe magazin: ${(e as Error).message}` });
    }
    if (Object.keys(marcaje).length) await ctx.dep.peticConfig(businessId, marcaje);
  }

  /* ── 4. curatenia, o data pe ora (minutul 7) ── */
  if (new Date().getUTCMinutes() === 7 && ramasa(BUGET_TOTAL_MS)) {
    const prag = new Date(Date.now() - ZILE_PASTRARE * LA_ZI).toISOString();
    await admin.from("easysales_request_log").delete().lt("created_at", prag);
    await admin.from("easysales_webhook_inbox").delete().lt("primit_la", prag).not("prelucrat_la", "is", null);
  }

  return NextResponse.json({ ok: rezultat.erori.length === 0, ...rezultat, durata_ms: Date.now() - inceput });
}
