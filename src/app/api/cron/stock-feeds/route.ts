import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dueSources } from "@/lib/import/stock-feed/sources";
import { resumeStalledStockJobs, runSource } from "@/lib/import/stock-feed/runner";
import { logError } from "@/lib/error-logger";

/**
 * Citeste feedurile de stoc de la adresele salvate de comercianti.
 *
 * Ruleaza din ora in ora. Sursele zilnice isi aleg singure ora, cele orare merg
 * la fiecare tura.
 *
 * Doua treburi, in ordinea asta:
 *   1. Termina joburile de stoc ramase in aer. Cronul de importuri de produse nu
 *      le atinge (filtreaza pe o lista permisa de surse), deci daca cineva a
 *      inchis pagina la mijlocul unei incarcari manuale, aici se incheie.
 *   2. Porneste sursele care au ajuns la rand.
 *
 * Tot ce se face aici e limitat de un TERMEN. Functia are un minut; ce nu incape
 * rimane pentru tura urmatoare, iar randurile ramase sunt tot in baza, cu status
 * `pending`.
 */

export const maxDuration = 60;

/** Ne oprim cu cateva secunde inainte de limita, sa apucam sa raspundem. */
const BUDGET_MS = 50 * 1000;
const MAX_SOURCES = 5;
const STALE_MS = 2 * 60 * 1000;

function verifyCron(req: NextRequest): boolean {
  return req.headers.get("authorization")?.replace("Bearer ", "") === process.env.CRON_SECRET;
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deadline = Date.now() + BUDGET_MS;
  const admin = createAdminClient();

  let resumed = 0;
  try {
    resumed = await resumeStalledStockJobs(admin, deadline, STALE_MS);
  } catch (e) {
    logError({
      action: "cron.stock-feeds.resume",
      message: e instanceof Error ? e.message : "resume failed",
    });
  }

  let started = 0;
  let failed = 0;

  try {
    const sources = await dueSources(admin, new Date(), MAX_SOURCES);

    for (const source of sources) {
      if (Date.now() >= deadline) break;
      try {
        const res = await runSource(admin, source, deadline);
        started++;
        if (!res.ok) failed++;
      } catch (e) {
        failed++;
        /* O sursa care arunca nu are voie sa opreasca restul turei. */
        logError({
          action: "cron.stock-feeds.source",
          message: e instanceof Error ? e.message : "source failed",
          businessId: source.business_id,
          details: { sourceId: source.id },
        });
      }
    }
  } catch (e) {
    logError({
      action: "cron.stock-feeds",
      message: e instanceof Error ? e.message : "cron failed",
    });
  }

  return NextResponse.json({ ok: true, resumed, started, failed });
}
